import { initializeApp } from 'firebase/app';
import { getAuth, browserLocalPersistence, setPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import appletConfig from '../../firebase-applet-config.json';

/**
 * Firebase config resolution.
 *
 * Environment variables win, so a real Mali-owned Firebase project can be
 * configured per environment without editing source. The bundled
 * firebase-applet-config.json is the fallback and points at the original AI
 * Studio scratch project — fine for local development, not where customer data
 * should live.
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
 * This project uses a NAMED Firestore database, not the default one. Getting
 * this wrong silently reads and writes an empty default database.
 */
const databaseId: string =
  env.VITE_FIREBASE_DATABASE_ID || (usingEnv ? '(default)' : appletConfig.firestoreDatabaseId);

export const isUsingEnvConfig = usingEnv;
export const firestoreDatabaseId = databaseId;

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
