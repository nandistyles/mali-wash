import { initializeApp } from 'firebase/app';
import { getAuth, browserLocalPersistence, setPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
/**
 * Firebase config resolution.
 *
 * Configuration comes from VITE_FIREBASE_* and nowhere else.
 *
 * This used to fall back to a bundled firebase-applet-config.json pointing at
 * gen-lang-client-0971315086 — an AI Studio project belonging to a DIFFERENT
 * application. Even unused, a static import puts that project's id and key in
 * every bundle we ship, and a build with no env vars silently authenticated
 * against it. That happened in production: a Vercel deploy with no variables set
 * shipped the fallback key and rejected valid staff passwords, because the
 * accounts existed in maliholdings and the app was asking the wrong project.
 *
 * There is now no fallback project. When the variables are absent the SDK is
 * constructed from an inert placeholder purely so imports resolve and the app
 * boots; `isFirebaseConfigured` is false, sync refuses to push or pull, and a
 * production build renders a configuration error instead of the app. Dexie is
 * the source of truth regardless, so local work is never blocked.
 */
const env = import.meta.env;

/**
 * Not a real project. Only ever used to satisfy initializeApp() when nothing is
 * configured; every network path is gated on isFirebaseConfigured.
 */
const PLACEHOLDER = {
  apiKey: 'unconfigured',
  authDomain: 'unconfigured.invalid',
  projectId: 'unconfigured',
  storageBucket: 'unconfigured.invalid',
  messagingSenderId: '0',
  appId: '0:0:web:0'
};

const fromEnv = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID
};

const usingEnv = Boolean(fromEnv.apiKey && fromEnv.projectId && fromEnv.appId);

const firebaseConfig = usingEnv ? fromEnv : PLACEHOLDER;

/**
 * Firestore supports NAMED databases alongside the default one. Point this at
 * whatever the Mali project uses; getting it wrong reads and writes a different
 * database with no error at all.
 */
const databaseId: string = env.VITE_FIREBASE_DATABASE_ID || '(default)';

/**
 * True only when a project has been named explicitly. Every network path is
 * gated on this.
 */
export const isFirebaseConfigured = usingEnv;
export const configuredProjectId: string = firebaseConfig.projectId;
export const firestoreDatabaseId = databaseId;

if (!usingEnv) {
  console.warn(
    `[Mali] Firebase is NOT configured.\n` +
    `Set VITE_FIREBASE_* (see .env.example). Sync is disabled — all data stays in this browser.`
  );
}

const app = initializeApp(firebaseConfig as Record<string, string>);

export const db = getFirestore(app, databaseId);
export const auth = getAuth(app);

/**
 * Persist the session in IndexedDB so a staff member who signed in yesterday is
 * still signed in this morning with no connectivity. Without this, a
 * load-shedding morning locks the till out entirely.
 */
setPersistence(auth, browserLocalPersistence).catch(err => {
  console.warn('Could not set auth persistence:', err);
});

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
