#!/usr/bin/env node
'use strict';

// Offline outcome analysis. No engine, board replay, material fit or active-run
// mutation. Compact paired scores can be reused without the full game journals.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const panel = require('./level3-panel');
const plan = require('./balance/level3-panel-plan');
const snapshot = require('./level3-panel-snapshot');
const { createV17Report } = require('./balance/v17-report');
const { normalizeInput, analyzeColorMatchups, renderColorReport } = require('./analysis/panel-colors');
const { analyzeExclusions, renderExclusionReport } = require('./analysis/panel-exclusions');

const FORMAT = 'levelup-panel-paired-outcomes';
const REPORT_FORMAT = 'levelup-panel-color-and-exclusion-analysis';
const DISPLAY_NAMES = Object.freeze({ 'queen-pawn': 'Herald', 'vertical-bishop': 'Inquisitor',
  'rook-pawn': 'Ranger', 'ranged-rook': 'Cataphract', 'xray-queen': 'Wraith', cruisader: 'Crusader' });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const score = record => record.result === '1/2-1/2' ? 0.5 : Number((record.result === '1-0') === (record.aColor === 'w'));
const HELP = `Panel color fairness and roster exclusions, using existing outcomes only

  npm.cmd run balance:panel:insights -- --run DIRECTORY --out NEW_DIRECTORY
       [--openings 8|16|32|64] [--exclude Wraith,Cataphract]
  npm.cmd run balance:panel:insights -- --input paired-outcomes.json --out NEW_DIRECTORY
       [--exclude Wraith,Cataphract]

--run reads finished original stage journals and recorded native proofs.
The default opening total is the campaign's saved target. Earlier finished totals
can be read while later stages continue. Run after material analysis if desired;
no games, searches or material fitting are performed.
--input reuses the compact paired-outcome export, also suitable for cloud analysis.
Exclusions accept current names, original names, keys or exact design IDs.
Reports include per-matchup White/Black scores, full and leave-one-out standings,
and optional combined exclusions. Both colors must be scored; draws count half.
Output is separate and never replaces existing campaign or analysis files.
`;

function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]?.startsWith('--') ? args[index].slice(2) : '';
    const value = args[index + 1];
    if (!['run', 'input', 'out', 'openings', 'exclude'].includes(key) || Object.hasOwn(options, key) || !value || value.startsWith('--')) throw new Error('Unknown, repeated or incomplete option. Use --help.');
    options[key] = value;
  }
  if (Boolean(options.run) === Boolean(options.input) || !options.out) throw new Error('Select --run DIRECTORY or --input FILE, plus --out NEW_DIRECTORY.');
  if (options.openings !== undefined && (!options.run || !['8', '16', '32', '64'].includes(options.openings))) throw new Error('--openings 8|16|32|64 applies only to --run.');
  if (options.openings !== undefined) options.openings = Number(options.openings);
  options.exclude = options.exclude === undefined ? [] : options.exclude.split(',').map(value => value.trim());
  if (options.exclude.some(value => !value)) throw new Error('List nonempty piece names separated by commas.');
  return options;
}

function resolveExclusions(roster, names) {
  const normalize = value => value.trim().toLowerCase().replace(/[\s_]+/g, '-');
  const lookup = new Map();
  for (const row of roster) for (const value of [row.key, row.id, row.label, row.name, row.sourceLabel, DISPLAY_NAMES[row.key]]) {
    if (!value) continue;
    const key = normalize(value), previous = lookup.get(key);
    if (previous && previous !== row.key) throw new Error(`Ambiguous roster alias: ${value}.`);
    lookup.set(key, row.key);
  }
  const keys = names.map(value => {
    const key = lookup.get(normalize(value));
    if (!key) throw new Error(`Unknown roster piece: ${value}. Use a recorded design name, key or ID.`);
    return key;
  });
  if (new Set(keys).size !== keys.length) throw new Error('The same excluded piece was named more than once.');
  if (keys.length && roster.length - keys.length < 2) throw new Error('Keep at least two pieces in the selected roster.');
  return keys;
}

/** Validate full original outcome context before discarding moves/SAN. */
function projectStage(stage) {
  const validated = createV17Report({ experiment: stage.key, config: stage.config, metadata: stage.metadata,
    manifest: stage.manifest, records: stage.records });
  const metadata = new Map(stage.metadata.comparisons.map(row => [row.id, row]));
  const latest = new Map(), grouped = new Map();
  for (const row of stage.records) if (!latest.has(row.id) || row.attempt > latest.get(row.id).attempt) latest.set(row.id, row);
  for (const row of latest.values()) {
    const pair = grouped.get(row.pairId) || []; pair.push(row); grouped.set(row.pairId, pair);
  }
  const pairs = [];
  let ordinaryPairs = 0;
  for (const records of grouped.values()) {
    if (records.length !== 2 || records.some(row => row.status !== 'completed') || records[0].aColor === records[1].aColor) continue;
    const aWhite = records.find(row => row.aColor === 'w'), aBlack = records.find(row => row.aColor === 'b');
    const comparison = metadata.get(aWhite.comparisonId);
    if (comparison.kind === 'baseline') { ordinaryPairs++; continue; }
    if (comparison.kind !== 'head') throw new Error('Only declared head-to-head comparisons may enter panel insights.');
    pairs.push({ stageKey: stage.key, nodes: stage.nodes, openingId: aWhite.openingId, comparisonId: comparison.id,
      kind: 'head', aKey: comparison.aKey, bKey: comparison.bKey, aId: comparison.designA, bId: comparison.designB,
      aWhite: score(aWhite), aBlack: score(aBlack), whiteGameId: aWhite.id, blackGameId: aBlack.id });
  }
  return { pairs, coverage: { finalizedGames: validated.progress.finalizedGames,
    scoredPairedGames: validated.progress.pairedGames, headPairs: pairs.length, ordinaryPairsExcluded: ordinaryPairs,
    finalizedRecordsOutsideScoredPairs: validated.progress.finalizedGames - validated.progress.pairedGames,
    copiedAttemptsIgnored: validated.progress.duplicateCopiesIgnored } };
}

function seal(payload) { return { ...payload, payloadSha256: sha(JSON.stringify(payload)) }; }
function validateCompact(value) {
  const { payloadSha256, ...payload } = value || {};
  if (payload.schemaVersion !== 1 || payload.format !== FORMAT || payloadSha256 !== sha(JSON.stringify(payload))
    || !payload.source || typeof payload.source.sourceRunId !== 'string' || !payload.source.sourceRunId.trim()
    || !plan.OPENING_TARGETS.includes(payload.source.selectedOpenings)
    || !Array.isArray(payload.roster) || !Array.isArray(payload.cohorts)
    || !isDeepStrictEqual(payload.cohorts.map(row => row.nodes), plan.NODE_BUDGETS)) throw new Error('Expected an intact paired-outcomes.json export.');
  for (const cohort of payload.cohorts) {
    if (!Array.isArray(cohort.openingIds) || cohort.openingIds.length !== payload.source.selectedOpenings
      || !isDeepStrictEqual(cohort.openingIds, payload.cohorts[0].openingIds)
      || !Array.isArray(cohort.pairs) || cohort.pairs.some(row => row?.kind !== 'head' || row.nodes !== cohort.nodes)) {
      throw new Error('Compact cohorts must keep the same declared opening cases and contain only their own head-to-head node budget.');
    }
    normalizeInput({ roster: payload.roster, ...cohort });
  }
  return value;
}
function readCompact(file) { return validateCompact(json(file)); }

function collectRun(directory, openings, { build = plan.buildCampaignPlan, declaration = plan.getBatchDeclaration,
  readInput = require('./version17-balance').readReportInput } = {}) {
  const root = path.resolve(directory);
  const stat = fs.lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Read an ordinary campaign directory.');
  const bytes = fs.readFileSync(path.join(root, panel.MANIFEST));
  const manifest = panel.validateManifest(JSON.parse(bytes.toString('utf8')), build);
  if (!isDeepStrictEqual(manifest.runtimeIdentity.controllerSources, panel.controllerSources())) throw new Error('Use the original compatible panel controller sources.');
  const stateFile = path.join(root, panel.STATE);
  const state = fs.existsSync(stateFile) ? json(stateFile) : { runId: manifest.runId, targetOpenings: manifest.initialOpenings };
  const selectedOpenings = openings ?? state.targetOpenings;
  if (state.runId !== manifest.runId || !plan.OPENING_TARGETS.includes(state.targetOpenings) || state.targetOpenings < manifest.initialOpenings
    || !plan.OPENING_TARGETS.includes(selectedOpenings) || selectedOpenings > state.targetOpenings) throw new Error('Select an opening total within the saved campaign target.');
  const roster = manifest.roster.map(row => ({ key: row.key, id: row.id, label: DISPLAY_NAMES[row.key] || row.label || row.name,
    sourceLabel: row.label || row.name, family: row.family, movement: row.movement, officialReference: row.officialReference }));
  const cohorts = plan.NODE_BUDGETS.map(nodes => ({ nodes, openingIds: [], pairs: [] })), receipts = [];
  for (const descriptor of plan.selectedStages(selectedOpenings, manifest)) {
    const stage = snapshot.readCompletedStage(root, descriptor, manifest, { declaration, readInput });
    const projected = projectStage(stage), cohort = cohorts.find(row => row.nodes === descriptor.nodes);
    cohort.openingIds.push(...stage.config.openings.map(row => row.id));
    cohort.pairs.push(...projected.pairs);
    receipts.push({ ...stage.source, profileHash: stage.manifest.designProfile.hash,
      registryHash: stage.manifest.designRegistry.hash, coverage: projected.coverage });
    // The full per-stage move histories are no longer retained by this loader.
  }
  const payload = seal({ schemaVersion: 1, format: FORMAT,
    source: { basis: 'Validated original completed stage journals and recorded proofs; outcomes only, no independent legal replay.',
      sourceRunId: manifest.runId, sourceDirectory: root, sourceTargetOpeningsAtRead: state.targetOpenings,
      selectedOpenings, manifestSha256: sha(bytes), collectedAt: new Date().toISOString(), stages: receipts }, roster, cohorts });
  return validateCompact(payload);
}

function recheckSources(payload) {
  const source = payload.source;
  if (sha(fs.readFileSync(path.join(source.sourceDirectory, panel.MANIFEST))) !== source.manifestSha256) throw new Error('Campaign manifest changed during analysis; retry. No output written.');
  for (const stage of source.stages) for (const file of stage.files) {
    if (sha(fs.readFileSync(path.join(source.sourceDirectory, file.file))) !== file.sha256) throw new Error('Selected stage data changed during analysis; retry. No output written.');
  }
  for (const stage of source.stages) snapshot.requireInactive(path.join(source.sourceDirectory, stage.stageKey));
}

function analyze(payload, names = []) {
  validateCompact(payload);
  const exclude = resolveExclusions(payload.roster, names);
  return { schemaVersion: 1, format: REPORT_FORMAT, sourceRunId: payload.source.sourceRunId,
    selectedOpenings: payload.source.selectedOpenings, sourcePayloadSha256: payload.payloadSha256,
    excludedKeys: exclude, roster: payload.roster,
    budgets: payload.cohorts.map(cohort => ({ nodes: cohort.nodes,
      colors: analyzeColorMatchups({ roster: payload.roster, ...cohort }),
      exclusions: analyzeExclusions({ roster: payload.roster, ...cohort, exclude }) })),
    interpretation: 'Existing scored color pairs only. Exclusions change the opponent basket, not games, movement or fitted material values. Reading a compact export checks its integrity but does not re-attest its original engine or source files.' };
}

function main(args = process.argv.slice(2), { loadRun = collectRun, log = console.log } = {}) {
  const options = parseArgs(args);
  if (options.help) { log(HELP); return; }
  const source = path.resolve(options.run || path.dirname(options.input)), output = path.resolve(options.out);
  snapshot.validateOutput(source, output);
  const inputBytes = options.input ? fs.readFileSync(options.input) : null;
  const payload = options.input ? validateCompact(JSON.parse(inputBytes.toString('utf8'))) : loadRun(options.run, options.openings);
  const report = analyze(payload, options.exclude);
  const colors = ['# Panel color fairness', '', 'Scores use observed games with both color partners completed. Ordinary-army anchors are excluded. Exclusion scenarios are reported separately.', '',
    ...report.budgets.map(row => renderColorReport(row.colors)), ''].join('\n');
  const exclusions = ['# Panel roster exclusions', '', 'Every scenario reuses observed results. No games, engine searches or material models are rerun.', '',
    ...report.budgets.map(row => renderExclusionReport(row.exclusions)), ''].join('\n');
  if (options.run) recheckSources(payload);
  else if (!fs.readFileSync(options.input).equals(inputBytes)) throw new Error('Compact input changed during analysis; retry. No output written.');
  snapshot.validateOutput(source, output);
  fs.mkdirSync(output, { recursive: true }); snapshot.validateOutput(source, output);
  for (const [file, contents] of [['paired-outcomes.json', JSON.stringify(payload) + '\n'], ['analysis.json', JSON.stringify(report) + '\n'],
    ['color-report.md', colors], ['exclusion-report.md', exclusions]]) fs.writeFileSync(path.join(output, file), contents, { flag: 'wx' });
  log(`Color and exclusion analysis: ${output}. Reused ${payload.cohorts.reduce((sum, row) => sum + row.pairs.length, 0)} scored head-to-head pairs.`);
  log('No games or material fits started; original files unchanged. Reuse paired-outcomes.json for later exclusions or cloud analysis.');
  return { payload, report, output };
}

if (require.main === module) { try { main(); } catch (error) { console.error(`Panel insights: ${error.message}`); process.exitCode = 1; } }
module.exports = { FORMAT, REPORT_FORMAT, DISPLAY_NAMES, HELP, parseArgs, resolveExclusions, projectStage,
  seal, validateCompact, readCompact, collectRun, recheckSources, analyze, main };
