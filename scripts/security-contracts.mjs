import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = path => readFileSync(join(root, path), 'utf8');

const rules = read('firestore.rules');
const booking = read('src/pages/PublicBooking.tsx');
const firebase = read('src/lib/firebase.ts');
const auth = read('src/lib/auth.tsx');
const sync = read('src/lib/sync.ts');
const routes = read('src/App.tsx');
const whatsapp = read('src/lib/whatsapp.ts');
const customers = read('src/lib/customers.ts');
const operations = read('src/lib/businessOperations.ts');
const track = read('src/pages/TrackOperations.tsx');
const pwa = read('vite.config.ts');

assert.doesNotMatch(
  `${rules}\n${auth}`,
  /BYlc3JPiRhaBtlDjx87qhjealvG2|BOOTSTRAP_ADMIN_UID/,
  'The one-time bootstrap administrator path must not return.'
);

assert.match(rules, /existing\(\)\.status == 'completed'/);
assert.match(rules, /incoming\(\)\.status == 'voided'/);
assert.match(rules, /hasOnly\(\['voidReason', 'voidedAt'\]\)/);
assert.match(
  rules,
  /allow get: if isStaff\(\) \|\| settingsId == 'global'/,
  'Public clients may fetch only the exact global settings document.'
);

assert.match(booking, /setDoc\(doc\(firestore, 'bookings', bookingId\)/);
assert.doesNotMatch(
  booking,
  /db\.bookings\.add|notifyLocalWrite/,
  'A public booking must not be left in the visitor’s local database.'
);

assert.match(firebase, /initializeAppCheck/);
assert.match(firebase, /ReCaptchaEnterpriseProvider/);
assert.match(firebase, /VITE_FIREBASE_APPCHECK_SITE_KEY/);

assert.match(sync, /canSyncTable/);
assert.match(sync, /TABLE_BUSINESS/);
assert.match(sync, /watermarkKey\(access\.staff\.id\)/);
assert.match(routes, /path="shifts" element={<BusinessOnly business="wash">/);
assert.match(routes, /path="bookings" element={<BusinessOnly business="wash">/);

assert.doesNotMatch(whatsapp, /VITE_WHATSAPP_API_TOKEN|VITE_WHATSAPP_PHONE_NUMBER_ID/,
  'WhatsApp secrets must never be bundled into the browser.');
assert.match(whatsapp, /VITE_WHATSAPP_PROXY_URL/);

assert.match(customers, /customerIdForPhone/);
assert.match(customers, /id: `referral_\$\{customerId\}`/);
assert.match(operations, /inventoryMovements/);
assert.match(operations, /collectTrackingRenewal/);
assert.match(operations, /Open the \$\{input\.business\} cash drawer before taking cash/);
assert.match(track, /value=\{payment\}/);
assert.match(track, /Cash USD/);

assert.match(rules, /match \/inventoryMovements\/\{movementId\}/);
assert.match(rules, /match \/cashSessions\/\{sessionId\}/);
assert.match(rules, /staffCanOperate\(incoming\(\)\.staffId, incoming\(\)\.business\)/);
assert.match(rules, /data\.type == 'adjustment' && isSupervisor\(\)/);
assert.match(pwa, /name: 'Mali Holdings Automotive OS'/);
assert.doesNotMatch(pwa, /short_name: 'Mali Wash'/);

console.log('Security contracts passed.');
