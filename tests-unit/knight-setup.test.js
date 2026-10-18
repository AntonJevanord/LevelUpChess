const test = require('node:test');
const assert = require('node:assert/strict');
const { START_FEN, setupFromLevels, loadInitialSetup } = require('../src/knight-setup');

const zero = () => ({ b1: 0, g1: 0, b8: 0, g8: 0 });

test('ordinary setup preserves the standard army and its full starting FEN', () => {
  const result = setupFromLevels(zero(), 1);
  assert.equal(result.fen, START_FEN);
  assert.deepEqual(result.costs, { w: 0, b: 0 });
  assert.deepEqual(loadInitialSetup(result.fen), zero());
});

test('mixed levels replace blue/orange knights and spawn purple pieces without removing knights', () => {
  const levels = Object.freeze({ b1: 1, g1: 2, b8: 3, g8: 1 });
  const result = setupFromLevels(levels, 4);
  assert.equal(result.fen, 'rnbqkber/pppppppp/1g6/8/8/8/PPPPPPPP/REBQKBFR w KQkq - 0 1');
  assert.deepEqual(result.costs, { w: 3, b: 4 });
  assert.deepEqual(result.levels, levels);
  assert.deepEqual(loadInitialSetup(result.fen), levels);
  assert.notEqual(result.levels, levels);
});

test('level 3 adds four pieces and preserves every pawn and original knight', () => {
  const levels = { b1: 3, g1: 3, b8: 3, g8: 3 };
  const result = setupFromLevels(levels, 6);
  const placement = result.fen.split(' ')[0];
  assert.equal(result.fen, 'rnbqkbnr/pppppppp/1g4g1/8/8/1G4G1/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  assert.equal(placement.match(/[A-Za-z]/g).length, 36);
  assert.equal(placement.match(/[Pp]/g).length, 16);
  assert.equal(placement.match(/[Nn]/g).length, 4);
  assert.deepEqual(result.costs, { w: 6, b: 6 });
  assert.deepEqual(loadInitialSetup(result.fen), levels);
});

test('white and black upgrades use symmetric types, spawn squares, and costs', () => {
  for (let level = 0; level <= 3; level++) {
    const choices = { b1: level, g1: 0, b8: level, g8: 0 };
    const result = setupFromLevels(choices, Math.max(level, 1));
    assert.deepEqual(result.costs, { w: level, b: level });
    assert.deepEqual(loadInitialSetup(result.fen), choices);
  }
});

test('budgets apply separately to both sides and reject either side exceeding its limit', () => {
  assert.doesNotThrow(() => setupFromLevels({ b1: 3, g1: 0, b8: 2, g8: 1 }, 3));
  assert.throws(() => setupFromLevels({ b1: 3, g1: 1, b8: 0, g8: 0 }, 3), /Budget exceeded: White 4\/3/);
  assert.throws(() => setupFromLevels({ b1: 0, g1: 0, b8: 3, g8: 1 }, 3), /Black 4\/3/);
  for (const budget of [0, 7, 1.5, '3', null, undefined, NaN]) {
    assert.throws(() => setupFromLevels(zero(), budget), /budget from 1 to 6/);
  }
});

test('setup requires exactly four integer levels and supports documented slot ordering', () => {
  assert.deepEqual(setupFromLevels([1, 2, 3, 0], 3).levels, { b1: 1, g1: 2, b8: 3, g8: 0 });
  for (const levels of [null, {}, [0, 0, 0], [0, 0, 0, 0, 0], { ...zero(), a1: 0 }, { b1: 0, g1: 0, b8: 0, other: 0 }]) {
    assert.throws(() => setupFromLevels(levels, 6), /four starting knights|whole numbers/);
  }
  for (const level of [-1, 4, 1.5, '1', null, NaN]) {
    assert.throws(() => setupFromLevels({ ...zero(), b1: level }, 6), /whole numbers from 0 to 3/);
  }
});

test('initial FEN recovery keeps old blue setups and prioritizes own purple spawn over the base', () => {
  const blue = 'rebqkbnr/pppppppp/8/8/8/8/PPPPPPPP/REBQKBNR w KQkq - 0 1';
  assert.deepEqual(loadInitialSetup(blue), { b1: 1, g1: 0, b8: 1, g8: 0 });
  const mixed = 'rfbqkbnr/pppppppp/1g6/8/8/1G6/PPPPPPPP/REBQKBNR w KQkq - 0 1';
  assert.deepEqual(loadInitialSetup(mixed), { b1: 3, g1: 0, b8: 3, g8: 0 });
  const wrongColor = 'rnbqkbnr/pppppppp/1G6/8/8/1g6/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  assert.deepEqual(loadInitialSetup(wrongColor), zero());
});

test('invalid initial placement is rejected instead of guessing setup levels', () => {
  for (const fen of [undefined, null, '', 'not a FEN', '8/8/8/8/8/8/8/7', '8/8/8/8/8/8/8/9']) {
    assert.throws(() => loadInitialSetup(fen), /FEN is invalid/);
  }
});
