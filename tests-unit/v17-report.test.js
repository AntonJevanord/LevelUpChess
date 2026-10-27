'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createV17Report, renderV17Report, renderV17Csv } = require('../scripts/balance/v17-report');

const config = { schemaVersion: 2, name: 'Reference pair pilot', repetitions: 1, engine: { nodes: 20000, threads: 1, hashMb: 32, maxPlies: 400 },
  openings: [{ id: 'start', moves: [] }, { id: 'open-e', moves: ['e2e4', 'e7e5'] }],
  comparisons: [{ id: 'vu-v-ca', label: 'Vanguard + Unicorn versus Cruisader + Amazon', armyA: { upgrades: {} }, armyB: { upgrades: {} }, strengthA: { skill: 20 }, strengthB: { skill: 20 } }] };
const metadata = { kind: 'reference-2v2', question: 'How do reference partnerships perform?', symmetric: true,
  rows: [{ key: 'vu', label: 'Vanguard + Unicorn' }, { key: 'ca', label: 'Cruisader + Amazon' }],
  columns: [{ key: 'vu', label: 'Vanguard + Unicorn' }, { key: 'ca', label: 'Cruisader + Amazon' }],
  comparisons: [{ id: 'vu-v-ca', aKey: 'vu', aLabel: 'Vanguard + Unicorn', bKey: 'ca', bLabel: 'Cruisader + Amazon' }] };
function record(id, aColor, result = '1-0', changes = {}) {
  return { id, comparisonId: 'vu-v-ca', pairId: 'one', openingId: 'start', attempt: 1, aColor, status: 'completed', result, reason: 'checkmate', ...changes };
}
const pair = (whiteResult = '1-0', blackResult = '0-1') => [record('one-w', 'w', whiteResult), record('one-b', 'b', blackResult)];
const report = (records, changes = {}) => createV17Report({ experiment: 'reference-2v2', config, metadata, records, ...changes });
function manifestFor(records) {
  return { runId: 'test-run', config, designRegistry: { hash: 'registry' }, designProfile: { hash: 'profile', registryHash: 'registry', variant: 'profile-variant' },
    schedule: records.map(item => ({ id: item.id, pairId: item.pairId, openingId: item.openingId, comparisonId: item.comparisonId, aColor: item.aColor, openingMoves: [] })) };
}
function contextual(records) {
  return records.map(item => ({ ...item, profileHash: 'profile', registryHash: 'registry', registryReference: 'run.json#designRegistry', variant: 'profile-variant',
    engine: config.engine, whiteStrength: { skill: 20 }, blackStrength: { skill: 20 }, openingMoves: [] }));
}

test('complete color pairs preserve A perspective and invert the symmetric matrix', () => {
  const result = report(pair('1-0', '1/2-1/2'));
  assert.equal(result.comparisons[0].score, 0.75);
  assert.deepEqual([result.comparisons[0].wins, result.comparisons[0].draws, result.comparisons[0].losses], [1, 1, 0]);
  assert.equal(result.matrix.rows[0].cells[1].score, 0.75);
  assert.equal(result.matrix.rows[1].cells[0].score, 0.25);
  assert.equal(result.matrix.rows[1].cells[0].losses, 1);
  assert.equal(result.matrix.rows[0].cells[0].score, null);
  assert.equal(result.progress.pairedGames, 2);
  assert.match(renderV17Report(result), /75\.00%/);
  assert.match(renderV17Report(result), /25\.00%/);
  assert.match(renderV17Report(result), /coarse descriptive screen/);
  assert.match(renderV17Csv(result), /vu-v-ca,Vanguard \+ Unicorn,Cruisader \+ Amazon,2,1,1,0,0\.75,1,2,1,0,0/);
});

test('partial pairs and unscored attempts never become draws or losses', () => {
  const records = [record('one-w', 'w'), record('one-b', 'b', '*', { status: 'truncated', reason: 'max-plies' }),
    record('two-w', 'w', '*', { pairId: 'two', openingId: 'open-e', status: 'error' })];
  const result = report(records), comparison = result.comparisons[0];
  assert.equal(comparison.score, null);
  assert.equal(comparison.pairedGames, 0);
  assert.equal(comparison.partialPairs, 1);
  assert.equal(comparison.statusCounts.truncated, 1);
  assert.equal(comparison.statusCounts.error, 1);
  assert.equal(result.progress.completedGames, 1);
  assert.equal(result.progress.finalizedGames, 2);
  assert.match(renderV17Report(result), /\| 0 \| 0 \/ 0 \/ 0 \| — \|/);
});

test('empty runs retain every scheduled cell without manufacturing 50-percent results', () => {
  const result = report([]);
  assert.equal(result.scheduledGames, 4);
  assert.equal(result.comparisons.length, 1);
  assert.equal(result.comparisons[0].score, null);
  assert.equal(result.comparisons[0].expectedPairs, 2);
  assert.equal(result.matrix.rows[0].cells[1].score, null);
  assert.equal(result.progress.finalizedGames, 0);
  assert.doesNotMatch(renderV17Report(result), /50\.00%/);
});

test('copied journal lines add no weight and changed duplicate or finalized histories fail', () => {
  const records = pair();
  const result = report([records[0], structuredClone(records[0]), records[1]]);
  assert.equal(result.progress.duplicateCopiesIgnored, 1);
  assert.equal(result.comparisons[0].attempts, 2);
  assert.equal(result.comparisons[0].pairedGames, 2);
  assert.throws(() => report([records[0], { ...records[0], result: '0-1' }]), /conflicting duplicate/);
  assert.throws(() => report([records[0], { ...records[0], attempt: 2 }]), /after finalization/);
});

test('foreign comparison, malformed result and broken pair colors fail visibly', () => {
  assert.throws(() => report([record('one-w', 'w', '1-0', { comparisonId: 'foreign' })]), /unknown comparison/);
  assert.throws(() => report([record('one-w', 'w', '1-0', { openingId: 'foreign' })]), /unknown opening/);
  assert.throws(() => report([record('one-w', 'w', '*')]), /invalid completed/);
  assert.throws(() => report([record('one-w', 'w', '1-0', { status: 'error' })]), /invalid completed/);
  assert.throws(() => report([record('one-w', 'w'), record('one-b', 'w')]), /color identities/);
  assert.throws(() => report([record('one-w', 'w'), record('one-b', 'b', '1-0', { openingId: 'open-e' })]), /opening or color identities/);
});

test('a supplied manifest binds the report to frozen profile, schedule and engine context', () => {
  const records = contextual(pair()), manifest = manifestFor(records);
  assert.equal(report(records, { manifest }).runId, 'test-run');
  for (const change of [
    { profileHash: 'different' }, { registryHash: 'different' }, { variant: 'different' }, { pairId: 'different' },
    { engine: { ...config.engine, nodes: 2 } }, { whiteStrength: { skill: 1 } }, { openingMoves: ['a2a4'] },
  ]) assert.throws(() => report([{ ...records[0], ...change }, records[1]], { manifest }), /frozen|context/);
  assert.throws(() => report(records, { manifest: { ...manifest, config: { ...config, seed: 9 } } }), /declared experiment/);
});
