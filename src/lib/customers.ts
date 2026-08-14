import { v4 as uuidv4 } from 'uuid';
import { db, getSettings } from './db';
import { normalisePhone, searchPrefix, normaliseReg } from './phone';
import { award } from './points';
import type { BusinessUnit, Customer, ReferralRedemption, Vehicle } from '../types';

/**
 * Shared customer service (platform spec 4.5): lookup, create, de-duplicate.
 *
 * Phone is the primary key across the whole group, so every path in and out of
 * this module normalises it. Two businesses onboarding the same number must
 * resolve to one customer, not two.
 */

const REFERRAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1

/**
 * Generate a referral code that is not already in use. The previous version
 * generated 4 characters and never checked, so collisions became likely at a
 * few thousand customers — and a collision silently misdirects referral rewards.
 */
export async function generateUniqueReferralCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    let suffix = '';
    for (let i = 0; i < 5; i++) {
      suffix += REFERRAL_ALPHABET.charAt(Math.floor(Math.random() * REFERRAL_ALPHABET.length));
    }
    const code = `MALI-${suffix}`;
    const existing = await db.customers.where('referralCode').equals(code).first();
    if (!existing) return code;
  }
  // Astronomically unlikely; fall back to something guaranteed unique.
  return `MALI-${uuidv4().slice(0, 8).toUpperCase()}`;
}

/** Exact lookup by phone, in any spelling. */
export async function findByPhone(phone: string): Promise<Customer | undefined> {
  const normalised = normalisePhone(phone);
  if (!normalised) return undefined;
  return db.customers.where('phone').equals(normalised).first();
}

export async function findByReferralCode(code: string): Promise<Customer | undefined> {
  const trimmed = (code || '').trim().toUpperCase();
  if (!trimmed) return undefined;
  return db.customers.where('referralCode').equals(trimmed).first();
}

/**
 * Search by phone, name, or vehicle registration.
 *
 * Reg search is a filtered scan rather than an index: registrations live inside
 * the shared `vehicles` array, and denormalising them onto the customer purely
 * to satisfy Dexie would add a non-spec field to the hub record. At this
 * business's scale a scan is cheap; revisit if the customer table passes ~20k.
 */
export async function searchCustomers(term: string, limit = 50): Promise<Customer[]> {
  const trimmed = (term || '').trim();
  if (trimmed.length < 2) {
    return db.customers.limit(limit).toArray();
  }

  const byPhone = await db.customers
    .where('phone').startsWith(searchPrefix(trimmed))
    .limit(limit).toArray();

  const byName = await db.customers
    .where('name').startsWithIgnoreCase(trimmed)
    .limit(limit).toArray();

  const reg = normaliseReg(trimmed);
  const byReg = reg.length >= 2
    ? await db.customers
        .filter(c => (c.vehicles || []).some(v => normaliseReg(v.reg).includes(reg)))
        .limit(limit).toArray()
    : [];

  const seen = new Set<string>();
  return [...byPhone, ...byName, ...byReg]
    .filter(c => (seen.has(c.id) ? false : (seen.add(c.id), true)))
    .slice(0, limit);
}

export interface NewCustomerInput {
  name: string;
  phone: string;
  vehicles?: Vehicle[];
  referredByCode?: string | null;
  tags?: string[];
}

function customerIdForPhone(phone: string): string {
  return `customer_${phone.replace(/\D/g, '')}`;
}

function stableReferralCode(customerId: string): string {
  // FNV-1a gives every device the same compact code for the same customer.
  // Eight base-32 characters make accidental collisions vanishingly unlikely
  // while keeping the code easy to read over WhatsApp or at the counter.
  let hash = 0x811c9dc5;
  for (const char of customerId) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  let value = hash;
  let suffix = '';
  for (let i = 0; i < 8; i++) {
    suffix += REFERRAL_ALPHABET[value % REFERRAL_ALPHABET.length];
    value = Math.floor(value / REFERRAL_ALPHABET.length) ^ Math.imul(hash, i + 17);
    value >>>= 0;
  }
  return `MALI-${suffix}`;
}

/**
 * Create a customer, or return the existing one if the phone is already known.
 * `created` tells the caller which happened so the UI can say so rather than
 * silently attaching the sale to someone else's record.
 */
export async function findOrCreateCustomer(
  input: NewCustomerInput,
  business: BusinessUnit = 'wash'
): Promise<{ customer: Customer; created: boolean }> {
  const phone = normalisePhone(input.phone);
  if (!phone) throw new Error('Enter a valid Zimbabwean phone number');

  const existing = await db.customers.where('phone').equals(phone).first();
  if (existing) return { customer: existing, created: false };

  const referredByCode = input.referredByCode?.trim().toUpperCase() || null;
  const customer: Customer = {
    // A deterministic phone-backed id prevents two offline devices from
    // creating two Firestore documents for the same person.
    id: customerIdForPhone(phone),
    name: input.name.trim(),
    phone,
    vehicles: (input.vehicles || []).filter(v => v.reg || v.makeModel),
    pointsBalance: 0,
    referralCode: stableReferralCode(customerIdForPhone(phone)),
    referredByCode,
    tags: input.tags || [],
    createdByBusiness: business,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    syncStatus: 'pending_sync'
  };

  try {
    await db.customers.add(customer);
    return { customer, created: true };
  } catch (error) {
    // Two tabs can still race between the lookup and add. The deterministic id
    // turns that race into a harmless read of the winner.
    const winner = await db.customers.get(customer.id);
    if (winner) return { customer: winner, created: false };
    throw error;
  }
}

export async function addVehicle(customerId: string, vehicle: Vehicle): Promise<void> {
  const customer = await db.customers.get(customerId);
  if (!customer) return;

  const reg = normaliseReg(vehicle.reg);
  const already = (customer.vehicles || []).some(v => reg && normaliseReg(v.reg) === reg);
  if (already) return;

  await db.customers.update(customerId, {
    vehicles: [...(customer.vehicles || []), vehicle],
    updatedAt: Date.now(),
    syncStatus: 'pending_sync'
  });
}

/**
 * Fire the referral reward on the referee's first paid transaction, in any
 * business (spec 3.4). Idempotent: a second call for the same referee is a
 * no-op, so a re-sync or a double-tap cannot pay the referrer twice.
 *
 * Returns the reward granted, or null if nothing was owed.
 */
export async function maybeAwardReferralReward(
  customerId: string,
  business: BusinessUnit,
  transactionId: string
): Promise<ReferralRedemption | null> {
  const customer = await db.customers.get(customerId);
  if (!customer?.referredByCode) return null;

  // Already paid out for this referee?
  const existing = await db.referralRedemptions.where('refereeId').equals(customerId).first();
  if (existing) return null;

  // Only on the FIRST paid transaction.
  const paidCount = await db.transactions
    .where('customerId').equals(customerId)
    .filter(t => t.status === 'completed' && t.amount > 0)
    .count();
  if (paidCount > 1) return null;

  const referrer = await findByReferralCode(customer.referredByCode);
  if (!referrer || referrer.id === customerId) return null;

  const settings = await getSettings();
  const rewardPoints = settings.referralRewardPoints;
  if (rewardPoints <= 0) return null;

  const redemption: ReferralRedemption = {
    // One deterministic document per referee makes the reward idempotent even
    // when their first purchase is recorded on two devices before either syncs.
    id: `referral_${customerId}`,
    referrerId: referrer.id,
    refereeId: customerId,
    business,
    rewardPoints,
    createdAt: Date.now(),
    syncStatus: 'pending_sync'
  };

  try {
    await db.referralRedemptions.add(redemption);
  } catch (error) {
    const winner = await db.referralRedemptions.get(redemption.id);
    if (winner) return null;
    throw error;
  }
  await award(
    referrer.id,
    business,
    rewardPoints,
    `Referral reward — ${customer.name} made their first purchase`,
    transactionId,
    'referral_reward'
  );

  return redemption;
}
