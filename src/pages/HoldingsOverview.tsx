import { Link } from 'react-router-dom';
import { ArrowUpRight, CarFront, ChevronRight, CircleGauge, PackageOpen, RadioTower, Search, Sparkles, UsersRound } from 'lucide-react';
import PageHeader from '../components/PageHeader';

const businesses = [
  { name: 'Wash', detail: 'Care & detailing', icon: CarFront, path: '/wash', accent: 'bg-[#DFF7F3] text-[#08756D]', live: true },
  { name: 'Parts', detail: 'Retail & trade supply', icon: PackageOpen, path: '/parts', accent: 'bg-[#FFF1D6] text-[#A9550B]', live: false },
  { name: 'Drive', detail: 'Accessories & fitment', icon: CircleGauge, path: '/drive', accent: 'bg-[#EEE9FF] text-[#6046B5]', live: false },
  { name: 'Track', detail: 'Security & fleet', icon: RadioTower, path: '/track', accent: 'bg-[#E4F5E8] text-[#287242]', live: false },
] as const;

export default function HoldingsOverview() {
  return <div className="mali-page"><div className="mali-page-inner">
    <PageHeader eyebrow="Group command centre" title="Good morning, Michael." description="A clear view of Mali Holdings—and the fastest route to the work that matters today." action={<Link to="/customers" className="inline-flex h-11 items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 text-sm font-bold text-ink-800 shadow-xs hover:border-brand-300"><Search className="h-4 w-4" /> Search customers</Link>} />

    <section className="grid overflow-hidden rounded-[1.5rem] border border-brand-900/10 bg-[#063E3D] text-white shadow-xl lg:grid-cols-[1.35fr_.65fr]">
      <div className="p-7 sm:p-10 lg:p-12">
        <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.16em] text-[#8ED8D0]"><Sparkles className="h-4 w-4" /> Customer relationship engine</span>
        <h2 className="mt-5 max-w-2xl text-3xl font-black leading-[1.05] tracking-[-.045em] sm:text-5xl">One customer.<br/>Every automotive need.</h2>
        <p className="mt-5 max-w-xl text-sm leading-7 text-white/65 sm:text-base">Wash, parts, accessories and tracking share one customer history, one transaction ledger and one AutoPoints balance.</p>
        <div className="mt-8 flex flex-wrap gap-3"><Link to="/wash/pos" className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#F8C454] px-5 text-sm font-extrabold text-[#302307] shadow-lg hover:bg-[#FFD271]">Start a wash sale <ArrowUpRight className="h-4 w-4" /></Link><Link to="/customers" className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/15 bg-white/8 px-5 text-sm font-bold text-white hover:bg-white/12"><UsersRound className="h-4 w-4" /> Customer 360</Link></div>
      </div>
      <div className="hidden border-l border-white/10 bg-white/[.04] p-8 lg:flex lg:flex-col lg:justify-between">
        <p className="text-xs font-bold uppercase tracking-[.15em] text-white/45">Today’s focus</p>
        <div><p className="text-5xl font-black tracking-[-.06em]">4</p><p className="mt-2 text-sm leading-6 text-white/60">connected businesses building one Mali customer relationship.</p></div>
        <Link to="/growth" className="inline-flex items-center justify-between border-t border-white/10 pt-5 text-sm font-bold">Open growth engine <ChevronRight className="h-4 w-4" /></Link>
      </div>
    </section>

    <section>
      <div className="mb-5 flex items-end justify-between"><div><p className="text-[11px] font-extrabold uppercase tracking-[.14em] text-brand-700">Operations</p><h2 className="mt-2 text-2xl font-black tracking-tight text-ink-950">Choose a business</h2></div><p className="hidden text-sm text-ink-500 sm:block">One login across Mali Holdings</p></div>
      <div className="grid overflow-hidden rounded-[1.5rem] border border-ink-200 bg-white shadow-sm sm:grid-cols-2 xl:grid-cols-4">
        {businesses.map((unit, index) => <Link key={unit.name} to={unit.path} className={`group min-h-52 p-6 sm:p-7 hover:bg-ink-50/70 ${index ? 'border-t sm:border-t-0 sm:border-l border-ink-200' : ''} ${index === 2 ? 'sm:border-l-0 sm:border-t xl:border-l xl:border-t-0' : ''}`}>
          <div className="flex items-start justify-between"><span className={`grid h-12 w-12 place-items-center rounded-2xl ${unit.accent}`}><unit.icon className="h-5 w-5" /></span>{unit.live && <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-brand-700">Live</span>}</div>
          <h3 className="mt-7 text-xl font-black text-ink-950">Mali {unit.name}</h3><p className="mt-1.5 text-sm text-ink-500">{unit.detail}</p><span className="mt-6 inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-ink-700">Open workspace <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
        </Link>)}
      </div>
    </section>

    <section className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
      <div className="rounded-[1.5rem] border border-ink-200 bg-white p-7 sm:p-8"><p className="text-[11px] font-extrabold uppercase tracking-[.14em] text-brand-700">How Mali grows</p><h2 className="mt-3 text-2xl font-black text-ink-950">The relationship compounds.</h2><div className="mt-7 grid gap-6 sm:grid-cols-3">{[['01', 'Recognise', 'Find the customer by phone or vehicle.'], ['02', 'Serve', 'Complete the job and capture the transaction.'], ['03', 'Bring back', 'Reward loyalty and offer the next useful service.']].map(([n,t,d]) => <div key={n}><span className="font-mono text-xs font-bold text-brand-600">{n}</span><h3 className="mt-3 font-extrabold text-ink-950">{t}</h3><p className="mt-2 text-sm leading-6 text-ink-500">{d}</p></div>)}</div></div>
      <Link to="/growth" className="group flex min-h-64 flex-col justify-between rounded-[1.5rem] bg-[#F3E5BD] p-7 text-[#302307] sm:p-8"><div><p className="text-[11px] font-extrabold uppercase tracking-[.14em] opacity-60">Growth engine</p><h2 className="mt-3 text-2xl font-black">Turn every visit into the next one.</h2></div><span className="inline-flex items-center justify-between border-t border-black/10 pt-5 text-sm font-extrabold">See opportunities <ArrowUpRight className="h-5 w-5 transition-transform group-hover:-translate-y-1 group-hover:translate-x-1" /></span></Link>
    </section>
  </div></div>;
}
