'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeBishopDataset, supportedColumns, foldOf } = require('../scripts/balance/bishop-analysis');
const frozen = require('../scripts/balance/reference-analysis');
const core = require('../scripts/balance/reference-regression');
const names = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'tempo', 'bonus:a', 'bonus:b'];
const resultOf = value => value === 0.5 ? '1/2-1/2' : value ? '1-0' : '0-1';

function fixture({ absent = true, groups = 16 } = {}) {
  const random = core.randomSource(9), games = [], samples = [], patterns = [];
  for (let index = 0; index < 100; index++) patterns.push(names.map(name => name === 'tempo' ? index % 2 ? 1 : -1 : Math.floor(random() * 3) - 1));
  for (let group = 0; group < groups; group++) for (const kind of ['single', 'head']) for (const [index, pattern] of patterns.entries()) {
    const x = [...pattern];
    if (absent && kind === 'single') x[7] = 0;
    const eta = x.reduce((sum, value, column) => sum + value * [0.3, 0.9, 0.9, 1.5, 2.7, 0.02, 1.0, 1.0][column], 0);
    const y = random() < 0.22 ? 0.5 : Number(random() < 1 / (1 + Math.exp(-eta)));
    const gameId = `${group}-${kind}-${index}`, groupId = `group-${group}`, aColor = index % 2 ? 'b' : 'w';
    const pairId = kind === 'head' ? `${group}-pair-${Math.floor(index / 2)}` : gameId;
    games.push({ gameId, groupId, pairId, kind, result: resultOf(y), samples: 1,
      designA: 'a', designB: kind === 'head' || !absent ? 'b' : null, aColor, comparisonId: 'a-v-b',
      startX: [0, 0, 0, 0, 0, aColor === 'w' ? 1 : -1, aColor === 'w' ? 1 : -1, kind === 'head' ? aColor === 'w' ? -1 : 1 : 0] });
    samples.push({ gameId, groupId, pairId, x, y, weight: 1 });
  }
  return { featureNames: names, games, samples };
}

test('absent baseline bonus is omitted without suppressing supported ordinary or inherited bonuses', async () => {
  const data = fixture(), result = await analyzeBishopDataset(data, { bootstrap: 20 });
  for (const mode of ['primary', 'diagnostic']) {
    assert.deepEqual(result[mode].baseline.omittedFeatures, ['bonus:b']);
    assert.equal(result[mode].baseline.rank.fullRank, true);
    assert.equal(result[mode].baseline.normalized.available, true);
    assert.ok(Number.isFinite(result[mode].baseline.normalized.values.rook));
    assert.ok(Number.isFinite(result[mode].baseline.normalized.values['bonus:a']));
    assert.equal(Object.hasOwn(result[mode].baseline.normalized.values, 'bonus:b'), false);
    for (const cohort of ['head', 'combined']) {
      assert.deepEqual(result[mode][cohort].omittedFeatures, []);
      assert.equal(result[mode][cohort].rank.fullRank, true);
      assert.equal(result[mode][cohort].normalized.available, true);
      assert.ok(Number.isFinite(result[mode][cohort].normalized.values['bonus:b']));
    }
  }
  assert.equal(result.differences.byFeature['bonus:b'].available, false);
  assert.equal(result.differences.byFeature['bonus:b'].baseline, null);
  assert.equal(result.differences.byFeature['bonus:b'].interval, null);
  assert.equal(result.differences.byFeature['bonus:b'].validReplicates, 0);
  assert.equal(result.differences.byFeature['bonus:a'].validReplicates, 20);
  assert.equal(result.predictions.available, true);
  assert.equal(result.method.groupCount, 16);
});

test('fully observed datasets retain the frozen analysis mathematics exactly', async () => {
  const data = fixture({ absent: false, groups: 8 });
  const a = await analyzeBishopDataset(data, { bootstrap: 20 }), b = await frozen.analyzeReferenceDataset(data, { bootstrap: 20 });
  for (const mode of ['primary', 'diagnostic']) for (const cohort of ['baseline', 'head', 'combined']) {
    assert.deepEqual(a[mode][cohort].fit, b[mode][cohort].fit);
    assert.deepEqual(a[mode][cohort].bootstrap, b[mode][cohort].bootstrap);
    assert.deepEqual(a[mode][cohort].normalized, b[mode][cohort].normalized);
    assert.deepEqual(a[mode][cohort].validation, b[mode][cohort].validation);
  }
  assert.deepEqual(a.predictions, b.predictions);
  assert.deepEqual(a.differences, b.differences);
});

test('nonzero collinearity and an observed purchase with no samples remain unsupported', async () => {
  const data = fixture();
  for (const row of data.samples.filter(row => row.gameId.includes('-head-'))) row.x[7] = row.x[6];
  const result = await analyzeBishopDataset(data, { bootstrap: 20 });
  assert.deepEqual(result.primary.head.omittedFeatures, []);
  assert.equal(result.primary.head.rank.fullRank, false);
  assert.equal(result.primary.head.normalized.available, false);
  const noSamples = { featureNames: names, games: [{ gameId: 'b-purchase', kind: 'single', designA: 'b', startX: Array(8).fill(0) }], samples: [] };
  const supported = supportedColumns(noSamples);
  assert.ok(supported.dataset.featureNames.includes('bonus:b'));
  assert.ok(supported.dataset.featureNames.includes('rook'), 'ordinary columns are never omitted');
  assert.ok(supported.omittedFeatures.includes('bonus:a'));
});

test('whole-position prediction withholding survives the cohort projections', async () => {
  const first = fixture({ groups: 8 }), target = first.games.find(game => game.kind === 'head');
  const changed = structuredClone(first), fold = foldOf(target.groupId, 5);
  for (const game of changed.games.filter(game => foldOf(game.groupId, 5) === fold)) {
    const y = game.result === '1/2-1/2' ? 0.5 : game.result === '1-0' ? 0 : 1;
    game.result = resultOf(y);
    changed.samples.filter(row => row.gameId === game.gameId).forEach(row => { row.y = y; });
  }
  const before = await analyzeBishopDataset(first, { bootstrap: 0 }), after = await analyzeBishopDataset(changed, { bootstrap: 0 });
  const a = before.predictions.games.find(game => game.gameId === target.gameId), b = after.predictions.games.find(game => game.gameId === target.gameId);
  assert.equal(a.available, true);
  assert.equal(a.predictedWhiteScore, b.predictedWhiteScore);
});

test('zero-sample position groups remain coupled and partial color pairs stay out of matchup scores', async () => {
  const data = fixture({ groups: 8 }), game = data.games.find(game => game.kind === 'head');
  data.games.push({ ...game, gameId: 'empty', pairId: 'empty-pair', groupId: 'empty-group', samples: 0 });
  const result = await analyzeBishopDataset(data, { bootstrap: 20 });
  assert.equal(result.primary.baseline.bootstrap.groupCount, 9);
  assert.equal(result.primary.head.bootstrap.groupCount, 9);
  assert.ok(result.differences.groupIds.includes('empty-group'));
  assert.equal(result.predictions.matchups[0].partialGames, 1);
  assert.equal(result.predictions.matchups[0].games, data.games.filter(game => game.kind === 'head').length - 1);
});

test('analysis cancellation yields without returning partial estimates', async () => {
  const controller = new AbortController();
  await assert.rejects(analyzeBishopDataset(fixture({ groups: 8 }), { bootstrap: 200, signal: controller.signal,
    onProgress(event) { if (event.phase === 'coupled-bootstrap' && event.completed === 5) controller.abort(); } }),
  error => error.name === 'AbortError' && error.code === 'ABORT_ERR');
});
