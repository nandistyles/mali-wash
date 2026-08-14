import { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getSettings } from '../lib/db';
import {
  buildInsights, lapsed, expiringMemberships, loyalNeverReferred,
  membershipCandidates, topReferrers,
  winBackMessage, renewalMessage, referralAskMessage, membershipPitchMessage,
  type CustomerInsight
} from '../lib/growth';
import { openWhatsApp } from '../lib/whatsapp';
import { formatPhone } from '../lib/phone';
import { formatCurrency } from '../lib/utils';
import { Card, CardContent } from '../components/ui/card';
import { MessageCircle, Check, RefreshCw, Users, Clock, Star, CreditCard, Trophy } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';

/**
 * The daily growth worklist.
 *
 * A dashboard tells you the repeat rate fell. This tells you which eleven people
 * to message about it, what to say, and lets you send it in one tap. That
 * difference is the whole point of the screen.
 *
 * Contacted state is kept in localStorage keyed by segment and date rather than
 * in Firestore: it is a per-day working note, not a business record, and putting
 * it on the shared customer document would pollute the hub schema every other
 * Mali business inherits.
 */

type SegmentId = 'winback' | 'renewals' | 'membership' | 'referral' | 'champions';

const CONTACTED_KEY = 'mali_outreach_contacted';

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function loadContacted(): Record<string, true> {
  try {
    const raw = JSON.parse(localStorage.getItem(CONTACTED_KEY) || '{}');
    return raw.date === todayKey() ? (raw.ids ?? {}) : {};
  } catch {
    return {};
  }
}

function saveContacted(ids: Record<string, true>) {
  localStorage.setItem(CONTACTED_KEY, JSON.stringify({ date: todayKey(), ids }));
}

export default function Growth() {
  const [insights, setInsights] = useState<CustomerInsight[] | null>(null);
  const [segment, setSegment] = useState<SegmentId>('winback');
  const [contacted, setContacted] = useState<Record<string, true>>(loadContacted);
  const [refreshing, setRefreshing] = useState(false);

  const settings = useLiveQuery(() => getSettings());

  const load = async () => {
    setRefreshing(true);
    setInsights(await buildInsights());
    setRefreshing(false);
  };

  useEffect(() => { void load(); }, []);

  const segments = useMemo(() => {
    if (!insights) return null;
    return {
      winback: lapsed(insights),
      renewals: expiringMemberships(insights, 7),
      membership: membershipCandidates(insights),
      referral: loyalNeverReferred(insights),
      champions: topReferrers(insights)
    };
  }, [insights]);

  const markContacted = (id: string) => {
    const next = { ...contacted, [id]: true as const };
    setContacted(next);
    saveContacted(next);
  };

  const basicPlan = settings?.membershipPlans.find(p => p.tier === 'basic_member');
  const basicService = basicPlan ? settings?.services.find(s => s.id === basicPlan.id) : undefined;

  const messageFor = (i: CustomerInsight): string => {
    switch (segment) {
      case 'winback':
        return winBackMessage(i, i.customer.pointsBalance);
      case 'renewals':
        return renewalMessage(i);
      case 'referral':
        return referralAskMessage(i, i.customer.referralCode, settings?.referralRewardPoints ?? 50);
      case 'membership': {
        const price = basicService?.price ?? 18;
        // What they already spend per month at their current rate, minus the plan.
        const perMonth = i.averageGapDays && i.averageGapDays > 0
          ? (30 / i.averageGapDays) * (i.lifetimeSpend / Math.max(1, i.visits))
          : i.lifetimeSpend / Math.max(1, i.visits) * 2;
        return membershipPitchMessage(i, basicService?.name ?? 'monthly membership', price, Math.max(0, perMonth - price));
      }
      case 'champions':
        return referralAskMessage(i, i.customer.referralCode, settings?.referralRewardPoints ?? 50);
    }
  };

  const tabs: { id: SegmentId; label: string; icon: typeof Users; hint: string }[] = [
    { id: 'winback', label: 'Win back', icon: Clock, hint: 'Stopped coming — ranked by lifetime value' },
    { id: 'renewals', label: 'Renewals', icon: RefreshCw, hint: 'Memberships expiring within 7 days' },
    { id: 'membership', label: 'Convert', icon: CreditCard, hint: 'Regulars who would save money on a plan' },
    { id: 'referral', label: 'Ask', icon: Star, hint: 'Regulars nobody has asked to refer' },
    { id: 'champions', label: 'Champions', icon: Trophy, hint: 'Customers already bringing you customers' },
  ];

  const rows = segments?.[segment] ?? [];
  const remaining = rows.filter(i => !contacted[i.customer.id]);

  const subtitle = (i: CustomerInsight): string => {
    switch (segment) {
      case 'winback':
        return `${i.daysSinceLastVisit}d since last visit · ${i.visits} visits · ${formatCurrency(i.lifetimeSpend)} lifetime`
          + (i.averageGapDays ? ` · usually every ${i.averageGapDays}d` : '');
      case 'renewals': {
        const days = i.membership?.expiry ? Math.ceil((i.membership.expiry - Date.now()) / 86400000) : 0;
        return days <= 0 ? 'Expired' : `Expires in ${days} day${days === 1 ? '' : 's'}`;
      }
      case 'membership':
        return `${i.visits} visits · ${formatCurrency(i.lifetimeSpend)} lifetime`
          + (i.averageGapDays ? ` · every ${i.averageGapDays}d` : '');
      case 'referral':
        return `${i.visits} visits · never referred anyone`;
      case 'champions':
        return `${i.referralsMade} referral${i.referralsMade === 1 ? '' : 's'} · ${i.visits} visits`;
    }
  };

  return (
    <div className="mali-page">
      <div className="mali-page-inner max-w-6xl">
        <PageHeader eyebrow="Revenue engine" title="Growth desk" description="Know exactly who to talk to today—and why that conversation matters." action={
          <button
            onClick={load}
            className="pressable flex items-center gap-2 px-4 h-11 bg-white border border-border rounded-xl text-sm font-extrabold text-ink-700 shadow-xs hover:border-brand-400"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
        } />

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {tabs.map(tab => {
            const count = segments?.[tab.id].filter(i => !contacted[i.customer.id]).length ?? 0;
            const active = segment === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSegment(tab.id)}
                className={`p-3 rounded-xl border-2 text-left transition-all ${
                  active ? 'bg-brand-900 border-brand-900 text-white' : 'bg-white border-ink-200 hover:border-brand-400'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <tab.icon className="w-4 h-4" />
                  <span className={`text-lg font-black ${active ? 'text-white' : 'text-brand-700'}`}>{count}</span>
                </div>
                <div className="text-xs font-bold uppercase tracking-wider">{tab.label}</div>
              </button>
            );
          })}
        </div>

        <p className="text-sm text-ink-500 -mt-2">{tabs.find(t => t.id === segment)?.hint}</p>

        {!insights ? (
          <Card><CardContent className="p-12 text-center text-ink-500">Reading the ledger…</CardContent></Card>
        ) : rows.length === 0 ? (
          <EmptyState icon={Users} title="Nothing to action here" description={segment === 'winback' ? 'Everyone is coming back on schedule. That is what good retention looks like.' : 'This list is clear today. Check another growth opportunity above.'} />
        ) : (
          <>
            {remaining.length === 0 && (
              <div className="p-4 bg-brand-50 border-2 border-brand-200 rounded-xl text-brand-900 font-bold text-center">
                All {rows.length} contacted today. Nice.
              </div>
            )}
            <Card>
              <CardContent className="p-0 divide-y divide-ink-100">
                {rows.map(i => {
                  const done = contacted[i.customer.id];
                  return (
                    <div
                      key={i.customer.id}
                      className={`p-4 flex items-center gap-4 ${done ? 'opacity-45' : ''}`}
                    >
                      <div className="w-10 h-10 rounded-full bg-brand-600 text-white font-bold flex items-center justify-center shrink-0">
                        {i.customer.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-ink-900 truncate">{i.customer.name}</p>
                        <p className="text-xs text-ink-500">{subtitle(i)}</p>
                        <p className="text-xs text-ink-400">{formatPhone(i.customer.phone)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {done ? (
                          <span className="flex items-center gap-1 text-brand-600 text-sm font-bold px-3">
                            <Check className="w-4 h-4" /> Sent
                          </span>
                        ) : (
                          <button
                            onClick={() => {
                              const ok = openWhatsApp(i.customer.phone, messageFor(i));
                              if (ok) markContacted(i.customer.id);
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-sm"
                          >
                            <MessageCircle className="w-4 h-4" /> WhatsApp
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
