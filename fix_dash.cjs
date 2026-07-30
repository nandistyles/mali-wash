const fs = require('fs');
let code = fs.readFileSync('src/pages/Dashboard.tsx', 'utf8');
code = code.replace(/t\.businessMeta\?\.serviceType\.replace\('_', ' '\)/g, "t.businessMeta?.serviceType?.replace('_', ' ') || 'Sale'");
fs.writeFileSync('src/pages/Dashboard.tsx', code);
