'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loadFocusEvidence, analyzeFocusStages, buildFocusAudit, main } = require('../scripts/balance/v17-nightrider-focus-evidence');
let input;
test.before(() => { input = loadFocusEvidence(); });
const sources = () => input.stages.map(stage => ({ nodes: stage.nodes, records: [...stage.records] }));

test('all three focused journals reproduce exactly without an invented runtime or native attestation', () => {
  assert.equal(input.declaration.reportReproducedExactly, true);
  assert.deepEqual(input.stages.map(stage => [stage.nodes, stage.records.length]), [[20000, 192], [40000, 192], [80000, 192]]);
  assert.ok(input.report.reports.every(row => row.report.progress.completePairs === 96));
  assert.deepEqual(input.sharedNightriderValue, { mg: 2326, eg: 2211 });
  assert.equal(input.provenance.originalRuntimeReceiptSupplied, false); assert.equal(input.provenance.engineSha256, null);
  assert.equal(input.provenance.legalMovesIndependentlyReplayed, false);
});
test('corrupted compressed uploads fail before declaration reconstruction', () => {
  assert.throws(() => loadFocusEvidence({ readArchive(file) { const bytes = Buffer.from(fs.readFileSync(file)); bytes[40] ^= 1; return bytes; } }), /Archive changed/);
});
test('missing budgets, duplicate sources, copied games and incomplete pairs add no evidence', () => {
  const base = sources();
  assert.throws(() => analyzeFocusStages(base.slice(1)));
  assert.throws(() => analyzeFocusStages([...base, base[0]]));
  const copied = sources(); copied[0].records[1] = copied[0].records[0]; assert.throws(() => analyzeFocusStages(copied));
  const missing = sources(); missing[0].records.pop(); assert.throws(() => analyzeFocusStages(missing));
});
test('node, evaluation, profile, start and opening policy changes fail closed', () => {
  for (const patch of [{ attempt: 2 }, { profileHash: '0'.repeat(64) }, { startFen: 'foreign' }, { openingMoves: [] },
    { engine: { nodes: 80000, threads: 1, hashMb: 32, maxPlies: 400 } }, { evaluation: null }, { result: '*' }]) {
    const rows = sources(); rows[0].records[0] = { ...rows[0].records[0], ...patch };
    assert.throws(() => analyzeFocusStages(rows));
  }
});
test('observed depth changes and shared controls remain separate from claims of a stable balance value', () => {
  const audit = buildFocusAudit();
  assert.equal(audit.counts.completedGames, 576); assert.equal(audit.counts.newMatchGames, 0);
  const at = nodes => audit.report.reports.find(row => row.nodes === nodes).report.overall.rows;
  assert.equal(at(40000).find(row => row.key === 'diagonal-captures').score, 33 / 64);
  assert.equal(at(80000).find(row => row.key === 'diagonal-captures').score, 43.5 / 64);
  assert.equal(at(80000).find(row => row.key === 'original').score, 28.5 / 64);
  assert.equal(at(80000).find(row => row.key === 'orthogonal-captures').score, 49 / 64);
  assert.equal(audit.provenance.originalCampaignManifestSupplied, false);
});
test('committed evidence artifacts reproduce offline and cannot launch an engine', () => {
  assert.equal(main([]).counts.engineSearches, 0);
  assert.throws(() => main(['--engine', 'unexpected']));
});
