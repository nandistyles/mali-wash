import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSync } from '../lib/sync';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { Car, Users, LayoutDashboard, Settings as SettingsIcon, Clock, LogOut, Cloud, CloudOff, Calendar } from 'lucide-react';

export default function Layout() {
  const { isOnline, syncing, lastSync } = useSync();
  const location = useLocation();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    if (auth) {
      await signOut(auth);
    }
    navigate('/login');
  };

  const navItems = [
    { path: '/pos', label: 'POS', icon: Car },
    { path: '/customers', label: 'Customers', icon: Users },
    { path: '/shifts', label: 'Shifts', icon: Clock },
    { path: '/bookings', label: 'Bookings', icon: Calendar },
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/settings', label: 'Settings', icon: SettingsIcon },
  ];

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {/* Top Header */}
      <header className="h-16 bg-[#004D4D] flex items-center justify-between px-6 text-white shrink-0 border-b-4 border-teal-600">
        <div className="flex items-center gap-4">
          <div className="bg-white p-1.5 rounded-lg text-[#004D4D]">
            <Car className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">MALI WASH</h1>
          <div className="h-6 w-px bg-teal-800 mx-2"></div>
          
          <div className="flex items-center gap-2 text-sm bg-teal-900/50 px-3 py-1 rounded-full border border-teal-400/30">
            {isOnline ? (
              <>
                <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                <span className="font-semibold uppercase tracking-wider text-[10px]">
                  Online {syncing ? "Syncing..." : "Synced"}
                </span>
              </>
            ) : (
              <>
                <div className="w-2 h-2 rounded-full bg-amber-400"></div>
                <span className="font-semibold uppercase tracking-wider text-[10px]">Offline</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right hidden sm:block">
            <p className="text-xs opacity-80 uppercase font-semibold">Staff</p>
            <p className="text-sm font-medium">Active Session</p>
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

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Nav */}
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

        {/* Main Content */}
        <main className="flex-1 flex overflow-hidden">
          <Outlet />
        </main>
      </div>
      
      {/* Footer */}
      <footer className="h-8 bg-slate-800 flex items-center justify-between px-6 text-[10px] text-slate-400 font-bold shrink-0">
        <div>
          DB SYNC STATUS: <span className={isOnline ? "text-emerald-400" : "text-amber-400"}>
            {isOnline ? `OK ${lastSync ? `(LAST: ${lastSync.toLocaleTimeString()})` : ''}` : 'OFFLINE'}
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
