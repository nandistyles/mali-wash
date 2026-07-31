# Deploying Mali Wash

## Order matters

Deploying the rules **before** a staff document exists locks everyone out —
including you. The rules key every permission off a `staff` document whose id
equals the Firebase Auth uid, and there is deliberately no self-service path to
create one. Do step 2 before step 3.

---

## 1. Sign in to the Firebase CLI

```bash
npx firebase login
```

Opens a browser. One-off per machine.

---

## 2. Create the first admin — BEFORE deploying rules

**a. Create the Auth user.** Firebase console → **Authentication** → **Users** →
*Add user*. Use an email/password you control. Copy the generated **User UID**.

> Email/password must be enabled as a sign-in provider:
> Authentication → Sign-in method → Email/Password → Enable.

**b. Create the staff document.** Firestore → make sure you are on the
**`ai-studio-maliwash-188ecc8a-cede-4af8-b85c-4b3d1d9a55d1`** database, not
`(default)` — this project uses a named database and the default one is empty.

Collection `staff`, **document ID = the User UID from step (a)**:

| Field | Type | Value |
|---|---|---|
| `id` | string | the same UID |
| `name` | string | your name |
| `email` | string | the email from (a) |
| `role` | string | `admin` |
| `businesses` | array | one string element: `wash` |
| `active` | boolean | `true` |

Get `businesses` wrong and you can sign in but cannot take money —
`canOperate('wash')` gates the till.

---

## 3. Deploy the rules

```bash
npm run deploy:rules
```

Then sign in to the app with the email/password from step 2a and confirm the POS
loads. If you see "No staff record", the document id does not match the uid.

---

## 4. Deploy the app

```bash
npm run deploy:hosting
```

Builds and publishes to Firebase Hosting. The public booking page is then live
at `https://<your-domain>/book`.

`npm run deploy` does rules and hosting together — only useful once step 2 is
done.

---

## Before real customer data goes in

- **The project is `gen-lang-client-0971315086`, an AI Studio scratch project.**
  Its API key is committed to a public repo. That is not itself the risk — a
  Firebase web key is an identifier, not a secret, and security comes from the
  rules. But customer records should live in a Mali-owned project you control
  the billing and access for. Create one, then set `VITE_FIREBASE_*` in
  `.env.local`; `firebase.ts` prefers those over the bundled config.
- **Turn on App Check.** The public booking form at `/book` is the one
  unauthenticated write in the database. Validation stops malformed writes, not
  a script.
- **Set a budget alert** on the Firebase project.

## Rolling back

```bash
npx firebase deploy --only firestore:rules --project gen-lang-client-0971315086
```

after `git checkout <old-sha> -- firestore.rules`. Hosting rollbacks are one
click in the console under Hosting → release history.
