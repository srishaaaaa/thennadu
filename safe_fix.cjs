const fs = require('fs');
const path = require('path');

// Files to fix with SAFE replacements only (no regex that can hit variable names)
const safeReplacements = [
  // Tax label
  [/\bSST\b/g, 'GST'],
  // Currency display in strings/JSX only (preceded by space or opening bracket or quote)
  [/(["' ])RM /g, (_, p1) => p1 + '\u20b9 '],
  [/(["' >])RM\b(?![\w])/g, (_, p1) => p1 + '\u20b9'],
  // Colors - emerald to flamingo
  ['#047857', '#E8547C'],
  ['#064E3B', '#C73660'],
  ['#D1FAE5', '#FDE2E9'],
  ['#ECFDF5', '#FFF0F3'],
  // Brand text
  ['Purple Boutique', "Sreeja's Bridal Boutique"],
  ['PURPLE BOUTIQUE', "SREEJA'S BRIDAL BOUTIQUE"],
  ['purple-boutique', 'sreejas-bridal-botique'],
  ['purpleboutique.my', 'sreejas-bridal-botique.vercel.app'],
  // Locale
  ["en-GB", "en-IN"],
  // Violet/purple to pink accent where clearly decorative
];

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) results = results.concat(walk(file));
    else if (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.html')) results.push(file);
  });
  return results;
}

const targets = [
  'src/pages/Dashboard.tsx',
  'src/pages/BillingAnalytics.tsx',
  'src/pages/AdvanceOrders.tsx',
  'src/pages/ProductDetails.tsx',
];

targets.forEach(file => {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');
  const orig = content;
  
  safeReplacements.forEach(r => {
    if (Array.isArray(r)) {
      const [from, to] = r;
      if (typeof from === 'string') {
        content = content.split(from).join(to);
      } else {
        content = content.replace(from, to);
      }
    }
  });
  
  if (orig !== content) {
    fs.writeFileSync(file, content, 'utf8');
    console.log('Updated', file);
  }
});

console.log('Done');
