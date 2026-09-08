const fs = require('fs');
const path = require('path');
const file = 'public/sreeja-bridal-boutique-logo.jpeg';
const base64 = fs.readFileSync(file, 'base64');
const dataUri = 'data:image/png;base64,' + base64;
const tsContent = 'export const LOGO_BASE64 = \'' + dataUri + '\';\n';
fs.writeFileSync('src/lib/logoBase64.ts', tsContent);
