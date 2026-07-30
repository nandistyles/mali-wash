const fs = require('fs');
let code = fs.readFileSync('src/pages/POS.tsx', 'utf8');

code = code.replace(/vehicles\?\.\[0\]\?\.makeModel/g, 'vehicleMakeModel');

fs.writeFileSync('src/pages/POS.tsx', code);
