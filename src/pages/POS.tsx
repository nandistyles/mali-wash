import { useState, useEffect, useMemo, useRef, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const bookingId = searchParams.get('booking');
  const loadedBookingId = useRef<string | null>(null);

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

  // Turn a confirmed booking into a ready-to-charge sale: attach (or create)
  // the customer and pre-load the service they chose online.
  useEffect(() => {
    if (!bookingId || !settings || loadedBookingId.current === bookingId) return;
    loadedBookingId.current = bookingId;
    let cancelled = false;

    void db.bookings.get(bookingId).then(async booking => {
      if (!booking || booking.status !== 'confirmed') {
        if (!cancelled) setError('This booking is no longer available for check-in.');
        return;
      }
      const service = settings.services.find(item => item.id === booking.serviceType && item.type === 'wash');
      if (!service) {
        if (!cancelled) setError('The booked service is no longer available. Choose a replacement service.');
        return;
      }
      const { customer } = await findOrCreateCustomer({
        name: booking.name,
        phone: booking.phone,
        vehicles: booking.vehicle ? [{ reg: '', makeModel: booking.vehicle }] : []
      });
      if (cancelled) return;
      setSelectedCustomerId(customer.id);
      setSearchTerm('');
      setCart([{ service, qty: 1 }]);
      void notifyLocalWrite();
    }).catch((err: any) => {
      if (!cancelled) {
        loadedBookingId.current = null;
        setError(err?.message || 'Could not load this booking.');
      }
    });

    return () => { cancelled = true; };
  }, [bookingId, settings]);

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
    if (bookingId) {
      loadedBookingId.current = null;
      setSearchParams({}, { replace: true });
    }
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
      if (bookingId) {
        // A booking-status write must never make a completed sale look failed,
        // or the attendant may charge the customer twice.
        void db.bookings.update(bookingId, { status: 'done', syncStatus: 'pending_sync' })
          .then(() => notifyLocalWrite())
          .catch(err => console.warn('Sale completed, but booking status was not updated:', err));
      }
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

  if (!settings) return <div className="p-8 text-center text-ink-500">Loading settings…</div>;

  return (
    <div className="flex flex-col lg:flex-row h-full w-full bg-background overflow-hidden">
      <div className="flex-1 flex flex-col p-6 overflow-y-auto">

        {/* A sale with no open shift cannot be reconciled, so it is blocked
            rather than silently attributed to a placeholder shift. */}
        {!activeShift && (
          <div className="mb-5 p-4 bg-accent-50 border border-accent-200 rounded-xl flex items-center gap-4 shadow-sm animate-in-up">
            <div className="w-11 h-11 rounded-xl bg-accent-100 grid place-items-center shrink-0">
              <Clock className="w-5 h-5 text-accent-700" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-accent-900 leading-tight">No shift is open</p>
              <p className="text-sm text-accent-800/80 mt-0.5">Open the till so this money can be reconciled at close.</p>
            </div>
            <Link to="/shifts" className="shrink-0">
              <Button variant="accent">Open Shift</Button>
            </Link>
          </div>
        )}

        <div className="mb-3 flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-400 w-5 h-5 pointer-events-none" />
            <input
              type="search"
              placeholder="Search phone, name, or vehicle reg…"
              className="w-full h-14 pl-12 pr-4 rounded-xl border-2 border-ink-200 bg-card text-lg font-medium text-ink-900 placeholder:text-ink-400 shadow-sm outline-none transition-[border-color,box-shadow] duration-150 hover:border-ink-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/12"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <Button
            size="lg"
            variant="primary"
            className="shrink-0"
            onClick={() => {
              setNewCustomer({ ...newCustomer, phone: searchTerm });
              setShowNewCustomer(true);
            }}
          >
            <UserPlus className="w-5 h-5" />
            <span className="hidden sm:inline">New Customer</span>
          </Button>
        </div>

        {results.length > 0 && (
          <div className="mb-5 surface shadow-lg divide-y divide-border overflow-hidden animate-in-up">
            {results.map(c => (
              <button
                key={c.id}
                onClick={() => { setSelectedCustomerId(c.id); setSearchTerm(''); setResults([]); }}
                className="w-full text-left px-4 py-3 hover:bg-brand-50 active:bg-brand-100 flex items-center gap-3 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-800 grid place-items-center font-bold shrink-0">
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink-900 truncate">{c.name}</p>
                  <p className="text-sm text-ink-500 tabular">{formatPhone(c.phone)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-brand-700 font-bold text-sm tabular">{c.pointsBalance} pts</p>
                  {c.vehicles?.[0] && (
                    <p className="text-xs text-ink-400 truncate max-w-[140px]">
                      {c.vehicles[0].reg || c.vehicles[0].makeModel}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        <div>
          <h2 className="label-caps mb-3">Select Services</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {settings.services.map(service => {
              const covered = preview?.lines.find(l => l.service.id === service.id && l.coveredQty > 0);
              const inCart = cart.find(i => i.service.id === service.id);
              return (
                <button
                  key={service.id}
                  onClick={() => addToCart(service)}
                  className={`pressable group surface p-4 text-left flex flex-col h-36 relative overflow-hidden hover:shadow-md ${
                    inCart ? 'border-brand-400 ring-2 ring-brand-500/15' : 'hover:border-brand-300'
                  }`}
                >
                  {/* Quantity badge doubles as the confirmation that a tap landed. */}
                  {inCart && (
                    <span className="absolute top-0 right-0 bg-brand-600 text-white text-xs font-black w-7 h-7 grid place-items-center rounded-bl-xl tabular">
                      {inCart.qty}
                    </span>
                  )}
                  {covered && (
                    <span className="absolute bottom-3 right-3 bg-brand-100 text-brand-800 text-[9px] font-black px-1.5 py-1 rounded uppercase tracking-wide">
                      Covered
                    </span>
                  )}

                  <span className="label-caps text-ink-400 mb-1.5">{service.type.replace('_', ' ')}</span>
                  <span className="font-bold text-ink-900 text-[17px] leading-snug mb-auto pr-6">{service.name}</span>
                  <span className="text-brand-700 font-black text-2xl tracking-tight tabular">
                    {formatCurrency(service.price)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Checkout */}
      <aside className="w-full lg:w-[420px] bg-card border-l border-border flex flex-col shadow-[-8px_0_28px_rgba(13,18,18,0.04)] z-10 shrink-0">
        <div className={`p-5 border-b transition-colors ${!selectedCustomer ? 'bg-ink-50 border-border' : 'bg-brand-50 border-brand-200'}`}>
          {!selectedCustomer ? (
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-ink-200/70 flex items-center justify-center text-ink-400">
                <Search className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-ink-700 leading-tight">Anonymous Walk-in</h3>
                <p className="text-ink-500 text-sm mt-0.5">No points, no history</p>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-full bg-brand-600 flex items-center justify-center text-white font-bold text-lg shadow-inner shrink-0">
                    {selectedCustomer.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-brand-900 leading-tight truncate">{selectedCustomer.name}</h3>
                    <p className="text-brand-700 text-xs">{formatPhone(selectedCustomer.phone)}</p>
                    <div className="flex gap-2 items-center mt-1 flex-wrap">
                      <span className="text-brand-800 text-sm font-bold">{selectedCustomer.pointsBalance} pts</span>
                      {preview?.membershipLabel && (
                        <span className="bg-brand-200 text-brand-900 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                          {preview.membershipLabel}
                          {preview.washesRemaining !== null && ` · ${preview.washesRemaining} left`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCustomerId(null)}
                  className="p-1.5 text-brand-600 hover:text-brand-900 hover:bg-brand-100 rounded shrink-0"
                  title="Detach customer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {selectedCustomer.vehicles?.length > 0 && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-brand-800">
                  <Car className="w-3.5 h-3.5" />
                  {selectedCustomer.vehicles.map(v => [v.reg, v.makeModel].filter(Boolean).join(' · ')).join('  |  ')}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-5 pt-4 pb-2">
            <h2 className="text-sm font-black text-ink-500 uppercase tracking-widest flex justify-between items-center">
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
              <div className="text-ink-400 italic text-sm py-8 text-center bg-ink-50 rounded-lg border border-dashed border-ink-200">
                Cart is empty.<br />Select services to add.
              </div>
            ) : (
              cart.map(item => {
                const line = preview?.lines.find(l => l.service.id === item.service.id);
                return (
                  <div key={item.service.id} className="flex flex-col gap-2 p-3 bg-ink-50 border border-ink-100 rounded-lg">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-ink-800 leading-tight">{item.service.name}</p>
                        <p className="text-[10px] text-ink-500 uppercase tracking-wider font-semibold">{item.service.type}</p>
                      </div>
                      <div className="text-right shrink-0">
                        {line && line.coveredQty > 0 && line.chargedTotal < line.fullTotal && (
                          <span className="line-through text-ink-400 text-xs block">{formatCurrency(line.fullTotal)}</span>
                        )}
                        <span className="font-bold">{formatCurrency(line?.chargedTotal ?? item.service.price * item.qty)}</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2 bg-white rounded-md border border-ink-200">
                        <button onClick={() => updateQty(item.service.id, -1)} className="p-1.5 text-ink-500 hover:text-ink-800">
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="text-sm font-bold w-4 text-center">{item.qty}</span>
                        <button onClick={() => updateQty(item.service.id, 1)} className="p-1.5 text-ink-500 hover:text-ink-800">
                          <PlusIcon className="w-4 h-4" />
                        </button>
                      </div>
                      {line && line.coveredQty > 0 && (
                        <div className="flex items-center gap-1 bg-brand-100 text-brand-800 px-2 py-1 rounded text-xs font-bold">
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

          <div className="p-5 bg-ink-50 border-t border-ink-200 mt-auto">
            {/* Points redemption — the balance was displayed but never spendable. */}
            {selectedCustomer && preview && maxRedeem > 0 && (
              <div className="mb-4 p-3 bg-white rounded-lg border-2 border-brand-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-brand-800 flex items-center gap-1">
                    <Star className="w-3.5 h-3.5" /> Redeem points
                  </span>
                  <span className="text-xs text-ink-500">max {maxRedeem}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={maxRedeem}
                  step={1}
                  value={Math.min(redeemPoints, maxRedeem)}
                  onChange={e => setRedeemPoints(Number(e.target.value))}
                  className="w-full accent-brand-600"
                />
                <div className="flex justify-between items-center mt-1 text-sm">
                  <span className="font-bold text-brand-700">{preview.pointsRedeemed} pts</span>
                  <span className="font-bold text-brand-700">-{formatCurrency(preview.pointsDiscountUsd)}</span>
                </div>
              </div>
            )}
            {selectedCustomer && preview?.redeemBlockedReason && (
              <p className="mb-3 text-xs text-ink-500 text-center">{preview.redeemBlockedReason}</p>
            )}

            <div className="space-y-2 mb-4">
              <div className="flex justify-between items-center text-ink-500 text-sm font-medium">
                <span>Subtotal</span>
                <span>{formatCurrency(preview?.subtotal ?? 0)}</span>
              </div>
              {(preview?.membershipDiscount ?? 0) > 0 && (
                <div className="flex justify-between items-center text-brand-600 text-sm font-bold">
                  <span>Membership</span>
                  <span>-{formatCurrency(preview!.membershipDiscount)}</span>
                </div>
              )}
              {(preview?.pointsDiscountUsd ?? 0) > 0 && (
                <div className="flex justify-between items-center text-brand-600 text-sm font-bold">
                  <span>AutoPoints</span>
                  <span>-{formatCurrency(preview!.pointsDiscountUsd)}</span>
                </div>
              )}
              <div className="flex justify-between items-center text-2xl font-black pt-2 border-t border-ink-200">
                <span>TOTAL</span>
                <span className={(preview?.total ?? 0) === 0 && cart.length > 0 ? 'text-brand-600' : ''}>
                  {formatCurrency(preview?.total ?? 0)}
                </span>
              </div>
              {selectedCustomer && (preview?.pointsEarned ?? 0) > 0 && (
                <p className="text-xs text-brand-700 font-semibold text-right">
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
                        ? 'bg-brand-50 border-brand-500 text-brand-700'
                        : 'bg-white border-ink-200 hover:border-ink-300 text-ink-600'
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-brand-500' : 'bg-ink-400'}`}></div>
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
              className="w-full py-4 bg-brand-900 disabled:opacity-40 text-white font-black text-lg rounded-xl shadow-lg shadow-brand-900/20 active:scale-95 transition-transform flex items-center justify-center gap-2"
            >
              {processing ? <><Loader2 className="w-5 h-5 animate-spin" /> PROCESSING…</> : 'COMPLETE SALE'}
            </button>
          </div>
        </div>
      </aside>

      {/* Success — replaces the alert() that blocked the till and told the
          attendant nothing about points, receipts, or what to do next. */}
      {lastSale && (
        <div className="fixed inset-0 bg-ink-900/60 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md shadow-2xl">
            <CardContent className="p-6 text-center">
              <div className="w-16 h-16 rounded-full bg-brand-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-9 h-9 text-brand-600" />
              </div>
              <h2 className="text-2xl font-black text-ink-900">Sale complete</h2>
              <p className="text-4xl font-black text-brand-700 my-3">{formatCurrency(lastSale.transaction.amount)}</p>

              <div className="text-sm text-ink-600 space-y-1 mb-5">
                {lastSale.transaction.pointsEarned > 0 && (
                  <p className="font-semibold text-brand-700">+{lastSale.transaction.pointsEarned} AutoPoints earned</p>
                )}
                {lastSale.transaction.pointsRedeemed > 0 && (
                  <p>{lastSale.transaction.pointsRedeemed} points redeemed</p>
                )}
                {lastSale.membershipGranted && <p className="font-semibold text-brand-700">Membership activated</p>}
                {lastSale.referralPaid && <p className="font-semibold text-brand-700">Referral reward paid to the referrer</p>}
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
                  className="w-full h-11 mb-4 flex items-center gap-2 border-brand-300 text-brand-700 hover:bg-brand-50"
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
        <div className="fixed inset-0 bg-ink-900/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md shadow-2xl">
            <CardHeader className="flex flex-row justify-between items-center border-b pb-4">
              <CardTitle>New Customer</CardTitle>
              <button onClick={() => setShowNewCustomer(false)} className="p-2 text-ink-400 hover:text-ink-600 rounded-full hover:bg-ink-100">
                <X className="w-5 h-5" />
              </button>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleCreateCustomer} className="space-y-4">
                {newCustomerError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">{newCustomerError}</div>
                )}

                <div>
                  <label className="block text-sm font-medium text-ink-700 mb-1">Phone Number *</label>
                  <Input
                    required
                    value={newCustomer.phone}
                    onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                    placeholder="0771234567"
                  />
                  {newCustomer.phone && !isValidPhone(newCustomer.phone) && (
                    <p className="text-xs text-accent-600 mt-1">Not a valid Zimbabwean number yet.</p>
                  )}
                  {duplicateOf && (
                    <div className="mt-2 p-2 bg-accent-50 border border-accent-200 rounded text-xs">
                      <p className="text-accent-900 font-semibold">{duplicateOf.name} already uses this number.</p>
                      <button
                        type="button"
                        className="text-brand-700 underline font-bold"
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
                  <label className="block text-sm font-medium text-ink-700 mb-1">Full Name *</label>
                  <Input required value={newCustomer.name} onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-ink-700 mb-1">Vehicle Reg</label>
                    <Input
                      value={newCustomer.reg}
                      onChange={e => setNewCustomer({ ...newCustomer, reg: e.target.value.toUpperCase() })}
                      placeholder="ABC 1234"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink-700 mb-1">Make & Model</label>
                    <Input value={newCustomer.makeModel} onChange={e => setNewCustomer({ ...newCustomer, makeModel: e.target.value })} />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-ink-700 mb-1">Referred By (Code)</label>
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
