#!/usr/bin/env node
'use strict';

// Standalone reporting only. Do not add this helper to the frozen controller:
// a running 64-case campaign can keep its identity while earlier cases are read.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const panel = require('./level3-panel');
const plan = require('./balance/level3-panel-plan');
const stages = require('./version17-balance');
const { createV17Report } = require('./balance/v17-report');
const { createPanelReport, renderPanelReport } = require('./balance/level3-panel-report');

const FORMAT = 'levelup-level3-panel-subset-snapshot';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const HELP = `Recover an earlier completed opening target without stopping a later run

  npm.cmd run balance:level3:snapshot -- --run DIRECTORY --openings 32 --out NEW_DIRECTORY

Choose 8, 16, 32 or 64 total openings. Reads original selected stage journals,
rules and native proofs; no source lock, file changes, engine games or material
fit. Selected stages must have finalized all games and be inactive. Later stages
can keep running. Output must be a separate new or empty directory outside the
campaign; existing report snapshots are never overwritten.
`;

function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index], name = typeof flag === 'string' && flag.startsWith('--') ? flag.slice(2) : '';
    const value = args[index + 1];
    if (!['run', 'openings', 'out'].includes(name) || Object.hasOwn(options, name) || !value || value.startsWith('--')) throw new Error('Use --run DIRECTORY --openings 8|16|32|64 --out NEW_DIRECTORY.');
    options[name] = value;
  }
  if (!options.run || !options.out || !['8', '16', '32', '64'].includes(options.openings)) throw new Error('Use --run DIRECTORY --openings 8|16|32|64 --out NEW_DIRECTORY.');
  options.openings = Number(options.openings);
  return options;
}

function ordinaryDirectory(directory) {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Use an ordinary directory, not a symbolic link: ${directory}.`);
}
function ordinaryFile(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Expected an ordinary source file: ${file}.`);
  return fs.readFileSync(file);
}
function prospectiveRealPath(selected) {
  let current = path.resolve(selected);
  const suffix = [];
  while (!fs.existsSync(current)) { suffix.unshift(path.basename(current)); current = path.dirname(current); }
  return path.join(fs.realpathSync(current), ...suffix);
}
function contains(parent, child) {
  const relative = path.relative(parent, child);
  return !relative || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
function validateOutput(root, output) {
  const source = fs.realpathSync(root), target = prospectiveRealPath(output);
  if (contains(source, target) || contains(target, source)) throw new Error('Snapshot output must be outside the campaign and cannot contain it.');
  if (fs.existsSync(output)) {
    ordinaryDirectory(output);
    if (fs.readdirSync(output).length) throw new Error('Snapshot output must be new or empty. Existing reports are never overwritten.');
  }
}
function requireInactive(directory) {
  const file = path.join(directory, 'run.lock');
  if (!fs.existsSync(file)) return;
  const owner = JSON.parse(ordinaryFile(file).toString('utf8'));
  if (!Number.isSafeInteger(owner.pid) || owner.pid < 1) throw new Error('Cannot establish selected-stage lock ownership.');
  try { process.kill(owner.pid, 0); }
  catch (error) { if (error.code === 'ESRCH') return; throw error; }
  throw new Error(`Selected stage is still active in process ${owner.pid}; retry after it finishes.`);
}

/** No source files are repaired or changed. The regular reader validates the
 * archived INI and native proof before these records enter the panel report. */
function readCompletedStage(root, descriptor, manifest, { declaration = plan.getBatchDeclaration, readInput = stages.readReportInput } = {}) {
  const directory = path.join(root, descriptor.directory);
  ordinaryDirectory(directory); requireInactive(directory);
  const declared = declaration(descriptor.batchIndex, descriptor.nodes);
  const input = readInput(directory, declared);
  if (input.manifest.parallel?.jobs !== manifest.jobs) throw new Error('A selected stage changed the recorded worker count.');
  for (const field of ['engineSha256', 'rulesBundleSha256', 'runnerSha256', 'runnerSources']) {
    if (!isDeepStrictEqual(input.manifest[field], manifest.runtimeIdentity[field])) throw new Error(`A selected stage changed its campaign ${field} identity.`);
  }
  if (sha(JSON.stringify(declared.config)) !== descriptor.configSha256
    || sha(JSON.stringify(input.manifest.schedule)) !== descriptor.scheduleSha256
    || input.manifest.designProfile.hash !== descriptor.profileHash || input.manifest.designRegistry.hash !== descriptor.registryHash) throw new Error('Selected stage differs from its frozen campaign descriptor.');
  const checked = createV17Report({ ...declared, ...input });
  if (checked.progress.finalizedGames !== descriptor.games) throw new Error(`Selected stage ${descriptor.id} is incomplete; ${checked.progress.finalizedGames}/${descriptor.games} games finalized.`);
  if (input.source.tornTailIgnored) throw new Error('A selected completed stage has an unfinished journal tail; leave repair to the original runner.');
  const runBytes = ordinaryFile(path.join(directory, 'run.json'));
  if (!isDeepStrictEqual(JSON.parse(runBytes.toString('utf8')), input.manifest)) throw new Error('Selected run manifest changed while the snapshot was read; retry.');
  const journal = ordinaryFile(path.join(directory, 'games.jsonl'));
  if (journal.length !== input.source.observedBytes || sha(journal) !== input.source.completePrefixSha256) throw new Error('Selected journal changed while the snapshot was read; retry.');
  const ruleFile = input.manifest.rulesProfiles[0].file;
  if (typeof ruleFile !== 'string' || path.isAbsolute(ruleFile) || ruleFile.includes('\\') || ruleFile.split('/').some(part => ['.', '..', ''].includes(part))) throw new Error('Invalid archived rules path.');
  const rules = ordinaryFile(path.join(directory, ruleFile));
  if (rules.toString('utf8').replace(/\r\n/g, '\n') !== input.manifest.designProfile.config) throw new Error('Selected archived rules changed while the snapshot was read; retry.');
  const preflight = ordinaryFile(path.join(directory, 'v17-preflight.json'));
  if (sha(preflight) !== input.source.nativePreflight.sha256) throw new Error('Selected native proof changed while the snapshot was read; retry.');
  requireInactive(directory);
  const relative = file => path.posix.join(descriptor.directory, file);
  const files = [{ file: relative('run.json'), bytes: runBytes.length, sha256: sha(runBytes) },
    { file: relative('games.jsonl'), bytes: journal.length, sha256: sha(journal) },
    { file: relative(ruleFile), bytes: rules.length, sha256: sha(rules) },
    { file: relative('v17-preflight.json'), bytes: preflight.length, sha256: sha(preflight) }];
  return { key: descriptor.id, nodes: descriptor.nodes, batch: descriptor.batchIndex,
    config: declared.config, metadata: declared.metadata, manifest: input.manifest, records: input.records,
    source: { stageKey: descriptor.id, runId: input.manifest.runId, nativePreflight: input.source.nativePreflight,
      finalizedGames: checked.progress.finalizedGames, scoredPairedGames: checked.progress.pairedGames, files } };
}

function main(args = process.argv.slice(2), { build = plan.buildCampaignPlan, declaration = plan.getBatchDeclaration,
  readInput = stages.readReportInput, log = console.log } = {}) {
  const options = parseArgs(args);
  if (options.help) { log(HELP); return; }
  const root = path.resolve(options.run), output = path.resolve(options.out);
  ordinaryDirectory(root); validateOutput(root, output);
  const manifestBytes = ordinaryFile(path.join(root, panel.MANIFEST));
  const manifest = panel.validateManifest(JSON.parse(manifestBytes.toString('utf8')), build);
  // Reporting uses the campaign's original controller semantics too; no engine
  // executable is opened or needed to compare these source receipts.
  if (!isDeepStrictEqual(manifest.runtimeIdentity.controllerSources, panel.controllerSources())) throw new Error('The saved panel controller differs from this checkout. Use its original compatible sources.');
  let state = { runId: manifest.runId, targetOpenings: manifest.initialOpenings };
  const stateFile = path.join(root, panel.STATE);
  if (fs.existsSync(stateFile)) state = JSON.parse(ordinaryFile(stateFile).toString('utf8'));
  if (state.runId !== manifest.runId || !plan.OPENING_TARGETS.includes(state.targetOpenings)
    || state.targetOpenings < manifest.initialOpenings || options.openings > state.targetOpenings) throw new Error('Requested snapshot is outside the saved campaign target.');
  const selected = plan.selectedStages(options.openings, manifest);
  const selectedStages = selected.map(descriptor => readCompletedStage(root, descriptor, manifest, { declaration, readInput }));
  const report = createPanelReport({ manifest: { ...manifest, targetOpenings: options.openings }, stages: selectedStages, roster: manifest.roster });
  const reportJson = JSON.stringify(report, null, 2) + '\n', markdown = renderPanelReport(report);
  const snapshot = { schemaVersion: 1, format: FORMAT, sourceRunId: manifest.runId,
    sourceDirectory: root, sourceTargetOpeningsAtRead: state.targetOpenings, selectedOpenings: options.openings,
    createdAt: new Date().toISOString(), sourceManifest: { file: panel.MANIFEST, sha256: sha(manifestBytes) },
    stages: selectedStages.map(stage => stage.source),
    reports: [{ file: 'panel-report.json', sha256: sha(reportJson) }, { file: 'panel-report.md', sha256: sha(markdown) }],
    scope: 'Exact selected opening batches, original recorded outcomes and native-preflight receipts. Matchup/sensitivity report only; no material fit, new games, source locks or source changes.' };
  // Recheck source files after analysis. Source evidence is never repaired and
  // the active later-stage aggregate/report is deliberately not read at all.
  for (const stage of selectedStages) for (const file of stage.source.files) {
    if (sha(ordinaryFile(path.join(root, file.file))) !== file.sha256) throw new Error('Selected source changed during analysis; retry. No output written.');
  }
  if (sha(ordinaryFile(path.join(root, panel.MANIFEST))) !== snapshot.sourceManifest.sha256) throw new Error('Campaign manifest changed during analysis; retry. No output written.');
  for (const descriptor of selected) requireInactive(path.join(root, descriptor.directory));
  validateOutput(root, output);
  fs.mkdirSync(output, { recursive: true }); ordinaryDirectory(output); validateOutput(root, output);
  for (const [file, contents] of [['panel-report.json', reportJson], ['panel-report.md', markdown], ['snapshot.json', JSON.stringify(snapshot, null, 2) + '\n']]) {
    fs.writeFileSync(path.join(output, file), contents, { flag: 'wx' });
  }
  log(`Recovered ${options.openings} opening cases at all three budgets: ${report.progress.finalizedGames} finalized games, ${report.progress.pairedGames} scored paired games.`);
  log(`Matchup snapshot: ${path.join(output, 'panel-report.md')}. No games started or source files changed. Material estimates were not fitted.`);
  return { report, snapshot, output };
}

if (require.main === module) { try { main(); } catch (error) { console.error(`Panel snapshot: ${error.message}`); process.exitCode = 1; } }
module.exports = { FORMAT, HELP, parseArgs, validateOutput, requireInactive, readCompletedStage, main };
