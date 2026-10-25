'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getPlan } = require('./reference-fixture');
const { extractReferenceDataset } = require('../scripts/balance/reference-dataset');
const { makeReferenceReport, writeReferenceReport, markdown } = require('../scripts/balance/reference-report');

async function fixture({ plies = 28, firstCapture = false } = {}) {
  const plan = await getPlan(), manifest = { schemaVersion: 1, format: 'levelup-reference-collection',
    runId: 'reference-report-fixture', jobs: 4, plan };
  const statesFor = game => Array.from({ length: plies + 1 }, (_, ply) => {
    const fields = game.startFen.split(' ');
    if (firstCapture && ply > 0 && game.kind === 'ordinary') fields[0] = fields[0].replace('P', '1');
    fields[1] = ply % 2 ? (fields[1] === 'w' ? 'b' : 'w') : fields[1];
    fields[4] = String(Number(fields[4]) + ply); fields[5] = String(Number(fields[5]) + Math.floor(ply / 2));
    return fields.join(' ');
  });
  const records = plan.schedule.map(game => ({ ...game, schemaVersion: 1, attempt: 1, status: 'completed',
    result: '1/2-1/2', reason: 'threefold-repetition', finalFen: statesFor(game).at(-1),
    moves: Array.from({ length: plies }, (_, index) => `m${index}`), sans: Array.from({ length: plies }, (_, index) => `S${index}`),
    totalPlies: plies, playedPlies: plies, openingPlies: 0, profileHash: plan.profile.hash, registryHash: plan.registry.hash,
    registryReference: 'collection.json#plan.registry', variant: plan.profile.variant, royalMode: 'king', evaluationCaveat: null,
    evaluation: plan.profile.evaluation, engine: { nodes: plan.settings.nodes, threads: 1, hashMb: 32, maxPlies: 400 },
    whiteStrength: { skill: 20 }, blackStrength: { skill: 20 } }));
  const byStart = new Map(plan.schedule.map(game => [game.startFen, game])); let disposed = 0;
  const rulesFactory = async () => ({ createBoard(start) {
    const states = statesFor(byStart.get(start)); let ply = 0;
    return { fen: () => states[ply], outcome: () => ply === plies ? { result: '1/2-1/2', reason: 'threefold-repetition' } : null,
      san(move) { assert.equal(move, `m${ply}`); return `S${ply}`; },
      push(move) { if (move !== `m${ply}`) return false; ply++; return true; }, dispose() { disposed++; } };
  } });
  const calls = [];
  const analyze = async (dataset, options) => {
    calls.push({ dataset, options });
    const fit = (cohort, diagnostic = false) => {
      const values = { pawn: 1, knight: 3, bishop: 3.1, rook: 4.8, queen: diagnostic ? 8.8 : 9,
        ...Object.fromEntries(plan.roster.map((entry, index) => [`bonus:${entry.id}`, 3.5 + index / 10 + (cohort === 'head' ? 0.2 : 0)])) };
      return { normalized: { available: dataset.samples.length > 0, values: dataset.samples.length ? values : null,
        reason: dataset.samples.length ? null : 'no-data' },
      bootstrap: { ratioIntervals: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { lower: value - 0.2, upper: value + 0.2 }])) },
      coverage: { games: dataset.games.length, groups: new Set(dataset.games.map(game => game.groupId)).size },
      rank: { rank: 10, columns: 10 }, fit: { converged: true }, validation: { metrics: { brier: 0.1 } } };
    };
    const pair = plan.schedule.find(game => game.kind === 'head');
    return { primary: Object.fromEntries(['baseline', 'head', 'combined'].map(cohort => [cohort, fit(cohort)])),
      diagnostic: Object.fromEntries(['baseline', 'head', 'combined'].map(cohort => [cohort, fit(cohort, true)])),
      differences: { byFeature: Object.fromEntries(plan.roster.map(reference => [`bonus:${reference.id}`,
        { difference: 0.2, interval: { lower: -0.1, upper: 0.4 }, decision: 'agreement-at-resolution' }])) },
      predictions: { matchups: dataset.games.some(game => game.kind === 'head') ? [{ comparisonId: pair.comparisonId,
        designA: pair.designA, designB: pair.designB, games: 2, wins: 1, draws: 0, losses: 1,
        observedAScore: 0.6, predictedAScore: 0.5, predictionError: 0.1,
        observedInterval: { lower: 0.4, upper: 0.8 } }] : [] }, warnings: [] };
  };
  return { plan, manifest, records, statesFor, rulesFactory, analyze, calls, disposed: () => disposed };
}

function directory(t, data, count = 672) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-reference-report-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'collection.json'), JSON.stringify(data.manifest));
  fs.writeFileSync(path.join(root, 'run.json'), JSON.stringify(data.manifest));
  fs.writeFileSync(path.join(root, 'games.jsonl'), data.records.slice(0, count).map(record => JSON.stringify(record)).join('\n') + '\n');
  return root;
}

test('reference extraction decodes all four bonuses, retains all kinds, start features and game-balanced draw samples', async () => {
  const data = await fixture(), result = await extractReferenceDataset(data.manifest, data.records.slice(0, 21), { rulesFactory: data.rulesFactory });
  assert.equal(result.coverage.completedRecords, 21); assert.equal(result.coverage.samples, 63);
  assert.equal(result.coverage.cohorts.baseline.distinctGames, 9); assert.equal(result.coverage.cohorts.head.distinctGames, 12);
  assert.equal(result.dataset.featureNames.length, 10); assert.equal(result.dataset.games.length, 21);
  for (const game of result.dataset.games) {
    const rows = result.samples.filter(row => row.gameId === game.gameId);
    assert.ok(Math.abs(rows.reduce((sum, row) => sum + row.weight, 0) - 1) < 1e-12);
    assert.equal(game.startX.length, 10); assert.ok(rows.every(row => row.y === 0.5 && row.groupId === game.groupId));
    if (game.kind === 'head') assert.equal(game.startX.slice(6).filter(value => value !== 0).length, 2);
  }
  assert.deepEqual(new Set(result.samples.map(row => row.x[5])), new Set([-1, 1]));
  assert.equal(data.disposed(), 21);
  for (const kind of ['ordinary', 'single', 'head']) assert.ok(result.epd[kind].includes(`;kind ${kind};`));
});

test('reference report passes the complete dataset to three-cohort analysis and renders correct score/error units', async () => {
  const data = await fixture(), result = await makeReferenceReport(data.manifest, data.records.slice(0, 21), { rulesFactory: data.rulesFactory, analyze: data.analyze });
  assert.equal(data.calls.length, 1); assert.equal(data.calls[0].dataset.games.length, 21);
  assert.equal(data.calls[0].options.bootstrap, 200); assert.equal(data.calls[0].options.validationFolds, 5);
  assert.equal(result.report.estimates.combined.pawn.assumed, true); assert.equal(result.report.estimates.combined.queen.value, 9);
  assert.equal(result.report.coverage.studyScheduledGames, 2688); assert.equal(result.report.status, 'provisional');
  const text = markdown(result.report);
  assert.match(text, /Observed minus predicted \(pp\)/);
  assert.match(text, /60\.00% \| 40\.00%–80\.00% \| 50\.00% \| 10\.00/);
  assert.match(text, /agreement-at-resolution/); assert.match(text, /added bonuses, not whole-piece/);
  assert.ok(result.report.analysisIdentity.files.some(file => file.file === 'scripts/balance/reference-plan.js'));
});

test('reference replay rejects changed movement, identities, SAN/outcomes and contradictory attempts', async () => {
  const data = await fixture(), good = data.records[0];
  const options = { rulesFactory: data.rulesFactory };
  for (const patch of [{ designA: 'queen.purple@1' }, { whiteStrength: { skill: 19 } }, { registryHash: 'wrong' }, { profileHash: 'wrong' },
    { sans: ['wrong', ...good.sans.slice(1)] }, { result: '1-0' }, { finalFen: good.startFen }, { totalPlies: 3 }]) {
    await assert.rejects(extractReferenceDataset(data.manifest, [{ ...good, ...patch }], options));
  }
  await assert.rejects(extractReferenceDataset(data.manifest, [good, { ...good, attempt: 2 }], options), /Conflicting/);
  await assert.rejects(extractReferenceDataset(data.manifest, [{ ...good, id: 'foreign' }], options), /Foreign/);
  const deduplicated = await extractReferenceDataset(data.manifest, [good, good], options);
  assert.equal(deduplicated.coverage.journalAttempts, 2); assert.equal(deduplicated.coverage.completedRecords, 1);
});

test('truncations are unscored, earlier attempts remain visible and no-sample games retain their starting features', async () => {
  const data = await fixture({ plies: 8 }), completed = { ...data.records[0], attempt: 2 };
  const aborted = { ...completed, attempt: 1, status: 'aborted', result: '*', reason: 'cancelled',
    moves: completed.moves.slice(0, 4), sans: completed.sans.slice(0, 4), totalPlies: 4, playedPlies: 4, finalFen: data.statesFor(data.plan.schedule[0])[4] };
  const truncated = { ...data.records[1], status: 'truncated', result: '*', reason: 'max-plies' };
  const result = await extractReferenceDataset(data.manifest, [aborted, completed, truncated], { rulesFactory: data.rulesFactory });
  assert.equal(result.coverage.attemptStatusCounts.aborted, 1); assert.equal(result.coverage.statusCounts.aborted, 0);
  assert.equal(result.coverage.statusCounts.truncated, 1); assert.equal(result.coverage.finalizedGames, 2);
  assert.equal(result.samples.length, 0); assert.equal(result.dataset.games.length, 1); assert.equal(result.dataset.games[0].startX.length, 10);
});

test('EPD stable-material counter resets after a first-move capture', async () => {
  const data = await fixture({ firstCapture: true });
  const result = await extractReferenceDataset(data.manifest, data.records.slice(0, 1), { rulesFactory: data.rulesFactory });
  const lines = result.epd.ordinary.trim().split('\n');
  assert.match(lines[0], /;hmvc 0;/); assert.match(lines[1], /;hmvc 1;/);
});

test('immutable reference checkpoints ignore later records/torn tails and preserve raw evidence', async t => {
  const data = await fixture(), root = directory(t, data), options = { checkpoint: 672, rulesFactory: data.rulesFactory, analyze: data.analyze };
  const first = await writeReferenceReport(root, options), frozen = fs.readFileSync(first.checkpointFile);
  assert.deepEqual(first.report.checkpointHistory.map(item => item.checkpoint), [672]);
  fs.appendFileSync(path.join(root, 'games.jsonl'), data.records.slice(672, 693).map(record => JSON.stringify(record)).join('\n') + '\n' + '{"future');
  const raw = fs.readFileSync(path.join(root, 'games.jsonl'));
  await writeReferenceReport(root, options);
  assert.deepEqual(fs.readFileSync(first.checkpointFile), frozen); assert.deepEqual(fs.readFileSync(path.join(root, 'games.jsonl')), raw);
  assert.equal(fs.existsSync(path.join(root, 'report.lock')), false);
  fs.writeFileSync(first.checkpointFile, 'altered');
  await assert.rejects(writeReferenceReport(root, options), /Frozen reference checkpoint artifact differs/);
  assert.equal(fs.readFileSync(first.checkpointFile, 'utf8'), 'altered');
});

test('report rejects incomplete barriers, foreign policies and changed manifest/rules snapshots', async t => {
  const data = await fixture(), options = { checkpoint: 672, rulesFactory: data.rulesFactory, analyze: data.analyze };
  await assert.rejects(makeReferenceReport(data.manifest, data.records.slice(0, 671), options), /before every scheduled prefix/);
  await assert.rejects(makeReferenceReport(data.manifest, data.records, { ...options, checkpoint: 500 }), /declared/);
  await assert.rejects(makeReferenceReport(data.manifest, data.records, { ...options, bootstrap: 0 }), /declared bootstrap/);
  const root = directory(t, data); fs.writeFileSync(path.join(root, 'run.json'), '{}');
  await assert.rejects(writeReferenceReport(root, options), /manifest snapshots differ/);
  fs.writeFileSync(path.join(root, 'run.json'), JSON.stringify(data.manifest));
  fs.mkdirSync(path.join(root, 'rules')); fs.writeFileSync(path.join(root, 'rules', `${data.plan.profile.variant}.ini`), 'altered');
  await assert.rejects(writeReferenceReport(root, options), /Frozen reference rules changed/);
});

test('report lock excludes concurrent writers, reclaims a dead owner and releases after failure', async t => {
  const data = await fixture(), root = directory(t, data, 21), options = { rulesFactory: data.rulesFactory, analyze: data.analyze };
  let unblock; const blocked = new Promise(resolve => { unblock = resolve; });
  const first = writeReferenceReport(root, { ...options, rulesFactory: async () => { await blocked; throw new Error('fixture replay failure'); } });
  await assert.rejects(writeReferenceReport(root, options), /locked by process/);
  unblock(); await assert.rejects(first, /fixture replay failure/);
  assert.equal(fs.existsSync(path.join(root, 'report.lock')), false);
  fs.writeFileSync(path.join(root, 'report.lock'), JSON.stringify({ pid: 2147483647, token: 'dead-owner' }));
  const result = await writeReferenceReport(root, options);
  assert.equal(result.report.coveredGames, 21); assert.equal(fs.existsSync(path.join(root, 'report.lock')), false);
});

test('cancellation during replay or analysis releases the report lock without freezing partial estimates', async t => {
  const data = await fixture({ plies: 200 }), root = directory(t, data, 21), controller = new AbortController();
  const raw = fs.readFileSync(path.join(root, 'games.jsonl'));
  setImmediate(() => controller.abort());
  await assert.rejects(writeReferenceReport(root, { rulesFactory: data.rulesFactory, analyze: data.analyze, signal: controller.signal }), { name: 'AbortError' });
  assert.deepEqual(fs.readFileSync(path.join(root, 'games.jsonl')), raw); assert.equal(fs.existsSync(path.join(root, 'report.lock')), false);
  assert.equal(fs.existsSync(path.join(root, 'reference-report.json')), false);
  const normal = await fixture(), completeRoot = directory(t, normal), second = new AbortController();
  await assert.rejects(writeReferenceReport(completeRoot, { checkpoint: 672, rulesFactory: normal.rulesFactory,
    signal: second.signal, analyze: async (dataset, options) => { const result = await normal.analyze(dataset, options); second.abort(); return result; } }), { name: 'AbortError' });
  assert.equal(fs.existsSync(path.join(completeRoot, 'checkpoints')), false); assert.equal(fs.existsSync(path.join(completeRoot, 'report.lock')), false);
});
