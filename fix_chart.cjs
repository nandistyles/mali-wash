const fs = require('fs');
let code = fs.readFileSync('src/pages/Dashboard.tsx', 'utf8');
code = code.replace(/<Bar dataKey="amount" radius=\{\[4, 4, 0, 0\]\} \/>/, '<Bar dataKey="amount" radius={[4, 4, 0, 0]} fill="#0f766e" />');
fs.writeFileSync('src/pages/Dashboard.tsx', code);
