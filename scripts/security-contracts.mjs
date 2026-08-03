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

console.log('Security contracts passed.');
