const fs = require('fs');
const content = fs.readFileSync(process.argv[2], 'utf8');
const lines = content.split('\n');
let round = 0, curly = 0, square = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  let inString = false, stringChar = '';
  for (let j = 0; j < line.length; j++) {
    const ch = line[j];
    const prev = line[j-1] || '';
    if (inString) {
      if (ch === stringChar && prev !== '\\') inString = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = true; stringChar = ch; continue;
    }
    if (ch === '(') round++;
    if (ch === ')') round--;
    if (ch === '{') curly++;
    if (ch === '}') curly--;
    if (ch === '[') square++;
    if (ch === ']') square--;
  }
  if ((i+1) % 25 === 0 || i === lines.length - 1) {
    console.log(`L${i+1} → (:${round} {:${curly} [:${square}`);
  }
  if (round < 0 || curly < 0 || square < 0) {
    console.log(`NEGATIVE at L${i+1}! (:${round} {:${curly} [:${square}`);
    console.log(`  Line: [${line}]`);
    break;
  }
}
console.log(`Final: (:${round} {:${curly} [:${square}`);
