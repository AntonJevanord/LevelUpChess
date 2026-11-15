#!/usr/bin/env node
'use strict';

// New optional screens own their source snapshot and append complete eight-case
// batches. Existing campaigns and the project's active rules stay untouched.
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { ensureResearchOverlay, openResearchOverlay } = require('./balance/research-overlay');
const { acquireLock } = require('./balance/storage');
const { renameWithRetrySync, unlinkWithRetrySync } = require('./balance/files');

const ROOT = path.resolve(__dirname, '..');
const OWNER = 'screen-runtime.json', MANIFEST = 'screen.json', STATE = 'screen-state.json', LOCK = '.v18-screen.lock';
const OVERLAY = Object.freeze({ name: 'reference-screens-v18', entryFile: 'scripts/v18-balance.js', definitionFile: 'src/balance-designs-v18-screen.js' });
const STUDIES = Object.freeze(['level1', 'level2', 'mobility']);
const TARGETS = Object.freeze([8, 16, 32, 64]);
const TEMP = /^\.v18-screen-[a-f0-9-]{36}\.tmp$/;
const sha = value => createHash('sha256').update(value).digest('hex');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const HELP = `Version 18 reference screens, each in its own immutable runtime

  npm.cmd run balance:v18 -- --study level1 --out DIRECTORY [--openings 8] [--jobs 4]
  npm.cmd run balance:v18 -- --study level2 --out DIRECTORY [--openings 8] [--jobs 4]
  npm.cmd run balance:v18 -- --study mobility --out DIRECTORY [--openings 8] [--jobs 4]
  npm.cmd run balance:v18 -- --study NAME --resume DIRECTORY [--openings 16]
  npm.cmd run balance:v18 -- --study NAME --report DIRECTORY
  npm.cmd run balance:v18 -- --study NAME --check [--openings 8] [--rules-only]

Opening targets are TOTALS of 8, 16, 32 or 64, not additional cases. Resume
without --openings retains the previous target. Completed stages are verified
and skipped; new batches append separate authoritative game journals. Reports
update at stage boundaries and retain completed eight-case checkpoints under
reports/openings-N. Offline reporting starts no engines or games.

Level1/level2 use 40k nodes; mobility keeps 40k/80k separate. Each cell retains
both physical colors. Fixed engine priors are not material-value estimates.
Run one study at a time. q/Ctrl+C stops now; g finishes active games; p finishes
active color pairs. Any stop, failure or unfinished stage pauses the queue.
--engine PATH selects a compatible native executable; otherwise use
FAIRY_STOCKFISH_PATH or the bundled Windows engine. --log plies adds moves;
starts/results are the default. Keep the entire output folder, including runtime.
`;

function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])
    || args.length === 3 && args[0] === '--study' && STUDIES.includes(args[1]) && ['--help', '-h'].includes(args[2])) return { help: true };
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index], key = typeof flag === 'string' && flag.startsWith('--') ? flag.slice(2) : '';
    if (!['study', 'check', 'rules-only', 'out', 'resume', 'report', 'openings', 'jobs', 'engine', 'log'].includes(key)
      || Object.hasOwn(options, key)) throw new Error(`Unknown or repeated option: ${flag}. Use --help.`);
    if (['check', 'rules-only'].includes(key)) { options[key] = true; continue; }
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
    options[key] = value;
  }
  if (!STUDIES.includes(options.study)) throw new Error('Select --study level1, level2 or mobility.');
  const modes = ['check', 'out', 'resume', 'report'].filter(key => options[key]);
  if (modes.length !== 1) throw new Error('Choose exactly one of --check, --out, --resume or --report.');
  const mode = modes[0];
  if (options['rules-only'] && !options.check || options.jobs !== undefined && mode !== 'out'
    || options.engine && (mode === 'report' || options['rules-only'])
    || options.openings !== undefined && mode === 'report'
    || options.log && !['out', 'resume'].includes(mode)) throw new Error('An option does not apply to the selected mode.');
  if (options.openings !== undefined) {
    if (!['8', '16', '32', '64'].includes(options.openings)) throw new Error('--openings must be a total of 8, 16, 32 or 64.');
    options.openings = Number(options.openings);
  }
  if (options.jobs !== undefined && !/^(?:[1-9]|1[0-6])$/.test(options.jobs)) throw new Error('--jobs must be 1 through 16.');
  if (mode === 'out') options.jobs = Number(options.jobs || 4);
  if (['check', 'out'].includes(mode)) options.openings ??= 8;
  if (options.log !== undefined && !['games', 'plies'].includes(options.log)) throw new Error('--log must be games or plies.');
  return options;
}
function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.v18-screen-${randomUUID()}.tmp`);
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx'); fs.writeFileSync(fd, content); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    renameWithRetrySync(temporary, file);
  } finally { if (fd !== undefined) fs.closeSync(fd); unlinkWithRetrySync(temporary); }
}
function ordinaryDirectory(root) {
  const stat = fs.lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Use an ordinary screen directory, not a symbolic link.');
}
function requireInactive(root) {
  if (!fs.existsSync(path.join(root, 'run.lock'))) return;
  const owner = json(path.join(root, 'run.lock'));
  if (!Number.isSafeInteger(owner.pid) || owner.pid < 1) throw new Error('Cannot establish stage lock ownership.');
  try { process.kill(owner.pid, 0); } catch (error) { if (error.code === 'ESRCH') return; throw error; }
  throw new Error(`Screen stage is active in process ${owner.pid}.`);
}
function stageState(root, stage, jobs, study, planTools = require('./balance/v18-screen-plan')) {
  if (!fs.existsSync(root)) return { mode: 'new' };
  ordinaryDirectory(root); requireInactive(root);
  const tools = require('./version17-balance'), declaration = planTools.getBatchDeclaration(study, stage.batchIndex, stage.nodes);
  // Completed preflight owns only its private abandoned atomic files.
  for (const file of fs.readdirSync(root)) if (/^\.v17-[a-f0-9-]{36}\.tmp$/.test(file) && fs.lstatSync(path.join(root, file)).isFile()) unlinkWithRetrySync(path.join(root, file));
  const entries = fs.readdirSync(root);
  if (!entries.length) return { mode: 'new' };
  if (!entries.includes('run.json')) {
    if (entries.length !== 1 || entries[0] !== 'v17-preflight.json') throw new Error('Foreign screen stage output without a run manifest.');
    tools.validatePreflight(json(path.join(root, entries[0])), declaration); return { mode: 'new' };
  }
  const input = tools.readReportInput(root, declaration);
  if (input.manifest.parallel?.jobs !== jobs) throw new Error('The stage worker count changed.');
  const report = require('./balance/v17-report').createV17Report({ ...declaration, ...input });
  return { mode: report.progress.finalizedGames === stage.games ? 'complete' : 'resume', ...input, report, declaration };
}
function inspectAll(root, manifest, planTools) {
  return manifest.stages.map(stage => ({ ...stage,
    state: stageState(path.join(root, stage.directory), stage, manifest.jobs, manifest.study, planTools) }));
}
function validateStageIdentities(stages, manifest) {
  for (const stage of stages) if (stage.state.manifest) for (const field of ['engineSha256', 'runnerSha256', 'runnerSources', 'rulesBundleSha256']) {
    if (!isDeepStrictEqual(stage.state.manifest[field], manifest.identity[field])) throw new Error('A stage changed the screen runtime identity.');
  }
}
function validateManifest(manifest, planTools, overlaySha256, identity) {
  if (!manifest || !manifest.runId || !manifest.createdAt || !manifest.identity) throw new Error('Missing screen ownership or runtime identity.');
  const { planSha256, runId, createdAt, initialOpenings, overlaySha256: storedOverlay, identity: storedIdentity, ...declaration } = manifest;
  if (!TARGETS.includes(initialOpenings) || storedOverlay !== overlaySha256
    || planSha256 !== sha(JSON.stringify(declaration))
    || !isDeepStrictEqual(declaration, { ...planTools.buildCampaignPlan({ study: declaration.study, jobs: declaration.jobs }), study: declaration.study })
    || identity && !isDeepStrictEqual(identity, storedIdentity)) throw new Error('The frozen screen plan or runtime identity changed.');
  for (const field of ['engineSha256', 'rulesBundleSha256', 'runnerSha256']) if (!/^[a-f0-9]{64}$/.test(storedIdentity[field] || '')) throw new Error('Invalid screen runtime identity.');
  return manifest;
}
function validateRoot(root, manifest, planTools) {
  const allowed = new Set([OWNER, MANIFEST, STATE, LOCK, 'runtime', 'configs', 'reports', 'screen-report.json', 'screen-report.md', ...manifest.stages.map(stage => stage.directory)]);
  for (const file of fs.readdirSync(root)) if ((!allowed.has(file) && !TEMP.test(file)) || fs.lstatSync(path.join(root, file)).isSymbolicLink()) throw new Error(`Foreign or symbolic screen output: ${file}.`);
  const configs = path.join(root, 'configs');
  if (fs.existsSync(configs)) {
    ordinaryDirectory(configs);
    for (const file of fs.readdirSync(configs)) {
      if (TEMP.test(file) && fs.lstatSync(path.join(configs, file)).isFile()) continue;
      const stage = manifest.stages.find(stage => `${stage.directory}.json` === file);
      if (!stage || fs.lstatSync(path.join(configs, file)).isSymbolicLink()
        || !isDeepStrictEqual(json(path.join(configs, file)), planTools.getBatchDeclaration(manifest.study, stage.batchIndex, stage.nodes).config)) throw new Error('A screen config is foreign or changed.');
    }
  }
  const reports = path.join(root, 'reports');
  if (fs.existsSync(reports)) {
    ordinaryDirectory(reports);
    for (const directory of fs.readdirSync(reports)) {
      if (!TARGETS.some(target => directory === `openings-${target}`)) throw new Error('Foreign screen checkpoint output.');
      const checkpoint = path.join(reports, directory); ordinaryDirectory(checkpoint);
      for (const file of fs.readdirSync(checkpoint)) if ((!['screen-report.json', 'screen-report.md'].includes(file) && !TEMP.test(file))
        || fs.lstatSync(path.join(checkpoint, file)).isSymbolicLink()) throw new Error('Foreign or symbolic screen checkpoint output.');
    }
  }
}
function reportSources(stages) {
  return stages.filter(stage => stage.state.manifest).map(({ state, ...stage }) => ({ ...stage,
    manifest: state.manifest, records: state.records, source: state.source, declaration: state.declaration }));
}
function writeOwnedReport(directory, report, renderer) {
  ordinaryDirectory(directory);
  const file = path.join(directory, 'screen-report.json'), markdown = path.join(directory, 'screen-report.md');
  for (const existing of [file, markdown]) if (fs.existsSync(existing) && fs.lstatSync(existing).isSymbolicLink()) throw new Error('Refusing to replace a linked screen report.');
  if (fs.existsSync(file)) {
    const previous = json(file);
    if (previous.runId !== report.runId || previous.format !== report.format) throw new Error('Refusing to replace a foreign screen report.');
  } else if (fs.existsSync(markdown)) throw new Error('Refusing to replace unowned screen Markdown.');
  atomicWrite(file, JSON.stringify(report, null, 2) + '\n'); atomicWrite(markdown, renderer(report));
  return { json: file, markdown };
}
function writeReport(root, manifest, targetOpenings, stages, planTools) {
  const sources = reportSources(stages);
  const report = planTools.reportStudy({ ...manifest, targetOpenings }, sources);
  const files = writeOwnedReport(root, report, planTools.renderReport);
  // Save each complete declared target even when a larger target was requested
  // from the beginning. Each checkpoint contains only its own opening prefix.
  for (const target of TARGETS.filter(target => target <= targetOpenings)) {
    const selected = planTools.selectedStages(target, manifest);
    if (!selected.every(descriptor => stages.find(stage => stage.id === descriptor.id)?.state.mode === 'complete')) continue;
    const directory = path.join(root, 'reports', `openings-${target}`);
    fs.mkdirSync(directory, { recursive: true }); ordinaryDirectory(directory);
    const ids = new Set(selected.map(stage => stage.id));
    const checkpoint = planTools.reportStudy({ ...manifest, targetOpenings: target }, sources.filter(stage => ids.has(stage.id)));
    writeOwnedReport(directory, checkpoint, planTools.renderReport);
  }
  return { report, files };
}

// Executes inside the verified source snapshot. Tests inject a tiny frozen plan
// and synthetic stages; normal operation always resolves the snapshot catalog.
async function runStudy(args, { enginePath, overlaySha256, initialJobs, initialOpenings, log = console.log, signals = process,
  planTools = require('./balance/v18-screen-plan'), check, run, persist,
  identity = require('./balance/run').getRunIdentity, inspect = inspectAll, report = writeReport, verifyOverlay = openResearchOverlay } = {}) {
  const options = parseArgs(args), tools = require('./version17-balance');
  check ||= planTools.checkExperiment || tools.checkExperiment; run ||= require('./parallel-balance').main; persist ||= tools.writePreflight;
  const controller = new AbortController(), abort = () => controller.abort();
  signals.on('SIGINT', abort); signals.on('SIGTERM', abort);
  try {
    if (options.check) {
      const plan = planTools.buildCampaignPlan({ study: options.study, jobs: 4 });
      for (const stage of planTools.selectedStages(options.openings, plan)) {
        if (controller.signal.aborted) throw new Error('Screen validation cancelled; no games started.');
        await check(planTools.getBatchDeclaration(options.study, stage.batchIndex, stage.nodes), {
          enginePath: options['rules-only'] ? undefined : enginePath, signal: controller.signal, onProgress: log });
      }
      if (controller.signal.aborted) throw new Error('Screen validation cancelled; no games started.');
      log('Version 18 screen preflight passed. No games started.'); return { checked: true };
    }
    const root = path.resolve(options.out || options.resume || options.report);
    const currentIdentity = options.report ? null : identity(enginePath);
    let manifest;
    if (!fs.existsSync(path.join(root, MANIFEST)) && !options.report) {
      if (fs.readdirSync(root).some(file => ![OWNER, LOCK, 'runtime'].includes(file) && !TEMP.test(file))) throw new Error('Missing screen manifest beside existing data.');
      const declaration = { ...planTools.buildCampaignPlan({ study: options.study, jobs: options.out ? options.jobs : initialJobs }), study: options.study };
      manifest = { ...declaration, planSha256: sha(JSON.stringify(declaration)), runId: randomUUID(), createdAt: new Date().toISOString(),
        initialOpenings: options.out ? options.openings : initialOpenings, overlaySha256, identity: currentIdentity };
      if (!TARGETS.includes(manifest.initialOpenings)) throw new Error('Missing initial opening target after interrupted setup.');
      atomicWrite(path.join(root, MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
    } else manifest = validateManifest(json(path.join(root, MANIFEST)), planTools, overlaySha256, currentIdentity);
    if (manifest.study !== options.study) throw new Error('A different study cannot reuse this screen directory.');
    validateRoot(root, manifest, planTools);
    let state;
    try { state = json(path.join(root, STATE)); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      state = { runId: manifest.runId, targetOpenings: manifest.initialOpenings };
      if (!options.report) atomicWrite(path.join(root, STATE), JSON.stringify(state) + '\n');
    }
    if (state.runId !== manifest.runId || !TARGETS.includes(state.targetOpenings)) throw new Error('Invalid screen target state.');
    const target = options.openings ?? state.targetOpenings;
    if (target < state.targetOpenings) throw new Error('An opening target cannot shrink; completed evidence stays in this campaign.');
    let stages = inspect(root, manifest, planTools); validateStageIdentities(stages, manifest);
    let updated = report(root, manifest, target, stages, planTools);
    if (options.report) { log(`Screen report: ${updated.files.markdown}. No games started.`); return updated; }
    if (target !== state.targetOpenings) atomicWrite(path.join(root, STATE), JSON.stringify({ runId: manifest.runId, targetOpenings: target }) + '\n');
    log(`Version 18 ${options.study}: ${target} total openings; ${planTools.expectedGames(options.study, target)} games; ${manifest.jobs} workers total.`);
    const completed = [];
    for (const descriptor of planTools.selectedStages(target, manifest)) {
      if (controller.signal.aborted) return { stopped: true, completed, ...updated };
      const stage = stages.find(row => row.id === descriptor.id);
      if (stage.state.mode === 'complete') { completed.push(stage.id); log(`Verified complete; skipping ${stage.id}.`); continue; }
      verifyOverlay({ directory: ROOT, manifestSha256: overlaySha256 });
      if (!isDeepStrictEqual(identity(enginePath), manifest.identity)) throw new Error('The screen runtime or engine changed between stages.');
      const declaration = planTools.getBatchDeclaration(options.study, stage.batchIndex, stage.nodes), directory = path.join(root, stage.directory);
      log(`Starting ${stage.id}: ${stage.games} games, ${stage.nodes} nodes/move.`);
      const proof = await check(declaration, { enginePath, signal: controller.signal, onProgress: log });
      if (controller.signal.aborted) return { stopped: true, completed, ...updated };
      persist(directory, declaration, proof, { resume: stage.state.mode === 'resume' });
      const configFile = path.join(root, 'configs', `${stage.directory}.json`);
      if (!fs.existsSync(configFile)) atomicWrite(configFile, JSON.stringify(declaration.config, null, 2) + '\n');
      const runArgs = stage.state.mode === 'resume' ? ['--resume', directory]
        : ['--config', configFile, '--out', directory, '--jobs', String(manifest.jobs)];
      runArgs.push('--log', options.log || 'games');
      const previous = process.env.FAIRY_STOCKFISH_PATH;
      let result;
      try {
        process.env.FAIRY_STOCKFISH_PATH = enginePath;
        result = await run(runArgs, { comparisonNames: Object.fromEntries(declaration.metadata.comparisons.map(cell => [cell.id, { a: cell.aLabel, b: cell.bLabel }])) });
      } catch (error) {
        try { const current = inspect(root, manifest, planTools); validateStageIdentities(current, manifest); updated = report(root, manifest, target, current, planTools); }
        catch (refreshError) { error.reportError = refreshError.message; }
        if (controller.signal.aborted) return { stopped: true, completed, ...updated };
        throw error;
      } finally {
        if (previous === undefined) delete process.env.FAIRY_STOCKFISH_PATH; else process.env.FAIRY_STOCKFISH_PATH = previous;
      }
      stages = inspect(root, manifest, planTools); validateStageIdentities(stages, manifest);
      updated = report(root, manifest, target, stages, planTools);
      const finished = stages.find(row => row.id === stage.id);
      if (result?.stopped || result?.stopRequested || controller.signal.aborted || finished.state.mode !== 'complete') return { stopped: true, completed, ...updated };
      completed.push(stage.id);
    }
    log(`Version 18 screen finished. Report: ${updated.files.markdown}`); return { stopped: false, completed, ...updated };
  } finally { signals.removeListener('SIGINT', abort); signals.removeListener('SIGTERM', abort); }
}

async function main(args = process.argv.slice(2), { sourceRoot = ROOT, ensure = ensureResearchOverlay, open = openResearchOverlay,
  execute, log = console.log, enginePath: suppliedEngine } = {}) {
  const options = parseArgs(args);
  if (options.help) { log(HELP); return; }
  const enginePath = options.report || options['rules-only'] ? undefined : options.engine ? path.resolve(options.engine)
    : suppliedEngine || (process.env.FAIRY_STOCKFISH_PATH ? path.resolve(process.env.FAIRY_STOCKFISH_PATH)
      : process.platform === 'win32' ? path.join(sourceRoot, 'stockfish/fairy-stockfish-levelup_x86-64.exe') : undefined);
  if (!options.report && !options['rules-only'] && !enginePath) throw new Error('Set FAIRY_STOCKFISH_PATH or --engine to a compatible native executable on Linux/macOS.');
  let overlay, unlock, initialJobs, initialOpenings;
  try {
    if (options.check) overlay = ensure({ ...OVERLAY, root: sourceRoot });
    else {
      const root = path.resolve(options.out || options.resume || options.report);
      if (options.out) fs.mkdirSync(root, { recursive: true });
      ordinaryDirectory(root); unlock = acquireLock(root, 'v18-reference-screen', LOCK);
      if (options.out) {
        if (fs.readdirSync(root).some(file => file !== LOCK)) throw new Error('A new screen requires an empty directory. Use --resume to extend it.');
        initialJobs = options.jobs; initialOpenings = options.openings;
        const owner = { schemaVersion: 1, format: 'levelup-v18-screen-runtime-owner', study: options.study, directory: null, jobs: initialJobs, initialOpenings };
        atomicWrite(path.join(root, OWNER), JSON.stringify(owner) + '\n');
        overlay = ensure({ ...OVERLAY, root: sourceRoot, cacheDirectory: path.join(root, 'runtime') });
        atomicWrite(path.join(root, OWNER), JSON.stringify({ ...owner,
          directory: path.relative(root, overlay.directory).split(path.sep).join('/'), manifestSha256: overlay.manifestSha256 }) + '\n');
      } else {
        const owner = json(path.join(root, OWNER));
        if (owner.schemaVersion !== 1 || owner.study !== options.study || owner.format !== 'levelup-v18-screen-runtime-owner'
          || !Number.isInteger(owner.jobs) || owner.jobs < 1 || owner.jobs > 16 || !TARGETS.includes(owner.initialOpenings)) throw new Error('Invalid screen runtime ownership.');
        initialJobs = owner.jobs; initialOpenings = owner.initialOpenings;
        if (owner.directory === null && options.resume && !fs.existsSync(path.join(root, MANIFEST))) {
          if (fs.readdirSync(root).some(file => ![OWNER, LOCK, 'runtime'].includes(file) && !TEMP.test(file))) throw new Error('Incomplete screen setup contains foreign data.');
          overlay = ensure({ ...OVERLAY, root: sourceRoot, cacheDirectory: path.join(root, 'runtime') });
          atomicWrite(path.join(root, OWNER), JSON.stringify({ ...owner,
            directory: path.relative(root, overlay.directory).split(path.sep).join('/'), manifestSha256: overlay.manifestSha256 }) + '\n');
        } else {
          if (!/^runtime\/[a-z0-9-]+$/.test(owner.directory || '')) throw new Error('Invalid screen runtime path.');
          overlay = open({ directory: path.join(root, owner.directory), manifestSha256: owner.manifestSha256 });
        }
      }
    }
    return await (execute || require(overlay.entry).runStudy)(args, { enginePath, initialJobs, initialOpenings, overlaySha256: overlay.manifestSha256, log });
  } finally { unlock?.(); }
}
if (require.main === module) main().catch(error => { console.error(`Version 18 screen: ${error.message}`); process.exitCode = 1; });
module.exports = { ROOT, OWNER, MANIFEST, STATE, LOCK, OVERLAY, STUDIES, TARGETS, HELP, parseArgs, atomicWrite,
  main, runStudy, stageState, inspectAll, validateManifest, validateRoot, validateStageIdentities, reportSources, writeOwnedReport, writeReport };
