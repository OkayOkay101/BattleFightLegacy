const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getSchema } = require('../server/training/NeuralSchema');
const { loadWeights, scoreActions } = require('../server/training/NeuralInference');
const { rosterHash } = require('../server/training/NeuralObservation');
const { TrainingSupervisor } = require('../server/training/TrainingSupervisor');
const { NeuralTrainer } = require('../server/training/NeuralTrainer');
const { TrainingTrajectory } = require('../server/training/TrainingTrajectory');
const { TrainingStore } = require('../server/training/TrainingStore');
const { parseArgs } = require('../server/training/TrainingCli');
const { PolicyRegistry } = require('../server/training/PolicyRegistry');
const layer = (rows, cols) => ({ rows, cols, weights: Array(rows * cols).fill(0), bias: Array(rows).fill(0) });
function envelope(changes = {}) {
 const schema = getSchema(3);
 const payload = JSON.stringify({ schemaVersion:3, observationSchemaVersion:3, actionSchemaVersion:3,
  schemaHash:schema.schemaHash, environmentHash:'e'.repeat(64), trainingProtocolVersion:2, rosterHash,
  actor:[layer(64,211),layer(64,64),layer(1,64)],critic:[layer(64,184),layer(1,64)], ...changes });
 return { payload, checksum:crypto.createHash('sha256').update(payload).digest('hex') };
}
function supervisor(directory) {
 const s = new TrainingSupervisor({ dataDir:directory,mode:'neural',schemaVersion:3,
  environmentHash:'e'.repeat(64),pythonExecutable:'fixture.exe' });
 s.candidate={version:'n-000045',weights:{parentVersion:'n-000027'}};s.champion={version:'n-000027'};
 s.registry={status:()=>({previousVersion:'previous'}),policy:version=>({version}),promote:(version,{evaluation})=>{s.promoted=version;s.promotion=evaluation;}};
 return s;
}
test('schema3 adds 35 observation and 9 action columns while retaining legacy contracts', () => {
 const s=getSchema(3);assert.equal(s.observationCount,184);assert.equal(s.actionCount,27);
 assert.deepEqual(s.actorDimensions,[211,64,64,1]);assert.deepEqual(s.criticDimensions,[184,64,1]);assert.equal(s.maxOptions,32);
 assert.equal(getSchema(1).observationCount,86);assert.equal(getSchema(2).observationCount,149);
 assert.equal(parseArgs(['start','--neural','on']).schemaVersion,3);
 assert.equal(parseArgs(['start','--neural','on','--neural-schema','2']).schemaVersion,2);
});
test('schema3 inference requires exact schema metadata and handles invalid action sets cleanly', () => {
 const w=loadWeights(envelope()), obs=new Float32Array(184), opts=[{legal:true,features:new Float32Array(27)}];
 assert.deepEqual(scoreActions(w,obs,opts),{logits:[0],value:0});
 for (const changes of [{observationSchemaVersion:2},{actionSchemaVersion:2},{schemaHash:getSchema(2).schemaHash},{trainingProtocolVersion:3},{environmentHash:''}])
  assert.throws(()=>loadWeights(envelope(changes)),/schema|protocol/);
 assert.throws(()=>scoreActions(w,obs,[]),/no actions/);
 assert.throws(()=>scoreActions(w,obs,[{legal:false,features:new Float32Array(27)}]),/legal/);
});
test('schema3 scheduler retains promotion gates and checkpoints exact schema with separate state', async () => {
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'v3-core-'));
 try {
  const s=supervisor(directory);assert.equal(s.neuralStore.directory,path.join(directory,'neural-state-v3'));
  assert.equal(s.trainer.neuralDir,path.join(directory,'neural-v3'));
  s._beginEvaluation('selection');const job=s._nextNeuralJob();assert.equal(job.schemaVersion,3);assert.equal(job.schemaHash,getSchema(3).schemaHash);
  const {bluePolicy,redPolicy,...ref}=job;s.inFlightJobs[job.matchId]={...ref,blueVersion:bluePolicy.version,redVersion:redPolicy.version};
  await s._saveEvaluation();const resumed=supervisor(directory);resumed.trainer={initialize:async()=>resumed.candidate};
  await resumed._initializeNeural();assert.deepEqual(resumed.seedCounters,s.seedCounters);assert.equal(resumed.retries[0].seed,job.seed);
  const checkpoint=await s.neuralStore.loadCheckpoint();assert.equal(checkpoint.schemaVersion,3);
  await s.neuralStore.saveCheckpoint({...checkpoint,schemaVersion:2});
  await assert.rejects(supervisorWithTrainer(directory)._initializeNeural(),/schema/);
  for(const role of ['champion','archive','heuristic'])for(let i=0;i<10;i++)s.outcomes[`${role}:${i}`]=[1,1];
  await s._advanceNeuralV2();assert.equal(s.phase,'final-test');assert.equal(s.promoted,undefined);
  for(const role of ['champion','archive','heuristic'])for(let i=0;i<30;i++)s.outcomes[`${role}:${i}`]=[1,1];
  s.parityStatus='passed';await s._advanceNeuralV2();assert.equal(s.promoted,'n-000045');assert.equal(s.promotion.schemaVersion,3);
 } finally { fs.rmSync(directory,{recursive:true,force:true}); }
});
function supervisorWithTrainer(directory) {const s=supervisor(directory);s.trainer={initialize:async()=>s.candidate};return s;}
test('schema3 trajectories use duration shaping and store rejects a crossed schema archive', async () => {
 const t=new TrainingTrajectory();
 const row={playerId:'p',policyVersion:'n-000045',rosterHash,schemaVersion:3,schemaHash:getSchema(3).schemaHash,
  environmentHash:'e'.repeat(64),trainingProtocolVersion:2,matchId:'m',lifeId:'l',teamId:'blue',potential:.2,
  observation:Array(184).fill(0),options:[Array(27).fill(0)],chosenIndex:0,logProb:0,value:0,simulatedAt:100};
 t.record(row);t.recordExecution('p',{movement:'dodge',dodgeDirection:8},['blocked']);
 const output=t.finish({status:'complete',winner:'blue'},null,{endedAt:300});
 assert.equal(output[0].reward,.8);assert.equal(output[0].nextSimulatedAt,300);assert.equal(output[0].logProb,0);
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'v3-store-'));
 try {const store=new TrainingStore(directory);const report={...row,result:{status:'complete',matchId:'m'},split:'train',trajectory:output,evaluation:{candidateVersion:row.policyVersion}};
  assert.equal(await store.appendMatch(report),true);
  await assert.rejects(store.appendMatch({...report,result:{status:'complete',matchId:'crossed'},trajectory:[{...output[0],schemaVersion:2}]}),/trajectory/);
 } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
test('schema3 trainer uses a globally numbered isolated optimizer and V2 parent namespace', async () => {
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'v3-trainer-'));let args;
 try {const t=new NeuralTrainer({dataDir:directory,schemaVersion:3,environmentHash:'e'.repeat(64),parentVersion:'n-000038',pythonExecutable:'fixture.exe',
  pythonRunner:async(executable,sent)=>{args=sent;throw new Error('intercepted');}});
  t.registry={status:()=>({}),nextNeuralVersion:()=> 'n-000045',policy:()=>({weights:{schemaVersion:2}})};
  await assert.rejects(t.initialize(),/intercepted/);const arg=name=>args[args.indexOf(name)+1];
  assert.equal(arg('--schema-version'),'3');assert.equal(arg('--next-version'),'n-000045');
  assert.equal(arg('--parent-checkpoint'),path.join(directory,'neural-v2','optimizer-n-000038.pt'));
 } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
test('schema3 trainer rejects manifest schema metadata that disagrees with validated weights', async () => {
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'v3-manifest-'));
 try {
  const t=new NeuralTrainer({dataDir:directory,schemaVersion:3,environmentHash:'e'.repeat(64),pythonExecutable:'fixture.exe',
   pythonRunner:async()=> {
    const weightsPath=path.join(directory,'neural-v3','weights-n-000045.json');fs.writeFileSync(weightsPath,JSON.stringify(envelope()));
    return {stdout:JSON.stringify({version:'n-000045',rosterHash,weightsPath,schemaVersion:2,
     observationSchemaVersion:3,actionSchemaVersion:3,schemaHash:getSchema(3).schemaHash,
     environmentHash:'e'.repeat(64),trainingProtocolVersion:2})};
   }});
  await assert.rejects(t.initialize(),/manifest metadata/);
  assert.equal(t.registry.policy('n-000045'),null);
 } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
test('global neural numbering reserves orphan schema3 weights and optimizer artifacts after interrupted publication', () => {
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'v3-orphan-number-'));
 try {
  const write=(folder,file)=>{fs.mkdirSync(path.join(directory,folder),{recursive:true});fs.writeFileSync(path.join(directory,folder,file),'orphan');};
  write('policies','n-000027.json');write('neural','weights-n-000029.json');write('neural-v2','optimizer-n-000042.pt');
  write('neural-v3','weights-n-000043.json');
  assert.equal(new PolicyRegistry(directory).nextNeuralVersion(),'n-000044');
  write('neural-v3','optimizer-n-000044.pt');
  assert.equal(new PolicyRegistry(directory).nextNeuralVersion(),'n-000045');
  write('neural-v3-backup','weights-n-999999.json');write('neural-state-v3','optimizer-n-999998.pt');
  fs.writeFileSync(path.join(directory,'neural-v4'),'normal file');
  assert.equal(new PolicyRegistry(directory).nextNeuralVersion(),'n-000045');
 } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
test('global numbering discovers canonical later neural namespaces and keeps its exhaustion guard', () => {
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'v3-number-discovery-'));
 try {
  const registry=new PolicyRegistry(directory);assert.equal(registry.nextNeuralVersion(),'n-000000');
  fs.mkdirSync(path.join(directory,'neural-v12'));
  fs.writeFileSync(path.join(directory,'neural-v12','optimizer-n-123456.pt'),'orphan');
  assert.equal(registry.nextNeuralVersion(),'n-123457');
  fs.writeFileSync(path.join(directory,'neural-v12','weights-n-999999.json'),'orphan');
  assert.throws(()=>registry.nextNeuralVersion(),/exhausted/);
 } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
