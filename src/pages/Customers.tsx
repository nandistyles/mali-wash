import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings } from '../lib/db';
import { searchCustomers, addVehicle, findOrCreateCustomer } from '../lib/customers';
import { getActiveMembership, describeMembership } from '../lib/memberships';
import { voidTransaction } from '../lib/sales';
import { notifyLocalWrite } from '../lib/sync';
import { formatPhone } from '../lib/phone';
import { formatCurrency } from '../lib/utils';
import { openWhatsApp, referralShareText } from '../lib/whatsapp';
import { useAuth } from '../lib/auth';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Search, Share2, Award, History, Star, Car, Plus, TrendingUp, Users, UserPlus, X, Wrench, RadioTower } from 'lucide-react';
import type { BusinessUnit, Customer } from '../types';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';

const DAY_MS = 24 * 60 * 60 * 1000;

export default function Customers() {
  const { isAdmin, staff } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [vehicle, setVehicle] = useState({ reg: '', makeModel: '' });
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', reg: '', makeModel: '', referredByCode: '' });

  const settings = useLiveQuery(() => getSettings());

  // Search now covers vehicle registration too — at a wash the attendant is
  // looking at the car, not at a phone number.
  useEffect(() => {
    let cancelled = false;
    void searchCustomers(searchTerm, 50).then(found => {
      if (!cancelled) setCustomers(found);
    });
    return () => { cancelled = true; };
  }, [searchTerm]);

  const selected = useLiveQuery(
    () => (selectedId ? db.customers.get(selectedId) : Promise.resolve(undefined)),
    [selectedId]
  ) ?? null;

  const transactions = useLiveQuery(
    () => selected
      ? db.transactions.where('customerId').equals(selected.id).reverse().sortBy('createdAt')
      : Promise.resolve([]),
    [selected?.id]
  );

  // The ledger, not the cached balance — this is the auditable record.
  const ledger = useLiveQuery(
    () => selected
      ? db.pointsLedger.where('customerId').equals(selected.id).reverse().sortBy('createdAt')
      : Promise.resolve([]),
    [selected?.id]
  );

  const membership = useLiveQuery(
    () => (selected ? getActiveMembership(selected.id) : Promise.resolve(null)),
    [selected?.id]
  );

  const fitmentJobs = useLiveQuery(
    () => selected ? db.fitmentJobs.where('customerId').equals(selected.id).reverse().sortBy('scheduledAt') : Promise.resolve([]),
    [selected?.id]
  );

  const trackingSubscriptions = useLiveQuery(
    () => selected ? db.trackingSubscriptions.where('customerId').equals(selected.id).toArray() : Promise.resolve([]),
    [selected?.id]
  );

  // Who this customer brought in — the flywheel, made visible.
  const referred = useLiveQuery(
    () => selected
      ? db.referralRedemptions.where('referrerId').equals(selected.id).toArray()
      : Promise.resolve([]),
    [selected?.id]
  );

  const paid = (transactions ?? []).filter(t => t.status === 'completed');
  const lifetimeSpend = paid.reduce((s, t) => s + t.amount, 0);
  const lastVisit = paid[0]?.createdAt ?? null;
  const daysSince = lastVisit ? Math.floor((Date.now() - lastVisit) / DAY_MS) : null;

  const handleAddVehicle = async () => {
    if (!selected || (!vehicle.reg && !vehicle.makeModel)) return;
    await addVehicle(selected.id, { reg: vehicle.reg.toUpperCase(), makeModel: vehicle.makeModel });
    void notifyLocalWrite();
    setVehicle({ reg: '', makeModel: '' });
    setShowAddVehicle(false);
  };

  const handleCreateCustomer = async () => {
    if (!staff) return;
    setCreating(true);
    setCreateError('');
    try {
      if (!newCustomer.name.trim()) throw new Error('Enter the customer name');
      const business = (staff.businesses[0] ?? 'wash') as BusinessUnit;
      const { customer, created } = await findOrCreateCustomer({
        name: newCustomer.name,
        phone: newCustomer.phone,
        vehicles: newCustomer.reg || newCustomer.makeModel
          ? [{ reg: newCustomer.reg.toUpperCase(), makeModel: newCustomer.makeModel }]
          : [],
        referredByCode: newCustomer.referredByCode
      }, business);
      await notifyLocalWrite();
      setSelectedId(customer.id);
      setSearchTerm(customer.phone);
      setShowCreate(false);
      setNewCustomer({ name: '', phone: '', reg: '', makeModel: '', referredByCode: '' });
      if (!created) setCreateError('That phone number already belonged to an existing customer. Their profile was opened.');
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Could not create the customer');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mali-page">
      <div className="mali-page-inner max-w-[92rem] h-full flex flex-col">
      <PageHeader eyebrow="One customer, one history" title="Customer 360" description="See every vehicle, visit, point, referral, and lifetime dollar in one shared Mali profile."
        action={<Button onClick={() => { setCreateError(''); setShowCreate(true); }}><UserPlus className="h-4 w-4" /> New customer</Button>} />
      {showCreate && (
        <Card className="mb-5 border-brand-200 shadow-lg">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div><h2 className="text-lg font-black text-ink-950">Create a shared customer</h2><p className="mt-1 text-sm text-ink-500">The phone number is checked across every Mali business.</p></div>
              <button onClick={() => setShowCreate(false)} className="grid h-10 w-10 place-items-center rounded-xl bg-ink-100 text-ink-600" aria-label="Close"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <Input placeholder="Full name" value={newCustomer.name} onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })} />
              <Input inputMode="tel" placeholder="Phone +263…" value={newCustomer.phone} onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })} />
              <Input placeholder="Vehicle reg (optional)" value={newCustomer.reg} onChange={e => setNewCustomer({ ...newCustomer, reg: e.target.value.toUpperCase() })} />
              <Input placeholder="Make & model" value={newCustomer.makeModel} onChange={e => setNewCustomer({ ...newCustomer, makeModel: e.target.value })} />
              <Input placeholder="Referral code" value={newCustomer.referredByCode} onChange={e => setNewCustomer({ ...newCustomer, referredByCode: e.target.value.toUpperCase() })} />
            </div>
            {createError && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{createError}</p>}
            <div className="mt-4 flex justify-end"><Button disabled={creating} onClick={handleCreateCustomer}>{creating ? 'Saving…' : 'Save customer'}</Button></div>
          </CardContent>
        </Card>
      )}
      <div className="flex flex-col lg:flex-row gap-5 flex-1 min-h-[36rem] overflow-hidden">
      <Card className="flex-1 flex flex-col h-full shrink-0 min-w-0">
        <div className="p-4 border-b border-ink-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 w-5 h-5" />
            <Input
              placeholder="Search name, phone, or vehicle reg…"
              className="pl-10"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {customers.length === 0 ? (
            <EmptyState compact icon={Users} title="No customers found" description="Try a different name, phone number, or vehicle registration." />
          ) : (
            <div className="divide-y divide-ink-100">
              {customers.map(customer => (
                <button
                  key={customer.id}
                  onClick={() => setSelectedId(customer.id)}
                  className={`w-full text-left p-4 hover:bg-ink-50 transition-colors flex justify-between items-center gap-3 ${
                    selectedId === customer.id ? 'bg-brand-50 border-l-4 border-brand-600' : 'border-l-4 border-transparent'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-ink-900 truncate">{customer.name}</div>
                    <div className="text-sm text-ink-500">{formatPhone(customer.phone)}</div>
                    {customer.vehicles?.[0] && (
                      <div className="text-xs text-ink-400 truncate">
                        {[customer.vehicles[0].reg, customer.vehicles[0].makeModel].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-brand-700 font-bold">{customer.pointsBalance} pts</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </Card>

      {selected ? (
        <div className="flex-1 flex flex-col gap-4 w-full lg:w-[520px] shrink-0 overflow-y-auto">
          <Card>
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-5 gap-4">
                <div className="min-w-0">
                  <h2 className="text-2xl font-bold text-ink-900 truncate">{selected.name}</h2>
                  <p className="text-lg text-ink-600">{formatPhone(selected.phone)}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-3xl font-black text-brand-700">{selected.pointsBalance}</div>
                  <div className="text-sm text-brand-900 uppercase font-bold tracking-wider">Points</div>
                </div>
              </div>

              {/* Visit cadence — the number that tells you whether the flywheel
                  is turning for this customer, and who is worth winning back. */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="bg-ink-50 p-3 rounded-lg border border-ink-200 text-center">
                  <div className="text-xl font-black text-ink-900">{paid.length}</div>
                  <div className="text-[10px] uppercase font-bold tracking-wider text-ink-500">Visits</div>
                </div>
                <div className="bg-ink-50 p-3 rounded-lg border border-ink-200 text-center">
                  <div className="text-xl font-black text-ink-900">{formatCurrency(lifetimeSpend)}</div>
                  <div className="text-[10px] uppercase font-bold tracking-wider text-ink-500">Lifetime</div>
                </div>
                <div className={`p-3 rounded-lg border text-center ${
                  daysSince !== null && daysSince > 30
                    ? 'bg-accent-50 border-accent-200'
                    : 'bg-ink-50 border-ink-200'
                }`}>
                  <div className="text-xl font-black text-ink-900">
                    {daysSince === null ? '—' : `${daysSince}d`}
                  </div>
                  <div className="text-[10px] uppercase font-bold tracking-wider text-ink-500">Since last</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-5">
                <div className="bg-ink-50 p-4 rounded-lg border border-ink-200">
                  <div className="text-sm text-ink-500 font-medium mb-1 flex items-center">
                    <Award className="w-4 h-4 mr-1" /> Membership
                  </div>
                  <div className="font-semibold text-ink-900 text-sm">
                    {describeMembership(membership ?? null)}
                  </div>
                </div>
                <div className="bg-brand-50 p-4 rounded-lg border border-brand-100 text-brand-900 flex flex-col items-center justify-center">
                  <div className="text-xs font-semibold uppercase tracking-wider mb-1">Referral Code</div>
                  <div className="text-lg font-mono font-bold">{selected.referralCode}</div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 w-full text-xs h-8"
                    onClick={() => openWhatsApp(
                      selected.phone,
                      referralShareText(selected.name, selected.referralCode, settings?.referralRewardPoints ?? 50)
                    )}
                  >
                    <Share2 className="w-3 h-3 mr-1" /> Share
                  </Button>
                </div>
              </div>

              {(referred?.length ?? 0) > 0 && (
                <div className="mb-5 p-3 bg-brand-50 border border-brand-200 rounded-lg flex items-center gap-2 text-sm text-brand-900">
                  <Users className="w-4 h-4" />
                  <span>
                    Brought in <b>{referred!.length}</b> customer{referred!.length === 1 ? '' : 's'} ·
                    earned <b>{referred!.reduce((s, r) => s + r.rewardPoints, 0)}</b> referral points
                  </span>
                </div>
              )}

              <div className="mb-5">
                <h3 className="font-semibold text-ink-900 flex items-center justify-between mb-2 text-sm">
                  <span className="flex items-center"><Car className="w-4 h-4 mr-2" /> Vehicles</span>
                  <button onClick={() => setShowAddVehicle(v => !v)} className="text-brand-600 hover:text-brand-800 flex items-center gap-1 text-xs font-bold">
                    <Plus className="w-3 h-3" /> Add
                  </button>
                </h3>
                {selected.vehicles?.length ? (
                  <div className="space-y-1">
                    {selected.vehicles.map((v, i) => (
                      <div key={i} className="text-sm px-3 py-2 bg-ink-50 rounded border border-ink-100 flex justify-between">
                        <span className="font-mono font-bold text-ink-800">{v.reg || '—'}</span>
                        <span className="text-ink-500">{v.makeModel}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-ink-400 italic">None recorded.</p>
                )}
                {showAddVehicle && (
                  <div className="mt-2 flex gap-2">
                    <Input
                      placeholder="Reg"
                      value={vehicle.reg}
                      onChange={e => setVehicle({ ...vehicle, reg: e.target.value.toUpperCase() })}
                    />
                    <Input
                      placeholder="Make & model"
                      value={vehicle.makeModel}
                      onChange={e => setVehicle({ ...vehicle, makeModel: e.target.value })}
                    />
                    <Button size="sm" onClick={handleAddVehicle}>Save</Button>
                  </div>
                )}
              </div>

              <div className="mb-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-violet-100 bg-violet-50 p-4"><div className="flex items-center gap-2 text-sm font-black text-violet-900"><Wrench className="h-4 w-4"/>Mali Drive</div><p className="mt-2 text-2xl font-black text-ink-950">{fitmentJobs?.length ?? 0}</p><p className="text-xs text-ink-500">fitment job{fitmentJobs?.length===1?'':'s'} · {(fitmentJobs??[]).filter(job=>!['completed','cancelled'].includes(job.status)).length} active</p></div>
                <div className="rounded-xl border border-sky-100 bg-sky-50 p-4"><div className="flex items-center gap-2 text-sm font-black text-sky-900"><RadioTower className="h-4 w-4"/>Mali Track</div><p className="mt-2 text-2xl font-black text-ink-950">{trackingSubscriptions?.filter(subscription=>subscription.status==='active').length ?? 0}</p><p className="text-xs text-ink-500">active subscription{trackingSubscriptions?.filter(subscription=>subscription.status==='active').length===1?'':'s'}</p></div>
              </div>

              <div className="mb-5">
                <h3 className="font-semibold text-ink-900 flex items-center mb-3 text-sm">
                  <History className="w-4 h-4 mr-2" /> Visits
                </h3>
                <div className="space-y-2">
                  {(transactions?.length ?? 0) === 0 ? (
                    <p className="text-sm text-ink-500">No visits recorded.</p>
                  ) : (
                    transactions!.slice(0, 8).map(t => (
                      <div
                        key={t.id}
                        className={`flex justify-between items-center p-3 rounded-md border text-sm ${
                          t.status === 'voided' ? 'border-red-100 bg-red-50 opacity-70' : 'border-ink-100 bg-ink-50'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-ink-900 truncate">
                            {t.lineItems[0]?.description ?? 'Sale'}
                            {t.lineItems.length > 1 && ` +${t.lineItems.length - 1}`}
                          </div>
                          <div className="text-ink-500 text-xs">
                            {new Date(t.createdAt).toLocaleDateString('en-GB')}
                            {t.status === 'voided' && <span className="text-red-600 font-bold ml-2">VOIDED</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <div className="font-semibold text-ink-900">{formatCurrency(t.amount)}</div>
                          {t.pointsEarned > 0 && <div className="text-brand-600 text-xs">+{t.pointsEarned} pts</div>}
                          {isAdmin && t.status === 'completed' && (
                            <button
                              onClick={async () => {
                                await voidTransaction(t.id, 'Voided from customer record');
                                void notifyLocalWrite();
                              }}
                              className="text-[10px] text-red-500 hover:text-red-700 underline"
                            >
                              void
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* The points ledger is the source of truth; the balance above is
                  a cached total. Showing both makes a drift visible. */}
              <div>
                <h3 className="font-semibold text-ink-900 flex items-center mb-3 text-sm">
                  <Star className="w-4 h-4 mr-2" /> AutoPoints ledger
                </h3>
                <div className="space-y-1 max-h-56 overflow-y-auto">
                  {(ledger?.length ?? 0) === 0 ? (
                    <p className="text-sm text-ink-500">No points activity.</p>
                  ) : (
                    ledger!.map(e => (
                      <div key={e.id} className="flex justify-between items-center px-3 py-2 text-xs border-b border-ink-100">
                        <div className="min-w-0">
                          <span className="text-ink-700">{e.reason}</span>
                          <span className="text-ink-400 ml-2">{new Date(e.createdAt).toLocaleDateString('en-GB')}</span>
                        </div>
                        <span className={`font-bold shrink-0 ml-2 ${e.points >= 0 ? 'text-brand-600' : 'text-ink-500'}`}>
                          {e.points >= 0 ? '+' : ''}{e.points}
                        </span>
                      </div>
                    ))
                  )}
                </div>
                {ledger && ledger.length > 0 && (() => {
                  const ledgerTotal = ledger.reduce((s, e) => s + e.points, 0);
                  if (ledgerTotal === selected.pointsBalance) return null;
                  return (
                    <div className="mt-2 p-2 bg-accent-50 border border-accent-200 rounded text-xs text-accent-900 flex items-center gap-2">
                      <TrendingUp className="w-3 h-3" />
                      Ledger totals {ledgerTotal} but the cached balance says {selected.pointsBalance}.
                    </div>
                  );
                })()}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="flex-1 hidden lg:block"><EmptyState icon={Users} title="Choose a customer" description="Select a profile to see visits, vehicles, membership, referrals, and AutoPoints." /></div>
      )}
      </div>
      </div>
    </div>
  );
}
