import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, DEV_LOGIN_ENABLED, BOOTSTRAP_ADMIN_UID } from '../lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Car, LogIn, TriangleAlert, Wrench } from 'lucide-react';

/**
 * Staff sign-in. Email/password per platform spec 4.1 — Google popup was
 * replaced because a popup flow cannot complete without connectivity, and the
 * till has to open on a load-shedding morning.
 */
export default function Login() {
  const { state, signInWithEmail, signInAsDev, signOut, provisionBootstrapAdmin } = useAuth();
  const [adminName, setAdminName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (state.status === 'ready') navigate('/pos', { replace: true });
  }, [state.status, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signInWithEmail(email, password);
    } catch (err: any) {
      // Firebase error codes are not readable by a car wash attendant.
      const code = err?.code || '';
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        setError('Wrong email or password.');
      } else if (code === 'auth/network-request-failed') {
        setError('No connection. You must sign in online at least once on this device.');
      } else if (code === 'auth/too-many-requests') {
        setError('Too many attempts. Wait a minute and try again.');
      } else {
        setError(err?.message || 'Could not sign in.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDevLogin = async () => {
    setBusy(true);
    setError('');
    try {
      await signInAsDev();
    } catch (err: any) {
      setError(err?.message || 'Dev login failed');
    } finally {
      setBusy(false);
    }
  };

  // Signed in to Firebase but with no staff record, the rules will reject every
  // read. Say so plainly instead of bouncing back to a blank login form.
  if (state.status === 'no_staff_record' || state.status === 'inactive') {
    const isInactive = state.status === 'inactive';
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-xl border-2 border-amber-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700">
              <TriangleAlert className="w-5 h-5" />
              {isInactive ? 'Account deactivated' : 'No staff record'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-600">
              {isInactive
                ? 'This account has been deactivated. Ask an admin to reactivate it.'
                : 'You signed in, but there is no staff record for this account, so you have no access to any data.'}
            </p>
            {!isInactive && state.status === 'no_staff_record' && (
              state.user.uid === BOOTSTRAP_ADMIN_UID ? (
                // The founding admin can provision itself; the rules allow this
                // uid and no other. Saves creating the document by hand.
                <div className="space-y-3 border-t pt-4">
                  <p className="text-sm text-slate-700">
                    This is the founding admin account. Set up your staff record now:
                  </p>
                  <input
                    value={adminName}
                    onChange={e => setAdminName(e.target.value)}
                    placeholder="Your name"
                    className="w-full h-11 px-3 border-2 border-slate-200 rounded-md focus:border-teal-500 focus:outline-none"
                  />
                  <Button
                    className="w-full h-11"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setError('');
                      try {
                        await provisionBootstrapAdmin(adminName);
                      } catch (err: any) {
                        setError(
                          err?.code === 'permission-denied'
                            ? 'Rules refused this. Deploy the current firestore.rules, then retry.'
                            : err?.message || 'Could not create the staff record.'
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {busy ? 'Setting up…' : 'Set up my admin account'}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-slate-500 font-mono bg-slate-100 p-3 rounded border break-all">
                  An admin must create a document in the <b>staff</b> collection with the id:
                  <br />
                  <b className="text-slate-800">{state.user.uid}</b>
                </p>
              )
            )}
            <Button onClick={() => signOut()} variant="outline" className="w-full">
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="mb-8 text-center flex flex-col items-center">
        <div className="w-16 h-16 bg-teal-600 rounded-2xl flex items-center justify-center mb-4 text-white shadow-lg">
          <Car className="w-8 h-8" />
        </div>
        <h1 className="text-3xl font-bold text-teal-900 mb-2">Mali Wash</h1>
        <p className="text-slate-600">Staff Portal</p>
      </div>

      <Card className="w-full max-w-md shadow-xl">
        <CardHeader>
          <CardTitle className="text-center text-xl">Sign In</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 text-red-700 text-sm rounded-md border border-red-200">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full h-12 px-3 border-2 border-slate-200 rounded-md focus:border-teal-500 focus:outline-none text-base"
                placeholder="you@maliwash.co.zw"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full h-12 px-3 border-2 border-slate-200 rounded-md focus:border-teal-500 focus:outline-none text-base"
                placeholder="••••••••"
              />
            </div>

            <Button type="submit" className="w-full h-12 flex items-center gap-2" disabled={busy}>
              <LogIn className="w-5 h-5" />
              {busy ? 'Signing in…' : 'Sign In'}
            </Button>

            {DEV_LOGIN_ENABLED && (
              <div className="pt-4 mt-4 border-t border-dashed border-slate-300">
                <Button
                  type="button"
                  onClick={handleDevLogin}
                  variant="outline"
                  disabled={busy}
                  className="w-full h-12 flex items-center gap-2 border-amber-400 text-amber-700 hover:bg-amber-50"
                >
                  <Wrench className="w-5 h-5" />
                  Continue as Dev Admin
                </Button>
                <p className="text-[11px] text-slate-500 text-center mt-2">
                  Local development only — this button does not exist in a production build.
                </p>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
