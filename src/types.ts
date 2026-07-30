export type Role = "attendant" | "supervisor" | "admin";
export type PaymentMethod = "cash_usd" | "ecocash" | "card";
export type TransactionStatus = "completed" | "voided";
export type ShiftStatus = "open" | "closed";
export type BookingStatus = "pending" | "confirmed" | "done";
export type SyncStatus = "synced" | "pending_sync" | "error";
export type BusinessUnit = "wash" | "parts" | "drive" | "track";

export interface Vehicle {
  reg: string;
  makeModel: string;
}

export interface Customer {
  id: string; // uuid
  name: string;
  phone: string;
  vehicles: Vehicle[];
  pointsBalance: number;
  referralCode: string;
  referredByCode?: string | null;
  tags: string[];
  createdByBusiness: BusinessUnit;
  createdAt: number;
  updatedAt: number;
  syncStatus?: SyncStatus; // local only
}

export interface WashMembership {
  id: string;
  customerId: string;
  tier: "none" | "basic_member" | "premium_member";
  expiry: number | null;
  syncStatus?: SyncStatus;
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
  points: number;
  transactionId?: string | null;
  reason: string;
  createdAt: number;
  syncStatus?: SyncStatus;
}

export interface Staff {
  id: string;
  name: string;
  role: Role;
  businesses: BusinessUnit[];
  active: boolean;
  pin?: string;
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

export interface ReferralRedemption {
  id: string;
  referrerId: string;
  refereeId: string;
  business: BusinessUnit;
  rewardPoints: number;
  createdAt: number;
  syncStatus?: SyncStatus;
}

export interface Booking {
  id: string;
  name: string;
  phone: string;
  vehicle: string;
  serviceType: string;
  requestedTime: number; // timestamp
  status: BookingStatus;
  createdAt: number;
  syncStatus?: SyncStatus;
}

export interface Settings {
  id: string; // 'global'
  services: {
    id: string;
    name: string;
    price: number;
    type: "wash" | "membership" | "fleet";
  }[];
  pointsPerWash: number;
  referralRewardPoints: number;
  syncStatus?: SyncStatus;
}
