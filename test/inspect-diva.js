const fs = require('fs');
const game = JSON.parse(fs.readFileSync('src/game.json', 'utf8'));

const divaItemIds = ['iNUtxPzZ3z', 'GHWnSHUV12', 'KHUch3UQ5z', 'bSTcqysckL'];
console.log('=== DIVA ITEMS ===');
for (const id of divaItemIds) {
  const item = game.data.itemTypes[id];
  console.log(`\nITEM: ${item.name} (${id})`);
  console.log('Variables:', JSON.stringify(item.variables, null, 2));
  console.log('Scripts:', JSON.stringify(item.scripts, null, 2));
}

const divaProjIds = ['Ry9WhLFR7g', '9GFW92lh7K', 'wjY6n30UkW'];
console.log('=== DIVA PROJECTILES ===');
for (const id of divaProjIds) {
  const p = game.data.projectileTypes[id];
  console.log(`\nPROJECTILE: ${p.name} (${id})`);
  console.log('Variables:', JSON.stringify(p.variables, null, 2));
  console.log('Scripts:', JSON.stringify(p.scripts, null, 2));
}
