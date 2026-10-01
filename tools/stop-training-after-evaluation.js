// Operational stop helper: complete the current evaluation, then drain active matches.
const fs = require('node:fs');
const path = require('node:path');
const dir = path.resolve(__dirname, '../training-data');
const read = name => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
const initial = read('status.json');
const requestPath = path.join(dir, 'stop-request.json');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const deadline = Date.now() + 20 * 60 * 1000;
  let requested = false, acknowledged = false, previous = '';
  while (Date.now() < deadline) {
    const status = read('status.json');
    if (status.runId !== initial.runId) throw new Error('Training run changed; stop helper refuses to affect another run');
    const snapshot = JSON.stringify({state:status.state,candidate:status.candidateVersion,phase:status.phase,active:status.active,completed:status.completed,failed:status.failed,games:status.candidateValidationGames});
    if (snapshot !== previous) { console.log(snapshot); previous = snapshot; }
    if (status.state === 'failed') throw new Error('Training failed: ' + JSON.stringify(status));
    if (status.state === 'stopped') { console.log('Graceful stop completed'); return; }
    const evaluationFinished = !['selection','final-test','validation'].includes(initial.phase) ||
      status.lastEvaluation?.candidateVersion === initial.candidateVersion || status.candidateVersion !== initial.candidateVersion;
    if (!requested && evaluationFinished) {
      const lock = read('supervisor.lock.json');
      if (lock.runId !== initial.runId || lock.pid !== initial.pid) throw new Error('Lock does not match original run');
      fs.writeFileSync(requestPath, JSON.stringify({runId:initial.runId,requestedAt:Date.now()}));
      requested = true;
      console.log('Requested stop after evaluation finished');
    }
    if (requested && status.stopRequested && !acknowledged) {
      // stopRequested is latched in the supervisor. Removing its consumed request
      // prevents the CLI from escalating to abortActive after thirty seconds.
      if (fs.existsSync(requestPath) && read('stop-request.json').runId === initial.runId) fs.unlinkSync(requestPath);
      acknowledged = true;
      console.log('Stop acknowledged; draining active matches without timeout abort');
    }
    await delay(250);
  }
  throw new Error('Timed out waiting for graceful stop; inspect production status');
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
