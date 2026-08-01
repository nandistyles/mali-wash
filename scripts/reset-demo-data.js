/**
 * Wipe every operational collection from BOTH Firestore and the local Dexie
 * database, and reset the sync watermark.
 *
 * Paste into the browser devtools console with the app open and signed in.
 * Intended for clearing demo or test data before real trading starts.
 *
 * This deletes customers, transactions, the points ledger, memberships,
 * referral redemptions and shifts. It does NOT touch staff or settings.
 *
 * There is no undo.
 */
(async () => {
  const COLLECTIONS = [
    'customers',
    'transactions',
    'pointsLedger',
    'washMemberships',
    'referralRedemptions',
    'shifts'
  ];

  const { db: firestore } = await import('/src/lib/firebase.ts');
  const { db } = await import('/src/lib/db.ts');

  // Vite pre-bundles firebase; grab the same instance the app is using rather
  // than a second copy, which would fail the CollectionReference check.
  const depUrl = performance
    .getEntriesByType('resource')
    .map(e => e.name)
    .find(n => n.includes('firebase_firestore.js?v='));
  const { collection, getDocs, deleteDoc, doc } = await import(depUrl);

  const report = {};

  for (const name of COLLECTIONS) {
    const snap = await getDocs(collection(firestore, name));
    await Promise.all(snap.docs.map(d => deleteDoc(doc(firestore, name, d.id))));
    await db.table(name).clear();
    report[name] = snap.size;
  }

  localStorage.removeItem('mali_sync_last_pull');
  localStorage.removeItem('mali_outreach_contacted');

  console.table(report);
  console.log('Done. Reload the page.');
  return report;
})();
