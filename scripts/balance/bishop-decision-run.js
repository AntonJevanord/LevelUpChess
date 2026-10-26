'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { getRunIdentity } = require('./run');
const { acquireLock } = require('./storage');
const { renameWithRetrySync, unlinkWithRetrySync } = require('./files');
const { getDecisionProtocol, validateDecisionPlan, validateDecisionStage } = require('./bishop-decision-plan');
const { runHeadCollection, readHeadManifest } = require('./head-collection');
const { writeDecisionReport } = require('./bishop-decision-report');

const ROOT = path.resolve(__dirname, '../..');
const FORMAT = 'levelup-bishop-decision-campaign';
const sha = value => createHash('sha256').update(value).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));

function checkAbort(signal) {
  if (!signal?.aborted) return;
  const error = new Error('Bishop decision cancelled.');
  error.name = 'AbortError'; error.code = 'ABORT_ERR'; throw error;
}

function getDecisionIdentity(enginePath) {
  const library = getDecisionProtocol();
  const sources = ['scripts/bishop-decision.js', 'scripts/balance/bishop-decision-run.js',
    'scripts/balance/bishop-decision-plan.js', 'scripts/balance/head-collection.js',
    'scripts/balance/bishop-decision-preflight.js', 'scripts/balance/bishop-decision-evidence.js',
    'scripts/balance/bishop-decision-report.js', 'scripts/balance/reference-matrix.js',
    'scripts/balance/revision-compatibility.js',
    'scripts/balance/revision-plan.js', 'scripts/balance/bishop-plan.js', 'scripts/balance/bishop-source.js',
    'scripts/balance/simple-plan.js', 'scripts/balance/design-registry.js',
    'scripts/balance/simple-dataset.js', 'scripts/balance/reference-dataset.js',
    'scripts/balance/reference-plan.js', 'scripts/balance/material-dataset.js',
    'scripts/balance/design-profile.js', 'scripts/balance/evaluation.js', 'src/design-catalog.js',
    'scripts/material-collect.js',
    'experiments/balance/results/reference-revisions-preflight-001.json',
    'experiments/balance/results/bishop-reference-preflight-001.json',
    ...[library, library.old, library.revision].flatMap(item => item.configFiles || [])
      .map(file => path.relative(ROOT, file).split(path.sep).join('/'))];
  const decisionSources = [...new Set(sources)].map(file => ({ file,
    sha256: sha(fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n')) }));
  return { ...getRunIdentity(enginePath), decisionSources, collectorSha256: sha(JSON.stringify(decisionSources)),
    decisionSha256: sha(JSON.stringify(decisionSources)) };
}

function evidenceDefinitions(plan) {
  if (!Array.isArray(plan.sourceEvidence)) throw new Error('Decision source evidence is required.');
  const names = new Set();
  for (const item of plan.sourceEvidence) {
    if (!item || typeof item.name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(item.name)
      || item.name.endsWith('.') || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(item.name)
      || names.has(item.name.toLowerCase()) || typeof item.file !== 'string' || !item.file || item.file.includes('\0')
      || typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256)) {
      throw new Error('Decision evidence needs distinct safe basenames, source files and SHA-256 hashes.');
    }
    names.add(item.name.toLowerCase());
  }
  return plan.sourceEvidence;
}

function evidenceBytes(plan, directory) {
  return evidenceDefinitions(plan).map(item => {
    const file = directory ? path.join(directory, 'evidence', item.name) : path.resolve(ROOT, item.file);
    const bytes = fs.readFileSync(file);
    if (sha(bytes) !== item.sha256) throw new Error(`Frozen decision evidence checksum differs: ${item.name}.`);
    return { ...item, bytes };
  });
}

function writeFrozen(file, bytes) {
  const content = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes, 'utf8');
  if (fs.existsSync(file)) {
    if (!fs.readFileSync(file).equals(content)) throw new Error(`Frozen decision snapshot differs: ${path.basename(file)}.`);
    return;
  }
  const directory = path.dirname(file), temporary = path.join(directory, `.${path.basename(file)}.${randomUUID()}.tmp`);
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx'); fs.writeFileSync(fd, content); fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    renameWithRetrySync(temporary, file);
    try { fd = fs.openSync(directory, 'r'); fs.fsyncSync(fd); }
    catch (error) { if (!['EINVAL', 'EISDIR', 'EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error; }
  } finally {
    try { if (fd !== undefined) fs.closeSync(fd); }
    finally { unlinkWithRetrySync(temporary); }
  }
}

function readDecisionManifest(directory, { validatePlan = validateDecisionPlan } = {}) {
  const campaign = JSON.parse(fs.readFileSync(path.join(directory, 'campaign.json'), 'utf8'));
  if (!campaign || campaign.schemaVersion !== 1 || campaign.format !== FORMAT
    || typeof campaign.runId !== 'string' || !campaign.runId || campaign.jobs !== 4
    || !campaign.identity || typeof campaign.identity !== 'object' || Array.isArray(campaign.identity)
    || !campaign.native || typeof campaign.native !== 'object' || Array.isArray(campaign.native)) {
    throw new Error('An intact bishop decision campaign manifest is required.');
  }
  validatePlan(campaign.plan);
  const keys = campaign.plan.stages.filter(stage => stage.plan.schedule.length).map(stage => stage.key);
  if (!isDeepStrictEqual(Object.keys(campaign.native).sort(), keys.sort())
    || keys.some(key => !campaign.native[key] || typeof campaign.native[key] !== 'object' || Array.isArray(campaign.native[key]))) {
    throw new Error('Frozen decision stage diagnostics differ.');
  }
  evidenceBytes(campaign.plan, directory);
  return campaign;
}

function campaignLock(directory, runId) {
  const parent = path.dirname(directory);
  fs.mkdirSync(parent, { recursive: true });
  const key = process.platform === 'win32' ? directory.toLowerCase() : directory;
  return acquireLock(parent, runId, `.bishop-decision-${sha(key)}.lock`);
}

function finalizedStageCount(directory, stage) {
  const file = path.join(directory, stage.key, 'games.jsonl');
  if (!fs.existsSync(file)) return 0;
  const bytes = fs.readFileSync(file), complete = bytes.subarray(0, bytes.lastIndexOf(10) + 1).toString('utf8');
  const scheduled = new Set(stage.plan.schedule.map(game => game.id)), final = new Set();
  for (const line of complete.split('\n').filter(Boolean)) {
    const row = JSON.parse(line);
    if (scheduled.has(row.id) && ['completed', 'truncated'].includes(row.status)) final.add(row.id);
  }
  return final.size;
}

function printDecisionScores(report, log = console.log) {
  if (!report?.matchups) return;
  const candidates = [...new Set(report.matchups.map(row => row.designA))];
  for (const id of candidates) {
    const rows = report.matchups.filter(row => row.designA === id);
    log(`${rows[0].label} (${rows[0].movement}): ` + rows.map(row =>
      `${row.reference} ${Number.isFinite(row.score) ? (100 * row.score).toFixed(2) + '%' : 'unavailable'} (${row.games}/${row.expectedGames ?? 256} paired games)`)
      .join('; ') + '.');
  }
}

async function checkDecisionCampaign({ plan, enginePath, signal, onProgress = () => {},
  validatePlan = validateDecisionPlan, rulesFactory, engineFactory,
  validateEvidence = require('./bishop-decision-evidence').validateDecisionEvidence,
  validateSourceHistories = require('./bishop-decision-evidence').validateDecisionSourceHistories,
  preflight = require('./bishop-decision-preflight').checkDecisionStage, directory } = {}) {
  validatePlan(plan); checkAbort(signal);
  validateEvidence(plan, { directory });
  const sourceReplay = await validateSourceHistories({ plan, rulesFactory, signal, onProgress, directory });
  const native = {};
  for (const stage of plan.stages) {
    if (!stage.plan.schedule.length) continue;
    checkAbort(signal);
    native[stage.key] = await preflight({ plan: stage.plan, enginePath, signal, rulesFactory, engineFactory, onProgress });
    if (!native[stage.key] || typeof native[stage.key] !== 'object' || Array.isArray(native[stage.key])
      || native[stage.key].searchesStarted !== 0) throw new Error('Decision preflight must prove zero searches for every nonempty stage.');
  }
  checkAbort(signal);
  return { checked: true, plan, sourceReplay, native, searchesStarted: 0 };
}

async function writeDecisionCampaignReport(directory, { reportService = writeDecisionReport,
  validatePlan = validateDecisionPlan,
  validateEvidence = require('./bishop-decision-evidence').validateDecisionEvidence, ...options } = {}) {
  const root = path.resolve(directory);
  // Reporting shares the collection owner, including during gaps between stages.
  const unlock = campaignLock(root, 'bishop-decision-report');
  try {
    const campaign = readDecisionManifest(root, { validatePlan });
    validateEvidence(campaign.plan, { directory: root });
    return await reportService(root, { ...options, validatePlan });
  } finally { unlock(); }
}

async function runDecisionCampaign({ plan, outDir, enginePath, jobs = 4, resume = false, signal,
  shouldStop = () => null, onProgress = () => {}, validatePlan = validateDecisionPlan,
  validateStage = validateDecisionStage, getIdentity = getDecisionIdentity,
  runCollectionService = runHeadCollection, readStageManifest = readHeadManifest,
  reportService = writeDecisionReport, preflight = require('./bishop-decision-preflight').checkDecisionStage,
  validateEvidence = require('./bishop-decision-evidence').validateDecisionEvidence,
  validateSourceHistories = require('./bishop-decision-evidence').validateDecisionSourceHistories,
  rulesFactory, engineFactory, storeFactory } = {}) {
  validatePlan(plan);
  if (jobs !== 4) throw new Error('The bishop decision uses exactly four jobs.');
  if (typeof outDir !== 'string' || !outDir) throw new Error('A new campaign output directory is required.');
  const directory = path.resolve(outDir);
  const unlock = campaignLock(directory, plan.id);
  let campaign, result, report;
  const stageProgress = new Map();
  // A cancellation can arrive while a resumed invocation is still validating
  // source histories, before the collector has returned its current totals.
  const finishedGames = () => plan.stages.reduce((total, stage) => total
    + Math.max(stageProgress.get(stage.key) || 0, finalizedStageCount(directory, stage)), 0);
  try {
    checkAbort(signal);
    const original = resume ? readDecisionManifest(directory, { validatePlan }) : null;
    if (!resume && fs.existsSync(directory) && fs.readdirSync(directory).length) throw new Error('Use a new empty bishop decision directory.');
    if (original && !isDeepStrictEqual(original.plan, plan)) throw new Error('Cannot resume: the frozen decision plan changed.');
    const identity = await getIdentity(enginePath);
    if (original && !isDeepStrictEqual(original.identity, identity)) throw new Error('Cannot resume: decision sources, rules or executable changed.');
    const evidence = evidenceBytes(plan, resume ? directory : undefined);
    const checked = await checkDecisionCampaign({ plan, enginePath, signal, onProgress, validatePlan, rulesFactory,
      engineFactory, validateEvidence, validateSourceHistories, preflight, directory: resume ? directory : undefined });
    if (original && !isDeepStrictEqual(original.native, checked.native)) throw new Error('Cannot resume: frozen native decision diagnostics changed.');
    if (original && !isDeepStrictEqual(original.sourceReplay, checked.sourceReplay)) throw new Error('Cannot resume: frozen source replay proof changed.');
    campaign = original || { schemaVersion: 1, format: FORMAT, runId: randomUUID(), createdAt: new Date().toISOString(),
      plan: clone(plan), jobs, identity: clone(identity), native: clone(checked.native), sourceReplay: checked.sourceReplay,
      enginePath: path.resolve(enginePath),
      engineSha256: identity.engineSha256 };
    // Check every existing stage before a worker in either stage can search.
    for (const stage of plan.stages) {
      const stageDir = path.join(directory, stage.key);
      if (!fs.existsSync(path.join(stageDir, 'run.json'))) continue;
      const saved = readStageManifest(stageDir, validateStage);
      if (!isDeepStrictEqual(saved.plan, stage.plan) || !isDeepStrictEqual(saved.identity, campaign.identity)
        || !isDeepStrictEqual(saved.native, campaign.native[stage.key])) throw new Error(`Cannot resume: frozen ${stage.key} stage identity differs.`);
    }
    if (shouldStop()) return { stopped: true, finishedGames: finishedGames(), scheduledGames: plan.totalGames, outDir: directory };
    checkAbort(signal);
    fs.mkdirSync(directory, { recursive: true });
    if (evidence.length) fs.mkdirSync(path.join(directory, 'evidence'), { recursive: true });
    for (const item of evidence) writeFrozen(path.join(directory, 'evidence', item.name), item.bytes);
    writeFrozen(path.join(directory, 'campaign.json'), JSON.stringify(campaign, null, 2) + '\n');
    onProgress(`Bishop decision: ${plan.totalGames} new games; ${plan.restoredRecords.length + plan.inheritedBishopRecords.length} inherited records retained; four jobs.`);
    for (const stage of plan.stages) {
      if (!stage.plan.schedule.length) continue;
      const stageDir = path.join(directory, stage.key);
      for (const count of stage.plan.study.checkpoints) {
        if (signal?.aborted || shouldStop()) break;
        const continuing = fs.existsSync(path.join(stageDir, 'run.json'));
        result = await runCollectionService({ plan: stage.plan, outDir: stageDir, enginePath, jobs,
          resume: continuing, signal, shouldStop, onProgress, untilGames: count, validatePlan: validateStage,
          getIdentity: async () => {
            const current = await getIdentity(enginePath);
            if (!isDeepStrictEqual(current, campaign.identity)) throw new Error('Frozen decision sources, rules or executable changed between checkpoints.');
            return current;
          }, preflight: async () => campaign.native[stage.key],
          rulesFactory, engineFactory, storeFactory });
        stageProgress.set(stage.key, result.finishedGames);
        if (signal?.aborted) break;
        if (shouldStop() || !result.checkpointReached) {
          report = await reportService(directory, { signal, onProgress, validatePlan });
          printDecisionScores(report.report, onProgress);
          return { ...result, manifest: campaign, report, stopped: true, finishedGames: finishedGames(),
            scheduledGames: plan.totalGames, outDir: directory };
        }
        onProgress(`Saving ${stage.key} checkpoint ${count}/${stage.plan.schedule.length}; games are paused.`);
        report = await reportService(directory, { checkpoint: { stage: stage.key, count }, signal, onProgress, validatePlan });
        printDecisionScores(report.report, onProgress);
        if (signal?.aborted || shouldStop()) break;
      }
      if (signal?.aborted || shouldStop()) break;
      if (!result?.checkpointReached || result.finishedGames !== stage.plan.schedule.length) break;
    }
    const complete = finishedGames() === plan.totalGames;
    if (!signal?.aborted && shouldStop()) {
      report = await reportService(directory, { signal, onProgress, validatePlan });
      printDecisionScores(report.report, onProgress);
    }
    if (signal?.aborted) onProgress('Immediate stop: histories are saved. Use --report to refresh the decision scores.');
    else onProgress(complete ? `Bishop decision finished: ${finishedGames()}/${plan.totalGames} new games. No further games will start.`
      : 'Bishop decision stopped. Resume the same directory to continue.');
    return { manifest: campaign, report, stopped: !complete || Boolean(shouldStop()) || Boolean(signal?.aborted), finishedGames: finishedGames(),
      scheduledGames: plan.totalGames, outDir: directory };
  } catch (error) {
    if (!signal?.aborted || (error.name !== 'AbortError' && error.code !== 'ABORT_ERR')) throw error;
    onProgress('Immediate stop: recorded histories are preserved. Use --report to refresh the decision scores.');
    return { manifest: campaign, report, stopped: true, finishedGames: finishedGames(), scheduledGames: plan.totalGames, outDir: directory };
  } finally { unlock(); }
}

module.exports = { getDecisionIdentity, readDecisionManifest, checkDecisionCampaign,
  runDecisionCampaign, writeDecisionCampaignReport, printDecisionScores };
