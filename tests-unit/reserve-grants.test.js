'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, existsSync, writeFileSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { rulesBuildOptions } = require('../scripts/rules-build');
const { PLAYABLE_PROFILES } = require('../src/design-options');
const { defaultDesignChoices, designSetupFromChoices, loadDesignSetup, designBudgetLimit, designSlots } = require('../src/design-setup');
const { pieceMap, placementFromMap, pocketLetters } = require('../src/profile-fen');
const { UciEngine } = require('../scripts/balance/uci');

const profile = PLAYABLE_PROFILES.find(candidate => candidate.roles.reserveTypes);
const id = name => `king.reserve-${name}@1`;
const type = name => profile.registry.allocations.find(allocation => allocation.id === id(name)).letter;
let VariantGame, initVariantRules, createMatchRules, temporary;

test.before(async () => {
  temporary = mkdtempSync(path.join(os.tmpdir(), 'levelup-reserve-integration-'));
  const rules = path.join(temporary, 'rules.cjs'), balance = path.join(temporary, 'balance.cjs');
  await Promise.all([
    build({ ...rulesBuildOptions(), entryPoints: [path.resolve(__dirname, '../src/variant-game.js')], bundle: true, platform: 'node', format: 'cjs', outfile: rules }),
    build({ ...rulesBuildOptions(), entryPoints: [path.resolve(__dirname, '../src/balance-rules.js')], bundle: true, platform: 'node', format: 'cjs', outfile: balance }),
  ]);
  ({ VariantGame, initVariantRules } = require(rules));
  ({ createMatchRules } = require(balance));
  await initVariantRules(profile.variant);
});
test.after(() => rmSync(temporary, { recursive: true, force: true }));

function game(t, pieces, pocket = '', turn = 'w', rights = '-') {
  const map = new Map(Object.entries(pieces));
  map.pocket = pocket;
  const instance = new VariantGame(`${placementFromMap(map)} ${turn} ${rights} - 0 1`, profile.variant);
  t.after(() => instance.dispose());
  return instance;
}

test('a numbered king purchase keeps the royal king and starts exactly one finite guard in each pocket', async t => {
  assert.equal(designBudgetLimit(profile), 9);
  assert.equal(designSlots(profile).length, 32);
  const choices = { ...defaultDesignChoices(profile), e1: id('true-queen'), e8: id('pawn') };
  const setup = designSetupFromChoices(choices, 9, profile);
  assert.deepEqual(setup.costs, { w: 9, b: 1 });
  assert.equal(pieceMap(setup.fen).get('e1'), 'K');
  assert.equal(pieceMap(setup.fen).get('e8'), 'k');
  assert.equal(pieceMap(setup.fen).size, 32);
  assert.equal(pocketLetters(setup.fen), type('true-queen').toUpperCase() + type('pawn'));
  assert.match(setup.fen, / w KQkq - 0 1$/);
  assert.deepEqual(loadDesignSetup(setup.fen, profile), choices);
  const instance = new VariantGame(setup.fen, profile.variant);
  t.after(() => instance.dispose());
  assert.equal(instance.fen(), setup.fen);
  const rules = await createMatchRules({ profile });
  const board = rules.createBoard(rules.startingFen({ upgrades: { e1: id('true-queen') } }, { upgrades: { e1: id('pawn') } }));
  t.after(() => board.dispose());
  assert.equal(board.fen(), setup.fen, 'browser setup and direct balance setup agree');
  assert.throws(() => designSetupFromChoices(choices, 8, profile), /Budget exceeded/);
});

test('reserve profiles serialize empty pockets and preserve ordinary castling', t => {
  const setup = designSetupFromChoices(defaultDesignChoices(profile), 6, profile);
  const normal = new VariantGame(setup.fen, profile.variant);
  t.after(() => normal.dispose());
  assert.equal(normal.fen(), setup.fen);
  assert.match(setup.fen, /\[\] w KQkq/);
  const instance = game(t, { a1: 'R', e1: 'K', h1: 'R', e8: 'k' }, type('king').toUpperCase(), 'w', 'KQ');
  const moves = instance.moves({ square: 'e1', verbose: true });
  assert.ok(moves.some(move => move.san === 'O-O'));
  assert.ok(moves.some(move => move.san === 'O-O-O'));
});

test('drops spend a turn on empty own-half squares, cannot check, and keep repeated finite quantities', t => {
  const letter = type('true-queen');
  const instance = game(t, { a1: 'K', h8: 'k', d4: 'P' }, letter.toUpperCase().repeat(2));
  const moves = instance.moves({ drop: letter, verbose: true });
  assert.ok(moves.length);
  assert.ok(moves.every(move => Number(move.to[1]) <= 4 && move.flags === 'd' && move.uci === letter.toUpperCase() + '@' + move.to));
  assert.ok(!moves.some(move => move.to === 'd4'), 'occupied destinations cannot receive drops');
  assert.ok(!moves.some(move => move.to === 'e5'), 'enemy half is forbidden');
  assert.ok(!moves.some(move => move.to === 'h3'), 'a checking rook-line drop is forbidden');
  instance.move({ drop: letter, to: 'b3' });
  assert.equal(instance.turn(), 'b');
  assert.equal(instance.pockets().w[0].count, 1);
  assert.equal(instance.get('b3').type, letter);
  const black = game(t, { a1: 'K', h8: 'k' }, letter, 'b');
  assert.ok(black.moves({ drop: letter, verbose: true }).every(move => Number(move.to[1]) >= 5));
});

test('dropping may interpose check but cannot evade a knight attack', t => {
  const letter = type('bishop');
  const sliding = game(t, { e1: 'K', h8: 'k', e8: 'r' }, letter.toUpperCase());
  assert.equal(sliding.isCheck(), true);
  assert.ok(sliding.moves({ drop: letter, verbose: true }).some(move => move.to === 'e3'));
  assert.ok(!sliding.moves({ drop: letter, verbose: true }).some(move => move.to === 'd3'));
  const knight = game(t, { e1: 'K', h8: 'k', f3: 'n' }, letter.toUpperCase());
  assert.equal(knight.isCheck(), true);
  assert.equal(knight.moves({ drop: letter }).length, 0);
});

test('deployed guards are nonroyal, capturable and never recycled into pockets', t => {
  const letter = type('king');
  const instance = game(t, { a1: 'K', h8: 'k', d4: letter.toUpperCase(), d8: 'r' }, '', 'b');
  instance.move({ from: 'd8', to: 'd4' });
  assert.equal(instance.get('d4').type, 'r');
  assert.deepEqual(instance.pockets(), { w: [], b: [] });
  assert.equal(instance.get('a1').type, 'k');
  assert.equal(instance.isGameOver(), false);
});

test('pocket material prevents a bare-kings draw and undo/PGN restore the entire drop state', t => {
  const letter = type('knight');
  const instance = game(t, { a1: 'K', h8: 'k' }, letter.toUpperCase());
  const original = instance.fen();
  assert.equal(instance.isInsufficientMaterial(), false);
  const dropped = instance.move(letter.toUpperCase() + '@d4');
  assert.equal(dropped.drop, letter);
  assert.equal(instance.history({ verbose: true })[0].uci, letter.toUpperCase() + '@d4');
  assert.equal(instance.pockets().w.length, 0);
  const restored = new VariantGame(undefined, profile.variant);
  t.after(() => restored.dispose());
  restored.loadPgn(instance.pgn());
  assert.equal(restored.fen(), instance.fen());
  assert.deepEqual(restored.history(), instance.history());
  assert.equal(restored.undo().drop, letter);
  assert.equal(restored.fen(), original);
  instance.undo();
  assert.equal(instance.fen(), original);
  instance.reset();
  assert.equal(instance.fen(), original);
  const bare = game(t, { a1: 'K', h8: 'k' });
  assert.equal(bare.isInsufficientMaterial(), true);
});

test('pocket validation rejects royal/ordinary pieces and malformed reserve fields', t => {
  const initial = '7k/8/8/8/8/8/8/K7';
  for (const pocket of ['K', 'P', 'r', 'aa][aa', 'A1']) {
    assert.throws(() => new VariantGame(`${initial}[${pocket}] w - - 0 1`, profile.variant), /pocket|FEN/i);
  }
});

const nativePath = process.env.FAIRY_STOCKFISH_PATH || path.resolve(__dirname, '../node_modules/.cache/levelup-native-values/stockfish');
test('native and browser agree on finite drops and all nine deployed guards', { skip: !existsSync(nativePath), timeout: 30000 }, async t => {
  const rules = await createMatchRules({ profile });
  const filename = path.join(temporary, 'reserves.ini');
  writeFileSync(filename, profile.config);
  const engine = new UciEngine({ path: nativePath, variantPath: filename, variant: profile.variant, options: { threads: 1, hashMb: 16 } });
  t.after(() => engine.close());
  await engine.start();
  const check = async fen => {
    const board = rules.createBoard(fen);
    try { assert.deepEqual(await engine.perft({ fen }), board.moves().sort(), fen); }
    finally { board.dispose(); }
  };
  const allGuards = profile.roles.reserveTypes.join('');
  for (const turn of ['w', 'b']) {
    const map = new Map([['a1', 'K'], ['h8', 'k']]);
    map.pocket = turn === 'w' ? allGuards.toUpperCase() : allGuards;
    await check(`${placementFromMap(map)} ${turn} - - 0 1`);
  }
  for (const letter of allGuards) {
    await check(`8/7k/8/8/3${letter.toUpperCase()}4/8/8/K7[] w - - 0 1`);
    await check(`k7/8/8/3${letter}4/8/8/7K/8[] b - - 0 1`);
  }
  // A bounded reply proves that a legal reserve search completes; it is not a
  // scored match or a new balance observation.
  const map = new Map([['a1', 'K'], ['h8', 'k']]);
  map.pocket = type('knight').toUpperCase();
  const fen = `${placementFromMap(map)} w - - 0 1`;
  const board = rules.createBoard(fen);
  try { assert.ok(board.moves().includes((await engine.search({ fen, nodes: 256 })).move)); }
  finally { board.dispose(); }
});
