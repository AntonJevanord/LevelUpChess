'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Chess } = require('chess.js');
const { planMiningGames, candidatesForMiningGame } = require('../scripts/puzzles/mining-sources');

let alive = 0;
const request = uci => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci[4] ? { promotion: uci[4] } : {}) });
const result = game => game.isCheckmate() ? { result: game.turn() === 'w' ? '0-1' : '1-0', reason: 'checkmate' }
  : game.isStalemate() ? { result: '1/2-1/2', reason: 'stalemate' }
    : game.isThreefoldRepetition() ? { result: '1/2-1/2', reason: 'threefold-repetition' }
      : game.isDraw() ? { result: '1/2-1/2', reason: 'draw' } : null;
const rules = { createBoard(fen) {
  const game = new Chess(fen); alive++;
  return { fen: () => game.fen(), turn: () => game.turn(),
    moves: () => game.moves({ verbose: true }).map(row => row.lan),
    san(uci) { const made = game.move(request(uci)); game.undo(); return made.san; },
    push(uci) { try { return Boolean(game.move(request(uci))); } catch { return false; } },
    outcome: () => result(game), dispose() { alive--; } };
} };
function source(id, sans, profileHash = 'synthetic-profile') {
  const game = new Chess(), startFen = game.fen(), moves = [];
  for (const san of sans) moves.push(game.move(san).lan);
  const record = { id, attempt: 1, status: 'completed', ...result(game), startFen, finalFen: game.fen(), moves, openingMoves: [] };
  const context = { key: id, profile: { hash: profileHash }, records: [record], rulesFactory: async () => rules,
    identity: { runId: id, stageKey: 'synthetic-stage' } };
  return { contexts: [context] };
}
const scholar = () => source('synthetic-white-mate', ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#']);
const fool = () => source('synthetic-black-mate', ['f3', 'e5', 'g4', 'Qh4#']);
const repeated = () => source('synthetic-draw', ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']);
test.afterEach(() => assert.equal(alive, 0, 'mining replay boards are always disposed'));

test('broad mining retains both winners and draws, deduplicates attempts and selects before grouping profiles', () => {
  const sources = [scholar(), fool(), repeated()];
  sources[0].contexts[0].profile.hash = 'z-profile'; sources[1].contexts[0].profile.hash = 'a-profile';
  const all = planMiningGames([...sources, sources[0]], 100);
  assert.equal(all.length, 3); assert.deepEqual(new Set(all.map(row => row.record.result)), new Set(['1-0', '0-1', '1/2-1/2']));
  assert.deepEqual(all.map(row => row.context.profile.hash), [...all.map(row => row.context.profile.hash)].sort());
  assert.deepEqual(planMiningGames(sources, 2).map(row => row.id), planMiningGames([...sources].reverse(), 2).map(row => row.id));
  const truncated = scholar(); truncated.contexts[0].records[0].status = 'truncated'; truncated.contexts[0].records[0].result = '*';
  assert.equal(planMiningGames([truncated], 10).length, 0);
  const conflicting = structuredClone(sources[0].contexts[0].records[0]); conflicting.moves[0] = 'd2d4';
  sources[0].contexts[0].records.push(conflicting);
  assert.throws(() => planMiningGames(sources, 10), /Conflicting copies/);
});

test('candidates include the eventual loser and tactical positions throughout the legal game without changing source records', async () => {
  const input = scholar(), before = JSON.stringify(input.contexts[0].records);
  const game = planMiningGames([input], 1)[0];
  const rows = await candidatesForMiningGame(game, { maxMoves: 3, positionsPerGame: 20 });
  assert.equal(rows.length, 6); assert.deepEqual(new Set(rows.map(row => row.solverColor)), new Set(['w', 'b']));
  assert.ok(rows.some(row => row.ply === 1 && row.solverColor === 'b'), 'early losing-side opportunities remain eligible');
  assert.ok(rows.some(row => row.ply === 6 && row.signals.includes('recorded-capture') && row.signals.includes('recorded-check')));
  assert.ok(rows.every(row => row.fen.split(' ')[1] === row.solverColor && row.rules === rules));
  assert.equal(JSON.stringify(input.contexts[0].records), before);
  assert.deepEqual(rows.map(row => row.id), (await candidatesForMiningGame(game, { maxMoves: 3, positionsPerGame: 20 })).map(row => row.id));
});

test('sampling honors both physical colors and raises the position allowance to the requested mate bound', async () => {
  const game = planMiningGames([scholar()], 1)[0];
  const rows = await candidatesForMiningGame(game, { maxMoves: 5, positionsPerGame: 1 });
  assert.equal(rows.length, 5); assert.deepEqual(new Set(rows.map(row => row.solverColor)), new Set(['w', 'b']));
  const two = await candidatesForMiningGame(game, { maxMoves: 1, positionsPerGame: 2 });
  assert.equal(two.length, 2); assert.deepEqual(new Set(two.map(row => row.solverColor)), new Set(['w', 'b']));
});

test('completed repetition draws replay with their entire histories and forced opening positions remain excluded', async () => {
  const input = repeated(), game = planMiningGames([input], 1)[0];
  game.record.openingMoves = game.record.moves.slice(0, 4);
  const rows = await candidatesForMiningGame(game, { maxMoves: 3, positionsPerGame: 20 });
  assert.deepEqual(rows.map(row => row.ply), [5, 6, 7]);
  assert.deepEqual(new Set(rows.map(row => row.solverColor)), new Set(['w', 'b']));
});

test('unknown outcomes, changed prefixes, invalid final positions and cancellation cannot yield candidates', async () => {
  const game = planMiningGames([fool()], 1)[0];
  for (const patch of [{ result: '1-0' }, { reason: 'stalemate' }, { finalFen: game.record.startFen }, { openingMoves: ['a2a3'] }]) {
    await assert.rejects(candidatesForMiningGame({ ...game, record: { ...game.record, ...patch } }, { maxMoves: 3 }), /outcome|prefix/);
  }
  const controller = new AbortController(); controller.abort();
  await assert.rejects(candidatesForMiningGame(game, { maxMoves: 3 }, controller.signal), { name: 'AbortError' });
  await assert.rejects(candidatesForMiningGame(game, { maxMoves: 9 }), /bounds/);
});
