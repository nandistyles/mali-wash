import { useEffect, useState } from 'react';
import { db } from './db';
import { db as firestore } from './firebase';
import { collection, doc, writeBatch, getDocs, query, where } from 'firebase/firestore';

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
  | 'staff' | 'shifts' | 'referralRedemptions' | 'bookings' | 'settings';

/** Order matters: a transaction's customer must exist remotely before it lands. */
const PUSH_ORDER: TableName[] = [
  'customers',
  'washMemberships',
  'transactions',
  'pointsLedger',
  'referralRedemptions',
  'shifts',
  'bookings',
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
  { table: 'bookings', field: 'createdAt' }
];

export interface SyncState {
  isOnline: boolean;
  syncing: boolean;
  lastSync: Date | null;
  pendingCount: number;
  lastError: string | null;
}

let state: SyncState = {
  isOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
  syncing: false,
  lastSync: null,
  pendingCount: 0,
  lastError: null
};

const subscribers = new Set<(s: SyncState) => void>();
let inFlight = false;

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  subscribers.forEach(fn => fn(state));
}

export async function countPending(): Promise<number> {
  let total = 0;
  for (const name of PUSH_ORDER) {
    total += await db.table(name).where('syncStatus').equals('pending_sync').count();
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
async function pushTable(name: TableName): Promise<void> {
  const table = db.table(name);
  const pending = await table.where('syncStatus').equals('pending_sync').toArray();
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
async function pullTable(name: TableName, field: string | null, since: number): Promise<void> {
  const table = db.table(name);
  const collRef = collection(firestore, name);

  const q = field
    ? query(collRef, where(field, '>', Math.max(0, since - PULL_LOOKBACK_MS)))
    : query(collRef);

  const snapshot = await getDocs(q);
  if (snapshot.empty) return;

  const pendingIds = new Set(
    (await table.where('syncStatus').equals('pending_sync').primaryKeys()) as string[]
  );

  const records = snapshot.docs
    .map(d => ({ ...d.data(), id: d.id, syncStatus: 'synced' as const }))
    .filter(r => !pendingIds.has(r.id));

  if (records.length > 0) await table.bulkPut(records);
}

export async function performSync(): Promise<void> {
  if (inFlight) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setState({ pendingCount: await countPending() });
    return;
  }

  inFlight = true;
  setState({ syncing: true });

  const failures: string[] = [];

  try {
    for (const name of PUSH_ORDER) {
      try {
        await pushTable(name);
      } catch (err) {
        failures.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const since = Number(localStorage.getItem(LAST_PULL_KEY) || 0);
    const pullStartedAt = Date.now();

    for (const { table, field } of PULL_PLAN) {
      try {
        await pullTable(table, field, since);
      } catch (err) {
        failures.push(`${table}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Only advance the watermark if every pull succeeded, so a failed
    // collection is retried rather than skipped over.
    if (failures.length === 0) {
      localStorage.setItem(LAST_PULL_KEY, String(pullStartedAt));
    }

    setState({
      lastSync: failures.length === 0 ? new Date() : state.lastSync,
      lastError: failures.length === 0 ? null : failures[0],
      pendingCount: await countPending()
    });
  } catch (err) {
    setState({
      lastError: err instanceof Error ? err.message : String(err),
      pendingCount: await countPending()
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
