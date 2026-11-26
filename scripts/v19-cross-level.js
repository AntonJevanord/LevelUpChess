#!/usr/bin/env node
'use strict';

// New optional panels own their source snapshot and append complete eight-case
// batches. Existing campaigns and the project's active rules stay untouched.
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { ensureResearchOverlay, openResearchOverlay } = require('./balance/research-overlay');
const { acquireLock } = require('./balance/storage');
const { renameWithRetrySync, unlinkWithRetrySync } = require('./balance/files');
const { LEGACY_ENGINE_SHA256 } = require('./puzzles/native-parity');

const ROOT = path.resolve(__dirname, '..');
// Cross-level ownership stays separate from the same-tier panel controllers.
const OWNER = 'cross-runtime.json', MANIFEST = 'cross-panel.json', STATE = 'cross-state.json', LOCK = '.v19-cross-level.lock';
const OVERLAY = Object.freeze({ name: 'cross-level-panel-v19-002', entryFile: 'scripts/v19-cross-level.js', definitionFile: 'src/balance-designs-v19-cross-level-002.js' });
const HISTORICAL_OVERLAY = Object.freeze({ name: 'cross-level-panel-v19', entryFile: 'scripts/v19-cross-level.js', definitionFile: 'src/balance-designs-v19-cross-level.js' });
const STUDY = 'cross-level';
const TARGETS = Object.freeze([8, 16, 32, 64]);
const TEMP = /^\.v19-cross-[a-f0-9-]{36}\.tmp$/;
// A completed prefix is immutable within this owned run. Recompute it once
// after every process/resume validation, then keep its original output bytes
// while later groups refresh the current aggregate.
const completedCheckpointCache = new WeakMap();
const sha = value => createHash('sha256').update(value).digest('hex');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
function requireCompatibleEngine(hash) {
  if (hash === LEGACY_ENGINE_SHA256) throw new Error('The legacy largeboard executable is unsupported for this cross-level panel. Select stockfish/fairy-stockfish-levelup_x86-64.exe with --engine or FAIRY_STOCKFISH_PATH.');
}
const HELP = `Version 19 cross-level panel: L1+L2 versus L3

  npm.cmd run balance:v19:cross -- --out DIRECTORY [--openings 8] [--jobs 4]
  npm.cmd run balance:v19:cross -- --resume DIRECTORY [--openings 16]
  npm.cmd run balance:v19:cross -- --report DIRECTORY
  npm.cmd run balance:v19:cross -- --check [--openings 8] [--rules-only]

Selection 002: 10 L1, 11 L2 and 11 L3 board designs, including Hippogriff NZ.
106 feasible L1+L2 teams face every L3 design: 1,166 matchup cells.
Reserve grants, full RcN, the L2 Knight pawn, old L3 Herald, Wraith, the
original Wide-knight queen and Hopping bishop are excluded. The 44
queen+queen cells are unavailable because
an ordinary army has only one queen. No base pieces or starting material change.
Same-family teams use both starting homes, alternating assignments across
shared openings and reversing the assignment for each family in the next batch.

40,000 nodes, Skill 20, one thread, 32 MiB hash; four workers default.
Eight openings schedule 18,656 games, sixteen 37,312 games. Targets 8/16/32/64
are TOTAL openings. Completed color pairs/stages are retained on resume.
No earlier single-purchase tier games can substitute for these mixed armies.
Existing selection-001 folders resume/report through their original owned
runtime and retain their earlier roster, schedule and game counts.

An immutable owned source snapshot preserves the experiment on future updates.
Reports refresh after completed team groups and on pause; --report is offline.
Complete 8/16/32/64-opening checkpoints are retained separately.
--check validates selected army/color prefixes, movements and values without
playing games. --rules-only omits native checks. No scored games run during setup.
q/Ctrl+C stops now; g finishes active games; p finishes active color pairs.
--engine PATH or FAIRY_STOCKFISH_PATH selects the executable; Windows defaults
to the supported LevelUp engine. --log plies adds a progress line every ten plies.
`;

function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index], key = typeof flag === 'string' && flag.startsWith('--') ? flag.slice(2) : '';
    if (!['check', 'rules-only', 'out', 'resume', 'report', 'openings', 'jobs', 'engine', 'log'].includes(key)
      || Object.hasOwn(options, key)) throw new Error(`Unknown or repeated option: ${flag}. Use --help.`);
    if (['check', 'rules-only'].includes(key)) { options[key] = true; continue; }
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
    options[key] = value;
  }
  options.study = STUDY;
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
  const temporary = path.join(path.dirname(file), `.v19-cross-${randomUUID()}.tmp`);
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx'); fs.writeFileSync(fd, content); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    renameWithRetrySync(temporary, file);
  } finally { if (fd !== undefined) fs.closeSync(fd); unlinkWithRetrySync(temporary); }
}
function ordinaryDirectory(root) {
  const stat = fs.lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Use an ordinary panel directory, not a symbolic link.');
}
function requireCrossOverlay(overlay, { fresh = false } = {}) {
  const allowed = fresh ? [OVERLAY] : [OVERLAY, HISTORICAL_OVERLAY];
  if (!overlay || !allowed.some(expected => overlay.manifest?.name === expected.name
      && overlay.manifest?.entryFile === expected.entryFile && overlay.manifest?.definitionFile === expected.definitionFile)
    || overlay.entry !== path.join(overlay.directory, OVERLAY.entryFile)) throw new Error('This directory belongs to a different owned runtime; use the original experiment command.');
  return overlay;
}
function requireIncompleteSetup(root) {
  for (const file of fs.readdirSync(root)) {
    const absolute = path.join(root, file), stat = fs.lstatSync(absolute);
    if (![OWNER, LOCK, 'runtime'].includes(file) && !TEMP.test(file)
      || stat.isSymbolicLink() || (file !== 'runtime' && !stat.isFile())) throw new Error('Incomplete panel setup contains foreign data.');
  }
  const runtime = path.join(root, 'runtime');
  if (!fs.existsSync(runtime)) return;
  ordinaryDirectory(runtime);
  // Empty caches and complete, verified source snapshots contain no game
  // evidence. Refuse unknown or partially copied contents; never delete them.
  for (const name of fs.readdirSync(runtime)) {
    try { requireCrossOverlay(openResearchOverlay({ directory: path.join(runtime, name) }), { fresh: true }); }
    catch (error) { throw new Error(`Incomplete panel setup contains unverified runtime data: ${name}. Preserve this folder and use a fresh output directory.`, { cause: error }); }
  }
}
function prepareRuntime(root, sourceRoot, ensure) {
  try { return requireCrossOverlay(ensure({ ...OVERLAY, root: sourceRoot, cacheDirectory: path.join(root, 'runtime') }), { fresh: true }); }
  catch (error) {
    throw new Error(`Runtime snapshot setup failed before any games started: ${error.message} Retry the same study with --resume "${root}"; the original worker count and opening target are retained.`, { cause: error });
  }
}
function requireInactive(root) {
  if (!fs.existsSync(path.join(root, 'run.lock'))) return;
  const owner = json(path.join(root, 'run.lock'));
  if (!Number.isSafeInteger(owner.pid) || owner.pid < 1) throw new Error('Cannot establish stage lock ownership.');
  try { process.kill(owner.pid, 0); } catch (error) { if (error.code === 'ESRCH') return; throw error; }
  throw new Error(`Panel stage is active in process ${owner.pid}.`);
}
function stageState(root, stage, jobs, study, planTools = require('./balance/v19-cross-level-plan-002')) {
  if (!fs.existsSync(root)) return { mode: 'new' };
  ordinaryDirectory(root); requireInactive(root);
  const tools = require('./version17-balance'), declaration = planTools.getStageDeclaration(stage.id);
  // Completed preflight owns only its private abandoned atomic files.
  for (const file of fs.readdirSync(root)) if (/^\.v17-[a-f0-9-]{36}\.tmp$/.test(file) && fs.lstatSync(path.join(root, file)).isFile()) unlinkWithRetrySync(path.join(root, file));
  const entries = fs.readdirSync(root);
  if (!entries.length) return { mode: 'new' };
  if (!entries.includes('run.json')) {
    if (entries.length !== 1 || entries[0] !== 'v17-preflight.json') throw new Error('Foreign panel stage output without a run manifest.');
    tools.validatePreflight(json(path.join(root, entries[0])), declaration); return { mode: 'new' };
  }
  const input = tools.readReportInput(root, declaration);
  if (input.manifest.parallel?.jobs !== jobs) throw new Error('The stage worker count changed.');
  const report = require('./balance/v17-report').createV17Report({ ...declaration, ...input });
  // Full move histories remain authoritative on disk. Cache only detached
  // outcome observations after strict full-record validation; share repeated
  // per-stage context to keep a long cross-panel practical on an 8 GiB laptop.
  const comparisons = new Map(declaration.config.comparisons.map(row => [row.id, row]));
  const openings = new Map(input.manifest.schedule.map(row => [row.id, row.openingMoves]));
  const records = input.records.map(record => {
    const { moves, san, sans, startFen, finalFen, lastInfo, engineNames, ...compact } = record;
    const comparison = comparisons.get(record.comparisonId);
    return { ...compact, engine: declaration.config.engine, evaluation: declaration.config.evaluation,
      whiteStrength: record.aColor === 'w' ? comparison.strengthA : comparison.strengthB,
      blackStrength: record.aColor === 'b' ? comparison.strengthA : comparison.strengthB,
      openingMoves: openings.get(record.id), variant: input.manifest.designProfile.variant,
      profileHash: input.manifest.designProfile.hash, registryHash: input.manifest.designRegistry.hash };
  });
  return { mode: report.progress.finalizedGames === stage.games ? 'complete' : 'resume', ...input, records, report: { progress: report.progress } };
}
function inspectAll(root, manifest, planTools, selectedId) {
  return manifest.stages.filter(stage => !selectedId || stage.id === selectedId).map(stage => ({ ...stage,
    state: stageState(path.join(root, stage.directory), stage, manifest.jobs, manifest.study, planTools) }));
}
function validateStageIdentities(stages, manifest) {
  for (const stage of stages) if (stage.state.manifest) for (const field of ['engineSha256', 'runnerSha256', 'runnerSources', 'rulesBundleSha256']) {
    if (!isDeepStrictEqual(stage.state.manifest[field], manifest.identity[field])) throw new Error('A stage changed the panel runtime identity.');
  }
}
function validateManifest(manifest, planTools, overlaySha256, identity) {
  if (!manifest || !manifest.runId || !manifest.createdAt || !manifest.identity) throw new Error('Missing panel ownership or runtime identity.');
  const { planSha256, runId, createdAt, initialOpenings, overlaySha256: storedOverlay, identity: storedIdentity, ...declaration } = manifest;
  if (!TARGETS.includes(initialOpenings) || storedOverlay !== overlaySha256
    || planSha256 !== sha(JSON.stringify(declaration))
    || !isDeepStrictEqual(declaration, { ...planTools.buildCampaignPlan({ study: declaration.study, jobs: declaration.jobs }), study: declaration.study })
    || identity && !isDeepStrictEqual(identity, storedIdentity)) throw new Error('The frozen panel plan or runtime identity changed.');
  for (const field of ['engineSha256', 'rulesBundleSha256', 'runnerSha256']) if (!/^[a-f0-9]{64}$/.test(storedIdentity[field] || '')) throw new Error('Invalid panel runtime identity.');
  return manifest;
}
function validateRoot(root, manifest, planTools) {
  const allowed = new Set([OWNER, MANIFEST, STATE, LOCK, 'runtime', 'configs', 'reports', 'panel-report.json', 'panel-report.md', 'cross-matrix.md', 'cross-cells.csv', ...manifest.stages.map(stage => stage.directory)]);
  for (const file of fs.readdirSync(root)) if ((!allowed.has(file) && !TEMP.test(file)) || fs.lstatSync(path.join(root, file)).isSymbolicLink()) throw new Error(`Foreign or symbolic panel output: ${file}.`);
  const configs = path.join(root, 'configs');
  if (fs.existsSync(configs)) {
    ordinaryDirectory(configs);
    for (const file of fs.readdirSync(configs)) {
      if (TEMP.test(file) && fs.lstatSync(path.join(configs, file)).isFile()) continue;
      const stage = manifest.stages.find(stage => `${stage.directory}.json` === file);
      if (!stage || fs.lstatSync(path.join(configs, file)).isSymbolicLink()
        || !isDeepStrictEqual(json(path.join(configs, file)), planTools.getStageDeclaration(stage.id).config)) throw new Error('A panel config is foreign or changed.');
    }
  }
  const reports = path.join(root, 'reports');
  if (fs.existsSync(reports)) {
    ordinaryDirectory(reports);
    for (const directory of fs.readdirSync(reports)) {
      if (!TARGETS.some(target => directory === `openings-${target}`)) throw new Error('Foreign panel checkpoint output.');
      const checkpoint = path.join(reports, directory); ordinaryDirectory(checkpoint);
      for (const file of fs.readdirSync(checkpoint)) if ((!['panel-report.json', 'panel-report.md', 'cross-matrix.md', 'cross-cells.csv'].includes(file) && !TEMP.test(file))
        || fs.lstatSync(path.join(checkpoint, file)).isSymbolicLink()) throw new Error('Foreign or symbolic panel checkpoint output.');
    }
  }
}
function reportSources(stages) {
  return stages.filter(stage => stage.state.manifest).map(({ state, ...stage }) => ({ ...stage,
    manifest: state.manifest, records: state.records, source: state.source, declaration: state.declaration }));
}
function writeOwnedReport(directory, report, renderer) {
  ordinaryDirectory(directory);
  const file = path.join(directory, 'panel-report.json'), markdown = path.join(directory, 'panel-report.md');
  for (const existing of [file, markdown]) if (fs.existsSync(existing) && fs.lstatSync(existing).isSymbolicLink()) throw new Error('Refusing to replace a linked panel report.');
  if (fs.existsSync(file)) {
    const previous = json(file);
    if (previous.runId !== report.runId || previous.format !== report.format) throw new Error('Refusing to replace a foreign panel report.');
  } else if (fs.existsSync(markdown)) throw new Error('Refusing to replace unowned panel Markdown.');
  atomicWrite(file, JSON.stringify(report, null, 2) + '\n'); atomicWrite(markdown, renderer(report));
  if (report.format === 'levelup-v19-cross-level-report-001') {
    const rich = require('./balance/v19-cross-level-report');
    atomicWrite(path.join(directory, 'cross-matrix.md'), rich.renderCrossLevelMatrix(report));
    atomicWrite(path.join(directory, 'cross-cells.csv'), rich.renderCrossLevelCsv(report));
  }
  return { json: file, markdown };
}
function writeReport(root, manifest, targetOpenings, stages, planTools) {
  const sources = reportSources(stages);
  const create = planTools.reportStudy || ((manifest, stages) => require('./balance/v19-cross-level-report').createCrossLevelReport({ manifest, stages, planTools }));
  const render = planTools.renderReport || require('./balance/v19-cross-level-report').renderCrossLevelReport;
  const report = create({ ...manifest, targetOpenings }, sources);
  const files = writeOwnedReport(root, report, render);
  let saved = completedCheckpointCache.get(manifest);
  if (!saved) { saved = new Set(); completedCheckpointCache.set(manifest, saved); }
  // Save each complete declared target even when a larger target was requested
  // from the beginning. Each checkpoint contains only its own opening prefix.
  for (const target of TARGETS.filter(target => target <= targetOpenings)) {
    const selected = planTools.selectedStages(target, manifest);
    if (!selected.every(descriptor => stages.find(stage => stage.id === descriptor.id)?.state.mode === 'complete')) continue;
    if (saved.has(target)) continue;
    const directory = path.join(root, 'reports', `openings-${target}`);
    fs.mkdirSync(directory, { recursive: true }); ordinaryDirectory(directory);
    const ids = new Set(selected.map(stage => stage.id));
    const checkpoint = create({ ...manifest, targetOpenings: target }, sources.filter(stage => ids.has(stage.id)));
    writeOwnedReport(directory, checkpoint, render);
    saved.add(target);
  }
  return { report, files };
}

// Executes inside the verified source snapshot. Tests inject a tiny frozen plan
// and synthetic stages; normal operation always resolves the snapshot catalog.
async function runStudy(args, { enginePath, overlaySha256, initialJobs, initialOpenings, log = console.log, signals = process,
  planTools = require('./balance/v19-cross-level-plan-002'), check, run, persist,
  identity = require('./balance/run').getRunIdentity, inspect = inspectAll, report = writeReport, verifyOverlay = openResearchOverlay } = {}) {
  const options = parseArgs(args), tools = require('./version17-balance');
  check ||= planTools.checkExperiment || tools.checkExperiment; run ||= require('./parallel-balance').main; persist ||= tools.writePreflight;
  const controller = new AbortController(), abort = () => controller.abort();
  signals.on('SIGINT', abort); signals.on('SIGTERM', abort);
  try {
    if (options.check) {
      const plan = planTools.buildCampaignPlan({ study: options.study, jobs: 4 });
      for (const stage of planTools.selectedStages(options.openings, plan)) {
        if (controller.signal.aborted) throw new Error('Panel validation cancelled; no games started.');
        await check(planTools.getStageDeclaration(stage.id), {
          enginePath: options['rules-only'] ? undefined : enginePath, signal: controller.signal, onProgress: log });
      }
      if (controller.signal.aborted) throw new Error('Panel validation cancelled; no games started.');
      log('Version 19 cross-level panel preflight passed. No games started.'); return { checked: true };
    }
    const root = path.resolve(options.out || options.resume || options.report);
    const currentIdentity = options.report ? null : identity(enginePath);
    if (currentIdentity) requireCompatibleEngine(currentIdentity.engineSha256);
    let manifest;
    if (!fs.existsSync(path.join(root, MANIFEST)) && !options.report) {
      if (fs.readdirSync(root).some(file => ![OWNER, LOCK, 'runtime'].includes(file) && !TEMP.test(file))) throw new Error('Missing panel manifest beside existing data.');
      const declaration = { ...planTools.buildCampaignPlan({ study: options.study, jobs: options.out ? options.jobs : initialJobs }), study: options.study };
      manifest = { ...declaration, planSha256: sha(JSON.stringify(declaration)), runId: randomUUID(), createdAt: new Date().toISOString(),
        initialOpenings: options.out ? options.openings : initialOpenings, overlaySha256, identity: currentIdentity };
      if (!TARGETS.includes(manifest.initialOpenings)) throw new Error('Missing initial opening target after interrupted setup.');
      atomicWrite(path.join(root, MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
    } else manifest = validateManifest(json(path.join(root, MANIFEST)), planTools, overlaySha256, currentIdentity);
    if (manifest.study !== options.study) throw new Error('A different study cannot reuse this panel directory.');
    validateRoot(root, manifest, planTools);
    let state;
    try { state = json(path.join(root, STATE)); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      state = { runId: manifest.runId, targetOpenings: manifest.initialOpenings };
      if (!options.report) atomicWrite(path.join(root, STATE), JSON.stringify(state) + '\n');
    }
    if (state.runId !== manifest.runId || !TARGETS.includes(state.targetOpenings)) throw new Error('Invalid panel target state.');
    const target = options.openings ?? state.targetOpenings;
    if (target < state.targetOpenings) throw new Error('An opening target cannot shrink; completed evidence stays in this campaign.');
    let stages = inspect(root, manifest, planTools); validateStageIdentities(stages, manifest);
    let updated = report(root, manifest, target, stages, planTools);
    if (options.report) { log(`Panel report: ${updated.files.markdown}. No games started.`); return updated; }
    if (target !== state.targetOpenings) atomicWrite(path.join(root, STATE), JSON.stringify({ runId: manifest.runId, targetOpenings: target }) + '\n');
    log(`Version 19 ${options.study}: ${target} total openings; ${planTools.expectedGames(options.study, target)} games; ${manifest.jobs} workers total.`);
    const completed = [], selectedStages = planTools.selectedStages(target, manifest);
    const refresh = id => {
      const refreshed = inspect(root, manifest, planTools, id); validateStageIdentities(refreshed, manifest);
      const byId = new Map(refreshed.map(stage => [stage.id, stage]));
      stages = stages.map(stage => byId.get(stage.id) || stage);
    };
    for (let index = 0; index < selectedStages.length; index++) {
      const descriptor = selectedStages[index];
      if (controller.signal.aborted) return { stopped: true, completed, ...updated };
      const stage = stages.find(row => row.id === descriptor.id);
      if (stage.state.mode === 'complete') { completed.push(stage.id); log(`Verified complete; skipping ${stage.id}.`); continue; }
      verifyOverlay({ directory: ROOT, manifestSha256: overlaySha256 });
      if (!isDeepStrictEqual(identity(enginePath), manifest.identity)) throw new Error('The panel runtime or engine changed between stages.');
      const declaration = planTools.getStageDeclaration(stage.id), directory = path.join(root, stage.directory);
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
        try { refresh(stage.id); updated = report(root, manifest, target, stages, planTools); }
        catch (refreshError) { error.reportError = refreshError.message; }
        if (controller.signal.aborted) return { stopped: true, completed, ...updated };
        throw error;
      } finally {
        if (previous === undefined) delete process.env.FAIRY_STOCKFISH_PATH; else process.env.FAIRY_STOCKFISH_PATH = previous;
      }
      refresh(stage.id);
      const finished = stages.find(row => row.id === stage.id);
      if (result?.stopped || result?.stopRequested || controller.signal.aborted || finished.state.mode !== 'complete') {
        updated = report(root, manifest, target, stages, planTools);
        return { stopped: true, completed, ...updated };
      }
      completed.push(stage.id);
      const next = selectedStages[index + 1];
      if (!next || next.batchIndex !== stage.batchIndex || next.groupId !== stage.groupId) {
        updated = report(root, manifest, target, stages, planTools);
        const finalized = stages.reduce((sum, row) => sum + (row.state.report?.progress?.finalizedGames || 0), 0);
        log(`Cross-level progress: ${finalized}/${planTools.expectedGames(options.study, target)} games finalized; ${completed.length}/${selectedStages.length} stages verified for this target.`);
      }
    }
    log(`Version 19 cross-level panel finished. Report: ${updated.files.markdown}`); return { stopped: false, completed, ...updated };
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
  if (enginePath) requireCompatibleEngine(sha(fs.readFileSync(enginePath)));
  let overlay, unlock, initialJobs, initialOpenings;
  try {
    if (options.check) overlay = requireCrossOverlay(ensure({ ...OVERLAY, root: sourceRoot }), { fresh: true });
    else {
      const root = path.resolve(options.out || options.resume || options.report);
      if (options.out) fs.mkdirSync(root, { recursive: true });
      ordinaryDirectory(root); unlock = acquireLock(root, 'v19-cross-level-panel', LOCK);
      if (options.out) {
        if (fs.readdirSync(root).some(file => file !== LOCK)) throw new Error('A new panel requires an empty directory. Use --resume to extend it.');
        initialJobs = options.jobs; initialOpenings = options.openings;
        const owner = { schemaVersion: 1, format: 'levelup-v19-cross-level-runtime-owner', study: options.study,
          runtimeName: OVERLAY.name, directory: null, jobs: initialJobs, initialOpenings };
        atomicWrite(path.join(root, OWNER), JSON.stringify(owner) + '\n');
        overlay = prepareRuntime(root, sourceRoot, ensure);
        atomicWrite(path.join(root, OWNER), JSON.stringify({ ...owner,
          directory: path.relative(root, overlay.directory).split(path.sep).join('/'), manifestSha256: overlay.manifestSha256 }) + '\n');
      } else {
        const owner = json(path.join(root, OWNER));
        if (owner.schemaVersion !== 1 || owner.study !== options.study || owner.format !== 'levelup-v19-cross-level-runtime-owner'
          || !Number.isInteger(owner.jobs) || owner.jobs < 1 || owner.jobs > 16 || !TARGETS.includes(owner.initialOpenings)) throw new Error('Invalid panel runtime ownership.');
        initialJobs = owner.jobs; initialOpenings = owner.initialOpenings;
        if (owner.directory === null && options.resume && !fs.existsSync(path.join(root, MANIFEST))) {
          if (owner.runtimeName !== OVERLAY.name) throw new Error('This older incomplete cross-level setup has no frozen runtime or games. Preserve it and start selection 002 in a fresh output folder.');
          requireIncompleteSetup(root);
          overlay = prepareRuntime(root, sourceRoot, ensure);
          atomicWrite(path.join(root, OWNER), JSON.stringify({ ...owner,
            directory: path.relative(root, overlay.directory).split(path.sep).join('/'), manifestSha256: overlay.manifestSha256 }) + '\n');
        } else {
          if (!/^runtime\/[a-z0-9-]+$/.test(owner.directory || '')) throw new Error('Invalid panel runtime path.');
          overlay = requireCrossOverlay(open({ directory: path.join(root, owner.directory), manifestSha256: owner.manifestSha256 }));
          if (owner.runtimeName !== undefined && owner.runtimeName !== overlay.manifest.name) throw new Error('The cross-level runtime owner and snapshot family differ.');
        }
      }
    }
    return await (execute || require(overlay.entry).runStudy)(args, { enginePath, initialJobs, initialOpenings, overlaySha256: overlay.manifestSha256, log });
  } finally { unlock?.(); }
}
if (require.main === module) main().catch(error => { console.error(`Version 19 cross-level panel: ${error.message}`); process.exitCode = 1; });
module.exports = { ROOT, OWNER, MANIFEST, STATE, LOCK, OVERLAY, HISTORICAL_OVERLAY, STUDY, TARGETS, HELP, parseArgs, atomicWrite,
  requireCompatibleEngine,
  main, runStudy, stageState, inspectAll, validateManifest, validateRoot, validateStageIdentities, reportSources, writeOwnedReport, writeReport,
  requireIncompleteSetup, prepareRuntime, requireCrossOverlay };
