const fs = require('fs');
let f = fs.readFileSync('d:/psm/psm/src/pages/CoordinatorDashboard.jsx', 'utf8');

f = f.split('\\`').join('`');
f = f.split('\\$').join('$');

fs.writeFileSync('d:/psm/psm/src/pages/CoordinatorDashboard.jsx', f);
