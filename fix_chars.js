const fs = require('fs');

function g(...cps) { return String.fromCodePoint(...cps); }

// cp1252 special chars (0x80-0x9F) reverse map: unicode -> byte
const cp1252rev = {
  0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A,
  0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
  0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C,
  0x017E: 0x9E, 0x0178: 0x9F
};

function charToByte(ch) {
  const cp = ch.codePointAt(0);
  if (cp < 0x100) return cp;
  if (cp1252rev[cp] !== undefined) return cp1252rev[cp];
  return null;
}

// Decode a mojibake string back to UTF-8
function decodeMojibake(str) {
  const bytes = [];
  for (const ch of str) {
    const b = charToByte(ch);
    if (b === null) return null; // can't decode
    bytes.push(b);
  }
  return Buffer.from(bytes).toString('utf8');
}

// Fix emoji and punctuation mojibake (Windows-1252 reinterpretation of UTF-8 bytes)
const simpleEmojiFixes = [
  [g(0xF0, 0x178, 0x201C, 0x2026), g(0x1F4C5)], // 📅
  [g(0xF0, 0x178, 0x201C, 0x201E), g(0x1F504)], // 🔄
  [g(0xF0, 0x178, 0x201C, 0x81),   g(0x1F4C1)], // 📁
  [g(0xE2, 0x20AC, 0x201D),        g(0x2014)],   // —
  [g(0xE2, 0x153, 0x201D),         g(0x2714)],   // ✔
  [g(0xE2, 0x153, 0x2014),         g(0x2717)],   // ✗
  [g(0xE2, 0x2013, 0xB6),          g(0x25B6)],   // ▶
];

let content = fs.readFileSync('public/script.js', 'utf8');
let totalReplaced = 0;

// Apply simple fixes
simpleEmojiFixes.forEach(([bad, good]) => {
  const count = content.split(bad).length - 1;
  if (count > 0) {
    console.log(`Replacing ${count}x: ${JSON.stringify(bad)} -> ${good}`);
    content = content.split(bad).join(good);
    totalReplaced += count;
  }
});

// Fix garbled Thai: find sequences of (U+00E0 + U+00B8/B9 + cp1252-special) groups
// These are triplets where each represents one UTF-8 byte
// The pattern: à (E0) + ¸/¹ (B8/B9) + [cp1252 special with high codepoint]
// Greedy: match as many consecutive Thai triplets as possible
const thaiGarbleRe = /((?:\xE0[\xB8\xB9][\s\S])+)/g;
content = content.replace(thaiGarbleRe, (match) => {
  // Verify every char in the match can be decoded and forms valid Thai
  const decoded = decodeMojibake(match);
  if (decoded === null) return match;
  // Check decoded result is all Thai (U+0E00-U+0E7F)
  if ([...decoded].every(ch => ch.codePointAt(0) >= 0x0E00 && ch.codePointAt(0) <= 0x0E7F)) {
    totalReplaced++;
    return decoded;
  }
  return match;
});

fs.writeFileSync('public/script.js', content, 'utf8');
console.log(`\nDone. Total fix operations: ${totalReplaced}`);
