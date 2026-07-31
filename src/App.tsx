/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './lib/auth';
import Layout from './components/Layout';
import POS from './pages/POS';
import Customers from './pages/Customers';
import Shifts from './pages/Shifts';
import Dashboard from './pages/Dashboard';
import Growth from './pages/Growth';
import Settings from './pages/Settings';
import Bookings from './pages/Bookings';
import PublicBooking from './pages/PublicBooking';
import Login from './pages/Login';

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
      <div className="min-h-screen flex items-center justify-center text-teal-600">
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
      </BrowserRouter>
    </AuthProvider>
  );
}
