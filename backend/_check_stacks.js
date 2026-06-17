const fs = require('fs');
const content = fs.readFileSync(process.argv[2], 'utf8');
const lines = content.split('\n');
let round = 0, curly = 0, square = 0;
let maxCurly = 0;
const curlyStack = [];

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
    if (ch === '{') {
      curly++;
      curlyStack.push({ line: i+1, char: j+1, content: line.trim().slice(0, 60) });
      if (curly > maxCurly) maxCurly = curly;
    }
    if (ch === '}') {
      curly--;
      const popped = curlyStack.pop();
      if (!popped) {
        console.log(`EXTRA '}' at L${i+1}:${j+1} - [${line.trim()}]`);
      }
    }
    if (ch === '[') square++;
    if (ch === ']') square--;
  }
  if (curly < 0 || round < 0 || square < 0) {
    console.log(`NEGATIVE at L${i+1}! (:${round} {:${curly} [:${square}`);
    console.log(`  Line: [${line}]`);
  }
}

console.log(`\nFinal counts: (:${round} {:${curly} [:${square}`);
if (curlyStack.length > 0) {
  console.log(`\nUNCLOSED { (${curlyStack.length} left):`);
  curlyStack.forEach((c, idx) => {
    console.log(`  #${idx+1}: L${c.line}:${c.char} → ${c.content}`);
  });
}
if (curly !== 0) {
  console.log(`\nERROR: curly count is ${curly}, should be 0!`);
  process.exit(1);
}
