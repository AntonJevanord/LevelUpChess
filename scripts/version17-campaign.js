#!/usr/bin/env node
'use strict';

// The existing stage runner owns engines, workers, journals and stop controls.
// This controller only launches the next declared stage after a full finish.
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const stageRunner = require('./version17-balance');
const { loadExperiment } = require('./balance/v17-plan');
const { createV17Report } = require('./balance/v17-report');
const { createDesignRegistry } = require('./balance/design-registry');
const { compileDesignProfile } = require('./balance/design-profile');
const { makeSchedule } = require('./balance/plan');
const { acquireLock } = require('./balance/storage');
const { renameWithRetrySync, unlinkWithRetrySync } = require('./balance/files');

const STAGES = Object.freeze(['acceptance-minors', 'acceptance-majors', 'reference-pawns', 'reference-grants', 'level3-confirmation']);
const FORMAT = 'levelup-v17-sequential-campaign';
const MANIFEST = 'campaign.json';
const LOCK = '.campaign.lock';
const sha = input => createHash('sha256').update(input).digest('hex');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const HELP = `Version-17 sequential balance campaign (6,752 games)

  npm.cmd run balance:campaign -- --out DIRECTORY [--jobs 4]
  npm.cmd run balance:campaign -- --resume DIRECTORY

Runs the five declared stages one at a time. Four workers total by default.
q/Ctrl+C stops now; g stops after active games; p stops after active pairs.
A stop, incomplete stage or failure prevents all later stages from starting.
Resume preserves the worker count and skips only verified completed stages.
Individual stage reports and original journals remain in named subdirectories.
No level-2/level-3 bridge or other follow-up is launched automatically.
`;

function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index], value = args[index + 1];
    if (!['--out', '--resume', '--jobs'].includes(flag) || Object.hasOwn(values, flag.slice(2)) || typeof value !== 'string' || !value || value.startsWith('--')) throw new Error('Use --out DIRECTORY [--jobs 4] or --resume DIRECTORY.');
    values[flag.slice(2)] = value;
  }
  if (Boolean(values.out) === Boolean(values.resume) || values.resume && values.jobs !== undefined) throw new Error('Choose a new output or resume; a resume cannot change jobs.');
  if (values.jobs !== undefined && !/^(?:[1-9]|1[0-6])$/.test(values.jobs)) throw new Error('--jobs must be an integer from 1 to 16.');
  if (values.out) values.jobs = Number(values.jobs || 4);
  return values;
}

function buildPlan(jobs, load = loadExperiment) {
  if (!Number.isInteger(jobs) || jobs < 1 || jobs > 16) throw new Error('Invalid frozen campaign worker count.');
  const stages = STAGES.map(experiment => {
    const declaration = load(experiment), registry = createDesignRegistry(declaration.config), profile = compileDesignProfile(registry, declaration.config.evaluation);
    return { experiment, directory: experiment, games: declaration.metadata.scheduledGames,
      configSha256: sha(JSON.stringify(declaration.config)), scheduleSha256: sha(JSON.stringify(makeSchedule(declaration.config))),
      profileHash: profile.hash, registryHash: registry.hash, valuation: declaration.metadata.evaluationAudit };
  });
  return { schemaVersion: 1, format: FORMAT, jobs, games: stages.reduce((sum, stage) => sum + stage.games, 0), stages };
}

function validateManifest(manifest, load = loadExperiment) {
  if (!manifest || typeof manifest.runId !== 'string' || !manifest.runId || typeof manifest.createdAt !== 'string') throw new Error('Missing campaign ownership or identity.');
  const { runId, createdAt, planSha256, ...plan } = manifest;
  if (planSha256 !== sha(JSON.stringify(plan)) || !isDeepStrictEqual(plan, buildPlan(plan.jobs, load))) throw new Error('The frozen campaign plan changed. Preserve this run and use a new campaign declaration.');
  return manifest;
}

function writeManifest(directory, manifest) {
  const file = path.join(directory, MANIFEST), temporary = path.join(directory, `.campaign-${randomUUID()}.tmp`);
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx');
    fs.writeFileSync(fd, JSON.stringify(manifest, null, 2) + '\n'); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    if (fs.existsSync(file)) throw new Error('Refusing to replace an existing campaign manifest.');
    renameWithRetrySync(temporary, file);
    let directoryFd;
    try { directoryFd = fs.openSync(directory, 'r'); fs.fsyncSync(directoryFd); }
    catch (error) { if (!['EINVAL', 'EISDIR', 'EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error; }
    finally { if (directoryFd !== undefined) fs.closeSync(directoryFd); }
  } finally { if (fd !== undefined) fs.closeSync(fd); unlinkWithRetrySync(temporary); }
}

function requireInactive(directory) {
  const file = path.join(directory, 'run.lock');
  if (!fs.existsSync(file)) return;
  const owner = json(file);
  if (!Number.isInteger(owner?.pid) || owner.pid < 1) throw new Error('Cannot establish stage-lock ownership.');
  try { process.kill(owner.pid, 0); }
  catch (error) { if (error.code === 'ESRCH') return; throw error; }
  throw new Error(`A campaign stage is still active in process ${owner.pid}. Stop it before continuing the campaign.`);
}

function inspectStage(directory, declaration, jobs, { read = stageRunner.readReportInput, summarize = createV17Report } = {}) {
  if (!fs.existsSync(directory)) return { mode: 'new' };
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('A stage output must be its own directory, not a file or symbolic link.');
  const entries = fs.readdirSync(directory);
  if (!entries.length) return { mode: 'new' };
  requireInactive(directory);
  if (!entries.includes('run.json')) {
    if (entries.length !== 1 || entries[0] !== 'v17-preflight.json') throw new Error('Refusing foreign stage output without its original run manifest.');
    stageRunner.validatePreflight(json(path.join(directory, 'v17-preflight.json')), declaration);
    return { mode: 'new' };
  }
  const input = read(directory, declaration);
  if (input.manifest?.parallel?.jobs !== jobs) throw new Error('A stage changed the frozen campaign worker count.');
  const report = summarize({ ...declaration, records: input.records, manifest: input.manifest });
  if (report.scheduledGames !== declaration.metadata.scheduledGames) throw new Error('A stage report changed its scheduled budget.');
  return { mode: report.progress.finalizedGames === report.scheduledGames ? 'complete' : 'resume', report };
}

function checkRoot(directory, manifest) {
  const allowed = new Set([MANIFEST, LOCK, ...manifest.stages.map(stage => stage.directory)]);
  if (fs.readdirSync(directory).some(name => !allowed.has(name))) throw new Error('Refusing a campaign directory containing foreign files.');
}

async function main(args = process.argv.slice(2), { runStage = stageRunner.main, inspect = inspectStage, load = loadExperiment, lock = acquireLock, log = console.log, signals = process } = {}) {
  const options = parseArgs(args);
  if (options.help) { log(HELP); return; }
  const directory = path.resolve(options.resume || options.out);
  if (options.out) fs.mkdirSync(directory, { recursive: true });
  if (!fs.existsSync(directory) || !fs.lstatSync(directory).isDirectory() || fs.lstatSync(directory).isSymbolicLink()) throw new Error('The campaign directory is missing or is not an ordinary directory.');
  const unlock = lock(directory, FORMAT, LOCK);
  let stopRequested = false;
  const stop = () => { stopRequested = true; };
  signals.on('SIGINT', stop); signals.on('SIGTERM', stop);
  try {
    let manifest;
    if (options.resume) manifest = validateManifest(json(path.join(directory, MANIFEST)), load);
    else {
      if (fs.readdirSync(directory).some(name => name !== LOCK)) throw new Error('A new campaign needs an empty directory. Preserve existing output and use --resume.');
      const plan = buildPlan(options.jobs, load);
      manifest = { ...plan, planSha256: sha(JSON.stringify(plan)), runId: randomUUID(), createdAt: new Date().toISOString() };
      writeManifest(directory, manifest);
    }
    checkRoot(directory, manifest);
    // Inspect every existing stage before launching any new game, so a foreign
    // later directory cannot be discovered only after earlier work has begun.
    const stages = manifest.stages.map(stage => ({ ...stage, declaration: load(stage.experiment),
      state: inspect(path.join(directory, stage.directory), load(stage.experiment), manifest.jobs) }));
    log(`Sequential campaign: ${manifest.games} scheduled games; ${manifest.jobs} workers total.`);
    const completed = [];
    for (const stage of stages) {
      await new Promise(resolve => setImmediate(resolve));
      if (stopRequested) return { stopped: true, completed, directory };
      if (stage.state.mode === 'complete') { completed.push(stage.experiment); log(`Verified complete; skipping ${stage.experiment}.`); continue; }
      const out = path.join(directory, stage.directory);
      const stageArgs = ['--experiment', stage.experiment, stage.state.mode === 'resume' ? '--resume' : '--out', out];
      if (stage.state.mode !== 'resume') stageArgs.push('--jobs', String(manifest.jobs));
      log(`Starting campaign stage ${stage.experiment}: ${stage.games} scheduled games.`);
      let result;
      try { result = await runStage(stageArgs, { log }); }
      catch (error) { if (stopRequested) return { stopped: true, completed, directory }; throw error; }
      const report = result?.report;
      if (!report || report.experiment !== stage.experiment || report.scheduledGames !== stage.games
        || !Number.isSafeInteger(report.progress?.finalizedGames) || report.progress.finalizedGames < 0 || report.progress.finalizedGames > stage.games) throw new Error('A stage did not return its expected verified report. Later stages were not started.');
      if (result.stopped || result.stopRequested || stopRequested || report.progress.finalizedGames !== stage.games) {
        log(`Campaign paused after ${stage.experiment}. No later stages started. Resume with --resume ${directory}`);
        return { stopped: true, completed, active: stage.experiment, directory };
      }
      completed.push(stage.experiment);
    }
    log(`Campaign finished: all ${manifest.games} scheduled games finalized. Reports remain in the five stage directories.`);
    return { stopped: false, completed, directory };
  } finally {
    signals.removeListener('SIGINT', stop); signals.removeListener('SIGTERM', stop); unlock();
  }
}

if (require.main === module) main().catch(error => { console.error(`Version-17 campaign: ${error.message}`); process.exitCode = 1; });
module.exports = { STAGES, FORMAT, MANIFEST, LOCK, HELP, parseArgs, buildPlan, validateManifest, inspectStage, main };
