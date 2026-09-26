const fs = require('fs');
const game = JSON.parse(fs.readFileSync('src/game.json', 'utf8'));

for (const [id, item] of Object.entries(game.data.itemTypes)) {
  for (const [sid, s] of Object.entries(item.scripts || {})) {
    (s.actions || []).forEach(a => {
      if (a.type === 'createProjectileAtPosition') {
        console.log(`${item.name} (${id}) -> proj: ${a.projectileType}, angle:`, JSON.stringify(a.angle));
      }
    });
  }
}
