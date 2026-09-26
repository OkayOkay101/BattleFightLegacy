const fs = require('fs');
const game = JSON.parse(fs.readFileSync('src/game.json', 'utf8'));

function inspectItem(itemId) {
  const item = game.data.itemTypes[itemId];
  if (!item) return console.log('Item not found:', itemId);
  console.log(`\n================ ITEM: ${item.name} (${itemId}) ================`);
  console.log('Variables:', JSON.stringify(item.variables, null, 2));
  console.log('Scripts:');
  for (const [sId, s] of Object.entries(item.scripts || {})) {
    console.log(`  Script: ${s.name} (${sId}) triggers:`, JSON.stringify(s.triggers));
    console.log(`    actions:`, JSON.stringify(s.actions, null, 2));
  }
}

function inspectProj(projId) {
  const p = game.data.projectileTypes[projId];
  if (!p) return console.log('Proj not found:', projId);
  console.log(`\n================ PROJECTILE: ${p.name} (${projId}) ================`);
  console.log('Variables:', JSON.stringify(p.variables, null, 2));
  console.log('Scripts:');
  for (const [sId, s] of Object.entries(p.scripts || {})) {
    console.log(`  Script: ${s.name} (${sId}) triggers:`, JSON.stringify(s.triggers));
    console.log(`    actions:`, JSON.stringify(s.actions, null, 2));
  }
}

console.log('--- SIXTH DIVA ITEMS ---');
['iNUtxPzZ3z', 'GHWnSHUV12', 'KHUch3UQ5z', 'bSTcqysckL'].forEach(inspectItem);

console.log('--- EMO & SKY ITEMS ---');
['7tAt9Nb06q', 'pTzoUCqiDk', 'q4hDFaeSPA', 'WX0c7r8PB0'].forEach(inspectItem);
