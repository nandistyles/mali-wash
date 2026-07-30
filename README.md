# Mali Wash

A modern, offline-first Point-of-Sale (POS) and Customer Management Progressive Web App (PWA) designed for Mali Wash in Ruwa, Zimbabwe.

## Core Features

- **Offline-First**: Uses Dexie.js (IndexedDB) to store all data locally. Transactions and customer updates happen instantly, even with zero connectivity.
- **Background Sync**: Automatically pushes data to Firebase Firestore when the internet connection returns.
- **Customer Loyalty**: Built-in points system, trackable by phone number.
- **Memberships**: Manage basic and premium membership tiers with zero-dollar automated pricing for covered washes.
- **Referrals**: Every customer gets a unique referral code.
- **Shift Management**: Track opening floats, expected totals, and physical cash counts for easy daily reconciliation.
- **Installable PWA**: Can be installed directly to the home screen on iOS and Android devices for a native-like experience.

## Technical Stack

- React 18
- Vite
- Tailwind CSS
- Dexie.js (Local offline database)
- Firebase Firestore (Cloud database)
- Firebase Auth (Authentication - to be wired up for full production)
- React Router

## Setup Instructions

### 1. Environment Variables

Copy the `.env.example` file to `.env.local` and fill in your details:

\`\`\`bash
cp .env.example .env.local
\`\`\`

You will need:
- **Firebase Config**: Create a new Firebase project, enable Firestore and Authentication, and copy the config keys into the \`VITE_FIREBASE_*\` variables.
- **WhatsApp API**: If you want real WhatsApp integration, provide your Meta Developer Cloud API token and phone number ID.

### 2. Run the App

The dependencies are already installed. Start the development server:

\`\`\`bash
npm run dev
\`\`\`

### 3. PWA Icons

For the app to be fully installable as a PWA, you must place the following icon files in the \`public\` folder:
- \`pwa-192x192.png\` (192x192 pixels)
- \`pwa-512x512.png\` (512x512 pixels)

### 4. Firestore Security Rules

When deploying, ensure your Firestore security rules restrict access to authenticated staff members. For this offline-first architecture, the sync service pulls and pushes whole documents, so role-based access control (RBAC) should be implemented on the collections.

## Usage

1. **POS**: The primary screen. Search for a customer by phone number, or process an anonymous walk-in. Select the service, payment method, and hit Charge.
2. **Customers**: Look up customer histories, points, and referral codes.
3. **Shifts**: Open a shift at the start of the day. All transactions tie to the open shift. Close it at the end of the day by entering the counted physical cash to calculate variance.
4. **Settings**: Adjust pricing and points rules here (saved locally/synced globally).
5. **Public Booking**: A lightweight form at \`/book\` for customers to request a wash time.

## Future Expansion

The data model uses a single unified \`customers\` collection indexed by phone number. When expanding into Mali Auto Parts or Mali Vehicle Tracking, those modules can link back to this same customer record, allowing points and referrals to be shared seamlessly across the entire group.
