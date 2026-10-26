'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { getPlan } = require('./bishop-fixture');
const { decodeMaterial } = require('../scripts/balance/material-dataset');
const { sourceEvidence, extractBishopDataset } = require('../scripts/balance/bishop-dataset');
const { makeBishopReport, writeBishopReport, markdown, queenRookGap } = require('../scripts/balance/bishop-report');
const { getBishopProtocol } = require('../scripts/balance/bishop-plan');
const ROOT = path.resolve(__dirname, '..');
const sha = value => createHash('sha256').update(value).digest('hex');

let sourceFixture;
function inheritedFixture() {
  if (sourceFixture) return sourceFixture;
  const library = getBishopProtocol(), profile = library.sourceManifest.plan.profile;
  const names = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'tempo',
    ...profile.registry.definitions.map(entry => `bonus:${entry.id}`).sort()];
  const games = [], samples = [];
  for (const [context, manifest, records] of [['parent', library.parentManifest, library.parentRecords],
    ['extension', library.sourceManifest, library.sourceRecords]]) {
    const cache = new Map(), sourceProfile = manifest.plan.profile;
    const oldNames = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'tempo',
      ...sourceProfile.registry.definitions.map(entry => `bonus:${entry.id}`).sort()];
    for (const record of records.filter(record => record.status === 'completed')) {
      const fields = record.startFen.split(' '), key = [...fields[0].replace(/[1-8/]/g, '')].sort().join('') + fields[1];
      if (!cache.has(key)) cache.set(key, decodeMaterial(record.startFen, sourceProfile));
      const material = cache.get(key), x = names.map(name => oldNames.includes(name) ? material.x[oldNames.indexOf(name)] : 0), groupId = record.openingId;
      games.push({ gameId: record.id, pairId: record.unitId, groupId, kind: record.kind,
        aColor: record.aColor, openingId: record.openingId, comparisonId: record.comparisonId,
        designA: record.designA, designB: record.designB, whiteDesign: record.whiteDesign, blackDesign: record.blackDesign,
        result: record.result, samples: 1, historyHash: `inherited-${record.id}`, startFen: record.startFen, startX: x,
        sourceContext: context, sourceRunId: manifest.runId, sourceProfileHash: sourceProfile.hash, sourceRegistryHash: sourceProfile.registry.hash });
      samples.push({ gameId: record.id, pairId: record.unitId, groupId, x,
        weight: 1, y: { '1-0': 1, '0-1': 0, '1/2-1/2': 0.5 }[record.result],
        phase: material.phase, ply: 16, fen: record.startFen, sourceContext: context,
        sourceRunId: manifest.runId, sourceProfileHash: sourceProfile.hash, sourceRegistryHash: sourceProfile.registry.hash });
    }
  }
  const statusCounts = { completed: 5759, truncated: 1, error: 0, aborted: 0 };
  const sourceContexts = Object.fromEntries([['parent', library.parentManifest], ['extension', library.sourceManifest]].map(([name, manifest]) =>
    [name, { runId: manifest.runId, profile: manifest.plan.profile, registry: manifest.plan.registry, manifestIdentity: manifest.identity || null }]));
  sourceFixture = { dataset: { featureNames: names, games, sourceContexts }, samples,
    coverage: { scheduledGames: 5760, studyScheduledGames: 5760, finalizedGames: 5760, observedGames: 5760, remainingGames: 0,
      journalAttempts: 5760, completedRecords: 5759, uniqueHistories: 5759, sampledGames: 5759,
      samples: 5759, replayedPlies: 637510, statusCounts, attemptStatusCounts: statusCounts,
      partialScoredPairs: 1, duplicateGames: [], phases: { middlegame: 5759, endgame: 0 } },
    epd: { ordinary: 'inherited ordinary\n', single: 'inherited single\n', head: 'inherited head\n' } };
  return sourceFixture;
}

async function fixture({ plies = 28 } = {}) {
  const plan = await getPlan(), manifest = { schemaVersion: 1, format: 'levelup-bishop-collection',
    runId: 'bishop-report-fixture', jobs: 4, plan, native: { parentCompatibility: { passed: true } } };
  const statesFor = game => Array.from({ length: plies + 1 }, (_, ply) => {
    const fields = game.startFen.split(' ');
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
  const byStart = new Map(plan.schedule.map(game => [game.startFen, game])); let disposed = 0, sourceCalls = 0;
  const rulesFactory = async ({ profile }) => {
    assert.equal(profile.hash, plan.profile.hash);
    return { createBoard(start) {
      const states = statesFor(byStart.get(start)); let ply = 0;
      return { fen: () => states[ply], outcome: () => ply === plies ? { result: '1/2-1/2', reason: 'threefold-repetition' } : null,
        san(move) { assert.equal(move, `m${ply}`); return `S${ply}`; },
        push(move) { if (move !== `m${ply}`) return false; ply++; return true; }, dispose() { disposed++; } };
    } };
  };
  const extractSource = async (sourceManifest, sourceRecords) => {
    sourceCalls++;
    assert.equal(sourceManifest.plan.profile.registry.definitions.length, 8);
    assert.equal(sourceManifest.plan.profile.hash, plan.simpleSource.profileHash);
    assert.equal(sourceRecords.length, 3072);
    return inheritedFixture();
  };
  const calls = [];
  const analyze = async (dataset, options) => {
    calls.push({ dataset, options });
    const values = { pawn: 1, knight: 3, bishop: 3.1, rook: 4.8, queen: 9,
      ...Object.fromEntries(plan.roster.map((entry, index) => [`bonus:${entry.id}`, 3.5 + index / 10])) };
    const fit = () => ({ normalized: { available: true, values }, bootstrap: { ratioIntervals: { rook: { lower: 4.2, upper: 5.1 }, knight: { lower: 2.8, upper: 3.2 } } },
      coverage: { games: dataset.games.length, groups: new Set(dataset.games.map(game => game.groupId)).size },
      rank: { rank: 18, columns: 18 }, fit: { converged: true }, validation: { metrics: { brier: 0.1 } } });
    const pair = plan.schedule.find(game => game.kind === 'head');
    return { primary: Object.fromEntries(['baseline', 'head', 'combined'].map(cohort => [cohort, fit()])),
      diagnostic: Object.fromEntries(['baseline', 'head', 'combined'].map(cohort => [cohort, fit()])),
      differences: { byFeature: {} }, predictions: { matchups: [{ comparisonId: pair.comparisonId,
        designA: pair.designA, designB: pair.designB, games: 2, partialGames: 1, wins: 1, draws: 0, losses: 1,
        observedAScore: 0.6, predictedAScore: 0.5, predictionError: 0.1, observedInterval: { lower: 0.4, upper: 0.8 } }] }, warnings: [] };
  };
  return { plan, manifest, records, statesFor, rulesFactory, extractSource, analyze, calls,
    options: { rulesFactory, extractSource, analyze }, disposed: () => disposed, sourceCalls: () => sourceCalls };
}

function directory(t, data, count = 320) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-bishop-report-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'collection.json'), JSON.stringify(data.manifest));
  fs.writeFileSync(path.join(root, 'run.json'), JSON.stringify(data.manifest));
  fs.writeFileSync(path.join(root, 'games.jsonl'), data.records.slice(0, count).map(record => JSON.stringify(record)).join('\n') + '\n');
  fs.mkdirSync(path.join(root, 'parent'));
  fs.copyFileSync(path.join(ROOT, data.plan.parent.manifestFile), path.join(root, 'parent', 'collection.json'));
  fs.copyFileSync(path.join(ROOT, data.plan.parent.journalFile), path.join(root, 'parent', 'games.jsonl'));
  fs.mkdirSync(path.join(root, 'simple-source'));
  fs.copyFileSync(path.join(ROOT, data.plan.simpleSource.manifestFile), path.join(root, 'simple-source', 'replay-source.json'));
  fs.copyFileSync(path.join(ROOT, data.plan.simpleSource.journalFile), path.join(root, 'simple-source', 'games.jsonl'));
  return root;
}

test('linked replay retains original both source profiles, projects eighteen features, groups and game-balanced weights', async () => {
  const data = await fixture(), result = await extractBishopDataset(data.manifest, data.records.slice(0, 10), data.options);
  assert.equal(data.sourceCalls(), 1); assert.equal(data.disposed(), 10);
  assert.equal(result.coverage.inheritedGames, 5760); assert.equal(result.coverage.newGames, 10);
  assert.equal(result.coverage.finalizedGames, 5770); assert.equal(result.coverage.statusCounts.truncated, 1);
  assert.equal(result.coverage.studyScheduledGames, 7040); assert.equal(result.coverage.newStudyCap, 1280);
  assert.equal(result.coverage.uniqueHistories, 5759 + 10);
  assert.equal(result.dataset.featureNames.length, 18);
  assert.equal(result.dataset.sourceContexts.parent.profile.registry.definitions.length, 4);
  assert.equal(result.dataset.sourceContexts.bishop.profile.registry.definitions.length, 12);
  const oldNames = inheritedFixture().dataset.featureNames, byId = new Map(inheritedFixture().dataset.games.map(game => [game.gameId, game]));
  for (const game of result.dataset.games) {
    assert.equal(game.startX.length, 18);
    assert.ok(/^reference-/.test(game.groupId));
    const rows = result.samples.filter(row => row.gameId === game.gameId);
    assert.ok(Math.abs(rows.reduce((sum, row) => sum + row.weight, 0) - 1) < 1e-12);
    assert.ok(rows.every(row => row.x.length === 18 && row.groupId === game.groupId && row.sourceContext === game.sourceContext));
    if (game.sourceContext === 'parent') for (const [column, name] of result.dataset.featureNames.entries()) {
      assert.equal(game.startX[column], oldNames.includes(name) ? byId.get(game.gameId).startX[oldNames.indexOf(name)] : 0);
    }
  }
  assert.equal(new Set(result.dataset.games.filter(game => game.sourceContext === 'parent').map(game => game.groupId)).size, 128);
  assert.equal(new Set(result.dataset.games.filter(game => game.sourceContext === 'bishop').map(game => game.groupId)).size, 1);
  assert.match(result.epd.single, /^inherited single\n/s);
});

test('linked reports count only new games toward barriers and expose historical provenance and conditional assumptions', async () => {
  const data = await fixture(), result = await makeBishopReport(data.manifest, data.records.slice(0, 10), data.options);
  assert.equal(data.calls.length, 1); assert.equal(data.calls[0].dataset.games.length, 5759 + 10);
  assert.equal(data.calls[0].options.bootstrap, 200); assert.equal(data.calls[0].options.validationFolds, 5);
  assert.equal(result.report.coveredGames, 10); assert.equal(result.report.inheritedGames, 5760);
  assert.equal(result.report.linkedGames, 5770); assert.equal(result.report.studyCap, 1280); assert.equal(result.report.linkedStudyCap, 7040);
  assert.equal(result.report.status, 'provisional'); assert.equal(result.report.currentEstimate.queen.value, 9);
  assert.equal(result.report.parent.compatibility.passed, true);
  assert.equal(result.report.currentEstimate.rook.value, 4.8);
  assert.equal(result.report.ordinaryEstimates.combined.rook.value, 4.8);
  assert.ok(Math.abs(result.report.currentQueenRookGap.value - 4.2) < 1e-12);
  assert.deepEqual(result.report.currentQueenRookGap.interval, { lower: 3.9000000000000004, upper: 4.8 });
  assert.deepEqual(result.report.policy.nativePieceValues, data.plan.profile.evaluation.pieceValues);
  const text = markdown(result.report);
  assert.match(text, /new finished 10\/1280/); assert.match(text, /Inherited: 5760/);
  assert.match(text, /\| Pawn \(assumed\) \| 1\.00 \| 1\.00 \| 1\.00 \| fixed assumption \|/);
  assert.match(text, /\| Queen \(assumed\) \| 9\.00 \| 9\.00 \| 9\.00 \| fixed assumption \|/);
  assert.match(text, /\| Rook \| 4\.80 \| 4\.80 \| 4\.80 \| 4\.20–5\.10 \|/);
  assert.match(text, /\| Queen minus rook \| 4\.20 \| 4\.20 \| 4\.20 \| 3\.90–4\.80 \|/);
  assert.match(text, /60\.00% \| 40\.00%–80\.00% \| 50\.00% \| 10\.00/);
  assert.match(text, /\n\nPartial .*\n\nMatchup scores/s);
  assert.ok(result.report.warnings.some(warning => /contextual comparability/.test(warning)));
});

test('shared analysis accepts the linked eighteen-column dataset and reports unsupported sparse fits honestly', async () => {
  const data = await fixture(), result = await makeBishopReport(data.manifest, data.records.slice(0, 10), {
    ...data.options, analyze: undefined, bootstrap: 0,
  });
  assert.equal(result.report.policy.bootstrap, 0);
  assert.equal(result.dataset.featureNames.length, 18);
  assert.equal(result.report.analysis.primary.combined.normalized.available, false);
  assert.equal(result.report.currentEstimate['bonus:bishop.purple@10'].value, null);
  assert.equal(result.report.currentEstimate.rook.value, null);
  assert.equal(result.report.currentQueenRookGap.value, null);
  assert.equal(result.report.currentQueenRookGap.interval, null);
  const text = markdown(result.report);
  assert.match(text, /\| Rook \| unavailable \| unavailable \| unavailable \| unavailable \|/);
  assert.match(text, /\| Queen minus rook \| unavailable \| unavailable \| unavailable \| unavailable \|/);
});

test('queen-minus-rook uncertainty uses the assumed queen and the same rook bootstrap range', () => {
  const result = queenRookGap({ queen: { value: 9, assumed: true }, rook: { value: 5, supported: true, interval: { lower: 4, upper: 6 } } });
  assert.equal(result.value, 4); assert.deepEqual(result.interval, { lower: 3, upper: 5 });
  assert.equal(result.assumedQueen, 9);
  assert.equal(queenRookGap({ rook: { value: 5, supported: false, reason: 'rank-deficient-design' } }).value, null);
  assert.equal(queenRookGap({ rook: { value: NaN, supported: true } }).supported, false);
});

test('strict parent checksums reject changed bytes and mismatched supplied objects', async () => {
  const data = await fixture(), evidence = sourceEvidence(data.plan);
  const changed = Buffer.from(evidence.journalBytes); changed[0] ^= 1;
  assert.throws(() => sourceEvidence(data.plan, { sourceJournalBytes: changed }), /checksum/);
  assert.throws(() => sourceEvidence(data.plan, { sourceManifest: { ...evidence.manifest, runId: 'changed' } }), /objects differ/);
  assert.equal(sourceEvidence(data.plan, { sourceManifest: evidence.manifest, sourceRecords: evidence.records }).records.length, 3072);
});

test('extension replay rejects identity, SAN, outcome and policy corruption before pooling', async () => {
  const data = await fixture(), good = data.records[0];
  for (const patch of [{ profileHash: data.plan.parent.profileHash }, { registryHash: 'wrong' }, { whiteStrength: { skill: 19 } },
    { sans: ['wrong', ...good.sans.slice(1)] }, { finalFen: good.startFen }, { result: '1-0' }, { totalPlies: 3 },
    { evaluation: undefined }, { evaluation: { pieceValues: { 'rook.purple@9': { mg: 2042, eg: 2208 } } } }]) {
    await assert.rejects(extractBishopDataset(data.manifest, [{ ...good, ...patch }], data.options));
  }
  await assert.rejects(extractBishopDataset(data.manifest, [{ ...good, id: 'foreign' }], data.options), /Foreign/);
  await assert.rejects(extractBishopDataset(data.manifest, [good, { ...good, attempt: 2 }], data.options), /Conflicting/);
});

test('frozen linked checkpoints retain parent hashes and ignore later lines and torn tails without changing evidence', async t => {
  const data = await fixture(), root = directory(t, data), options = { ...data.options, checkpoint: 320 };
  const sourceBefore = fs.readFileSync(path.join(root, 'simple-source', 'games.jsonl'));
  const first = await writeBishopReport(root, options), frozen = fs.readFileSync(first.checkpointFile);
  assert.equal(first.report.coveredGames, 320); assert.equal(first.report.linkedGames, 6080);
  assert.equal(first.report.inputs.parentJournalSha256, data.plan.parent.journalSha256);
  assert.deepEqual(first.report.checkpointHistory.map(item => item.checkpoint), [320]);
  assert.equal(first.report.checkpointHistory[0].ordinary.combined.rook, 4.8);
  assert.ok(Math.abs(first.report.checkpointHistory[0].queenRookGap.combined - 4.2) < 1e-12);
  assert.match(fs.readFileSync(first.files.markdown, 'utf8'), /\| 320 \| Rook \| 4\.80 \| 4\.80 \| 4\.80 \|/);
  fs.appendFileSync(path.join(root, 'games.jsonl'), data.records.slice(320, 330).map(record => JSON.stringify(record)).join('\n') + '\n' + '{"future');
  const raw = fs.readFileSync(path.join(root, 'games.jsonl'));
  await writeBishopReport(root, options);
  assert.deepEqual(fs.readFileSync(first.checkpointFile), frozen);
  assert.deepEqual(fs.readFileSync(path.join(root, 'games.jsonl')), raw);
  assert.deepEqual(fs.readFileSync(path.join(root, 'simple-source', 'games.jsonl')), sourceBefore);
  assert.equal(fs.existsSync(path.join(root, 'report.lock')), false);
  assert.equal(sha(sourceBefore), data.plan.simpleSource.journalSha256);
  fs.writeFileSync(first.checkpointFile, 'altered');
  await assert.rejects(writeBishopReport(root, options), /checkpoint artifact differs/);
});

test('writer uses copied parent bytes, rejects modified snapshots and incomplete barriers', async t => {
  const data = await fixture(), root = directory(t, data, 10);
  fs.appendFileSync(path.join(root, 'parent', 'games.jsonl'), '\n');
  await assert.rejects(writeBishopReport(root, data.options), /checksum/);
  fs.copyFileSync(path.join(ROOT, data.plan.parent.journalFile), path.join(root, 'parent', 'games.jsonl'));
  fs.writeFileSync(path.join(root, 'run.json'), '{}');
  await assert.rejects(writeBishopReport(root, data.options), /manifest snapshots differ/);
  await assert.rejects(makeBishopReport(data.manifest, data.records.slice(0, 319), { ...data.options, checkpoint: 320 }), /before every scheduled prefix/);
  await assert.rejects(makeBishopReport(data.manifest, data.records, { ...data.options, checkpoint: 320, bootstrap: 0 }), /declared bootstrap/);
});

test('cancellation releases report lock and preserves raw histories without freezing a partial checkpoint', async t => {
  const data = await fixture(), root = directory(t, data), controller = new AbortController();
  const raw = fs.readFileSync(path.join(root, 'games.jsonl'));
  await assert.rejects(writeBishopReport(root, { ...data.options, checkpoint: 320, signal: controller.signal,
    analyze: async (dataset, options) => { const result = await data.analyze(dataset, options); controller.abort(); return result; } }), { name: 'AbortError' });
  assert.deepEqual(fs.readFileSync(path.join(root, 'games.jsonl')), raw);
  assert.equal(fs.existsSync(path.join(root, 'report.lock')), false);
  assert.equal(fs.existsSync(path.join(root, 'checkpoints')), false);
  assert.equal(fs.existsSync(path.join(root, 'bishop-report.json')), false);
});

test('head-only bishop baseline values stay unavailable while inherited ordinary estimates remain printable', async () => {
  const data = await fixture(), absent = ['bishop.purple@7', 'bishop.purple@9', 'bishop.purple@11', 'bishop.purple@12'].map(id => `bonus:${id}`);
  const result = await makeBishopReport(data.manifest, data.records.slice(0, 10), { ...data.options,
    analyze: async (dataset, options) => {
      const analysis = await data.analyze(dataset, options);
      for (const mode of ['primary', 'diagnostic']) {
        const fit = analysis[mode].baseline;
        fit.normalized.values = { ...fit.normalized.values };
        for (const name of absent) delete fit.normalized.values[name];
        fit.omittedFeatures = absent;
      }
      return analysis;
    } });
  for (const name of absent) {
    assert.equal(result.report.estimates.baseline[name].value, null);
    assert.equal(result.report.estimates.baseline[name].supported, false);
    assert.equal(result.report.estimates.baseline[name].reason, 'not-observed-in-cohort');
    assert.ok(Number.isFinite(result.report.estimates.head[name].value));
  }
  assert.equal(result.report.estimates.baseline.rook.value, 4.8);
  assert.equal(result.report.simpleSource.originalManifestSupplied, false);
  assert.equal(result.report.simpleSource.historicalNativeInventoryVerified, false);
  const text = markdown(result.report);
  assert.match(text, /not the original collection manifest/);
  assert.match(text, /New bishop variants have head-to-head evidence only/);
  assert.match(text, /\| Rook \| 4\.80 \|/);
});

test('cross-source duplicate physical histories are counted once without rewriting raw game totals', async () => {
  const data = await fixture(), record = data.records[0], inherited = structuredClone(inheritedFixture());
  const hash = sha(JSON.stringify({ startFen: record.startFen, moves: record.moves, result: record.result,
    reason: record.reason, finalFen: record.finalFen }));
  inherited.dataset.games[0].historyHash = hash;
  const retained = inherited.dataset.games[0].gameId;
  const result = await extractBishopDataset(data.manifest, [record], { ...data.options, extractSource: async () => inherited });
  assert.equal(result.coverage.finalizedGames, 5761);
  assert.equal(result.coverage.uniqueHistories, 5759);
  assert.equal(result.samples.length, inherited.samples.length);
  assert.equal(result.dataset.games.some(game => game.gameId === record.id), false);
  assert.ok(result.coverage.duplicateGames.some(item => item.gameId === record.id && item.retainedGameId === retained));
});
