'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Chess } = require('chess.js');
const { proveMate, replayPosition } = require('../scripts/puzzles/mate-proof');
const { replayPuzzle } = require('../src/puzzle-data');
const { placementFromMap } = require('../src/profile-fen');
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

// A finite protocol fixture, not a chess position or research result. Every
// solver turn has a losing alternative and every defender turn has two legal
// defenses. It checks long-bound recursion independently of a particular
// engine's ability to discover a real mate-in-five at a small search budget.
function longMateGraph(length, { extraRootWin = false, escape = false } = {}) {
  const states = [], byFen = new Map(); let live = 0;
  for (let index = 0; index <= length * 2 - 1; index++) {
    const square = 'bcdefg'[index % 6] + (2 + Math.floor(index / 6));
    const fen = placementFromMap(new Map([['a1', 'K'], ['h8', 'k'], [square, 'N']]))
      + ` ${index % 2 ? 'b' : 'w'} - - ${index} ${1 + Math.floor(index / 2)}`;
    const state = { index, fen, mate: index === length * 2 - 1 };
    states.push(state); byFen.set(fen, state);
  }
  const lost = { index: -1, fen: '7k/8/8/8/8/8/1B6/K7 b - - 0 1', drawn: true }; byFen.set(lost.fen, lost);
  const next = (state, move) => {
    if (state.index % 2 === 0) return move === 'a1a2' || extraRootWin && state.index === 0 ? states[state.index + 1] : lost;
    return escape && state.index === 1 && move === 'h8g8' ? lost : states[state.index + 1];
  };
  const legal = state => state.mate || state.drawn ? [] : state.index % 2 === 0 ? ['a1a2', 'a1b1'] : ['h8h7', 'h8g8'];
  const graphRules = { createBoard(fen) {
    let state = byFen.get(fen); assert.ok(state); live++;
    return { fen: () => state.fen, turn: () => state.fen.split(' ')[1], moves: () => legal(state),
      san(move) { assert.ok(legal(state).includes(move)); return next(state, move).mate ? 'N#' : 'N'; },
      push(move) { if (!legal(state).includes(move)) return false; state = next(state, move); return true; },
      outcome: () => state.mate ? { result: '1-0', reason: 'checkmate' } : state.drawn ? { result: '1/2-1/2', reason: 'stalemate' } : null,
      dispose() { live--; } };
  } };
  return { rules: graphRules, initialFen: states[0].fen, get live() { return live; },
    pv: Array.from({ length: length * 2 - 1 }, (_, index) => index % 2 ? 'h8h7' : 'a1a2') };
}

test('three-, four- and five-move bounds retain every defense and prove the shortest unique solver line', async () => {
  for (const length of [3, 4, 5]) {
    const graph = longMateGraph(length);
    const proof = await proveMate({ ...graph, maxMoves: length, preferredMoves: ['a1b1', 'not-a-legal-hint'], pv: [...graph.pv, 'stale-hint'] });
    assert.equal(proof.status, 'proved'); assert.equal(proof.moves, length);
    const visit = (tree, remaining) => {
      assert.equal(tree.move, 'a1a2');
      if (remaining === 1) assert.deepEqual(tree.replies, []);
      else {
        assert.deepEqual(tree.replies.map(row => row.move).sort(), ['h8g8', 'h8h7']);
        tree.replies.forEach(row => visit(row.next, remaining - 1));
      }
    };
    visit(proof.solution, length); assert.equal(graph.live, 0);
  }
});

test('preferred PVs cannot hide an alternative long mate, an escape defense or incomplete proof work', async () => {
  for (const [options, expected] of [[{ extraRootWin: true }, 'ambiguous'], [{ escape: true }, 'no-forced-mate']]) {
    const graph = longMateGraph(4, options);
    const proof = await proveMate({ ...graph, maxMoves: 4, preferredMoves: ['a1a2'], pv: graph.pv });
    assert.equal(proof.status, expected); assert.equal(graph.live, 0);
  }
  const graph = longMateGraph(5);
  const limited = await proveMate({ ...graph, maxMoves: 5, nodeLimit: 5 });
  assert.equal(limited.status, 'unproven'); assert.equal(graph.live, 0);
  await assert.rejects(proveMate({ ...graph, maxMoves: 6 }), /valid bounded/);
});
