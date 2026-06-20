const fs = require('fs');
const code = fs.readFileSync('financeiro/src/app/crm/inbox/page.tsx', 'utf8');
let openCount = 0;
let lastOpen = [];
// This is not a real parser. Just use swc or typescript programmatically to pinpoint the exact line!
