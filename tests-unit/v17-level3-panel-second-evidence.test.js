'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loadPanelEvidence, analyzePanelEnvelopes, buildPanelAudit, main } = require('../scripts/balance/v17-level3-panel-second-evidence');
let input;
test.before(() => { input = loadPanelEvidence(); });

test('the cumulative snapshot retains all old evidence exactly and adds2648 records', () => {
  assert.equal(input.envelopes.length, 5288); assert.equal(input.declaration.reportReproducedExactly, true);
  assert.equal(input.continuity.previousGamesRetainedExactly, 2640); assert.equal(input.continuity.newGames, 2648);
  assert.equal(input.continuity.cumulativeSnapshotsMustNotBeSummed, true);
  assert.deepEqual(input.stages.map(stage => stage.records.length), [880, 880, 880, 880, 880, 880, 8]);
});
test('the eight extra20k games update cells but cannot alter the shared16-case overall', () => {
  assert.deepEqual(input.report.nodes.map(row => row.declaredOpenings), [24, 16, 16]);
  for (const node of input.report.nodes) {
    assert.ok(node.matrix.rows.every(row => row.overall.openingCoverage.shared === 16));
    const balanced = input.balancedReport.nodes.find(row => row.nodes === node.nodes);
    assert.deepEqual(node.matrix.rows.map(row => row.overall), balanced.matrix.rows.map(row => row.overall));
  }
  const audit = buildPanelAudit(); assert.equal(audit.counts.balancedSixteenCaseGames, 5280);
  assert.equal(audit.counts.extraThirdBatchGames, 8); assert.equal(audit.extraStage.includedInSixteenCaseOverall, false);
});
test('archive corruption, missing games and duplicate stage identities fail closed', () => {
  assert.throws(() => loadPanelEvidence({ readArchive(file) { const bytes = Buffer.from(fs.readFileSync(file)); bytes[45] ^= 1; return bytes; } }), /Archive changed/);
  assert.throws(() => analyzePanelEnvelopes(input.envelopes.slice(1)));
  const duplicate = [...input.envelopes]; duplicate[1] = duplicate[0]; assert.throws(() => analyzePanelEnvelopes(duplicate));
});
test('an extra-stage record cannot change its budget, original profile or outcome status', () => {
  const index = input.envelopes.findIndex(row => row.stageKey === 'batch-03-n20000');
  for (const patch of [{ engine: { nodes: 40000, threads: 1, hashMb: 32, maxPlies: 400 } }, { attempt: 2 },
    { profileHash: '0'.repeat(64) }, { status: 'truncated', result: '*' }, { openingMoves: [] }]) {
    const rows = [...input.envelopes]; rows[index] = { ...rows[index], record: { ...rows[index].record, ...patch } };
    assert.throws(() => analyzePanelEnvelopes(rows));
  }
});
test('Cataphract and nonmonotone roster spread reproduce from balanced cases', () => {
  const audit = buildPanelAudit(), at = nodes => audit.budgets.find(row => row.nodes === nodes);
  const cat = at(80000).rows.find(row => row.key === 'ranged-rook');
  assert.ok(Math.abs(cat.overall.score - 191 / 288) < 1e-12); assert.equal(cat.overall.games, 288);
  assert.ok(at(40000).spread.populationStandardDeviation < at(80000).spread.populationStandardDeviation);
  assert.ok(at(80000).rows.find(row => row.key === 'xray-queen').overall.score < 0.3);
});
test('derived snapshot artifacts reproduce without changing the first upload or starting games', () => {
  assert.equal(main([]).counts.newMatchGames, 0);
  assert.throws(() => main(['--engine', 'unexpected']));
});
