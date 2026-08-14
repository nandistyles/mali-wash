import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { AlertTriangle, CalendarPlus, CheckCircle2, CirclePlay, Printer, Wrench, XCircle } from 'lucide-react';
import { db } from '../lib/db';
import { completeFitmentSale } from '../lib/businessOperations';
import { notifyLocalWrite } from '../lib/sync';
import { useStaff } from '../lib/auth';
import { printReceipt } from '../lib/receipt';
import { formatCurrency } from '../lib/utils';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import PageHeader from '../components/PageHeader';
import type { FitmentJob, PaymentMethod, Transaction } from '../types';

const emptyJob = { customerId: '', customerName: '', phone: '', vehicleReg: '', description: '', scheduledAt: '', quotedAmount: '', redeemPoints: '0' };

export default function DriveOperations() {
  const staff = useStaff();
  const jobs = useLiveQuery(() => db.fitmentJobs.orderBy('scheduledAt').toArray(), []) ?? [];
  const customers = useLiveQuery(() => db.customers.orderBy('name').toArray(), []) ?? [];
  const [form, setForm] = useState(emptyJob);
  const [payment, setPayment] = useState<PaymentMethod>('cash_usd');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [lastSale, setLastSale] = useState<Transaction | null>(null);

  const today = new Date().toDateString();
  const todayJobs = jobs.filter(job => new Date(job.scheduledAt).toDateString() === today && job.status !== 'cancelled');
  const pipeline = useMemo(() => jobs.filter(job => !['completed','cancelled'].includes(job.status)).reduce((sum, job) => sum + job.quotedAmount, 0), [jobs]);

  async function run(key: string, operation: () => Promise<void>) {
    setBusy(key); setError('');
    try { await operation(); await notifyLocalWrite(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The operation failed'); }
    finally { setBusy(''); }
  }

  function chooseCustomer(customerId: string) {
    const customer = customers.find(row => row.id === customerId);
    setForm({ ...form, customerId, customerName: customer?.name ?? '', phone: customer?.phone ?? '', vehicleReg: customer?.vehicles[0]?.reg ?? '' });
  }

  function save() {
    return run('save', async () => {
      if (!form.customerId && (!form.customerName.trim() || !form.phone.trim())) throw new Error('Choose a customer or enter a walk-in name and phone');
      if (!form.vehicleReg.trim()) throw new Error('Enter the vehicle registration');
      if (!form.description.trim()) throw new Error('Describe the fitment work');
      const scheduledAt = new Date(form.scheduledAt).getTime();
      if (!Number.isFinite(scheduledAt)) throw new Error('Choose a valid appointment date and time');
      const quotedAmount = Number(form.quotedAmount);
      if (!Number.isFinite(quotedAmount) || quotedAmount < 0) throw new Error('Quote must be zero or greater');
      const now = Date.now();
      await db.fitmentJobs.add({
        id: uuidv4(), customerId: form.customerId || null, customerName: form.customerName.trim(), phone: form.phone.trim(),
        vehicleReg: form.vehicleReg.trim().toUpperCase(), description: form.description.trim(), scheduledAt,
        status: 'booked', quotedAmount, sourceTransactionId: null, createdAt: now, updatedAt: now, syncStatus: 'pending_sync'
      });
      setForm(emptyJob);
    });
  }

  function setStatus(job: FitmentJob, status: FitmentJob['status']) {
    return run(`status-${job.id}`, async () => {
      if (job.status === 'completed') throw new Error('Void the linked transaction before reopening a completed job');
      await db.fitmentJobs.update(job.id, { status, updatedAt: Date.now(), syncStatus: 'pending_sync' });
    });
  }

  function complete(job: FitmentJob) {
    return run(`complete-${job.id}`, async () => {
      const transaction = await completeFitmentSale({ jobId: job.id, staffId: staff.id, paymentMethod: payment, redeemPoints: Number(form.redeemPoints || 0) });
      if (transaction) setLastSale(transaction);
    });
  }

  return <div className="mali-page"><div className="mali-page-inner max-w-[96rem]">
    <PageHeader eyebrow="Mali Drive" title="Fitment workshop" description="Turn bookings into a controlled workshop pipeline with clear statuses, payment capture and vehicle history." />
    {error&&<div className="mb-5 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800"><AlertTriangle className="h-5 w-5"/>{error}</div>}
    {lastSale&&<div className="mb-5 flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center"><CheckCircle2 className="h-5 w-5 text-emerald-700"/><div className="flex-1"><b>Job completed and revenue posted:</b> {formatCurrency(lastSale.amount)}</div><Button size="sm" variant="outline" onClick={()=>printReceipt(lastSale,customers.find(row=>row.id===lastSale.customerId)??null)}><Printer className="h-4 w-4"/>Receipt</Button></div>}

    <section className="grid gap-4 sm:grid-cols-3"><div className="rounded-2xl border border-ink-200 bg-white p-5"><p className="text-xs font-bold uppercase text-ink-500">Today’s jobs</p><p className="mt-2 text-3xl font-black">{todayJobs.length}</p></div><div className="rounded-2xl border border-ink-200 bg-white p-5"><p className="text-xs font-bold uppercase text-ink-500">Active workshop jobs</p><p className="mt-2 text-3xl font-black">{jobs.filter(job=>!['completed','cancelled'].includes(job.status)).length}</p></div><div className="rounded-2xl border border-ink-200 bg-white p-5"><p className="text-xs font-bold uppercase text-ink-500">Quoted pipeline</p><p className="mt-2 text-3xl font-black">{formatCurrency(pipeline)}</p></div></section>

    <section className="mt-6 grid gap-6 xl:grid-cols-[.72fr_1.28fr]">
      <div className="rounded-2xl border border-ink-200 bg-white p-6"><div className="flex items-center gap-3"><CalendarPlus className="h-5 w-5 text-violet-700"/><h2 className="font-black">Book a fitment</h2></div><div className="mt-5 space-y-3"><select className="h-12 w-full rounded-xl border-2 border-ink-200 px-3" value={form.customerId} onChange={e=>chooseCustomer(e.target.value)}><option value="">Walk-in customer</option>{customers.map(customer=><option key={customer.id} value={customer.id}>{customer.name} · {customer.vehicles[0]?.reg??'No vehicle'}</option>)}</select>{!form.customerId&&<div className="grid grid-cols-2 gap-3"><Input placeholder="Customer name" value={form.customerName} onChange={e=>setForm({...form,customerName:e.target.value})}/><Input inputMode="tel" placeholder="Phone" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></div>}<Input placeholder="Vehicle registration" value={form.vehicleReg} onChange={e=>setForm({...form,vehicleReg:e.target.value.toUpperCase()})}/><Input placeholder="Work description" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/><Input type="datetime-local" value={form.scheduledAt} onChange={e=>setForm({...form,scheduledAt:e.target.value})}/><div className="grid grid-cols-2 gap-3"><Input type="number" min="0" step="0.01" placeholder="Quoted amount" value={form.quotedAmount} onChange={e=>setForm({...form,quotedAmount:e.target.value})}/><Input type="number" min="0" step="1" placeholder="Points on completion" value={form.redeemPoints} onChange={e=>setForm({...form,redeemPoints:e.target.value})}/></div><Button className="w-full" disabled={busy==='save'} onClick={save}>{busy==='save'?'Booking…':'Book job'}</Button></div></div>

      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white"><div className="flex flex-col gap-3 border-b border-ink-200 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-black">Workshop schedule</h2><p className="mt-1 text-xs text-ink-500">Start, complete or cancel with a visible audit state</p></div><select value={payment} onChange={e=>setPayment(e.target.value as PaymentMethod)} className="h-10 rounded-xl border border-ink-200 px-3 text-sm"><option value="cash_usd">Cash</option><option value="ecocash">EcoCash</option><option value="card">Card</option></select></div><div className="divide-y divide-ink-100">{jobs.length===0?<div className="p-12 text-center text-sm text-ink-500">No fitment jobs booked yet.</div>:jobs.map(job=><div key={job.id} className="p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-center"><span className="grid h-11 w-11 place-items-center rounded-xl bg-violet-50 text-violet-700"><Wrench className="h-5 w-5"/></span><div className="min-w-0 flex-1"><h3 className="font-extrabold">{job.description}</h3><p className="mt-1 text-xs text-ink-500">{job.customerName||customers.find(row=>row.id===job.customerId)?.name||'Walk-in'} · {job.vehicleReg} · {new Date(job.scheduledAt).toLocaleString('en-GB')} · {formatCurrency(job.quotedAmount)}</p></div><span className="rounded-full bg-ink-100 px-2.5 py-1 text-[10px] font-black uppercase">{job.status.replace('_',' ')}</span><div className="flex gap-2">{job.status==='booked'&&<Button size="sm" variant="outline" onClick={()=>setStatus(job,'in_progress')}><CirclePlay className="h-4 w-4"/>Start</Button>}{['booked','in_progress'].includes(job.status)&&<Button size="sm" disabled={busy===`complete-${job.id}`} onClick={()=>complete(job)}><CheckCircle2 className="h-4 w-4"/>Complete</Button>}{['booked','in_progress'].includes(job.status)&&<Button size="icon-sm" variant="ghost" title="Cancel" onClick={()=>setStatus(job,'cancelled')}><XCircle className="h-4 w-4"/></Button>}</div></div></div>)}</div></div>
    </section>
  </div></div>;
}
