const fs = require('fs');
let code = fs.readFileSync('src/pages/Customers.tsx', 'utf8');
code = code.replace(/customer\.tags\?\.includes\('wash_member'\) \? 'basic_member' : 'none' !== 'none'/g, "customer.tags?.includes('wash_member')");
code = code.replace(/customer\.tags\?\.includes\('wash_member'\) \? 'basic_member' : 'none' === 'premium_member' \? 'Premium' : 'Basic'/g, "customer.tags?.includes('wash_member') ? 'Member' : ''");
fs.writeFileSync('src/pages/Customers.tsx', code);
