#!/usr/bin/env node
'use strict';

// Enable immutable eight-opening stages without extending any existing run.
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const planTools = require('./balance/level3-panel-plan');
const stageTools = require('./version17-balance');
const { main: parallelMain } = require('./parallel-balance');
const { getRunIdentity } = require('./balance/run');
const { createV17Report } = require('./balance/v17-report');
const { createDesignRegistry } = require('./balance/design-registry');
const { compileDesignProfile } = require('./balance/design-profile');
const { acquireLock } = require('./balance/storage');
const { renameWithRetrySync, unlinkWithRetrySync } = require('./balance/files');
const { syncJournal } = require('./balance/level3-panel-journal');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST = 'panel.json', STATE = 'panel-state.json', LOCK = '.panel.lock';
const OWNED_TEMP = /^\.level3-panel-[a-z0-9.-]+\.[a-f0-9-]{36}\.tmp$/;
const sha = value => createHash('sha256').update(value).digest('hex');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const HELP = `Complete level-three panel: ten pieces, three separate search budgets

  npm.cmd run balance:level3:panel -- --check [--openings 8] [--rules-only]
  npm.cmd run balance:level3:panel -- --out DIRECTORY --openings 8 [--jobs 4]
  npm.cmd run balance:level3:panel -- --resume DIRECTORY --openings 16
  npm.cmd run balance:level3:panel -- --resume DIRECTORY --openings 32
  npm.cmd run balance:level3:panel -- --resume DIRECTORY --openings 64
  npm.cmd run balance:level3:panel -- --report DIRECTORY
  npm.cmd run balance:level3:panel -- --material DIRECTORY [--bootstrap 100]

Targets are TOTAL openings, not additional openings. A resume without --openings
keeps the last target. Finished stages are verified and skipped; earlier games
are never replayed. 45 head-to-head cells plus ten ordinary-army anchors run at
20k/40k/80k nodes. Totals: 2640 / 5280 / 10560 / 21120 games.
Original stage journals remain authoritative. Root games.jsonl appends records
with stage provenance at stage boundaries; reports keep node budgets separate.
Outcome reports update after each 880-game stage. Material fitting runs after
the requested target finishes, or separately with --material (no new games).
q/Ctrl+C stops now; g finishes active games; p finishes active color pairs.
A stop or incomplete stage pauses the entire queue. Jobs and engine identities
are frozen. --engine PATH selects a native executable; otherwise the usual
FAIRY_STOCKFISH_PATH/bundled Windows executable applies. No grants are included.
`;

function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  const options = {}, flags = new Set(['check', 'rules-only']);
  for (let index = 0; index < args.length; index++) {
    const flag = args[index], key = typeof flag === 'string' && flag.startsWith('--') ? flag.slice(2) : '';
    if (!['check', 'rules-only', 'out', 'resume', 'report', 'material', 'openings', 'jobs', 'engine', 'log', 'bootstrap'].includes(key) || Object.hasOwn(options, key)) throw new Error(`Unknown or repeated option: ${flag}. Use --help.`);
    if (flags.has(key)) { options[key] = true; continue; }
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
    options[key] = value;
  }
  const modes = ['check', 'out', 'resume', 'report', 'material'].filter(key => Object.hasOwn(options, key));
  if (modes.length !== 1) throw new Error('Select exactly one of --check, --out, --resume, --report or --material.');
  const mode = modes[0];
  if (options['rules-only'] && !options.check || options.jobs !== undefined && mode !== 'out'
    || options.engine && !['check', 'out', 'resume'].includes(mode)
    || options.openings !== undefined && !['check', 'out', 'resume'].includes(mode)
    || options.log && !['out', 'resume'].includes(mode)
    || options.bootstrap !== undefined && mode !== 'material') throw new Error('An option does not apply to the selected mode.');
  if (options.openings !== undefined) {
    if (!['8', '16', '32', '64'].includes(options.openings)) throw new Error('--openings must be a total of 8, 16, 32 or 64.');
    options.openings = Number(options.openings);
  }
  if (options.jobs !== undefined && !/^(?:[1-9]|1[0-6])$/.test(options.jobs)) throw new Error('--jobs must be 1 through 16.');
  if (mode === 'out') options.jobs = Number(options.jobs ?? 4);
  if (['check', 'out'].includes(mode)) options.openings ??= 8;
  if (options.log !== undefined && !['games', 'plies'].includes(options.log)) throw new Error('--log must be games or plies.');
  if (options.bootstrap !== undefined) {
    if (!/^(?:0|[1-9]\d*)$/.test(options.bootstrap) || Number(options.bootstrap) > 2000) throw new Error('--bootstrap must be 0 through 2000.');
    options.bootstrap = Number(options.bootstrap);
  }
  return options;
}

function controllerSources() {
  return ['scripts/level3-panel.js', 'scripts/balance/level3-panel-plan.js', 'scripts/balance/level3-panel-journal.js',
    'scripts/balance/level3-panel-report.js', 'scripts/balance/level3-panel-material.js', 'scripts/version17-balance.js',
    'scripts/parallel-balance.js', 'scripts/balance/parallel.js', 'scripts/balance/parallel-worker.js',
    'scripts/balance/validate-designs.js', 'scripts/balance/material-dataset.js', 'scripts/balance/reference-analysis.js',
    'scripts/balance/reference-regression.js'].map(file => ({ file, sha256: sha(fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n')) }));
}
function runtimeIdentity(enginePath) { return { ...getRunIdentity(enginePath), controllerSources: controllerSources() }; }
function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.level3-panel-${path.basename(file)}.${randomUUID()}.tmp`);
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx'); fs.writeFileSync(fd, content); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    renameWithRetrySync(temporary, file);
  } finally { if (fd !== undefined) fs.closeSync(fd); unlinkWithRetrySync(temporary); }
}
function validateManifest(manifest, build = planTools.buildCampaignPlan) {
  if (!manifest || !manifest.runId || !manifest.createdAt || !manifest.runtimeIdentity) throw new Error('Missing panel ownership or runtime identity.');
  const { runId, createdAt, initialOpenings, runtimeIdentity: identity, planSha256, ...plan } = manifest;
  if (!planTools.OPENING_TARGETS.includes(initialOpenings)) throw new Error('Invalid initial panel opening target.');
  if (!isDeepStrictEqual(plan, build({ jobs: plan.jobs })) || planSha256 !== sha(JSON.stringify(plan))) throw new Error('The frozen panel plan changed. Preserve this campaign and use its original checkout.');
  for (const field of ['engineSha256', 'rulesBundleSha256', 'runnerSha256']) if (!/^[a-f0-9]{64}$/.test(identity[field] || '')) throw new Error('Invalid panel runtime identity.');
  return manifest;
}
function ordinaryDirectory(directory) {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Panel outputs must be ordinary directories, not symbolic links.');
}
function validateRoot(root, manifest) {
  const allowed = new Set([MANIFEST, STATE, LOCK, 'games.jsonl', 'configs', 'reports', 'panel-report.json', 'panel-report.md', 'material-report.json', 'material-report.md', ...manifest.stages.map(stage => stage.directory)]);
  for (const entry of fs.readdirSync(root)) {
    if ((!allowed.has(entry) && !OWNED_TEMP.test(entry)) || fs.lstatSync(path.join(root, entry)).isSymbolicLink()) throw new Error(`Foreign or symbolic panel output: ${entry}.`);
  }
  const configs = path.join(root, 'configs');
  if (fs.existsSync(configs)) {
    ordinaryDirectory(configs);
    for (const file of fs.readdirSync(configs)) {
      if (OWNED_TEMP.test(file) && fs.lstatSync(path.join(configs, file)).isFile()) continue;
      const stage = manifest.stages.find(stage => `${stage.id}.json` === file);
      if (!stage || fs.lstatSync(path.join(configs, file)).isSymbolicLink()
        || !isDeepStrictEqual(json(path.join(configs, file)), planTools.getBatchDeclaration(stage.batchIndex, stage.nodes).config)) throw new Error('A panel stage config changed or belongs to another tool.');
    }
  }
}
function requireInactive(root) {
  if (!fs.existsSync(path.join(root, 'run.lock'))) return;
  const owner = json(path.join(root, 'run.lock'));
  if (!Number.isSafeInteger(owner.pid) || owner.pid < 1) throw new Error('Cannot establish stage lock ownership.');
  try { process.kill(owner.pid, 0); } catch (error) { if (error.code === 'ESRCH') return; throw error; }
  throw new Error(`Panel stage is still active in process ${owner.pid}.`);
}
function inspectStage(root, stage, jobs) {
  if (!fs.existsSync(root)) return { mode: 'new' };
  ordinaryDirectory(root); requireInactive(root);
  const entries = fs.readdirSync(root), declaration = planTools.getBatchDeclaration(stage.batchIndex, stage.nodes);
  if (!entries.length) return { mode: 'new' };
  if (!entries.includes('run.json')) {
    if (entries.length !== 1 || entries[0] !== 'v17-preflight.json') throw new Error('Foreign panel stage output without a run manifest.');
    stageTools.validatePreflight(json(path.join(root, entries[0])), declaration);
    return { mode: 'new' };
  }
  const input = stageTools.readReportInput(root, declaration);
  if (input.manifest.parallel?.jobs !== jobs) throw new Error('The stage worker count changed.');
  const report = createV17Report({ ...declaration, ...input });
  return { mode: report.progress.finalizedGames === stage.games ? 'complete' : 'resume', report, input, declaration };
}
function collectStages(root, manifest, inspect = inspectStage) {
  return manifest.stages.map(stage => ({ ...stage, state: inspect(path.join(root, stage.directory), stage, manifest.jobs) }));
}
function materialStages(stages) {
  return stages.filter(stage => stage.state.input).map(stage => {
    const { input, declaration } = stage.state, registry = createDesignRegistry(declaration.config);
    return { key: stage.id, nodes: stage.nodes, batch: stage.batchIndex, configSha256: stage.configSha256,
      config: declaration.config, metadata: declaration.metadata, comparisons: declaration.metadata.comparisons,
      profile: compileDesignProfile(registry, declaration.config.evaluation), manifest: input.manifest, records: input.records };
  });
}
function writeOwned(root, name, report, renderer) {
  const file = path.join(root, `${name}.json`);
  if (fs.existsSync(file)) {
    const previous = json(file);
    if (previous.runId !== report.runId || previous.format !== report.format) throw new Error('Refusing to replace an unowned panel report.');
  } else if (fs.existsSync(path.join(root, `${name}.md`))) throw new Error('Refusing to replace an unowned Markdown report.');
  atomicWrite(file, JSON.stringify(report, null, 2) + '\n');
  atomicWrite(path.join(root, `${name}.md`), renderer(report));
  return { json: file, markdown: path.join(root, `${name}.md`) };
}
function refresh(root, manifest, targetOpenings, stages) {
  const { createPanelReport, renderPanelReport } = require('./balance/level3-panel-report');
  const sources = materialStages(stages);
  syncJournal(root, sources.map(stage => ({ ...stage, configSha256: manifest.stages.find(row => row.id === stage.key).configSha256 })));
  const report = createPanelReport({ manifest: { ...manifest, targetOpenings }, stages: sources, roster: manifest.roster });
  const files = writeOwned(root, 'panel-report', report, renderPanelReport);
  return { stages: sources, report, files };
}
async function fitMaterial(root, manifest, sources, { bootstrap = 100, signal, log = console.log } = {}) {
  const { analyzeMaterial, renderMaterial } = require('./balance/level3-panel-material');
  const report = { ...await analyzeMaterial({ stages: sources, roster: manifest.roster, bootstrap, signal,
    onProgress: message => log(typeof message === 'string' ? message : `Material analysis: ${JSON.stringify(message)}`) }), runId: manifest.runId };
  return { report, files: writeOwned(root, 'material-report', report, renderMaterial) };
}
async function launchStage(root, stage, manifest, enginePath, { signal, log = console.log } = {}) {
  const declaration = planTools.getBatchDeclaration(stage.batchIndex, stage.nodes), directory = path.join(root, stage.directory);
  const proof = await stageTools.checkExperiment(declaration, { enginePath, signal, onProgress: log });
  if (signal?.aborted) throw Object.assign(new Error('Panel preflight cancelled; no stage games started.'), { code: 'ABORT_ERR' });
  stageTools.writePreflight(directory, declaration, proof, { resume: stage.state.mode === 'resume' });
  const file = path.join(root, 'configs', `${stage.id}.json`);
  if (!fs.existsSync(file)) atomicWrite(file, JSON.stringify(declaration.config, null, 2) + '\n');
  const args = stage.state.mode === 'resume' ? ['--resume', directory]
    : ['--config', file, '--out', directory, '--jobs', String(manifest.jobs)];
  args.push('--log', stage.log || 'games');
  const previous = process.env.FAIRY_STOCKFISH_PATH;
  try {
    process.env.FAIRY_STOCKFISH_PATH = enginePath;
    return await parallelMain(args, { comparisonNames: Object.fromEntries(declaration.metadata.comparisons.map(cell => [cell.id, { a: cell.aLabel, b: cell.bLabel }])) });
  } finally {
    if (previous === undefined) delete process.env.FAIRY_STOCKFISH_PATH;
    else process.env.FAIRY_STOCKFISH_PATH = previous;
  }
}

async function main(args = process.argv.slice(2), dependencies = {}) {
  const { build = planTools.buildCampaignPlan, inspect = inspectStage, launch = launchStage, update = refresh, fit = fitMaterial,
    identity = runtimeIdentity, check = stageTools.checkExperiment, signals = process, log = console.log, enginePath: suppliedEngine } = dependencies;
  const options = parseArgs(args);
  if (options.help) { log(HELP); return; }
  const controller = new AbortController(), abort = () => controller.abort();
  signals.on('SIGINT', abort); signals.on('SIGTERM', abort);
  let unlock;
  try {
    if (options.check) {
      const enginePath = options['rules-only'] ? undefined : options.engine ? path.resolve(options.engine) : suppliedEngine || stageTools.resolveEngine();
      const plan = build({ jobs: 4 });
      for (const stage of planTools.selectedStages(options.openings, plan)) {
        if (controller.signal.aborted) throw new Error('Panel validation cancelled; no games started.');
        await check(planTools.getBatchDeclaration(stage.batchIndex, stage.nodes), { enginePath, signal: controller.signal, onProgress: log });
      }
      log('Panel preflight passed. No games started.'); return { checked: true };
    }
    const root = path.resolve(options.out || options.resume || options.report || options.material);
    if (options.out) fs.mkdirSync(root, { recursive: true });
    ordinaryDirectory(root);
    unlock = acquireLock(root, 'level3-progressive-panel', LOCK);
    let manifest, enginePath;
    if (options.out) {
      if (fs.readdirSync(root).some(file => file !== LOCK)) throw new Error('A new panel needs an empty directory. Use --resume to extend it.');
      enginePath = options.engine ? path.resolve(options.engine) : suppliedEngine || stageTools.resolveEngine();
      const plan = build({ jobs: options.jobs });
      manifest = { ...plan, planSha256: sha(JSON.stringify(plan)), runId: randomUUID(), createdAt: new Date().toISOString(), initialOpenings: options.openings, runtimeIdentity: identity(enginePath) };
      atomicWrite(path.join(root, MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
      atomicWrite(path.join(root, STATE), JSON.stringify({ runId: manifest.runId, targetOpenings: options.openings }) + '\n');
    } else manifest = validateManifest(json(path.join(root, MANIFEST)), build);
    validateRoot(root, manifest);
    let state;
    try { state = json(path.join(root, STATE)); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      // The immutable manifest is committed first. A power cut before the
      // initial state rename can recover its exact original target.
      state = { runId: manifest.runId, targetOpenings: manifest.initialOpenings };
      if (options.resume) atomicWrite(path.join(root, STATE), JSON.stringify(state) + '\n');
    }
    if (state.runId !== manifest.runId || !planTools.OPENING_TARGETS.includes(state.targetOpenings)) throw new Error('The panel target state has changed or is invalid.');
    const target = options.openings ?? state.targetOpenings;
    if (target < state.targetOpenings) throw new Error('An opening target cannot shrink; completed evidence remains part of this campaign.');
    if (options.resume) {
      enginePath = options.engine ? path.resolve(options.engine) : suppliedEngine || stageTools.resolveEngine();
      if (!isDeepStrictEqual(identity(enginePath), manifest.runtimeIdentity)) throw new Error('The engine, rules, runner or controller changed. Resume on the original checkout.');
    }
    let stages = collectStages(root, manifest, inspect);
    // Existing completed stages must belong to the campaign runtime too.
    for (const stage of stages) if (stage.state.input) for (const field of ['engineSha256', 'rulesBundleSha256', 'runnerSha256', 'runnerSources']) {
      if (!isDeepStrictEqual(stage.state.input.manifest[field], manifest.runtimeIdentity[field])) throw new Error('A stage changed the campaign runtime identity.');
    }
    let updated = update(root, manifest, target, stages);
    if (options.report) { log(`Matchup report: ${updated.files.markdown}. No games started.`); return updated; }
    if (options.material) {
      const material = await fit(root, manifest, updated.stages, { bootstrap: options.bootstrap, signal: controller.signal, log });
      log(`Material estimates: ${material.files.markdown}. No games started.`); return { ...updated, material };
    }
    if (target !== state.targetOpenings) atomicWrite(path.join(root, STATE), JSON.stringify({ runId: manifest.runId, targetOpenings: target }) + '\n');
    const selected = planTools.selectedStages(target, manifest), completed = [];
    log(`Level-three panel: ${target} total openings; ${planTools.expectedGames(target)} games; ${manifest.jobs} workers total.`);
    for (const descriptor of selected) {
      if (controller.signal.aborted) return { stopped: true, completed, ...updated };
      const stage = stages.find(stage => stage.id === descriptor.id);
      if (stage.state.mode === 'complete') { completed.push(stage.id); log(`Verified complete; skipping ${stage.id}.`); continue; }
      log(`Starting ${stage.id}: ${stage.games} games, ${stage.nodes} nodes/move.`);
      let result;
      try { result = await launch(root, { ...stage, log: options.log }, manifest, enginePath, { signal: controller.signal, log }); }
      catch (error) {
        try { updated = update(root, manifest, target, collectStages(root, manifest, inspect)); }
        catch (refreshError) { error.reportError = refreshError.message; }
        if (controller.signal.aborted) return { stopped: true, completed, ...updated };
        throw error;
      }
      stages = collectStages(root, manifest, inspect); updated = update(root, manifest, target, stages);
      const after = stages.find(row => row.id === stage.id);
      if (result?.stopped || result?.stopRequested || controller.signal.aborted || after.state.mode !== 'complete') {
        log(`Panel paused. Resume with --resume ${root} --openings ${target}`);
        return { stopped: true, completed, ...updated };
      }
      completed.push(stage.id);
    }
    // Engines have exited before offline replay/fitting starts.
    const material = await fit(root, manifest, updated.stages, { signal: controller.signal, log });
    const snapshotRoot = path.join(root, 'reports', `openings-${String(target).padStart(2, '0')}`);
    const { renderPanelReport } = require('./balance/level3-panel-report');
    const { renderMaterial } = require('./balance/level3-panel-material');
    writeOwned(snapshotRoot, 'panel-report', updated.report, renderPanelReport);
    writeOwned(snapshotRoot, 'material-report', material.report, renderMaterial);
    log(`Target complete. Matchups: ${updated.files.markdown}\nMaterial estimates: ${material.files.markdown}`);
    return { stopped: false, completed, ...updated, material };
  } finally { unlock?.(); signals.removeListener('SIGINT', abort); signals.removeListener('SIGTERM', abort); }
}

if (require.main === module) main().catch(error => { console.error(`Level-three panel: ${error.message}`); process.exitCode = 1; });
module.exports = { MANIFEST, STATE, LOCK, HELP, parseArgs, controllerSources, runtimeIdentity, atomicWrite, validateManifest,
  validateRoot, inspectStage, collectStages, materialStages, refresh, fitMaterial, launchStage, main };
