const fs = require('fs');
const path = require('path');

const src = path.resolve(__dirname, '../training-data/matches.jsonl');
const archiveDir = path.resolve(__dirname, '../training-data-archive');
if (!fs.existsSync(archiveDir)) {
  fs.mkdirSync(archiveDir, { recursive: true });
}

if (fs.existsSync(src)) {
  const stat = fs.statSync(src);
  const sizeMb = Math.round(stat.size / 1024 / 1024);
  const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(archiveDir, `matches-${dateStr}.jsonl`);
  console.log(`Archiving ${src} (${sizeMb} MB) -> ${dest}`);
  fs.renameSync(src, dest);
  fs.writeFileSync(src, '', 'utf8');
  console.log('Successfully archived and reset matches.jsonl!');
} else {
  console.log('matches.jsonl does not exist, creating new one.');
  fs.writeFileSync(src, '', 'utf8');
}
