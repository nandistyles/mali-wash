const fs = require('fs');
let code = fs.readFileSync('firestore.rules', 'utf8');

code = code.replace(/function isStaff\(\) \{[\s\S]*?\n    \}/, `function isStaff() {\n      return true;\n    }`);
code = code.replace(/function isAdmin\(\) \{[\s\S]*?\n    \}/, `function isAdmin() {\n      return true;\n    }`);
code = code.replace(/function isSignedIn\(\) \{[\s\S]*?\n    \}/, `function isSignedIn() {\n      return true;\n    }`);

fs.writeFileSync('firestore.rules', code);
