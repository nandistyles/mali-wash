import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings } from '../lib/db';
import { useStaff } from '../lib/auth';
import { searchCustomers, findOrCreateCustomer } from '../lib/customers';
import { previewSale, commitSale, voidTransaction, type CartItem, type SalePreview, type CommitSaleResult } from '../lib/sales';
import { notifyLocalWrite } from '../lib/sync';
import { normalisePhone, formatPhone, isValidPhone } from '../lib/phone';
import { receiptText, printReceipt } from '../lib/receipt';
import { openWhatsApp, referralShareText } from '../lib/whatsapp';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { formatCurrency } from '../lib/utils';
import {
  Search, UserPlus, Check, X, Minus, Plus as PlusIcon, Trash2, Printer,
  MessageCircle, TriangleAlert, Loader2, CheckCircle2, Star, Clock, Car
} from 'lucide-react';
import type { Customer, PaymentMethod, WashService } from '../types';

export default function POS() {
  const staff = useStaff();

  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash_usd');
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [preview, setPreview] = useState<SalePreview | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [lastSale, setLastSale] = useState<CommitSaleResult | null>(null);

  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', reg: '', makeModel: '', referredByCode: '' });
  const [newCustomerError, setNewCustomerError] = useState('');
  const [duplicateOf, setDuplicateOf] = useState<Customer | null>(null);

  const settings = useLiveQuery(() => getSettings());
  const shifts = useLiveQuery(() => db.shifts.where('status').equals('open').toArray(), []);
  const activeShift = shifts?.[0];

  // The live customer record, so a points change from a sync shows immediately.
  const selectedCustomer = useLiveQuery(
    () => (selectedCustomerId ? db.customers.get(selectedCustomerId) : Promise.resolve(undefined)),
    [selectedCustomerId]
  ) ?? null;

  /*
   * Search no longer auto-attaches. The old version silently bound the sale to
   * the first phone-prefix match as the attendant typed, so a mistyped digit
   * could put someone else's wash on a stranger's account. Results are now
   * offered and the attendant chooses.
   */
  useEffect(() => {
    let cancelled = false;
    if (searchTerm.trim().length < 2) {
      setResults([]);
      return;
    }
    void searchCustomers(searchTerm, 6).then(found => {
      if (!cancelled) setResults(found);
    });
    return () => { cancelled = true; };
  }, [searchTerm]);

  // Re-price whenever anything that affects the bill changes.
  useEffect(() => {
    let cancelled = false;
    if (cart.length === 0) {
      setPreview(null);
      return;
    }
    void previewSale({ cart, customer: selectedCustomer, requestedRedeemPoints: redeemPoints })
      .then(p => { if (!cancelled) setPreview(p); });
    return () => { cancelled = true; };
  }, [cart, selectedCustomer, redeemPoints]);

  // Dropping the customer must drop their redemption too.
  useEffect(() => {
    if (!selectedCustomer) setRedeemPoints(0);
  }, [selectedCustomer]);

  const addToCart = (service: WashService) => {
    setCart(prev => {
      const existing = prev.find(i => i.service.id === service.id);
      if (existing) return prev.map(i => i.service.id === service.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { service, qty: 1 }];
    });
  };

  const updateQty = (serviceId: string, delta: number) => {
    setCart(prev => prev
      .map(i => i.service.id === serviceId ? { ...i, qty: i.qty + delta } : i)
      .filter(i => i.qty > 0));
  };

  const resetSale = () => {
    setCart([]);
    setSearchTerm('');
    setResults([]);
    setSelectedCustomerId(null);
    setRedeemPoints(0);
    setPaymentMethod('cash_usd');
    setPreview(null);
    setError('');
    setLastSale(null);
  };

  const handleProcess = async () => {
    setError('');
    if (!activeShift) {
      setError('No shift is open. Open the till before taking money.');
      return;
    }
    setProcessing(true);
    try {
      const result = await commitSale({
        cart,
        customer: selectedCustomer,
        anonymousPhone: normalisePhone(searchTerm),
        staffId: staff.id,
        shiftId: activeShift.id,
        paymentMethod,
        redeemPoints
      });
      // The sale is safe in Dexie at this point; syncing is best-effort.
      void notifyLocalWrite();
      setLastSale(result);
    } catch (err: any) {
      setError(err?.message || 'Could not complete the sale.');
    } finally {
      setProcessing(false);
    }
  };

  // Warn before creating a second record for a number we already know.
  useEffect(() => {
    let cancelled = false;
    const normalised = normalisePhone(newCustomer.phone);
    if (!normalised) { setDuplicateOf(null); return; }
    void db.customers.where('phone').equals(normalised).first().then(found => {
      if (!cancelled) setDuplicateOf(found ?? null);
    });
    return () => { cancelled = true; };
  }, [newCustomer.phone]);

  const handleCreateCustomer = async (e: FormEvent) => {
    e.preventDefault();
    setNewCustomerError('');

    if (!isValidPhone(newCustomer.phone)) {
      setNewCustomerError('Enter a valid Zimbabwean number, e.g. 0771234567.');
      return;
    }

    try {
      const { customer, created } = await findOrCreateCustomer({
        name: newCustomer.name,
        phone: newCustomer.phone,
        vehicles: (newCustomer.reg || newCustomer.makeModel)
          ? [{ reg: newCustomer.reg.toUpperCase(), makeModel: newCustomer.makeModel }]
          : [],
        referredByCode: newCustomer.referredByCode || null
      });
      void notifyLocalWrite();
      setSelectedCustomerId(customer.id);
      setSearchTerm('');
      setResults([]);
      setShowNewCustomer(false);
      setNewCustomer({ name: '', phone: '', reg: '', makeModel: '', referredByCode: '' });
      if (!created) setError('That number already existed — attached the existing customer instead.');
    } catch (err: any) {
      setNewCustomerError(err?.message || 'Could not save the customer.');
    }
  };

  const maxRedeem = preview?.maxRedeemablePoints ?? 0;
  const canProcess = cart.length > 0 && !!activeShift && !processing;

  const paymentOptions = useMemo(() => ([
    { id: 'cash_usd' as PaymentMethod, label: 'CASH' },
    { id: 'ecocash' as PaymentMethod, label: 'ECOCASH' },
    { id: 'card' as PaymentMethod, label: 'CARD' },
  ]), []);

  if (!settings) return <div className="p-8 text-center text-slate-500">Loading settings…</div>;

  return (
    <div className="flex flex-col lg:flex-row h-full w-full bg-slate-100 overflow-hidden">
      <div className="flex-1 flex flex-col p-6 overflow-y-auto">

        {/* A sale with no open shift cannot be reconciled, so it is blocked
            rather than silently attributed to a placeholder shift. */}
        {!activeShift && (
          <div className="mb-6 p-4 bg-amber-50 border-2 border-amber-300 rounded-xl flex items-center gap-3">
            <Clock className="w-6 h-6 text-amber-600 shrink-0" />
            <div className="flex-1">
              <p className="font-bold text-amber-900">No shift is open</p>
              <p className="text-sm text-amber-800">Open the till so this money can be reconciled at close.</p>
            </div>
            <Link to="/shifts">
              <Button className="bg-amber-600 hover:bg-amber-700">Open Shift</Button>
            </Link>
          </div>
        )}

        <div className="mb-2 flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              type="search"
              placeholder="Search phone, name, or vehicle reg…"
              className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-slate-200 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/20 text-lg shadow-sm outline-none transition-all font-medium"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <button
            className="px-6 py-3 bg-[#004D4D] hover:bg-teal-900 text-white font-bold rounded-lg shadow-md flex items-center justify-center gap-2 transition-colors shrink-0"
            onClick={() => {
              setNewCustomer({ ...newCustomer, phone: searchTerm });
              setShowNewCustomer(true);
            }}
          >
            <UserPlus className="w-5 h-5" />
            NEW CUSTOMER
          </button>
        </div>

        {results.length > 0 && (
          <div className="mb-6 bg-white rounded-xl border-2 border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
            {results.map(c => (
              <button
                key={c.id}
                onClick={() => { setSelectedCustomerId(c.id); setSearchTerm(''); setResults([]); }}
                className="w-full text-left px-4 py-3 hover:bg-teal-50 flex items-center justify-between gap-3 transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-bold text-slate-800 truncate">{c.name}</p>
                  <p className="text-sm text-slate-500">{formatPhone(c.phone)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-teal-700 font-bold text-sm">{c.pointsBalance} pts</p>
                  {c.vehicles?.[0] && (
                    <p className="text-xs text-slate-400 truncate max-w-[140px]">
                      {c.vehicles[0].reg || c.vehicles[0].makeModel}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-4">Select Services</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {settings.services.map(service => {
              const covered = preview?.lines.find(l => l.service.id === service.id && l.coveredQty > 0);
              return (
                <button
                  key={service.id}
                  onClick={() => addToCart(service)}
                  className="bg-white p-4 rounded-xl shadow-sm border-2 border-slate-100 hover:border-teal-500 hover:shadow-md transition-all text-left flex flex-col h-32 active:scale-95 relative"
                >
                  {covered && (
                    <span className="absolute top-2 right-2 bg-teal-100 text-teal-800 text-[9px] font-black px-1.5 py-0.5 rounded uppercase">
                      Covered
                    </span>
                  )}
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">{service.type.replace('_', ' ')}</span>
                  <span className="font-bold text-slate-800 text-lg leading-tight mb-auto">{service.name}</span>
                  <span className="text-teal-700 font-black text-xl">{formatCurrency(service.price)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Checkout */}
      <aside className="w-full lg:w-[420px] bg-white border-l border-slate-200 flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.02)] z-10 shrink-0">
        <div className={`p-5 border-b-2 ${!selectedCustomer ? 'bg-slate-50 border-slate-200' : 'bg-teal-50 border-teal-200'}`}>
          {!selectedCustomer ? (
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-slate-400">
                <Search className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-700">Anonymous Walk-in</h3>
                <p className="text-slate-500 text-sm">No points, no history</p>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-full bg-teal-600 flex items-center justify-center text-white font-bold text-lg shadow-inner shrink-0">
                    {selectedCustomer.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-teal-900 leading-tight truncate">{selectedCustomer.name}</h3>
                    <p className="text-teal-700 text-xs">{formatPhone(selectedCustomer.phone)}</p>
                    <div className="flex gap-2 items-center mt-1 flex-wrap">
                      <span className="text-teal-800 text-sm font-bold">{selectedCustomer.pointsBalance} pts</span>
                      {preview?.membershipLabel && (
                        <span className="bg-teal-200 text-teal-900 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                          {preview.membershipLabel}
                          {preview.washesRemaining !== null && ` · ${preview.washesRemaining} left`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCustomerId(null)}
                  className="p-1.5 text-teal-600 hover:text-teal-900 hover:bg-teal-100 rounded shrink-0"
                  title="Detach customer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {selectedCustomer.vehicles?.length > 0 && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-teal-800">
                  <Car className="w-3.5 h-3.5" />
                  {selectedCustomer.vehicles.map(v => [v.reg, v.makeModel].filter(Boolean).join(' · ')).join('  |  ')}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-5 pt-4 pb-2">
            <h2 className="text-sm font-black text-slate-500 uppercase tracking-widest flex justify-between items-center">
              <span>Cart</span>
              {cart.length > 0 && (
                <button onClick={() => setCart([])} className="text-red-400 hover:text-red-600 flex items-center gap-1 text-xs">
                  <Trash2 className="w-3 h-3" /> Clear
                </button>
              )}
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto px-5 space-y-3 pb-4">
            {cart.length === 0 ? (
              <div className="text-slate-400 italic text-sm py-8 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200">
                Cart is empty.<br />Select services to add.
              </div>
            ) : (
              cart.map(item => {
                const line = preview?.lines.find(l => l.service.id === item.service.id);
                return (
                  <div key={item.service.id} className="flex flex-col gap-2 p-3 bg-slate-50 border border-slate-100 rounded-lg">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 leading-tight">{item.service.name}</p>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">{item.service.type}</p>
                      </div>
                      <div className="text-right shrink-0">
                        {line && line.coveredQty > 0 && line.chargedTotal < line.fullTotal && (
                          <span className="line-through text-slate-400 text-xs block">{formatCurrency(line.fullTotal)}</span>
                        )}
                        <span className="font-bold">{formatCurrency(line?.chargedTotal ?? item.service.price * item.qty)}</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2 bg-white rounded-md border border-slate-200">
                        <button onClick={() => updateQty(item.service.id, -1)} className="p-1.5 text-slate-500 hover:text-slate-800">
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="text-sm font-bold w-4 text-center">{item.qty}</span>
                        <button onClick={() => updateQty(item.service.id, 1)} className="p-1.5 text-slate-500 hover:text-slate-800">
                          <PlusIcon className="w-4 h-4" />
                        </button>
                      </div>
                      {line && line.coveredQty > 0 && (
                        <div className="flex items-center gap-1 bg-teal-100 text-teal-800 px-2 py-1 rounded text-xs font-bold">
                          <Check className="w-3 h-3" />
                          {line.coveredQty} covered
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="p-5 bg-slate-50 border-t border-slate-200 mt-auto">
            {/* Points redemption — the balance was displayed but never spendable. */}
            {selectedCustomer && preview && maxRedeem > 0 && (
              <div className="mb-4 p-3 bg-white rounded-lg border-2 border-teal-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-teal-800 flex items-center gap-1">
                    <Star className="w-3.5 h-3.5" /> Redeem points
                  </span>
                  <span className="text-xs text-slate-500">max {maxRedeem}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={maxRedeem}
                  step={1}
                  value={Math.min(redeemPoints, maxRedeem)}
                  onChange={e => setRedeemPoints(Number(e.target.value))}
                  className="w-full accent-teal-600"
                />
                <div className="flex justify-between items-center mt-1 text-sm">
                  <span className="font-bold text-teal-700">{preview.pointsRedeemed} pts</span>
                  <span className="font-bold text-teal-700">-{formatCurrency(preview.pointsDiscountUsd)}</span>
                </div>
              </div>
            )}
            {selectedCustomer && preview?.redeemBlockedReason && (
              <p className="mb-3 text-xs text-slate-500 text-center">{preview.redeemBlockedReason}</p>
            )}

            <div className="space-y-2 mb-4">
              <div className="flex justify-between items-center text-slate-500 text-sm font-medium">
                <span>Subtotal</span>
                <span>{formatCurrency(preview?.subtotal ?? 0)}</span>
              </div>
              {(preview?.membershipDiscount ?? 0) > 0 && (
                <div className="flex justify-between items-center text-teal-600 text-sm font-bold">
                  <span>Membership</span>
                  <span>-{formatCurrency(preview!.membershipDiscount)}</span>
                </div>
              )}
              {(preview?.pointsDiscountUsd ?? 0) > 0 && (
                <div className="flex justify-between items-center text-teal-600 text-sm font-bold">
                  <span>AutoPoints</span>
                  <span>-{formatCurrency(preview!.pointsDiscountUsd)}</span>
                </div>
              )}
              <div className="flex justify-between items-center text-2xl font-black pt-2 border-t border-slate-200">
                <span>TOTAL</span>
                <span className={(preview?.total ?? 0) === 0 && cart.length > 0 ? 'text-teal-600' : ''}>
                  {formatCurrency(preview?.total ?? 0)}
                </span>
              </div>
              {selectedCustomer && (preview?.pointsEarned ?? 0) > 0 && (
                <p className="text-xs text-teal-700 font-semibold text-right">
                  Earns {preview!.pointsEarned} AutoPoints
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4">
              {paymentOptions.map(method => {
                const isActive = paymentMethod === method.id;
                return (
                  <button
                    key={method.id}
                    onClick={() => setPaymentMethod(method.id)}
                    className={`flex flex-col items-center justify-center py-3 rounded-xl border-2 font-bold text-[10px] sm:text-xs gap-1 transition-colors ${
                      isActive
                        ? 'bg-teal-50 border-teal-500 text-teal-700'
                        : 'bg-white border-slate-200 hover:border-slate-300 text-slate-600'
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-teal-500' : 'bg-slate-400'}`}></div>
                    {method.label}
                  </button>
                );
              })}
            </div>

            {error && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 flex items-start gap-2">
                <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              disabled={!canProcess}
              onClick={handleProcess}
              className="w-full py-4 bg-[#004D4D] disabled:opacity-40 text-white font-black text-lg rounded-xl shadow-lg shadow-teal-900/20 active:scale-95 transition-transform flex items-center justify-center gap-2"
            >
              {processing ? <><Loader2 className="w-5 h-5 animate-spin" /> PROCESSING…</> : 'COMPLETE SALE'}
            </button>
          </div>
        </div>
      </aside>

      {/* Success — replaces the alert() that blocked the till and told the
          attendant nothing about points, receipts, or what to do next. */}
      {lastSale && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md shadow-2xl">
            <CardContent className="p-6 text-center">
              <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-9 h-9 text-teal-600" />
              </div>
              <h2 className="text-2xl font-black text-slate-900">Sale complete</h2>
              <p className="text-4xl font-black text-teal-700 my-3">{formatCurrency(lastSale.transaction.amount)}</p>

              <div className="text-sm text-slate-600 space-y-1 mb-5">
                {lastSale.transaction.pointsEarned > 0 && (
                  <p className="font-semibold text-teal-700">+{lastSale.transaction.pointsEarned} AutoPoints earned</p>
                )}
                {lastSale.transaction.pointsRedeemed > 0 && (
                  <p>{lastSale.transaction.pointsRedeemed} points redeemed</p>
                )}
                {lastSale.membershipGranted && <p className="font-semibold text-teal-700">Membership activated</p>}
                {lastSale.referralPaid && <p className="font-semibold text-teal-700">Referral reward paid to the referrer</p>}
              </div>

              <div className="grid grid-cols-2 gap-2 mb-2">
                <Button
                  variant="outline"
                  className="h-12 flex items-center gap-2"
                  onClick={() => printReceipt(lastSale.transaction, selectedCustomer)}
                >
                  <Printer className="w-4 h-4" /> Print
                </Button>
                <Button
                  variant="outline"
                  className="h-12 flex items-center gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                  disabled={!lastSale.transaction.customerPhone}
                  onClick={() => {
                    const phone = lastSale.transaction.customerPhone;
                    if (phone) openWhatsApp(phone, receiptText(lastSale.transaction, selectedCustomer));
                  }}
                >
                  <MessageCircle className="w-4 h-4" /> WhatsApp
                </Button>
              </div>

              {selectedCustomer && (
                <Button
                  variant="outline"
                  className="w-full h-11 mb-4 flex items-center gap-2 border-teal-300 text-teal-700 hover:bg-teal-50"
                  onClick={() => openWhatsApp(
                    selectedCustomer.phone,
                    referralShareText(selectedCustomer.name, selectedCustomer.referralCode, settings.referralRewardPoints)
                  )}
                >
                  <Star className="w-4 h-4" /> Send referral code
                </Button>
              )}

              <Button onClick={resetSale} className="w-full h-14 text-lg font-black">
                Next Sale
              </Button>

              <button
                onClick={async () => {
                  await voidTransaction(lastSale.transaction.id, `Voided at till by ${staff.name}`);
                  void notifyLocalWrite();
                  resetSale();
                }}
                className="mt-3 text-xs text-red-500 hover:text-red-700 underline"
              >
                Void this sale
              </button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* New customer */}
      {showNewCustomer && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md shadow-2xl">
            <CardHeader className="flex flex-row justify-between items-center border-b pb-4">
              <CardTitle>New Customer</CardTitle>
              <button onClick={() => setShowNewCustomer(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleCreateCustomer} className="space-y-4">
                {newCustomerError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">{newCustomerError}</div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number *</label>
                  <Input
                    required
                    value={newCustomer.phone}
                    onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                    placeholder="0771234567"
                  />
                  {newCustomer.phone && !isValidPhone(newCustomer.phone) && (
                    <p className="text-xs text-amber-600 mt-1">Not a valid Zimbabwean number yet.</p>
                  )}
                  {duplicateOf && (
                    <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs">
                      <p className="text-amber-900 font-semibold">{duplicateOf.name} already uses this number.</p>
                      <button
                        type="button"
                        className="text-teal-700 underline font-bold"
                        onClick={() => {
                          setSelectedCustomerId(duplicateOf.id);
                          setShowNewCustomer(false);
                          setSearchTerm('');
                        }}
                      >
                        Attach them instead
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
                  <Input required value={newCustomer.name} onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Vehicle Reg</label>
                    <Input
                      value={newCustomer.reg}
                      onChange={e => setNewCustomer({ ...newCustomer, reg: e.target.value.toUpperCase() })}
                      placeholder="ABC 1234"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Make & Model</label>
                    <Input value={newCustomer.makeModel} onChange={e => setNewCustomer({ ...newCustomer, makeModel: e.target.value })} />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Referred By (Code)</label>
                  <Input
                    placeholder="e.g. MALI-X4F2K"
                    value={newCustomer.referredByCode}
                    onChange={e => setNewCustomer({ ...newCustomer, referredByCode: e.target.value.toUpperCase() })}
                  />
                </div>

                <div className="pt-2 flex gap-3">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setShowNewCustomer(false)}>Cancel</Button>
                  <Button type="submit" className="flex-1" disabled={!!duplicateOf}>Save Customer</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
