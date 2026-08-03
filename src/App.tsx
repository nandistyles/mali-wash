/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense, type ReactNode } from 'react';
import { AuthProvider, useAuth } from './lib/auth';

// Each screen is loaded only when it is opened. This keeps the public booking
// form and the forecourt till from downloading charts and admin screens they do
// not use, which matters on mobile data and makes cold starts much faster.
const Layout = lazy(() => import('./components/Layout'));
const POS = lazy(() => import('./pages/POS'));
const Customers = lazy(() => import('./pages/Customers'));
const Shifts = lazy(() => import('./pages/Shifts'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Growth = lazy(() => import('./pages/Growth'));
const Settings = lazy(() => import('./pages/Settings'));
const Bookings = lazy(() => import('./pages/Bookings'));
const PublicBooking = lazy(() => import('./pages/PublicBooking'));
const Login = lazy(() => import('./pages/Login'));

function ScreenLoader() {
  return (
    <div className="min-h-screen grid place-items-center bg-ink-50 text-brand-700 font-semibold">
      Loading Mali Wash…
    </div>
  );
}

/**
 * Route guard.
 *
 * The previous version treated "a Firebase user exists" as authorisation. It
 * isn't: the Firestore rules key every permission off a staff document, so a
 * signed-in account with no staff record would load the whole app and then fail
 * every read with a silent permission error. The guard now waits for the staff
 * record to resolve and sends the unresolved cases back to /login, which
 * explains what is wrong.
 */
function AuthGuard({ children }: { children: ReactNode }) {
  const { state } = useAuth();

  if (state.status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center text-brand-600">
        Loading…
      </div>
    );
  }

  if (state.status !== 'ready') {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

/** Admin-only screens. Attendants must not be able to edit pricing. */
function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/pos" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<ScreenLoader />}>
          <Routes>
            <Route path="/book" element={<PublicBooking />} />
            <Route path="/login" element={<Login />} />

            <Route path="/" element={<AuthGuard><Layout /></AuthGuard>}>
              <Route index element={<Navigate to="/pos" replace />} />
              <Route path="pos" element={<POS />} />
              <Route path="customers" element={<Customers />} />
              <Route path="shifts" element={<Shifts />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="growth" element={<Growth />} />
              <Route path="bookings" element={<Bookings />} />
              <Route path="settings" element={<AdminOnly><Settings /></AdminOnly>} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
