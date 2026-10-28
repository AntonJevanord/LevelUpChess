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

function referencePanel({ repetitions = 1, crossMatch = false } = {}) {
  const keys = ['vanguard', 'unicorn', 'cruisader', 'amazon'];
  const comparisons = keys.map(key => ({ id: `candidate-v-${key}`, label: `Candidate versus ${key}`,
    armyA: { upgrades: {} }, armyB: { upgrades: {} }, strengthA: { skill: 20 }, strengthB: { skill: 20 } }));
  const described = keys.map(key => ({ id: `candidate-v-${key}`, aKey: 'candidate', aLabel: 'Candidate', bKey: key, bLabel: key }));
  if (crossMatch) {
    comparisons.push({ ...comparisons[0], id: 'candidate-v-bundle', label: 'Candidate versus Other bundle' });
    described.push({ id: 'candidate-v-bundle', aKey: 'candidate', aLabel: 'Candidate', bKey: 'bundle', bLabel: 'Other bundle' });
  }
  const declaration = { experiment: 'test-reference-panel', config: { ...config, repetitions, comparisons },
    metadata: { kind: 'pawn-grants', symmetric: true, rows: [{ key: 'candidate', label: 'Candidate' }],
      columns: [...keys.map(key => ({ key, label: key })), ...(crossMatch ? [{ key: 'bundle', label: 'Other bundle' }] : [])], comparisons: described } };
  const pairFor = (opponent, openingId, score, repetition = 1) => ['w', 'b'].map(aColor => ({
    id: `${opponent}-${openingId}-${repetition}-${aColor}`, pairId: `${opponent}-${openingId}-${repetition}`,
    comparisonId: `candidate-v-${opponent}`, openingId, repetition, attempt: 1, aColor, status: 'completed',
    result: score === 0.5 ? '1/2-1/2' : (score === 1) === (aColor === 'w') ? '1-0' : '0-1', reason: score === 0.5 ? 'stalemate' : 'checkmate',
  }));
  return { declaration, pairFor, keys, create: records => createV17Report({ ...declaration, records }) };
}

test('overall scores weight four reference opponents equally and exclude direct bundle matches', () => {
  const panel = referencePanel({ crossMatch: true });
  const records = panel.keys.flatMap((key, index) => panel.pairFor(key, 'start', [1, 0.5, 0, 1][index]));
  records.push(...panel.pairFor('bundle', 'start', 0));
  const result = panel.create(records), row = result.overall.rows[0];
  assert.equal(row.score, 0.625);
  assert.deepEqual([row.games, row.wins, row.draws, row.losses], [8, 4, 2, 2]);
  assert.equal(row.opponents.length, 4);
  assert.ok(row.opponents.every(opponent => opponent.key !== 'bundle'));
  assert.deepEqual(row.openingCoverage, { shared: 1, total: 2, openingIds: ['start'], repetitions: 1 });
  assert.equal(result.comparisons.find(comparison => comparison.bKey === 'bundle').score, 0);
  assert.match(renderV17Report(result), /Overall score \(cases\)/);
  assert.match(renderV17Report(result), /62\.50% \(1\/2\)/);
  assert.match(renderV17Report(result), /\| Candidate \| 8 \| 4 \/ 2 \/ 2 \| 62\.50% \| 4 \| 1\/2 \|/);
  assert.doesNotMatch(renderV17Report(result, { includeOverall: false }), /Overall score|Overall row/);
});

test('overall scores use only shared complete cases, so faster workers cannot change opponent or opening weights', () => {
  const panel = referencePanel();
  const records = panel.keys.flatMap((key, index) => panel.pairFor(key, 'start', [0, 0.5, 0, 1][index]));
  const first = panel.create(records).overall.rows[0];
  records.push(...panel.pairFor('vanguard', 'open-e', 1));
  const result = panel.create(records), row = result.overall.rows[0];
  assert.equal(row.score, 0.375);
  assert.deepEqual(row, first);
  assert.equal(result.comparisons.find(comparison => comparison.bKey === 'vanguard').score, 0.5);
  assert.equal(result.progress.pairedGames, 10);
  assert.equal(row.games, 8);
  assert.equal(row.status, 'partial shared opening cases');
  assert.deepEqual(panel.create([...records, ...structuredClone(records)]).overall, result.overall);
});

test('pending overall requires a common case and excludes incomplete or truncated color pairs', () => {
  const panel = referencePanel();
  const records = panel.keys.slice(0, 3).flatMap(key => panel.pairFor(key, 'start', 1));
  records.push(...panel.pairFor('amazon', 'open-e', 1));
  let result = panel.create(records);
  assert.ok(result.comparisons.every(comparison => comparison.score === 1));
  assert.equal(result.overall.rows[0].score, null);
  assert.equal(result.overall.rows[0].games, 0);
  assert.match(renderV17Report(result), /pending \(0\/2\)/);
  assert.match(renderV17Report(result), /\| Candidate \| 0 \| 0 \/ 0 \/ 0 \| pending \| 4 \| 0\/2 \|/);
  const amazonStart = panel.pairFor('amazon', 'start', 1);
  records.push(amazonStart[0], { ...amazonStart[1], status: 'truncated', result: '*', reason: 'max-plies' });
  result = panel.create(records);
  assert.equal(result.overall.rows[0].score, null);
  assert.equal(result.overall.rows[0].openingCoverage.shared, 0);
  const errorThenRetry = [...records.slice(0, -1), { ...amazonStart[1], status: 'error', result: '*', reason: 'interrupted' }, { ...amazonStart[1], attempt: 2 }];
  result = panel.create(errorThenRetry);
  assert.equal(result.overall.rows[0].score, 1);
  assert.equal(result.overall.rows[0].games, 8);
  assert.equal(result.overall.rows[0].openingCoverage.shared, 1);
});

test('overall WDL tables print the score percentage and can reproduce the pre-column layout', () => {
  const result = report(pair('1-0', '1/2-1/2'));
  const current = renderV17Report(result), legacy = renderV17Report(result, { includeOverallSummaryScore: false });
  assert.match(current, /\| Overall row \| Included games \| W \/ D \/ L \| Overall score \| Opponents \| Shared cases \|/);
  assert.match(current, /\| Vanguard \+ Unicorn \| 2 \| 1 \/ 1 \/ 0 \| 75\.00% \| 1 \| 1\/2 \|/);
  assert.match(current, /\| Cruisader \+ Amazon \| 2 \| 0 \/ 1 \/ 1 \| 25\.00% \| 1 \| 1\/2 \|/);
  assert.match(legacy, /\| Overall row \| Included games \| W \/ D \/ L \| Opponents \| Shared cases \|/);
  assert.match(legacy, /\| Vanguard \+ Unicorn \| 2 \| 1 \/ 1 \/ 0 \| 1 \| 1\/2 \|/);
  assert.doesNotMatch(legacy, /W \/ D \/ L \| Overall score/);
  assert.equal(current.split('\n').find(line => line.startsWith('| Row army /')),
    legacy.split('\n').find(line => line.startsWith('| Row army /')), 'the matrix retains its existing overall column');
  assert.equal(renderV17Report(result, { includeOverall: false }),
    renderV17Report(result, { includeOverall: false, includeOverallSummaryScore: false }));
});

test('all configured repetitions must finish with distinct repetition identities before a case contributes', () => {
  const panel = referencePanel({ repetitions: 2 });
  const records = panel.keys.flatMap(key => panel.pairFor(key, 'start', 1));
  records.push(...panel.keys.slice(0, 3).flatMap(key => panel.pairFor(key, 'start', 0, 2)));
  assert.equal(panel.create(records).overall.rows[0].score, null);
  const last = panel.pairFor('amazon', 'start', 0, 2);
  const result = panel.create([...records, ...last]);
  assert.equal(result.overall.rows[0].score, 0.5);
  assert.equal(result.overall.rows[0].games, 16);
  assert.equal(result.overall.rows[0].openingCoverage.repetitions, 2);
  assert.equal(panel.create([...records, ...last.map(record => ({ ...record, repetition: 1 }))]).overall.rows[0].score, null);
});

test('reference team overall scores invert either matchup side and include all five other scheduled teams', () => {
  const evidence = require('../scripts/balance/v17-screen-evidence').loadScreenEvidence('reference-2v2');
  const rows = evidence.report.overall.rows;
  assert.equal(rows.length, 6);
  assert.ok(rows.every(row => row.games === 80 && row.opponents.length === 5 && row.openingCoverage.shared === 8));
  assert.ok(Math.abs(rows.find(row => row.label === 'Vanguard + Amazon').score - 0.6) < 1e-12);
  for (const row of rows) for (const opponent of row.opponents) {
    const inverse = rows.find(other => other.key === opponent.key).opponents.find(other => other.key === row.key);
    assert.ok(Math.abs(opponent.score + inverse.score - 1) < 1e-12);
    assert.equal(opponent.wins, inverse.losses);
    assert.equal(opponent.draws, inverse.draws);
  }
});
