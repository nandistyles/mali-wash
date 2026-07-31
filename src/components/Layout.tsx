import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSync } from '../lib/sync';
import { useAuth } from '../lib/auth';
import { Car, Users, LayoutDashboard, Settings as SettingsIcon, Clock, LogOut, Calendar, TriangleAlert, RefreshCw, TrendingUp } from 'lucide-react';

export default function Layout() {
  const { isOnline, syncing, lastSync, pendingCount, lastError, triggerSync } = useSync();
  const { staff, isAdmin, signOut, state } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isDevSession = state.status === 'ready' && state.isDevSession;

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const navItems = [
    { path: '/pos', label: 'POS', icon: Car },
    { path: '/customers', label: 'Customers', icon: Users },
    { path: '/shifts', label: 'Shifts', icon: Clock },
    { path: '/bookings', label: 'Bookings', icon: Calendar },
    { path: '/growth', label: 'Growth', icon: TrendingUp },
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ...(isAdmin ? [{ path: '/settings', label: 'Settings', icon: SettingsIcon }] : []),
  ];

  /*
   * The old header showed "Online · Synced" unconditionally whenever the
   * browser reported a connection — including while every push was being
   * rejected. It now distinguishes connected, queued, and failing, because on
   * this network those are three different situations and only one is fine.
   */
  const status = !isOnline
    ? { dot: 'bg-amber-400', label: pendingCount > 0 ? `Offline · ${pendingCount} queued` : 'Offline' }
    : lastError
      ? { dot: 'bg-red-400', label: 'Sync failing' }
      : syncing
        ? { dot: 'bg-sky-400', label: 'Syncing…' }
        : pendingCount > 0
          ? { dot: 'bg-amber-400', label: `${pendingCount} queued` }
          : { dot: 'bg-emerald-400', label: 'Synced' };

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      <header className="h-16 bg-[#004D4D] flex items-center justify-between px-6 text-white shrink-0 border-b-4 border-teal-600">
        <div className="flex items-center gap-4">
          <div className="bg-white p-1.5 rounded-lg text-[#004D4D]">
            <Car className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">MALI WASH</h1>
          <div className="h-6 w-px bg-teal-800 mx-2"></div>

          <button
            onClick={triggerSync}
            title={lastError || 'Tap to sync now'}
            className="flex items-center gap-2 text-sm bg-teal-900/50 px-3 py-1 rounded-full border border-teal-400/30 hover:bg-teal-900/80 transition-colors"
          >
            <div className={`w-2 h-2 rounded-full ${status.dot}`}></div>
            <span className="font-semibold uppercase tracking-wider text-[10px]">{status.label}</span>
            <RefreshCw className={`w-3 h-3 opacity-70 ${syncing ? 'animate-spin' : ''}`} />
          </button>

          {isDevSession && (
            <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-400 text-amber-950 px-2 py-1 rounded">
              Dev session
            </span>
          )}
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right hidden sm:block">
            <p className="text-xs opacity-80 uppercase font-semibold">{staff?.role ?? 'Staff'}</p>
            <p className="text-sm font-medium">{staff?.name ?? 'Active Session'}</p>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 bg-teal-700 px-4 py-2 rounded text-sm font-bold border border-teal-500 hover:bg-teal-600 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* A failing sync is silent money loss, so it gets a banner, not a log line. */}
      {lastError && (
        <div className="bg-red-50 border-b-2 border-red-200 px-6 py-2 flex items-center gap-3 text-sm text-red-800 shrink-0">
          <TriangleAlert className="w-4 h-4 shrink-0" />
          <span className="flex-1 truncate">
            <b>Sync failing.</b> {pendingCount} record{pendingCount === 1 ? '' : 's'} waiting locally — nothing is lost, but this device is not backed up. {lastError}
          </span>
          <button onClick={triggerSync} className="font-bold underline shrink-0">Retry</button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <nav className="w-20 bg-white border-r border-slate-200 flex flex-col items-center py-6 gap-6 shrink-0 overflow-y-auto">
          {navItems.map(item => {
            const active = location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center gap-1 transition-colors ${
                  active ? 'text-[#004D4D]' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <div className={`p-3 rounded-xl transition-colors ${
                  active ? 'bg-teal-100' : 'hover:bg-slate-100'
                }`}>
                  <item.icon className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-center">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <main className="flex-1 flex overflow-hidden">
          <Outlet />
        </main>
      </div>

      <footer className="h-8 bg-slate-800 flex items-center justify-between px-6 text-[10px] text-slate-400 font-bold shrink-0">
        <div>
          DB SYNC STATUS:{' '}
          <span className={lastError ? 'text-red-400' : isOnline ? 'text-emerald-400' : 'text-amber-400'}>
            {isOnline
              ? `OK ${lastSync ? `(LAST: ${lastSync.toLocaleTimeString()})` : ''}`
              : 'OFFLINE'}
          </span>
        </div>
        <div className="flex gap-6 uppercase">
          <span>{location.pathname.replace('/', '') || 'Dashboard'}</span>
          <span>© MALI WASH v1.0.4</span>
        </div>
      </footer>
    </div>
  );
}
