const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else { 
      if (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.html')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk('./src');
files.push('./index.html');

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  const orig = content;
  
  // Fix lowercase 'rm' that was replaced with '₹' due to case-insensitivity
  content = content.replace(/fo₹at/g, 'format');
  content = content.replace(/no₹alize/g, 'normalize');
  content = content.replace(/transfo₹/g, 'transform');
  content = content.replace(/fo₹/g, 'form'); // wait, this might catch ₹ in other places?
  content = content.replace(/depositFo₹/g, 'depositForm');
  content = content.replace(/no₹al/g, 'normal');
  content = content.replace(/Info₹ation/g, 'Information');
  content = content.replace(/te₹s/g, 'terms');
  content = content.replace(/pe₹ission/g, 'permission');
  content = content.replace(/Pe₹ission/g, 'Permission');
  content = content.replace(/pe₹a/g, 'perma');
  content = content.replace(/te₹inal/g, 'terminal');
  
  // Actually, wait, let's just reverse the generic lowercase replacement.
  // The symbol is literally ₹. Let's look for any lowercase letter followed by ₹.
  // e.g. fo₹ -> form. 
  // Wait, let's just use a function:
  content = content.replace(/([a-zA-Z])₹([a-zA-Z])/g, (match, p1, p2) => {
    // If it's surrounded by letters, it was probably 'rm'
    return p1 + 'rm' + p2;
  });

  // What if it was at the end of a word? like 'transform' -> 'transfo₹'
  content = content.replace(/([a-zA-Z])₹\b/g, (match, p1) => {
    return p1 + 'rm';
  });

  if (orig !== content) {
    fs.writeFileSync(file, content, 'utf8');
    console.log('Fixed', file);
  }
});
