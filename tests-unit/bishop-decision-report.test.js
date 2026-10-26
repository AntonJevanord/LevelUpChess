'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { makeDecisionReport, writeDecisionReport, markdown } = require('../scripts/balance/bishop-decision-report');

const B7 = 'bishop.purple@7', B12 = 'bishop.purple@12', B13 = 'bishop.purple@13';
const RFB = 'rook.purple@10', NC = 'knight.purple@3', AMAZON = 'queen.purple@1';
const SETTINGS = { seed: 42, nodes: 20000, threads: 1, hashMb: 32, maxPlies: 400, skill: 20 };
const sha = value => createHash('sha256').update(value).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));

function profile(name, evaluation) {
  const registry = { hash: `${name}-registry`, definitions: [], allocations: [] };
  return { hash: `${name}-profile`, variant: `${name}-variant`, registry,
    ...(evaluation === undefined ? {} : { evaluation }) };
}

function games(openings, comparisons, prefix) {
  return openings.flatMap(opening => comparisons.flatMap(([designA, designB]) => {
    const comparisonId = `${designA}-v-${designB}`, unitId = `${prefix}-${opening.id}-${comparisonId}`;
    return ['w', 'b'].map(aColor => ({ id: `${unitId}-${aColor}`, unitId, pairId: unitId,
      kind: 'head', comparisonId, openingId: opening.id, startFen: opening.fen, aColor,
      designA, designB, whiteDesign: aColor === 'w' ? designA : designB,
      blackDesign: aColor === 'b' ? designA : designB }));
  }));
}

function record(game, itemProfile, patch = {}) {
  return { ...game, schemaVersion: 1, attempt: 1, status: 'completed', result: '1/2-1/2',
    reason: 'threefold-repetition', moves: ['a1a2', 'h8h7'], sans: ['Ra2', 'Rh7'],
    openingMoves: [], openingPlies: 0, totalPlies: 2, playedPlies: 2,
    finalFen: '7k/8/8/8/8/8/R7/K7 w - - 2 2',
    profileHash: itemProfile.hash, registryHash: itemProfile.registry.hash,
    registryReference: 'collection.json#plan.registry', variant: itemProfile.variant,
    royalMode: 'king', evaluationCaveat: null,
    ...(itemProfile.evaluation === undefined ? {} : { evaluation: clone(itemProfile.evaluation) }),
    engine: { nodes: SETTINGS.nodes, threads: SETTINGS.threads, hashMb: SETTINGS.hashMb, maxPlies: SETTINGS.maxPlies },
    whiteStrength: { skill: 20 }, blackStrength: { skill: 20 }, ...patch };
}

function truncated(item) {
  return { ...item, status: 'truncated', result: '*', reason: 'max-plies',
    moves: Array.from({ length: SETTINGS.maxPlies }, (_, index) => `move-${index}`),
    sans: Array.from({ length: SETTINGS.maxPlies }, (_, index) => `SAN-${index}`),
    totalPlies: SETTINGS.maxPlies, playedPlies: SETTINGS.maxPlies };
}

function fixture({ restore = 192, historical = true } = {}) {
  const openings = Array.from({ length: 128 }, (_, index) => ({
    id: `reference-${String(index + 1).padStart(3, '0')}`, fen: '7k/8/8/8/8/8/8/KR6 w - - 0 1' }));
  const oldProfile = profile('automatic'), bishopProfile = profile('bishop', { pieceValues: { 'rook.purple@9': { mg: 2538, eg: 2682 } } });
  const restoreSchedule = games(openings.slice(80), [[B7, NC], [B7, AMAZON]], 'revision').slice(0, restore);
  const compareSchedule = games(openings, [[B12, NC], [B12, AMAZON], [B13, RFB], [B13, NC], [B13, AMAZON]], 'decision');
  const stage = (id, schedule, itemProfile, checkpoints) => ({ id, schemaVersion: 1, profile: itemProfile,
    registry: itemProfile.registry, settings: { ...SETTINGS }, openings, schedule,
    units: schedule.filter(game => game.aColor === 'w').map(game => ({ id: game.unitId,
      gameIds: [game.id, `${game.unitId}-b`] })), study: { checkpoints } });
  const plan = { id: 'bishop-decision-v16-001', openings,
    stages: [{ key: 'restore', plan: stage('restore', restoreSchedule, oldProfile, restore ? [restore] : []) },
      { key: 'compare', plan: stage('compare', compareSchedule, bishopProfile, [320, 640, 1280]) }],
    inheritedBishopRecords: historical ? games(openings, [[B7, RFB], [B12, RFB]], 'bishop').map(game => record(game, bishopProfile)) : [],
    restoredRecords: historical ? games(openings.slice(0, 80), [[B7, NC], [B7, AMAZON]], 'revision').map(game => record(game, oldProfile)) : [],
    sourceEvidence: [], sources: { bishop: { originalManifestSupplied: false }, revision: { historicalNativeInventoryVerified: false } } };
  const stageRecords = { restore: restoreSchedule.map(game => record(game, oldProfile)),
    compare: compareSchedule.map(game => record(game, bishopProfile)) };
  return { plan, stageRecords, oldProfile, bishopProfile };
}

function matchup(report, designA, designB) {
  return report.matchups.find(row => row.designA === designA && row.designB === designB);
}

function directory(t, data, { compare = 320, restore = data.stageRecords.restore.length } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bishop-decision-report-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bytes = Buffer.from('frozen source evidence\n');
  data.plan.sourceEvidence = [{ name: 'original.games.jsonl', file: 'experiments/source.games.jsonl', sha256: sha(bytes) }];
  fs.mkdirSync(path.join(root, 'evidence'));
  fs.writeFileSync(path.join(root, 'evidence', 'original.games.jsonl'), bytes);
  fs.writeFileSync(path.join(root, 'campaign.json'), JSON.stringify({ schemaVersion: 1,
    format: 'levelup-bishop-decision-campaign', runId: 'decision-report-fixture', plan: data.plan,
    identity: { fixture: true }, native: { restore: { passed: true }, compare: { passed: true } } }));
  for (const [key, count] of [['restore', restore], ['compare', compare]]) {
    fs.mkdirSync(path.join(root, key));
    const stagePlan = data.plan.stages.find(stage => stage.key === key).plan;
    const manifest = { schemaVersion: 1, format: 'levelup-head-collection', runId: `synthetic-${key}`,
      jobs: 4, plan: stagePlan, identity: { fixture: true }, native: { passed: true } };
    fs.writeFileSync(path.join(root, key, 'run.json'), JSON.stringify(manifest));
    fs.writeFileSync(path.join(root, key, 'collection.json'), JSON.stringify(manifest));
    fs.writeFileSync(path.join(root, key, 'games.jsonl'), data.stageRecords[key].slice(0, count)
      .map(value => JSON.stringify(value) + '\n').join(''));
  }
  return root;
}

test('decision reports expose all nine comparisons with unavailable scores before any scored pair', () => {
  const { plan } = fixture({ restore: 0, historical: false });
  const report = makeDecisionReport({ plan });
  assert.equal(report.status, 'provisional');
  assert.equal(report.matchups.length, 9);
  assert.equal(report.coverage.expectedPairs, 1152);
  assert.equal(report.coverage.missingPairs, 1152);
  for (const row of report.matchups) {
    assert.equal(row.score, null); assert.equal(row.interval, null);
    assert.equal(row.games, 0); assert.equal(row.pairs, 0); assert.equal(row.missingPairs, 128);
    assert.equal(row.status, 'unobserved');
  }
  assert.match(markdown(report), /unavailable/);
  assert.match(markdown(report), /No engine searches/);
});

test('candidate point scores invert the black result and count draws as half on complete color pairs', () => {
  const data = fixture({ restore: 0, historical: false }), records = data.stageRecords.compare.slice(0, 20);
  records[0].result = '1-0'; records[1].result = '1/2-1/2';
  records[10].result = '0-1'; records[11].result = '0-1';
  const report = makeDecisionReport({ plan: data.plan, stageRecords: { compare: records }, bootstrap: 0 });
  const row = matchup(report, B12, NC);
  assert.equal(row.games, 4); assert.equal(row.pairs, 2);
  assert.deepEqual([row.wins, row.draws, row.losses], [2, 1, 1]);
  assert.equal(row.score, 0.625);
  assert.equal(row.interval, null); assert.equal(row.bootstrap.reason, 'disabled');
  assert.equal(row.missingPairs, 126);
});

test('completed games with a truncated or missing partner are visible and excluded from the paired score', () => {
  const data = fixture({ restore: 0, historical: false });
  const first = data.stageRecords.compare[0], capped = truncated(data.stageRecords.compare[1]);
  const lonely = data.stageRecords.compare[10];
  const row = matchup(makeDecisionReport({ plan: data.plan, stageRecords: { compare: [first, capped, lonely] } }), B12, NC);
  assert.equal(row.completedGames, 2); assert.equal(row.unpairedGames, 2);
  assert.equal(row.games, 0); assert.equal(row.score, null);
  assert.equal(row.statusCounts.truncated, 1);
  assert.equal(row.missingPairs, 128);
});

test('complete linked evidence covers every pair once and retains source policy contexts', () => {
  const data = fixture(), report = makeDecisionReport(data);
  assert.equal(report.status, 'complete'); assert.equal(report.complete, true);
  assert.equal(report.coverage.scoredPairs, 1152); assert.equal(report.coverage.pairedGames, 2304);
  assert.equal(report.coverage.inheritedBishopGames, 512); assert.equal(report.coverage.restoredRevisionGames, 320);
  assert.deepEqual(report.coverage.stages.map(stage => stage.finalizedGames), [192, 1280]);
  assert.equal(report.sources[0].originalManifestSupplied, false);
  assert.equal(report.sources[1].historicalNativeInventoryVerified, false);
  assert.equal(report.sources[0].policies[0].profileHash, data.bishopProfile.hash);
  assert.equal(report.sources[1].policies[0].profileHash, data.oldProfile.hash);
  assert.ok(report.matchups.every(row => row.games === 256 && row.pairs === 128 && row.score === 0.5));
});

test('bootstrap intervals are deterministic paired resamples of the fixed original opening groups', () => {
  const data = fixture({ restore: 0, historical: false });
  for (const item of data.stageRecords.compare) {
    const index = Number(item.openingId.slice(-3)) - 1;
    const candidateWins = index < 47;
    item.result = candidateWins === (item.aColor === 'w') ? '1-0' : '0-1';
  }
  const first = makeDecisionReport(data), second = makeDecisionReport(data);
  const row = matchup(first, B12, NC), correlated = matchup(first, B13, AMAZON);
  assert.equal(first.method.seed, 42); assert.equal(first.method.bootstrap, 200);
  assert.equal(first.method.groupCount, 128);
  assert.deepEqual(first.method.openingIds, data.plan.openings.map(opening => opening.id));
  assert.equal(row.score, 47 / 128); assert.equal(row.bootstrap.valid, 200);
  assert.deepEqual(row.interval, correlated.interval);
  assert.deepEqual(first.matchups, second.matchups);
  assert.ok(row.interval.lower < row.score && row.interval.upper > row.score);
  assert.equal(row.interval.lower * 128, Math.round(row.interval.lower * 128));
  assert.equal(row.interval.upper * 128, Math.round(row.interval.upper * 128));
});

test('stage records reject changed identities, policies, move counts and unscored results', () => {
  const data = fixture(), good = data.stageRecords.compare[0];
  const patches = [{ id: 'foreign' }, { unitId: 'wrong' }, { pairId: 'wrong' }, { kind: 'single' },
    { openingId: 'foreign' }, { aColor: 'b' }, { designA: B7 }, { designB: RFB }, { whiteDesign: B7 },
    { blackDesign: RFB }, { startFen: 'changed' }, { comparisonId: 'changed' }, { profileHash: 'changed' },
    { registryHash: 'changed' }, { registryReference: 'run.json' }, { variant: 'chess' }, { royalMode: 'none' },
    { evaluationCaveat: 'changed' }, { evaluation: undefined }, { engine: { ...good.engine, nodes: 1 } },
    { whiteStrength: { skill: 19 } }, { blackStrength: { skill: 19 } }, { moves: ['a1a2'] },
    { sans: [] }, { totalPlies: 1 }, { playedPlies: 1 }, { openingPlies: 1 }, { openingMoves: ['a1a2'] },
    { attempt: 0 }, { status: 'unknown' }, { status: 'aborted', result: '1-0' }, { result: '*' }, { finalFen: '' }];
  for (const patch of patches) assert.throws(() => makeDecisionReport({ plan: data.plan,
    stageRecords: { compare: [{ ...good, ...patch }] } }), undefined, JSON.stringify(patch));
  const changedOpenings = clone(data.plan); changedOpenings.openings.pop();
  assert.throws(() => makeDecisionReport({ plan: changedOpenings }), /128 opening groups/);
  const oversized = clone(data.plan); oversized.stages[0].plan.schedule.push(...clone(oversized.stages[0].plan.schedule));
  assert.throws(() => makeDecisionReport({ plan: oversized }));
});

test('retries retain both move and SAN prefixes and completed histories cannot be replaced', () => {
  const data = fixture(), completed = data.stageRecords.compare[0];
  const aborted = { ...completed, status: 'aborted', result: '*', reason: 'cancelled',
    moves: completed.moves.slice(0, 1), sans: completed.sans.slice(0, 1), totalPlies: 1, playedPlies: 1 };
  const resumed = { ...completed, attempt: 2 };
  const report = makeDecisionReport({ plan: data.plan, stageRecords: { compare: [aborted, resumed, resumed] } });
  assert.equal(report.coverage.stages[1].observedGames, 1);
  assert.equal(report.coverage.stages[1].statusCounts.completed, 1);
  for (const changed of [{ ...resumed, moves: ['b1b2', 'h8h7'] },
    { ...resumed, sans: ['Rb2', 'Rh7'] }, { ...completed, attempt: 1 }]) {
    assert.throws(() => makeDecisionReport({ plan: data.plan,
      stageRecords: { compare: [aborted, changed] } }), /Conflicting/);
  }
  assert.throws(() => makeDecisionReport({ plan: data.plan,
    stageRecords: { compare: [completed, resumed] } }), /completed history/);
});

test('stage truncations must finish exactly at the declared ply cap with the cap reason', () => {
  const data = fixture(), capped = truncated(data.stageRecords.compare[0]);
  const short = { ...capped, moves: capped.moves.slice(0, 399), sans: capped.sans.slice(0, 399),
    totalPlies: 399, playedPlies: 399 };
  const long = { ...capped, moves: [...capped.moves, 'extra'], sans: [...capped.sans, 'extra'],
    totalPlies: 401, playedPlies: 401 };
  for (const invalid of [short, { ...capped, reason: 'cancelled' }]) {
    assert.throws(() => makeDecisionReport({ plan: data.plan,
      stageRecords: { compare: [invalid] } }), /truncation must end at the declared ply cap/);
  }
  assert.throws(() => makeDecisionReport({ plan: data.plan,
    stageRecords: { compare: [long] } }), /declared ply cap|identity or search policy mismatch/);
  const report = makeDecisionReport({ plan: data.plan, stageRecords: { compare: [capped] } });
  assert.equal(report.coverage.stages[1].statusCounts.truncated, 1);
});

test('historical IDs deduplicate exact records and reject conflicting completed source histories', () => {
  const data = fixture(), original = data.plan.restoredRecords[0];
  data.plan.restoredRecords.push(clone(original));
  const report = makeDecisionReport({ plan: data.plan });
  assert.equal(report.coverage.uniqueGameIds, 832);
  assert.equal(matchup(report, B7, RFB).games, 256);
  data.plan.stages[0].plan.schedule[0] = clone(original);
  const duplicate = makeDecisionReport({ plan: data.plan, stageRecords: { restore: [clone(original)] } });
  assert.equal(duplicate.coverage.uniqueGameIds, 832);
  assert.throws(() => makeDecisionReport({ plan: data.plan,
    stageRecords: { restore: [{ ...original, result: '1-0' }] } }), /Conflicting completed history across decision sources/);
  data.plan.restoredRecords[data.plan.restoredRecords.length - 1].result = '1-0';
  assert.throws(() => makeDecisionReport({ plan: data.plan }), /Conflicting/);
});

test('historical evidence accepts only finalized records from the declared source matchups', () => {
  const data = fixture();
  for (const [field, patch] of [['inheritedBishopRecords', { designA: B13 }],
    ['inheritedBishopRecords', { designB: NC }], ['restoredRecords', { designB: RFB }],
    ['restoredRecords', { kind: 'single' }],
    ['restoredRecords', { status: 'aborted', result: '*', reason: 'cancelled' }]]) {
    const plan = { ...data.plan, [field]: [{ ...data.plan[field][0], ...patch }] };
    assert.throws(() => makeDecisionReport({ plan }), /source matchup or status/);
  }
  const original = data.plan.inheritedBishopRecords[0];
  const truncated = { ...original, status: 'truncated', result: '*', reason: 'max-plies' };
  const plan = { ...data.plan, inheritedBishopRecords: [truncated] };
  const row = matchup(makeDecisionReport({ plan }), B7, RFB);
  assert.equal(row.statusCounts.truncated, 1); assert.equal(row.score, null);
});

test('checkpoints require finalized earlier stages and prefixes and ignore later valid games', () => {
  const data = fixture(), checkpoint = { stage: 'compare', count: 320 };
  assert.throws(() => makeDecisionReport({ plan: data.plan,
    stageRecords: { compare: data.stageRecords.compare.slice(0, 320) }, checkpoint }), /every scheduled prefix/);
  assert.throws(() => makeDecisionReport({ plan: data.plan,
    stageRecords: { restore: data.stageRecords.restore, compare: data.stageRecords.compare.slice(0, 319) }, checkpoint }), /every scheduled prefix/);
  const first = makeDecisionReport({ ...data, checkpoint });
  const second = makeDecisionReport({ plan: data.plan,
    stageRecords: { restore: data.stageRecords.restore, compare: data.stageRecords.compare.slice(0, 320) }, checkpoint });
  assert.deepEqual(first, second);
  assert.equal(first.coverage.stages[1].finalizedGames, 320);
  assert.throws(() => makeDecisionReport({ ...data, checkpoint, bootstrap: 0 }), /retain bootstrap 200/);
  assert.throws(() => makeDecisionReport({ ...data, checkpoint: { stage: 'compare', count: 321 } }), /declared/);
  const capped = clone(data.stageRecords); capped.compare[0] = truncated(capped.compare[0]);
  const unscored = makeDecisionReport({ plan: data.plan, stageRecords: capped, checkpoint });
  assert.equal(unscored.coverage.stages[1].finalizedGames, 320);
  assert.equal(unscored.coverage.unpairedGames, 1);
});

test('writer preserves raw evidence, ignores torn tails and freezes repeatable prefix artifacts', async t => {
  const data = fixture(), root = directory(t, data), options = {
    validatePlan: () => {}, checkpoint: { stage: 'compare', count: 320 } };
  const raw = fs.readFileSync(path.join(root, 'compare', 'games.jsonl'));
  const evidence = fs.readFileSync(path.join(root, 'evidence', 'original.games.jsonl'));
  const first = await writeDecisionReport(root, options);
  assert.equal(first.report.runId, 'decision-report-fixture');
  assert.deepEqual(first.report.collectionContexts.map(context => context.stage), ['restore', 'compare']);
  assert.deepEqual(first.report.collectionContexts[0].identity, { fixture: true });
  assert.deepEqual(first.report.collectionContexts[0].native, { passed: true });
  assert.equal(first.report.coverage.stages[1].finalizedGames, 320);
  const frozen = fs.readFileSync(first.checkpointFiles.json);
  fs.appendFileSync(path.join(root, 'compare', 'games.jsonl'), data.stageRecords.compare.slice(320, 330)
    .map(value => JSON.stringify(value) + '\n').join('') + '{"torn');
  const laterRaw = fs.readFileSync(path.join(root, 'compare', 'games.jsonl'));
  const second = await writeDecisionReport(root, options);
  assert.deepEqual(fs.readFileSync(second.checkpointFiles.json), frozen);
  assert.deepEqual(fs.readFileSync(path.join(root, 'compare', 'games.jsonl')), laterRaw);
  assert.deepEqual(fs.readFileSync(path.join(root, 'evidence', 'original.games.jsonl')), evidence);
  assert.equal(laterRaw.subarray(0, raw.length).equals(raw), true);
  assert.equal(fs.existsSync(path.join(root, 'decision-report.lock')), false);
  assert.equal(fs.existsSync(path.join(root, 'decision-report.json')), true);
  assert.equal(fs.existsSync(path.join(root, 'decision-report.md')), true);
  assert.equal(fs.existsSync(path.join(root, 'positions.epd')), false);
  fs.writeFileSync(first.checkpointFiles.json, '{}');
  await assert.rejects(writeDecisionReport(root, options), /Frozen decision checkpoint artifact differs/);
});

test('writer requires intact campaign and evidence snapshots and releases its lease on cancellation', async t => {
  const data = fixture(), root = directory(t, data), options = { validatePlan: () => {} };
  const source = path.join(root, 'evidence', 'original.games.jsonl'), original = fs.readFileSync(source);
  fs.appendFileSync(source, 'changed');
  await assert.rejects(writeDecisionReport(root, options), /evidence.*(hash|checksum|changed)|snapshot.*(hash|checksum|changed)/i);
  fs.writeFileSync(source, original); fs.renameSync(source, source + '.saved');
  await assert.rejects(writeDecisionReport(root, options), /evidence|snapshot/i);
  fs.renameSync(source + '.saved', source);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(writeDecisionReport(root, { ...options, signal: controller.signal }), { name: 'AbortError' });
  assert.equal(fs.existsSync(path.join(root, 'decision-report.lock')), false);
  assert.equal(fs.existsSync(path.join(root, 'decision-report.json')), false);
  const campaign = JSON.parse(fs.readFileSync(path.join(root, 'campaign.json'))); campaign.format = 'other';
  fs.writeFileSync(path.join(root, 'campaign.json'), JSON.stringify(campaign));
  await assert.rejects(writeDecisionReport(root, options), /campaign manifest/);
});

test('writer rejects missing, inconsistent or changed stage collection manifests', async t => {
  const data = fixture(), root = directory(t, data), options = { validatePlan: () => {} };
  const run = path.join(root, 'compare', 'run.json'), collection = path.join(root, 'compare', 'collection.json');
  const original = fs.readFileSync(run), manifest = JSON.parse(original);
  fs.renameSync(run, run + '.saved');
  await assert.rejects(writeDecisionReport(root, options), /Missing compare collection manifest/);
  fs.renameSync(run + '.saved', run);
  fs.writeFileSync(collection, '{}');
  await assert.rejects(writeDecisionReport(root, options), /collection and run manifests differ/);
  fs.writeFileSync(collection, original);
  for (const patch of [{ jobs: 1 }, { identity: null }, { native: null },
    { identity: { foreign: true } }, { native: { passed: false } },
    { plan: { ...manifest.plan, id: 'changed' } }]) {
    const changed = JSON.stringify({ ...manifest, ...patch });
    fs.writeFileSync(run, changed); fs.writeFileSync(collection, changed);
    await assert.rejects(writeDecisionReport(root, options), /collection identity, plan or native preflight differs/);
  }
  assert.equal(fs.existsSync(path.join(root, 'decision-report.lock')), false);
});

test('writer requires campaign identity and native contexts for each nonempty stage', async t => {
  const data = fixture(), root = directory(t, data), options = { validatePlan: () => {} };
  const file = path.join(root, 'campaign.json'), original = JSON.parse(fs.readFileSync(file));
  for (const patch of [{ identity: null }, { native: null }, { native: {} },
    { native: { restore: { passed: true } } }, { native: { compare: { passed: true } } }]) {
    fs.writeFileSync(file, JSON.stringify({ ...original, ...patch }));
    await assert.rejects(writeDecisionReport(root, options), /campaign manifest|campaign identity|native context/i);
  }
  assert.equal(fs.existsSync(path.join(root, 'decision-report.lock')), false);
});
