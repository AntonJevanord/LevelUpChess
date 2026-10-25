'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { acquireLock } = require('./storage');
const { runCollection, collectionIdentity, validatePlan } = require('./material-collection-run');
const { getStudyProtocol } = require('./material-study-plan');
const { writeStudyReport } = require('./material-study-report');

const ROOT = path.resolve(__dirname, '../..');
const sha = value => createHash('sha256').update(value).digest('hex');

function validateStudyPlan(plan) {
  validatePlan(plan);
  const expected = getStudyProtocol();
  if (!isDeepStrictEqual(plan.protocol, expected.protocol)
    || !isDeepStrictEqual(plan.settings, expected.settings)
    || !isDeepStrictEqual(plan.study, expected.study)
    || !isDeepStrictEqual(plan.exclusions, expected.exclusions)
    || plan.schedule.length !== 1152) throw new Error('Use the intact, fixed 1,152-game material study plan.');
  return plan;
}

function studyIdentity(enginePath) {
  const identity = collectionIdentity(enginePath);
  const files = ['scripts/material-study.js', 'scripts/balance/material-study-plan.js',
    'scripts/balance/material-study-run.js', 'scripts/balance/material-study-report.js',
    'experiments/balance/material-study.json',
    'experiments/balance/results/material-collection-preflight-001.json'];
  const studySources = files.map(file => ({ file,
    sha256: sha(fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n')) }));
  return { ...identity, studySources, studySha256: sha(JSON.stringify(studySources)) };
}

function printEstimate(report, log) {
  const values = report.analysis?.primary?.combined?.normalized?.values;
  if (!values) { log('Material estimates remain unavailable; see the report coverage and support checks.'); return; }
  const number = name => Number.isFinite(values[name]) ? values[name].toFixed(2) : 'unavailable';
  log(`Provisional, assuming P=1/Q=9: N ${number('knight')}, B ${number('bishop')}, R ${number('rook')}, Amazon bonus ${number('bonus:queen.purple@1')}.`);
}

async function runStudy({ plan, outDir, enginePath, resume = false, signal,
  shouldStop = () => null, onProgress = () => {},
  runCollectionService = runCollection, reportService = writeStudyReport,
  getIdentity = studyIdentity } = {}) {
  validateStudyPlan(plan);
  const directory = path.resolve(outDir), parent = path.dirname(directory);
  fs.mkdirSync(parent, { recursive: true });
  // Keep one study owner across game barriers and analysis. The lock is outside
  // the new run directory, so failed preflight does not create collection data.
  const leaseKey = process.platform === 'win32' ? directory.toLowerCase() : directory;
  const unlock = acquireLock(parent, plan.id, `.material-study-${sha(leaseKey)}.lock`);
  let continuing = resume, native = null, result, report;
  try {
    for (const checkpoint of plan.study.checkpoints) {
      if (signal?.aborted || shouldStop()) break;
      const options = { plan, outDir: directory, enginePath, jobs: 4, resume: continuing,
        signal, shouldStop, onProgress, getIdentity, untilGames: checkpoint };
      // Each invocation starts with actual native preflight. Subsequent barriers
      // reuse it only after the core rechecks the same frozen identity and plan.
      if (native) options.preflight = async () => native;
      result = await runCollectionService(options);
      continuing = true;
      native = result.manifest.native;
      if (!result.checkpointReached) break;
      onProgress(`Analyzing checkpoint ${checkpoint}/1152; games are paused while estimates are saved.`);
      report = await reportService(directory, { checkpoint, onProgress });
      printEstimate(report.report, onProgress);
      onProgress(`Saved checkpoint ${checkpoint}: ${report.files.markdown}`);
      if (signal?.aborted || shouldStop()) break;
    }
    if (!result) return { stopped: true, finishedGames: 0, scheduledGames: 1152, outDir: directory };
    const complete = result.finishedGames === plan.schedule.length;
    if (!result.checkpointReached || (!complete && (signal?.aborted || shouldStop()))) {
      onProgress('Saving a provisional report for the interrupted study.');
      report = await reportService(directory, { onProgress });
      printEstimate(report.report, onProgress);
    }
    onProgress(complete ? 'Study finished: 1152/1152 scheduled games. No further games will start.'
      : `Study stopped: ${result.finishedGames}/1152 scheduled games finished. Resume the same directory to continue.`);
    return { ...result, report, stopped: !complete, outDir: directory };
  } finally { unlock(); }
}

module.exports = { validateStudyPlan, studyIdentity, printEstimate, runStudy };
