/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './lib/firebase';
import Layout from './components/Layout';
import POS from './pages/POS';
import Customers from './pages/Customers';
import Shifts from './pages/Shifts';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Bookings from './pages/Bookings';
import PublicBooking from './pages/PublicBooking';
import Login from './pages/Login';

function AuthGuard({ children }: { children: import("react").ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    // If Firebase isn't configured yet, allow bypass for development
    if (!auth) {
      setIsAuthenticated(true);
      return;
    }

    const unsub = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(!!user);
    });
    return unsub;
  }, []);

  if (isAuthenticated === null) {
    return <div className="min-h-screen flex items-center justify-center text-teal-600">Loading...</div>;
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
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
          <Route path="settings" element={<Settings />} />
          <Route path="bookings" element={<Bookings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
