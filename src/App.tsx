import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { lazy, Suspense, type ReactNode } from 'react';
import { AuthProvider, useAuth } from './lib/auth';
import BrandMark from './components/BrandMark';

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
const HoldingsOverview = lazy(() => import('./pages/HoldingsOverview'));
const BusinessWorkspace = lazy(() => import('./pages/BusinessWorkspace'));
const PartsOperations = lazy(() => import('./pages/PartsOperations'));
const DriveOperations = lazy(() => import('./pages/DriveOperations'));
const TrackOperations = lazy(() => import('./pages/TrackOperations'));

function ScreenLoader() {
  return (
    <div className="min-h-dvh grid place-items-center bg-ink-50">
      <div className="flex flex-col items-center gap-5 animate-in-fade">
        <BrandMark module="Holdings" />
        <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.15em] text-ink-400">
          <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" /> Preparing your workspace
        </div>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="min-h-dvh brand-gradient mali-grid text-white grid place-items-center p-5">
      <div className="text-center max-w-lg animate-in-up">
        <BrandMark inverse module="Holdings" className="justify-center mb-10" />
        <p className="mali-eyebrow text-accent-300 justify-center">404 · Wrong turn</p>
        <h1 className="brand-text-gradient text-5xl font-black tracking-[-0.05em] mt-4">This road ends here.</h1>
        <p className="text-brand-100/65 mt-4">The page you’re looking for has moved or never existed.</p>
        <Link to="/" className="inline-flex items-center gap-2 mt-8 bg-white text-brand-900 rounded-xl h-12 px-5 font-extrabold">
          <ArrowLeft className="w-4 h-4" /> Back to Mali Wash
        </Link>
      </div>
    </div>
  );
}

function AuthGuard({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  if (state.status === 'loading') return <ScreenLoader />;
  if (state.status !== 'ready') return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/pos" replace />;
  return <>{children}</>;
}

function BusinessOnly({ business, children }: { business: string; children: ReactNode }) {
  const { canOperate } = useAuth();
  if (!canOperate(business)) return <Navigate to="/" replace />;
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
              <Route index element={<HoldingsOverview />} />
              <Route path=":business" element={<BusinessWorkspace />} />
              <Route path="wash/pos" element={<BusinessOnly business="wash"><POS /></BusinessOnly>} />
              <Route path="parts/operations" element={<BusinessOnly business="parts"><PartsOperations /></BusinessOnly>} />
              <Route path="drive/operations" element={<BusinessOnly business="drive"><DriveOperations /></BusinessOnly>} />
              <Route path="track/operations" element={<BusinessOnly business="track"><TrackOperations /></BusinessOnly>} />
              <Route path="pos" element={<BusinessOnly business="wash"><POS /></BusinessOnly>} />
              <Route path="customers" element={<Customers />} />
              <Route path="shifts" element={<Shifts />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="growth" element={<Growth />} />
              <Route path="bookings" element={<Bookings />} />
              <Route path="settings" element={<AdminOnly><Settings /></AdminOnly>} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
