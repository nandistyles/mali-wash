import { v4 as uuidv4 } from 'uuid';
import { db, getSettings } from './db';
import type { BusinessUnit, PointsLedgerEntry } from '../types';

/**
 * The AutoPoints engine (platform spec 4.4).
 *
 * Every business calls award()/redeem() — no business implements its own points
 * maths. The pointsLedger is append-only and authoritative; Customer.pointsBalance
 * is only a cached total, so the two are always written inside one Dexie
 * transaction. A crash between them previously left the balance diverged from
 * the ledger with no way to tell which was right.
 */

type LedgerType = PointsLedgerEntry['type'];

async function writeEntry(
  customerId: string,
  business: BusinessUnit,
  type: LedgerType,
  points: number,
  reason: string,
  transactionId?: string | null
): Promise<PointsLedgerEntry> {
  const entry: PointsLedgerEntry = {
    id: uuidv4(),
    customerId,
    business,
    type,
    points,
    transactionId: transactionId ?? null,
    reason,
    createdAt: Date.now(),
    syncStatus: 'pending_sync'
  };

  await db.transaction('rw', db.pointsLedger, db.customers, async () => {
    const customer = await db.customers.get(customerId);
    if (!customer) throw new Error(`Cannot move points: customer ${customerId} not found`);

    const nextBalance = (customer.pointsBalance || 0) + points;
    if (nextBalance < 0) {
      throw new Error('Insufficient points balance');
    }

    await db.pointsLedger.add(entry);
    await db.customers.update(customerId, {
      pointsBalance: nextBalance,
      updatedAt: Date.now(),
      syncStatus: 'pending_sync'
    });
  });

  return entry;
}

/** Grant points. `points` must be positive. */
export async function award(
  customerId: string,
  business: BusinessUnit,
  points: number,
  reason: string,
  transactionId?: string | null,
  type: LedgerType = 'earn'
): Promise<PointsLedgerEntry | null> {
  if (points <= 0) return null;
  return writeEntry(customerId, business, type, Math.round(points), reason, transactionId);
}

/**
 * Spend points. `points` is passed positive and stored negative, matching the
 * spec's "positive for earn, negative for redeem".
 */
export async function redeem(
  customerId: string,
  business: BusinessUnit,
  points: number,
  reason: string,
  transactionId?: string | null
): Promise<PointsLedgerEntry | null> {
  if (points <= 0) return null;
  return writeEntry(customerId, business, 'redeem', -Math.round(points), reason, transactionId);
}

/** Manual correction by a supervisor. Can be positive or negative. */
export async function adjust(
  customerId: string,
  business: BusinessUnit,
  points: number,
  reason: string
): Promise<PointsLedgerEntry | null> {
  if (points === 0) return null;
  return writeEntry(customerId, business, 'adjustment', Math.round(points), reason, null);
}

/**
 * Recompute the cached balance from the ledger. The ledger wins — this is the
 * repair path if a balance ever drifts (e.g. a record synced from a device
 * running an older build).
 */
export async function recomputeBalance(customerId: string): Promise<number> {
  return db.transaction('rw', db.pointsLedger, db.customers, async () => {
    const entries = await db.pointsLedger.where('customerId').equals(customerId).toArray();
    const total = entries.reduce((sum, e) => sum + e.points, 0);
    await db.customers.update(customerId, {
      pointsBalance: total,
      updatedAt: Date.now(),
      syncStatus: 'pending_sync'
    });
    return total;
  });
}

// ---------------------------------------------------------------------------
// Earn / redemption rules — configurable in Settings, never hardcoded at a
// call site. The POS asks these functions; it does not do the arithmetic.
// ---------------------------------------------------------------------------

/**
 * Points earned by a sale.
 *
 * The flat per-wash bonus is awarded per wash line item (respecting quantity),
 * not once per transaction, and it applies even when the amount is $0 because
 * a membership covered the wash — otherwise members, the most loyal customers,
 * would earn nothing.
 */
export async function calculateEarnedPoints(opts: {
  amount: number;
  washLineCount: number;
}): Promise<number> {
  const settings = await getSettings();
  const fromSpend = Math.floor(Math.max(0, opts.amount) * settings.pointsPerDollar);
  const fromWashes = Math.max(0, opts.washLineCount) * settings.pointsPerWash;
  return fromSpend + fromWashes;
}

/** Cash value of a points balance, in USD. */
export async function pointsToUsd(points: number): Promise<number> {
  const settings = await getSettings();
  if (settings.redemptionRate <= 0) return 0;
  return Math.floor((points / settings.redemptionRate) * 100) / 100;
}

/** Points needed to cover a USD amount. */
export async function usdToPoints(usd: number): Promise<number> {
  const settings = await getSettings();
  return Math.ceil(usd * settings.redemptionRate);
}

/**
 * The most a customer may redeem against this sale: capped by their balance,
 * by the sale total, and by the minimum-redemption floor.
 */
export async function maxRedeemable(balance: number, saleTotal: number): Promise<{
  points: number;
  usd: number;
  reason: string | null;
}> {
  const settings = await getSettings();

  if (balance < settings.minRedeemablePoints) {
    return {
      points: 0,
      usd: 0,
      reason: `Needs at least ${settings.minRedeemablePoints} points to redeem`
    };
  }
  if (saleTotal <= 0) {
    return { points: 0, usd: 0, reason: 'Nothing to pay' };
  }

  const balanceValue = await pointsToUsd(balance);
  const usd = Math.min(balanceValue, saleTotal);
  const points = await usdToPoints(usd);

  return { points: Math.min(points, balance), usd, reason: null };
}
