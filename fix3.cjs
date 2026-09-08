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

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  const orig = content;
  
  content = content.replace(/Fo₹/g, 'Form');
  content = content.replace(/fo₹/g, 'form');
  content = content.replace(/Fi₹/g, 'Firm');
  content = content.replace(/fi₹/g, 'firm');
  content = content.replace(/Pe₹/g, 'Perm');
  content = content.replace(/pe₹/g, 'perm');
  content = content.replace(/Te₹/g, 'Term');
  content = content.replace(/te₹/g, 'term');
  content = content.replace(/No₹/g, 'Norm');
  content = content.replace(/no₹/g, 'norm');

  if (orig !== content) {
    fs.writeFileSync(file, content, 'utf8');
    console.log('Fixed', file);
  }
});
