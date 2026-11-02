'use strict';

// Exact uploaded outcomes are separate from original execution provenance.
// New design IDs resolve only in a verified research overlay; the live catalog
// and the ongoing complete panel remain unchanged.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { ensureResearchOverlay } = require('./research-overlay');
const { declaredStartFen } = require('./reference-panel-evidence');
const { readPinnedSource } = require('./v17-acceptance-evidence');

const PROJECT = path.resolve(__dirname, '../..');
const ROOT = path.join(PROJECT, 'experiments/balance/results');
const PREFIX = 'v17-nightrider-focus-001';
const BUDGETS = Object.freeze([20000, 40000, 80000]);
const SOURCES = Object.freeze({
  journals: Object.freeze({
    20000: Object.freeze({ archiveFile: `${PREFIX}.n20000.games.jsonl.gz`, archivedSha256: 'd9bb51b391919bd5bb213f587c31f90288f1df7fb731ce566ea0c69a92637dfd', originalName: 'games.jsonl', sha256: 'fc9a7e63a43d87e63994d29c668f6ac632a67379649100797e0228890ced7f4f', bytes: 695141 }),
    40000: Object.freeze({ archiveFile: `${PREFIX}.n40000.games.jsonl.gz`, archivedSha256: 'e057bea154c1db589a056474dfdd133c90adb75991ac8ab758c3d6f3c84b4123', originalName: 'games.jsonl', sha256: 'f6ea08d743b6cd89f6b6b32b2c2c44afd5fd9359dce7ba41ddab01b9abd76563', bytes: 704393 }),
    80000: Object.freeze({ archiveFile: `${PREFIX}.n80000.games.jsonl.gz`, archivedSha256: 'a7050840b201de49a677e4b787d44bdb46f9c4d815f93d6a240ee139bd83179c', originalName: 'games.jsonl', sha256: 'a84e6df530961ef796fdee1e2bf71df5789e7bb2445047dec3b96de7d59c6095', bytes: 720238 }),
  }),
  uploadedReport: Object.freeze({ archiveFile: `${PREFIX}.uploaded-report.md.gz`, archivedSha256: '14b6ef7b2d02251a3db5bb595b39c0edef09906eced44fc0a9b56d60de83562d', originalName: 'focus-report.md', sha256: 'b84851c73479e9f09a81a37fa03e53133769ffc52447a0e8cf1158adbfc5259c', bytes: 10780 }),
});
const PROVENANCE = Object.freeze({
  originalCampaignManifestSupplied: false, originalStageManifestsSupplied: false,
  originalRuntimeReceiptSupplied: false, nativePreflightSupplied: false,
  uploadedReportSupplied: true, engineSha256: null, legalMovesIndependentlyReplayed: false,
  descriptorKind: 'derived declaration compatibility descriptor',
  limitations: Object.freeze([
    'Original focus.json, stage run.json files, archived INI files, runtime ownership/receipt and native-preflight proofs were not supplied. Reconstructed descriptors check declaration compatibility, not original execution provenance.',
    'The current verified research overlay resolves the declared IDs solely for compatibility analysis. It is not asserted to be the original runtime snapshot.',
    'Recorded starting armies, profiles, search/evaluation policies, opening prefixes, move counts and outcome shapes match the declarations. Engine names and profile hashes do not attest the executable or native value tables.',
    'Moves and terminal outcomes were not independently replayed. No searches, new games, material fit, piece Elo or population confidence interval were produced.',
  ]),
});
const sha = value => createHash('sha256').update(value).digest('hex');
const percent = value => value === null ? 'pending' : `${(100 * value).toFixed(2)}%`;
const pp = value => value === null ? 'pending' : (100 * value).toFixed(2);
let tools;
function context() {
  if (!tools) {
    const overlay = ensureResearchOverlay({ root: PROJECT });
    tools = {
      plan: require(path.join(overlay.directory, 'scripts/balance/nightrider-focus-plan')),
      makeSchedule: require(path.join(overlay.directory, 'scripts/balance/plan')).makeSchedule,
      createDesignRegistry: require(path.join(overlay.directory, 'scripts/balance/design-registry')).createDesignRegistry,
      compileDesignProfile: require(path.join(overlay.directory, 'scripts/balance/design-profile')).compileDesignProfile,
    };
  }
  return tools;
}
function validateRecord(record, planned, config, profile) {
  assert.ok(record && planned, 'Unknown scheduled focused game.');
  assert.equal(record.schemaVersion, 1, 'Unexpected recorded schema.');
  assert.equal(record.attempt, 1, 'The upload contains one attempt per game.');
  assert.equal(record.status, 'completed', 'The focus upload contains completed games only.');
  assert.equal(record.repetition, planned.repetition, 'Recorded repetition changed.');
  assert.equal(record.comparisonLabel, planned.comparison.label, 'Recorded comparison label changed.');
  assert.ok(Number.isSafeInteger(record.scheduleIndex) && record.scheduleIndex >= 0 && record.scheduleIndex < 192, 'Invalid worker-local schedule index.');
  const white = record.aColor === 'w' ? planned.comparison.armyA : planned.comparison.armyB;
  const black = record.aColor === 'b' ? planned.comparison.armyA : planned.comparison.armyB;
  assert.equal(record.startFen, declaredStartFen(profile, white, black), 'Recorded starting army changed.');
  assert.equal(record.royalMode, 'king', 'Focused games require ordinary royal kings.');
  assert.equal(record.evaluationCaveat, null, 'Unexpected king-evaluation caveat.');
  assert.deepEqual(record.engineNames, { w: 'Fairy-Stockfish 230826', b: 'Fairy-Stockfish 230826' }, 'Recorded engine names changed.');
  assert.ok(Array.isArray(record.moves) && record.moves.every(move => typeof move === 'string'), 'Moves must be strings.');
  assert.ok(Array.isArray(record.sans) && record.sans.length === record.moves.length, 'SAN and UCI counts differ.');
  assert.ok(Array.isArray(record.openingMoves), 'Recorded opening moves must be an array.');
  assert.equal(record.totalPlies, record.moves.length, 'Recorded total ply count changed.');
  assert.equal(record.openingPlies, record.openingMoves.length, 'Recorded opening ply count changed.');
  assert.equal(record.playedPlies + record.openingPlies, record.totalPlies, 'Recorded played/opening counts differ.');
  assert.deepEqual(record.moves.slice(0, record.openingPlies), record.openingMoves, 'Recorded history does not begin with its prefix.');
  assert.ok(record.totalPlies <= config.engine.maxPlies, 'A game exceeds the move limit.');
  assert.ok(['checkmate', 'insufficient-material', 'threefold-repetition', 'fifty-move-rule', 'stalemate'].includes(record.reason), 'Unexpected terminal reason.');
  assert.ok(['1-0', '0-1', '1/2-1/2'].includes(record.result), 'A completed game lacks a scored result.');
  assert.equal(record.result === '1/2-1/2', record.reason !== 'checkmate', 'Recorded result and terminal reason disagree.');
  assert.equal(typeof record.finalFen, 'string', 'Recorded final FEN is missing.');
  const final = record.finalFen.split(' ');
  assert.equal(final.length, 6, 'Final FEN has an unexpected shape.');
  assert.equal(final[1], record.totalPlies % 2 ? 'b' : 'w', 'Final turn disagrees with ply count.');
  assert.equal(Number(final[5]), Math.floor(record.totalPlies / 2) + 1, 'Final fullmove count disagrees with ply count.');
  if (record.reason === 'checkmate') assert.equal(record.result, final[1] === 'w' ? '0-1' : '1-0', 'Recorded mate winner disagrees with the final turn.');
}

function analyzeFocusStages(inputs, uploadedReport, { requireComplete = true } = {}) {
  assert.ok(Array.isArray(inputs), 'Declare the original focused journals.');
  assert.equal(new Set(inputs.map(row => row.nodes)).size, inputs.length, 'Duplicate node-budget source.');
  if (requireComplete) assert.deepEqual(inputs.map(row => row.nodes).sort((a, b) => a - b), BUDGETS, 'All three focused budgets are required.');
  const { plan, makeSchedule, createDesignRegistry, compileDesignProfile } = context();
  const stages = inputs.map(input => {
    assert.ok(BUDGETS.includes(input.nodes) && Array.isArray(input.records), 'Unknown node budget or missing journal.');
    const declaration = plan.loadExperiment(input.nodes), { config } = declaration, schedule = makeSchedule(config);
    const registry = createDesignRegistry(config), profile = compileDesignProfile(registry, config.evaluation);
    assert.equal(schedule.length, 192);
    if (requireComplete) assert.equal(input.records.length, 192, 'A focused budget is incomplete.');
    assert.equal(new Set(input.records.map(row => row.id)).size, input.records.length, 'Duplicate focused game identity.');
    const byId = new Map(schedule.map(row => [row.id, row]));
    for (const record of input.records) validateRecord(record, byId.get(record.id), config, profile);
    const manifest = { config, schedule, designRegistry: registry, designProfile: profile };
    return { nodes: input.nodes, config, metadata: declaration.metadata, records: input.records, registry, profile, manifest,
      declaration: { configSha256: sha(JSON.stringify(config)), metadataSha256: sha(JSON.stringify(declaration.metadata)),
        scheduleSha256: sha(JSON.stringify(schedule)), registryHash: registry.hash, profileHash: profile.hash,
        scheduledGames: 192, descriptorKind: PROVENANCE.descriptorKind } };
  }).sort((a, b) => a.nodes - b.nodes);
  const report = plan.reportStudy({ runId: null }, stages);
  for (const entry of report.reports) {
    if (requireComplete) {
      assert.equal(entry.report.progress.completedGames, 192);
      assert.equal(entry.report.progress.pairedGames, 192);
      assert.equal(entry.report.progress.completePairs, 96);
    }
    assert.equal(entry.report.progress.duplicateCopiesIgnored, 0);
  }
  assert.equal(new Set(stages.map(stage => stage.profile.hash)).size, 1, 'Focused node budgets changed the common movement/value profile.');
  const prior = stages[0]?.metadata.evaluationAudit.sharedNightriderValue;
  assert.deepEqual(prior, { mg: 2326, eg: 2211 }, 'The shared N0 search prior changed.');
  if (uploadedReport !== undefined) assert.equal(plan.renderReport(report), uploadedReport, 'Reconstructed focused report differs from the exact upload.');
  return { stages, report, sharedNightriderValue: prior,
    declaration: { reportReproducedExactly: uploadedReport !== undefined, descriptorKind: PROVENANCE.descriptorKind },
    provenance: PROVENANCE };
}
function loadFocusEvidence({ readArchive } = {}) {
  const inputs = BUDGETS.map(nodes => {
    const bytes = readPinnedSource(SOURCES.journals[nodes], readArchive);
    assert.equal(bytes.at(-1), 10, 'Every exact focused journal must end in a complete newline.');
    return { nodes, records: bytes.toString('utf8').slice(0, -1).split('\n').map(JSON.parse) };
  });
  const uploaded = readPinnedSource(SOURCES.uploadedReport, readArchive);
  return { ...analyzeFocusStages(inputs, uploaded.toString('utf8')), sources: SOURCES };
}
function buildFocusAudit() {
  const input = loadFocusEvidence();
  return { schemaVersion: 1, format: 'levelup-v17-nightrider-focus-upload-evidence', recordedDate: '2026-11-02',
    sources: SOURCES, provenance: PROVENANCE, declaration: input.declaration,
    counts: { uploadedGames: 576, completedGames: 576, pairedGames: 576, completePairs: 288,
      truncatedGames: 0, errors: 0, retries: 0, newMatchGames: 0, engineSearches: 0 },
    sharedNightriderValue: input.sharedNightriderValue,
    stages: input.stages.map(stage => ({ nodes: stage.nodes, declaration: stage.declaration,
      engine: stage.config.engine, evaluation: stage.config.evaluation,
      evaluationAudit: stage.metadata.evaluationAudit, openings: stage.config.openings,
      definitions: stage.registry.definitions, recordedEngineNames: stage.records[0].engineNames,
      source: SOURCES.journals[stage.nodes] })), report: input.report,
    limitations: [...PROVENANCE.limitations,
      'Each row has 64 physical games from eight opening cases, four fixed opponents and both colors. Games sharing prefixes and color swaps are dependent; a physical game count is not an independent-opening count.',
      'Matched control gains and percentile ranges condition on eight fixed holdout cases and the shared search prior. They do not establish universal material balance or optimal engine valuation.',
      'The four-reference focused basket differs from the nine-opponent full roster panel. Its fresh control is the relevant within-study baseline.',
    ] };
}
function renderFocusAudit(audit) {
  const lines = ['# Nightrider capture-step evidence', '',
    'All 576 scheduled games completed on attempt 1: three budgets of 192 games, 288 complete color pairs, no truncations, errors or retries. The uploaded focus report reproduces byte-for-byte. No old panel games are included.', '',
    '| Nodes | Original N0 | Diagonal captures N0cF | Orthogonal captures N0cW |',
    '| ---: | ---: | ---: | ---: |'];
  for (const entry of audit.report.reports) lines.push(`| ${entry.nodes} | ${entry.report.overall.rows.map(row => percent(row.score)).join(' | ')} |`);
  lines.push('', '| Nodes | Revision | Matched cases | Gain over N0 (pp) | Conditional 95% range (pp) |',
    '| ---: | --- | ---: | ---: | --- |', ...audit.report.gains.map(row => `| ${row.nodes} | ${row.label} | ${row.sharedOpenings}/8 | ${pp(row.difference)} | ${pp(row.conditionalRange.lower)} to ${pp(row.conditionalRange.upper)} |`), '',
    'Every body retains applied MG/EG 2326/2211 and the four reference priors. Eight held-out prefixes, both colors and all four opponents are shared across 20k/40k/80k conditions. Each body/budget has 64 games; each individual opponent cell has 16. The source report ranges resample whole opening cases.', '',
    'The diagonal version scores 53.91%, 51.56% and 67.97%; the fresh control scores 41.41%, 45.31% and 44.53%. The orthogonal version scores 73.44%, 70.31% and 76.56%. These recorded differences motivate matched cross-budget analysis and replication; they do not by themselves separate sampling variation from a persistent search-budget interaction.', '',
    '## Provenance and reproduction', '', ...audit.limitations.map(note => `- ${note}`), '',
    'Exact journals and the report are retained as deterministic gzip with archive and original-byte SHA-256 pins. The compact audit keeps the declarations, profile/registry hashes, search/value policies, definitions, complete outcome tables and original conditional ranges.', '',
    'Run `node scripts/balance/v17-nightrider-focus-evidence.js` to verify; `--write` regenerates only the derived artifacts. No engine, game or original catalog change is involved.', '');
  return lines.join('\n');
}
function main(args = process.argv.slice(2)) {
  assert.ok(!args.length || args.length === 1 && args[0] === '--write', 'Use no arguments or --write.');
  const audit = buildFocusAudit(), input = loadFocusEvidence(), { plan } = context();
  const artifacts = [[`${PREFIX}.audit.json`, JSON.stringify(audit) + '\n'], [`${PREFIX}.report.md`, renderFocusAudit(audit)],
    [`${PREFIX}.original-report.md`, plan.renderReport(input.report)]];
  for (const [name, content] of artifacts) {
    const file = path.join(ROOT, name);
    if (args.length) fs.writeFileSync(file, content);
    else assert.equal(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), content, `Derived artifact changed: ${name}.`);
  }
  console.log('Nightrider focus uploads verified: 576 completed games, 288 scored pairs; no searches or new games.');
  return audit;
}
if (require.main === module) { try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; } }
module.exports = { PREFIX, BUDGETS, SOURCES, PROVENANCE, analyzeFocusStages, loadFocusEvidence, buildFocusAudit, renderFocusAudit, main };
