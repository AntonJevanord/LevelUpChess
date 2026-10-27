'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { rulesBuildOptions } = require('../scripts/rules-build');
const { normalizeConfig, makeSchedule } = require('../scripts/balance/plan');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { validateDesignConfig } = require('../scripts/balance/validate-designs');
const { createProgressFormatter } = require('../scripts/balance/progress');
const { decodeMaterial } = require('../scripts/balance/material-dataset');
const { pieceMap, placementFromMap, pocketLetters } = require('../src/profile-fen');
const { UciEngine } = require('../scripts/balance/uci');

const GRANT = 'king.reserve-pawn@1';
const nativePath = process.env.FAIRY_STOCKFISH_PATH || path.resolve(__dirname, '../node_modules/.cache/levelup-native-values/stockfish');
const native = { skip: !fs.existsSync(nativePath), timeout: 30000 };
let temporary, createMatchRules;

function config(armyA = { reserve: [{ id: GRANT, count: 3 }] }) {
  return normalizeConfig({ schemaVersion: 3, name: 'Reserve plumbing validation; not balance evidence', seed: 42,
    engine: { nodes: 256, threads: 1, hashMb: 16, maxPlies: 6 },
    openings: [{ id: 'start', moves: [] }],
    comparisons: [{ id: 'three-grants-v-amazon', armyA, armyB: { upgrades: { d1: 'queen.purple@1' } } }],
  });
}
function profile(input = config()) { return compileDesignProfile(createDesignRegistry(input), input.evaluation); }
function fen(pieces, pocket = '', turn = 'w') {
  const map = new Map(Object.entries(pieces)); map.pocket = pocket;
  return placementFromMap(map) + ` ${turn} - - 0 1`;
}
test.before(async () => {
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-reserve-balance-'));
  const outfile = path.join(temporary, 'rules.cjs');
  await build({ ...rulesBuildOptions(), entryPoints: [path.resolve(__dirname, '../src/balance-rules.js')], bundle: true, platform: 'node', format: 'cjs', outfile });
  ({ createMatchRules } = require(outfile));
});
test.after(() => fs.rmSync(temporary, { recursive: true, force: true }));

test('schema 3 charges finite reserve quantities while preserving legacy army normal forms', () => {
  const normalized = config({ reserve: [{ id: 'king.reserve-bishop@1', count: 1 }, { id: GRANT, count: 2 }], upgrades: { c2: 'pawn.blue@2' } });
  assert.deepEqual(normalized.comparisons[0].armyA, { upgrades: { c2: 'pawn.blue@2' }, remove: [],
    reserve: [{ id: 'king.reserve-bishop@1', count: 1 }, { id: GRANT, count: 2 }] });
  assert.deepEqual(normalizeConfig(normalized), normalized);
  assert.equal(makeSchedule(normalized).length, 2);
  assert.throws(() => config({ upgrades: { d1: 'queen.purple@1' }, reserve: [{ id: GRANT, count: 7 }] }), /at most 9/);
  assert.doesNotThrow(() => config({ reserve: [{ id: GRANT, count: 9 }] }));
  assert.doesNotThrow(() => config({ reserve: [{ id: 'king.reserve-true-queen@1', count: 1 }] }));
  for (const schemaVersion of [1, 2]) {
    const legacy = normalizeConfig({ schemaVersion, name: 'Legacy unchanged', comparisons: [{ id: 'ordinary', armyA: {}, armyB: {} }] });
    assert.deepEqual(legacy.comparisons[0].armyA, { upgrades: {}, remove: [] });
    const changed = { ...legacy, comparisons: [{ id: 'bad', armyA: { reserve: [] }, armyB: {} }] };
    assert.throws(() => normalizeConfig(changed), /reserve/);
  }
});

test('reserve declarations reject invalid counts, duplicate types, royal replacement and over-budget grants', () => {
  for (const count of [0, -1, 10, 1.5, '3', null]) assert.throws(() => config({ reserve: [{ id: GRANT, count }] }));
  for (const reserve of [null, {}, [{ id: 'unknown@1', count: 1 }], [{ id: 'pawn.blue@2', count: 1 }],
    [{ id: GRANT, count: 1, typo: true }], [{ id: GRANT, count: 1 }, { id: GRANT, count: 1 }],
    [{ id: 'king.reserve-true-queen@1', count: 2 }]]) assert.throws(() => config({ reserve }));
  assert.throws(() => config({ upgrades: { e1: GRANT } }), /ordinary royal king/);
  const direct = { ...config(), evaluation: { pieceValues: { [GRANT]: { mg: 126, eg: 208 } } } };
  assert.deepEqual(normalizeConfig(direct).evaluation.pieceValues[GRANT], { mg: 126, eg: 208 });
});

test('registry and deployment put three grants directly in the pocket without changing kings, pawns or castling', async t => {
  const input = config(), compiled = profile(input), rules = await createMatchRules({ profile: compiled });
  const letter = compiled.registry.allocations.find(entry => entry.id === GRANT).letter;
  assert.ok(compiled.registry.definitions.some(entry => entry.id === GRANT));
  for (const aColor of ['w', 'b']) {
    const armyA = input.comparisons[0].armyA, armyB = input.comparisons[0].armyB;
    const start = rules.startingFen(aColor === 'w' ? armyA : armyB, aColor === 'w' ? armyB : armyA);
    assert.equal(pocketLetters(start), (aColor === 'w' ? letter.toUpperCase() : letter).repeat(3));
    const pieces = pieceMap(start);
    assert.equal(pieces.size, 32);
    assert.equal(pieces.get('e1'), 'K'); assert.equal(pieces.get('e8'), 'k');
    assert.equal(pieces.get('d2'), 'P'); assert.equal(pieces.get('d7'), 'p');
    assert.match(start, / w KQkq - 0 1$/);
    const board = rules.createBoard(start); t.after(() => board.dispose());
    assert.ok(board.moves().some(move => move.includes('@')) === (aColor === 'w'));
  }
  assert.throws(() => rules.startingFen({ reserve: [{ id: GRANT, count: 10 }] }, {}), /finite counts/);
  assert.throws(() => decodeMaterial(rules.startingFen(input.comparisons[0].armyA, {}), compiled), /pocket-aware material/);
});

test('drop histories retain their exact UCI and SAN and progress labels include reserve quantities', async t => {
  const input = config(), compiled = profile(input), rules = await createMatchRules({ profile: compiled });
  const letter = compiled.registry.allocations.find(entry => entry.id === GRANT).letter;
  input.openings = [{ id: 'drop-fixture', moves: [letter.toUpperCase() + '@e4'] }];
  const scheduled = makeSchedule(input);
  assert.equal(scheduled[0].openingMoves[0], letter.toUpperCase() + '@e4');
  const board = rules.createBoard(rules.startingFen(input.comparisons[0].armyA, {})); t.after(() => board.dispose());
  assert.equal(board.san(letter.toUpperCase() + '@e4'), letter.toUpperCase() + '@e4');
  assert.equal(board.push(letter.toUpperCase() + '@e4'), true);
  assert.equal(pocketLetters(board.fen()).length, 2);
  const text = createProgressFormatter(scheduled)(`Finished ${scheduled[0].id}: 1-0 (checkmate).`);
  assert.match(text, /3 × .* in reserve/);
});

test('parallel schema 3 freezes reserve quantities and whole pairs without launching games on an immediate stop', async () => {
  const { runParallel } = require('../scripts/balance/parallel');
  const input = config(), outDir = path.join(temporary, 'parallel-stopped');
  const stopped = await runParallel({ config: input, outDir, jobs: 4, enginePath: process.execPath, shouldStop: () => 'now' });
  assert.equal(stopped.stopped, true); assert.equal(stopped.nextIndex, 0);
  const original = fs.readFileSync(path.join(outDir, 'run.json'), 'utf8');
  const manifest = JSON.parse(original);
  assert.equal(manifest.config.schemaVersion, 3);
  assert.deepEqual(manifest.config.comparisons[0].armyA.reserve, [{ id: GRANT, count: 3 }]);
  assert.ok(manifest.designRegistry.definitions.some(entry => entry.id === GRANT));
  assert.equal(manifest.parallel.shards.length, 1, 'one color pair needs one worker');
  assert.equal(manifest.parallel.shards[0].scheduleIds.length, 2);
  const resumed = await runParallel({ outDir, resume: true, enginePath: process.execPath, shouldStop: () => 'now' });
  assert.equal(resumed.nextIndex, 0);
  assert.equal(fs.readFileSync(path.join(outDir, 'run.json'), 'utf8'), original);
  assert.equal(fs.existsSync(path.join(outDir, 'workers')), false);
});

test('native preflight and rules agree on own-half drops, no checking drops, interposition and capture disappearance', native, async t => {
  const input = config(), compiled = profile(input), rules = await createMatchRules({ profile: compiled });
  const letter = compiled.registry.allocations.find(entry => entry.id === GRANT).letter;
  const variantPath = path.join(temporary, 'reserve.ini'); fs.writeFileSync(variantPath, compiled.config);
  const engine = new UciEngine({ path: nativePath, variantPath, variant: compiled.variant, options: { threads: 1, hash: 16 } });
  t.after(() => engine.close()); await engine.start();
  const frames = [
    fen({ a1: 'K', e4: 'k' }, letter.toUpperCase().repeat(3)),
    fen({ a8: 'k', e5: 'K' }, letter.repeat(3), 'b'),
    fen({ a1: 'K', h8: 'k', a8: 'r' }, letter.toUpperCase()),
    fen({ a1: 'K', h8: 'k', b3: letter.toUpperCase(), b8: 'r' }, '', 'b'),
  ];
  for (const position of frames) {
    const board = rules.createBoard(position); t.after(() => board.dispose());
    assert.deepEqual(await engine.perft({ fen: position }), board.moves().sort());
  }
  const white = rules.createBoard(frames[0]); t.after(() => white.dispose());
  assert.ok(white.moves().includes(letter.toUpperCase() + '@b2'));
  assert.ok(!white.moves().includes(letter.toUpperCase() + '@e3'), 'deployment cannot give forward check');
  assert.ok(!white.moves().includes(letter.toUpperCase() + '@g5'), 'deployment cannot enter the enemy half');
  const checked = rules.createBoard(frames[2]); t.after(() => checked.dispose());
  assert.ok(checked.moves().includes(letter.toUpperCase() + '@a3'));
  const captured = rules.createBoard(frames[3]); t.after(() => captured.dispose());
  assert.equal(captured.push('b8b3'), true); assert.equal(pocketLetters(captured.fen()), '');
  const proof = await validateDesignConfig(input, { enginePath: nativePath });
  assert.equal(proof.games, 2); assert.equal(proof.native, true); assert.ok(proof.movementChecks > 0);
});

test('an aborted native workflow preserves pocket/drop PGN and resumes its frozen history without scoring games', native, async t => {
  const { runMatches } = require('../scripts/balance/run');
  const input = config(), compiled = profile(input);
  const letter = compiled.registry.allocations.find(entry => entry.id === GRANT).letter;
  input.openings = [{ id: 'drop-fixture', moves: [letter.toUpperCase() + '@e4'] }];
  // Both colors need the same reserve so this forced drop prefix is legal.
  input.comparisons[0].armyB = input.comparisons[0].armyA;
  const schedule = makeSchedule(input), outDir = path.join(temporary, 'aborted-run');
  const execute = async resume => {
    const controller = new AbortController();
    return runMatches({ config: input, schedule, outDir, resume, enginePath: nativePath, signal: controller.signal,
      onProgress(message) { if (message.startsWith('Starting game')) controller.abort(); } });
  };
  const first = await execute(false); assert.equal(first.stopped, true);
  const manifest = fs.readFileSync(path.join(outDir, 'run.json'), 'utf8');
  const resumed = await execute(true); assert.equal(resumed.stopped, true);
  assert.equal(fs.readFileSync(path.join(outDir, 'run.json'), 'utf8'), manifest);
  const records = fs.readFileSync(path.join(outDir, 'games.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(records.length, 2);
  assert.ok(records.every(record => record.status === 'aborted' && record.result === '*'));
  assert.deepEqual(records.map(record => record.moves), [[letter.toUpperCase() + '@e4'], [letter.toUpperCase() + '@e4']]);
  assert.equal(records[0].finalFen, records[1].finalFen);
  assert.match(fs.readFileSync(path.join(outDir, 'games.pgn'), 'utf8'), /@[a-h][1-8]/);
  assert.equal(resumed.summary.statusCounts.completed || 0, 0);
});
