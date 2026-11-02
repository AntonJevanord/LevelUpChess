'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { gzipSync } = require('node:zlib');
const { createHash } = require('node:crypto');
const { readPinnedSource } = require('../scripts/balance/v17-acceptance-evidence');
const { SOURCES, PROVENANCE, TARGET_OPENINGS, COLLECTED_OPENINGS, GAME_COUNT,
  analyzePanelEnvelopes, loadPanelEvidence, buildPanelAudit, renderPanelAudit, main } = require('../scripts/balance/v17-level3-panel-evidence');

let input;
test.before(() => { input = loadPanelEvidence(); });
function changed(patch, index = 0) { return input.envelopes.map((row, i) => i === index ? { ...row, ...patch } : row); }
function changedRecord(patch) { return changed({ record: { ...input.envelopes[0].record, ...patch } }); }

test('the original first-eight snapshot reproduces exactly while retaining the requested32 target', () => {
  assert.equal(input.envelopes.length, GAME_COUNT);
  assert.equal(COLLECTED_OPENINGS, 8); assert.equal(TARGET_OPENINGS, 32);
  assert.equal(input.report.progress.finalizedGames, 2640); assert.equal(input.report.progress.pairedGames, 2640);
  assert.equal(input.report.progress.scheduledGames, 10560);
  assert.equal(input.declaration.reportReproducedExactly, true);
  assert.equal(input.report.runId, null);
  assert.deepEqual(input.stages.map(stage => [stage.nodes, stage.records.length]), [[20000, 880], [40000, 880], [80000, 880]]);
  assert.deepEqual(input.report.nodes.map(node => [node.declaredOpenings, node.targetOpenings, node.progress.completePairs]), [[8, 32, 440], [8, 32, 440], [8, 32, 440]]);
  assert.equal(new Set(input.envelopes.map(row => row.record.id)).size, 880);
  assert.equal(new Set(input.envelopes.map(row => row.stageKey + ':' + row.record.id)).size, 2640);
  assert.equal(PROVENANCE.originalManifestSupplied, false); assert.equal(PROVENANCE.nativePreflightSupplied, false);
  assert.equal(PROVENANCE.legalMovesIndependentlyReplayed, false); assert.equal(PROVENANCE.engineSha256, null);
  assert.ok(input.declaration.stages.every(stage => stage.originalManifestSupplied === false && stage.nativePreflightSupplied === false));
});

test('archive and uncompressed-byte pins independently reject corrupt copies', () => {
  assert.throws(() => loadPanelEvidence({ readArchive(file) {
    const bytes = Buffer.from(fs.readFileSync(file)); bytes[30] ^= 1; return bytes;
  } }), /Archive changed/);
  const pin = SOURCES.uploadedReport, raw = Buffer.from(readPinnedSource(pin)); raw[0] ^= 1;
  const packed = gzipSync(raw, { level: 9 });
  assert.throws(() => readPinnedSource({ ...pin, archivedSha256: createHash('sha256').update(packed).digest('hex') }, () => packed), /Original bytes changed/);
});

test('foreign envelopes, changed budgets, config hashes and inconsistent stage run IDs fail', () => {
  for (const patch of [{ format: 'raw-game' }, { schemaVersion: 2 }, { stageKey: 'batch-02-n20000' },
    { stageConfigSha256: '0'.repeat(64) }, { runId: 'not-a-run-id' }, { runId: '00000000-0000-0000-0000-000000000000' }, { extra: true }]) {
    assert.throws(() => analyzePanelEnvelopes(changed(patch)));
  }
  assert.throws(() => analyzePanelEnvelopes(changed({ stageKey: 'batch-01-n40000' })), /stage config hash changed/);
});

test('copied identities, invented retries and absent first-batch games cannot add evidence', () => {
  const duplicate = input.envelopes.slice(); duplicate[1] = duplicate[0];
  assert.throws(() => analyzePanelEnvelopes(duplicate), /conflicting copied attempts/);
  assert.throws(() => analyzePanelEnvelopes(changedRecord({ attempt: 2 })), /one attempt per game/);
  assert.throws(() => analyzePanelEnvelopes(input.envelopes.slice(1)), /every first-batch game/);
  assert.throws(() => analyzePanelEnvelopes(changedRecord({ status: 'truncated', result: '*', reason: 'max-plies' })), /only completed games/);
});

test('recorded armies, movement identities, strength, engine values and opening context are checked', () => {
  const first = input.envelopes[0].record;
  for (const patch of [{ engine: { ...first.engine, nodes: 30000 } }, { whiteStrength: { skill: 19 } },
    { evaluation: { pieceValues: {} } }, { profileHash: '0'.repeat(64) }, { registryHash: '0'.repeat(64) },
    { registryReference: 'other.json#registry' }, { startFen: '8/8/8/8/8/8/8/K6k w - - 0 1' },
    { comparisonLabel: 'Other versus Other' }, { royalMode: 'capture' }, { engineNames: { w: 'other', b: 'other' } },
    { openingMoves: [] }, { sans: [] }, { totalPlies: first.totalPlies + 1 }, { result: '1/2-1/2' },
    { finalFen: first.finalFen.replace(/\d+$/, '999') }]) assert.throws(() => analyzePanelEnvelopes(changedRecord(patch)));
  assert.throws(() => analyzePanelEnvelopes(input.envelopes, 'edited report'), /differs from the exact uploaded report/);
});

test('a missing color partner stays unscored and affects only its own node budget', () => {
  const missing = input.envelopes[0], remaining = input.envelopes.slice(1);
  const partial = analyzePanelEnvelopes(remaining, undefined, { requireComplete: false });
  assert.equal(partial.report.progress.finalizedGames, 2639); assert.equal(partial.report.progress.pairedGames, 2638);
  const partial20 = partial.report.nodes.find(row => row.nodes === 20000);
  assert.equal(partial20.progress.completePairs, 439);
  assert.deepEqual(partial.report.nodes.slice(1), input.report.nodes.slice(1));
  const comparison = input.stages[0].metadata.comparisons.find(row => row.id === missing.record.comparisonId);
  for (const key of [comparison.aKey, comparison.bKey]) {
    const row = partial20.matrix.rows.find(row => row.key === key);
    assert.equal(row.overall.openingCoverage.shared, 7);
    assert.equal(row.overall.games, 126);
  }
});

test('ordinary-army losses are distinguished from losing the matchup and score tightening is not monotone', () => {
  const audit = buildPanelAudit();
  const ordinary = key => audit.budgets.map(budget => budget.rows.find(row => row.key === key).ordinary);
  assert.deepEqual(ordinary('nightrider').map(row => [row.wins, row.draws, row.losses]), [[15, 0, 1], [12, 3, 1], [13, 1, 2]]);
  assert.deepEqual(ordinary('xray-queen').map(row => [row.wins, row.draws, row.losses]), [[12, 3, 1], [11, 2, 3], [8, 4, 4]]);
  assert.ok([...ordinary('nightrider'), ...ordinary('xray-queen')].every(row => row.score > 0.5));
  assert.deepEqual(audit.roster.filter(row => ordinary(row.key).every(value => value.losses > 0)).map(row => row.key), ['nightrider', 'xray-queen']);
  assert.ok(audit.budgets.every(row => Math.abs(row.spread.mean - 0.5) < 1e-12));
  assert.ok(audit.budgets[1].spread.populationStandardDeviation < audit.budgets[0].spread.populationStandardDeviation);
  assert.ok(audit.budgets[2].spread.populationStandardDeviation > audit.budgets[1].spread.populationStandardDeviation);
  audit.budgets.forEach((row, index) => assert.ok(Math.abs(row.rows.find(row => row.key === 'ranged-rook').overall.score - [85.5 / 144, 79 / 144, 95.5 / 144][index]) < 1e-12));
  assert.equal(audit.sensitivity.length, 45); assert.ok(audit.sensitivity.every(row => row.matchedOpenings === 8));
  assert.match(renderPanelAudit(audit), /not monotone convergence/);
  assert.equal(audit.counts.engineSearches, 0); assert.equal(audit.counts.newMatchGames, 0);
});

test('derived files reproduce offline without engine or search options', () => {
  const audit = main([]); assert.equal(audit.counts.completePairs, 1320);
  assert.throws(() => main(['--run']), /Use no arguments or --write/);
});
