const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { TrainingSupervisor } = require('../server/training/TrainingSupervisor');
const { PolicyRegistry } = require('../server/training/PolicyRegistry');
const { parseArgs } = require('../server/training/TrainingCli');
const {getSchema}=require('../server/training/NeuralSchema');
const {createSeedCounters,evaluationSummary}=require('../server/training/TrainingProtocol');
const {NeuralTrainer}=require('../server/training/NeuralTrainer');
const {rosterHash}=require('../server/training/NeuralObservation');

test('invalid V2 worker data is rejected before writing the durable match archive', async () => {
 const {EventEmitter}=require('node:events');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v2-invalid-report-'));
 try {
  const s=fixtureSupervisor(dir), child=new EventEmitter();
  child.pid=12345;child.stderr=new EventEmitter();child.connected=false;child.send=()=>{};child.kill=()=>{};
  s.workerFactory=()=>child;s._saveEvaluation=async()=>{};
  let appended=0;
  s.neuralStore.appendMatch=async()=>{appended++;return true;};
  const rejected=new Promise(resolve=>{s._reject=resolve;});s._resolve=()=>{};
  s._launch({matchId:'bad-final-tick',attempts:0,candidateVersion:s.candidate.version,sideSwap:false,
   bluePolicy:s.candidate,redPolicy:s.champion});
  child.emit('message',{type:'result',report:{result:{matchId:'bad-final-tick',status:'complete'},neuralError:'final tick failed'}});
  const error=await rejected;
  assert.match(error.message,/inference failed/);
  assert.equal(appended,0);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test('environment identity covers match duration and training execution semantics', () => {
 const {buildEnvironmentDefinition, environmentHash} = require('../server/training/TrainingProtocol');
 const first = buildEnvironmentDefinition(undefined, {maxDurationMs:300000});
 const shorter = buildEnvironmentDefinition(undefined, {maxDurationMs:60000});
 assert.notEqual(environmentHash(first), environmentHash(shorter));
 for (const file of ['TrainingRuntime','MatchWorker','TrainingMatch','TrainingStepper']) {
  assert.ok(first.sources[`server/training/${file}.js`]);
 }
});

test('neural CLI permits explicit V2 and legacy schema', () => {
 assert.equal(parseArgs(['start','--neural','on','--neural-schema','2']).schemaVersion, 2);
 assert.equal(parseArgs(['start','--neural','on','--neural-schema','1']).schemaVersion, 1);
 assert.throws(() => parseArgs(['start','--neural-schema','4']), /schema/i);
});
function fixtureSupervisor(dir) {
 const s=new TrainingSupervisor({dataDir:dir,mode:'neural',schemaVersion:2,environmentHash:'e'.repeat(64),pythonExecutable:'fixture.exe'});
 s.candidate={version:'n-000028',weights:{parentVersion:'n-000027'}};
 s.champion={version:'champion'};
 s.registry={status:()=>({previousVersion:'previous'}),policy:version=>({version}),promote:(version,{evaluation})=>{
  s.promoted=version;s.promotionEvaluation=evaluation;}};
 return s;
}
test('V2 selection needs champion superiority and final evaluation freezes opponents for ninety pairs',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v2-final-'));
 try {
  const s=fixtureSupervisor(dir);s._beginEvaluation('selection');
  const selectionSeeds=[...s.evaluationSeeds];
  for(let i=0;i<60;i++){const job=s._nextNeuralJob();assert.equal(job.seed,selectionSeeds[job.pairIndex]);
   const key=`${job.opponentRole}:${job.pairIndex}`;
   (s.outcomes[key]||(s.outcomes[key]=[]))[job.sideSwap?1:0]=1;}
  assert.equal(s._neuralValidationComplete(),true);
  await s._advanceNeuralV2();assert.equal(s.phase,'final-test');
  const finals=Array.from({length:180},()=>s._nextNeuralJob());
  assert.equal(s._nextNeuralJob(),null);
  assert.equal(new Set(finals.map(job=>job.seed)).size,30);
  assert.equal(finals.filter(job=>job.opponentRole==='champion').length,60);
  for(const job of finals)s.outcomes[`${job.opponentRole}:${job.pairIndex}`]=[1,1];
  s.parityStatus='passed';await s._advanceNeuralV2();
  assert.equal(s.promoted,'n-000028');assert.equal(s.phase,'train');
  assert.equal(s.promotionEvaluation.opponents.heuristic.games,60);
  assert.equal(s.promotionEvaluation.selection.seeds.length,10);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('V2 selection ties skip heldout tests and mixed learner metadata fails',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v2-reject-'));
 try{const s=fixtureSupervisor(dir);s._beginEvaluation('selection');
  for(const role of ['champion','archive','heuristic'])for(let i=0;i<10;i++)s.outcomes[`${role}:${i}`]=[.5,.5];
  await s._advanceNeuralV2();assert.equal(s.phase,'train');assert.equal(s.seedCounters['final-test'],2000000000);
  assert.throws(()=>s._recordResultV2({schemaVersion:2,schemaHash:getSchema(2).schemaHash,environmentHash:'f'.repeat(64),
   trainingProtocolVersion:2}),/metadata/);
  assert.equal(evaluationSummary([[1,0],[.5,.5]]).score,.5);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('V2 seed allocation counters and unfinished frozen jobs survive checkpoint restart',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v2-resume-'));
 try{const s=fixtureSupervisor(dir);s._beginEvaluation('selection');const job=s._nextNeuralJob();
  const {bluePolicy,redPolicy,...ref}=job;s.inFlightJobs[job.matchId]={...ref,blueVersion:bluePolicy.version,redVersion:redPolicy.version};
  s.selectionSummary={seeds:[7]};await s._saveEvaluation();
  const resumed=fixtureSupervisor(dir);resumed.trainer={initialize:async()=>resumed.candidate};
  await resumed._initializeNeuralV2();assert.deepEqual(resumed.seedCounters,s.seedCounters);
  assert.equal(resumed.retries[0].seed,job.seed);assert.equal(resumed.retries[0].matchId,job.matchId);
  assert.deepEqual(resumed.selectionSummary,{seeds:[7]});
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('restart after optimizer publish resumes the new candidate at selection',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v2-update-recovery-'));
 try {
  const before=fixtureSupervisor(dir);await before._saveEvaluation();
  const resumed=fixtureSupervisor(dir);resumed.candidate={version:'n-000029',weights:{parentVersion:'n-000027'}};
  resumed.trainer={initialize:async()=>resumed.candidate,manifest:{trainedFromVersion:'n-000028'}};
  await resumed._initializeNeuralV2();
  assert.equal(resumed.phase,'selection');
  assert.equal(resumed.evaluationSeeds.length,10);
  assert.equal(resumed._nextNeuralJob().split,'selection');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('V2 seed counters keep paired league jobs and all evaluation phases disjoint', () => {
 const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-scheduler-'));
 try {
  const s = new TrainingSupervisor({dataDir:dir,mode:'neural',schemaVersion:2,environmentHash:'e'.repeat(64),pythonExecutable:'python-fixture.exe'});
  s.candidate={version:'n-000028'}; s.champion={version:'baseline'};
  const jobs=Array.from({length:20},()=>s._nextNeuralJob());
  assert.equal(jobs[0].seed,jobs[1].seed);
  assert.equal(jobs[0].schemaVersion,2);
  assert.equal(jobs.filter(job=>job.leagueRole==='champion').length,10);
  assert.equal(jobs.filter(job=>job.leagueRole==='archive').length,6);
  assert.equal(jobs.filter(job=>job.leagueRole==='heuristic').length,4);
  assert.equal(s.neuralStore.directory,path.join(dir,'neural-state-v2'));
  s._beginEvaluation('selection');
  const selection=s._nextNeuralJob(); assert.ok(selection.seed>=1000000000&&selection.seed<2000000000);
  s._beginEvaluation('final-test');
  const heldout=s._nextNeuralJob(); assert.ok(heldout.seed>=2000000000&&heldout.seed<3000000000);
  assert.equal(heldout.split,'final-test'); assert.equal(s.evaluationSeeds.length,30);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('V2 batch readiness counts full matches and multi-option decisions only', () => {
 const s=Object.assign(Object.create(TrainingSupervisor.prototype),{schemaVersion:2,phase:'train',trainingMatches:7,
  neuralPending:Array.from({length:8192},()=>({options:[[],[]]})),trainer:{minimumDecisions:8192}});
 assert.equal(s._batchReady(),false);s.trainingMatches=8;assert.equal(s._batchReady(),true);
 s.neuralPending[0].options=[[]];assert.equal(s._batchReady(),false);
});
test('promotion atomically activates and numbered policies never overwrite', () => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v2-registry-'));
 try {const r=new PolicyRegistry(dir);const p={version:'n-000028',params:{rangeScale:1,dodgeScale:1,switchScale:1}};
  r.savePolicy(p);r.setAutoUpdate(true);r.promote(p.version,{evaluation:{phase:'final-test'}});
  assert.equal(new PolicyRegistry(dir).status().activeVersion,p.version);
  assert.deepEqual(r.status().approvedArchives,['baseline']);
  assert.throws(()=>r.savePolicy({...p,params:{...p.params,rangeScale:1.1}}),/overwrite/i);
  assert.equal(r.nextNeuralVersion(),'n-000029');
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('V2 trainer sends global next version, separate optimizer state and approved parent checkpoint',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v2-trainer-flags-'));
 try{const r=new PolicyRegistry(dir);r.savePolicy({version:'n-000027',params:{rangeScale:1,dodgeScale:1,switchScale:1}});
  r.promote('n-000027');let sent;
  const trainer=new NeuralTrainer({dataDir:dir,schemaVersion:2,environmentHash:'e'.repeat(64),pythonExecutable:'fixture.exe',
   pythonRunner:async(executable,args)=>{sent=args;throw new Error('fixture intercepted');}});
  await assert.rejects(trainer.initialize(),/fixture intercepted/);
  const arg=name=>sent[sent.indexOf(name)+1];
  assert.equal(arg('--data-dir'),path.join(dir,'neural-v2'));assert.equal(arg('--next-version'),'n-000028');
  assert.equal(arg('--parent-checkpoint'),path.join(dir,'neural','optimizer-n-000027.pt'));
  assert.equal(arg('--schema-version'),'2');assert.equal(arg('--environment-hash'),'e'.repeat(64));
  assert.equal(arg('--protocol-version'),'2');
  trainer.manifest={version:'n-000028'};
  const rows=Array.from({length:8192},()=>({policyVersion:'n-000028',rosterHash,schemaVersion:2,
   schemaHash:getSchema(2).schemaHash,environmentHash:'wrong',trainingProtocolVersion:2,options:[[],[]]}));
  await assert.rejects(trainer.train(rows),/metadata/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
