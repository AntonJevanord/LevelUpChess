'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getCampaign } = require('../scripts/balance/material-plan');
const { makeCollectionReport, writeCollectionReport, markdown } = require('../scripts/balance/material-collection-report');

const profile = getCampaign().profile;
const placement = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

function fixture({ plies = 28, firstCapture = false, duplicate = false } = {}) {
  const settings = { nodes: 20000, threads: 1, hashMb: 32, maxPlies: 400, skill: 20, seed: 42 };
  const schedule = ['ordinary', 'amazon-w', 'amazon-b', ...(duplicate ? ['ordinary-copy'] : [])].map(id => {
    const kind = id.startsWith('ordinary') ? 'ordinary' : 'amazon', aColor = id === 'amazon-b' ? 'b' : 'w';
    const board = kind === 'ordinary' ? placement : aColor === 'w' ? placement.replace('Q', 'U') : placement.replace('q', 'u');
    return { id, unitId: kind === 'ordinary' ? id : 'amazon-pair', kind, aColor,
      openingId: 'book-1', comparisonId: kind, startFen: `${board} w KQkq - 0 1`, openingMoves: [] };
  });
  const statesFor = game => Array.from({ length: plies + 1 }, (_, ply) => {
    let board = game.startFen.split(' ')[0];
    if (firstCapture && ply > 0 && game.kind === 'ordinary') board = board.replace('PPPPPPPP', '1PPPPPPP');
    return `${board} ${ply % 2 ? 'b' : 'w'} KQkq - ${ply} ${1 + Math.floor(ply / 2)}`;
  });
  const records = schedule.map(game => {
    const states = statesFor(game);
    return { ...game, schemaVersion: 1, pairId: game.unitId, attempt: 1, status: 'completed',
      result: '1/2-1/2', reason: 'threefold-repetition', finalFen: states.at(-1),
      moves: Array.from({ length: plies }, (_, index) => `m${index}`),
      sans: Array.from({ length: plies }, (_, index) => `S${index}`), totalPlies: plies, playedPlies: plies,
      openingMoves: [], openingPlies: 0, profileHash: profile.hash, registryHash: profile.registryHash,
      registryReference: 'collection.json#plan.registry', variant: profile.variant,
      royalMode: 'king', evaluationCaveat: null,
      engine: { nodes: settings.nodes, threads: settings.threads, hashMb: settings.hashMb, maxPlies: settings.maxPlies },
      whiteStrength: { skill: 20 }, blackStrength: { skill: 20 } };
  });
  let disposed = 0;
  const rulesFactory = async () => ({ createBoard(start) {
    const game = schedule.find(candidate => candidate.startFen === start), states = statesFor(game);
    let ply = 0;
    return { fen: () => states[ply], outcome: () => ply === plies ? { result: '1/2-1/2', reason: 'threefold-repetition' } : null,
      san(move) { assert.equal(move, `m${ply}`); return `S${ply}`; },
      push(move) { if (move !== `m${ply}`) return false; ply++; return true; }, dispose() { disposed++; } };
  } });
  const manifest = { schemaVersion: 1, format: 'levelup-material-collection', runId: 'fixture-run',
    plan: { settings, profile, registry: profile.registry, schedule,
      protocol: { sampling: { minPly: 16, stride: 5, stableBefore: 2, stableAfter: 2 } } } };
  return { manifest, records, rulesFactory, disposed: () => disposed };
}

test('ordinary singleton and both asymmetric Amazon games retain sparse bonus variation and draws', async () => {
  const data = fixture(), result = await makeCollectionReport(data.manifest, data.records, { rulesFactory: data.rulesFactory, bootstrap: 0 });
  assert.equal(result.report.coverage.completedRecords, 3);
  assert.equal(result.report.coverage.uniqueHistories, 3);
  assert.equal(result.report.coverage.samples, 9);
  assert.equal(result.report.coverage.upgradeImbalance.games, 2);
  assert.equal(result.report.coverage.upgradeImbalance.positiveSamples, 3);
  assert.equal(result.report.coverage.upgradeImbalance.negativeSamples, 3);
  assert.equal(result.report.coverage.cohorts.ordinary.uniqueHistories, 1);
  assert.deepEqual(new Set(result.samples.map(row => row.x[5])), new Set([-1, 1]));
  for (const game of result.dataset.games) assert.ok(Math.abs(result.samples.filter(row => row.gameId === game.gameId).reduce((sum, row) => sum + row.weight, 0) - 1) < 1e-10);
  assert.ok(result.samples.every(sample => sample.y === 0.5 && sample.groupId === 'book-1'));
  assert.equal(result.dataset.games.find(game => game.gameId === 'amazon-w').startingCounts.white.upgrades['queen.purple@1'], 1);
  assert.equal(result.dataset.games.find(game => game.gameId === 'amazon-w').startingCounts.white.families.queen, 1);
  assert.equal(result.report.analysis.combined.validation.unit, 'whole-selected-book-position-cluster');
  assert.equal(result.report.analysis.combined.normalized.materialPriceTableSupported, false);
  assert.equal(result.report.coverage.partialScoredAmazonUnits, 0);
  assert.equal(data.disposed(), 3);
});

test('EPD material counter includes the initial position and resets on a first-move capture', async () => {
  const data = fixture({ firstCapture: true });
  const result = await makeCollectionReport(data.manifest, data.records, { rulesFactory: data.rulesFactory, bootstrap: 0 });
  const lines = result.epd.ordinary.trim().split('\n');
  assert.match(lines[0], /;hmvc 0;/);
  assert.match(lines[1], /;hmvc 1;/);
  assert.match(lines[0], /;game fixture-run:ordinary;/);
  assert.match(lines[0], /;variant chess;collection_profile /);
  assert.match(result.epd.amazon, new RegExp(`;variant ${profile.variant};collection_profile ${profile.variant};`));
  assert.match(result.epd.amazon, /;profile [a-f0-9]+;registry [a-f0-9]+/);
  assert.match(lines.at(-1), /;bm none;/);
});

test('unscored attempts are excluded rather than converted to losses or draw-labelled EPD', async () => {
  const data = fixture();
  data.records[1].status = 'truncated'; data.records[1].result = '*'; data.records[1].reason = 'max-plies';
  data.records[2].status = 'error'; data.records[2].result = '*'; data.records[2].reason = 'engine';
  const result = await makeCollectionReport(data.manifest, data.records, { rulesFactory: data.rulesFactory, bootstrap: 0 });
  assert.equal(result.dataset.games.length, 1);
  assert.equal(result.report.coverage.statusCounts.truncated, 1);
  assert.equal(result.report.coverage.statusCounts.error, 1);
  assert.equal(result.report.coverage.remainingGames, 1);
  assert.equal(result.epd.amazon, '');
  assert.equal(result.report.coverage.upgradeImbalance.games, 0);
  assert.ok(result.report.warnings.some(warning => warning.includes('unidentifiable, not zero-valued')));
  assert.match(markdown(result.report), /unsupported feature is not a zero piece value/);
  data.records[1] = fixture().records[1];
  const partial = await makeCollectionReport(data.manifest, data.records, { rulesFactory: data.rulesFactory, bootstrap: 0 });
  assert.equal(partial.report.coverage.partialScoredAmazonUnits, 1);
});

test('physical duplicates are retained in coverage but fitted and exported only once', async () => {
  const data = fixture({ duplicate: true });
  const result = await makeCollectionReport(data.manifest, data.records, { rulesFactory: data.rulesFactory, bootstrap: 0 });
  assert.equal(result.report.coverage.completedRecords, 4);
  assert.equal(result.report.coverage.uniqueHistories, 3);
  assert.equal(result.report.coverage.duplicateGames.length, 1);
  assert.equal(result.epd.ordinary.trim().split('\n').length, 28);
});

test('corrupt moves, foreign settings and conflicting attempts fail before producing estimates', async () => {
  const edits = [data => { data.records[0].sans[3] = 'incorrect'; },
    data => { data.records[0].engine.nodes++; },
    data => { data.records[0].startFen = data.records[1].startFen; },
    data => { data.records[0].profileHash = 'bad'; },
    data => { data.manifest.plan.protocol.sampling.stride++; },
    data => { data.records[0].result = '*'; },
    data => { data.records.push({ ...data.records[0], attempt: 2 }); }];
  for (const edit of edits) {
    const data = fixture(); edit(data);
    await assert.rejects(makeCollectionReport(data.manifest, data.records, { rulesFactory: data.rulesFactory, bootstrap: 0 }));
  }
});

test('pending collection is an honest empty report with no fabricated value or outcome', async () => {
  const data = fixture();
  const result = await makeCollectionReport(data.manifest, [], { rulesFactory: data.rulesFactory, bootstrap: 0 });
  assert.equal(result.report.coverage.remainingGames, 3);
  assert.equal(result.report.coverage.completedRecords, 0);
  assert.equal(result.report.analysis.combined.normalized.available, false);
  assert.equal(result.epd.ordinary, '');
});

test('derived file refresh leaves journal bytes untouched and ignores only a torn final line', async t => {
  const data = fixture(), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-collection-report-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, 'collection.json'), JSON.stringify(data.manifest));
  fs.writeFileSync(path.join(directory, 'run.json'), JSON.stringify(data.manifest));
  const journal = data.records.map(row => JSON.stringify(row)).join('\n') + '\n{"partial"';
  fs.writeFileSync(path.join(directory, 'games.jsonl'), journal);
  const result = await writeCollectionReport(directory, { rulesFactory: data.rulesFactory, bootstrap: 0 });
  assert.equal(fs.readFileSync(path.join(directory, 'games.jsonl'), 'utf8'), journal);
  assert.ok(result.report.inputs.ignoredTornTailBytes > 0);
  assert.equal(result.report.coverage.completedRecords, 3);
  assert.ok(fs.existsSync(result.files['material-samples.jsonl']));
  assert.equal(result.files.markdown, path.join(directory, 'material-collection-report.md'));
  assert.equal(result.files.json, path.join(directory, 'material-collection-report.json'));
  await writeCollectionReport(directory, { rulesFactory: data.rulesFactory, bootstrap: 0 });
  assert.equal(fs.readFileSync(path.join(directory, 'games.jsonl'), 'utf8'), journal);
  assert.equal(fs.existsSync(path.join(directory, 'report.lock')), false);
});

test('dedicated report lock rejects concurrent writers and is released after replay errors', async t => {
  const data = fixture(), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-report-lock-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, 'collection.json'), JSON.stringify(data.manifest));
  const journal = data.records.map(row => JSON.stringify(row)).join('\n') + '\n';
  fs.writeFileSync(path.join(directory, 'games.jsonl'), journal);
  // A report can read an active run; only other report writers are excluded.
  fs.writeFileSync(path.join(directory, 'run.lock'), 'collector owns this');
  let unblock;
  const blocked = new Promise(resolve => { unblock = resolve; });
  const first = writeCollectionReport(directory, { rulesFactory: async () => { await blocked; throw new Error('replay fixture failure'); }, bootstrap: 0 });
  assert.equal(fs.existsSync(path.join(directory, 'report.lock')), true);
  await assert.rejects(writeCollectionReport(directory, { rulesFactory: data.rulesFactory, bootstrap: 0 }), /Another material report writer/);
  unblock();
  await assert.rejects(first, /replay fixture failure/);
  assert.equal(fs.existsSync(path.join(directory, 'report.lock')), false);
  assert.equal(fs.readFileSync(path.join(directory, 'run.lock'), 'utf8'), 'collector owns this');
  assert.equal(fs.readFileSync(path.join(directory, 'games.jsonl'), 'utf8'), journal);
  const result = await writeCollectionReport(directory, { rulesFactory: data.rulesFactory, bootstrap: 0 });
  assert.equal(result.report.coverage.completedRecords, 3);
  assert.equal(fs.existsSync(path.join(directory, 'report.lock')), false);
});
