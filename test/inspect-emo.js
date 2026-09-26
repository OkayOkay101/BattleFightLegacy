const fs = require('fs');
const game = JSON.parse(fs.readFileSync('src/game.json', 'utf8'));

const emoItemIds = ['7tAt9Nb06q', 'pTzoUCqiDk', 'q4hDFaeSPA', 'WX0c7r8PB0'];
console.log('=== EMO ITEMS ===');
for (const id of emoItemIds) {
  const item = game.data.itemTypes[id];
  console.log(`\nITEM: ${item.name} (${id})`);
  console.log('Variables:', JSON.stringify(item.variables, null, 2));
  console.log('Scripts:', JSON.stringify(item.scripts, null, 2));
}

const emoProjIds = ['81rgX6igx4', 'wObUgxAB7W', 'zNL1utabKf', 'QO2It59aJE', 'IFeppWH6RS', '2gpxEM6psw', 'ueTIB1SacE', '2zGX2ELnHp'];
console.log('=== EMO PROJECTILES ===');
for (const id of emoProjIds) {
  const p = game.data.projectileTypes[id];
  if (!p) { console.log('Proj not found:', id); continue; }
  console.log(`\nPROJECTILE: ${p.name} (${id})`);
  console.log('Variables:', JSON.stringify(p.variables, null, 2));
  console.log('Scripts:', JSON.stringify(p.scripts, null, 2));
}
