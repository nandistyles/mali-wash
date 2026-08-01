import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ConfigError from './pages/ConfigError.tsx';
import { isFirebaseConfigured } from './lib/firebase';
import './index.css';

// Register PWA Service Worker
import { registerSW } from 'virtual:pwa-register';
registerSW({ immediate: true });

/**
 * A production build with no Firebase project configured is not a working app —
 * it is an app pointed at the bundled AI Studio fallback, which belongs to a
 * different application. In development that degrades to local-only and prints a
 * warning, which is fine. In production it is a deployment fault: the operator
 * believes they shipped Mali Wash and every sale is stranded in one browser.
 *
 * This happened for real — a Vercel build with no VITE_FIREBASE_* variables set
 * shipped the fallback key, and staff sign-in failed against a project their
 * accounts do not exist in. Failing loudly at startup beats a login screen that
 * looks fine and rejects the correct password.
 */
const root = createRoot(document.getElementById('root')!);

if (import.meta.env.PROD && !isFirebaseConfigured) {
  root.render(<StrictMode><ConfigError /></StrictMode>);
} else {
  root.render(<StrictMode><App /></StrictMode>);
}
