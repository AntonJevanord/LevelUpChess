#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { FILES, loadExperiment } = require('./balance/v17-plan');
const { makeSchedule } = require('./balance/plan');
const { createDesignRegistry } = require('./balance/design-registry');
const { compileDesignProfile } = require('./balance/design-profile');
const { validateDesignConfig } = require('./balance/validate-designs');
const { getOfficialReferences, requireOfficialReferenceValues } = require('./balance/official-references');
const { UciEngine } = require('./balance/uci');
const { acquireLock } = require('./balance/storage');
const { renameWithRetrySync, unlinkWithRetrySync } = require('./balance/files');
const { createV17Report, renderV17Report, renderV17Csv } = require('./balance/v17-report');
const { main: parallelMain } = require('./parallel-balance');

const ROOT = path.resolve(__dirname, '..');
const sha = value => createHash('sha256').update(value).digest('hex');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const HELP = `Version 17: three independent, capped experiments

  npm run balance:v17 -- --experiment level3 --check
  npm run balance:v17 -- --experiment reference-2v2 --check
  npm run balance:v17 -- --experiment pawn-grants --check
  npm run balance:v17 -- --experiment NAME --out DIRECTORY [--jobs 4] [--log games|plies]
  npm run balance:v17 -- --experiment NAME --resume DIRECTORY
  npm run balance:v17 -- --experiment NAME --report DIRECTORY

Experiments: level3 = 832 games; reference-2v2 = 240; pawn-grants = 240.
Each uses eight fixed opening cases, complete color pairs and 20,000 nodes/move.
Only the selected experiment runs. No follow-up or additional games start
automatically. q/Ctrl+C stops now; g finishes active games; p finishes pairs.
The existing parallel runner owns workers, journals, checkpoints and resume.

--check validates every opening and native legal move set, including the four
frozen reference value tables, without starting match games or writing results.
--check --rules-only omits native checks. --report is offline and needs no engine.
Reports use complete pairs only; eight fixed prefixes provide a coarse screen.
On Linux/macOS set FAIRY_STOCKFISH_PATH to the compatible native executable.
`;

function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  const values = {}, valued = new Set(['experiment', 'out', 'resume', 'report', 'jobs', 'log']);
  for (let index = 0; index < args.length; index++) {
    const flag = args[index], name = typeof flag === 'string' && flag.startsWith('--') ? flag.slice(2) : '';
    if (Object.hasOwn(values, name)) throw new Error(`Repeated argument: ${flag}.`);
    if (['check', 'rules-only'].includes(name)) { values[name] = true; continue; }
    if (!valued.has(name)) throw new Error(`Unknown argument: ${flag}. Use --help.`);
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
    values[name] = value;
  }
  if (!Object.hasOwn(FILES, values.experiment)) throw new Error(`Select --experiment ${Object.keys(FILES).join('|')}.`);
  if (['check', 'out', 'resume', 'report'].filter(name => Object.hasOwn(values, name)).length !== 1) throw new Error('Select exactly one of --check, --out DIRECTORY, --resume DIRECTORY or --report DIRECTORY.');
  if (values['rules-only'] && !values.check) throw new Error('--rules-only applies only to --check.');
  if (values.jobs !== undefined && (!values.out || !/^(?:[1-9]|1[0-6])$/.test(values.jobs))) throw new Error('--jobs needs 1–16 and applies only to a new --out run; resume keeps its frozen workers.');
  if (values.jobs !== undefined) values.jobs = Number(values.jobs);
  if (values.log !== undefined && (!['games', 'plies'].includes(values.log) || !values.out && !values.resume)) throw new Error('--log games|plies applies only to new or resumed runs.');
  return values;
}

function resolveEngine() {
  if (process.env.FAIRY_STOCKFISH_PATH) return path.resolve(process.env.FAIRY_STOCKFISH_PATH);
  if (process.platform !== 'win32') throw new Error('Set FAIRY_STOCKFISH_PATH to a compatible native engine, or use --check --rules-only.');
  return path.join(ROOT, 'stockfish/fairy-stockfish-levelup_x86-64.exe');
}

/** Use the existing validator and add the frozen references' six-field table
 * proof. Temporary INI files are removed even when startup or validation fails. */
async function checkExperiment(declaration, { enginePath, signal, onProgress = () => {}, validate = validateDesignConfig } = {}) {
  const config = declaration.config;
  let directory, engine, referenceValues;
  try {
    if (enginePath) {
      const registry = createDesignRegistry(config), profile = compileDesignProfile(registry, config.evaluation);
      directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v17-check-'));
      const variantPath = path.join(directory, 'profile.ini');
      fs.writeFileSync(variantPath, profile.config);
      engine = new UciEngine({ path: enginePath, variantPath, variant: profile.variant,
        options: { skill: 20, threads: config.engine.threads, hash: config.engine.hashMb } });
      onProgress('Validation: checking all four frozen reference MG/EG value tables.');
      await engine.start({ signal });
      referenceValues = await requireOfficialReferenceValues(engine, profile, { signal });
      await engine.close(); engine = null;
    }
    const validation = await validate(config, { ...(enginePath ? { enginePath } : {}), signal, onProgress, standardOpeningSources: true });
    return { ...validation, experiment: declaration.experiment,
      configSha256: sha(JSON.stringify(config)), ...(referenceValues ? { referenceValues, engineSha256: sha(fs.readFileSync(enginePath)) } : {}) };
  } finally {
    try { await engine?.close(); }
    finally { if (directory) fs.rmSync(directory, { recursive: true, force: true }); }
  }
}

function validateManifest(manifest, declaration) {
  const { config } = declaration, schedule = makeSchedule(config);
  const registry = createDesignRegistry(config), profile = compileDesignProfile(registry, config.evaluation);
  const expectedProfile = { variant: profile.variant, config: profile.config, hash: profile.hash, registryHash: registry.hash };
  if (!manifest || manifest.schemaVersion !== 1 || typeof manifest.runId !== 'string' || !manifest.runId
    || !isDeepStrictEqual(manifest.config, config) || !isDeepStrictEqual(manifest.schedule, schedule)
    || manifest.configHash !== sha(JSON.stringify({ config, schedule }))
    || !isDeepStrictEqual(manifest.designRegistry, registry) || !isDeepStrictEqual(manifest.designProfile, expectedProfile)) {
    throw new Error('The run does not match this frozen version-17 experiment, schedule or design profile.');
  }
  for (const field of ['engineSha256', 'rulesBundleSha256', 'runnerSha256', 'rulesHash']) {
    if (!/^[a-f0-9]{64}$/.test(manifest[field] || '')) throw new Error(`The run is missing its ${field} identity.`);
  }
  const expectedRulesHash = sha(JSON.stringify({ bundleHash: manifest.rulesBundleSha256, runnerSha256: manifest.runnerSha256,
    profiles: [{ variant: profile.variant, config: profile.config }] }));
  if (manifest.rulesHash !== expectedRulesHash) throw new Error('The run rules identity does not match its declared profile.');
  if (!Array.isArray(manifest.runnerSources) || sha(JSON.stringify(manifest.runnerSources)) !== manifest.runnerSha256) throw new Error('The run source inventory does not match its recorded identity.');
  const expectedProfiles = [{ variant: profile.variant, whiteKing: 0, blackKing: 0, configSha256: sha(profile.config),
    file: `rules/${profile.variant}.ini`, royalMode: 'king', evaluationCaveat: null, profileHash: profile.hash, registryHash: registry.hash }];
  if (!isDeepStrictEqual(manifest.rulesProfiles, expectedProfiles)) throw new Error('The run archived-rule inventory does not match its declared profile.');
  return manifest;
}

function validatePreflight(proof, declaration, { manifest, validation } = {}) {
  const registry = createDesignRegistry(declaration.config), profile = compileDesignProfile(registry, declaration.config.evaluation);
  if (!proof || proof.schemaVersion !== 1 || proof.format !== 'levelup-v17-native-preflight' || proof.experiment !== declaration.experiment
    || proof.configSha256 !== sha(JSON.stringify(declaration.config)) || proof.profileHash !== profile.hash || proof.registryHash !== registry.hash
    || !/^[a-f0-9]{64}$/.test(proof.engineSha256 || '') || proof.validation?.native !== true
    || proof.validation.configSha256 !== proof.configSha256 || proof.validation.profileHash !== proof.profileHash
    || proof.validation.registryHash !== proof.registryHash || proof.validation.engineSha256 !== proof.engineSha256
    || proof.validation.games !== declaration.metadata.scheduledGames || proof.validation.validatedOpenings !== declaration.metadata.scheduledGames
    || manifest && proof.engineSha256 !== manifest.engineSha256 || validation && !isDeepStrictEqual(proof.validation, validation)) {
    throw new Error('The native preflight proof does not match this experiment, engine or rules profile.');
  }
  const values = proof.validation.referenceValues;
  if (values?.version !== 1 || !values.pieces) throw new Error('The native preflight proof is missing its reference value inventory.');
  for (const reference of getOfficialReferences().roster) {
    const letter = registry.allocations.find(allocation => allocation.id === reference.id).letter;
    for (const type of [letter, letter.toUpperCase()]) for (const field of ['rawMg', 'rawEg', 'captureMg', 'captureEg', 'evalMg', 'evalEg']) {
      if (values.pieces[type]?.[field] !== reference.engineValue[field.endsWith('Mg') ? 'mg' : 'eg']) throw new Error('The native preflight proof changed a frozen reference value.');
    }
  }
  return proof;
}

function atomicWrite(file, content) {
  const root = path.dirname(file), temporary = path.join(root, `.v17-${randomUUID()}.tmp`);
  let fd, directoryFd;
  try {
    fd = fs.openSync(temporary, 'wx');
    fs.writeFileSync(fd, content, 'utf8'); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    renameWithRetrySync(temporary, file);
    try { directoryFd = fs.openSync(root, 'r'); fs.fsyncSync(directoryFd); }
    catch (error) { if (!['EINVAL', 'EISDIR', 'EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error; }
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (directoryFd !== undefined) fs.closeSync(directoryFd);
    unlinkWithRetrySync(temporary);
  }
}

function writePreflight(directory, declaration, validation, { resume = false } = {}) {
  const root = path.resolve(directory), file = path.join(root, 'v17-preflight.json');
  if (resume) {
    const manifest = validateManifest(json(path.join(root, 'run.json')), declaration);
    return validatePreflight(json(file), declaration, { manifest, validation });
  }
  if (fs.existsSync(root) && fs.readdirSync(root).some(name => name !== 'v17-preflight.json')) throw new Error('A new version-17 run needs an empty output directory. Use --resume for an existing run.');
  if (fs.existsSync(file)) return validatePreflight(json(file), declaration, { validation });
  const proof = { schemaVersion: 1, format: 'levelup-v17-native-preflight', experiment: declaration.experiment, checkedAt: new Date().toISOString(),
    configSha256: validation.configSha256, profileHash: validation.profileHash, registryHash: validation.registryHash,
    engineSha256: validation.engineSha256, validation };
  validatePreflight(proof, declaration);
  fs.mkdirSync(root, { recursive: true });
  const unlock = acquireLock(root, `v17-${declaration.experiment}-preflight`, '.v17-preflight.lock');
  try {
    if (fs.readdirSync(root).some(name => !['v17-preflight.json', '.v17-preflight.lock'].includes(name))) throw new Error('A new version-17 run needs an empty output directory.');
    if (fs.existsSync(file)) return validatePreflight(json(file), declaration, { validation });
    atomicWrite(file, JSON.stringify(proof, null, 2) + '\n');
    return proof;
  } finally { unlock(); }
}

function readReportInput(directory, declaration) {
  const root = path.resolve(directory), manifest = validateManifest(json(path.join(root, 'run.json')), declaration);
  const rules = fs.readFileSync(path.join(root, manifest.rulesProfiles[0].file));
  if (rules.toString('utf8').replace(/\r\n/g, '\n') !== manifest.designProfile.config) throw new Error('The run archived rules file changed.');
  const preflightFile = fs.readFileSync(path.join(root, 'v17-preflight.json'));
  const preflight = validatePreflight(JSON.parse(preflightFile.toString('utf8')), declaration, { manifest });
  let journal;
  try { journal = fs.readFileSync(path.join(root, 'games.jsonl')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; journal = Buffer.alloc(0); }
  const boundary = journal.lastIndexOf(10) + 1, prefix = journal.subarray(0, boundary);
  const records = prefix.toString('utf8').split('\n').filter(Boolean).map(JSON.parse);
  return { root, manifest, records, source: { file: 'games.jsonl', completePrefixBytes: boundary,
    observedBytes: journal.length, completePrefixSha256: sha(prefix), tornTailIgnored: boundary !== journal.length,
    nativePreflight: { file: 'v17-preflight.json', sha256: sha(preflightFile), engineSha256: preflight.engineSha256 } } };
}

function writeReports(directory, declaration) {
  const root = path.resolve(directory);
  const unlock = acquireLock(root, `v17-${declaration.experiment}-report`, '.v17-report.lock');
  try {
    const { manifest, records, source } = readReportInput(root, declaration);
    const report = { ...createV17Report({ ...declaration, records, manifest }), source };
    const files = { json: path.join(root, 'v17-report.json'), markdown: path.join(root, 'v17-report.md'), csv: path.join(root, 'v17-report.csv') };
    if (fs.existsSync(files.json)) {
      const previous = json(files.json);
      if (previous.format !== report.format || previous.experiment !== report.experiment || previous.runId !== report.runId) throw new Error('Refusing to replace a report belonging to another run or tool.');
    } else if ([files.markdown, files.csv].some(file => fs.existsSync(file))) throw new Error('Refusing to overwrite an existing unowned report file.');
    const contents = [[files.json, JSON.stringify(report, null, 2) + '\n'], [files.markdown, renderV17Report(report)], [files.csv, renderV17Csv(report)]];
    for (const [file, content] of contents) atomicWrite(file, content);
    return { report, files };
  } finally { unlock(); }
}

async function main(args = process.argv.slice(2), { run = parallelMain, check = checkExperiment, report = writeReports, persist = writePreflight, log = console.log,
  enginePath: suppliedEngine } = {}) {
  const options = parseArgs(args);
  if (options.help) { log(HELP); return; }
  const declaration = loadExperiment(options.experiment);
  log(`${declaration.config.name}: ${declaration.metadata.scheduledGames} games; ${declaration.config.openings.length} opening cases; four frozen references.`);
  if (options.report) {
    const result = report(options.report, declaration);
    log(`Paired matchup table: ${result.files.markdown}\nJSON: ${result.files.json}\nCSV: ${result.files.csv}\nNo games started.`);
    return result;
  }
  if (options.resume) validateManifest(json(path.join(path.resolve(options.resume), 'run.json')), declaration);
  const controller = new AbortController(), abort = () => controller.abort();
  process.once('SIGINT', abort); process.once('SIGTERM', abort);
  let proof;
  try {
    const enginePath = options['rules-only'] ? undefined : suppliedEngine || resolveEngine();
    proof = await check(declaration, { enginePath, signal: controller.signal, onProgress: log });
    if (controller.signal.aborted) throw new Error('Version-17 validation cancelled. No match games started.');
  } finally { process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort); }
  if (options.check) {
    log(options['rules-only'] ? 'Rules-only check finished; native movement and value tables were not checked. No games started.' : 'Native and rules checks passed. No games started.');
    return proof;
  }
  persist(options.resume || options.out, declaration, proof, { resume: Boolean(options.resume) });
  const parallelArgs = options.resume ? ['--resume', options.resume] : ['--config', path.join(ROOT, declaration.file), '--out', options.out, '--jobs', String(options.jobs ?? 4)];
  if (options.log) parallelArgs.push('--log', options.log);
  const comparisonNames = Object.fromEntries(declaration.metadata.comparisons.map(item => [item.id, { a: item.aLabel, b: item.bLabel }]));
  const result = await run(parallelArgs, { comparisonNames });
  const reports = report(options.resume || options.out, declaration);
  log(`Paired matchup table: ${reports.files.markdown}`);
  return { ...result, validation: proof, report: reports.report, files: reports.files };
}

if (require.main === module) main().catch(error => { console.error(`Version-17 balance: ${error.message}`); process.exitCode = 1; });
module.exports = { parseArgs, resolveEngine, checkExperiment, validateManifest, validatePreflight, writePreflight, readReportInput, writeReports, main };
