import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSync } from '../lib/sync';
import { useAuth } from '../lib/auth';
import { Car, Users, LayoutDashboard, Settings as SettingsIcon, Clock, LogOut, Calendar, TriangleAlert, RefreshCw, TrendingUp } from 'lucide-react';

export default function Layout() {
  const { isOnline, syncing, lastSync, pendingCount, lastError, configured, signedIn, triggerSync } = useSync();
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
    { path: '/dashboard', label: 'Reports', icon: LayoutDashboard },
    ...(isAdmin ? [{ path: '/settings', label: 'Settings', icon: SettingsIcon }] : []),
  ];

  /*
   * The old header showed "Online · Synced" unconditionally whenever the
   * browser reported a connection — including while every push was being
   * rejected. It distinguishes connected, queued, and failing, because on this
   * network those are three different situations and only one is fine.
   */
  const status = !configured
    ? { dot: 'bg-ink-400', ring: 'bg-ink-400/30', label: pendingCount > 0 ? `Local only · ${pendingCount}` : 'Local only' }
    : !signedIn
    ? { dot: 'bg-ink-400', ring: 'bg-ink-400/30', label: pendingCount > 0 ? `Not syncing · ${pendingCount}` : 'Not syncing' }
    : !isOnline
    ? { dot: 'bg-accent-300', ring: 'bg-accent-300/30', label: pendingCount > 0 ? `Offline · ${pendingCount} queued` : 'Offline' }
    : lastError
    ? { dot: 'bg-red-400', ring: 'bg-red-400/30', label: 'Sync failing' }
    : syncing
    ? { dot: 'bg-sky-300', ring: 'bg-sky-300/30', label: 'Syncing…' }
    : pendingCount > 0
    ? { dot: 'bg-accent-300', ring: 'bg-accent-300/30', label: `${pendingCount} queued` }
    : { dot: 'bg-emerald-400', ring: 'bg-emerald-400/30', label: 'Synced' };

  const initials = (staff?.name ?? '?')
    .split(' ').filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('');

  return (
    <div className="flex flex-col h-screen bg-background font-sans text-foreground overflow-hidden">
      <header className="h-16 brand-gradient flex items-center justify-between px-5 text-white shrink-0 shadow-lg relative z-20">
        <div className="flex items-center gap-3 min-w-0">
          <div className="bg-white/95 p-2 rounded-xl text-brand-800 shadow-sm shrink-0">
            <Car className="w-5 h-5" strokeWidth={2.5} />
          </div>
          <div className="leading-none mr-2">
            <h1 className="text-lg font-bold tracking-tight">MALI WASH</h1>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-200/80 mt-1">Ruwa</p>
          </div>

          <button
            onClick={triggerSync}
            title={lastError || 'Tap to sync now'}
            className="pressable group flex items-center gap-2 bg-white/10 hover:bg-white/18 px-3 h-9 rounded-full border border-white/15 backdrop-blur-sm"
          >
            <span className="relative flex w-2 h-2 shrink-0">
              <span className={`absolute inline-flex h-full w-full rounded-full ${status.ring} ${syncing ? 'animate-ping' : ''}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${status.dot}`}></span>
            </span>
            <span className="font-bold uppercase tracking-wider text-[10px] whitespace-nowrap">{status.label}</span>
            <RefreshCw className={`w-3 h-3 opacity-60 group-hover:opacity-100 transition-opacity ${syncing ? 'animate-spin' : ''}`} />
          </button>

          {isDevSession && (
            <span className="hidden md:inline text-[10px] font-bold uppercase tracking-wider bg-accent-300 text-brand-950 px-2.5 py-1 rounded-full shadow-sm">
              Dev
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block leading-tight">
            <p className="text-sm font-semibold">{staff?.name ?? 'Active Session'}</p>
            <p className="text-[10px] uppercase tracking-wider text-brand-200/80 font-bold">{staff?.role ?? 'Staff'}</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-white/15 border border-white/20 grid place-items-center text-sm font-bold shrink-0">
            {initials}
          </div>
          <button
            onClick={handleSignOut}
            title="Sign out"
            className="pressable w-10 h-10 grid place-items-center rounded-xl bg-white/10 hover:bg-white/20 border border-white/15"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* A dev session has no Firebase account, so it can never sync. Say so
          plainly rather than letting it look like an outage. */}
      {configured && !signedIn && isDevSession && (
        <div className="bg-accent-50 border-b border-accent-200 px-5 py-2.5 flex items-center gap-3 text-sm text-accent-900 shrink-0 animate-in-fade">
          <TriangleAlert className="w-4 h-4 shrink-0 text-accent-600" />
          <span className="flex-1">
            <b>Dev session — not syncing.</b> This login has no Firebase account, so nothing reaches
            the <code className="bg-accent-100 px-1.5 py-0.5 rounded text-xs font-mono">maliholdings</code> project.
            {pendingCount > 0 && <> {pendingCount} record{pendingCount === 1 ? '' : 's'} queued locally.</>}
          </span>
        </div>
      )}

      {/* A failing sync is silent money loss, so it gets a banner, not a log line. */}
      {configured && lastError && (
        <div className="bg-red-50 border-b border-red-200 px-5 py-2.5 flex items-center gap-3 text-sm text-red-900 shrink-0 animate-in-fade">
          <TriangleAlert className="w-4 h-4 shrink-0 text-red-600" />
          <span className="flex-1 truncate">
            <b>Sync failing.</b> {pendingCount} record{pendingCount === 1 ? '' : 's'} waiting locally — nothing is lost, but this device is not backed up.
          </span>
          <button onClick={triggerSync} className="font-bold underline shrink-0 hover:no-underline">Retry</button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <nav className="w-[84px] bg-card border-r border-border flex flex-col items-center py-4 gap-1 shrink-0 overflow-y-auto z-10">
          {navItems.map(item => {
            const active = location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                aria-current={active ? 'page' : undefined}
                className="pressable group relative flex flex-col items-center gap-1.5 w-full py-2.5 rounded-xl"
              >
                {/* Active rail: a position cue that survives sunlight better
                    than a colour change alone. */}
                <span
                  className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-full bg-brand-600 transition-all duration-200 ${
                    active ? 'h-9 opacity-100' : 'h-0 opacity-0'
                  }`}
                />
                <div
                  className={`p-2.5 rounded-xl transition-colors duration-150 ${
                    active
                      ? 'bg-brand-100 text-brand-800'
                      : 'text-ink-400 group-hover:bg-ink-100 group-hover:text-ink-700'
                  }`}
                >
                  <item.icon className="w-[22px] h-[22px]" strokeWidth={active ? 2.4 : 2} />
                </div>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider text-center leading-none transition-colors ${
                    active ? 'text-brand-800' : 'text-ink-400 group-hover:text-ink-600'
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            )
          })}
        </nav>

        <main className="flex-1 flex overflow-hidden">
          <Outlet />
        </main>
      </div>

      <footer className="h-7 bg-ink-900 flex items-center justify-between px-5 text-[10px] text-ink-400 font-semibold shrink-0 tracking-wide">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
          <span>
            {configured
              ? signedIn
                ? isOnline
                  ? `SYNCED${lastSync ? ` · ${lastSync.toLocaleTimeString()}` : ''}`
                  : 'OFFLINE — QUEUING LOCALLY'
                : 'NOT SYNCING'
              : 'LOCAL ONLY — NO PROJECT CONFIGURED'}
          </span>
        </div>
        <div className="flex gap-5 uppercase">
          <span className="text-ink-500">{location.pathname.replace('/', '') || 'pos'}</span>
          <span className="text-ink-600">MALI WASH v1.1</span>
        </div>
      </footer>
    </div>
  );
}
