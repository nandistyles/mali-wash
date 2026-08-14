import { useEffect, useState } from 'react';
import { db } from './db';
import { db as firestore, auth, isFirebaseConfigured } from './firebase';
import { collection, doc, writeBatch, getDocs, query, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import type { BusinessUnit, Staff } from '../types';
import { recomputeBalance } from './points';

/**
 * Offline-first sync (platform spec 4.2).
 *
 * Dexie is the source of truth; Firestore is a sync target. The governing rule
 * is the spec's: a transaction must NEVER be lost. Load-shedding and patchy
 * signal are the normal operating condition here, not the edge case.
 *
 * Four defects in the previous version, all of which could destroy a sale:
 *
 *   1. pullCollection() bulkPut remote records over local ones and stamped them
 *      'synced' without checking whether the local copy was still pending. A
 *      push that failed (rules rejection, dropped signal) followed by a
 *      successful pull silently destroyed the sale. Pull now skips any record
 *      with unsynced local changes.
 *   2. writeBatch caps at 500 operations. A day of load-shedding backlog
 *      exceeded it, the batch threw, and nothing synced at all. Writes are now
 *      chunked.
 *   3. Sync only ran on mount and on the browser's 'online' event. The common
 *      Zimbabwean failure — browser reports online, Firestore unreachable —
 *      left records queued forever. There is now a retry timer.
 *   4. transactions and shifts were never pulled, so a second device never saw
 *      the first device's sales or its open shift.
 *
 * Failures are also surfaced to the UI now. The header used to read
 * "Online · Synced" while every push was being rejected.
 */

const BATCH_LIMIT = 400;           // Firestore hard limit is 500; leave headroom.
const RETRY_INTERVAL_MS = 60_000;
const PULL_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const LAST_PULL_KEY = 'mali_sync_last_pull';

type TableName =
  | 'customers' | 'washMemberships' | 'transactions' | 'pointsLedger'
  | 'staff' | 'shifts' | 'cashSessions' | 'referralRedemptions' | 'bookings' | 'settings'
  | 'inventoryItems' | 'inventoryMovements' | 'fitmentJobs' | 'trackingDevices' | 'trackingSubscriptions';

/** Order matters: a transaction's customer must exist remotely before it lands. */
const PUSH_ORDER: TableName[] = [
  'customers',
  'washMemberships',
  'transactions',
  'pointsLedger',
  'referralRedemptions',
  'shifts',
  'cashSessions',
  'bookings',
  'inventoryItems',
  'inventoryMovements',
  'fitmentJobs',
  'trackingDevices',
  'trackingSubscriptions',
  'settings'   // was missing entirely — price edits never reached Firestore,
];             // and the next pull overwrote them with the stale remote value.

/**
 * Incremental pull. `field` is the timestamp to range-query on; null means the
 * collection is small enough to pull whole.
 */
const PULL_PLAN: { table: TableName; field: string | null }[] = [
  { table: 'customers', field: 'updatedAt' },
  { table: 'staff', field: null },
  { table: 'settings', field: null },
  { table: 'washMemberships', field: 'startedAt' },
  { table: 'transactions', field: 'createdAt' },
  { table: 'pointsLedger', field: 'createdAt' },
  // Needed on every device: the referral payout guard reads it to stay idempotent.
  { table: 'referralRedemptions', field: 'createdAt' },
  { table: 'shifts', field: 'openedAt' },
  { table: 'cashSessions', field: 'openedAt' },
  { table: 'bookings', field: 'createdAt' },
  { table: 'inventoryItems', field: 'updatedAt' },
  { table: 'inventoryMovements', field: 'createdAt' },
  { table: 'fitmentJobs', field: 'updatedAt' },
  { table: 'trackingDevices', field: 'updatedAt' },
  { table: 'trackingSubscriptions', field: 'updatedAt' }
];

const SHARED_TABLES = new Set<TableName>([
  'customers', 'transactions', 'pointsLedger', 'referralRedemptions'
]);

const TABLE_BUSINESS: Partial<Record<TableName, BusinessUnit>> = {
  washMemberships: 'wash',
  shifts: 'wash',
  bookings: 'wash',
  fitmentJobs: 'drive',
  trackingDevices: 'track',
  trackingSubscriptions: 'track'
};

interface SyncAccess {
  staff: Staff;
  businesses: Set<BusinessUnit>;
}

async function getSyncAccess(): Promise<SyncAccess | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const staff = await db.staff.get(uid);
  if (!staff?.active) return null;
  return { staff, businesses: new Set(staff.businesses) };
}

function canSyncTable(name: TableName, access: SyncAccess, direction: 'push' | 'pull'): boolean {
  if (SHARED_TABLES.has(name)) return true;
  if (name === 'staff') return direction === 'pull';
  if (name === 'settings') return direction === 'pull' || access.staff.role === 'admin';
  if (name === 'inventoryItems' || name === 'inventoryMovements' || name === 'cashSessions') return access.businesses.has('parts') || access.businesses.has('drive') || access.businesses.has('track');
  const business = TABLE_BUSINESS[name];
  return business ? access.businesses.has(business) : false;
}

function canSyncRecord(name: TableName, record: Record<string, unknown>, access: SyncAccess): boolean {
  if (name !== 'inventoryItems' && name !== 'inventoryMovements' && name !== 'cashSessions') return true;
  return access.businesses.has(record.business as BusinessUnit);
}

function watermarkKey(uid: string): string {
  return `${LAST_PULL_KEY}:${uid}`;
}

export interface SyncState {
  isOnline: boolean;
  syncing: boolean;
  lastSync: Date | null;
  pendingCount: number;
  lastError: string | null;
  /** False when no Mali Firebase project is configured; sync is then a no-op. */
  configured: boolean;
  /**
   * False when there is no Firebase identity — signed out, or a dev-bypass
   * session, which is local-only by design. The rules reject every read without
   * a staff document behind an Auth uid, so syncing is not attempted.
   */
  signedIn: boolean;
}

let state: SyncState = {
  isOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
  syncing: false,
  lastSync: null,
  pendingCount: 0,
  lastError: null,
  configured: isFirebaseConfigured,
  signedIn: false
};

const subscribers = new Set<(s: SyncState) => void>();
let inFlight = false;

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  subscribers.forEach(fn => fn(state));
}

export async function countPending(access?: SyncAccess | null): Promise<number> {
  const resolved = access === undefined ? await getSyncAccess() : access;
  let total = 0;
  for (const name of PUSH_ORDER) {
    if (resolved && !canSyncTable(name, resolved, 'push')) continue;
    const pending = await db.table(name).where('syncStatus').equals('pending_sync').toArray();
    total += resolved ? pending.filter(record => canSyncRecord(name, record, resolved)).length : pending.length;
  }
  return total;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Push local changes. Records stay 'pending_sync' unless their chunk committed,
 * so a partial failure retries exactly what did not land.
 *
 * Known limitation: a record edited between the read and the post-commit mark
 * would be marked synced while holding newer local data. At one till this is
 * not reachable; if Mali ever runs concurrent writers per device, gate the mark
 * on an unchanged updatedAt.
 */
async function pushTable(name: TableName, access: SyncAccess): Promise<void> {
  const table = db.table(name);
  const pending = (await table.where('syncStatus').equals('pending_sync').toArray())
    .filter(record => canSyncRecord(name, record, access));
  if (pending.length === 0) return;

  const collRef = collection(firestore, name);

  for (const group of chunk(pending, BATCH_LIMIT)) {
    const batch = writeBatch(firestore);
    for (const record of group) {
      const { syncStatus, ...data } = record;
      batch.set(doc(collRef, record.id), data, { merge: true });
    }

    // Let the caller catch: a failed chunk must not mark anything synced.
    await batch.commit();

    await table.bulkUpdate(
      group.map(record => ({ key: record.id, changes: { syncStatus: 'synced' } }))
    );
  }
}

/**
 * Pull remote changes, never overwriting local work that has not synced yet.
 * This is the rule that stops a failed push plus a successful pull from
 * destroying a sale.
 */
async function pullTable(name: TableName, field: string | null, since: number, access: SyncAccess): Promise<string[]> {
  const table = db.table(name);
  const collRef = collection(firestore, name);

  const q = field
    ? query(collRef, where(field, '>', Math.max(0, since - PULL_LOOKBACK_MS)))
    : query(collRef);

  const snapshot = await getDocs(q);
  if (snapshot.empty) return [];

  const pendingIds = new Set(
    (await table.where('syncStatus').equals('pending_sync').primaryKeys()) as string[]
  );

  const records = snapshot.docs
    .map(d => ({ ...d.data(), id: d.id, syncStatus: 'synced' as const }))
    .filter(record => canSyncRecord(name, record, access))
    .filter(r => !pendingIds.has(r.id));

  if (records.length > 0) await table.bulkPut(records);
  return records.map(record => record.id);
}

export async function performSync(): Promise<void> {
  if (inFlight) return;

  /*
   * Refuse to touch Firestore until a Mali-owned project is named. The fallback
   * config in firebase.ts points at another application's project, and pushing
   * here would write Mali Wash customer records into it. Everything stays queued
   * in Dexie and syncs once .env.local is filled in — nothing is lost.
   */
  if (!isFirebaseConfigured) {
    setState({
      pendingCount: await countPending(),
      lastError: null,
      signedIn: false
    });
    return;
  }

  /*
   * No Firebase identity means every rule evaluates against request.auth == null
   * and rejects. That is the normal state for a dev-bypass session, which has no
   * Firebase account at all. Attempting anyway would fill the header with
   * permission-denied errors that are not actually faults.
   */
  if (!auth.currentUser) {
    setState({
      pendingCount: await countPending(),
      lastError: null,
      signedIn: false
    });
    return;
  }

  const access = await getSyncAccess();
  if (!access) {
    setState({
      pendingCount: await countPending(null),
      lastError: 'Your staff access is inactive or has not been configured.',
      signedIn: true
    });
    return;
  }

  setState({ signedIn: true });

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setState({ pendingCount: await countPending() });
    return;
  }

  inFlight = true;
  setState({ syncing: true });

  const failures: string[] = [];

  try {
    for (const name of PUSH_ORDER.filter(name => canSyncTable(name, access, 'push'))) {
      try {
        await pushTable(name, access);
      } catch (err) {
        failures.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const key = watermarkKey(access.staff.id);
    const localIsEmpty = (await db.customers.count()) === 0 && (await db.transactions.count()) === 0;
    const since = localIsEmpty ? 0 : Number(localStorage.getItem(key) || 0);
    const pullStartedAt = Date.now();
    const affectedPointCustomers = new Set<string>();

    for (const { table, field } of PULL_PLAN.filter(item => canSyncTable(item.table, access, 'pull'))) {
      try {
        const pulledIds = await pullTable(table, field, since, access);
        if (table === 'pointsLedger' && pulledIds.length > 0) {
          const entries = await db.pointsLedger.bulkGet(pulledIds);
          entries.forEach(entry => { if (entry) affectedPointCustomers.add(entry.customerId); });
        }
      } catch (err) {
        failures.push(`${table}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // The append-only ledger wins over a last-write-wins cached balance. This
    // makes devices converge after simultaneous point events instead of leaving
    // whichever customer document happened to sync last as the answer.
    for (const customerId of affectedPointCustomers) {
      await recomputeBalance(customerId);
    }

    // Only advance the watermark if every pull succeeded, so a failed
    // collection is retried rather than skipped over.
    if (failures.length === 0) {
      localStorage.setItem(key, String(pullStartedAt));
    }

    setState({
      lastSync: failures.length === 0 ? new Date() : state.lastSync,
      lastError: failures.length === 0 ? null : failures[0],
      pendingCount: await countPending(access)
    });
  } catch (err) {
    setState({
      lastError: err instanceof Error ? err.message : String(err),
      pendingCount: await countPending(access)
    });
  } finally {
    inFlight = false;
    setState({ syncing: false });
  }
}

let started = false;

/** Start the online/offline listeners and the retry timer exactly once. */
function startSyncEngine() {
  if (started || typeof window === 'undefined') return;
  started = true;

  // Signing in is the moment a queued backlog becomes syncable, so push then
  // rather than waiting up to a minute for the next timer tick.
  onAuthStateChanged(auth, () => { void performSync(); });

  window.addEventListener('online', () => {
    setState({ isOnline: true });
    void performSync();
  });
  window.addEventListener('offline', () => setState({ isOnline: false }));

  // The retry timer is what makes this survive "browser thinks it is online but
  // Firestore is unreachable" — the normal case on a weak mobile connection.
  window.setInterval(() => { void performSync(); }, RETRY_INTERVAL_MS);

  void countPending().then(pendingCount => setState({ pendingCount }));
  void performSync();
}

export function useSync(): SyncState & { triggerSync: () => void } {
  const [local, setLocal] = useState<SyncState>(state);

  useEffect(() => {
    subscribers.add(setLocal);
    startSyncEngine();
    setLocal(state);
    return () => { subscribers.delete(setLocal); };
  }, []);

  return { ...local, triggerSync: () => { void performSync(); } };
}

/**
 * Call after writing a sale so the queue count updates immediately rather than
 * on the next timer tick, and attempt an opportunistic push.
 */
export async function notifyLocalWrite(): Promise<void> {
  setState({ pendingCount: await countPending() });
  if (state.isOnline) void performSync();
}
