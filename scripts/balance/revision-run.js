'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { acquireLock } = require('./storage');
const { runRevisionCollection, revisionIdentity } = require('./revision-collection-run');
const { validateRevisionPlan } = require('./revision-plan');
const { writeRevisionReport } = require('./revision-report');

const sha = value => createHash('sha256').update(value).digest('hex');

function printEstimate(report, plan, log) {
  const values = report.analysis?.primary?.combined?.normalized?.values;
  if (!values) { log('Upgrade estimates remain unavailable; see coverage and support in the report.'); return; }
  const number = name => Number.isFinite(values[name]) ? values[name].toFixed(2) : 'unavailable';
  log('Provisional upgrade bonuses, assuming P=1/Q=9: ' + plan.roster
    .filter(piece => piece.role !== 'historical').map(piece => `${piece.label} ${number(`bonus:${piece.id}`)}`).join('; ') + '.');
}

async function runRevisionStudy({ plan, outDir, enginePath, resume = false, signal,
  shouldStop = () => null, onProgress = () => {},
  runCollectionService = runRevisionCollection, reportService = writeRevisionReport,
  getIdentity = revisionIdentity } = {}) {
  validateRevisionPlan(plan);
  onProgress(`Linked parent: ${plan.parent.scheduledGames} existing records retained; ${plan.schedule.length} new games scheduled.`);
  const directory = path.resolve(outDir), parent = path.dirname(directory);
  fs.mkdirSync(parent, { recursive: true });
  // Keep one study owner across game barriers and analysis. The lock is outside
  // the new run directory, so failed preflight does not create collection data.
  const leaseKey = process.platform === 'win32' ? directory.toLowerCase() : directory;
  const unlock = acquireLock(parent, plan.id, `.reference-revisions-${sha(leaseKey)}.lock`);
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
      if (signal?.aborted) break;
      if (!result.checkpointReached) break;
      onProgress(`Analyzing checkpoint ${checkpoint}/4608 new games; games are paused while estimates are saved.`);
      report = await reportService(directory, { checkpoint, onProgress, signal });
      printEstimate(report.report, plan, onProgress);
      onProgress(`Saved checkpoint ${checkpoint}: ${report.files.markdown}`);
      if (signal?.aborted || shouldStop()) break;
    }
    if (!result) return { stopped: true, finishedGames: 0, scheduledGames: 4608, outDir: directory };
    const complete = result.finishedGames === plan.schedule.length;
    if (!signal?.aborted && !result.checkpointReached) {
      onProgress('Saving a provisional report for the interrupted study.');
      report = await reportService(directory, { onProgress, signal });
      printEstimate(report.report, plan, onProgress);
    }
    if (signal?.aborted) onProgress('Immediate stop: histories are saved. Use --report to refresh estimates from the journal.');
    onProgress(complete ? 'Study finished: 4608/4608 new games, linked to 2688 retained parent records. No further games will start.'
      : `Study stopped: ${result.finishedGames}/4608 scheduled games finished. Resume the same directory to continue.`);
    return { ...result, report, stopped: !complete, outDir: directory };
  } catch (error) {
    if (!signal?.aborted || (error.name !== 'AbortError' && error.code !== 'ABORT_ERR')) throw error;
    onProgress('Immediate stop: histories are saved; incomplete analysis was not frozen. Use --report to refresh estimates.');
    return { ...result, report, stopped: true, finishedGames: result?.finishedGames ?? 0,
      scheduledGames: 4608, outDir: directory };
  } finally { unlock(); }
}

module.exports = { printEstimate, runRevisionStudy };
