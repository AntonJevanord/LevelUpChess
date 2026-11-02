#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { ensureResearchOverlay, openResearchOverlay } = require('./balance/research-overlay');
const { acquireLock } = require('./balance/storage');
const { renameWithRetrySync, unlinkWithRetrySync } = require('./balance/files');

const ROOT = path.resolve(__dirname, '..');
const OWNER = 'followup-runtime.json', MANIFEST = 'followup.json', LOCK = '.followup.lock';
const OVERLAY = { name: 'targeted-followups-v17', entryFile: 'scripts/targeted-followups.js', definitionFile: 'src/balance-designs-v17-followups.js' };
const STUDIES = { 'knight-pawn': './balance/knight-pawn-followup-plan', nightrider: './balance/nightrider-confirm-plan', cataphract: './balance/cataphract-followup-plan' };
const getPlan = study => require(STUDIES[study]);
const TEMP = /^\.followup-[a-f0-9-]{36}\.tmp$/;
const sha = value => createHash('sha256').update(value).digest('hex');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const HELP = `Targeted reference follow-ups, each in its own isolated runtime

  npm.cmd run balance:level2:followup -- --out DIRECTORY [--jobs 4]
  npm.cmd run balance:nightrider:confirm -- --out DIRECTORY [--jobs 4]
  npm.cmd run balance:cataphract -- --out DIRECTORY [--jobs 4]

Each command accepts --check [--rules-only], --resume DIRECTORY or --report DIRECTORY.
Knight pawn: current control and two narrower tall-jump designs, three L1
partners, two c/e layouts, four frozen references, 16 cases at20k: 2304 games.
Nightrider: fresh N0/N0cF confirmation, four references, 16 cases at40k/80k:512.
Cataphract: RsCfC/RfhC, four references, 16 cases at40k/80k:512. Original RC
remains in the separate panel and is not a fresh control inside this study.
All use the same new cases33–48, both colors, fixed shared family priors.
Finish the active experiment, then run one command at a time with four workers.
q/Ctrl+C stops now; g finishes active games; p finishes active color pairs.
A stop, failure or unfinished stage pauses the entire queue.
Keep DIRECTORY/runtime with the results for resume. --engine PATH selects the
native executable; --log plies adds moves. Live project definitions are unchanged.
`;
function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  if (args.length === 3 && args[0] === '--study' && Object.hasOwn(STUDIES, args[1]) && ['--help', '-h'].includes(args[2])) return { help: true };
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index], key = typeof flag === 'string' && flag.startsWith('--') ? flag.slice(2) : '';
    if (!['study', 'check', 'rules-only', 'out', 'resume', 'report', 'jobs', 'engine', 'log'].includes(key) || Object.hasOwn(options, key)) throw new Error(`Unknown or repeated option: ${flag}.`);
    if (['check', 'rules-only'].includes(key)) { options[key] = true; continue; }
    const value = args[++index]; if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
    options[key] = value;
  }
  if (!Object.hasOwn(STUDIES, options.study || '')) throw new Error('Select --study knight-pawn, nightrider or cataphract.');
  const modes = ['check', 'out', 'resume', 'report'].filter(key => options[key]);
  if (modes.length !== 1) throw new Error('Choose one of --check, --out, --resume or --report.');
  if (options['rules-only'] && !options.check || options.jobs !== undefined && !options.out || options.report && (options.engine || options.log) || options.check && options.log) throw new Error('An option does not apply to this mode.');
  if (options.jobs !== undefined && !/^(?:[1-9]|1[0-6])$/.test(options.jobs)) throw new Error('--jobs must be 1 through 16.');
  if (options.out) options.jobs = Number(options.jobs || 4);
  if (options.log && !['games', 'plies'].includes(options.log)) throw new Error('--log must be games or plies.');
  return options;
}
function atomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.followup-${randomUUID()}.tmp`);
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx'); fs.writeFileSync(fd, content); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    renameWithRetrySync(temporary, file);
  } finally { if (fd !== undefined) fs.closeSync(fd); unlinkWithRetrySync(temporary); }
}
function requireDirectory(root) {
  const stat = fs.lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Use an ordinary study directory, not a symbolic link.');
}
function inactive(root) {
  if (!fs.existsSync(path.join(root, 'run.lock'))) return;
  const owner = json(path.join(root, 'run.lock'));
  if (!Number.isSafeInteger(owner.pid) || owner.pid < 1) throw new Error('Invalid stage lock owner.');
  try { process.kill(owner.pid, 0); } catch (error) { if (error.code === 'ESRCH') return; throw error; }
  throw new Error(`Stage is active in process ${owner.pid}.`);
}
function stageState(root, stage, jobs, study) {
  if (!fs.existsSync(root)) return { mode: 'new' };
  requireDirectory(root); inactive(root);
  const tools = require('./version17-balance'), declaration = getPlan(study).loadExperiment(stage.nodes);
  // A completed proof owns this stage. Remove only abandoned private atomic
  // proof files; the shared validator otherwise rejects them as foreign data.
  for (const file of fs.readdirSync(root)) if (/^\.v17-[a-f0-9-]{36}\.tmp$/.test(file) && fs.lstatSync(path.join(root, file)).isFile()) unlinkWithRetrySync(path.join(root, file));
  const entries = fs.readdirSync(root);
  if (!entries.length) return { mode: 'new' };
  if (!entries.includes('run.json')) {
    if (entries.length !== 1 || entries[0] !== 'v17-preflight.json') throw new Error('Foreign targeted-stage output.');
    tools.validatePreflight(json(path.join(root, 'v17-preflight.json')), declaration); return { mode: 'new' };
  }
  const input = tools.readReportInput(root, declaration);
  if (input.manifest.parallel?.jobs !== jobs) throw new Error('The stage worker count changed.');
  const report = require('./balance/v17-report').createV17Report({ ...declaration, ...input });
  return { mode: report.progress.finalizedGames === stage.games ? 'complete' : 'resume', ...input, report };
}
function inspectAll(root, manifest) {
  return manifest.stages.map(stage => ({ ...stage, state: stageState(path.join(root, stage.directory), stage, manifest.jobs, manifest.study) }));
}
function validateStageIdentities(stages, manifest) {
  for (const stage of stages) if (stage.state.manifest) for (const field of ['engineSha256', 'runnerSha256', 'runnerSources', 'rulesBundleSha256']) {
    if (!isDeepStrictEqual(stage.state.manifest[field], manifest.identity[field])) throw new Error('A stage changed the targeted runtime.');
  }
}
function writeReport(root, manifest, stages) {
  const plan = getPlan(manifest.study);
  const report = plan.reportStudy(manifest, stages.filter(stage => stage.state.manifest).map(stage => ({ nodes: stage.nodes, ...stage.state })));
  const file = path.join(root, 'followup-report.json');
  if (fs.existsSync(file)) {
    const prior = json(file); if (prior.runId !== manifest.runId || prior.format !== report.format) throw new Error('Refusing to replace a foreign targeted report.');
  } else if (fs.existsSync(path.join(root, 'followup-report.md'))) throw new Error('Refusing to replace unowned targeted Markdown.');
  atomic(file, JSON.stringify(report, null, 2) + '\n'); atomic(path.join(root, 'followup-report.md'), plan.renderReport(report));
  return { report, files: { json: file, markdown: path.join(root, 'followup-report.md') } };
}

// Called through the verified snapshot's module path. Each worker then loads
// the same snapshot's catalog and runner through ordinary Node module paths.
async function runStudy(args, { enginePath, overlaySha256, log = console.log, signals = process,
  initialJobs, check, run, persist, inspect = inspectAll, report = writeReport } = {}) {
  const options = parseArgs(args), plan = getPlan(options.study);
  const tools = require('./version17-balance');
  check ||= tools.checkExperiment; run ||= require('./parallel-balance').main; persist ||= tools.writePreflight;
  const controller = new AbortController(), abort = () => controller.abort();
  signals.on('SIGINT', abort); signals.on('SIGTERM', abort);
  try {
    if (options.check) {
      for (const nodes of plan.NODES) await check(plan.loadExperiment(nodes), { enginePath: options['rules-only'] ? undefined : enginePath, signal: controller.signal, onProgress: log });
      log('Targeted follow-up preflight passed. No games started.'); return { checked: true };
    }
    const root = path.resolve(options.out || options.resume || options.report);
    const identity = options.report ? null : require('./balance/run').getRunIdentity(enginePath);
    let manifest;
    if (!fs.existsSync(path.join(root, MANIFEST)) && !options.report) {
      if (fs.readdirSync(root).some(file => ![OWNER, LOCK, 'runtime'].includes(file) && !TEMP.test(file))) throw new Error('Missing targeted manifest beside existing study data.');
      const declaration = { study: options.study, ...plan.buildPlan(options.out ? options.jobs : initialJobs) };
      manifest = { ...declaration, planSha256: sha(JSON.stringify(declaration)), runId: randomUUID(), createdAt: new Date().toISOString(), overlaySha256, identity };
      atomic(path.join(root, MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
    } else {
      manifest = json(path.join(root, MANIFEST));
      const { planSha256, runId, createdAt, identity: storedIdentity, overlaySha256: storedOverlay, ...declaration } = manifest;
      if (!runId || !createdAt || storedOverlay !== overlaySha256 || planSha256 !== sha(JSON.stringify(declaration))
        || !isDeepStrictEqual(declaration, { study: options.study, ...plan.buildPlan(declaration.jobs) }) || identity && !isDeepStrictEqual(identity, storedIdentity)) throw new Error('The frozen targeted-study identity changed.');
    }
    const allowed = new Set([OWNER, MANIFEST, LOCK, 'runtime', 'configs', 'followup-report.md', 'followup-report.json', ...manifest.stages.map(stage => stage.directory)]);
    for (const file of fs.readdirSync(root)) if ((!allowed.has(file) && !TEMP.test(file)) || fs.lstatSync(path.join(root, file)).isSymbolicLink()) throw new Error('Foreign or symbolic targeted-study output.');
    const configs = path.join(root, 'configs');
    if (fs.existsSync(configs)) {
      requireDirectory(configs);
      for (const file of fs.readdirSync(configs)) {
        if (TEMP.test(file) && fs.lstatSync(path.join(configs, file)).isFile()) continue;
        const stage = manifest.stages.find(stage => `${stage.directory}.json` === file);
        if (!stage || fs.lstatSync(path.join(configs, file)).isSymbolicLink()
          || !isDeepStrictEqual(json(path.join(configs, file)), plan.loadExperiment(stage.nodes).config)) throw new Error('A targeted config is foreign or changed.');
      }
    }
    let stages = inspect(root, manifest);
    validateStageIdentities(stages, manifest);
    let updated = report(root, manifest, stages);
    if (options.report) { log(`Targeted report: ${updated.files.markdown}. No games started.`); return updated; }
    for (const stage of stages) {
      if (controller.signal.aborted) return { stopped: true, ...updated };
      if (stage.state.mode === 'complete') { log(`Verified complete; skipping ${stage.directory}.`); continue; }
      openResearchOverlay({ directory: ROOT, manifestSha256: overlaySha256 });
      if (!isDeepStrictEqual(require('./balance/run').getRunIdentity(enginePath), manifest.identity)) throw new Error('The targeted runtime or engine changed between stages.');
      const declaration = plan.loadExperiment(stage.nodes), directory = path.join(root, stage.directory);
      const proof = await check(declaration, { enginePath, signal: controller.signal, onProgress: log });
      if (controller.signal.aborted) return { stopped: true, ...updated };
      persist(directory, declaration, proof, { resume: stage.state.mode === 'resume' });
      const configFile = path.join(root, 'configs', `${stage.directory}.json`);
      if (fs.existsSync(configFile)) {
        if (!isDeepStrictEqual(json(configFile), declaration.config)) throw new Error('The targeted stage config changed.');
      } else atomic(configFile, JSON.stringify(declaration.config, null, 2) + '\n');
      const runArgs = stage.state.mode === 'resume' ? ['--resume', directory] : ['--config', configFile, '--out', directory, '--jobs', String(manifest.jobs)];
      runArgs.push('--log', options.log || 'games');
      const previous = process.env.FAIRY_STOCKFISH_PATH;
      let result;
      try {
        process.env.FAIRY_STOCKFISH_PATH = enginePath;
        result = await run(runArgs, { comparisonNames: Object.fromEntries(declaration.metadata.comparisons.map(cell => [cell.id, { a: cell.aLabel, b: cell.bLabel }])) });
      } finally {
        if (previous === undefined) delete process.env.FAIRY_STOCKFISH_PATH; else process.env.FAIRY_STOCKFISH_PATH = previous;
        const current = inspect(root, manifest); validateStageIdentities(current, manifest);
        updated = report(root, manifest, current);
      }
      const finished = inspect(root, manifest).find(row => row.directory === stage.directory);
      if (result?.stopped || result?.stopRequested || controller.signal.aborted || finished.state.mode !== 'complete') return { stopped: true, ...updated };
    }
    log(`Targeted study finished. Report: ${updated.files.markdown}`); return { stopped: false, ...updated };
  } finally { signals.removeListener('SIGINT', abort); signals.removeListener('SIGTERM', abort); }
}

async function main(args = process.argv.slice(2), { sourceRoot = ROOT, ensure = ensureResearchOverlay,
  open = openResearchOverlay, execute, log = console.log } = {}) {
  const options = parseArgs(args);
  if (options.help) { log(HELP); return; }
  const enginePath = options.report || options['rules-only'] ? undefined : options.engine ? path.resolve(options.engine) : process.env.FAIRY_STOCKFISH_PATH ? path.resolve(process.env.FAIRY_STOCKFISH_PATH)
    : process.platform === 'win32' ? path.join(sourceRoot, 'stockfish/fairy-stockfish-levelup_x86-64.exe') : undefined;
  if (!options.report && !options['rules-only'] && !enginePath) throw new Error('Set FAIRY_STOCKFISH_PATH or --engine to a compatible native executable on Linux/macOS.');
  let overlay, unlock, initialJobs;
  try {
    if (options.check) overlay = ensure({ ...OVERLAY, root: sourceRoot });
    else {
      const root = path.resolve(options.out || options.resume || options.report);
      if (options.out) fs.mkdirSync(root, { recursive: true });
      requireDirectory(root); unlock = acquireLock(root, 'targeted-followup', LOCK);
      if (options.out) {
        if (fs.readdirSync(root).some(file => file !== LOCK)) throw new Error('A new targeted study requires an empty directory.');
        // Commit the initial worker count before a snapshot is built, so a
        // power cut during setup can resume without guessing that setting.
        initialJobs = options.jobs;
        atomic(path.join(root, OWNER), JSON.stringify({ schemaVersion: 1, format: 'levelup-targeted-followup-runtime-owner', study: options.study, directory: null, jobs: initialJobs }) + '\n');
        overlay = ensure({ ...OVERLAY, root: sourceRoot, cacheDirectory: path.join(root, 'runtime') });
        atomic(path.join(root, OWNER), JSON.stringify({ schemaVersion: 1, format: 'levelup-targeted-followup-runtime-owner',
          study: options.study, directory: path.relative(root, overlay.directory).split(path.sep).join('/'), jobs: initialJobs, manifestSha256: overlay.manifestSha256 }) + '\n');
      } else {
        const owner = json(path.join(root, OWNER));
        if (owner.schemaVersion !== 1 || owner.study !== options.study || owner.format !== 'levelup-targeted-followup-runtime-owner' || !Number.isInteger(owner.jobs) || owner.jobs < 1 || owner.jobs > 16) throw new Error('Invalid targeted runtime ownership.');
        initialJobs = owner.jobs;
        if (owner.directory === null && options.resume && !fs.existsSync(path.join(root, MANIFEST))) {
          if (fs.readdirSync(root).some(file => ![OWNER, LOCK, 'runtime'].includes(file) && !TEMP.test(file))) throw new Error('Incomplete targeted setup contains foreign data.');
          overlay = ensure({ ...OVERLAY, root: sourceRoot, cacheDirectory: path.join(root, 'runtime') });
          atomic(path.join(root, OWNER), JSON.stringify({ ...owner, directory: path.relative(root, overlay.directory).split(path.sep).join('/'), manifestSha256: overlay.manifestSha256 }) + '\n');
        } else {
          if (!/^runtime\/[a-z0-9-]+$/.test(owner.directory || '')) throw new Error('Invalid targeted runtime path.');
          overlay = open({ directory: path.join(root, owner.directory), manifestSha256: owner.manifestSha256 });
        }
      }
    }
    const run = execute || require(overlay.entry).runStudy;
    return await run(args, { enginePath, initialJobs, overlaySha256: overlay.manifestSha256, log });
  } finally { unlock?.(); }
}
if (require.main === module) main().catch(error => { console.error(`Targeted follow-up: ${error.message}`); process.exitCode = 1; });
module.exports = { ROOT, OWNER, MANIFEST, LOCK, OVERLAY, STUDIES, HELP, parseArgs, main, runStudy, stageState, inspectAll, writeReport };
