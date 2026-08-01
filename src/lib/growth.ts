import { db, getSettings } from './db';
import { getActiveMembership } from './memberships';
import type { Customer, Transaction, WashMembership } from '../types';

/**
 * Growth intelligence.
 *
 * A wash grows on three levers, in order of size: how often each customer comes
 * back, how many customers each customer brings, and how much revenue is
 * recurring rather than transactional. This module turns the transaction ledger
 * into worklists against those three, so the data produces a daily action
 * instead of a chart nobody acts on.
 *
 * Everything reads from Dexie, so it works with no connectivity.
 */

const DAY = 24 * 60 * 60 * 1000;

export interface CustomerInsight {
  customer: Customer;
  visits: number;
  lifetimeSpend: number;
  lastVisit: number | null;
  daysSinceLastVisit: number | null;
  averageGapDays: number | null;
  membership: WashMembership | null;
  referralsMade: number;
}

/** Build the per-customer picture once; every segment below reads from it. */
export async function buildInsights(): Promise<CustomerInsight[]> {
  const [customers, transactions, redemptions] = await Promise.all([
    db.customers.toArray(),
    db.transactions.filter(t => t.status === 'completed').toArray(),
    db.referralRedemptions.toArray()
  ]);

  const byCustomer = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (!t.customerId) continue;
    const list = byCustomer.get(t.customerId);
    if (list) list.push(t); else byCustomer.set(t.customerId, [t]);
  }

  const referralCount = new Map<string, number>();
  for (const r of redemptions) {
    referralCount.set(r.referrerId, (referralCount.get(r.referrerId) ?? 0) + 1);
  }

  const now = Date.now();
  const insights: CustomerInsight[] = [];

  for (const customer of customers) {
    const txns = (byCustomer.get(customer.id) ?? []).sort((a, b) => a.createdAt - b.createdAt);
    const lastVisit = txns.length ? txns[txns.length - 1].createdAt : null;

    // Mean gap between visits — the number that says whether someone is
    // 3 days late or 3 months late, which a raw "last seen" cannot.
    let averageGapDays: number | null = null;
    if (txns.length >= 2) {
      let total = 0;
      for (let i = 1; i < txns.length; i++) total += txns[i].createdAt - txns[i - 1].createdAt;
      averageGapDays = Math.round(total / (txns.length - 1) / DAY);
    }

    insights.push({
      customer,
      visits: txns.length,
      lifetimeSpend: Math.round(txns.reduce((s, t) => s + t.amount, 0) * 100) / 100,
      lastVisit,
      daysSinceLastVisit: lastVisit === null ? null : Math.floor((now - lastVisit) / DAY),
      averageGapDays,
      membership: await getActiveMembership(customer.id),
      referralsMade: referralCount.get(customer.id) ?? 0
    });
  }

  return insights;
}

/**
 * Customers who have stopped coming. Ranked by lifetime value, because a $200
 * customer who lapsed is worth chasing before a $6 one.
 *
 * "Overdue" is relative to each customer's own rhythm where we know it: someone
 * who always came weekly is a worry at 21 days, while a monthly customer is not.
 */
export function lapsed(insights: CustomerInsight[], minDays = 30): CustomerInsight[] {
  return insights
    .filter(i => {
      if (i.visits === 0 || i.daysSinceLastVisit === null) return false;
      const threshold = i.averageGapDays ? Math.max(i.averageGapDays * 2, 14) : minDays;
      return i.daysSinceLastVisit >= Math.min(threshold, minDays);
    })
    .sort((a, b) => b.lifetimeSpend - a.lifetimeSpend);
}

/** Memberships about to lapse. Renewals are the highest-margin revenue here. */
export function expiringMemberships(insights: CustomerInsight[], withinDays = 7): CustomerInsight[] {
  const cutoff = Date.now() + withinDays * DAY;
  return insights
    .filter(i => i.membership?.expiry != null && i.membership.expiry <= cutoff)
    .sort((a, b) => (a.membership!.expiry ?? 0) - (b.membership!.expiry ?? 0));
}

/**
 * Regulars who have never referred anyone. The single most under-asked group in
 * most businesses: they already like you, and nobody has asked.
 */
export function loyalNeverReferred(insights: CustomerInsight[], minVisits = 3): CustomerInsight[] {
  return insights
    .filter(i => i.visits >= minVisits && i.referralsMade === 0)
    .sort((a, b) => b.visits - a.visits);
}

/** Regulars without a membership — the conversion that turns cash into MRR. */
export function membershipCandidates(insights: CustomerInsight[], minVisits = 3): CustomerInsight[] {
  return insights
    .filter(i => !i.membership && i.visits >= minVisits)
    .sort((a, b) => b.visits - a.visits);
}

export function topReferrers(insights: CustomerInsight[]): CustomerInsight[] {
  return insights.filter(i => i.referralsMade > 0).sort((a, b) => b.referralsMade - a.referralsMade);
}

// ---------------------------------------------------------------------------
// Business metrics
// ---------------------------------------------------------------------------

export interface BusinessMetrics {
  revenue: number;
  transactionCount: number;
  averageTicket: number;
  byPaymentMethod: { cash_usd: number; ecocash: number; card: number };
  newCustomers: number;
  returningCustomerRevenue: number;
  repeatRate: number;          // share of customers who came more than once
  activeMemberships: number;
  membershipMrr: number;
  pointsLiabilityUsd: number;  // what outstanding AutoPoints would cost if redeemed
  voidedCount: number;
  voidedValue: number;
}

export async function computeMetrics(sinceMs: number, untilMs = Date.now()): Promise<BusinessMetrics> {
  const [allTxns, customers, memberships, settings] = await Promise.all([
    db.transactions.where('createdAt').between(sinceMs, untilMs, true, true).toArray(),
    db.customers.toArray(),
    db.washMemberships.toArray(),
    getSettings()
  ]);

  const completed = allTxns.filter(t => t.status === 'completed');
  const voided = allTxns.filter(t => t.status === 'voided');

  const byPaymentMethod = { cash_usd: 0, ecocash: 0, card: 0 };
  for (const t of completed) {
    if (t.paymentMethod in byPaymentMethod) {
      byPaymentMethod[t.paymentMethod] += t.amount;
    }
  }

  const revenue = Math.round(completed.reduce((s, t) => s + t.amount, 0) * 100) / 100;

  const newCustomers = customers.filter(c => c.createdAt >= sinceMs && c.createdAt <= untilMs).length;

  // Repeat rate across all history, not just the window — a window shorter than
  // the visit gap would report near-zero repeat and read as a collapse.
  const visitCounts = new Map<string, number>();
  const everyCompleted = await db.transactions.filter(t => t.status === 'completed').toArray();
  for (const t of everyCompleted) {
    if (t.customerId) visitCounts.set(t.customerId, (visitCounts.get(t.customerId) ?? 0) + 1);
  }
  const withVisits = [...visitCounts.values()];
  const repeatRate = withVisits.length
    ? withVisits.filter(v => v > 1).length / withVisits.length
    : 0;

  const returningIds = new Set(
    [...visitCounts.entries()].filter(([, v]) => v > 1).map(([id]) => id)
  );
  const returningCustomerRevenue = Math.round(
    completed.filter(t => t.customerId && returningIds.has(t.customerId))
      .reduce((s, t) => s + t.amount, 0) * 100
  ) / 100;

  const now = Date.now();
  const active = memberships.filter(m => m.tier !== 'none' && (m.expiry === null || m.expiry > now));
  const membershipMrr = active.reduce((sum, m) => {
    const plan = settings.membershipPlans.find(p => p.tier === m.tier);
    const service = plan ? settings.services.find(s => s.id === plan.id) : undefined;
    if (!plan || !service) return sum;
    // Normalise whatever the plan period is onto a 30-day month.
    return sum + (service.price * (30 / plan.durationDays));
  }, 0);

  const outstandingPoints = customers.reduce((s, c) => s + Math.max(0, c.pointsBalance || 0), 0);
  const pointsLiabilityUsd = settings.redemptionRate > 0
    ? Math.round((outstandingPoints / settings.redemptionRate) * 100) / 100
    : 0;

  return {
    revenue,
    transactionCount: completed.length,
    averageTicket: completed.length ? Math.round((revenue / completed.length) * 100) / 100 : 0,
    byPaymentMethod,
    newCustomers,
    returningCustomerRevenue,
    repeatRate,
    activeMemberships: active.length,
    membershipMrr: Math.round(membershipMrr * 100) / 100,
    pointsLiabilityUsd,
    voidedCount: voided.length,
    voidedValue: Math.round(voided.reduce((s, t) => s + t.amount, 0) * 100) / 100
  };
}

/** Revenue per day across a window, for the trend chart. */
export async function dailyRevenue(days: number): Promise<{ date: string; amount: number; visits: number }[]> {
  const since = Date.now() - days * DAY;
  const txns = await db.transactions
    .where('createdAt').aboveOrEqual(since)
    .filter(t => t.status === 'completed')
    .toArray();

  const buckets = new Map<string, { amount: number; visits: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY);
    buckets.set(`${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`, { amount: 0, visits: 0 });
  }

  for (const t of txns) {
    const d = new Date(t.createdAt);
    const key = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.amount = Math.round((bucket.amount + t.amount) * 100) / 100;
      bucket.visits += 1;
    }
  }

  return [...buckets.entries()].map(([date, v]) => ({ date, ...v }));
}

// ---------------------------------------------------------------------------
// Outreach copy
//
// Written to be sent by a person from their own WhatsApp, so they read like a
// person: short, specific, no marketing voice, and each one gives a concrete
// reason to come back rather than just asking.
// ---------------------------------------------------------------------------

export function winBackMessage(i: CustomerInsight, pointsBalance: number): string {
  const car = i.customer.vehicles?.[0]?.makeModel;
  const opening = car
    ? `Hi ${i.customer.name}, it's Mali Wash in Ruwa — haven't seen the ${car} in a while!`
    : `Hi ${i.customer.name}, it's Mali Wash in Ruwa — haven't seen you in a while!`;

  const points = pointsBalance > 0
    ? `\n\nYou've still got ${pointsBalance} AutoPoints waiting on your account.`
    : '';

  return `${opening}${points}\n\nCome through this week and we'll look after you.`;
}

export function renewalMessage(i: CustomerInsight): string {
  const days = i.membership?.expiry
    ? Math.max(0, Math.ceil((i.membership.expiry - Date.now()) / DAY))
    : 0;
  const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
  return `Hi ${i.customer.name}, your Mali Wash membership expires ${when}. Want me to renew it next time you're in? Takes a minute and you keep your free washes running.`;
}

export function referralAskMessage(i: CustomerInsight, code: string, reward: number): string {
  return [
    `Hi ${i.customer.name}, thanks for being one of our regulars at Mali Wash — that's ${i.visits} washes now!`,
    ``,
    `If you know anyone who'd use us, here's my code: ${code}`,
    `They mention it on their first wash and you get ${reward} AutoPoints.`
  ].join('\n');
}

export function membershipPitchMessage(i: CustomerInsight, planName: string, price: number, saving: number): string {
  return [
    `Hi ${i.customer.name}, you've been in ${i.visits} times — at that rate our ${planName} would save you about $${saving.toFixed(2)} a month.`,
    ``,
    `It's $${price.toFixed(2)}/month. Want me to set it up next time you're through?`
  ].join('\n');
}
