export type Role = "attendant" | "supervisor" | "admin";
export type PaymentMethod = "cash_usd" | "ecocash" | "card";
export type TransactionStatus = "completed" | "voided";
export type ShiftStatus = "open" | "closed";
export type BookingStatus = "pending" | "confirmed" | "done";
export type SyncStatus = "synced" | "pending_sync" | "error";
export type BusinessUnit = "wash" | "parts" | "drive" | "track";
export type MembershipTier = "none" | "basic_member" | "premium_member";

// ---------------------------------------------------------------------------
// SHARED HUB RECORDS
// These match section 3 of the Mali Platform Architecture spec and are written
// by every Mali business. Change them here and every spoke inherits the change.
// ---------------------------------------------------------------------------

export interface Vehicle {
  reg: string;
  makeModel: string;
}

export interface Customer {
  id: string; // uuid
  name: string;
  phone: string; // always normalised to +263XXXXXXXXX
  vehicles: Vehicle[];
  pointsBalance: number; // cached total; pointsLedger is the source of truth
  referralCode: string;
  referredByCode?: string | null;
  tags: string[];
  createdByBusiness: BusinessUnit;
  createdAt: number;
  updatedAt: number;
  syncStatus?: SyncStatus; // local only, stripped before sync
}

export interface LineItem {
  description: string;
  qty: number;
  unitPrice: number;
  total: number;
}

export interface Transaction {
  id: string;
  business: BusinessUnit;
  customerId?: string | null;
  customerPhone?: string | null;
  lineItems: LineItem[];
  amount: number;
  paymentMethod: PaymentMethod;
  pointsEarned: number;
  pointsRedeemed: number;
  staffId: string;
  shiftId?: string | null;
  status: TransactionStatus;
  businessMeta: Record<string, any>;
  createdAt: number;
  syncStatus?: SyncStatus;
}

export interface PointsLedgerEntry {
  id: string;
  customerId: string;
  business: BusinessUnit;
  type: "earn" | "redeem" | "referral_reward" | "adjustment";
  points: number; // positive for earn, negative for redeem
  transactionId?: string | null;
  reason: string;
  createdAt: number;
  syncStatus?: SyncStatus;
}

export interface ReferralRedemption {
  id: string;
  referrerId: string;
  refereeId: string;
  business: BusinessUnit;
  rewardPoints: number;
  createdAt: number;
  syncStatus?: SyncStatus;
}

export interface Staff {
  id: string; // equals the Firebase Auth uid
  name: string;
  email?: string | null;
  role: Role;
  businesses: BusinessUnit[];
  active: boolean;
  pin?: string;
  syncStatus?: SyncStatus;
}

// ---------------------------------------------------------------------------
// WASH-SPECIFIC RECORDS
// These stay in the spoke and are never read by another Mali business.
// ---------------------------------------------------------------------------

export interface WashMembership {
  id: string;
  customerId: string;
  tier: MembershipTier;
  startedAt: number;
  expiry: number | null; // null = never expires
  sourceTransactionId?: string | null;
  syncStatus?: SyncStatus;
}

export interface Shift {
  id: string;
  staffId: string;
  openedAt: number;
  closedAt?: number | null;
  openingFloat: number;
  expectedCash: number;
  expectedEcocash: number;
  expectedCard: number;
  countedCash?: number | null;
  variance?: number | null;
  status: ShiftStatus;
  syncStatus?: SyncStatus;
}

export interface Booking {
  id: string;
  name: string;
  phone: string;
  vehicle: string;
  serviceType: string;
  requestedTime: number;
  status: BookingStatus;
  createdAt: number;
  syncStatus?: SyncStatus;
}

export interface WashService {
  id: string;
  name: string;
  price: number;
  type: "wash" | "membership" | "fleet";
}

/**
 * What a membership actually buys. Previously membership was a bare flag, which
 * meant an $18 basic member got $15 premium details free and the benefit never
 * expired. A plan now names exactly which services it covers and for how long.
 */
export interface MembershipPlan {
  id: string; // matches the WashService id that sells this plan
  tier: MembershipTier;
  durationDays: number;
  coveredServiceIds: string[];
  washesPerPeriod: number | null; // null = unlimited
}

export interface Settings {
  id: string; // 'global'
  services: WashService[];
  membershipPlans: MembershipPlan[];
  /** AutoPoints earned per $1 spent, in any business. */
  pointsPerDollar: number;
  /** Flat bonus points per wash, on top of the per-dollar rate. */
  pointsPerWash: number;
  /** Points a referrer receives when their referee first pays. */
  referralRewardPoints: number;
  /** How many points buy $1 of redemption value. */
  redemptionRate: number;
  /** Minimum points before a customer may redeem at all. */
  minRedeemablePoints: number;
  syncStatus?: SyncStatus;
}
