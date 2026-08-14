import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, LogIn, ShieldCheck, TriangleAlert, WifiOff, Wrench } from 'lucide-react';
import { useAuth, DEV_LOGIN_ENABLED } from '../lib/auth';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import BrandMark from '../components/BrandMark';

export default function Login() {
  const { state, signInWithEmail, signInAsDev, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (state.status === 'ready') navigate('/', { replace: true });
  }, [state.status, navigate]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signInWithEmail(email, password);
    } catch (err: any) {
      const code = err?.code || '';
      if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found'].includes(code)) setError('Wrong email or password.');
      else if (code === 'auth/network-request-failed') setError('No connection. Sign in online once on this device, then your session will work offline.');
      else if (code === 'auth/too-many-requests') setError('Too many attempts. Wait a minute and try again.');
      else setError(err?.message || 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

  const handleDevLogin = async () => {
    setBusy(true);
    setError('');
    try { await signInAsDev(); }
    catch (err: any) { setError(err?.message || 'Dev login failed'); }
    finally { setBusy(false); }
  };

  if (state.status === 'no_staff_record' || state.status === 'inactive') {
    const isInactive = state.status === 'inactive';
    return (
      <div className="min-h-dvh bg-ink-50 grid place-items-center p-5">
        <div className="w-full max-w-lg mali-glass rounded-[1.75rem] p-7 sm:p-9">
          <BrandMark module="Holdings" />
          <div className="w-14 h-14 rounded-2xl bg-accent-100 text-accent-700 grid place-items-center mt-8 mb-5">
            <TriangleAlert className="w-6 h-6" />
          </div>
          <h1 className="mali-title text-2xl">{isInactive ? 'Account deactivated' : 'Staff access not ready'}</h1>
          <p className="mali-subtitle mt-3">{isInactive
            ? 'An administrator needs to reactivate this staff account before it can operate a Mali business.'
            : 'Your sign-in is valid, but it has not been connected to a Mali Holdings staff profile yet.'}</p>
          {!isInactive && state.status === 'no_staff_record' && (
            <div className="mt-5 rounded-xl bg-ink-100 p-4 text-xs text-ink-600">
              <p className="font-bold mb-1.5">Account ID for your administrator</p>
              <code className="font-mono break-all text-ink-800">{state.user.uid}</code>
            </div>
          )}
          <Button onClick={() => signOut()} variant="outline" className="w-full mt-6">Sign out</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh grid lg:grid-cols-[1.08fr_0.92fr] bg-white">
      <section className="hidden lg:flex brand-gradient mali-grid relative overflow-hidden p-12 xl:p-16 text-white flex-col justify-between">
        <div className="absolute -top-40 -right-40 w-[34rem] h-[34rem] rounded-full bg-brand-400/25 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-[32rem] h-[32rem] rounded-full bg-accent-300/10 blur-3xl" />
        <BrandMark inverse module="Holdings" className="relative" />

        <div className="relative max-w-xl py-12">
          <p className="mali-eyebrow text-accent-300 mb-5"><ShieldCheck className="w-4 h-4" /> Mali automotive platform</p>
          <h1 className="brand-text-gradient text-5xl xl:text-6xl font-black leading-[0.98] tracking-[-0.055em]">
            Every customer.<br />Every visit.<br />Remembered.
          </h1>
          <p className="mt-7 text-lg leading-relaxed text-brand-100/75 max-w-lg">
            One operating system for every Mali automotive business—and every customer relationship.
          </p>
          <div className="grid grid-cols-3 gap-3 mt-10">
            {[
              ['Offline first', 'Never lose a sale'],
              ['One customer', 'Across every business'],
              ['AutoPoints', 'Loyalty that compounds'],
            ].map(([title, detail]) => (
              <div key={title} className="rounded-2xl border border-white/10 bg-white/8 p-4 backdrop-blur-sm">
                <CheckCircle2 className="w-4 h-4 text-accent-300 mb-3" />
                <p className="text-sm font-extrabold">{title}</p>
                <p className="text-[11px] text-brand-100/60 mt-1 leading-relaxed">{detail}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-[10px] uppercase tracking-[0.18em] text-brand-200/50 font-bold">Ruwa · Zimbabwe · Built to scale</p>
      </section>

      <main className="relative grid place-items-center p-5 sm:p-10 bg-[radial-gradient(circle_at_70%_10%,#d7f2ef_0%,transparent_32rem)]">
        <div className="w-full max-w-md animate-in-up">
          <div className="lg:hidden mb-10"><BrandMark module="Holdings" /></div>
          <p className="mali-eyebrow mb-3">Staff access</p>
          <h2 className="mali-title">Welcome back.</h2>
          <p className="mali-subtitle mt-2">Sign in once to access every business you operate.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {error && <div role="alert" className="rounded-xl bg-red-50 border border-red-200 p-3.5 text-sm text-red-800 flex gap-2.5"><TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" />{error}</div>}
            <div>
              <label htmlFor="email" className="label-caps block mb-2">Email address</label>
              <Input id="email" type="email" autoComplete="username" required value={email}
                onChange={event => setEmail(event.target.value)} placeholder="you@maliholdings.co.zw" />
            </div>
            <div>
              <label htmlFor="password" className="label-caps block mb-2">Password</label>
              <Input id="password" type="password" autoComplete="current-password" required value={password}
                onChange={event => setPassword(event.target.value)} placeholder="••••••••" />
            </div>
            <Button type="submit" size="lg" className="w-full group" disabled={busy}>
              <LogIn className="w-5 h-5" />
              {busy ? 'Signing in…' : 'Enter Mali Holdings'}
              {!busy && <ArrowRight className="w-4 h-4 ml-auto transition-transform group-hover:translate-x-0.5" />}
            </Button>
            <div className="flex items-center justify-center gap-2 text-xs text-ink-400"><WifiOff className="w-3.5 h-3.5" /> Your session stays available through network outages.</div>

            {DEV_LOGIN_ENABLED && (
              <div className="pt-5 border-t border-dashed border-ink-300">
                <Button type="button" onClick={handleDevLogin} variant="outline" disabled={busy} className="w-full">
                  <Wrench className="w-4 h-4" /> Preview as Dev Admin
                </Button>
                <p className="text-[10px] text-ink-400 text-center mt-2.5">Local development only · removed from production</p>
              </div>
            )}
          </form>
        </div>
      </main>
    </div>
  );
}
