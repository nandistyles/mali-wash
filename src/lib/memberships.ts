import { v4 as uuidv4 } from 'uuid';
import { db, getSettings } from './db';
import type { MembershipPlan, WashMembership } from '../types';

/**
 * Wash memberships — a spoke-only concern (spec 3.6).
 *
 * Previously membership was inferred from a 'wash_member' string in the shared
 * customer's tags array. That had three problems: nothing ever set the tag, so
 * paying $18 for a membership granted nothing; the tag had no expiry, so a
 * member kept free washes forever; and it covered every wash type, so a basic
 * member got the $15 premium detail free. A membership is now a dated record
 * pointing at a plan that names exactly what it covers.
 */

export async function getActiveMembership(customerId: string): Promise<WashMembership | null> {
  const now = Date.now();
  const memberships = await db.washMemberships.where('customerId').equals(customerId).toArray();

  const active = memberships
    .filter(m => m.tier !== 'none' && (m.expiry === null || m.expiry > now))
    .sort((a, b) => (b.expiry ?? Infinity) - (a.expiry ?? Infinity));

  return active[0] ?? null;
}

export async function getPlanForMembership(membership: WashMembership | null): Promise<MembershipPlan | null> {
  if (!membership) return null;
  const settings = await getSettings();
  return settings.membershipPlans.find(p => p.tier === membership.tier) ?? null;
}

/** Which service ids this customer currently gets free, and how many remain. */
export async function getMembershipEntitlement(customerId: string | null | undefined): Promise<{
  membership: WashMembership | null;
  plan: MembershipPlan | null;
  coveredServiceIds: string[];
  washesRemaining: number | null; // null = unlimited
}> {
  const empty = { membership: null, plan: null, coveredServiceIds: [], washesRemaining: null };
  if (!customerId) return empty;

  const membership = await getActiveMembership(customerId);
  if (!membership) return empty;

  const plan = await getPlanForMembership(membership);
  if (!plan) return { membership, plan: null, coveredServiceIds: [], washesRemaining: null };

  let washesRemaining: number | null = null;
  if (plan.washesPerPeriod !== null) {
    const used = await countCoveredWashesInPeriod(customerId, membership);
    washesRemaining = Math.max(0, plan.washesPerPeriod - used);
  }

  return {
    membership,
    plan,
    coveredServiceIds: washesRemaining === 0 ? [] : plan.coveredServiceIds,
    washesRemaining
  };
}

/**
 * How many covered washes this customer has already taken in the current
 * membership period. Counted from the transaction ledger rather than a counter
 * on the membership, so it stays correct even if a sale syncs in late from
 * another device.
 */
export async function countCoveredWashesInPeriod(
  customerId: string,
  membership: WashMembership
): Promise<number> {
  const transactions = await db.transactions
    .where('customerId').equals(customerId)
    .filter(t =>
      t.status === 'completed' &&
      t.createdAt >= membership.startedAt &&
      (membership.expiry === null || t.createdAt <= membership.expiry)
    )
    .toArray();

  return transactions.reduce(
    (sum, t) => sum + (Number(t.businessMeta?.coveredWashCount) || 0),
    0
  );
}

/**
 * Sell a membership. Extends an existing active membership of the same tier
 * rather than stacking a second record, so renewing early does not lose the
 * remaining days.
 */
export async function grantMembership(
  customerId: string,
  planId: string,
  transactionId: string
): Promise<WashMembership | null> {
  const settings = await getSettings();
  const plan = settings.membershipPlans.find(p => p.id === planId);
  if (!plan) return null;

  const now = Date.now();
  const durationMs = plan.durationDays * 24 * 60 * 60 * 1000;
  const existing = await getActiveMembership(customerId);

  if (existing && existing.tier === plan.tier) {
    const base = existing.expiry && existing.expiry > now ? existing.expiry : now;
    const extended = { ...existing, expiry: base + durationMs, syncStatus: 'pending_sync' as const };
    await db.washMemberships.put(extended);
    return extended;
  }

  const membership: WashMembership = {
    id: uuidv4(),
    customerId,
    tier: plan.tier,
    startedAt: now,
    expiry: now + durationMs,
    sourceTransactionId: transactionId,
    syncStatus: 'pending_sync'
  };

  await db.washMemberships.add(membership);
  return membership;
}

export function describeMembership(membership: WashMembership | null): string {
  if (!membership) return 'None';
  const label = membership.tier === 'premium_member' ? 'Premium' : 'Basic';
  if (membership.expiry === null) return `${label} (no expiry)`;
  return `${label} · expires ${new Date(membership.expiry).toLocaleDateString('en-GB')}`;
}
