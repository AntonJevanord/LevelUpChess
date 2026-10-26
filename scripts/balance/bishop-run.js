'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { acquireLock } = require('./storage');
const { runBishopCollection, bishopIdentity } = require('./bishop-collection-run');
const { validateBishopPlan } = require('./bishop-plan');
const { writeBishopReport } = require('./bishop-report');

const sha = value => createHash('sha256').update(value).digest('hex');

function printEstimate(report, plan, log) {
  const current = report.currentEstimate || {};
  const number = item => Number.isFinite(item?.value) && item.supported !== false ? item.value.toFixed(2) : 'unavailable';
  log('Ordinary material estimates (combined; P=1 and Q=9 assumed): ' +
    [['Pawn', 'pawn'], ['Knight', 'knight'], ['Bishop', 'bishop'], ['Rook', 'rook'], ['Queen', 'queen']]
      .map(([label, key]) => `${label} ${number(current[key])}${current[key]?.assumed ? ' (assumed)' : ''}`).join('; ') + '.');
  const gap = report.currentQueenRookGap;
  const interval = Number.isFinite(gap?.interval?.lower) && Number.isFinite(gap?.interval?.upper)
    ? `; conditional 95% range ${gap.interval.lower.toFixed(2)}–${gap.interval.upper.toFixed(2)}` : '';
  log(`Queen minus rook: ${number(gap)}${interval}. Royal king has no material estimate.`);
  log('Provisional upgrade bonuses (combined): ' + plan.roster.filter(piece => piece.role !== 'historical')
    .map(piece => `${piece.label} ${number(current[`bonus:${piece.id}`])}`).join('; ') + '.');
}

async function runBishopStudy({ plan, outDir, enginePath, resume = false, signal,
  shouldStop = () => null, onProgress = () => {},
  runCollectionService = runBishopCollection, reportService = writeBishopReport,
  getIdentity = bishopIdentity } = {}) {
  validateBishopPlan(plan);
  onProgress(`Linked evidence: 5760 existing records retained; ${plan.schedule.length} new games scheduled.`);
  const directory = path.resolve(outDir), parent = path.dirname(directory);
  fs.mkdirSync(parent, { recursive: true });
  // Keep one study owner across game barriers and analysis. The lock is outside
  // the new run directory, so failed preflight does not create collection data.
  const leaseKey = process.platform === 'win32' ? directory.toLowerCase() : directory;
  const unlock = acquireLock(parent, plan.id, `.bishop-references-${sha(leaseKey)}.lock`);
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
      onProgress(`Analyzing checkpoint ${checkpoint}/1280 new games; games are paused while estimates are saved.`);
      report = await reportService(directory, { checkpoint, onProgress, signal });
      printEstimate(report.report, plan, onProgress);
      onProgress(`Saved checkpoint ${checkpoint}: ${report.files.markdown}`);
      if (signal?.aborted || shouldStop()) break;
    }
    if (!result) return { stopped: true, finishedGames: 0, scheduledGames: 1280, outDir: directory };
    const complete = result.finishedGames === plan.schedule.length;
    if (!signal?.aborted && !result.checkpointReached) {
      onProgress('Saving a provisional report for the interrupted study.');
      report = await reportService(directory, { onProgress, signal });
      printEstimate(report.report, plan, onProgress);
    }
    if (signal?.aborted) onProgress('Immediate stop: histories are saved. Use --report to refresh estimates from the journal.');
    onProgress(complete ? 'Study finished: 1280/1280 new games, linked to 5760 retained records. No further games will start.'
      : `Study stopped: ${result.finishedGames}/1280 scheduled games finished. Resume the same directory to continue.`);
    return { ...result, report, stopped: !complete, outDir: directory };
  } catch (error) {
    if (!signal?.aborted || (error.name !== 'AbortError' && error.code !== 'ABORT_ERR')) throw error;
    onProgress('Immediate stop: histories are saved; incomplete analysis was not frozen. Use --report to refresh estimates.');
    return { ...result, report, stopped: true, finishedGames: result?.finishedGames ?? 0,
      scheduledGames: 1280, outDir: directory };
  } finally { unlock(); }
}

module.exports = { printEstimate, runBishopStudy };
