// Explicit integration run: real game workers and PyTorch; separate disposable policy namespace.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {PolicyRegistry} = require('../server/training/PolicyRegistry');
const {TrainingSupervisor} = require('../server/training/TrainingSupervisor');
const {TrainingStore} = require('../server/training/TrainingStore');
const {runParitySuite} = require('../server/training/TrainingParity');
const {environmentHash,buildEnvironmentDefinition,SEED_RANGES} = require('../server/training/TrainingProtocol');

async function main() {
 const source = path.resolve(__dirname,'../training-data');
 const dataDir = fs.mkdtempSync(path.join(source,'v2-smoke-'));
 const original = new PolicyRegistry(source), config=original.status();
 const registry = new PolicyRegistry(dataDir);
 for(const version of new Set([config.championVersion,config.previousVersion])) {
  const policy=original.policy(version);
  assert.ok(policy,`Missing approved ${version}`);
  if(version!=='baseline') {const {weights,...persisted}=policy;registry.savePolicy(persisted);}
 }
 fs.copyFileSync(original.configFile,registry.configFile);
 const parentDir=original.policy(config.championVersion)?.weights?.schemaVersion===2?'neural-v2':'neural';
 fs.mkdirSync(path.join(dataDir,parentDir),{recursive:true});
 fs.copyFileSync(path.join(source,parentDir,`optimizer-${config.championVersion}.pt`),
  path.join(dataDir,parentDir,`optimizer-${config.championVersion}.pt`));
 const maxDurationMs=90000, envHash=environmentHash(buildEnvironmentDefinition(undefined,{maxDurationMs}));
 const supervisor=new TrainingSupervisor({dataDir,mode:'neural',schemaVersion:2,environmentHash:envHash,
  workers:4,maxMatches:8,maxDurationMs,speedMode:'max',parityStatus:'passed'});
 const candidate=await supervisor.trainer.initialize();
 const seeds=[SEED_RANGES.parity[0],SEED_RANGES.parity[0]+1,SEED_RANGES.parity[1]];
 const parity=[];
 for(const version of [config.championVersion,'baseline']) {
  const result=runParitySuite(seeds,{durationMs:5000,policies:{bluePolicy:candidate,redPolicy:original.policy(version),
   schemaVersion:2,environmentHash:envHash,trainingProtocolVersion:2,candidateVersion:candidate.version,learnerSide:'blue'}});
  assert.ok(result.ok,JSON.stringify(result));
  assert.ok(result.cases.every(entry=>entry.neuralDecisions>0));
  parity.push({opponentVersion:version,...result});
  console.log(JSON.stringify({stage:'parity',opponentVersion:version,passed:true}));
 }
 const heartbeat=setInterval(()=>console.log(JSON.stringify({stage:'matches',...supervisor.status()})),15000);
 let status;
 try {status=await supervisor.start();} finally {clearInterval(heartbeat);}
 assert.equal(status.failed,0);assert.equal(status.completed,8);
 assert.equal(status.phase,'selection');assert.ok(status.updateMetrics?.updates>0);
 const matches=await new TrainingStore(path.join(dataDir,'neural-state-v2')).readMatches();
 assert.equal(matches.length,8);
 const rows=matches.flatMap(report=>report.trajectory);
 assert.ok(rows.filter(row=>row.options.length>1).length>=8192);
 assert.ok(matches.every(report=>report.trajectory.every(row=>row.teamId===report.evaluation.candidateSide)));
 const evidence={dataDir,parentVersion:config.championVersion,initialVersion:candidate.version,
  updatedVersion:status.candidateVersion,parity,status,decisions:rows.length,
  eligibleDecisions:rows.filter(row=>row.options.length>1).length,
  singleOptionDecisions:rows.filter(row=>row.options.length===1).length,
  lives:new Set(rows.map(row=>row.lifeId)).size,executionRows:rows.filter(row=>row.executedAction).length};
 fs.writeFileSync(path.join(dataDir,'evidence.json'),JSON.stringify(evidence,null,2));
 console.log('V2_LIVE_SMOKE '+JSON.stringify(evidence));
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
