#!/usr/bin/env node
'use strict';

// A bounded performance experiment in an owned runtime. The active balance
// runner is never patched in place and these games are not balance evidence.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash, randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { ensureBenchmarkRuntime, openBenchmarkRuntime } = require('./balance/engine-benchmark-runtime');
const { acquireLock } = require('./balance/storage');
const { renameWithRetrySync, unlinkWithRetrySync } = require('./balance/files');

const ROOT = path.resolve(__dirname, '..');
const OWNER = 'benchmark-runtime.json', MANIFEST = 'benchmark.json', TIMES = 'benchmark-times.json', LOCK = '.engine-benchmark.lock';
const TEMP = /^\.engine-benchmark-[a-f0-9-]{36}\.tmp$/;
const sha = value => createHash('sha256').update(value).digest('hex');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const HELP = `Engine-sharing performance benchmark, not piece-balance evidence

  npm.cmd run balance:benchmark-engines -- --out DIRECTORY [--jobs 4] [--rounds 2]
  npm.cmd run balance:benchmark-engines -- --resume DIRECTORY
  npm.cmd run balance:benchmark-engines -- --report DIRECTORY
  npm.cmd run balance:benchmark-engines -- --check [--rules-only]

Default: 64 benchmark games. One Vanguard/Unicorn matchup, no forced opening,
both colors, 20k/80k nodes, shared/separate engines, two counterbalanced rounds.
Four jobs mean four active searches, with four or eight resident engines.
Pause or finish the active balance campaign before measuring laptop throughput.
q/Ctrl+C stops now; g finishes active games; p finishes active color pairs.
The whole benchmark pauses after a stop, failure or incomplete cell. Interrupted
cells remain resumable but their timing is excluded from speed comparisons.
Keep DIRECTORY/runtime with the results. --engine PATH selects the executable;
--log plies adds moves. Existing panel definitions and source identities stay fixed.
`;

function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index], key = typeof flag === 'string' && flag.startsWith('--') ? flag.slice(2) : '';
    if (!['check', 'rules-only', 'out', 'resume', 'report', 'jobs', 'rounds', 'engine', 'log'].includes(key) || Object.hasOwn(options, key)) throw new Error(`Unknown or repeated option: ${flag}.`);
    if (['check', 'rules-only'].includes(key)) { options[key] = true; continue; }
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
    options[key] = value;
  }
  if (['check', 'out', 'resume', 'report'].filter(key => options[key]).length !== 1) throw new Error('Choose --check, --out, --resume or --report.');
  if (options['rules-only'] && !options.check || (options.jobs !== undefined || options.rounds !== undefined) && !options.out
    || options.report && (options.engine || options.log) || options.check && options.log) throw new Error('An option does not apply to this mode.');
  if (options.jobs !== undefined && !/^[1-4]$/.test(options.jobs)) throw new Error('--jobs must be 1 through 4.');
  if (options.rounds !== undefined && !/^[1-8]$/.test(options.rounds)) throw new Error('--rounds must be 1 through 8.');
  if (options.out) { options.jobs = Number(options.jobs || 4); options.rounds = Number(options.rounds || 2); }
  if (options.log && !['games', 'plies'].includes(options.log)) throw new Error('--log must be games or plies.');
  return options;
}
function atomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.engine-benchmark-${randomUUID()}.tmp`);
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx'); fs.writeFileSync(fd, content); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    renameWithRetrySync(temporary, file);
  } finally { if (fd !== undefined) fs.closeSync(fd); unlinkWithRetrySync(temporary); }
}
function ordinaryDirectory(root) {
  const stat = fs.lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Use an ordinary benchmark directory.');
}
function separateOutput(root) {
  let existing = path.resolve(root);
  const suffix = [];
  while (!fs.existsSync(existing)) { suffix.unshift(path.basename(existing)); existing = path.dirname(existing); }
  const resolved = path.join(fs.realpathSync(existing), ...suffix);
  for (let parent = path.dirname(resolved); ; parent = path.dirname(parent)) {
    if (['panel.json', 'followup.json', 'focus.json', MANIFEST, 'run.json'].some(file => fs.existsSync(path.join(parent, file)))) {
      throw new Error('Use a separate benchmark result folder outside existing campaigns.');
    }
    if (parent === path.dirname(parent)) break;
  }
}
function inactive(root) {
  if (!fs.existsSync(path.join(root, 'run.lock'))) return;
  const owner = json(path.join(root, 'run.lock'));
  if (!Number.isSafeInteger(owner.pid) || owner.pid < 1) throw new Error('Invalid benchmark-cell lock owner.');
  try { process.kill(owner.pid, 0); } catch (error) { if (error.code === 'ESRCH') return; throw error; }
  throw new Error(`A benchmark cell is active in process ${owner.pid}.`);
}
function inspectAll(root, manifest) {
  const plan = require('./balance/engine-benchmark-plan'), tools = require('./version17-balance');
  return manifest.cells.map(cell => {
    const directory = path.join(root, cell.directory);
    if (!fs.existsSync(directory)) return { ...cell, state: { mode: 'new' } };
    ordinaryDirectory(directory); inactive(directory);
    if (!fs.existsSync(path.join(directory, 'run.json'))) {
      if (fs.readdirSync(directory).length) throw new Error('Foreign benchmark-cell data without a manifest.');
      return { ...cell, state: { mode: 'new' } };
    }
    const config = plan.buildCellConfig({ ...cell, jobs: manifest.jobs });
    const saved = tools.validateManifest(json(path.join(directory, 'run.json')), { config });
    if (saved.parallel?.jobs !== manifest.jobs) throw new Error('Benchmark worker count changed.');
    for (const field of ['engineSha256', 'rulesBundleSha256', 'runnerSha256', 'runnerSources']) {
      if (!isDeepStrictEqual(saved[field], manifest.identity[field])) throw new Error('A benchmark cell changed its recorded runtime.');
    }
    const rules = fs.readFileSync(path.join(directory, saved.rulesProfiles[0].file), 'utf8').replace(/\r\n/g, '\n');
    if (rules !== saved.designProfile.config) throw new Error('Archived benchmark rules changed.');
    let journal = '';
    try { journal = fs.readFileSync(path.join(directory, 'games.jsonl'), 'utf8'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const records = journal.slice(0, journal.lastIndexOf('\n') + 1).split('\n').filter(Boolean).map(JSON.parse);
    const report = require('./balance/v17-report').createV17Report({ config, manifest: saved, records,
      metadata: { rows: [{ key: 'vanguard', label: 'Vanguard' }], columns: [{ key: 'unicorn', label: 'Unicorn' }],
        comparisons: [{ id: 'vanguard-v-unicorn', aKey: 'vanguard', aLabel: 'Vanguard', bKey: 'unicorn', bLabel: 'Unicorn' }] } });
    return { ...cell, state: { mode: report.progress.finalizedGames === cell.games ? 'complete' : 'resume', manifest: saved, records } };
  });
}
function readTimes(root, manifest) {
  const file = path.join(root, TIMES);
  if (!fs.existsSync(file)) return { runId: manifest.runId, cells: {} };
  const value = json(file);
  if (value.runId !== manifest.runId || !value.cells || typeof value.cells !== 'object' || Array.isArray(value.cells)) throw new Error('Invalid benchmark timing ownership.');
  for (const [key, timing] of Object.entries(value.cells)) {
    if (!timing || !manifest.cells.some(cell => cell.key === key) || !Number.isInteger(timing.sessions) || timing.sessions < 1
      || ![true, false].includes(timing.timingEligible) || timing.elapsedMs !== null && (!Number.isFinite(timing.elapsedMs) || timing.elapsedMs <= 0)) throw new Error('Invalid benchmark timing state.');
    if (timing.sessions > 1 && timing.timingEligible) throw new Error('Resumed benchmark timing cannot become a fresh comparison.');
  }
  return value;
}
function writeReport(root, manifest, cells, times) {
  const plan = require('./balance/engine-benchmark-plan');
  const results = cells.filter(cell => cell.state.manifest).map(cell => ({ ...cell,
    elapsedMs: times.cells[cell.key]?.elapsedMs ?? null,
    timingEligible: times.cells[cell.key]?.timingEligible === true
      && Number.isFinite(times.cells[cell.key]?.elapsedMs) && times.cells[cell.key].elapsedMs > 0,
    manifest: cell.state.manifest, records: cell.state.records }));
  const report = { ...plan.summarizeBenchmark(manifest, results), runId: manifest.runId, host: manifest.host };
  const file = path.join(root, 'benchmark-report.json');
  if (fs.existsSync(file)) {
    const prior = json(file);
    if (prior.runId !== manifest.runId || prior.format !== report.format) throw new Error('Refusing to replace a foreign benchmark report.');
  } else if (fs.existsSync(path.join(root, 'benchmark-report.md'))) throw new Error('Refusing to replace unowned benchmark Markdown.');
  atomic(file, JSON.stringify(report, null, 2) + '\n');
  atomic(path.join(root, 'benchmark-report.md'), plan.renderReport(report));
  return { report, files: { json: file, markdown: path.join(root, 'benchmark-report.md') } };
}

async function runBenchmark(args, { enginePath, overlaySha256, initialJobs, initialRounds, log = console.log, signals = process,
  inspect = inspectAll, report = writeReport, run, check, identity } = {}) {
  const options = parseArgs(args), plan = require('./balance/engine-benchmark-plan');
  run ||= require('./parallel-balance').main;
  check ||= require('./balance/validate-designs').validateDesignConfig;
  identity ||= require('./balance/run').getRunIdentity;
  const controller = new AbortController(), abort = () => controller.abort();
  signals.on('SIGINT', abort); signals.on('SIGTERM', abort);
  try {
    if (options.check) {
      for (const nodes of plan.NODES) for (const mode of plan.MODES) {
        if (controller.signal.aborted) return { stopped: true };
        await check(plan.buildCellConfig({ nodes, mode }), { enginePath: options['rules-only'] ? undefined : enginePath,
          signal: controller.signal, onProgress: log, standardOpeningSources: true, includeValueInventory: true });
      }
      if (controller.signal.aborted) return { stopped: true };
      log('Benchmark rules, settings and value preflight passed. No benchmark games started.'); return { checked: true };
    }
    const root = path.resolve(options.out || options.resume || options.report);
    const actual = options.report ? null : identity(enginePath);
    let manifest;
    if (!fs.existsSync(path.join(root, MANIFEST)) && !options.report) {
      if (fs.readdirSync(root).some(file => ![OWNER, LOCK, 'runtime'].includes(file) && !TEMP.test(file))) throw new Error('Missing benchmark manifest beside existing data.');
      const declaration = plan.buildBenchmarkPlan({ jobs: options.out ? options.jobs : initialJobs, rounds: options.out ? options.rounds : initialRounds });
      manifest = { ...declaration, runId: randomUUID(), createdAt: new Date().toISOString(), planSha256: sha(JSON.stringify(declaration)),
        overlaySha256, identity: actual, host: { platform: os.platform(), release: os.release(), arch: os.arch(),
          cpu: os.cpus()[0]?.model || null, logicalProcessors: os.cpus().length, totalMemoryBytes: os.totalmem() } };
      atomic(path.join(root, MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
    } else {
      manifest = json(path.join(root, MANIFEST));
      const { runId, createdAt, planSha256, overlaySha256: savedOverlay, identity: savedIdentity, host, ...declaration } = manifest;
      if (!runId || !createdAt || savedOverlay !== overlaySha256 || planSha256 !== sha(JSON.stringify(declaration))
        || !isDeepStrictEqual(declaration, plan.buildBenchmarkPlan({ jobs: declaration.jobs, rounds: declaration.rounds }))
        || actual && !isDeepStrictEqual(actual, savedIdentity)) throw new Error('The frozen benchmark identity changed.');
    }
    const allowed = new Set([OWNER, MANIFEST, TIMES, LOCK, 'runtime', 'configs', 'benchmark-report.md', 'benchmark-report.json', ...manifest.cells.map(cell => cell.directory)]);
    for (const file of fs.readdirSync(root)) if ((!allowed.has(file) && !TEMP.test(file)) || fs.lstatSync(path.join(root, file)).isSymbolicLink()) throw new Error('Foreign or symbolic benchmark output.');
    const configRoot = path.join(root, 'configs');
    if (fs.existsSync(configRoot)) {
      ordinaryDirectory(configRoot);
      for (const file of fs.readdirSync(configRoot)) {
        if (TEMP.test(file) && fs.lstatSync(path.join(configRoot, file)).isFile()) continue;
        const cell = manifest.cells.find(row => `${row.directory}.json` === file);
        if (!cell || fs.lstatSync(path.join(configRoot, file)).isSymbolicLink()
          || !isDeepStrictEqual(json(path.join(configRoot, file)), plan.buildCellConfig({ ...cell, jobs: manifest.jobs }))) throw new Error('A benchmark config is foreign or changed.');
      }
    }
    const times = readTimes(root, manifest);
    let cells = inspect(root, manifest), updated = report(root, manifest, cells, times);
    if (options.report) { log(`Benchmark report: ${updated.files.markdown}. No games started.`); return updated; }
    log(`BENCHMARK ONLY: ${manifest.games} games; ${manifest.jobs} jobs; ${manifest.rounds} counterbalanced rounds. Keep other experiments paused.`);
    for (const cell of cells) {
      if (controller.signal.aborted) return { stopped: true, ...updated };
      if (cell.state.mode === 'complete') { log(`Verified complete; skipping ${cell.key}.`); continue; }
      openBenchmarkRuntime({ directory: ROOT, manifestSha256: overlaySha256 });
      if (!isDeepStrictEqual(identity(enginePath), manifest.identity)) throw new Error('The benchmark executable or runtime changed between cells.');
      const config = plan.buildCellConfig({ ...cell, jobs: manifest.jobs }), file = path.join(configRoot, `${cell.directory}.json`);
      if (!fs.existsSync(file)) atomic(file, JSON.stringify(config, null, 2) + '\n');
      const previousTiming = times.cells[cell.key];
      const timing = { sessions: (previousTiming?.sessions || 0) + 1, startedAt: new Date().toISOString(), finishedAt: null,
        elapsedMs: null, timingEligible: cell.state.mode === 'new' && !previousTiming };
      times.cells[cell.key] = timing;
      atomic(path.join(root, TIMES), JSON.stringify(times, null, 2) + '\n');
      const runArgs = cell.state.mode === 'resume' ? ['--resume', path.join(root, cell.directory)]
        : ['--config', file, '--out', path.join(root, cell.directory), '--jobs', String(manifest.jobs)];
      runArgs.push('--log', options.log || 'games');
      const previousPath = process.env.FAIRY_STOCKFISH_PATH, previousMode = process.env.LEVELUP_BENCH_ENGINE_MODE;
      process.env.FAIRY_STOCKFISH_PATH = enginePath; process.env.LEVELUP_BENCH_ENGINE_MODE = cell.mode;
      log(`Starting ${cell.key}: ${cell.games} games; ${cell.mode} mode, at most ${cell.expectedNativeProcessMax} native engines.`);
      const started = process.hrtime.bigint();
      let result, failure;
      try { result = await run(runArgs); }
      catch (error) { failure = error; timing.timingEligible = false; }
      finally {
        timing.elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
        timing.finishedAt = new Date().toISOString();
        if (controller.signal.aborted || result?.stopped || result?.stopRequested) timing.timingEligible = false;
        if (previousPath === undefined) delete process.env.FAIRY_STOCKFISH_PATH; else process.env.FAIRY_STOCKFISH_PATH = previousPath;
        if (previousMode === undefined) delete process.env.LEVELUP_BENCH_ENGINE_MODE; else process.env.LEVELUP_BENCH_ENGINE_MODE = previousMode;
        atomic(path.join(root, TIMES), JSON.stringify(times, null, 2) + '\n');
        try { cells = inspect(root, manifest); updated = report(root, manifest, cells, times); }
        catch (error) { if (failure) failure.reportError = error.message; else throw error; }
      }
      if (failure) throw failure;
      const finished = cells.find(row => row.key === cell.key);
      if (controller.signal.aborted || result?.stopped || result?.stopRequested || finished.state.mode !== 'complete') return { stopped: true, ...updated };
      log(`Finished ${cell.key}: ${(timing.elapsedMs / 1000).toFixed(1)} seconds.${timing.timingEligible ? '' : ' Interrupted/resumed timing excluded.'}`);
    }
    log(`Benchmark finished: ${updated.files.markdown}. These games are not piece-balance evidence.`);
    return { stopped: false, ...updated };
  } finally { signals.removeListener('SIGINT', abort); signals.removeListener('SIGTERM', abort); }
}

async function main(args = process.argv.slice(2), { sourceRoot = ROOT, ensure = ensureBenchmarkRuntime, open = openBenchmarkRuntime,
  execute, log = console.log } = {}) {
  const options = parseArgs(args);
  if (options.help) { log(HELP); return; }
  const enginePath = options.report || options['rules-only'] ? undefined : options.engine ? path.resolve(options.engine)
    : process.env.FAIRY_STOCKFISH_PATH ? path.resolve(process.env.FAIRY_STOCKFISH_PATH)
      : process.platform === 'win32' ? path.join(sourceRoot, 'stockfish/fairy-stockfish-levelup_x86-64.exe') : undefined;
  if (!options.report && !options['rules-only'] && !enginePath) throw new Error('Set FAIRY_STOCKFISH_PATH or --engine to a compatible native executable.');
  let overlay, unlock, initialJobs, initialRounds;
  try {
    if (options.check) overlay = ensure({ root: sourceRoot });
    else {
      const root = path.resolve(options.out || options.resume || options.report);
      if (options.out) { separateOutput(root); fs.mkdirSync(root, { recursive: true }); }
      ordinaryDirectory(root); unlock = acquireLock(root, 'engine-sharing-benchmark', LOCK);
      if (options.out) {
        if (fs.readdirSync(root).some(file => file !== LOCK)) throw new Error('A new benchmark needs an empty directory.');
        initialJobs = options.jobs; initialRounds = options.rounds;
        const owner = { schemaVersion: 1, format: 'levelup-engine-benchmark-runtime-owner', directory: null, jobs: initialJobs, rounds: initialRounds };
        atomic(path.join(root, OWNER), JSON.stringify(owner) + '\n');
        overlay = ensure({ root: sourceRoot, cacheDirectory: path.join(root, 'runtime') });
        atomic(path.join(root, OWNER), JSON.stringify({ ...owner, directory: path.relative(root, overlay.directory).split(path.sep).join('/'), manifestSha256: overlay.manifestSha256 }) + '\n');
      } else {
        const owner = json(path.join(root, OWNER));
        if (owner.schemaVersion !== 1 || owner.format !== 'levelup-engine-benchmark-runtime-owner'
          || !Number.isInteger(owner.jobs) || owner.jobs < 1 || owner.jobs > 4 || !Number.isInteger(owner.rounds) || owner.rounds < 1 || owner.rounds > 8) throw new Error('Invalid benchmark runtime ownership.');
        initialJobs = owner.jobs; initialRounds = owner.rounds;
        if (owner.directory === null && options.resume && !fs.existsSync(path.join(root, MANIFEST))) {
          if (fs.readdirSync(root).some(file => ![OWNER, LOCK, 'runtime'].includes(file) && !TEMP.test(file))) throw new Error('Incomplete benchmark setup contains foreign data.');
          overlay = ensure({ root: sourceRoot, cacheDirectory: path.join(root, 'runtime') });
          atomic(path.join(root, OWNER), JSON.stringify({ ...owner, directory: path.relative(root, overlay.directory).split(path.sep).join('/'), manifestSha256: overlay.manifestSha256 }) + '\n');
        } else {
          if (!/^runtime\/[a-z0-9-]+$/.test(owner.directory || '')) throw new Error('Invalid benchmark runtime path.');
          overlay = open({ directory: path.join(root, owner.directory), manifestSha256: owner.manifestSha256 });
        }
      }
    }
    return await (execute || require(overlay.entry).runBenchmark)(args, { enginePath, overlaySha256: overlay.manifestSha256, initialJobs, initialRounds, log });
  } finally { unlock?.(); }
}

if (require.main === module) main().catch(error => { console.error(`Engine benchmark: ${error.message}`); process.exitCode = 1; });
module.exports = { ROOT, OWNER, MANIFEST, TIMES, LOCK, HELP, parseArgs, atomic, inspectAll, readTimes, writeReport, runBenchmark, main };
