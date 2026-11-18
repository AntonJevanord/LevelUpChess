#!/usr/bin/env node
'use strict';

// Read completed owned-runtime journals. No collector, engine or report writer
// inside the source campaign is invoked, and all output belongs to a new folder.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { openResearchOverlay } = require('./balance/research-overlay');
const { analyzeBoardMaterial, renderMaterial } = require('./balance/v19-panel-material');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const ANALYSIS_SOURCES = Object.freeze(['scripts/v19-panel-material.js', 'scripts/balance/v19-panel-material.js',
  'scripts/balance/material-dataset.js', 'scripts/balance/material-regression.js', 'scripts/balance/level3-panel-material.js',
  'scripts/balance/design-profile.js', 'scripts/balance/research-overlay.js']);
const HELP = `Offline version-19 board-piece material estimates

  npm.cmd run balance:v19:material -- --run PANEL_DIRECTORY --out NEW_DIRECTORY [--bootstrap 100] [--seed 42]

Stop the panel first. This reads its verified owned runtime, complete game
pairs and original profiles. No engine searches or new games start.
All grant-involved cells are excluded; pockets/drops/reserve pieces in any
retained game are rejected. Grants remain in the original outcome report.
Pawn=1 and ordinary queen=9 are fixed assumptions. Values remain conditional
on the book and engine policy. Unsupported fits stay explicitly unavailable.
Use a fresh output folder outside the source panel and preserve both folders.
`;
function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  const options = { bootstrap: 100, seed: 42 }, seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i], key = typeof flag === 'string' ? flag.slice(2) : '';
    if (!['run', 'out', 'bootstrap', 'seed'].includes(key) || flag !== `--${key}` || seen.has(key)) throw new Error('Use --run, --out, --bootstrap and --seed once each.');
    seen.add(key); const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error(`${flag} needs a value.`);
    if (['bootstrap', 'seed'].includes(key)) {
      if (!/^\d+$/.test(value)) throw new Error(`${flag} must be an integer.`);
      options[key] = Number(value);
    } else options[key] = value;
  }
  if (!options.run || !options.out || !Number.isSafeInteger(options.bootstrap) || options.bootstrap > 1000
    || !Number.isSafeInteger(options.seed) || options.seed > 0xffffffff) throw new Error('Select --run and --out; bootstrap must be 0–1000 and seed unsigned 32-bit.');
  return options;
}
function ordinary(file, directory = false) {
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink() || !(directory ? stat.isDirectory() : stat.isFile())) throw new Error(`Expected an ordinary ${directory ? 'directory' : 'file'}: ${file}.`);
}
function json(file) { ordinary(file); return JSON.parse(fs.readFileSync(file, 'utf8')); }
function recordHash(files, file) { ordinary(file); files.push({ file, sha256: sha(fs.readFileSync(file)) }); }
function noActiveLock(root) {
  if (['.v19-panel.lock', 'run.lock'].some(file => fs.existsSync(path.join(root, file)))) throw new Error('Stop the source panel and its workers before material analysis; existing locks are never removed.');
}
function loadPanel(directory) {
  const root = path.resolve(directory); ordinary(root, true); noActiveLock(root);
  const owner = json(path.join(root, 'panel-runtime.json'));
  if (owner.schemaVersion !== 1 || owner.format !== 'levelup-v19-panel-runtime-owner' || !['level1', 'level2', 'level3'].includes(owner.study)
    || !/^runtime\/[a-z0-9-]+$/.test(owner.directory || '') || !/^[a-f0-9]{64}$/.test(owner.manifestSha256 || '')) throw new Error('An intact version-19 panel ownership receipt is required.');
  const overlay = openResearchOverlay({ directory: path.join(root, owner.directory), manifestSha256: owner.manifestSha256 });
  if (overlay.manifest.name !== 'tier-panels-v19' || overlay.manifest.entryFile !== 'scripts/v19-panels.js') throw new Error('This source belongs to a different experiment; use its original analysis tool.');
  const manifest = json(path.join(root, 'screen.json'));
  const planFile = { 'levelup-v19-tier-panels': 'v19-panel-plan', 'levelup-v19-tier-panels-004': 'v19-panel-current-plan' }[manifest.format];
  if (!planFile) throw new Error('Unsupported version-19 panel declaration; preserve its original runtime.');
  const plan = require(path.join(overlay.directory, 'scripts/balance', planFile));
  const controller = require(overlay.entry);
  controller.validateManifest(manifest, plan, owner.manifestSha256, null);
  controller.validateRoot(root, manifest, plan);
  const inventory = new Map(overlay.manifest.files.map(row => [row.file, row.sha256]));
  if (manifest.identity.rulesBundleSha256 !== inventory.get('dist/balance-rules.cjs')
    || !Array.isArray(manifest.identity.runnerSources)
    || sha(JSON.stringify(manifest.identity.runnerSources)) !== manifest.identity.runnerSha256) throw new Error('Panel identity does not match its owned rules/runner inventory.');
  for (const row of manifest.identity.runnerSources) {
    const file = path.posix.normalize(`scripts/balance/${row.file}`);
    if (inventory.get(file) !== row.sha256) throw new Error('Panel runner source hashes differ from its owned runtime.');
  }
  if (manifest.study !== owner.study || manifest.jobs !== owner.jobs || manifest.initialOpenings !== owner.initialOpenings) throw new Error('Panel ownership and execution declaration disagree.');
  const state = json(path.join(root, 'panel-state.json'));
  if (state.runId !== manifest.runId || !plan.OPENING_TARGETS.includes(state.targetOpenings)) throw new Error('Invalid source panel target state.');
  const files = [{ file: path.join(root, '.v19-panel.lock'), absent: true }, { file: path.join(root, 'run.lock'), absent: true }];
  for (const name of ['panel-runtime.json', 'screen.json', 'panel-state.json']) recordHash(files, path.join(root, name));
  const read = require(path.join(overlay.directory, 'scripts/version17-balance')).readReportInput;
  const stages = [], sourceStages = [];
  let profile;
  for (const descriptor of plan.selectedStages(state.targetOpenings, manifest)) {
    const stageRoot = path.join(root, descriptor.directory);
    if (!fs.existsSync(stageRoot)) { files.push({ file: stageRoot, absent: true }); continue; }
    ordinary(stageRoot, true); noActiveLock(stageRoot);
    files.push({ file: path.join(stageRoot, 'run.lock'), absent: true });
    const runFile = path.join(stageRoot, 'run.json'); if (!fs.existsSync(runFile)) { files.push({ file: runFile, absent: true }); continue; }
    const declaration = plan.getBatchDeclaration(manifest.study, descriptor.batchIndex, descriptor.nodes);
    for (const name of ['run.json', 'games.jsonl', 'v17-preflight.json']) if (fs.existsSync(path.join(stageRoot, name))) ordinary(path.join(stageRoot, name));
    const input = read(stageRoot, declaration);
    for (const key of ['engineSha256', 'runnerSha256', 'runnerSources', 'rulesBundleSha256']) if (!isDeepStrictEqual(input.manifest[key], manifest.identity[key])) throw new Error('A batch changed the original panel runtime identity.');
    if (profile && !isDeepStrictEqual(profile, input.manifest.designProfile)) throw new Error('Cannot fit different actual panel profiles together.');
    profile ||= input.manifest.designProfile;
    for (const name of ['run.json', 'v17-preflight.json', input.manifest.rulesProfiles[0].file]) recordHash(files, path.join(stageRoot, name));
    if (fs.existsSync(path.join(stageRoot, 'games.jsonl'))) recordHash(files, path.join(stageRoot, 'games.jsonl'));
    else files.push({ file: path.join(stageRoot, 'games.jsonl'), absent: true });
    stages.push({ key: descriptor.id, nodes: descriptor.nodes, records: input.records, profile: input.manifest.designProfile,
      comparisons: declaration.metadata.comparisons, identity: { ...manifest.identity, sourceRunId: manifest.runId,
        profileHash: input.manifest.designProfile.hash, registryHash: input.manifest.designProfile.registryHash } });
    sourceStages.push({ ...descriptor, manifest: input.manifest, records: input.records, source: input.source });
  }
  // The owned outcome reporter validates schedule IDs and all journal attempts;
  // this call is pure and does not regenerate anything in the source folder.
  plan.reportStudy({ ...manifest, targetOpenings: state.targetOpenings }, sourceStages);
  if (!profile) {
    const declaration = plan.getBatchDeclaration(manifest.study, 0);
    const registry = require(path.join(overlay.directory, 'scripts/balance/design-registry')).createDesignRegistry(declaration.config);
    profile = require(path.join(overlay.directory, 'scripts/balance/design-profile')).compileDesignProfile(registry, declaration.config.evaluation);
  }
  return { root, overlay, manifest, state, profile, stages, files, roster: plan.candidates(manifest.study),
    openingGroups: Object.fromEntries(plan.BOOK.openings.map(row => [row.id, row.family])) };
}
function validateOutput(run, selected) {
  const source = fs.realpathSync(run), out = path.resolve(selected);
  let existing = out; while (!fs.existsSync(existing)) existing = path.dirname(existing);
  const canonical = path.join(fs.realpathSync(existing), path.relative(existing, out));
  const inside = (parent, child) => child === parent || child.startsWith(parent + path.sep);
  if (inside(source, canonical) || inside(canonical, source)) throw new Error('Material output must be outside and separate from the source panel.');
  if (fs.existsSync(out)) { ordinary(out, true); if (fs.readdirSync(out).length) throw new Error('Material output must be a new or empty directory.'); }
  return out;
}
function verifySource(files) {
  for (const row of files) {
    if (row.absent) { if (fs.existsSync(row.file)) throw new Error('Source files changed during analysis; no output was written.'); continue; }
    ordinary(row.file); if (sha(fs.readFileSync(row.file)) !== row.sha256) throw new Error('Source files changed during analysis; no output was written.');
  }
}
async function main(args = process.argv.slice(2), { log = console.log, load = loadPanel, analyze = analyzeBoardMaterial } = {}) {
  const options = parseArgs(args); if (options.help) { log(HELP); return; }
  const out = validateOutput(options.run, options.out), input = load(options.run);
  const result = await analyze({ stages: input.stages, profile: input.profile, roster: input.roster,
    openingGroups: input.openingGroups, bootstrap: options.bootstrap, seed: options.seed,
    rulesFactory: require(path.join(input.overlay.directory, 'dist/balance-rules.cjs')).createMatchRules,
    onProgress: event => log(typeof event === 'string' ? event : `${event.phase}: ${event.completed}/${event.total}`) });
  noActiveLock(input.root); verifySource(input.files);
  openResearchOverlay({ directory: input.overlay.directory, manifestSha256: input.overlay.manifestSha256 });
  const manifest = { schemaVersion: 1, format: 'levelup-v19-board-material-analysis',
    sourceRunId: input.manifest.runId, sourceStudy: input.manifest.study, targetOpenings: input.state.targetOpenings,
    sourceFormat: input.manifest.format, sourceFiles: input.files, actualProfile: input.profile,
    actualRuntimeIdentity: input.manifest.identity, overlaySha256: input.overlay.manifestSha256,
    analysisSources: ANALYSIS_SOURCES.map(file => ({ file,
      sha256: sha(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n')) })),
    analysisPackageVersion: require('../package.json').version,
    method: result.report.method, exclusions: result.report.exclusions, sourceFilesVerifiedAfterAnalysis: true,
    newGames: 0, engineSearches: 0 };
  const contents = { 'analysis-manifest.json': JSON.stringify(manifest, null, 2) + '\n',
    'material-report.json': JSON.stringify(result.report, null, 2) + '\n', 'material-report.md': renderMaterial(result.report) };
  if (result.dataset) {
    const { samples, ...metadata } = result.dataset;
    contents['dataset.json'] = JSON.stringify(metadata, null, 2) + '\n';
    contents['samples.jsonl'] = samples.map(row => JSON.stringify(row)).join('\n') + (samples.length ? '\n' : '');
  }
  fs.mkdirSync(out, { recursive: true });
  for (const [name, content] of Object.entries(contents)) fs.writeFileSync(path.join(out, name), content, { flag: 'wx' });
  log(`Material report: ${path.join(out, 'material-report.md')}. No engines or new games.`);
  return { ...result, manifest, out };
}
if (require.main === module) main().catch(error => { console.error(`Version 19 material analysis: ${error.message}`); process.exitCode = 1; });
module.exports = { HELP, ANALYSIS_SOURCES, parseArgs, loadPanel, validateOutput, verifySource, main };
