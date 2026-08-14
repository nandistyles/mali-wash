import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { computeMetrics, dailyRevenue, type BusinessMetrics } from '../lib/growth';
import { formatCurrency } from '../lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import PageHeader from '../components/PageHeader';
import {
  DollarSign, Receipt, Users, Repeat, CreditCard, Star, TriangleAlert, Banknote, Smartphone
} from 'lucide-react';

const DAY = 24 * 60 * 60 * 1000;
const PERIODS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

function Stat({ icon: Icon, label, value, sub, tone = 'default' }: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'good' | 'warn';
}) {
  const toneClass =
    tone === 'good' ? 'text-brand-700' :
    tone === 'warn' ? 'text-accent-700' :
    'text-ink-900';
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-ink-500 mb-2">
          <Icon className="w-4 h-4" />
          <span className="text-[11px] font-bold uppercase tracking-wider">{label}</span>
        </div>
        <div className={`text-2xl font-black ${toneClass}`}>{value}</div>
        {sub && <div className="text-xs text-ink-500 mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const [days, setDays] = useState(30);
  const [metrics, setMetrics] = useState<BusinessMetrics | null>(null);
  const [chart, setChart] = useState<{ date: string; amount: number; visits: number }[]>([]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      computeMetrics(Date.now() - days * DAY),
      dailyRevenue(Math.min(days, 30))
    ]).then(([m, c]) => {
      if (cancelled) return;
      setMetrics(m);
      setChart(c);
    });
    return () => { cancelled = true; };
  }, [days]);

  const methodTotal = metrics
    ? metrics.byPaymentMethod.cash_usd + metrics.byPaymentMethod.ecocash + metrics.byPaymentMethod.card
    : 0;

  return (
    <div className="mali-page">
      <div className="mali-page-inner max-w-[92rem]">
        <PageHeader eyebrow="Business intelligence" title="Performance" description="The wash in numbers—revenue quality, customer behavior, payment mix, and loyalty exposure." action={
          <div className="flex gap-1 bg-white border-2 border-ink-200 rounded-lg p-1">
            {PERIODS.map(p => (
              <button
                key={p.days}
                onClick={() => setDays(p.days)}
                className={`px-3 py-1.5 rounded text-sm font-bold transition-colors ${
                  days === p.days ? 'bg-brand-900 text-white' : 'text-ink-600 hover:bg-ink-100'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        } />

        {!metrics ? (
          <Card><CardContent className="p-12 text-center text-ink-500">Reading the ledger…</CardContent></Card>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Stat icon={DollarSign} label="Revenue" value={formatCurrency(metrics.revenue)}
                sub={`${metrics.transactionCount} sales`} tone="good" />
              <Stat icon={Receipt} label="Average ticket" value={formatCurrency(metrics.averageTicket)} />
              <Stat icon={Users} label="New customers" value={String(metrics.newCustomers)}
                sub={`in the last ${days} days`} />
              <Stat icon={Repeat} label="Repeat rate" value={`${Math.round(metrics.repeatRate * 100)}%`}
                sub="customers who came back"
                tone={metrics.repeatRate >= 0.4 ? 'good' : 'warn'} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Payment split drives till reconciliation — you cannot check a
                  drawer against a single blended revenue number. */}
              <Card className="lg:col-span-1">
                <CardHeader><CardTitle className="text-base">Payment split</CardTitle></CardHeader>
                <CardContent className="p-5 pt-0 space-y-3">
                  {[
                    { key: 'cash_usd' as const, label: 'Cash USD', icon: Banknote, colour: 'bg-emerald-500' },
                    { key: 'ecocash' as const, label: 'EcoCash', icon: Smartphone, colour: 'bg-blue-500' },
                    { key: 'card' as const, label: 'Card', icon: CreditCard, colour: 'bg-purple-500' },
                  ].map(m => {
                    const amount = metrics.byPaymentMethod[m.key];
                    const pct = methodTotal > 0 ? (amount / methodTotal) * 100 : 0;
                    return (
                      <div key={m.key}>
                        <div className="flex justify-between items-center text-sm mb-1">
                          <span className="flex items-center gap-2 text-ink-600">
                            <m.icon className="w-3.5 h-3.5" /> {m.label}
                          </span>
                          <span className="font-bold text-ink-900">{formatCurrency(amount)}</span>
                        </div>
                        <div className="h-2 bg-ink-100 rounded-full overflow-hidden">
                          <div className={`h-full ${m.colour}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader><CardTitle className="text-base">Daily revenue</CardTitle></CardHeader>
                <CardContent className="p-5 pt-0">
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chart}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 11 }} width={45} />
                        <Tooltip
                          formatter={(v: number) => formatCurrency(v)}
                          contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                        />
                        <Bar dataKey="amount" radius={[4, 4, 0, 0]} fill="#0f766e" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Stat icon={CreditCard} label="Active memberships" value={String(metrics.activeMemberships)}
                sub={`${formatCurrency(metrics.membershipMrr)} recurring / month`} tone="good" />
              <Stat icon={DollarSign} label="Returning-customer revenue"
                value={formatCurrency(metrics.returningCustomerRevenue)}
                sub={metrics.revenue > 0
                  ? `${Math.round((metrics.returningCustomerRevenue / metrics.revenue) * 100)}% of revenue`
                  : undefined} />
              {/* Outstanding points are a real liability, not a vanity metric:
                  every one is a discount you have already sold. */}
              <Stat icon={Star} label="Points liability" value={formatCurrency(metrics.pointsLiabilityUsd)}
                sub="if every point were redeemed"
                tone={metrics.pointsLiabilityUsd > metrics.revenue * 0.15 ? 'warn' : 'default'} />
              <Stat icon={TriangleAlert} label="Voided" value={String(metrics.voidedCount)}
                sub={formatCurrency(metrics.voidedValue)}
                tone={metrics.voidedCount > 0 ? 'warn' : 'default'} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
