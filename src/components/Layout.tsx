import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSync } from '../lib/sync';
import { useAuth } from '../lib/auth';
import {
  CalendarDays, CarFront, Clock3, LayoutDashboard, LogOut, Building2, PackageOpen, CircleGauge, RadioTower,
  RefreshCw, Settings, Sparkles, TriangleAlert, TrendingUp, UsersRound, WalletCards
} from 'lucide-react';
import BrandMark from './BrandMark';

export default function Layout() {
  const { isOnline, syncing, lastSync, pendingCount, lastError, configured, signedIn, triggerSync } = useSync();
  const { staff, isAdmin, signOut, state, canOperate } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isDevSession = state.status === 'ready' && state.isDevSession;

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const navItems = [
    { path: '/', label: 'Holdings', icon: Building2, exact: true },
    { path: '/wash', label: 'Wash', icon: CarFront, business: 'wash' },
    { path: '/parts', label: 'Parts', icon: PackageOpen, business: 'parts' },
    { path: '/drive', label: 'Drive', icon: CircleGauge, business: 'drive' },
    { path: '/track', label: 'Track', icon: RadioTower, business: 'track' },
    { path: '/customers', label: 'Customers', icon: UsersRound },
    ...((staff?.businesses ?? []).some(business => business !== 'wash') ? [{ path: '/cash', label: 'Cash drawers', icon: WalletCards }] : []),
    { path: '/shifts', label: 'Shifts', icon: Clock3, business: 'wash' },
    { path: '/bookings', label: 'Bookings', icon: CalendarDays, business: 'wash' },
    { path: '/growth', label: 'Growth', icon: TrendingUp },
    { path: '/dashboard', label: 'Reports', icon: LayoutDashboard },
    ...(isAdmin ? [{ path: '/settings', label: 'Settings', icon: Settings }] : []),
  ].filter(item => !('business' in item) || canOperate(item.business));
  const mobileItems = navItems.filter(item => ['/', '/wash', '/parts', '/drive', '/track', '/customers'].includes(item.path));

  const status = !configured
    ? { dot: 'bg-ink-400', ring: 'bg-ink-400/30', label: pendingCount ? `Local · ${pendingCount}` : 'Local only' }
    : !signedIn
      ? { dot: 'bg-ink-400', ring: 'bg-ink-400/30', label: pendingCount ? `Local · ${pendingCount}` : 'Not syncing' }
      : !isOnline
        ? { dot: 'bg-accent-300', ring: 'bg-accent-300/30', label: pendingCount ? `${pendingCount} queued` : 'Offline' }
        : lastError
          ? { dot: 'bg-red-400', ring: 'bg-red-400/30', label: 'Sync issue' }
          : syncing
            ? { dot: 'bg-sky-300', ring: 'bg-sky-300/30', label: 'Syncing' }
            : pendingCount
              ? { dot: 'bg-accent-300', ring: 'bg-accent-300/30', label: `${pendingCount} queued` }
              : { dot: 'bg-emerald-400', ring: 'bg-emerald-400/30', label: 'All synced' };

  const initials = (staff?.name ?? '?').split(' ').filter(Boolean).slice(0, 2)
    .map(part => part[0]?.toUpperCase()).join('');

  return (
    <div className="flex h-dvh bg-background font-sans text-foreground overflow-hidden">
      <aside className="hidden md:flex w-[232px] brand-gradient mali-grid text-white flex-col shrink-0 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-56 h-56 rounded-full bg-brand-400/20 blur-3xl" />
        <div className="p-5 relative">
          <BrandMark inverse module="Holdings" />
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.13em] text-brand-100">
            <Sparkles className="w-3 h-3 text-accent-300" /> Ruwa Experience Hub
          </div>
        </div>

        <nav className="relative flex-1 px-3 py-2 space-y-1 overflow-y-auto" aria-label="Main navigation">
          {navItems.map(item => {
            const active = item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path);
            return (
              <Link key={item.path} to={item.path} aria-current={active ? 'page' : undefined}
                className={`pressable group flex items-center gap-3 h-12 px-3.5 rounded-xl font-bold text-sm transition-colors ${
                  active ? 'bg-white text-brand-950 shadow-lg' : 'text-brand-100/75 hover:bg-white/10 hover:text-white'
                }`}>
                <item.icon className={`w-5 h-5 ${active ? 'text-brand-700' : 'text-brand-200'}`} strokeWidth={active ? 2.4 : 1.9} />
                <span>{item.label}</span>
                {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-accent-400" />}
              </Link>
            );
          })}
        </nav>

        <div className="relative p-3">
          <div className="rounded-2xl border border-white/10 bg-white/8 p-3.5 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/15 grid place-items-center font-extrabold">{initials}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold truncate">{staff?.name ?? 'Active staff'}</p>
                <p className="text-[10px] uppercase tracking-widest text-brand-200/70 font-bold">{staff?.role ?? 'Staff'}</p>
              </div>
              <button onClick={handleSignOut} title="Sign out" className="pressable w-9 h-9 rounded-xl grid place-items-center hover:bg-white/10 text-brand-200">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <header className="h-[66px] bg-white/90 border-b border-border px-4 sm:px-6 flex items-center justify-between shrink-0 backdrop-blur-xl z-20">
          <div className="md:hidden"><BrandMark compact /></div>
          <div className="hidden md:block">
            <p className="mali-eyebrow">Mali Holdings · Automotive</p>
            <p className="text-sm font-semibold text-ink-500 mt-1">One customer. Every road.</p>
          </div>

          <div className="flex items-center gap-2.5 ml-auto">
            {isDevSession && <span className="hidden sm:inline-flex rounded-full bg-accent-100 text-accent-800 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider">Dev</span>}
            <button onClick={triggerSync} title={lastError || 'Sync now'}
              className="pressable flex items-center gap-2 h-10 px-3 rounded-xl border border-border bg-ink-50 hover:bg-white shadow-xs">
              <span className="relative flex w-2 h-2">
                <span className={`absolute inline-flex h-full w-full rounded-full ${status.ring} ${syncing ? 'animate-ping' : ''}`} />
                <span className={`relative inline-flex h-2 w-2 rounded-full ${status.dot}`} />
              </span>
              <span className="hidden sm:inline text-[10px] sm:text-xs font-extrabold uppercase tracking-wider text-ink-600">{status.label}</span>
              <RefreshCw className={`w-3.5 h-3.5 text-ink-400 ${syncing ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={handleSignOut} className="md:hidden pressable w-10 h-10 rounded-xl bg-ink-100 grid place-items-center text-ink-600" title="Sign out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {configured && !signedIn && isDevSession && (
          <div className="bg-accent-50 border-b border-accent-200 px-4 sm:px-6 py-2 flex items-center gap-2.5 text-xs text-accent-900 shrink-0 animate-in-fade">
            <TriangleAlert className="w-4 h-4 shrink-0 text-accent-600" />
            <span><b>Local preview.</b> Sign in with a staff account to sync with Mali Holdings.{pendingCount > 0 && ` ${pendingCount} changes are safe on this device.`}</span>
          </div>
        )}
        {configured && lastError && (
          <div className="bg-red-50 border-b border-red-200 px-4 sm:px-6 py-2 flex items-center gap-2.5 text-xs text-red-900 shrink-0 animate-in-fade">
            <TriangleAlert className="w-4 h-4 shrink-0 text-red-600" />
            <span className="flex-1"><b>Sync needs attention.</b> Your changes are safe on this device.</span>
            <button onClick={triggerSync} className="font-extrabold underline">Retry</button>
          </div>
        )}

        <main className="flex-1 flex overflow-hidden"><Outlet /></main>

        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 border-t border-border backdrop-blur-xl px-1 pb-[env(safe-area-inset-bottom)]" aria-label="Mobile navigation">
          <div className="h-[70px] flex items-stretch justify-around overflow-x-auto">
            {mobileItems.map(item => {
              const active = item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path);
              return (
                <Link key={item.path} to={item.path} aria-current={active ? 'page' : undefined}
                  className={`pressable min-w-[64px] flex flex-col items-center justify-center gap-1 text-[9px] font-extrabold uppercase tracking-wide ${active ? 'text-brand-800' : 'text-ink-400'}`}>
                  <span className={`grid place-items-center w-9 h-8 rounded-xl ${active ? 'bg-brand-100' : ''}`}>
                    <item.icon className="w-5 h-5" strokeWidth={active ? 2.5 : 1.9} />
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        <footer className="hidden md:flex h-7 bg-ink-950 items-center justify-between px-5 text-[9px] text-ink-400 font-bold uppercase tracking-widest shrink-0">
          <span>{configured && signedIn && lastSync ? `Last sync · ${lastSync.toLocaleTimeString()}` : status.label}</span>
          <span>Mali Holdings · Automotive OS v2.0</span>
        </footer>
      </div>
    </div>
  );
}
