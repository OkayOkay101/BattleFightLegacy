const { bootTrainingGame } = require('../server/training/MatchWorker');
const { TrainingStepper } = require('../server/training/TrainingStepper');

async function main() {
  const { ige, clock } = await bootTrainingGame({ matchId: 'test-emo-hit', manualSteps: true });
  const stepper = new TrainingStepper({ ige, clock });
  const bluePlayer = ige.$$('player').find(p => p._stats.trainingTeamId === 'blue');
  const redPlayer = ige.$$('player').find(p => p._stats.trainingTeamId === 'red');

  const emoType = ige.game.getAsset('unitTypes', '2GjTUKR9Bz');
  const emoData = JSON.parse(JSON.stringify(emoType));
  emoData.type = '2GjTUKR9Bz';
  emoData.defaultData = { translate: { x: 500, y: 500 }, rotate: 0 };
  const emoUnit = bluePlayer.createUnit(emoData);

  const enemyType = ige.game.getAsset('unitTypes', 'H6K6gpqlPE');
  const enemyData = JSON.parse(JSON.stringify(enemyType));
  enemyData.type = 'H6K6gpqlPE';
  enemyData.defaultData = { translate: { x: 550, y: 500 }, rotate: 0 };
  const enemyUnit = redPlayer.createUnit(enemyData);
  stepper.step();

  bluePlayer.control.input.mouse = { x: 550, y: 500 };

  console.log('Emo Unit Variables:', JSON.stringify(emoUnit.variables, null, 2));

  // Spawn a Needle Bullet using ActionComponent
  ige.action.run([
    {
      type: 'createProjectileAtPosition',
      projectileType: 'QO2It59aJE',
      position: { function: 'getEntityPosition', entity: { function: 'thisEntity' } },
      force: 20,
      angle: Math.PI / 2
    },
    {
      type: 'setOwnerUnitOfProjectile',
      projectile: { function: 'getLastCreatedProjectile' },
      unit: { function: 'thisEntity' }
    }
  ], { thisEntity: emoUnit });
  const proj = ige.$(ige.game.lastCreatedProjectileId);
  const origDestroy = proj.destroy.bind(proj);
  proj.destroy = function() {
    console.log('PROJ DESTROY CALLED! Stack:\n', new Error().stack);
    return origDestroy();
  };

  console.log('Initial enemy HP:', enemyUnit._stats.attributes.health.value);

  // Hook ige.script.runScript to see what gets called
  const origRunScript = ige.script.runScript.bind(ige.script);
  ige.script.runScript = function(scriptId, vars, entity) {
    console.log(`[SCRIPT RUN] ${scriptId} (${ige.game.data.scripts[scriptId]?.name || entity?.scripts?.[scriptId]?.name || 'unknown'})`);
    if (scriptId === '0rJAevYObP') {
      console.log('--- Inside 0rJAevYObP vars:', vars);
      const tu = ige.variable.getValue({ function: 'getTriggeringUnit' }, vars);
      const sp = ige.variable.getValue({ function: 'getSourceUnitOfProjectile', entity: { function: 'thisEntity' } }, vars);
      const ownerTU = ige.variable.getValue({ function: 'getOwner', entity: { function: 'getTriggeringUnit' } }, vars);
      const ownerSP = ige.variable.getValue({ function: 'getOwner', entity: { function: 'getSourceUnitOfProjectile', entity: { function: 'thisEntity' } } }, vars);
      console.log('TriggeringUnit:', tu?.id(), tu?._stats?.name);
      console.log('SourceUnit:', sp?.id(), sp?._stats?.name);
      console.log('Owner of TU:', ownerTU?.id());
      console.log('Owner of SP:', ownerSP?.id());
      console.log('ownerTU != ownerSP ?', ownerTU !== ownerSP);

      const cdVal = ige.variable.getValue({
        function: 'getValueOfEntityVariable',
        variable: {
          function: 'getEntityVariable',
          variable: {
            text: '(Emotional Skyscraper) Bullet Damage Cooldown State',
            dataType: 'number',
            entity: '2GjTUKR9Bz',
            key: '(Emotional Skyscraper) Bullet Damage Cooldown State'
          }
        },
        entity: { function: 'getSourceUnitOfProjectile', entity: { function: 'thisEntity' } }
      }, vars);
      console.log('Cooldown variable value:', cdVal);
    }
    if (scriptId === 'i9eJXmfIMq') {
      console.log('=== RUNNING i9eJXmfIMq ===');
      console.log('vars:', {
        triggeredBy: vars?.triggeredBy,
        thisEntity: vars?.thisEntity?.id?.()
      });
      const tu = ige.variable.getValue({ function: 'getTriggeringUnit' }, vars);
      const tp = ige.variable.getValue({ function: 'getTriggeringProjectile' }, vars);
      const dmg = ige.variable.getValue({
        function: 'getValueOfEntityVariable',
        variable: {
          function: 'getEntityVariable',
          variable: {
            text: '(Global Projectile) Projectile Damage',
            dataType: 'number',
            entity: '2RorkyQ4ta',
            key: '(Global Projectile) Projectile Damage'
          }
        },
        entity: { function: 'getTriggeringProjectile' }
      }, vars);
      console.log('Triggering Unit:', tu?.id(), tu?._stats?.name, 'HP:', tu?._stats?.attributes?.health?.value);
      console.log('Triggering Projectile:', tp?.id(), tp?._stats?.name);
      console.log('Damage value from projectile:', dmg);
    }
    return origRunScript(scriptId, vars, entity);
  };

  for (let s = 1; s <= 30; s++) {
    stepper.step();
  }

  console.log('After 30 steps:');
  console.log('Enemy HP:', enemyUnit._stats.attributes.health.value);
  console.log('Projectile alive?', proj._alive);
  console.log('Emo CD state var:', emoUnit.variables['(Emotional Skyscraper) Bullet Damage Cooldown State']);

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
