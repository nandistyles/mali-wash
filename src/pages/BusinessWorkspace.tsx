import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowRight, BarChart3, CarFront, CircleGauge, PackageOpen, Plus, RadioTower, UsersRound } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { Card, CardContent } from '../components/ui/card';

const units = {
  wash: { name: 'Mali Wash', eyebrow: 'Vehicle care & detailing', icon: CarFront, tone: 'from-cyan-500 to-teal-700', primary: '/wash/pos', primaryLabel: 'Start a wash sale', features: ['Point of sale', 'Bookings', 'Shifts & till', 'Memberships'] },
  parts: { name: 'Mali Parts', eyebrow: 'Parts & trade supply', icon: PackageOpen, tone: 'from-amber-400 to-orange-600', primary: '/customers', primaryLabel: 'Create parts order', features: ['Sales counter', 'Inventory', 'Suppliers', 'Trade accounts'] },
  drive: { name: 'Mali Drive', eyebrow: 'Accessories & fitment', icon: CircleGauge, tone: 'from-violet-500 to-indigo-700', primary: '/customers', primaryLabel: 'Create fitment job', features: ['Accessory sales', 'Fitment jobs', 'Stock control', 'Job scheduling'] },
  track: { name: 'Mali Track', eyebrow: 'Tracking & fleet security', icon: RadioTower, tone: 'from-emerald-500 to-green-800', primary: '/customers', primaryLabel: 'Add subscription', features: ['Devices', 'Subscriptions', 'Fleet accounts', 'Renewals'] },
} as const;

export default function BusinessWorkspace() {
  const { business } = useParams();
  const unit = units[business as keyof typeof units];
  if (!unit) return <Navigate to="/" replace />;
  const Icon = unit.icon;
  const isWash = business === 'wash';
  return <div className="mali-page"><div className="mali-page-inner max-w-[92rem]">
    <PageHeader eyebrow={unit.eyebrow} title={unit.name} description={`The ${unit.name} operating workspace, connected to the shared Mali customer and AutoPoints foundation.`} action={<Link to={unit.primary} className="pressable inline-flex h-11 items-center gap-2 rounded-xl bg-brand-900 px-4 text-sm font-extrabold text-white"><Plus className="h-4 w-4" /> {unit.primaryLabel}</Link>} />
    <section className={`relative overflow-hidden rounded-[2rem] bg-gradient-to-br ${unit.tone} p-6 text-white shadow-lg sm:p-8`}><Icon className="absolute -bottom-8 -right-5 h-44 w-44 text-white/10" strokeWidth={1.2} /><div className="relative"><p className="text-xs font-extrabold uppercase tracking-[.18em] text-white/65">Today’s workspace</p><h2 className="mt-3 max-w-xl text-3xl font-black tracking-[-.04em]">Serve brilliantly. Capture every relationship signal.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">Transactions from this business feed the same group ledger, customer history, and loyalty balance—ready for intelligent follow-up across Mali Holdings.</p></div></section>
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">{unit.features.map((feature, index) => <Card key={feature}><CardContent className="p-4 sm:p-5"><span className="text-[10px] font-black uppercase tracking-widest text-ink-400">Workspace 0{index + 1}</span><h3 className="mt-2 font-black text-ink-950">{feature}</h3><p className="mt-2 text-xs leading-5 text-ink-500">{isWash || index === 0 ? 'Connected to the shared Mali foundation.' : 'Operational workflow ready for implementation.'}</p></CardContent></Card>)}</section>
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-2"><Link to="/customers" className="group"><Card className="h-full transition-shadow group-hover:shadow-lg"><CardContent className="flex items-center gap-4 p-5"><div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-100 text-brand-700"><UsersRound className="h-5 w-5" /></div><div className="flex-1"><h3 className="font-black text-ink-950">Shared customers</h3><p className="mt-1 text-xs text-ink-500">Search one group-wide customer and vehicle history.</p></div><ArrowRight className="h-4 w-4 text-ink-400" /></CardContent></Card></Link><Link to="/dashboard" className="group"><Card className="h-full transition-shadow group-hover:shadow-lg"><CardContent className="flex items-center gap-4 p-5"><div className="grid h-11 w-11 place-items-center rounded-xl bg-accent-100 text-accent-700"><BarChart3 className="h-5 w-5" /></div><div className="flex-1"><h3 className="font-black text-ink-950">Business intelligence</h3><p className="mt-1 text-xs text-ink-500">See revenue, customer behaviour, and loyalty exposure.</p></div><ArrowRight className="h-4 w-4 text-ink-400" /></CardContent></Card></Link></section>
  </div></div>;
}
