/**
 * Shown instead of the app when a production build has no Firebase project
 * configured. Deliberately blunt: this is a deployment fault, and the operator
 * needs the fix, not an apology.
 */
export default function ConfigError() {
  const vars = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_APP_ID',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID'
  ];

  return (
    <div className="min-h-screen bg-ink-50 flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-white rounded-xl shadow-xl border-2 border-red-200 overflow-hidden">
        <div className="bg-red-600 text-white px-6 py-4">
        <h1 className="text-xl font-bold">Mali Holdings is not configured</h1>
        </div>

        <div className="p-6 space-y-4 text-ink-700">
          <p>
            This build has no Firebase project set, so it would fall back to a bundled
            configuration belonging to a <b>different application</b>. Rather than run
            against the wrong database, the app has stopped.
          </p>

          <p className="text-sm">
            Set these environment variables in your hosting provider and redeploy. They are
            read at <b>build</b> time, not at runtime, so a redeploy is required —
            setting them without rebuilding changes nothing.
          </p>

          <ul className="text-xs font-mono bg-ink-100 rounded border p-3 space-y-1">
            {vars.map(v => <li key={v}>{v}</li>)}
          </ul>

          <p className="text-sm text-ink-500">
            Values come from the Firebase console under Project settings → Your apps → SDK
            setup and configuration.
          </p>
        </div>
      </div>
    </div>
  );
}
