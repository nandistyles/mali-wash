import { initializeApp } from 'firebase/app';
import { getAuth, browserLocalPersistence, setPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import appletConfig from '../../firebase-applet-config.json';

/**
 * Firebase config resolution.
 *
 * The bundled firebase-applet-config.json points at gen-lang-client-0971315086,
 * an AI Studio project that belongs to a DIFFERENT application. It is kept only
 * so the app can boot without configuration; it must never receive Mali Wash
 * customer data.
 *
 * So the fallback initialises Firebase (the SDK needs *something* to construct
 * an app object) but does NOT count as being configured. `isFirebaseConfigured`
 * is false unless VITE_FIREBASE_* are set explicitly, and sync.ts refuses to
 * push or pull anything while it is false. Dexie remains the source of truth,
 * so the app stays fully usable offline — it just does not write someone else's
 * database.
 */
const env = import.meta.env;

const fromEnv = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID
};

const usingEnv = Boolean(fromEnv.apiKey && fromEnv.projectId && fromEnv.appId);

const firebaseConfig = usingEnv ? fromEnv : appletConfig;

/**
 * Firestore supports NAMED databases alongside the default one. Point this at
 * whatever the Mali project uses; getting it wrong reads and writes a different
 * database with no error at all.
 */
const databaseId: string =
  env.VITE_FIREBASE_DATABASE_ID || (usingEnv ? '(default)' : appletConfig.firestoreDatabaseId);

/**
 * True only when a project has been named explicitly. Sync is gated on this so
 * an unconfigured install cannot leak customer records into the AI Studio
 * project that ships in the fallback config.
 */
export const isFirebaseConfigured = usingEnv;
export const configuredProjectId: string = firebaseConfig.projectId;
export const firestoreDatabaseId = databaseId;

if (!usingEnv) {
  console.warn(
    `[Mali] Firebase is NOT configured for Mali Wash.\n` +
    `Falling back to ${appletConfig.projectId}, which belongs to a different application.\n` +
    `Sync is disabled — all data stays in this browser until you set VITE_FIREBASE_* in .env.local.`
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
