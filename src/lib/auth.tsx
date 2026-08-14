import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type User
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db as firestore } from './firebase';
import { db } from './db';
import type { Staff } from '../types';

/**
 * Shared auth service (platform spec 4.1).
 *
 * Two things matter here beyond "who is signed in":
 *
 * 1. The Firestore rules key every permission off a `staff` document whose id
 *    equals the Auth uid. Being signed in is not the same as being staff, so we
 *    resolve the staff record explicitly and surface "signed in but not staff"
 *    as its own state instead of an infinite spinner.
 *
 * 2. The staff record is cached in Dexie. Firebase Auth already persists the
 *    session offline, but the role and `businesses` array must also be readable
 *    with no connectivity, or the first load-shedding morning locks out the till.
 */

/**
 * The dev bypass is gated on BOTH an explicit env flag and Vite's DEV build
 * flag. `import.meta.env.DEV` is statically false in a production build, so
 * this branch — and the seeded admin below — is dropped at build time and
 * cannot be switched on in a deployed app by setting an environment variable.
 */
export const DEV_LOGIN_ENABLED =
  import.meta.env.DEV && import.meta.env.VITE_DEV_LOGIN === 'true';

const DEV_STAFF: Staff = {
  id: 'dev-admin',
  name: 'Dev Admin',
  email: 'dev@maliwash.local',
  role: 'admin',
  businesses: ['wash', 'parts', 'drive', 'track'],
  active: true,
  syncStatus: 'synced' // never pushed: this account does not exist in Firebase
};

const DEV_SESSION_KEY = 'mali_dev_session';

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'no_staff_record'; user: User }
  | { status: 'inactive'; staff: Staff }
  | { status: 'ready'; staff: Staff; user: User | null; isDevSession: boolean };

interface AuthContextValue {
  state: AuthState;
  /** Convenience: the staff record when fully signed in, else null. */
  staff: Staff | null;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInAsDev: () => Promise<void>;
  signOut: () => Promise<void>;
  canOperate: (business: string) => boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Resolve the staff record for a uid: Dexie first so it works offline, then
 * Firestore, caching the result locally for next time.
 */
async function resolveStaff(uid: string): Promise<Staff | null> {
  const local = await db.staff.get(uid);
  if (local) return local;
  return refreshStaffFromRemote(uid);
}

async function refreshStaffFromRemote(uid: string): Promise<Staff | null> {
  try {
    const snap = await getDoc(doc(firestore, 'staff', uid));
    if (!snap.exists()) return null;
    const staff = { ...(snap.data() as Staff), id: uid, syncStatus: 'synced' as const };
    await db.staff.put(staff);
    return staff;
  } catch (err) {
    // Offline, or rules rejected us. Fall back to whatever is cached.
    console.warn('Could not fetch staff record:', err);
    return (await db.staff.get(uid)) ?? null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let currentUser: User | null = null;

    // Restore a dev session across reloads so hot-reloading does not sign you out.
    if (DEV_LOGIN_ENABLED && sessionStorage.getItem(DEV_SESSION_KEY) === 'true') {
      void db.staff.put(DEV_STAFF).then(() => {
        if (!cancelled) {
          setState({ status: 'ready', staff: DEV_STAFF, user: null, isDevSession: true });
        }
      });
      return () => { cancelled = true; };
    }

    const applyStaffState = (staff: Staff | null, user: User) => {
      if (cancelled) return;
      if (!staff) setState({ status: 'no_staff_record', user });
      else if (!staff.active) setState({ status: 'inactive', staff });
      else setState({ status: 'ready', staff, user, isDevSession: false });
    };

    const refreshActiveStaff = async () => {
      const user = currentUser;
      if (!user || !navigator.onLine) return;
      try {
        const snap = await getDoc(doc(firestore, 'staff', user.uid));
        if (!snap.exists()) {
          applyStaffState(null, user);
          return;
        }
        const staff = { ...(snap.data() as Staff), id: user.uid, syncStatus: 'synced' as const };
        await db.staff.put(staff);
        applyStaffState(staff, user);
      } catch (error) {
        // A network outage must not lock an already-authorised attendant out.
        console.warn('Could not refresh staff access:', error);
      }
    };

    const unsub = onAuthStateChanged(auth, async user => {
      if (cancelled) return;
      currentUser = user;

      if (!user) {
        setState({ status: 'signed_out' });
        return;
      }

      const staff = await resolveStaff(user.uid);
      if (cancelled) return;

      applyStaffState(staff, user);
      // Cached access opens the offline app immediately; this second pass makes
      // online deactivation, role and business changes effective without reload.
      void refreshActiveStaff();
    });

    const onOnline = () => { void refreshActiveStaff(); };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refreshActiveStaff();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);
    const refreshTimer = window.setInterval(() => { void refreshActiveStaff(); }, 5 * 60_000);

    return () => {
      cancelled = true;
      unsub();
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(refreshTimer);
    };
  }, []);

  const value: AuthContextValue = {
    state,
    staff: state.status === 'ready' ? state.staff : null,
    isAdmin: state.status === 'ready' && state.staff.role === 'admin',

    canOperate: (business: string) =>
      state.status === 'ready' && state.staff.businesses.includes(business as never),

    signInWithEmail: async (email, password) => {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      // onAuthStateChanged drives the rest.
    },

    signInAsDev: async () => {
      if (!DEV_LOGIN_ENABLED) throw new Error('Dev login is not enabled in this build');
      await db.staff.put(DEV_STAFF);
      sessionStorage.setItem(DEV_SESSION_KEY, 'true');
      setState({ status: 'ready', staff: DEV_STAFF, user: null, isDevSession: true });
    },

    signOut: async () => {
      // Guarded so no dev-session identifier survives into a production bundle.
      if (DEV_LOGIN_ENABLED) sessionStorage.removeItem(DEV_SESSION_KEY);
      if (auth.currentUser) await fbSignOut(auth);
      setState({ status: 'signed_out' });
    }
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider');
  return ctx;
}

/** The staff record, or throw. For screens that are already behind the guard. */
export function useStaff(): Staff {
  const { staff } = useAuth();
  if (!staff) throw new Error('useStaff used outside an authenticated route');
  return staff;
}
