const fs = require('fs');

let syncCode = fs.readFileSync('src/lib/sync.ts', 'utf8');
syncCode = syncCode.replace(/import { db as firestore, handleFirestoreError, OperationType } from '\.\/firebase';/g, "import { db as firestore } from './firebase';");
syncCode = syncCode.replace(/handleFirestoreError\(error, OperationType\.WRITE, tableName\);/g, 'console.error("Write failed", error);');
syncCode = syncCode.replace(/handleFirestoreError\(error, OperationType\.GET, tableName\);/g, 'console.error("Get failed", error);');
fs.writeFileSync('src/lib/sync.ts', syncCode);

let posCode = fs.readFileSync('src/pages/POS.tsx', 'utf8');
// Fix 'vehicles?.[0]?.makeModel' assignment bug:
posCode = posCode.replace(/newCustomer = \{[\s\S]*?\};/, "newCustomer = { name: '', phone: '', vehicleMakeModel: '', referredByCode: '' };");
posCode = posCode.replace(/setNewCustomer\(\{ name: '', phone: '', vehicles\?\.\[0\]\?\.makeModel: '', referredByCode: '' \}\);/, "setNewCustomer({ name: '', phone: '', vehicleMakeModel: '', referredByCode: '' });");
fs.writeFileSync('src/pages/POS.tsx', posCode);

let custCode = fs.readFileSync('src/pages/Customers.tsx', 'utf8');
custCode = custCode.replace(/selectedCustomer\.vehicleMakeModel/g, "selectedCustomer.vehicles?.[0]?.makeModel");
custCode = custCode.replace(/selectedCustomer\.membershipTier\.replace\('_', ' '\)/g, "selectedCustomer.tags?.includes('wash_member') ? 'Wash Member' : 'None'");
custCode = custCode.replace(/\{selectedCustomer\.membershipExpiry && \([\s\S]*?\)\}/g, "");
fs.writeFileSync('src/pages/Customers.tsx', custCode);

