import { v4 as uuidv4 } from 'uuid';
import { db, getSettings } from './db';
import { award, calculateEarnedPoints, maxRedeemable, pointsToUsd, redeem } from './points';
import { maybeAwardReferralReward } from './customers';
import type {
  BusinessUnit, Customer, InventoryItem, InventoryMovement, LineItem,
  PaymentMethod, TrackingDevice, TrackingSubscription, Transaction
} from '../types';

const round2 = (value: number) => Math.round(value * 100) / 100;
const cleanSku = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
const cleanImei = (value: string) => value.replace(/\D/g, '');

function assertMoney(value: number, label: string, allowZero = true) {
  if (!Number.isFinite(value) || value < 0 || (!allowZero && value === 0)) {
    throw new Error(`${label} must be ${allowZero ? 'zero or greater' : 'greater than zero'}`);
  }
}

export async function commitBusinessSale(input: {
  business: Exclude<BusinessUnit, 'wash'>;
  customer?: Customer | null;
  anonymousPhone?: string | null;
  lineItems: LineItem[];
  paymentMethod: PaymentMethod;
  staffId: string;
  redeemPoints?: number;
  businessMeta?: Record<string, unknown>;
}): Promise<Transaction> {
  if (!input.staffId) throw new Error('No staff member is signed in');
  if (!input.lineItems.length) throw new Error('Add at least one item');
  input.lineItems.forEach(item => {
    if (!item.description.trim()) throw new Error('Every sale line needs a description');
    if (!Number.isFinite(item.qty) || item.qty <= 0) throw new Error('Sale quantity must be greater than zero');
    assertMoney(item.unitPrice, 'Unit price');
    assertMoney(item.total, 'Line total');
  });

  const grossAmount = round2(input.lineItems.reduce((sum, item) => sum + item.total, 0));
  const cap = input.customer
    ? await maxRedeemable(input.customer.pointsBalance, grossAmount)
    : { points: 0, usd: 0, reason: null };
  const requested = Math.max(0, Math.floor(input.redeemPoints ?? 0));
  const pointsRedeemed = Math.min(requested, cap.points);
  const pointsDiscountUsd = round2(Math.min(await pointsToUsd(pointsRedeemed), grossAmount));
  const amount = round2(grossAmount - pointsDiscountUsd);

  return db.transaction('rw', [db.transactions, db.customers, db.pointsLedger, db.referralRedemptions, db.settings, db.cashSessions], async () => {
    const openCashSession = await db.cashSessions
      .filter(session => session.business === input.business && session.staffId === input.staffId && session.status === 'open')
      .first();
    if (input.paymentMethod === 'cash_usd' && !openCashSession) {
      throw new Error(`Open the ${input.business} cash drawer before taking cash`);
    }
    const id = uuidv4();
    const pointsEarned = input.customer ? await calculateEarnedPoints({ amount, washLineCount: 0 }) : 0;
    const lineItems = [...input.lineItems];
    if (pointsDiscountUsd > 0) {
      lineItems.push({
        description: `AutoPoints redeemed (${pointsRedeemed} pts)`,
        qty: 1,
        unitPrice: -pointsDiscountUsd,
        total: -pointsDiscountUsd
      });
    }
    const transaction: Transaction = {
      id,
      business: input.business,
      customerId: input.customer?.id ?? null,
      customerPhone: input.customer?.phone ?? input.anonymousPhone ?? null,
      lineItems,
      amount,
      paymentMethod: input.paymentMethod,
      pointsEarned,
      pointsRedeemed,
      staffId: input.staffId,
      shiftId: openCashSession?.id ?? null,
      status: 'completed',
      businessMeta: { ...input.businessMeta, grossAmount, pointsDiscountUsd },
      createdAt: Date.now(),
      syncStatus: 'pending_sync'
    };
    await db.transactions.add(transaction);
    if (input.customer) {
      if (pointsRedeemed > 0) await redeem(input.customer.id, input.business, pointsRedeemed, `${input.business} purchase`, id);
      if (pointsEarned > 0) await award(input.customer.id, input.business, pointsEarned, `${input.business} purchase`, id);
      if (amount > 0) await maybeAwardReferralReward(input.customer.id, input.business, id);
    }
    return transaction;
  });
}

export async function saveInventoryItem(item: Omit<InventoryItem, 'id' | 'updatedAt' | 'syncStatus'> & { id?: string }) {
  const sku = cleanSku(item.sku);
  if (!sku) throw new Error('Enter a SKU');
  if (!item.name.trim()) throw new Error('Enter an item name');
  assertMoney(item.sellPrice, 'Selling price');
  assertMoney(item.costPrice, 'Cost price');
  assertMoney(item.stockQty, 'Opening stock');
  assertMoney(item.reorderLevel, 'Reorder level');
  const duplicate = await db.inventoryItems.where('sku').equals(sku).filter(row => row.business === item.business && row.id !== item.id).first();
  if (duplicate) throw new Error(`SKU ${sku} already exists`);
  const id = item.id ?? `inventory_${item.business}_${sku}`;
  const record: InventoryItem = { ...item, sku, name: item.name.trim(), id, updatedAt: Date.now(), syncStatus: 'pending_sync' };
  await db.inventoryItems.put(record);
  return record;
}

export async function adjustStock(
  id: string,
  delta: number,
  reason = 'Manual stock adjustment',
  staffId = 'system',
  type: InventoryMovement['type'] = 'adjustment',
  transactionId?: string | null
) {
  if (!Number.isInteger(delta) || delta === 0) throw new Error('Stock change must be a non-zero whole number');
  const item = await db.inventoryItems.get(id);
  if (!item) throw new Error('Inventory item not found');
  const stockQty = item.stockQty + delta;
  if (stockQty < 0) throw new Error(`Only ${item.stockQty} in stock`);
  const movement: InventoryMovement = {
    id: transactionId ? `movement_${type}_${transactionId}_${id}` : uuidv4(),
    itemId: id,
    business: item.business,
    type,
    qtyDelta: delta,
    reason: reason.trim() || 'Stock adjustment',
    staffId,
    transactionId: transactionId ?? null,
    createdAt: Date.now(),
    syncStatus: 'pending_sync'
  };
  await db.inventoryItems.update(id, { stockQty, updatedAt: Date.now(), syncStatus: 'pending_sync' });
  await db.inventoryMovements.put(movement);
  return movement;
}

const sharedSaleTables = () => [db.transactions, db.customers, db.pointsLedger, db.referralRedemptions, db.settings, db.cashSessions];

export async function commitInventorySale(input: {
  itemId: string;
  quantity?: number;
  customer?: Customer | null;
  staffId: string;
  paymentMethod: PaymentMethod;
  redeemPoints?: number;
}) {
  return db.transaction('rw', [db.inventoryItems, db.inventoryMovements, ...sharedSaleTables()], async () => {
    const item = await db.inventoryItems.get(input.itemId);
    const quantity = Math.floor(input.quantity ?? 1);
    if (!item || !item.active) throw new Error('Item is not available');
    if (quantity < 1) throw new Error('Quantity must be at least one');
    if (item.stockQty < quantity) throw new Error(`Only ${item.stockQty} in stock`);
    const transaction = await commitBusinessSale({
      business: item.business,
      customer: input.customer,
      staffId: input.staffId,
      paymentMethod: input.paymentMethod,
      redeemPoints: input.redeemPoints,
      lineItems: [{ description: item.name, qty: quantity, unitPrice: item.sellPrice, total: round2(item.sellPrice * quantity) }],
      businessMeta: { sku: item.sku, inventoryItemId: item.id, inventoryQty: quantity, unitCost: item.costPrice }
    });
    await adjustStock(item.id, -quantity, `Sale ${transaction.id.slice(0, 8)}`, input.staffId, 'sale', transaction.id);
    return transaction;
  });
}

export async function completeFitmentSale(input: {
  jobId: string;
  staffId: string;
  paymentMethod: PaymentMethod;
  redeemPoints?: number;
}) {
  return db.transaction('rw', [db.fitmentJobs, ...sharedSaleTables()], async () => {
    const job = await db.fitmentJobs.get(input.jobId);
    if (!job) throw new Error('Fitment job not found');
    if (job.status === 'cancelled') throw new Error('A cancelled job cannot be completed');
    if (job.status === 'completed') return null;
    const customer = job.customerId ? await db.customers.get(job.customerId) : null;
    const transaction = job.quotedAmount > 0 ? await commitBusinessSale({
      business: 'drive', customer, anonymousPhone: job.phone, staffId: input.staffId,
      paymentMethod: input.paymentMethod, redeemPoints: input.redeemPoints,
      lineItems: [{ description: job.description, qty: 1, unitPrice: job.quotedAmount, total: job.quotedAmount }],
      businessMeta: { fitmentJobId: job.id, vehicleReg: job.vehicleReg }
    }) : null;
    await db.fitmentJobs.update(job.id, {
      status: 'completed', sourceTransactionId: transaction?.id ?? null,
      updatedAt: Date.now(), syncStatus: 'pending_sync'
    });
    return transaction;
  });
}

function addCalendarMonth(timestamp: number): number {
  const date = new Date(timestamp);
  date.setMonth(date.getMonth() + 1);
  return date.getTime();
}

export async function saveTrackingDevice(input: { serialNumber: string; imei: string; model: string }) {
  const serialNumber = input.serialNumber.trim().toUpperCase();
  const imei = cleanImei(input.imei);
  if (!serialNumber) throw new Error('Enter the device serial number');
  if (imei.length < 14 || imei.length > 16) throw new Error('Enter a valid IMEI');
  if (!input.model.trim()) throw new Error('Enter the device model');
  const duplicate = await db.trackingDevices.filter(device => device.serialNumber === serialNumber || device.imei === imei).first();
  if (duplicate) throw new Error('That serial number or IMEI already exists');
  const record: TrackingDevice = {
    id: `tracking_${imei}`, serialNumber, imei, model: input.model.trim(), status: 'in_stock',
    customerId: null, vehicleReg: null, updatedAt: Date.now(), syncStatus: 'pending_sync'
  };
  await db.trackingDevices.add(record);
  return record;
}

export async function activateTrackingPlan(input: {
  customer: Customer; deviceId: string; vehicleReg: string; planName: string;
  monthlyFee: number; staffId: string; paymentMethod: PaymentMethod; redeemPoints?: number;
}) {
  assertMoney(input.monthlyFee, 'Monthly fee', false);
  if (!input.vehicleReg.trim()) throw new Error('Enter the vehicle registration');
  if (!input.planName.trim()) throw new Error('Enter a plan name');
  return db.transaction('rw', [db.trackingDevices, db.trackingSubscriptions, ...sharedSaleTables()], async () => {
    const device = await db.trackingDevices.get(input.deviceId);
    if (!device || device.status !== 'in_stock') throw new Error('Device is not available');
    const now = Date.now();
    const subscriptionId = uuidv4();
    const transaction = await commitBusinessSale({
      business: 'track', customer: input.customer, staffId: input.staffId,
      paymentMethod: input.paymentMethod, redeemPoints: input.redeemPoints,
      lineItems: [{ description: `${input.planName} - first month`, qty: 1, unitPrice: input.monthlyFee, total: input.monthlyFee }],
      businessMeta: { deviceId: device.id, subscriptionId, vehicleReg: input.vehicleReg.toUpperCase(), billingPeriod: 'monthly' }
    });
    const subscription: TrackingSubscription = {
      id: subscriptionId, customerId: input.customer.id, deviceId: device.id,
      vehicleReg: input.vehicleReg.toUpperCase(), planName: input.planName.trim(),
      monthlyFee: input.monthlyFee, status: 'active', startedAt: now,
      renewalAt: addCalendarMonth(now), lastPaymentAt: now, lastTransactionId: transaction.id,
      updatedAt: now, syncStatus: 'pending_sync'
    };
    await db.trackingSubscriptions.add(subscription);
    await db.trackingDevices.update(device.id, {
      status: 'assigned', customerId: input.customer.id, vehicleReg: input.vehicleReg.toUpperCase(),
      updatedAt: now, syncStatus: 'pending_sync'
    });
    return subscriptionId;
  });
}

export async function collectTrackingRenewal(input: {
  subscriptionId: string; staffId: string; paymentMethod: PaymentMethod; redeemPoints?: number;
}) {
  return db.transaction('rw', [db.trackingSubscriptions, ...sharedSaleTables()], async () => {
    const subscription = await db.trackingSubscriptions.get(input.subscriptionId);
    if (!subscription) throw new Error('Subscription not found');
    if (subscription.status === 'cancelled') throw new Error('Cancelled subscriptions cannot be billed');
    const customer = await db.customers.get(subscription.customerId);
    if (!customer) throw new Error('Customer not found');
    const transaction = await commitBusinessSale({
      business: 'track', customer, staffId: input.staffId, paymentMethod: input.paymentMethod,
      redeemPoints: input.redeemPoints,
      lineItems: [{ description: `${subscription.planName} - monthly renewal`, qty: 1, unitPrice: subscription.monthlyFee, total: subscription.monthlyFee }],
      businessMeta: { deviceId: subscription.deviceId, subscriptionId: subscription.id, vehicleReg: subscription.vehicleReg, billingPeriod: 'monthly' }
    });
    const now = Date.now();
    await db.trackingSubscriptions.update(subscription.id, {
      status: 'active', renewalAt: addCalendarMonth(Math.max(subscription.renewalAt, now)),
      lastPaymentAt: now, lastTransactionId: transaction.id, updatedAt: now, syncStatus: 'pending_sync'
    });
    return transaction;
  });
}

export async function setTrackingSubscriptionStatus(subscriptionId: string, status: TrackingSubscription['status']) {
  const subscription = await db.trackingSubscriptions.get(subscriptionId);
  if (!subscription) throw new Error('Subscription not found');
  await db.transaction('rw', db.trackingSubscriptions, db.trackingDevices, async () => {
    await db.trackingSubscriptions.update(subscriptionId, { status, updatedAt: Date.now(), syncStatus: 'pending_sync' });
    if (status === 'cancelled') {
      await db.trackingDevices.update(subscription.deviceId, {
        status: 'in_stock', customerId: null, vehicleReg: null, updatedAt: Date.now(), syncStatus: 'pending_sync'
      });
    }
  });
}

export async function pointsRuleLabel() {
  const settings = await getSettings();
  return `${settings.pointsPerDollar} point${settings.pointsPerDollar === 1 ? '' : 's'} per $1`;
}
