import { v4 as uuidv4 } from 'uuid';
import { db, getSettings } from './db';
import { award, redeem, calculateEarnedPoints, maxRedeemable, pointsToUsd } from './points';
import { getMembershipEntitlement, grantMembership } from './memberships';
import { maybeAwardReferralReward } from './customers';
import type { Customer, LineItem, PaymentMethod, Transaction, WashService } from '../types';

/**
 * The sale service. Every money event in the wash goes through here.
 *
 * The POS used to inline all of this. That produced four defects worth naming:
 * membership covered any service of type 'wash', so a $18 basic member got the
 * $15 premium detail free; points were awarded only when amount > 0, so a
 * member — the most loyal customer — earned nothing; the transaction, the
 * ledger entry and the balance update were three separate awaits, so a crash
 * between them left the books inconsistent; and referral rewards were never
 * paid at all because nothing called them.
 */

export interface CartItem {
  service: WashService;
  qty: number;
}

export interface SaleLine {
  service: WashService;
  qty: number;
  coveredQty: number;
  chargedQty: number;
  fullTotal: number;
  chargedTotal: number;
}

export interface SalePreview {
  lines: SaleLine[];
  subtotal: number;
  membershipDiscount: number;
  pointsRedeemed: number;
  pointsDiscountUsd: number;
  total: number;
  pointsEarned: number;
  coveredWashCount: number;
  washCount: number;
  membershipLabel: string | null;
  washesRemaining: number | null;
  maxRedeemablePoints: number;
  maxRedeemableUsd: number;
  redeemBlockedReason: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Price a cart without writing anything. The POS renders directly from this so
 * what the attendant reads on screen is computed by the same code that will
 * later commit the sale — the two can never disagree.
 */
export async function previewSale(opts: {
  cart: CartItem[];
  customer?: Customer | null;
  requestedRedeemPoints?: number;
}): Promise<SalePreview> {
  const { cart, customer } = opts;

  const entitlement = await getMembershipEntitlement(customer?.id);
  let coverageBudget = entitlement.washesRemaining; // null = unlimited

  const lines: SaleLine[] = cart.map(item => {
    const covered = entitlement.coveredServiceIds.includes(item.service.id);

    let coveredQty = 0;
    if (covered) {
      if (coverageBudget === null) {
        coveredQty = item.qty;
      } else {
        coveredQty = Math.min(item.qty, coverageBudget);
        coverageBudget -= coveredQty;
      }
    }

    const chargedQty = item.qty - coveredQty;
    return {
      service: item.service,
      qty: item.qty,
      coveredQty,
      chargedQty,
      fullTotal: round2(item.service.price * item.qty),
      chargedTotal: round2(item.service.price * chargedQty)
    };
  });

  const subtotal = round2(lines.reduce((s, l) => s + l.fullTotal, 0));
  const membershipDiscount = round2(subtotal - lines.reduce((s, l) => s + l.chargedTotal, 0));
  const afterMembership = round2(subtotal - membershipDiscount);

  // Points redemption, capped by balance, by the bill, and by the floor in settings.
  const balance = customer?.pointsBalance ?? 0;
  const cap = customer
    ? await maxRedeemable(balance, afterMembership)
    : { points: 0, usd: 0, reason: null as string | null };

  const requested = Math.max(0, Math.floor(opts.requestedRedeemPoints ?? 0));
  const pointsRedeemed = Math.min(requested, cap.points);
  const pointsDiscountUsd = round2(Math.min(await pointsToUsd(pointsRedeemed), afterMembership));

  const total = round2(afterMembership - pointsDiscountUsd);

  // A wash is a wash whether the member paid for it or not, so the flat
  // per-wash bonus counts covered washes too.
  const washCount = lines
    .filter(l => l.service.type === 'wash')
    .reduce((s, l) => s + l.qty, 0);
  const coveredWashCount = lines
    .filter(l => l.service.type === 'wash')
    .reduce((s, l) => s + l.coveredQty, 0);

  const pointsEarned = customer
    ? await calculateEarnedPoints({ amount: total, washLineCount: washCount })
    : 0;

  return {
    lines,
    subtotal,
    membershipDiscount,
    pointsRedeemed,
    pointsDiscountUsd,
    total,
    pointsEarned,
    coveredWashCount,
    washCount,
    membershipLabel: entitlement.membership
      ? (entitlement.membership.tier === 'premium_member' ? 'Premium' : 'Basic')
      : null,
    washesRemaining: entitlement.washesRemaining,
    maxRedeemablePoints: cap.points,
    maxRedeemableUsd: cap.usd,
    redeemBlockedReason: cap.reason
  };
}

export interface CommitSaleInput {
  cart: CartItem[];
  customer?: Customer | null;
  anonymousPhone?: string | null;
  staffId: string;
  shiftId: string;
  paymentMethod: PaymentMethod;
  redeemPoints?: number;
}

export interface CommitSaleResult {
  transaction: Transaction;
  preview: SalePreview;
  referralPaid: boolean;
  membershipGranted: boolean;
}

/**
 * Commit a sale. Everything — the transaction, the points movements, any
 * membership granted, any referral payout — happens inside one Dexie
 * transaction, so the books are never left half-written by a crash or a
 * refresh mid-sale.
 */
export async function commitSale(input: CommitSaleInput): Promise<CommitSaleResult> {
  if (input.cart.length === 0) throw new Error('Cart is empty');
  if (!input.staffId) throw new Error('No staff member is signed in');
  if (!input.shiftId) throw new Error('No shift is open — open a shift before taking money');

  return db.transaction(
    'rw',
    [db.transactions, db.customers, db.pointsLedger, db.washMemberships, db.referralRedemptions, db.settings],
    async () => {
      // Re-price inside the transaction: the on-screen preview may be stale if
      // another device synced a membership or a points change in the meantime.
      const preview = await previewSale({
        cart: input.cart,
        customer: input.customer,
        requestedRedeemPoints: input.redeemPoints
      });

      const transactionId = uuidv4();
      const now = Date.now();

      const lineItems: LineItem[] = preview.lines.map(l => ({
        description: l.coveredQty > 0
          ? `${l.service.name} (${l.coveredQty} covered by membership)`
          : l.service.name,
        qty: l.qty,
        unitPrice: l.service.price,
        total: l.chargedTotal
      }));

      if (preview.pointsDiscountUsd > 0) {
        lineItems.push({
          description: `AutoPoints redeemed (${preview.pointsRedeemed} pts)`,
          qty: 1,
          unitPrice: -preview.pointsDiscountUsd,
          total: -preview.pointsDiscountUsd
        });
      }

      const transaction: Transaction = {
        id: transactionId,
        business: 'wash',
        customerId: input.customer?.id ?? null,
        customerPhone: input.customer?.phone ?? input.anonymousPhone ?? null,
        lineItems,
        amount: preview.total,
        paymentMethod: input.paymentMethod,
        pointsEarned: preview.pointsEarned,
        pointsRedeemed: preview.pointsRedeemed,
        staffId: input.staffId,
        shiftId: input.shiftId,
        status: 'completed',
        businessMeta: {
          serviceType: input.cart[0]?.service.id ?? 'mixed',
          serviceIds: input.cart.map(i => i.service.id),
          subtotal: preview.subtotal,
          membershipDiscount: preview.membershipDiscount,
          // Read back by the membership cap, so it must be on the record itself.
          coveredWashCount: preview.coveredWashCount,
          washCount: preview.washCount
        },
        createdAt: now,
        syncStatus: 'pending_sync'
      };

      await db.transactions.add(transaction);

      let referralPaid = false;
      let membershipGranted = false;

      if (input.customer) {
        if (preview.pointsRedeemed > 0) {
          await redeem(input.customer.id, 'wash', preview.pointsRedeemed, 'Redeemed against wash', transactionId);
        }
        if (preview.pointsEarned > 0) {
          await award(input.customer.id, 'wash', preview.pointsEarned, 'Wash purchase', transactionId);
        }

        // Selling a membership actually grants it now.
        const settings = await getSettings();
        for (const item of input.cart) {
          const plan = settings.membershipPlans.find(p => p.id === item.service.id);
          if (plan) {
            await grantMembership(input.customer.id, plan.id, transactionId);
            membershipGranted = true;
          }
        }

        if (preview.total > 0) {
          const redemption = await maybeAwardReferralReward(input.customer.id, 'wash', transactionId);
          referralPaid = redemption !== null;
        }
      }

      return { transaction, preview, referralPaid, membershipGranted };
    }
  );
}

/**
 * Void a sale and reverse its points. The ledger is append-only, so the reversal
 * is a compensating adjustment rather than a deletion — the history of what
 * happened stays readable.
 */
export async function voidTransaction(transactionId: string, reason: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.transactions, db.customers, db.pointsLedger, db.settings],
    async () => {
      const txn = await db.transactions.get(transactionId);
      if (!txn) throw new Error('Transaction not found');
      if (txn.status === 'voided') return;

      if (txn.customerId) {
        // Give back what was spent, take back what was earned.
        if (txn.pointsRedeemed > 0) {
          await award(txn.customerId, txn.business, txn.pointsRedeemed,
            `Refund of points redeemed on voided sale — ${reason}`, transactionId, 'adjustment');
        }
        if (txn.pointsEarned > 0) {
          const customer = await db.customers.get(txn.customerId);
          // Never drive a balance negative on a void; clamp instead.
          const reversible = Math.min(txn.pointsEarned, customer?.pointsBalance ?? 0);
          if (reversible > 0) {
            await redeem(txn.customerId, txn.business, reversible,
              `Reversal of points earned on voided sale — ${reason}`, transactionId);
          }
        }
      }

      await db.transactions.update(transactionId, {
        status: 'voided',
        businessMeta: { ...txn.businessMeta, voidReason: reason, voidedAt: Date.now() },
        syncStatus: 'pending_sync'
      });
    }
  );
}
