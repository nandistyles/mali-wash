import { useEffect, useState } from 'react';
import { db } from './db';
import { db as firestore } from './firebase';
import { collection, doc, writeBatch, getDocs, setDoc, query, where, Timestamp } from 'firebase/firestore';

// A simple sync manager to push local changes and pull remote ones
export function useSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      performSync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial sync if online
    if (navigator.onLine) {
      performSync();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const performSync = async () => {
    if (!firestore || !navigator.onLine || syncing) return;
    
    try {
      setSyncing(true);
      
      // --- PUSH LOCAL CHANGES TO FIRESTORE ---
      await pushCollection('customers');
      await pushCollection('washMemberships');
      await pushCollection('transactions');
      await pushCollection('pointsLedger');
      await pushCollection('staff');
      await pushCollection('shifts');
      await pushCollection('referralRedemptions');
      await pushCollection('bookings');
      
      // --- PULL REMOTE CHANGES FROM FIRESTORE ---
      // For a robust app, we'd use lastSync timestamp to only pull new records.
      // For V1, we'll pull down all (or active) records and merge, favouring remote if conflict.
      await pullCollection('customers');
      await pullCollection('washMemberships');
      await pullCollection('staff');
      await pullCollection('settings');
      // For transactions/shifts, pulling all might be too heavy, usually you pull recent ones or query.
      
      setLastSync(new Date());
    } catch (error) {
      console.error("Sync failed:", error);
    } finally {
      setSyncing(false);
    }
  };

  const pushCollection = async (tableName: keyof typeof db) => {
    if (!firestore) return;
    const table = db.table(tableName);
    // Find records needing sync
    const pending = await table.where('syncStatus').equals('pending_sync').toArray();
    
    if (pending.length === 0) return;

    // Use batches for Firestore
    const batch = writeBatch(firestore);
    const collRef = collection(firestore, tableName);

    pending.forEach(record => {
      const docRef = doc(collRef, record.id);
      // Remove local-only fields
      const { syncStatus, ...dataToSync } = record;
      batch.set(docRef, dataToSync, { merge: true });
    });

    try {
      await batch.commit();
      // Mark as synced locally
      await table.bulkUpdate(
        pending.map(record => ({ key: record.id, changes: { syncStatus: 'synced' } }))
      );
    } catch (error) {
      console.error("Write failed", error);
    }
  };

  const pullCollection = async (tableName: keyof typeof db) => {
    if (!firestore) return;
    const table = db.table(tableName);
    const collRef = collection(firestore, tableName);
    
    try {
      // In a real app, query by updatedAt > lastSync
      const snapshot = await getDocs(collRef);
      
      const records = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
        syncStatus: 'synced' // remote data is synced by definition
      }));

      if (records.length > 0) {
         // bulkPut updates existing and adds new
         await table.bulkPut(records);
      }
    } catch (error) {
      console.error("Get failed", error);
    }
  };

  return { isOnline, syncing, lastSync, triggerSync: performSync };
}
