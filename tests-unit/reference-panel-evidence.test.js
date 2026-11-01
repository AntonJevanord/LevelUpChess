const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
  SOURCES, PROVENANCE, COUNTS, loadPanelEvidence, analyzePanelRecords,
  buildUploadedReferencePanel, renderUploadedReferencePanel, historicalPawnReview, main,
} = require('../scripts/balance/reference-panel-evidence');
const { validatePanelInput, renderReferencePanelCsv } = require('../scripts/balance/reference-panel-report');

const loaded = {};
test.before(() => { for (const name of Object.keys(SOURCES)) loaded[name] = loadPanelEvidence(name); });

test('all six exact uploads reproduce declared schedules and Markdown reports without native provenance', () => {
  for (const [name, count] of Object.entries(COUNTS)) {
    const evidence = loaded[name];
    assert.equal(evidence.records.length, count);
    assert.equal(evidence.report.progress.pairedGames, count);
    assert.equal(evidence.report.progress.completePairs, count / 2);
    assert.equal(evidence.report.progress.duplicateCopiesIgnored, 0);
    assert.equal(evidence.declaration.reportReproducedExactly, true);
    assert.equal(evidence.provenance.originalManifestSupplied, false);
    assert.equal(evidence.provenance.nativePreflightSupplied, false);
    assert.equal(evidence.provenance.engineSha256, null);
    assert.equal(evidence.report.runId, null);
  }
  assert.equal(PROVENANCE.legalMovesIndependentlyReplayed, false);
});

test('compressed or original upload corruption fails the pinned source check', () => {
  assert.throws(() => loadPanelEvidence('gap', { readArchive(file) {
    const bytes = Buffer.from(fs.readFileSync(file)); bytes[20] ^= 1; return bytes;
  } }), /Archive changed/);
});

test('changed search, rules, starting army, schedule or duplicate identities are rejected', () => {
  const input = loaded.gap;
  const change = patch => input.records.map((record, index) => index ? record : { ...record, ...patch });
  assert.throws(() => analyzePanelRecords('gap', change({ engine: { ...input.config.engine, nodes: 30000 } })), /engine, strength, evaluation or opening context changed/);
  assert.throws(() => analyzePanelRecords('gap', change({ profileHash: '0'.repeat(64) })), /frozen rules profile/);
  assert.throws(() => analyzePanelRecords('gap', change({ startFen: '8/8/8/8/8/8/8/K6k w - - 0 1' })), /starting army changed/);
  assert.throws(() => analyzePanelRecords('gap', change({ id: 'unknown-game' })), /unknown scheduled game/);
  assert.throws(() => analyzePanelRecords('gap', [input.records[0], ...input.records.slice(0, -1)]), /repeats a game identity/);
  assert.throws(() => analyzePanelRecords('gap', change({ totalPlies: 0 })), /total ply count changed/);
  assert.throws(() => analyzePanelRecords('gap', input.records, 'changed Markdown report'), /differs from the exact uploaded report/);
});

test('the completed combined panel keeps four budgets and reuses 3,880 scored games once', () => {
  const panel = buildUploadedReferencePanel();
  assert.equal(panel.completedUploadedGames, 1216);
  assert.equal(panel.totalScoredGames, 3880);
  assert.deepEqual(panel.sections.map(section => section.upgradePoints), [3, 1, 2, 6]);
  assert.deepEqual(panel.sections.map(section => section.comparisons.length), [21, 3, 15, 15]);
  assert.ok(panel.sections.every(section => section.comparisons.every(row => row.score !== null)));
  assert.equal(panel.sections[0].overall, null);
  assert.ok(Object.values(panel.newRunProgress).every(progress => progress.uploadedJournalSupplied
    && !progress.originalRunFolderSupplied && progress.finalizedGames === progress.scheduledGames));
  assert.deepEqual(panel.ownership, {});
  const bridge = panel.sections[0].comparisons.find(row => row.source === 'uploaded-panel-gap');
  assert.equal(bridge.pairedGames, 64);
  assert.deepEqual([bridge.wins, bridge.draws, bridge.losses, bridge.score], [29, 13, 22, 0.5546875]);
  assert.equal(bridge.contexts[0].engineSha256, null);
  assert.match(bridge.contexts[0].provenance, /original run manifest.*not supplied/);
  assert.equal(renderReferencePanelCsv(panel).trimEnd().split('\n').length, 55);
  const rendered = renderUploadedReferencePanel(panel);
  assert.match(rendered, /1,216 uploaded panel games completed/);
  assert.match(rendered, /3,880 scored games/);
  assert.match(rendered, /Uploaded journal supplied/);
  assert.doesNotMatch(rendered, /Planned new games:/);
});

test('single and repeated-purchase scores retain opponent orientation and context', () => {
  const panel = buildUploadedReferencePanel();
  const singles = panel.sections.find(section => section.id === 'singles');
  assert.deepEqual(singles.overall.rows.map(row => row.score), [0.48046875, 0.53125, 0.48828125]);
  const pairs = panel.sections.find(section => section.id === 'pairs');
  const king = pairs.matrix.rows.find(row => row.key === 'king-step-king-step');
  const two = pairs.matrix.rows.find(row => row.key === 'two-step-two-step');
  const grants = pairs.matrix.rows.find(row => row.key === 'grant-grant');
  assert.equal(two.cells.find(cell => cell.columnKey === king.key).score, 0.4140625);
  assert.equal(king.cells.find(cell => cell.columnKey === two.key).score, 0.5859375);
  assert.equal(two.cells.find(cell => cell.columnKey === grants.key).score, 0.4609375);
  assert.equal(king.cells.find(cell => cell.columnKey === grants.key).score, 0.5859375);
  assert.ok(pairs.overall.rows.every(row => row.openingCoverage.shared === 32 && row.games === 320));
});

test('uploaded evidence does not satisfy or bypass the original-run manifest validator', () => {
  assert.throws(() => validatePanelInput(loaded.gap, 'panel-gap'));
  assert.equal(loaded.gap.manifest, undefined);
  assert.equal(loaded.gap.nativePreflight, undefined);
});

test('historical Returning pawn evidence is recovered with its actual cohort and scores', () => {
  const review = historicalPawnReview();
  assert.equal(review.returningPawn.designId, 'pawn.blue@3');
  assert.equal(review.returningPawn.movement, 'bmWfmW2fceF');
  assert.deepEqual([review.returningPawn.games, review.returningPawn.wins, review.returningPawn.draws,
    review.returningPawn.losses, review.returningPawn.score], [64, 10, 5, 49, 0.1953125]);
  assert.equal(review.bishopPawn.score, 0.2421875);
  assert.match(review.scope, /eight short prefixes/);
  assert.match(review.interpretation, /new design decision/);
});

test('committed evidence and complete panel reproduce offline', () => {
  const { audit, panel } = main([]);
  assert.equal(audit.counts.newMatchGames, 0);
  assert.equal(audit.counts.engineSearches, 0);
  assert.equal(panel.totalScoredGames, 3880);
  assert.throws(() => main(['--run']), /Use no arguments or --write/);
});
