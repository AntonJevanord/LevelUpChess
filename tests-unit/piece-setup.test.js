const test = require('node:test');
const assert = require('node:assert/strict');
const { PIECE_SLOTS, PIECE_LEVELS, DEFAULT_PIECE_LEVELS } = require('../src/piece-catalog');
const { START_FEN, pieceSetupFromLevels, loadPieceSetup } = require('../src/piece-setup');
const { setupFromLevels } = require('../src/knight-setup');

const zero = () => Object.fromEntries(PIECE_SLOTS.map(slot => [slot.square, 0]));
const pieceCount = fen => fen.split(' ')[0].match(/[A-Za-z]/g).length;

test('all 26 standard choices reproduce standard chess without changing castling or royalty', () => {
  assert.equal(PIECE_SLOTS.length, 26);
  assert.equal(new Set(PIECE_SLOTS.map(slot => slot.square)).size, 26);
  const result = pieceSetupFromLevels(zero(), 1);
  assert.equal(result.fen, START_FEN);
  assert.deepEqual(result.costs, { w: 0, b: 0 });
  assert.deepEqual(loadPieceSetup(result.fen), zero());
});

test('mixed families apply independent costs and recover the original choices', () => {
  const levels = Object.freeze({ ...zero(), a2: 1, b2: 2, c2: 3, b1: 3, c1: 2, d1: 2, h7: 2, g8: 2, f8: 3, d8: 3 });
  const result = pieceSetupFromLevels(levels, 13);
  assert.equal(result.fen, 'rnbukjfr/pppppppc/8/8/8/1G6/ACDPPPPP/RNITKBNR w KQkq - 0 1');
  assert.deepEqual(result.costs, { w: 13, b: 10 });
  assert.deepEqual(result.levels, levels);
  assert.notEqual(result.levels, levels);
  assert.deepEqual(loadPieceSetup(result.fen), levels);
});

test('every starting pawn supports the three upgrade codes with correct side and no added pawn', () => {
  const levels = zero();
  PIECE_SLOTS.filter(slot => slot.family === 'pawn').forEach((slot, index) => { levels[slot.square] = index % 3 + 1; });
  const result = pieceSetupFromLevels(levels, 39);
  const ranks = result.fen.split(' ')[0].split('/');
  assert.match(ranks[1], /^[acd]{8}$/);
  assert.match(ranks[6], /^[ACD]{8}$/);
  assert.equal(pieceCount(result.fen), 32);
  assert.deepEqual(loadPieceSetup(result.fen), levels);
});

test('maximum armies cost 39 per side and preserve all pawns, rooks, kings, and standard knights', () => {
  const levels = Object.fromEntries(PIECE_SLOTS.map(slot => [slot.square, 3]));
  const result = pieceSetupFromLevels(levels, 39);
  assert.equal(result.fen, 'rnjukjnr/dddddddd/1g4g1/8/8/1G4G1/DDDDDDDD/RNJUKJNR w KQkq - 0 1');
  assert.deepEqual(result.costs, { w: 39, b: 39 });
  assert.equal(pieceCount(result.fen), 36);
  const army = result.fen.split(' ')[0];
  assert.equal(army.match(/[Dd]/g).length, 16);
  assert.equal(army.match(/[Nn]/g).length, 4);
  assert.equal(army.match(/[Rr]/g).length, 4);
  assert.equal(army.match(/[Kk]/g).length, 2);
  assert.equal(army.match(/[Jj]/g).length, 4);
  assert.deepEqual(loadPieceSetup(result.fen), levels);
});

test('purple bishops replace bishops rather than spawning extra pieces', () => {
  const levels = { ...zero(), c1: 3, f1: 3, c8: 3, f8: 3 };
  const result = pieceSetupFromLevels(levels, 6);
  assert.equal(result.fen, 'rnjqkjnr/pppppppp/8/8/8/8/PPPPPPPP/RNJQKJNR w KQkq - 0 1');
  assert.equal(pieceCount(result.fen), 32);
  assert.deepEqual(result.costs, { w: 6, b: 6 });
});

test('legacy blue, orange, and purple knight saves recover alongside standard other families', () => {
  const knightLevels = { b1: 1, g1: 2, b8: 3, g8: 1 };
  const legacy = setupFromLevels(knightLevels, 4);
  assert.deepEqual(loadPieceSetup(legacy.fen), { ...zero(), ...knightLevels });
  assert.deepEqual(loadPieceSetup(pieceSetupFromLevels(DEFAULT_PIECE_LEVELS, 1).fen), DEFAULT_PIECE_LEVELS);
});

test('unknown pieces, wrong families, and wrong colors in custom positions infer level zero', () => {
  const fen = 'rnbqkbnr/pppppppP/1G6/8/8/1g6/CPPPPPPP/RXBTKBNR w KQkq - 0 1';
  assert.deepEqual(loadPieceSetup(fen), { ...zero(), a2: 2, d1: 2 });
});

test('budget constraints reject either side exceeding a supported whole-number budget', () => {
  const choices = { ...zero(), a2: 3, d1: 3, h7: 3, d8: 3 };
  assert.doesNotThrow(() => pieceSetupFromLevels(choices, 6));
  assert.throws(() => pieceSetupFromLevels({ ...choices, b1: 1 }, 6), /White 7\/6/);
  assert.throws(() => pieceSetupFromLevels({ ...choices, b8: 1 }, 6), /Black 7\/6/);
  for (const budget of [0, 40, 1.5, '3', NaN, null, undefined]) {
    assert.throws(() => pieceSetupFromLevels(zero(), budget), /budget from 1 to 39/);
  }
});

test('setup requires exactly the known slots, integer levels, and an available family upgrade', () => {
  for (const levels of [undefined, null, [], Array(26).fill(0), {}, { ...zero(), a1: 0 }]) {
    assert.throws(() => pieceSetupFromLevels(levels, 39), /26 upgradeable starting pieces/);
  }
  const missing = zero();
  delete missing.a2;
  assert.throws(() => pieceSetupFromLevels(missing, 39), /26 upgradeable starting pieces/);
  const wrong = { ...missing, other: 0 };
  assert.throws(() => pieceSetupFromLevels(wrong, 39), /whole numbers/);
  for (const value of [-1, 4, 0.5, '1', NaN, null]) {
    assert.throws(() => pieceSetupFromLevels({ ...zero(), a2: value }, 39), /whole numbers from 0 to 3/);
  }
  for (const square of ['d1', 'd8']) {
    assert.throws(() => pieceSetupFromLevels({ ...zero(), [square]: 1 }, 39), /Level 1 is not available for the queen/);
  }
});

test('each supported family level round-trips and keeps standard squares intact', () => {
  for (const family of Object.keys(PIECE_LEVELS)) {
    for (const [level, type] of PIECE_LEVELS[family].entries()) {
      if (!type) continue;
      const levels = zero();
      PIECE_SLOTS.filter(slot => slot.family === family).forEach(slot => { levels[slot.square] = level; });
      const result = pieceSetupFromLevels(levels, 39);
      assert.deepEqual(loadPieceSetup(result.fen), levels, `${family} level ${level}`);
      assert.match(result.fen, / w KQkq - 0 1$/);
    }
  }
});

test('malformed initial placement throws instead of returning misleading setup choices', () => {
  for (const fen of [null, undefined, '', 'not a FEN', '8/8/8/8/8/8/8/7', '8/8/8/8/8/8/8/9']) {
    assert.throws(() => loadPieceSetup(fen), /FEN is invalid/);
  }
});
