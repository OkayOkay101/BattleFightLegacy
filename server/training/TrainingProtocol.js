const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pairedLowerBound } = require('./HeuristicPolicy');
const TRAINING_PROTOCOL_VERSION = 2;
const SEED_RANGES = Object.freeze({train:[1,999999999],selection:[1000000000,1999999999],
 'final-test':[2000000000,2999999999],parity:[3000000001,3000000003]});
const PROTOCOL = Object.freeze({version:2,minimumMatches:8,minimumMultiOptionDecisions:8192,
 league:[50,30,20],selectionPairs:10,finalPairs:30,gamma:0.999,lambda:0.95,timeUnitMs:100,
 attackMode:'continuous-when-legal',dodgeMode:'aggregate-swept-path-v1'});
function canonical(value) {
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
 return value;
}
function environmentHash(definition) {return crypto.createHash('sha256').update(JSON.stringify(canonical(definition))).digest('hex');}
function buildEnvironmentDefinition(repoRoot=path.resolve(__dirname,'../..'), {maxDurationMs=300000}={}) {
 if(!Number.isFinite(maxDurationMs)||maxDurationMs<=0)throw new RangeError('Invalid environment match duration');
 const sources=['src/game.json','src/gameClasses/Unit.js','src/gameClasses/Projectile.js','src/gameClasses/components/GameComponent.js',
  'src/gameClasses/components/CombatAttribution.js','src/gameClasses/components/script/TriggerComponent.js',
  'src/gameClasses/components/script/ActionComponent.js','src/gameClasses/components/unit/AttributeComponent.js',
  'server/training/NeuralCombatSnapshot.js','server/training/neural-schema.json','server/training/NeuralActions.js',
  'server/training/NeuralObservation.js','server/training/NeuralController.js','server/training/TrainingTrajectory.js',
  'src/gameClasses/Item.js','src/gameClasses/components/unit/AbilityComponent.js',
  'src/gameClasses/components/unit/AIComponent.js','src/gameClasses/components/unit/BattleBotRicochet.js',
  'src/gameClasses/components/unit/BattleBotDodge.js',
  'server/training/TrainingRuntime.js','server/training/MatchWorker.js','server/training/TrainingMatch.js',
  'server/training/TrainingStepper.js','server/training/TrainingClock.js','server/training/TrainingRoster.js',
  'server/training/NeuralInference.js','server/training/NeuralSchema.js','server/training/TrainingProtocol.js',
  'training-python/model.py','training-python/ppo.py'];
 return {protocol:PROTOCOL,maxDurationMs,seedRanges:SEED_RANGES,sources:Object.fromEntries(sources.map(file=>[file,crypto.createHash('sha256')
  .update(fs.readFileSync(path.join(repoRoot,file))).digest('hex')]))};
}
function createSeedCounters(){return Object.fromEntries(Object.entries(SEED_RANGES).map(([phase,range])=>[phase,range[0]]));}
function allocateSeeds(counters,phase,count){const range=SEED_RANGES[phase];const first=counters[phase];
 if(!range||!Number.isInteger(count)||count<1||!Number.isInteger(first)||first<range[0]||first+count-1>range[1])throw new RangeError('Seed range exhausted or invalid');
 counters[phase]+=count;return Array.from({length:count},(_,i)=>first+i);}
function leagueOpponent(pairIndex,champion,archives,baseline){const slot=pairIndex%10;
 if(slot<5)return {role:'champion',policy:champion};
 if(slot<8)return {role:'archive',policy:archives[(Math.floor(pairIndex/10)*3+slot-5)%archives.length]||champion};
 return {role:'heuristic',policy:baseline};}
function evaluationOpponents(registry,champion){return [
 {role:'champion',policy:champion},
 {role:'archive',policy:registry.policy(registry.status().previousVersion)||registry.policy('baseline')},
 {role:'heuristic',policy:registry.policy('baseline')}];}
function evaluationSummary(pairs){const completed=pairs.filter(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite));
 const scores=completed.map(p=>(p[0]+p[1])/2),games=completed.flat();
 const reversedLowerBound=scores.length?pairedLowerBound(scores.map(s=>1-s)):null;
 return {pairs:completed.length,games:games.length,wins:games.filter(s=>s===1).length,draws:games.filter(s=>s===0.5).length,
  losses:games.filter(s=>s===0).length,score:games.length?games.reduce((a,b)=>a+b,0)/games.length:null,
  lowerBound:scores.length?pairedLowerBound(scores):null,upperBound:reversedLowerBound===null?null:1-reversedLowerBound,reversedLowerBound};}
module.exports={TRAINING_PROTOCOL_VERSION,SEED_RANGES,PROTOCOL,environmentHash,buildEnvironmentDefinition,createSeedCounters,
 allocateSeeds,leagueOpponent,evaluationOpponents,evaluationSummary};
