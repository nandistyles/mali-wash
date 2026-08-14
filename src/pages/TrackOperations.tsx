import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Banknote, CircleDollarSign, Plus, RadioTower, RefreshCw, ShieldCheck } from 'lucide-react';
import { db } from '../lib/db';
import { activateTrackingPlan, collectTrackingRenewal, saveTrackingDevice, setTrackingSubscriptionStatus } from '../lib/businessOperations';
import { notifyLocalWrite } from '../lib/sync';
import { useStaff } from '../lib/auth';
import { formatCurrency } from '../lib/utils';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import PageHeader from '../components/PageHeader';
import type { PaymentMethod, TrackingSubscription } from '../types';

export default function TrackOperations() {
  const staff = useStaff();
  const devices = useLiveQuery(() => db.trackingDevices.toArray(), []) ?? [];
  const subscriptions = useLiveQuery(() => db.trackingSubscriptions.orderBy('renewalAt').toArray(), []) ?? [];
  const customers = useLiveQuery(() => db.customers.orderBy('name').toArray(), []) ?? [];
  const [device, setDevice] = useState({ serialNumber: '', imei: '', model: '' });
  const [activation, setActivation] = useState({ customerId: '', deviceId: '', vehicleReg: '', planName: 'Standard Tracking', monthlyFee: '10', redeemPoints: '0' });
  const [payment, setPayment] = useState<PaymentMethod>('cash_usd');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const active = subscriptions.filter(subscription => subscription.status === 'active');
  const mrr = useMemo(() => active.reduce((sum, subscription) => sum + subscription.monthlyFee, 0), [active]);
  const due = subscriptions.filter(subscription => subscription.status !== 'cancelled' && subscription.renewalAt <= Date.now() + 7 * 86400000);

  async function run(key: string, operation: () => Promise<void>) {
    setBusy(key); setError('');
    try { await operation(); await notifyLocalWrite(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The operation failed'); }
    finally { setBusy(''); }
  }

  function addDevice() {
    return run('device', async () => {
      await saveTrackingDevice(device);
      setDevice({ serialNumber: '', imei: '', model: '' });
    });
  }

  function activate() {
    return run('activate', async () => {
      const customer = customers.find(row => row.id === activation.customerId);
      if (!customer) throw new Error('Choose a customer. New customers can be created in Customer 360.');
      await activateTrackingPlan({
        customer, deviceId: activation.deviceId, vehicleReg: activation.vehicleReg,
        planName: activation.planName, monthlyFee: Number(activation.monthlyFee), staffId: staff.id,
        paymentMethod: payment, redeemPoints: Number(activation.redeemPoints || 0)
      });
      setActivation({ customerId: '', deviceId: '', vehicleReg: '', planName: 'Standard Tracking', monthlyFee: '10', redeemPoints: '0' });
    });
  }

  function renew(subscription: TrackingSubscription) {
    return run(`renew-${subscription.id}`, async () => {
      await collectTrackingRenewal({ subscriptionId: subscription.id, staffId: staff.id, paymentMethod: payment });
    });
  }

  function changeStatus(subscription: TrackingSubscription, status: TrackingSubscription['status']) {
    return run(`status-${subscription.id}`, async () => { await setTrackingSubscriptionStatus(subscription.id, status); });
  }

  return <div className="mali-page"><div className="mali-page-inner max-w-[96rem]">
    <PageHeader eyebrow="Mali Track" title="Tracking subscriptions" description="Control devices, activations, renewals and payment risk from one recurring-revenue workspace." />
    {error&&<div className="mb-5 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800"><AlertTriangle className="h-5 w-5"/>{error}</div>}

    <section className="grid gap-4 sm:grid-cols-3"><div className="rounded-2xl border border-ink-200 bg-white p-5"><p className="text-xs font-bold uppercase text-ink-500">Active trackers</p><p className="mt-2 text-3xl font-black">{active.length}</p></div><div className="rounded-2xl border border-ink-200 bg-white p-5"><p className="text-xs font-bold uppercase text-ink-500">Monthly recurring revenue</p><p className="mt-2 text-3xl font-black">{formatCurrency(mrr)}</p></div><div className={`rounded-2xl border p-5 ${due.length?'border-amber-200 bg-amber-50':'border-ink-200 bg-white'}`}><p className="text-xs font-bold uppercase text-ink-500">Due within 7 days</p><p className="mt-2 text-3xl font-black">{due.length}</p></div></section>

    <section className="mt-6 grid gap-6 xl:grid-cols-[.65fr_1.35fr]">
      <div className="space-y-6">
        <div className="rounded-2xl border border-ink-200 bg-white p-6"><div className="flex items-center gap-3"><Plus className="h-5 w-5 text-sky-700"/><h2 className="font-black">Register device</h2></div><div className="mt-5 space-y-3"><Input placeholder="Serial number" value={device.serialNumber} onChange={e=>setDevice({...device,serialNumber:e.target.value.toUpperCase()})}/><Input inputMode="numeric" placeholder="IMEI" value={device.imei} onChange={e=>setDevice({...device,imei:e.target.value})}/><Input placeholder="Device model" value={device.model} onChange={e=>setDevice({...device,model:e.target.value})}/><Button className="w-full" disabled={busy==='device'} onClick={addDevice}>{busy==='device'?'Saving…':'Add to stock'}</Button></div></div>
        <div className="rounded-2xl border border-ink-200 bg-white p-6"><div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-sky-700"/><h2 className="font-black">Activate tracker</h2></div><div className="mt-5 space-y-3"><select className="h-12 w-full rounded-xl border-2 border-ink-200 px-3" value={activation.customerId} onChange={e=>{const customer=customers.find(row=>row.id===e.target.value);setActivation({...activation,customerId:e.target.value,vehicleReg:customer?.vehicles[0]?.reg??activation.vehicleReg})}}><option value="">Choose customer</option>{customers.map(customer=><option key={customer.id} value={customer.id}>{customer.name} · {customer.pointsBalance} pts</option>)}</select><select className="h-12 w-full rounded-xl border-2 border-ink-200 px-3" value={activation.deviceId} onChange={e=>setActivation({...activation,deviceId:e.target.value})}><option value="">Choose in-stock device</option>{devices.filter(row=>row.status==='in_stock').map(row=><option key={row.id} value={row.id}>{row.serialNumber} · {row.model}</option>)}</select><Input placeholder="Vehicle registration" value={activation.vehicleReg} onChange={e=>setActivation({...activation,vehicleReg:e.target.value.toUpperCase()})}/><Input placeholder="Plan name" value={activation.planName} onChange={e=>setActivation({...activation,planName:e.target.value})}/><div className="grid grid-cols-2 gap-3"><Input type="number" min="0.01" step="0.01" placeholder="Monthly fee" value={activation.monthlyFee} onChange={e=>setActivation({...activation,monthlyFee:e.target.value})}/><Input type="number" min="0" step="1" placeholder="Redeem points" value={activation.redeemPoints} onChange={e=>setActivation({...activation,redeemPoints:e.target.value})}/></div><select className="h-12 w-full rounded-xl border-2 border-ink-200 px-3" value={payment} onChange={e=>setPayment(e.target.value as PaymentMethod)}><option value="cash_usd">Cash USD</option><option value="ecocash">EcoCash</option><option value="card">Card</option></select><Button className="w-full" disabled={busy==='activate'} onClick={activate}>{busy==='activate'?'Activating…':'Activate & collect first month'}</Button></div></div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white"><div className="flex flex-col gap-3 border-b border-ink-200 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-black">Recurring book</h2><p className="mt-1 text-xs text-ink-500">Collect renewals and control service status</p></div><div className="flex items-center gap-2"><Banknote className="h-4 w-4 text-ink-400"/><select className="h-10 rounded-xl border border-ink-200 px-3 text-sm" value={payment} onChange={e=>setPayment(e.target.value as PaymentMethod)}><option value="cash_usd">Cash</option><option value="ecocash">EcoCash</option><option value="card">Card</option></select></div></div><div className="divide-y divide-ink-100">{subscriptions.length===0?<div className="p-12 text-center text-sm text-ink-500">No subscriptions activated yet.</div>:subscriptions.map(subscription=>{const customer=customers.find(row=>row.id===subscription.customerId);const overdue=subscription.renewalAt<Date.now()&&subscription.status!=='cancelled';return <div key={subscription.id} className="p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-center"><span className="grid h-11 w-11 place-items-center rounded-xl bg-sky-50 text-sky-700"><RadioTower className="h-5 w-5"/></span><div className="min-w-0 flex-1"><h3 className="font-extrabold">{customer?.name??'Customer'} · {subscription.vehicleReg}</h3><p className="mt-1 text-xs text-ink-500">{subscription.planName} · {formatCurrency(subscription.monthlyFee)}/month · renews {new Date(subscription.renewalAt).toLocaleDateString('en-GB')}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${overdue?'bg-red-100 text-red-700':subscription.status==='active'?'bg-emerald-100 text-emerald-700':'bg-ink-100 text-ink-600'}`}>{overdue?'due':subscription.status.replace('_',' ')}</span><div className="flex flex-wrap gap-2"><Button size="sm" disabled={subscription.status==='cancelled'||busy===`renew-${subscription.id}`} onClick={()=>renew(subscription)}><CircleDollarSign className="h-4 w-4"/>Collect</Button>{subscription.status==='active'?<Button size="sm" variant="outline" onClick={()=>changeStatus(subscription,'suspended')}>Suspend</Button>:subscription.status!=='cancelled'&&<Button size="sm" variant="outline" onClick={()=>changeStatus(subscription,'active')}>Resume</Button>}<Button size="sm" variant="ghost" disabled={subscription.status==='cancelled'} onClick={()=>changeStatus(subscription,'cancelled')}>Cancel</Button></div></div></div>})}</div></div>
    </section>

    <section className="mt-6 rounded-2xl border border-sky-100 bg-sky-50 p-5 text-sm text-sky-950"><div className="flex gap-3"><RefreshCw className="mt-0.5 h-5 w-5 shrink-0"/><div><b>Renewal control is now transactional.</b><p className="mt-1 text-sky-800">Every collection posts to the shared ledger, awards or redeems AutoPoints, advances the calendar billing date and remains queued safely offline.</p></div></div></section>
  </div></div>;
}
