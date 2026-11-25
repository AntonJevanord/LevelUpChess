'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Chess } = require('chess.js');
const { proveMate, replayPosition } = require('../scripts/puzzles/mate-proof');
const { replayPuzzle } = require('../src/puzzle-data');
const ONE = '7k/6pp/5KQ1/8/8/8/8/8 w - - 0 1';
const TWO = '5r1k/6pp/4Q2N/8/8/8/8/1K6 w - - 0 1';
let alive = 0;
const rules = { createBoard(fen) {
  const game = new Chess(fen); alive++;
  const request = uci => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci[4] ? { promotion: uci[4] } : {}) });
  return { fen: () => game.fen(), turn: () => game.turn(), moves: () => game.moves({ verbose: true }).map(move => move.lan),
    san(uci) { const move = game.move(request(uci)); game.undo(); return move.san; },
    push(uci) { try { return Boolean(game.move(request(uci))); } catch { return false; } },
    outcome() { return game.isCheckmate() ? { reason: 'checkmate', result: game.turn() === 'w' ? '0-1' : '1-0' }
      : game.isDraw() ? { reason: 'draw', result: '1/2-1/2' } : null; },
    dispose() { alive--; } };
} };
test.afterEach(() => assert.equal(alive, 0, 'proof boards are always disposed'));
test('exact one-move proof is unique and replays to mate in the shared puzzle verifier', async () => {
  const proof = await proveMate({ rules, initialFen: ONE });
  assert.equal(proof.status, 'proved'); assert.equal(proof.moves, 1);
  assert.deepEqual(proof.solution, { move: 'g6g7', replies: [] });
  const replay = await replayPuzzle({ variant: 'chess', initialFen: ONE, initialMoves: [], fen: ONE,
    solverColor: 'w', goal: { type: 'mate', moves: 1 }, solution: proof.solution }, { createGame: fen => new Chess(fen) });
  assert.ok(replay);
});
test('two-move smothered mate records the forced defense and final knight move', async () => {
  const proof = await proveMate({ rules, initialFen: TWO, maxMoves: 2 });
  assert.equal(proof.status, 'proved'); assert.equal(proof.moves, 2);
  assert.deepEqual(proof.solution, { move: 'e6g8', replies: [{ move: 'f8g8', next: { move: 'h6f7', replies: [] } }] });
  await replayPuzzle({ variant: 'chess', initialFen: TWO, initialMoves: [], fen: TWO,
    solverColor: 'w', goal: { type: 'mate', moves: 2 }, solution: proof.solution }, { createGame: fen => new Chess(fen) });
  const escape = await proveMate({ rules, initialFen: TWO.replace('6pp', '6p1'), maxMoves: 2 });
  assert.notEqual(escape.status, 'proved', 'a king escape refutes the original tactical line');
});
test('alternative mating moves, too-short solutions and bounded work do not become puzzles', async () => {
  const ambiguous = await proveMate({ rules, initialFen: '7k/5K2/6Q1/8/8/8/8/8 w - - 0 1' });
  assert.equal(ambiguous.status, 'ambiguous');
  assert.equal((await proveMate({ rules, initialFen: ONE, minMoves: 2, maxMoves: 2 })).status, 'too-short');
  const limited = await proveMate({ rules, initialFen: TWO, nodeLimit: 1 });
  assert.equal(limited.status, 'unproven'); assert.equal(limited.reason, 'proof-node-limit');
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(proveMate({ rules, initialFen: ONE, signal: aborted.signal }), { name: 'AbortError' });
});
test('full pre-root history and fifty-move claims are retained during proof', async () => {
  const cycle = ['b1b2', 'f8f7', 'b2b1', 'f7f8'];
  await assert.rejects(proveMate({ rules, initialFen: TWO, initialMoves: [...cycle, ...cycle] }), /nonterminal solver turn/);
  assert.equal((await proveMate({ rules, initialFen: TWO.replace('0 1', '99 1') })).status, 'no-forced-mate');
  await assert.rejects(proveMate({ rules, initialFen: ONE, fen: TWO }), /differs from/);
  assert.throws(() => replayPosition(rules, ONE, ['a1a2']), /cannot be replayed/);
});
