const { bootTrainingGame } = require('../server/training/MatchWorker');

async function main() {
  const { ige } = await bootTrainingGame({ matchId: 'test-angle', manualSteps: true });
  const player = ige.$$('player')[0];
  const unitType = ige.game.getAsset('unitTypes', 'H6K6gpqlPE');
  const unitData = JSON.parse(JSON.stringify(unitType));
  unitData.type = 'H6K6gpqlPE';
  unitData.defaultData = { translate: { x: 500, y: 500 }, rotate: 0 };
  const unit = player.createUnit(unitData);
  const item = ige.$(unit._stats.itemIds[0]);
  console.log('Unit pos:', unit._translate);
  console.log('Item pos:', item._translate);
  const posItem = ige.variable.getValue({ function: 'getEntityPosition', entity: { function: 'thisEntity' } }, { thisEntity: item });
  console.log('getEntityPosition(item):', posItem);
  const angle = ige.variable.getValue({
    function: 'angleBetweenPositions',
    positionA: { function: 'getEntityPosition', entity: { function: 'getTriggeringUnit' } },
    positionB: { function: 'getEntityPosition', entity: { function: 'thisEntity' } }
  }, { thisEntity: item, triggeredBy: { unitId: unit.id() } });
  console.log('angleBetweenPositions(unit, item):', angle);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
