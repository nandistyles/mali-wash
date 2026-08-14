import { Link } from 'react-router-dom';
import { ArrowRight, CarFront, CircleGauge, PackageOpen, RadioTower, Sparkles, UsersRound } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { Card, CardContent } from '../components/ui/card';

const businesses = [
  { id: 'wash', name: 'Mali Wash', line: 'Care & detailing', icon: CarFront, path: '/wash', tone: 'from-cyan-500 to-teal-700', status: 'Live' },
  { id: 'parts', name: 'Mali Parts', line: 'Parts & trade supply', icon: PackageOpen, path: '/parts', tone: 'from-amber-400 to-orange-600', status: 'Ready' },
  { id: 'drive', name: 'Mali Drive', line: 'Accessories & fitment', icon: CircleGauge, path: '/drive', tone: 'from-violet-500 to-indigo-700', status: 'Ready' },
  { id: 'track', name: 'Mali Track', line: 'Tracking & fleet security', icon: RadioTower, path: '/track', tone: 'from-emerald-500 to-green-800', status: 'Ready' },
] as const;

export default function HoldingsOverview() {
  return (
    <div className="mali-page"><div className="mali-page-inner max-w-[92rem]">
      <PageHeader eyebrow="Mali Holdings command centre" title="One customer. Every road." description="Run the complete automotive relationship from one intelligent operating system—care, parts, accessories, tracking, loyalty, and growth." />
      <section className="relative overflow-hidden rounded-[2rem] brand-gradient mali-grid p-6 sm:p-9 text-white shadow-xl">
        <div className="absolute -right-16 -top-24 h-72 w-72 rounded-full bg-cyan-300/15 blur-3xl" />
        <div className="relative max-w-3xl"><div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[.16em] text-cyan-100"><Sparkles className="h-3.5 w-3.5 text-amber-300" /> Automotive relationship engine</div>
          <h2 className="mt-5 text-3xl font-black tracking-[-.04em] sm:text-5xl">Grow the customer, not just the transaction.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-brand-100/75 sm:text-base">Every visit builds one Mali profile, one AutoPoints balance, and the next best reason for that customer to return.</p>
          <div className="mt-7 flex flex-wrap gap-3"><Link to="/wash/pos" className="pressable inline-flex h-12 items-center gap-2 rounded-xl bg-white px-5 text-sm font-extrabold text-brand-950 shadow-lg">Open live POS <ArrowRight className="h-4 w-4" /></Link><Link to="/customers" className="pressable inline-flex h-12 items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-5 text-sm font-extrabold text-white"><UsersRound className="h-4 w-4" /> Find a customer</Link></div>
        </div>
      </section>
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{businesses.map(unit => <Link key={unit.id} to={unit.path} className="group pressable block"><Card className="h-full overflow-hidden transition-all group-hover:-translate-y-1 group-hover:shadow-xl"><div className={`h-1.5 bg-gradient-to-r ${unit.tone}`} /><CardContent className="p-5"><div className="flex items-start justify-between"><div className={`grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br ${unit.tone} text-white shadow-md`}><unit.icon className="h-6 w-6" /></div><span className="rounded-full bg-brand-50 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wider text-brand-700">{unit.status}</span></div><h3 className="mt-5 text-xl font-black tracking-tight text-ink-950">{unit.name}</h3><p className="mt-1 text-sm text-ink-500">{unit.line}</p><span className="mt-5 inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-brand-700">Enter workspace <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" /></span></CardContent></Card></Link>)}</section>
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">{[['AutoPoints', 'One group-wide loyalty balance that gives every customer a reason to use the next Mali service.'], ['Customer 360', 'A single profile for vehicles, purchases, visits, subscriptions, referrals, and lifetime value.'], ['Next best action', 'Turn operational data into timely cross-sell opportunities instead of disconnected records.']].map(([title, body], index) => <Card key={title}><CardContent className="p-5"><span className="text-[10px] font-black uppercase tracking-[.18em] text-brand-600">0{index + 1} · Growth system</span><h3 className="mt-2 text-lg font-black text-ink-950">{title}</h3><p className="mt-2 text-sm leading-6 text-ink-500">{body}</p></CardContent></Card>)}</section>
    </div></div>
  );
}
