'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeDecisionMaterial } = require('../scripts/balance/decision-material-fit');
const { supportedColumns } = require('../scripts/balance/bishop-analysis');
const core = require('../scripts/balance/reference-regression');
const IDS = ['rook.purple@10', 'knight.purple@3', 'bishop.purple@13', 'queen.purple@1', 'bishop.purple@12'];
const NAMES = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'tempo', ...IDS.map(id => `bonus:${id}`), 'bonus:bishop.purple@7'];
const pairings = [[IDS[2], IDS[0]], [IDS[2], IDS[1]], [IDS[2], IDS[3]], [IDS[4], IDS[1]], [IDS[4], IDS[3]]];
const resultOf = y => y === 0.5 ? '1/2-1/2' : y ? '1-0' : '0-1';
function fixture({ groups = 16, pairs = 20 } = {}) {
  const random = core.randomSource(17), games = [], samples = [];
  for (let group = 0; group < groups; group++) for (let pair = 0; pair < pairs; pair++) {
    const [designA, designB] = pairings[pair % pairings.length];
    for (const aColor of ['w', 'b']) {
      const x = NAMES.map(name => name === 'bonus:bishop.purple@7' ? 0 : name === 'tempo' ? aColor === 'w' ? 1 : -1 : Math.floor(random() * 5) - 2);
      const eta = x.reduce((sum, value, column) => sum + value * [0.3, 0.85, 0.9, 1.4, 2.7, 0.01, 0.9, 0.9, 1.0, 1.1, 0.8, 0][column], 0);
      const y = random() < 0.15 ? 0.5 : Number(random() < 1 / (1 + Math.exp(-eta)));
      const gameId = `${group}-${pair}-${aColor}`, pairId = `${group}-${pair}`, groupId = `opening-${group}`;
      games.push({ gameId, pairId, groupId, samples: 1, result: resultOf(y), kind: 'head', designA, designB, aColor,
        comparisonId: designA + '/' + designB });
      samples.push({ gameId, pairId, groupId, x, y, weight: 1 });
    }
  }
  return { featureNames: NAMES, games, samples };
}

test('new-only fit keeps observed nuisance bonuses and reports same-fit whole-piece values', async () => {
  const result = await analyzeDecisionMaterial(fixture(), { bootstrap: 20 });
  assert.deepEqual(result.omittedFeatures, ['bonus:bishop.purple@7']);
  assert.equal(result.method.historicalPooling, false);
  assert.equal(result.analysis.rank.fullRank, true);
  assert.equal(result.analysis.normalized.available, true);
  assert.equal(result.analysis.validation.available, true);
  assert.equal(result.analysis.bootstrap.completed, 20);
  assert.equal(result.analysis.bootstrap.validRatios, 20);
  assert.equal(result.analysis.normalized.values.pawn, 1);
  assert.equal(result.analysis.normalized.values.queen, 9);
  assert.ok(result.estimates.bonuses['bishop.purple@12'].available);
  assert.equal(result.wholePieces.length, 4);
  for (const piece of result.wholePieces) {
    assert.equal(piece.available, true);
    assert.equal(piece.value, piece.ordinary + piece.bonus);
    assert.equal(piece.validReplicates, 20);
    assert.ok(Number.isFinite(piece.interval.lower) && Number.isFinite(piece.interval.upper));
  }
});

test('whole-piece intervals use joint refits rather than independent marginal endpoint sums', async () => {
  const data = fixture({ groups: 12, pairs: 12 });
  const result = await analyzeDecisionMaterial(data, { bootstrap: 20, seed: 91 });
  const { dataset } = supportedColumns(data), prepared = core.prepare(dataset, { bootstrap: 20, seed: 91, validationFolds: 5 });
  const groups = core.unique(data.games.map(game => game.groupId)), random = core.randomSource(91), values = [];
  for (let replicate = 0; replicate < 20; replicate++) {
    const multiplicities = new Map();
    for (let index = 0; index < groups.length; index++) {
      const group = groups[Math.floor(random() * groups.length)]; multiplicities.set(group, (multiplicities.get(group) || 0) + 1);
    }
    const rows = [...multiplicities].flatMap(([group, count]) => prepared.rows.filter(row => row.groupId === group).map(row => ({ ...row, weight: row.weight * count })));
    const model = core.fit(rows, prepared.names, { pawn: 1, queen: 9 });
    assert.equal(model.converged, true); assert.equal(core.modelRank(rows, prepared.names, { pawn: 1, queen: 9 }).fullRank, true);
    values.push((model.coefficients.bishop + model.coefficients['bonus:bishop.purple@13']) / model.coefficients.pawn);
  }
  const whole = result.wholePieces.find(piece => piece.id === 'bishop.purple@13');
  const joint = core.interval(values);
  assert.ok(Math.abs(whole.interval.lower - joint.lower) < 1e-10);
  assert.ok(Math.abs(whole.interval.upper - joint.upper) < 1e-10);
  const ordinary = result.analysis.bootstrap.ratioIntervals.bishop, bonus = result.analysis.bootstrap.ratioIntervals['bonus:bishop.purple@13'];
  assert.notDeepEqual(whole.interval, { lower: ordinary.lower + bonus.lower, upper: ordinary.upper + bonus.upper });
});

test('zero-sample opening groups stay in the bootstrap universe without manufacturing fit rows', async () => {
  const data = fixture();
  const source = data.games[0];
  for (const aColor of ['w', 'b']) data.games.push({ ...source, gameId: `empty-${aColor}`, pairId: 'empty-pair', groupId: 'empty-opening', aColor, samples: 0 });
  const result = await analyzeDecisionMaterial(data, { bootstrap: 20 });
  assert.equal(result.method.groupCount, 17);
  assert.equal(result.analysis.bootstrap.groupCount, 17);
  assert.equal(result.analysis.coverage.allGameGroups, 17);
  assert.deepEqual(result.analysis.coverage.zeroSampleGroups, ['empty-opening']);
  assert.equal(result.analysis.coverage.samples, data.samples.length);
});

test('observed collinear bonuses remain in the model and failed resamples are counted', async () => {
  const data = fixture();
  const a = data.featureNames.indexOf('bonus:bishop.purple@13'), b = data.featureNames.indexOf('bonus:bishop.purple@12');
  for (const sample of data.samples) sample.x[b] = sample.x[a];
  const result = await analyzeDecisionMaterial(data, { bootstrap: 20 });
  assert.ok(!result.omittedFeatures.includes('bonus:bishop.purple@12'));
  assert.equal(result.analysis.rank.fullRank, false);
  assert.equal(result.analysis.normalized.available, false);
  assert.equal(result.analysis.bootstrap.rankDeficient, 20);
  assert.equal(result.analysis.bootstrap.validRatios, 0);
  assert.equal(result.analysis.validation.available, false);
  assert.equal(result.analysis.validation.metrics, null);
  assert.ok(result.wholePieces.every(piece => !piece.available && piece.value === null && piece.interval === null));
});

test('head-only scope, complete pairs, weights and fixed option schema are checked', async () => {
  for (const mutate of [
    data => data.games[0].kind = 'single',
    data => data.games[0].designB = data.games[0].designA,
    data => data.games[0].aColor = 'b',
    data => data.games[0].comparisonId = 'another-comparison',
    data => data.samples[0].weight = 2,
    data => data.games[0].groupId = 'another-group',
  ]) {
    const data = fixture({ groups: 8, pairs: 2 }); mutate(data);
    await assert.rejects(analyzeDecisionMaterial(data, { bootstrap: 0 }));
  }
  for (const options of [{ anchors: { pawn: 1, queen: 8 } }, { bootstrap: -1 }, { validationFolds: 1 }]) {
    await assert.rejects(analyzeDecisionMaterial(fixture({ groups: 8, pairs: 2 }), options));
  }
});

test('cancellation yields between bootstrap blocks without returning partial material estimates', async () => {
  const controller = new AbortController();
  await assert.rejects(analyzeDecisionMaterial(fixture(), { bootstrap: 200, signal: controller.signal,
    onProgress(event) { if (event.phase === 'bootstrap' && event.completed === 5) controller.abort(); } }),
  error => error.name === 'AbortError' && error.code === 'ABORT_ERR');
});
