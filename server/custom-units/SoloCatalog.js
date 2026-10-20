'use strict';
const { playableIds, adapter } = require('./CustomUnitAdapters');
// Native menu choices are separate from custom adapters and the frozen training roster.
function soloCatalog(game) {
 return playableIds(game).map(id => {
  const unit = game.unitTypes[id];
  return { id, name: unit.name, image: unit.cellSheet?.url || '',
   available: !!(unit.attributes?.health && unit.cellSheet?.url), profile: adapter(game,id).profile };
 });
}
module.exports = { soloCatalog };
