'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { getPlan, getParent } = require('./revision-fixture');
const { decodeMaterial } = require('../scripts/balance/material-dataset');
const { parentEvidence, extractRevisionDataset } = require('../scripts/balance/revision-dataset');
const { makeRevisionReport, writeRevisionReport, markdown } = require('../scripts/balance/revision-report');
const ROOT = path.resolve(__dirname, '..');
const sha = value => createHash('sha256').update(value).digest('hex');

let parentFixture;
function inheritedFixture() {
  if (parentFixture) return parentFixture;
  const { manifest, records } = getParent(), profile = manifest.plan.profile;
  const names = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'tempo',
    ...profile.registry.definitions.map(entry => `bonus:${entry.id}`).sort()];
  const cache = new Map(), games = [], samples = [];
  for (const record of records.filter(record => record.status === 'completed')) {
    const fields = record.startFen.split(' '), key = [...fields[0].replace(/[1-8/]/g, '')].sort().join('') + fields[1];
    if (!cache.has(key)) cache.set(key, decodeMaterial(record.startFen, profile));
    const material = cache.get(key), groupId = record.openingId;
    games.push({ gameId: record.id, pairId: record.unitId, groupId, kind: record.kind,
      aColor: record.aColor, openingId: record.openingId, comparisonId: record.comparisonId,
      designA: record.designA, designB: record.designB, whiteDesign: record.whiteDesign, blackDesign: record.blackDesign,
      result: record.result, samples: 1, historyHash: `inherited-${record.id}`, startFen: record.startFen, startX: material.x });
    samples.push({ gameId: record.id, pairId: record.unitId, groupId, x: material.x,
      weight: 1, y: { '1-0': 1, '0-1': 0, '1/2-1/2': 0.5 }[record.result],
      phase: material.phase, ply: 16, fen: record.startFen });
  }
  const statusCounts = { completed: 2687, truncated: 1, error: 0, aborted: 0 };
  parentFixture = { dataset: { featureNames: names, games }, samples,
    coverage: { scheduledGames: 2688, finalizedGames: 2688, observedGames: 2688, remainingGames: 0,
      journalAttempts: 2688, completedRecords: 2687, uniqueHistories: 2687, sampledGames: 2687,
      samples: 2687, replayedPlies: 301370, statusCounts, attemptStatusCounts: statusCounts,
      partialScoredPairs: 1, duplicateGames: [], phases: { middlegame: 2687, endgame: 0 } },
    epd: { ordinary: 'parent ordinary\n', single: 'parent single\n', head: 'parent head\n' } };
  return parentFixture;
}

async function fixture({ plies = 28 } = {}) {
  const plan = await getPlan(), manifest = { schemaVersion: 1, format: 'levelup-revision-collection',
    runId: 'revision-report-fixture', jobs: 4, plan, native: { parentCompatibility: { passed: true } } };
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
  const byStart = new Map(plan.schedule.map(game => [game.startFen, game])); let disposed = 0, parentCalls = 0;
  const rulesFactory = async ({ profile }) => {
    assert.equal(profile.hash, plan.profile.hash);
    return { createBoard(start) {
      const states = statesFor(byStart.get(start)); let ply = 0;
      return { fen: () => states[ply], outcome: () => ply === plies ? { result: '1/2-1/2', reason: 'threefold-repetition' } : null,
        san(move) { assert.equal(move, `m${ply}`); return `S${ply}`; },
        push(move) { if (move !== `m${ply}`) return false; ply++; return true; }, dispose() { disposed++; } };
    } };
  };
  const extractParent = async (parentManifest, parentRecords) => {
    parentCalls++;
    assert.equal(parentManifest.plan.profile.registry.definitions.length, 4);
    assert.equal(parentManifest.plan.profile.hash, plan.parent.profileHash);
    assert.equal(parentRecords.length, 2688);
    return inheritedFixture();
  };
  const calls = [];
  const analyze = async (dataset, options) => {
    calls.push({ dataset, options });
    const values = { pawn: 1, knight: 3, bishop: 3.1, rook: 4.8, queen: 9,
      ...Object.fromEntries(plan.roster.map((entry, index) => [`bonus:${entry.id}`, 3.5 + index / 10])) };
    const fit = () => ({ normalized: { available: true, values }, bootstrap: { ratioIntervals: {} },
      coverage: { games: dataset.games.length, groups: new Set(dataset.games.map(game => game.groupId)).size },
      rank: { rank: 16, columns: 16 }, fit: { converged: true }, validation: { metrics: { brier: 0.1 } } });
    const pair = plan.schedule.find(game => game.kind === 'head');
    return { primary: Object.fromEntries(['baseline', 'head', 'combined'].map(cohort => [cohort, fit()])),
      diagnostic: Object.fromEntries(['baseline', 'head', 'combined'].map(cohort => [cohort, fit()])),
      differences: { byFeature: {} }, predictions: { matchups: [{ comparisonId: pair.comparisonId,
        designA: pair.designA, designB: pair.designB, games: 2, partialGames: 1, wins: 1, draws: 0, losses: 1,
        observedAScore: 0.6, predictedAScore: 0.5, predictionError: 0.1, observedInterval: { lower: 0.4, upper: 0.8 } }] }, warnings: [] };
  };
  return { plan, manifest, records, statesFor, rulesFactory, extractParent, analyze, calls,
    options: { rulesFactory, extractParent, analyze }, disposed: () => disposed, parentCalls: () => parentCalls };
}

function directory(t, data, count = 1152) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-revision-report-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'collection.json'), JSON.stringify(data.manifest));
  fs.writeFileSync(path.join(root, 'run.json'), JSON.stringify(data.manifest));
  fs.writeFileSync(path.join(root, 'games.jsonl'), data.records.slice(0, count).map(record => JSON.stringify(record)).join('\n') + '\n');
  fs.mkdirSync(path.join(root, 'parent'));
  fs.copyFileSync(path.join(ROOT, data.plan.parent.manifestFile), path.join(root, 'parent', 'collection.json'));
  fs.copyFileSync(path.join(ROOT, data.plan.parent.journalFile), path.join(root, 'parent', 'games.jsonl'));
  return root;
}

test('linked replay retains original four-type decoding, projects sixteen features, groups and game-balanced weights', async () => {
  const data = await fixture(), result = await extractRevisionDataset(data.manifest, data.records.slice(0, 36), data.options);
  assert.equal(data.parentCalls(), 1); assert.equal(data.disposed(), 36);
  assert.equal(result.coverage.inheritedGames, 2688); assert.equal(result.coverage.newGames, 36);
  assert.equal(result.coverage.finalizedGames, 2724); assert.equal(result.coverage.statusCounts.truncated, 1);
  assert.equal(result.coverage.studyScheduledGames, 7296); assert.equal(result.coverage.newStudyCap, 4608);
  assert.equal(result.coverage.uniqueHistories, 2687 + 36);
  assert.equal(result.dataset.featureNames.length, 16);
  assert.equal(result.dataset.sourceContexts.parent.profile.registry.definitions.length, 4);
  assert.equal(result.dataset.sourceContexts.extension.profile.registry.definitions.length, 10);
  const oldNames = inheritedFixture().dataset.featureNames, byId = new Map(inheritedFixture().dataset.games.map(game => [game.gameId, game]));
  for (const game of result.dataset.games) {
    assert.equal(game.startX.length, 16);
    assert.ok(/^reference-/.test(game.groupId));
    const rows = result.samples.filter(row => row.gameId === game.gameId);
    assert.ok(Math.abs(rows.reduce((sum, row) => sum + row.weight, 0) - 1) < 1e-12);
    assert.ok(rows.every(row => row.x.length === 16 && row.groupId === game.groupId && row.sourceContext === game.sourceContext));
    if (game.sourceContext === 'parent') for (const [column, name] of result.dataset.featureNames.entries()) {
      assert.equal(game.startX[column], oldNames.includes(name) ? byId.get(game.gameId).startX[oldNames.indexOf(name)] : 0);
    }
  }
  assert.equal(new Set(result.dataset.games.filter(game => game.sourceContext === 'parent').map(game => game.groupId)).size, 128);
  assert.equal(new Set(result.dataset.games.filter(game => game.sourceContext === 'extension').map(game => game.groupId)).size, 1);
  assert.match(result.epd.single, /^parent single\n.*;profile /s);
});

test('linked reports count only new games toward barriers and expose historical provenance and conditional assumptions', async () => {
  const data = await fixture(), result = await makeRevisionReport(data.manifest, data.records.slice(0, 36), data.options);
  assert.equal(data.calls.length, 1); assert.equal(data.calls[0].dataset.games.length, 2687 + 36);
  assert.equal(data.calls[0].options.bootstrap, 200); assert.equal(data.calls[0].options.validationFolds, 5);
  assert.equal(result.report.coveredGames, 36); assert.equal(result.report.inheritedGames, 2688);
  assert.equal(result.report.linkedGames, 2724); assert.equal(result.report.studyCap, 4608); assert.equal(result.report.linkedStudyCap, 7296);
  assert.equal(result.report.status, 'provisional'); assert.equal(result.report.currentEstimate.queen.value, 9);
  assert.equal(result.report.parent.compatibility.passed, true);
  const text = markdown(result.report);
  assert.match(text, /new finished 36\/4608/); assert.match(text, /Inherited: 2688/);
  assert.match(text, /60\.00% \| 40\.00%–80\.00% \| 50\.00% \| 10\.00/);
  assert.match(text, /\n\nPartial .*\n\nMatchup scores/s);
  assert.ok(result.report.warnings.some(warning => /contextual comparability/.test(warning)));
});

test('shared analysis accepts the linked sixteen-column dataset and reports unsupported sparse fits honestly', async () => {
  const data = await fixture(), result = await makeRevisionReport(data.manifest, data.records.slice(0, 36), {
    ...data.options, analyze: undefined, bootstrap: 0,
  });
  assert.equal(result.report.policy.bootstrap, 0);
  assert.equal(result.dataset.featureNames.length, 16);
  assert.equal(result.report.analysis.primary.combined.normalized.available, false);
  assert.equal(result.report.currentEstimate['bonus:bishop.purple@7'].value, null);
});

test('strict parent checksums reject changed bytes and mismatched supplied objects', async () => {
  const data = await fixture(), evidence = parentEvidence(data.plan);
  const changed = Buffer.from(evidence.journalBytes); changed[0] ^= 1;
  assert.throws(() => parentEvidence(data.plan, { parentJournalBytes: changed }), /checksum/);
  assert.throws(() => parentEvidence(data.plan, { parentManifest: { ...evidence.manifest, runId: 'changed' } }), /objects differ/);
  assert.equal(parentEvidence(data.plan, { parentManifest: evidence.manifest, parentRecords: evidence.records }).records.length, 2688);
});

test('extension replay rejects identity, SAN, outcome and policy corruption before pooling', async () => {
  const data = await fixture(), good = data.records[0];
  for (const patch of [{ profileHash: data.plan.parent.profileHash }, { registryHash: 'wrong' }, { whiteStrength: { skill: 19 } },
    { sans: ['wrong', ...good.sans.slice(1)] }, { finalFen: good.startFen }, { result: '1-0' }, { totalPlies: 3 }]) {
    await assert.rejects(extractRevisionDataset(data.manifest, [{ ...good, ...patch }], data.options));
  }
  await assert.rejects(extractRevisionDataset(data.manifest, [{ ...good, id: 'foreign' }], data.options), /Foreign/);
  await assert.rejects(extractRevisionDataset(data.manifest, [good, { ...good, attempt: 2 }], data.options), /Conflicting/);
});

test('frozen linked checkpoints retain parent hashes and ignore later lines and torn tails without changing evidence', async t => {
  const data = await fixture(), root = directory(t, data), options = { ...data.options, checkpoint: 1152 };
  const parentBefore = fs.readFileSync(path.join(root, 'parent', 'games.jsonl'));
  const first = await writeRevisionReport(root, options), frozen = fs.readFileSync(first.checkpointFile);
  assert.equal(first.report.coveredGames, 1152); assert.equal(first.report.linkedGames, 3840);
  assert.equal(first.report.inputs.parentJournalSha256, data.plan.parent.journalSha256);
  assert.deepEqual(first.report.checkpointHistory.map(item => item.checkpoint), [1152]);
  fs.appendFileSync(path.join(root, 'games.jsonl'), data.records.slice(1152, 1188).map(record => JSON.stringify(record)).join('\n') + '\n' + '{"future');
  const raw = fs.readFileSync(path.join(root, 'games.jsonl'));
  await writeRevisionReport(root, options);
  assert.deepEqual(fs.readFileSync(first.checkpointFile), frozen);
  assert.deepEqual(fs.readFileSync(path.join(root, 'games.jsonl')), raw);
  assert.deepEqual(fs.readFileSync(path.join(root, 'parent', 'games.jsonl')), parentBefore);
  assert.equal(fs.existsSync(path.join(root, 'report.lock')), false);
  assert.equal(sha(parentBefore), data.plan.parent.journalSha256);
  fs.writeFileSync(first.checkpointFile, 'altered');
  await assert.rejects(writeRevisionReport(root, options), /checkpoint artifact differs/);
});

test('writer uses copied parent bytes, rejects modified snapshots and incomplete barriers', async t => {
  const data = await fixture(), root = directory(t, data, 36);
  fs.appendFileSync(path.join(root, 'parent', 'games.jsonl'), '\n');
  await assert.rejects(writeRevisionReport(root, data.options), /checksum/);
  fs.copyFileSync(path.join(ROOT, data.plan.parent.journalFile), path.join(root, 'parent', 'games.jsonl'));
  fs.writeFileSync(path.join(root, 'run.json'), '{}');
  await assert.rejects(writeRevisionReport(root, data.options), /manifest snapshots differ/);
  await assert.rejects(makeRevisionReport(data.manifest, data.records.slice(0, 1151), { ...data.options, checkpoint: 1152 }), /before every scheduled prefix/);
  await assert.rejects(makeRevisionReport(data.manifest, data.records, { ...data.options, checkpoint: 1152, bootstrap: 0 }), /declared bootstrap/);
});

test('cancellation releases report lock and preserves raw histories without freezing a partial checkpoint', async t => {
  const data = await fixture(), root = directory(t, data), controller = new AbortController();
  const raw = fs.readFileSync(path.join(root, 'games.jsonl'));
  await assert.rejects(writeRevisionReport(root, { ...data.options, checkpoint: 1152, signal: controller.signal,
    analyze: async (dataset, options) => { const result = await data.analyze(dataset, options); controller.abort(); return result; } }), { name: 'AbortError' });
  assert.deepEqual(fs.readFileSync(path.join(root, 'games.jsonl')), raw);
  assert.equal(fs.existsSync(path.join(root, 'report.lock')), false);
  assert.equal(fs.existsSync(path.join(root, 'checkpoints')), false);
  assert.equal(fs.existsSync(path.join(root, 'revision-report.json')), false);
});
