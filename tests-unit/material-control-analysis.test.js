'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { analyzeControls, prepareControls, projectControls } = require('../scripts/balance/material-control-analysis');

const BASE = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'tempo'];
const AMAZON = 'bonus:queen.purple@1';
const BLINKS = ['bonus:rook.purple@3', 'bonus:rook.purple@4', 'bonus:rook.purple@5'];

function fixture(historiesPerCohort = 16) {
  let state = 1234;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
  const data = { featureNames: [...BASE, AMAZON, ...BLINKS], games: [], samples: [], limitations: ['Synthetic control data.'] }, historyKeys = {};
  for (const comparisonId of ['standard-control', 'amazon-control']) for (let i = 0; i < historiesPerCohort; i++) {
    const historyId = `${comparisonId}:${i}`, key = createHash('sha256').update(historyId).digest('hex');
    const y = [0, 0.5, 1][i % 3], result = y === 0 ? '0-1' : y === 1 ? '1-0' : '1/2-1/2';
    const pairId = `pair:${historyId}`, groupId = `family:${i % 7}`;
    const positions = ['middlegame', 'endgame', 'endgame'].map((phase, ply) => ({
      phase, ply: 16 + 5 * ply,
      x: [...Array.from({ length: 5 }, () => Math.floor(random() * 5) - 2), ply % 2 ? -1 : 1, 0, 0, 0, 0],
    }));
    for (const color of ['w', 'b']) {
      const gameId = `${historyId}:${color}`;
      data.games.push({ gameId, pairId, groupId, comparisonId, result, samples: positions.length });
      historyKeys[gameId] = key;
      for (const position of positions) data.samples.push({ ...structuredClone(position), gameId, pairId, groupId, y, weight: 1 / positions.length });
    }
  }
  return { data, historyKeys };
}

test('full-history deduplication preserves one observation for identical A/B histories', () => {
  const { data, historyKeys } = fixture(8), original = structuredClone(data), keys = structuredClone(historyKeys);
  const output = prepareControls(data, historyKeys);
  assert.equal(output.deduplication.inputRecords, 32);
  assert.equal(output.deduplication.uniqueHistories, 16);
  assert.equal(output.deduplication.duplicatedRecords, 16);
  assert.equal(output.deduplication.inputSamples, 96);
  assert.equal(output.deduplication.uniqueSamples, 48);
  assert.ok(output.deduplication.histories.every(history => history.recordGameIds.length === 2));
  assert.ok(output.dataset.games.every(game => game.gameId.endsWith(':b')));
  assert.deepEqual(data, original); assert.deepEqual(historyKeys, keys);
});

test('phase projection recomputes equal-history weights and preserves labels and groups', () => {
  const { data, historyKeys } = fixture(8), deduplicated = prepareControls(data, historyKeys).dataset;
  const output = projectControls(deduplicated, { comparisonIds: ['standard-control'], phase: 'endgame', featureNames: BASE });
  assert.equal(output.selection.inputUniqueGames, 8); assert.equal(output.selection.samples, 16);
  assert.equal(output.dataset.featureNames.length, 6);
  assert.ok(output.dataset.games.every(game => game.samples === 2));
  for (const game of output.dataset.games) {
    const rows = output.dataset.samples.filter(row => row.gameId === game.gameId);
    assert.equal(rows.length, 2); assert.equal(rows.reduce((sum, row) => sum + row.weight, 0), 1);
    assert.ok(rows.every(row => row.weight === 0.5 && row.phase === 'endgame' && row.groupId === game.groupId && row.pairId === game.pairId));
    const expected = game.result === '1-0' ? 1 : game.result === '0-1' ? 0 : 0.5;
    assert.ok(rows.every(row => row.y === expected));
  }
});

test('predeclared analyses retain zero Amazon imbalance as unavailable, not zero strength', () => {
  const { data, historyKeys } = fixture(16), original = structuredClone(data);
  const report = analyzeControls(data, { historyKeys, bootstrap: 0 });
  assert.equal(report.selection.uniqueHistories, 32);
  assert.equal(report.analyses.ordinary.analysis.coverage.games, 16);
  assert.equal(report.analyses.combined.analysis.coverage.games, 32);
  assert.deepEqual(report.analyses.ordinary.featureNames, BASE);
  assert.deepEqual(report.analyses.combined.featureNames, [...BASE, AMAZON]);
  assert.deepEqual(report.analyses.combined.selection.droppedZeroFeatures, BLINKS);
  assert.equal(report.analyses.combined.analysis.rank.fullRank, false);
  assert.equal(report.analyses.combined.amazonBonus.reason, 'unidentifiable-zero-upgrade-imbalance');
  assert.equal(report.analyses.combined.amazonBonus.rawCoefficient, null);
  assert.equal(report.analyses.combined.amazonBonus.rawPawnRatio, null);
  assert.equal(report.decision.amazonBonusStatus, 'unavailable');
  assert.equal(report.analyses.middlegame.analysis.bootstrap.requested, 0);
  assert.equal(report.analyses.endgame.analysis.bootstrap.requested, 0);
  assert.equal(report.analyses.middlegame.selection.samples, 16);
  assert.equal(report.analyses.endgame.selection.samples, 32);
  assert.deepEqual(data, original);
});

test('unused custom columns may be absent but active unsupported pieces cannot be hidden', () => {
  const { data, historyKeys } = fixture(8);
  data.featureNames.splice(7); data.samples.forEach(row => row.x.splice(7));
  const result = analyzeControls(data, { historyKeys, bootstrap: 0 });
  assert.deepEqual(result.analyses.combined.selection.droppedZeroFeatures, []);
  const active = fixture(8); active.data.samples[0].x[7] = 1;
  assert.throws(() => analyzeControls(active.data, { historyKeys: active.historyKeys, bootstrap: 0 }), /active Blink/);
  const unknown = fixture(8); unknown.data.featureNames.push('bonus:another-piece'); unknown.data.samples.forEach(row => row.x.push(0));
  assert.throws(() => analyzeControls(unknown.data, { historyKeys: unknown.historyKeys, bootstrap: 0 }), /Unsupported/);
  const wrongCohort = fixture(8); wrongCohort.data.samples[0].x[6] = 1;
  assert.throws(() => analyzeControls(wrongCohort.data, { historyKeys: wrongCohort.historyKeys, bootstrap: 0 }), /Ordinary control/);
});

test('missing history provenance, differing duplicate samples and corrupted labels fail', () => {
  for (const mutate of [
    ({ historyKeys }) => { delete historyKeys[Object.keys(historyKeys)[0]]; },
    ({ historyKeys }) => { historyKeys.extra = 'a'.repeat(64); },
    ({ historyKeys }) => { historyKeys[Object.keys(historyKeys)[0]] = 'not-a-sha'; },
    ({ data }) => { data.samples[0].y = 0.5; },
    ({ data }) => { data.games[0].samples++; },
    ({ data }) => { data.samples[0].weight = 1; },
    ({ data }) => { data.samples[0].x[0]++; },
    ({ data }) => { data.games[0].comparisonId = 'blink-v-amazon'; },
  ]) {
    const source = fixture(8); mutate(source);
    assert.throws(() => analyzeControls(source.data, { historyKeys: source.historyKeys, bootstrap: 0 }));
  }
});

test('empty phase coverage remains explicit and selection never invents samples', () => {
  const { data, historyKeys } = fixture(8);
  data.samples.forEach(row => row.phase = 'endgame');
  const result = analyzeControls(data, { historyKeys, bootstrap: 0 });
  assert.equal(result.analyses.middlegame.selection.gamesWithoutSamples, 8);
  assert.equal(result.analyses.middlegame.selection.samples, 0);
  assert.equal(result.analyses.middlegame.analysis.fit.reason, 'no-data');
  assert.equal(result.phaseSensitivity.middlegame.available, false);
});

test('analysis rejects unbounded options and does not use a different fit for a preferred result', () => {
  const { data, historyKeys } = fixture(8);
  for (const options of [{ bootstrap: -1 }, { bootstrap: 1001 }, { seed: -1 }, { arbitraryTarget: 4 }]) {
    assert.throws(() => analyzeControls(data, { historyKeys, ...options }));
  }
  const report = analyzeControls(data, { historyKeys, bootstrap: 0 });
  assert.equal(report.method.phaseBootstrap, 0);
  assert.equal(report.method.sourcePoliciesPooled, false);
  assert.equal(report.method.engineGamesStarted, 0);
  assert.equal(report.decision.status, 'diagnostic-only');
});
