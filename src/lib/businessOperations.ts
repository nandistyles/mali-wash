import { v4 as uuidv4 } from 'uuid';
import { db, getSettings } from './db';
import { award, calculateEarnedPoints } from './points';
import { maybeAwardReferralReward } from './customers';
import type { BusinessUnit, Customer, InventoryItem, LineItem, PaymentMethod, Transaction } from '../types';

const round2 = (value: number) => Math.round(value * 100) / 100;

export async function commitBusinessSale(input: {
  business: Exclude<BusinessUnit, 'wash'>;
  customer?: Customer | null;
  lineItems: LineItem[];
  paymentMethod: PaymentMethod;
  staffId: string;
  businessMeta?: Record<string, unknown>;
}): Promise<Transaction> {
  if (!input.staffId) throw new Error('No staff member is signed in');
  if (!input.lineItems.length) throw new Error('Add at least one item');
  const amount = round2(input.lineItems.reduce((sum, item) => sum + item.total, 0));
  if (amount < 0) throw new Error('Sale total cannot be negative');

  return db.transaction('rw', [db.transactions, db.customers, db.pointsLedger, db.referralRedemptions, db.settings], async () => {
    const id = uuidv4();
    const pointsEarned = input.customer ? await calculateEarnedPoints({ amount, washLineCount: 0 }) : 0;
    const transaction: Transaction = {
      id,
      business: input.business,
      customerId: input.customer?.id ?? null,
      customerPhone: input.customer?.phone ?? null,
      lineItems: input.lineItems,
      amount,
      paymentMethod: input.paymentMethod,
      pointsEarned,
      pointsRedeemed: 0,
      staffId: input.staffId,
      shiftId: null,
      status: 'completed',
      businessMeta: input.businessMeta ?? {},
      createdAt: Date.now(),
      syncStatus: 'pending_sync'
    };
    await db.transactions.add(transaction);
    if (input.customer) {
      if (pointsEarned > 0) await award(input.customer.id, input.business, pointsEarned, `${input.business} purchase`, id);
      if (amount > 0) await maybeAwardReferralReward(input.customer.id, input.business, id);
    }
    return transaction;
  });
}

export async function saveInventoryItem(item: Omit<InventoryItem, 'id' | 'updatedAt' | 'syncStatus'> & { id?: string }) {
  const record: InventoryItem = { ...item, id: item.id ?? uuidv4(), updatedAt: Date.now(), syncStatus: 'pending_sync' };
  await db.inventoryItems.put(record);
  return record;
}

export async function adjustStock(id: string, delta: number) {
  const item = await db.inventoryItems.get(id);
  if (!item) throw new Error('Inventory item not found');
  const stockQty = item.stockQty + delta;
  if (stockQty < 0) throw new Error(`Only ${item.stockQty} in stock`);
  await db.inventoryItems.update(id, { stockQty, updatedAt: Date.now(), syncStatus: 'pending_sync' });
}

const sharedSaleTables = () => [db.transactions, db.customers, db.pointsLedger, db.referralRedemptions, db.settings];

export async function commitInventorySale(input: {
  itemId: string; customer?: Customer | null; staffId: string; paymentMethod: PaymentMethod;
}) {
  return db.transaction('rw', [db.inventoryItems, ...sharedSaleTables()], async () => {
    const item = await db.inventoryItems.get(input.itemId);
    if (!item || item.stockQty < 1) throw new Error('Item is out of stock');
    const transaction = await commitBusinessSale({
      business: item.business,
      customer: input.customer,
      staffId: input.staffId,
      paymentMethod: input.paymentMethod,
      lineItems: [{ description: item.name, qty: 1, unitPrice: item.sellPrice, total: item.sellPrice }],
      businessMeta: { sku: item.sku, inventoryItemId: item.id }
    });
    await adjustStock(item.id, -1);
    return transaction;
  });
}

export async function completeFitmentSale(input: { jobId: string; staffId: string; paymentMethod: PaymentMethod }) {
  return db.transaction('rw', [db.fitmentJobs, ...sharedSaleTables()], async () => {
    const job = await db.fitmentJobs.get(input.jobId);
    if (!job) throw new Error('Fitment job not found');
    if (job.status === 'completed') return null;
    const customer = job.customerId ? await db.customers.get(job.customerId) : null;
    const transaction = job.quotedAmount > 0 ? await commitBusinessSale({
      business: 'drive', customer, staffId: input.staffId, paymentMethod: input.paymentMethod,
      lineItems: [{ description: job.description, qty: 1, unitPrice: job.quotedAmount, total: job.quotedAmount }],
      businessMeta: { fitmentJobId: job.id, vehicleReg: job.vehicleReg }
    }) : null;
    await db.fitmentJobs.update(job.id, { status: 'completed', updatedAt: Date.now(), syncStatus: 'pending_sync' });
    return transaction;
  });
}

export async function activateTrackingPlan(input: {
  customer: Customer; deviceId: string; vehicleReg: string; planName: string;
  monthlyFee: number; staffId: string; paymentMethod: PaymentMethod;
}) {
  return db.transaction('rw', [db.trackingDevices, db.trackingSubscriptions, ...sharedSaleTables()], async () => {
    const device = await db.trackingDevices.get(input.deviceId);
    if (!device || device.status !== 'in_stock') throw new Error('Device is not available');
    const now = Date.now();
    const subscriptionId = uuidv4();
    await db.trackingSubscriptions.add({
      id: subscriptionId, customerId: input.customer.id, deviceId: device.id,
      vehicleReg: input.vehicleReg.toUpperCase(), planName: input.planName,
      monthlyFee: input.monthlyFee, status: 'active', startedAt: now,
      renewalAt: now + 30 * 24 * 60 * 60 * 1000, updatedAt: now, syncStatus: 'pending_sync'
    });
    await db.trackingDevices.update(device.id, {
      status: 'assigned', customerId: input.customer.id, vehicleReg: input.vehicleReg.toUpperCase(),
      updatedAt: now, syncStatus: 'pending_sync'
    });
    if (input.monthlyFee > 0) await commitBusinessSale({
      business: 'track', customer: input.customer, staffId: input.staffId, paymentMethod: input.paymentMethod,
      lineItems: [{ description: `${input.planName} - first month`, qty: 1, unitPrice: input.monthlyFee, total: input.monthlyFee }],
      businessMeta: { deviceId: device.id, subscriptionId, vehicleReg: input.vehicleReg.toUpperCase(), billingPeriod: 'monthly' }
    });
    return subscriptionId;
  });
}

export async function pointsRuleLabel() {
  const settings = await getSettings();
  return `${settings.pointsPerDollar} point${settings.pointsPerDollar === 1 ? '' : 's'} per $1`;
}
