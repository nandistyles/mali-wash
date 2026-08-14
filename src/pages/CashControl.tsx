import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { AlertTriangle, Banknote, CheckCircle2, LockKeyhole, WalletCards } from 'lucide-react';
import { db } from '../lib/db';
import { notifyLocalWrite } from '../lib/sync';
import { useStaff } from '../lib/auth';
import { formatCurrency } from '../lib/utils';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import PageHeader from '../components/PageHeader';
import type { BusinessUnit, CashSession } from '../types';

const LABELS: Record<string,string> = { parts:'Mali Parts', drive:'Mali Drive', track:'Mali Track' };

export default function CashControl() {
  const staff = useStaff();
  const businesses = staff.businesses.filter((business): business is Exclude<BusinessUnit,'wash'> => business !== 'wash');
  const [business,setBusiness] = useState<Exclude<BusinessUnit,'wash'>>(businesses[0] ?? 'parts');
  const [openingFloat,setOpeningFloat] = useState('0');
  const [countedCash,setCountedCash] = useState('');
  const [error,setError] = useState('');
  const sessions = useLiveQuery(() => db.cashSessions.filter(session => businesses.includes(session.business)).reverse().sortBy('openedAt'), [businesses.join('|')]) ?? [];
  const transactions = useLiveQuery(() => db.transactions.filter(transaction => Boolean(transaction.shiftId)).toArray(), []) ?? [];
  const open = sessions.find(session => session.business===business && session.staffId===staff.id && session.status==='open');

  function expected(session: CashSession) {
    return session.openingFloat + transactions.filter(transaction => transaction.shiftId===session.id && transaction.status==='completed' && transaction.paymentMethod==='cash_usd').reduce((sum,transaction)=>sum+transaction.amount,0);
  }

  async function openDrawer() {
    setError('');
    try {
      const amount=Number(openingFloat);
      if (!Number.isFinite(amount)||amount<0) throw new Error('Opening float must be zero or greater');
      if (open) throw new Error('This drawer is already open');
      await db.cashSessions.add({id:uuidv4(),business,staffId:staff.id,openedAt:Date.now(),closedAt:null,openingFloat:amount,countedCash:null,variance:null,status:'open',syncStatus:'pending_sync'});
      await notifyLocalWrite(); setOpeningFloat('0');
    } catch(cause){setError(cause instanceof Error?cause.message:'Could not open the drawer');}
  }

  async function closeDrawer() {
    setError('');
    try {
      if(!open) throw new Error('No drawer is open');
      const counted=Number(countedCash);
      if(!Number.isFinite(counted)||counted<0) throw new Error('Enter the counted cash');
      await db.cashSessions.update(open.id,{closedAt:Date.now(),countedCash:counted,variance:Math.round((counted-expected(open))*100)/100,status:'closed',syncStatus:'pending_sync'});
      await notifyLocalWrite(); setCountedCash('');
    } catch(cause){setError(cause instanceof Error?cause.message:'Could not close the drawer');}
  }

  return <div className="mali-page"><div className="mali-page-inner max-w-6xl">
    <PageHeader eyebrow="Cash control" title="Business cash drawers" description="Every cash sale in Parts, Drive and Track is tied to an open drawer and reconciled against a physical count."/>
    {error&&<div className="mb-5 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800"><AlertTriangle className="h-5 w-5"/>{error}</div>}
    <div className="grid gap-6 lg:grid-cols-[.75fr_1.25fr]">
      <section className="rounded-2xl border border-ink-200 bg-white p-6"><div className="flex items-center gap-3"><WalletCards className="h-5 w-5 text-brand-700"/><h2 className="font-black">Current drawer</h2></div><div className="mt-5 space-y-4"><select className="h-12 w-full rounded-xl border-2 border-ink-200 px-3" value={business} onChange={e=>setBusiness(e.target.value as Exclude<BusinessUnit,'wash'>)}>{businesses.map(unit=><option key={unit} value={unit}>{LABELS[unit]}</option>)}</select>{open?<><div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><div className="flex items-center gap-2 font-black text-emerald-800"><CheckCircle2 className="h-4 w-4"/>Drawer open</div><div className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-ink-500">Opening float</p><b>{formatCurrency(open.openingFloat)}</b></div><div><p className="text-xs text-ink-500">Expected cash</p><b>{formatCurrency(expected(open))}</b></div></div></div><Input type="number" min="0" step="0.01" placeholder="Counted cash" value={countedCash} onChange={e=>setCountedCash(e.target.value)}/><Button className="w-full" variant="destructive" onClick={closeDrawer}><LockKeyhole className="h-4 w-4"/>Close & reconcile</Button></>:<><Input type="number" min="0" step="0.01" placeholder="Opening float" value={openingFloat} onChange={e=>setOpeningFloat(e.target.value)}/><Button className="w-full" onClick={openDrawer}><Banknote className="h-4 w-4"/>Open {LABELS[business]} drawer</Button></>}</div></section>
      <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white"><div className="border-b border-ink-200 p-5"><h2 className="font-black">Recent reconciliations</h2><p className="mt-1 text-xs text-ink-500">Variance is counted cash minus expected cash</p></div><div className="divide-y divide-ink-100">{sessions.filter(session=>session.status==='closed').slice(0,12).map(session=><div key={session.id} className="flex items-center gap-4 p-5"><div className="flex-1"><h3 className="font-extrabold">{LABELS[session.business]}</h3><p className="mt-1 text-xs text-ink-500">{new Date(session.openedAt).toLocaleString('en-GB')} · expected {formatCurrency(expected(session))} · counted {formatCurrency(session.countedCash??0)}</p></div><span className={`font-black ${(session.variance??0)===0?'text-emerald-700':'text-red-600'}`}>{(session.variance??0)>0?'+':''}{formatCurrency(session.variance??0)}</span></div>)}{sessions.filter(session=>session.status==='closed').length===0&&<p className="p-12 text-center text-sm text-ink-500">No closed drawers yet.</p>}</div></section>
    </div>
  </div></div>;
}
