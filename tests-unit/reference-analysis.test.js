'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeReferenceDataset, foldOf } = require('../scripts/balance/reference-analysis');
const core = require('../scripts/balance/reference-regression');
const legacy = require('../scripts/balance/material-regression');

const names = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'tempo', 'bonus:a', 'bonus:b', 'bonus:c', 'bonus:d'];
const scoreResult = value => value === 0.5 ? '1/2-1/2' : value ? '1-0' : '0-1';

// Identical but separately played cohort observations make the correct paired
// contrast exactly zero for every shared bootstrap draw, even with wide values.
function fixture(groupCount = 16) {
  const random = core.randomSource(42), patterns = [];
  for (let index = 0; index < 48; index++) {
    const x = names.map(name => name === 'tempo' ? index % 2 ? 1 : -1 : Math.floor(random() * 3) - 1);
    const eta = x.reduce((sum, value, column) => sum + value * [0.4, 1.2, 1.2, 2, 3.6, 0.02, 1.4, 1.4, 1.4, 1.4][column], 0);
    const y = random() < 0.22 ? 0.5 : Number(random() < 1 / (1 + Math.exp(-eta)));
    patterns.push({ x, y });
  }
  const games = [], samples = [];
  for (let group = 0; group < groupCount; group++) for (const kind of ['single', 'head']) {
    for (let index = 0; index < patterns.length; index++) {
      const { x, y } = patterns[index], gameId = `${group}-${kind}-${index}`, groupId = `group-${group}`;
      const pairId = kind === 'head' ? `${group}-pair-${Math.floor(index / 2)}` : gameId;
      const aColor = index % 2 ? 'b' : 'w';
      games.push({ gameId, groupId, pairId, kind, result: scoreResult(y), samples: 1,
        designA: 'a', designB: 'b', aColor, comparisonId: 'a-v-b',
        startX: [0, 0, 0, 0, 0, aColor === 'w' ? 1 : -1, 1, -1, 0, 0] });
      samples.push({ gameId, groupId, pairId, x: [...x], y, weight: 1 });
    }
  }
  return { featureNames: names, games, samples };
}

test('reference regression retains the frozen estimator mathematics', () => {
  const data = fixture(8);
  for (const anchors of [null, { pawn: 1, queen: 9 }]) {
    const options = { anchors, bootstrap: 0, validationFolds: 5 };
    assert.deepEqual(core.analyzeDataset(data, options), legacy.analyzeDataset(data, options));
  }
});

test('known anchored effects and draw outcomes are recovered on a controlled design', () => {
  const random = core.randomSource(9), trueValues = [1, 3, 3, 5, 9, 0, 4], features = names.slice(0, 6).concat('bonus:a');
  const rows = [];
  for (let pattern = 0; pattern < 180; pattern++) {
    const x = features.map((name, column) => name === 'tempo' ? pattern % 2 ? 1 : -1
      : column === 0 ? Math.floor(random() * 7) - 3 : Math.floor(random() * 3) - 1);
    const eta = 0.2 * x.reduce((sum, value, column) => sum + value * trueValues[column], 0);
    const probability = 1 / (1 + Math.exp(-eta)), points = Math.round(40 * probability);
    // Twenty games with a half-point resolution represent the chosen expected
    // score to within 0.0125 and retain draws rather than dropping them.
    for (let index = 0; index < 20; index++) {
      const remaining = points - 2 * index, y = remaining >= 2 ? 1 : remaining === 1 ? 0.5 : 0;
      rows.push({ x, y, weight: 1 });
    }
  }
  const fitted = core.fit(rows, features, { pawn: 1, queen: 9 });
  assert.equal(fitted.converged, true);
  assert.ok(rows.some(row => row.y === 0.5));
  for (const [column, name] of features.entries()) {
    assert.ok(Math.abs(fitted.coefficients[name] / fitted.coefficients.pawn - trueValues[column]) < 0.25, name);
  }
});

test('coupled bootstrap fits all games and gives exact paired agreement for identical cohorts', async () => {
  const data = fixture(), progress = [];
  const result = await analyzeReferenceDataset(data, { bootstrap: 20, onProgress: event => progress.push(event) });
  assert.equal(result.primary.combined.coverage.games, data.games.length);
  assert.equal(result.primary.baseline.coverage.games, data.games.length / 2);
  assert.equal(result.primary.head.coverage.games, data.games.length / 2);
  for (const mode of ['primary', 'diagnostic']) for (const cohort of ['baseline', 'head', 'combined']) {
    const analysis = result[mode][cohort];
    assert.equal(analysis.bootstrap.completed, 20);
    assert.equal(analysis.bootstrap.validRatios, 20);
    assert.equal(analysis.rank.fullRank, true);
    assert.equal(analysis.normalized.available, true);
  }
  assert.equal(result.primary.combined.normalized.values.queen, 9);
  assert.equal(result.differences.direction, 'head-minus-baseline');
  assert.equal(result.differences.groupIds.length, 16);
  for (const difference of Object.values(result.differences.byFeature)) {
    assert.equal(difference.available, true);
    assert.equal(difference.difference, 0);
    assert.deepEqual(difference.interval, { lower: 0, upper: 0 });
    assert.equal(difference.decision, 'agreement-at-resolution');
  }
  assert.ok(progress.some(event => event.phase === 'coupled-bootstrap' && event.completed === 20));
  const matchup = result.predictions.matchups[0];
  assert.equal(matchup.completePairs, data.games.length / 4);
  assert.equal(matchup.games, data.games.length / 2);
  assert.equal(matchup.games, matchup.wins + matchup.draws + matchup.losses);
  assert.equal(result.predictions.errorDirection, 'observed-minus-predicted');
  assert.ok(Math.abs(matchup.predictionError) > 0.01, 'nonzero fixture must detect residual sign');
  assert.ok(Math.abs(matchup.predictionError - (matchup.observedAScore - matchup.predictedAScore)) < 1e-12);
});

test('zero-sample groups remain in the shared bootstrap universe and receive start predictions', async () => {
  const data = fixture(), template = data.games.find(game => game.kind === 'head');
  data.games.push({ ...template, gameId: 'empty-game', pairId: 'empty-pair', groupId: 'empty-group', samples: 0 });
  const result = await analyzeReferenceDataset(data, { bootstrap: 20 });
  assert.ok(result.differences.groupIds.includes('empty-group'));
  for (const cohort of ['baseline', 'head', 'combined']) assert.equal(result.primary[cohort].bootstrap.groupCount, 17);
  const predicted = result.predictions.games.find(game => game.gameId === 'empty-game');
  assert.equal(predicted.available, true);
  assert.ok(Number.isFinite(predicted.predictedAScore));
  assert.equal(result.predictions.matchups[0].partialGames, 1);
});

test('whole-fold withholding prevents a held-out outcome changing its own prediction', async () => {
  const first = fixture(), target = first.games.find(game => game.kind === 'head');
  const fold = foldOf(target.groupId, 5), changed = structuredClone(first);
  for (const game of changed.games.filter(game => foldOf(game.groupId, 5) === fold)) {
    const y = game.result === '1/2-1/2' ? 0.5 : game.result === '1-0' ? 0 : 1;
    game.result = scoreResult(y);
    for (const row of changed.samples.filter(row => row.gameId === game.gameId)) row.y = y;
  }
  const a = await analyzeReferenceDataset(first, { bootstrap: 0 });
  const b = await analyzeReferenceDataset(changed, { bootstrap: 0 });
  const before = a.predictions.games.find(game => game.gameId === target.gameId);
  const after = b.predictions.games.find(game => game.gameId === target.gameId);
  assert.equal(before.available, true);
  assert.equal(before.predictedWhiteScore, after.predictedWhiteScore);
  const record = a.predictions.folds.find(value => value.fold === fold);
  assert.ok(record.testGroups.includes(target.groupId));
  assert.ok(!record.trainingGroups.includes(target.groupId));
});

test('partial color pairs inform material fits but do not enter paired matchup scores', async () => {
  const data = fixture(), removed = data.games.find(game => game.kind === 'head');
  data.games = data.games.filter(game => game.gameId !== removed.gameId);
  data.samples = data.samples.filter(row => row.gameId !== removed.gameId);
  const result = await analyzeReferenceDataset(data, { bootstrap: 0 });
  assert.equal(result.primary.combined.coverage.games, data.games.length);
  const matchup = result.predictions.matchups[0];
  assert.equal(matchup.completedGames, data.games.filter(game => game.kind === 'head').length);
  assert.equal(matchup.partialGames, 1);
  assert.equal(matchup.partialPairs, 1);
  assert.equal(matchup.games, matchup.completedGames - 1);
  assert.equal(matchup.allCompleted.games, matchup.completedGames);
  assert.equal(matchup.pairedObservedAScore, matchup.observedAScore);
});

test('rank-deficient head evidence withholds absolute bonuses and cohort agreement', async () => {
  const data = fixture();
  for (const row of data.samples.filter(row => row.gameId.includes('-head-'))) row.x[7] = row.x[6];
  const result = await analyzeReferenceDataset(data, { bootstrap: 20 });
  assert.equal(result.primary.head.rank.fullRank, false);
  assert.equal(result.primary.head.normalized.available, false);
  assert.equal(result.primary.head.normalized.values, null);
  for (const difference of Object.values(result.differences.byFeature)) {
    assert.equal(difference.available, false);
    assert.equal(difference.head, null);
    assert.equal(difference.interval, null);
    assert.equal(difference.decision, 'unavailable');
  }
});

test('repeated rows retain unit game weights and do not change estimates', async () => {
  const first = fixture(), repeated = structuredClone(first);
  repeated.samples = repeated.samples.flatMap(row => [{ ...row, weight: 0.5 }, { ...row, x: [...row.x], weight: 0.5 }]);
  repeated.games.forEach(game => { game.samples = 2; });
  const a = await analyzeReferenceDataset(first, { bootstrap: 20 });
  const b = await analyzeReferenceDataset(repeated, { bootstrap: 20 });
  for (const name of names) assert.ok(Math.abs(a.primary.combined.normalized.values[name] - b.primary.combined.normalized.values[name]) < 1e-9);
});

test('analysis yields and aborts with a recoverable signal before producing a partial result', async () => {
  const controller = new AbortController(), events = [];
  await assert.rejects(analyzeReferenceDataset(fixture(), { bootstrap: 200, signal: controller.signal,
    onProgress(event) { events.push(event); if (event.phase === 'coupled-bootstrap' && event.completed === 5) controller.abort(); } }),
  error => error.name === 'AbortError' && error.code === 'ABORT_ERR');
  assert.equal(events.at(-1).completed, 5);
});

test('empty evidence stays unavailable and malformed identity or controls fail explicitly', async () => {
  const empty = await analyzeReferenceDataset({ featureNames: names, games: [], samples: [] }, { bootstrap: 20 });
  assert.equal(empty.primary.combined.normalized.available, false);
  assert.equal(empty.predictions.reason, 'no-head-to-head-games');
  assert.equal(empty.differences.byFeature['bonus:a'].decision, 'unavailable');
  const broken = fixture(); broken.games.find(game => game.kind === 'head').startX = [0];
  await assert.rejects(analyzeReferenceDataset(broken), /start features/);
  await assert.rejects(analyzeReferenceDataset(fixture(), { jobs: 4 }), /Unknown reference analysis option/);
  await assert.rejects(analyzeReferenceDataset(fixture(), { anchors: { pawn: 1, queen: 10 } }), /assumes pawn=1 and queen=9/);
});
