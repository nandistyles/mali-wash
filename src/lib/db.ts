import Dexie, { type Table } from 'dexie';
import type { Customer, WashMembership, Transaction, PointsLedgerEntry, Staff, Shift, ReferralRedemption, Booking, Settings, InventoryItem, FitmentJob, TrackingDevice, TrackingSubscription } from '../types';

export const DEFAULT_SETTINGS: Settings = {
  id: 'global',
  services: [
    { id: 'basic_wash', name: 'Basic Exterior Wash', price: 3.00, type: 'wash' },
    { id: 'full_valet', name: 'Full Valet', price: 7.00, type: 'wash' },
    { id: 'premium_detail', name: 'Premium Detail', price: 15.00, type: 'wash' },
    { id: 'membership_basic', name: 'Monthly Membership - Basic', price: 18.00, type: 'membership' },
    { id: 'membership_premium', name: 'Monthly Membership - Premium', price: 35.00, type: 'membership' },
    { id: 'fleet_account', name: 'Fleet Account', price: 40.00, type: 'fleet' }
  ],
  membershipPlans: [
    {
      id: 'membership_basic',
      tier: 'basic_member',
      durationDays: 30,
      // A basic member gets the cheap washes, not the $15 detail.
      coveredServiceIds: ['basic_wash'],
      washesPerPeriod: 8
    },
    {
      id: 'membership_premium',
      tier: 'premium_member',
      durationDays: 30,
      coveredServiceIds: ['basic_wash', 'full_valet', 'premium_detail'],
      washesPerPeriod: null
    }
  ],
  pointsPerDollar: 1,
  pointsPerWash: 5,
  referralRewardPoints: 50,
  redemptionRate: 100,     // 100 points = $1
  minRedeemablePoints: 100,
  syncStatus: 'synced'
};

export class MaliWashDB extends Dexie {
  customers!: Table<Customer, string>;
  washMemberships!: Table<WashMembership, string>;
  transactions!: Table<Transaction, string>;
  pointsLedger!: Table<PointsLedgerEntry, string>;
  staff!: Table<Staff, string>;
  shifts!: Table<Shift, string>;
  referralRedemptions!: Table<ReferralRedemption, string>;
  bookings!: Table<Booking, string>;
  settings!: Table<Settings, string>;
  inventoryItems!: Table<InventoryItem, string>;
  fitmentJobs!: Table<FitmentJob, string>;
  trackingDevices!: Table<TrackingDevice, string>;
  trackingSubscriptions!: Table<TrackingSubscription, string>;

  constructor() {
    super('MaliWashDB');

    this.version(2).stores({
      customers: 'id, phone, name, referralCode, syncStatus',
      washMemberships: 'id, customerId, syncStatus',
      transactions: 'id, customerId, business, staffId, shiftId, createdAt, syncStatus',
      pointsLedger: 'id, customerId, business, type, createdAt, syncStatus',
      staff: 'id, name, role, syncStatus',
      shifts: 'id, staffId, status, syncStatus',
      referralRedemptions: 'id, referrerId, refereeId, business, syncStatus',
      bookings: 'id, status, syncStatus',
      settings: 'id, syncStatus'
    });

    // v3: Bookings.tsx orders by requestedTime, which Dexie can only do on an
    // indexed field — without this the bookings page throws SchemaError on load.
    this.version(3).stores({
      bookings: 'id, status, requestedTime, createdAt, syncStatus'
    });

    // v4: memberships are now looked up by expiry, and settings gained the
    // configurable points/membership rules the POS reads on every sale.
    this.version(4).stores({
      washMemberships: 'id, customerId, tier, expiry, syncStatus'
    }).upgrade(async tx => {
      const settings = await tx.table('settings').get('global');
      if (settings) {
        await tx.table('settings').put({
          ...DEFAULT_SETTINGS,
          ...settings,
          // Existing installs predate these, so fill them from defaults rather
          // than leaving the POS to read undefined and award NaN points.
          membershipPlans: settings.membershipPlans ?? DEFAULT_SETTINGS.membershipPlans,
          pointsPerDollar: settings.pointsPerDollar ?? DEFAULT_SETTINGS.pointsPerDollar,
          redemptionRate: settings.redemptionRate ?? DEFAULT_SETTINGS.redemptionRate,
          minRedeemablePoints: settings.minRedeemablePoints ?? DEFAULT_SETTINGS.minRedeemablePoints,
          syncStatus: 'pending_sync'
        });
      }
    });

    this.version(5).stores({
      inventoryItems: 'id, business, sku, name, category, stockQty, updatedAt, syncStatus',
      fitmentJobs: 'id, customerId, status, scheduledAt, updatedAt, syncStatus',
      trackingDevices: 'id, serialNumber, imei, status, customerId, updatedAt, syncStatus',
      trackingSubscriptions: 'id, customerId, deviceId, status, renewalAt, updatedAt, syncStatus'
    });
  }
}

export const db = new MaliWashDB();

db.on('populate', () => {
  db.settings.add(DEFAULT_SETTINGS);
});

/**
 * Settings are read on every sale. If the record is somehow missing or was
 * written by an older version, fall back to defaults rather than letting the
 * till fail mid-transaction.
 */
export async function getSettings(): Promise<Settings> {
  const stored = await db.settings.get('global');
  if (!stored) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...stored };
}
