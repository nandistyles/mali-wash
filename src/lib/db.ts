import Dexie, { type Table } from 'dexie';
import type { Customer, WashMembership, Transaction, PointsLedgerEntry, Staff, Shift, ReferralRedemption, Booking, Settings } from '../types';

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
  }
}

export const db = new MaliWashDB();

// Initialize default settings if not exists
db.on('populate', () => {
  db.settings.add({
    id: 'global',
    services: [
      { id: 'basic_wash', name: 'Basic Exterior Wash', price: 3.00, type: 'wash' },
      { id: 'full_valet', name: 'Full Valet', price: 7.00, type: 'wash' },
      { id: 'premium_detail', name: 'Premium Detail', price: 15.00, type: 'wash' },
      { id: 'membership_basic', name: 'Monthly Membership - Basic', price: 18.00, type: 'membership' },
      { id: 'membership_premium', name: 'Monthly Membership - Premium', price: 35.00, type: 'membership' },
      { id: 'fleet_account', name: 'Fleet Account', price: 40.00, type: 'fleet' }
    ],
    pointsPerWash: 5,
    referralRewardPoints: 50,
    syncStatus: 'synced'
  });
});
