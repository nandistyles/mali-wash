# Deploying Mali Wash

## Read this first

The `firebase-applet-config.json` committed to this repo points at
`gen-lang-client-0971315086` — an AI Studio project belonging to a **different
application**. It is not the Mali Wash backend and must never hold Mali Wash
customer data.

Until you set `VITE_FIREBASE_*` in `.env.local`, the app runs **local only**:
everything works, Dexie holds the data, and sync is switched off on purpose so
records cannot land in that other project. The header says "Local only" and a
banner explains it. Nothing is lost — queued records sync the moment a real
project is configured.

So the first job is not deploying. It is creating a Mali-owned Firebase project.

---

## 1. Create the Mali Firebase project

Console → <https://console.firebase.google.com> → **Add project**.

- Name it something like `mali-wash` or `mali-platform`.
- Per the platform spec, **one Firebase project serves every Mali business** —
  Wash, Parts, Drive, Track all share `customers`, `transactions`,
  `pointsLedger`, `referrals` and `staff`. Name it for the group, not the wash,
  so you are not renaming it when Parts opens.
- Amani stays completely separate. Different project, different repo. Do not
  merge them.

Then, inside the project:

**a. Firestore** → *Create database* → production mode → region
`europe-west1` or `europe-west3` (closest to Zimbabwe with good pricing).
Use the **default** database unless you have a reason not to — this repo's
`firebase.json` targets the default one now.

**b. Authentication** → *Get started* → **Email/Password** → Enable.

**c. Project settings** → *Your apps* → **Add app** → Web (`</>`). Register it
and copy the config block it shows you.

---

## 2. Point the app at it

Create `.env.local` (gitignored) from the values in step 1c:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=mali-wash.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=mali-wash
VITE_FIREBASE_STORAGE_BUCKET=mali-wash.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...

# Only if you created a NAMED database instead of the default one:
# VITE_FIREBASE_DATABASE_ID=your-database-name

VITE_DEV_LOGIN=true
```

Set the project id for the CLI too, in `.firebaserc`:

```json
{ "projects": { "default": "mali-wash" } }
```

Restart `npm run dev`. The header should stop saying "Local only".

---

## 3. Create the first admin — BEFORE deploying rules

Deploying the rules before a staff document exists locks everyone out,
including you. The rules key every permission off a `staff` document whose id
equals the Firebase Auth uid, and there is deliberately no self-service path to
create one — that path was a privilege-escalation hole.

**a. Create the Auth user.** Authentication → **Users** → *Add user*. Use an
email and a password you control. Copy the generated **User UID**.

**b. Create the staff document.** Firestore → collection `staff` →
**document ID = the User UID from (a)**:

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

## 4. Deploy the rules

```bash
npx firebase login
```

```bash
npm run deploy:rules
```

Sign in to the app with the email/password from 3a and confirm the POS loads.
"No staff record" means the document id does not match the uid — the screen
prints the uid you need.

---

## 5. Deploy the app

```bash
npm run deploy:hosting
```

The public booking page is then live at `https://<your-domain>/book`.
`npm run deploy` does rules and hosting together.

---

## Before real customer data goes in

- **Turn on App Check.** `/book` is the one unauthenticated write in the
  database. Validation stops malformed writes, not a script hammering it.
- **Set a budget alert** on the project.
- **Rotate nothing, but do delete** `firebase-applet-config.json` once
  `.env.local` is working — it only exists as a boot fallback and it names
  another team's project.

## Rolling back

```bash
git checkout <old-sha> -- firestore.rules
```

then redeploy. Hosting rollbacks are one click under Hosting → release history.
