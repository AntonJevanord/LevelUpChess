'use strict';

// Exact user uploads. Reconstructed declarations prove compatibility only;
// they are never presented as original run manifests or native proofs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const { createHash } = require('node:crypto');
const { loadExperiment } = require('./v17-plan');
const { makeSchedule } = require('./plan');
const { createDesignRegistry } = require('./design-registry');
const { compileDesignProfile } = require('./design-profile');
const { createV17Report, renderV17Report } = require('./v17-report');
const { deployDesignArmies } = require('../../src/design-deployment');
const { placementFromMap } = require('../../src/profile-fen');
const { buildReferencePanel, matrixFor, renderReferencePanel, renderReferencePanelCsv } = require('./reference-panel-report');
const { loadScreenEvidence } = require('./v17-screen-evidence');

const ROOT = path.resolve(__dirname, '../../experiments/balance/results');
const PREFIX = 'reference-panel-v17-002';
const EXPERIMENTS = Object.freeze({ gap: 'panel-gap', singles: 'panel-level1', pairs: 'panel-level1-pairs' });
const COUNTS = Object.freeze({ gap: 64, singles: 192, pairs: 960 });
const SOURCES = {
  gap: {
    journal: { archiveFile: `${PREFIX}.gap.games.jsonl.gz`, archivedSha256: '15184447bc355a1d7d8ca5c315f6fb0956d2746e545166f589c5936e79b301a0', originalName: 'games.jsonl', sha256: '752fec69d88a61b48c6b1614c60b5c1a5f0ed3c3de13a49a649ccb82f5845ead', bytes: 245877 },
    uploadedReport: { archiveFile: `${PREFIX}.gap.uploaded-report.md.gz`, archivedSha256: '27eb02c665a99c22a0fe604e94aa7dbceff46ef792183cac954dbeb262ac82d2', originalName: 'v17-report.md', sha256: 'ba5cb25ab3d3a9d953e7a61e7bb86bd6490aee1499a5f2bd6fb06d5149bc3cd3', bytes: 2149 },
  },
  singles: {
    journal: { archiveFile: `${PREFIX}.singles.games.jsonl.gz`, archivedSha256: '50d7c90e8c61f7cc993e89e55f040241576b5230d2e2e30f930a6f5a01b7dbc8', originalName: 'games.jsonl', sha256: 'c90be49515a92979ef4e4f38deaf41b39c6a422a7f44944f704ba4e434680bb7', bytes: 685765 },
    uploadedReport: { archiveFile: `${PREFIX}.singles.uploaded-report.md.gz`, archivedSha256: 'b36f1bd9d701e4d8235ce024a2908e95d4cb519f231a441045b3cb597dcfc844', originalName: 'v17-report.md', sha256: 'f20a3ee838b24cb27c2e4f786b25fee90bc812c5b112ca968eea0899ad06b097', bytes: 2319 },
  },
  pairs: {
    journal: { archiveFile: `${PREFIX}.pairs.games.jsonl.gz`, archivedSha256: 'e99c92e7c9909e07adb76bf268052f9b6ea77ab7f619861009456109ff149169', originalName: 'games.jsonl', sha256: 'ffe55e4c7a4413a0230b53f429d8d96d8ccd7e1d214a382175bcbff8efd4e60d', bytes: 3622187 },
    uploadedReport: { archiveFile: `${PREFIX}.pairs.uploaded-report.md.gz`, archivedSha256: '754d0e804f87649a612aca3bf6dd9b0285dd2495c8476bba37e464e7b05ff60a', originalName: 'v17-report.md', sha256: '2b3ca4cafc29a60addaa098ce8a7c0b37963faf638006d24db17df235519ddf5', bytes: 4695 },
  },
};
for (const source of Object.values(SOURCES)) { Object.values(source).forEach(Object.freeze); Object.freeze(source); }
Object.freeze(SOURCES);
const PROVENANCE = Object.freeze({ originalManifestSupplied: false, nativePreflightSupplied: false,
  uploadedReportSupplied: true, engineSha256: null, legalMovesIndependentlyReplayed: false,
  descriptorKind: 'derived declaration compatibility descriptor',
  limitations: Object.freeze([
    'Original run.json, archived INI files and v17-preflight.json were not supplied. Reconstructed settings and profiles are compatibility checks, not original run provenance.',
    'All recorded identities, starts, opening prefixes, search settings and outcome summaries match the declared protocols; recorded engine names do not attest to the executable or native material tables.',
    'Moves and terminal positions are not independently replayed. No new games, material fit, Elo or population confidence interval is produced.',
  ]) });
const sha = value => createHash('sha256').update(value).digest('hex');

function readPinnedSource(pin, read = file => fs.readFileSync(file)) {
  const archived = read(path.join(ROOT, pin.archiveFile));
  assert.equal(sha(archived), pin.archivedSha256, `Archive changed: ${pin.archiveFile}.`);
  const bytes = gunzipSync(archived);
  assert.equal(bytes.length, pin.bytes, `Original byte count changed: ${pin.archiveFile}.`);
  assert.equal(sha(bytes), pin.sha256, `Original bytes changed: ${pin.archiveFile}.`);
  return bytes;
}

function declaredStartFen(profile, white, black) {
  const selected = new Map(profile.registry.allocations.map(({ id, letter }) => [id,
    { letter, definition: profile.definitionsByLetter[letter] }]));
  const army = input => ({ choices: Object.entries(input.upgrades || {}).map(([square, id]) => ({ square, ...selected.get(id) })),
    remove: input.remove || [], reserve: (input.reserve || []).map(({ id, count }) => ({ ...selected.get(id), count })) });
  const pieces = deployDesignArmies(profile, army(white), army(black));
  const rights = [['K', 'h1'], ['Q', 'a1'], ['k', 'h8'], ['q', 'a8']]
    .filter(([, square]) => profile.roles.castlingRooks.includes(pieces.get(square)?.toLowerCase()))
    .map(([right]) => right).join('') || '-';
  return placementFromMap(pieces) + ` w ${rights} - 0 1`;
}

function analyzePanelRecords(name, records, uploadedReport) {
  assert.ok(Object.hasOwn(EXPERIMENTS, name), 'Choose gap, singles or pairs.');
  assert.ok(Array.isArray(records), 'Panel journal must be an array.');
  const declaration = loadExperiment(EXPERIMENTS[name]), { config } = declaration;
  const schedule = makeSchedule(config), registry = createDesignRegistry(config);
  const profile = compileDesignProfile(registry, config.evaluation);
  assert.equal(schedule.length, COUNTS[name]);
  assert.equal(records.length, schedule.length, 'The uploaded panel must contain every scheduled game exactly once.');
  assert.equal(new Set(records.map(record => record.id)).size, records.length, 'The uploaded panel repeats a game identity.');
  const byId = new Map(schedule.map(game => [game.id, game]));
  for (const record of records) {
    const planned = byId.get(record.id);
    assert.ok(planned, 'The uploaded panel contains an unknown scheduled game.');
    assert.equal(record.schemaVersion, 1, 'Unexpected recorded schema.');
    assert.equal(record.attempt, 1, 'The uploaded panel contains one attempt per game.');
    assert.equal(record.status, 'completed', 'The uploaded panel contains only completed games.');
    assert.equal(record.repetition, planned.repetition, 'Recorded repetition changed.');
    assert.equal(record.comparisonLabel, planned.comparison.label, 'Recorded comparison label changed.');
    assert.ok(Number.isSafeInteger(record.scheduleIndex) && record.scheduleIndex >= 0 && record.scheduleIndex < schedule.length,
      'Invalid worker-local schedule index.');
    const white = record.aColor === 'w' ? planned.comparison.armyA : planned.comparison.armyB;
    const black = record.aColor === 'b' ? planned.comparison.armyA : planned.comparison.armyB;
    assert.equal(record.startFen, declaredStartFen(profile, white, black), 'Recorded starting army changed.');
    assert.equal(record.royalMode, 'king', 'The uploaded panel requires ordinary royal kings.');
    assert.equal(record.evaluationCaveat, null, 'Unexpected king-evaluation caveat.');
    assert.ok(Array.isArray(record.moves) && record.moves.every(move => typeof move === 'string'), 'Recorded moves must be strings.');
    assert.ok(Array.isArray(record.sans) && record.sans.length === record.moves.length, 'Recorded SAN and UCI counts differ.');
    assert.equal(record.totalPlies, record.moves.length, 'Recorded total ply count changed.');
    assert.equal(record.openingPlies, record.openingMoves.length, 'Recorded opening ply count changed.');
    assert.equal(record.playedPlies + record.openingPlies, record.totalPlies, 'Recorded played/opening ply counts differ.');
    assert.deepEqual(record.moves.slice(0, record.openingPlies), record.openingMoves, 'Recorded moves do not start with the declared prefix.');
    assert.ok(record.totalPlies <= config.engine.maxPlies, 'A completed game exceeds the move limit.');
    assert.ok(['checkmate', 'insufficient-material', 'threefold-repetition', 'fifty-move-rule', 'stalemate'].includes(record.reason),
      'Unexpected terminal reason.');
    assert.equal(record.result === '1/2-1/2', record.reason !== 'checkmate', 'Recorded result and terminal reason disagree.');
  }
  // This descriptor is generated now solely to compare recorded context with
  // the declaration. It is not passed to the original-run input validator.
  const derivedDescriptor = { config, schedule, designRegistry: registry, designProfile: profile };
  const report = createV17Report({ ...declaration, records, manifest: derivedDescriptor });
  assert.equal(report.progress.completedGames, schedule.length);
  assert.equal(report.progress.pairedGames, schedule.length);
  assert.equal(report.progress.duplicateCopiesIgnored, 0);
  if (uploadedReport !== undefined) assert.equal(renderV17Report(report), uploadedReport,
    'Reconstructed outcome report differs from the exact uploaded report.');
  return { name, ...declaration, records, registry, profile, report,
    declaration: { configSha256: sha(JSON.stringify(config)), registryHash: registry.hash, profileHash: profile.hash,
      scheduleSha256: sha(JSON.stringify(schedule)), scheduledGames: schedule.length,
      descriptorKind: PROVENANCE.descriptorKind, reportReproducedExactly: uploadedReport !== undefined } };
}

function loadPanelEvidence(name, { readArchive } = {}) {
  const source = SOURCES[name];
  assert.ok(source, 'Choose gap, singles or pairs.');
  const journal = readPinnedSource(source.journal, readArchive);
  const uploadedReport = readPinnedSource(source.uploadedReport, readArchive).toString('utf8');
  assert.equal(journal.at(-1), 10, 'The exact uploaded journal must end with a complete newline.');
  const records = journal.toString('utf8').slice(0, -1).split('\n').map(JSON.parse);
  return { ...analyzePanelRecords(name, records, uploadedReport), source, provenance: PROVENANCE };
}

function historicalPawnReview() {
  const evidence = loadScreenEvidence('pawn-grants');
  return { source: evidence.source, declaration: evidence.declaration, provenance: evidence.provenance,
    scope: 'Three identical one-point pawns versus one frozen level-three upgrade; eight short prefixes, both colors, 64 reference games per pawn design.',
    returningPawn: { designId: 'pawn.blue@3', movement: 'bmWfmW2fceF',
      ...evidence.aggregates.find(row => row.key === 'returning-pawns') },
    bishopPawn: { designId: 'pawn.blue@2', movement: 'fmWfeFifmnD',
      ...evidence.aggregates.find(row => row.key === 'bishop-pawns') },
    interpretation: 'Returning pawn underperformed in this old three-purchase screen and is parked unchanged. Bishop pawn also underperformed there; moving it to the two-point candidate pool is a new design decision, not a finding supported by these outcomes. Neither old screen compares against the newly selected level-one panel.' };
}

function buildUploadedReferencePanel() {
  // Start with the verified archived panel, not fake original-run inputs.
  const panel = buildReferencePanel(), supplied = Object.fromEntries(Object.keys(EXPERIMENTS).map(name => [name, loadPanelEvidence(name)]));
  panel.evidenceKind = 'archived-user-panel-uploads';
  panel.recordedDate = '2026-11-01';
  panel.provenance = PROVENANCE;
  const context = name => ({ id: EXPERIMENTS[name], kind: `uploaded-panel-${name}`, openings: 32,
    description: name === 'gap' ? '32 short-prefix cases: three King-step pawns versus three Pawn grants, three points per side.'
      : `${name === 'singles' ? 'One selected level-one purchase' : 'Two selected level-one purchases'} per side on the declared fixed home squares; 32 short-prefix cases.`,
    engine: supplied[name].config.engine, engineSha256: null, runId: null,
    provenance: 'Exact uploaded journal and Markdown report checked against reconstructed declarations; original run manifest, archived INI and native preflight were not supplied.' });
  for (const name of Object.keys(EXPERIMENTS)) {
    const input = supplied[name], source = { kind: `uploaded-panel-${name}`, source: input.source,
      declaration: input.declaration, provenance: PROVENANCE, recordsSha256: sha(JSON.stringify(input.records)) };
    panel.sources.push(source);
    const comparisons = input.report.comparisons.map(row => ({ ...row, source: source.kind, contexts: [context(name)] }));
    if (name === 'gap') {
      const section = panel.sections.find(row => row.id === 'three-point');
      const old = section.comparisons.findIndex(row => row.source === 'new-panel-gap');
      assert.ok(old >= 0 && section.comparisons[old].score === null, 'The base panel must contain exactly one pending bridge.');
      section.comparisons.splice(old, 1, ...comparisons);
      section.matrix = matrixFor(section.roster, section.comparisons);
    } else {
      const section = panel.sections.find(row => row.id === name);
      section.comparisons = comparisons;
      section.matrix = matrixFor(section.roster, comparisons);
      section.progress = input.report.progress;
      section.overall = input.report.overall;
    }
    panel.newRunProgress[name] = { experiment: EXPERIMENTS[name], scheduledGames: COUNTS[name],
      upgradePoints: name === 'gap' ? 3 : name === 'singles' ? 1 : 2,
      supplied: true, uploadedJournalSupplied: true, originalRunFolderSupplied: false, ...input.report.progress };
  }
  panel.notes = panel.notes.filter(note => !note.startsWith('New run folders require'));
  panel.notes.push('All three newly archived panel stages were supplied as journals and Markdown reports only. The three reports reproduce exactly; their original run manifests, archived INI files and native proofs were not supplied. This separate uploaded-evidence builder does not bypass or weaken the original-run folder validator.');
  panel.completedUploadedGames = 1216;
  panel.totalScoredGames = panel.sections.reduce((sum, section) => sum + section.comparisons.reduce((n, row) => n + row.pairedGames, 0), 0);
  assert.equal(panel.totalScoredGames, 3880);
  assert.ok(panel.sections.every(section => section.comparisons.every(row => row.score !== null)));
  return panel;
}

function renderUploadedReferencePanel(panel) {
  return renderReferencePanel(panel)
    .replace('Planned new games: **1216** (64 missing three-point bridge, 192 one-point duels, 960 two-point team games). Existing evidence is reused without replaying completed cells.',
      'All **1,216 uploaded panel games completed** (64 missing three-point bridge, 192 one-point duels, 960 two-point team games). Together with prior evidence, the four separate matrices contain **3,880 scored games**. No games were replayed.')
    .replace('Run folder supplied', 'Uploaded journal supplied')
    .replace('Use the JSON for original source/profile hashes, journal prefix hashes, native-preflight receipts and detailed coverage.',
      'Use the JSON for original upload hashes, reconstructed profile/schedule hashes, prior-source receipts and detailed coverage. No original run manifests or native-preflight receipts were supplied for the newly uploaded panel stages.');
}

function buildPanelEvidenceAudit() {
  const stages = Object.keys(EXPERIMENTS).map(name => {
    const input = loadPanelEvidence(name);
    return { name, experiment: input.experiment, source: input.source, declaration: input.declaration,
      progress: input.report.progress, overall: input.report.overall, comparisons: input.report.comparisons };
  });
  return { schemaVersion: 1, format: 'levelup-v17-reference-panel-upload-evidence', recordedDate: '2026-11-01',
    sources: SOURCES, provenance: PROVENANCE,
    counts: { uploadedGames: 1216, completedGames: 1216, pairedGames: 1216, completePairs: 608,
      truncatedGames: 0, errors: 0, newMatchGames: 0, engineSearches: 0 }, stages, historicalPawnReview: historicalPawnReview() };
}

function main(args = process.argv.slice(2)) {
  assert.ok(!args.length || args.length === 1 && args[0] === '--write', 'Use no arguments or --write.');
  const audit = buildPanelEvidenceAudit(), panel = buildUploadedReferencePanel();
  const artifacts = [
    [`${PREFIX}.audit.json`, JSON.stringify(audit, null, 2) + '\n'],
    [`${PREFIX}.panel.json`, JSON.stringify(panel, null, 2) + '\n'],
    [`${PREFIX}.panel.md`, renderUploadedReferencePanel(panel)],
    [`${PREFIX}.panel.csv`, renderReferencePanelCsv(panel)],
    ...Object.keys(EXPERIMENTS).map(name => [`${PREFIX}.${name}.report.md`, renderV17Report(loadPanelEvidence(name).report)]),
  ];
  for (const [file, bytes] of artifacts) {
    const target = path.join(ROOT, file);
    if (args.length) fs.writeFileSync(target, bytes);
    else assert.equal(fs.readFileSync(target, 'utf8'), bytes, `Derived artifact changed: ${file}.`);
  }
  console.log('Reference-panel uploads verified: 1,216 completions; 3,880 scored games across separate panels. No engines or games started.');
  return { audit, panel };
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; }
}
module.exports = { SOURCES, PROVENANCE, EXPERIMENTS, COUNTS, readPinnedSource, declaredStartFen,
  analyzePanelRecords, loadPanelEvidence, historicalPawnReview, buildUploadedReferencePanel,
  renderUploadedReferencePanel, buildPanelEvidenceAudit, main };
