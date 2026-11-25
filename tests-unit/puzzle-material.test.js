'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { Chess } = require('chess.js');
const { rulesBuildOptions } = require('../scripts/rules-build');
const data = require('../src/puzzle-data');
const { proveMaterial } = require('../scripts/puzzles/material-proof');
const examples = require('../src/puzzle-examples.json');
const FREE = '7k/q7/8/8/8/8/1P6/R6K w - - 0 1';
const FORK = '8/7k/8/3N4/6q1/8/1P6/K7 w - - 0 1';
const clone = value => JSON.parse(JSON.stringify(value));
let api, temporary;
function createBoard(fen) {
  const game = new Chess(fen);
  return { fen: () => game.fen(), turn: () => game.turn(), isCheck: () => game.isCheck(),
    moves: () => data.legalUcis(game), san: uci => game.moves({ verbose: true }).find(row => data.uciOf(row) === uci)?.san,
    push(uci) { try { data.playUci(game, uci); return true; } catch { return false; } },
    outcome: () => game.isGameOver() ? { result: game.isCheckmate() ? game.turn() === 'w' ? '0-1' : '1-0' : '1/2-1/2', reason: game.isCheckmate() ? 'checkmate' : 'draw' } : null,
    dispose() {},
  };
}
const rules = { createBoard };
async function packFor(fen, maxMoves = 1) {
  const proof = await proveMaterial({ rules, initialFen: fen, maxMoves, nodeLimit: 300000, timeLimitMs: 15000 });
  assert.equal(proof.status, 'proved');
  const puzzle = { id: 'synthetic-material-' + maxMoves, title: 'Material tactic test fixture', variant: 'chess',
    initialFen: fen, initialMoves: [], fen, solverColor: 'w', goal: proof.goal, solution: proof.solution,
    provenance: { kind: 'authored', note: 'Synthetic rules-verification fixture; not a balance experiment result.' } };
  puzzle.pieces = await data.derivePuzzlePieces(puzzle, { createGame: api.puzzleGameFactory });
  return { pack: { schemaVersion: 1, format: data.FORMAT, profiles: {}, puzzles: [puzzle] }, proof };
}
test.before(async () => {
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-material-puzzles-'));
  const outfile = path.join(temporary, 'session.cjs');
  await build({ ...rulesBuildOptions(), bundle: true, platform: 'node', format: 'cjs', outfile,
    stdin: { contents: "export * from './src/puzzle-session.js';", resolveDir: path.resolve(__dirname, '..'), loader: 'js' } });
  api = require(outfile);
});
test.after(() => fs.rmSync(temporary, { recursive: true, force: true }));

test('material values are explicit puzzle-counting assumptions and include mapped units and reserves', () => {
  assert.equal(data.materialBalance(FREE, 'w'), -300);
  assert.equal(data.materialBalance(FREE, 'b'), 300);
  const profile = Object.values(examples.profiles)[0], values = data.materialValues(profile);
  const rook = profile.registry.allocations.find(row => row.id === 'rook.purple@10').letter;
  const grant = profile.registry.definitions.find(row => row.placement === 'reserve');
  const grantLetter = profile.registry.allocations.find(row => row.id === grant.id).letter;
  assert.equal(values[rook], 800); assert.equal(values[grantLetter], grant.level * 100);
  assert.equal(data.materialBalance(`7k/8/8/8/8/8/8/K7[${grantLetter.toUpperCase()}] w - - 0 1`, 'w', profile), grant.level * 100);
});

test('a unique material capture includes every legal defender reply and a replayable settling certificate', async () => {
  const { pack, proof } = await packFor(FREE);
  assert.equal(proof.solution.move, 'a1a7'); assert.equal(proof.goal.minimumGain, 200);
  data.validatePuzzlePack(pack);
  const replay = await data.replayPuzzle(pack.puzzles[0], { createGame: api.puzzleGameFactory });
  assert.equal(replay.moves, 1); assert.ok(replay.leaves > 0);
  assert.ok(!pack.puzzles[0].pieces.involved.includes('pawn'), 'an unrelated stationary pawn is not tagged');
  const missing = clone(pack); missing.puzzles[0].solution.replies = [];
  assert.throws(() => data.validatePuzzlePack(missing), /defender replies/);
  const inventedGain = clone(pack.puzzles[0]); inventedGain.solution.replies[0].leaf.gain++;
  await assert.rejects(data.replayPuzzle(inventedGain, { createGame: api.puzzleGameFactory }), /declared leaf/);
  const unsettled = clone(pack.puzzles[0]); unsettled.solution.replies[0].leaf.settlement = {
    kind: 'settled', fen: unsettled.solution.replies[0].leaf.fen, gain: unsettled.solution.replies[0].leaf.gain };
  await assert.rejects(data.replayPuzzle(unsettled, { createGame: api.puzzleGameFactory }), /not tactically settled/);
});

test('immediate recaptures refute a queen-for-rook illusion; proof bounds and cancellation remain unproven', async () => {
  const recapture = await proveMaterial({ rules, initialFen: '3r3k/3r4/8/8/8/8/1P6/3Q3K w - - 0 1', maxMoves: 1, nodeLimit: 50000, timeLimitMs: 10000 });
  assert.equal(recapture.status, 'no-material-win');
  const limited = await proveMaterial({ rules, initialFen: FREE, nodeLimit: 1 });
  assert.equal(limited.status, 'unproven');
  const stopped = new AbortController(); stopped.abort();
  await assert.rejects(proveMaterial({ rules, initialFen: FREE, signal: stopped.signal }), /cancelled/);
  const tooShort = await proveMaterial({ rules, initialFen: FREE, minMoves: 2, maxMoves: 3 });
  assert.equal(tooShort.status, 'too-short');
  // Either rook may capture the hanging queen; this is not an absence of a win.
  const eitherRook = await proveMaterial({ rules, initialFen: '7k/q1R5/8/8/8/8/1P6/R6K w - - 0 1', maxMoves: 1 });
  assert.equal(eitherRook.status, 'ambiguous');
  await assert.rejects(proveMaterial({ rules, initialFen: FREE, maxMoves: 6 }), /bounded material proof/);
});

test('material sessions solve after the terminal defender reply, and support wrong moves, retry, hint and reveal', async () => {
  const { pack } = await packFor(FREE);
  const session = await api.createPuzzleSession(pack, pack.puzzles[0].id);
  try {
    const original = session.game.fen();
    assert.equal(session.tryMove('a1b1').accepted, false); assert.equal(session.game.fen(), original);
    assert.match(session.hint().hint, /Rxa7/);
    const played = session.tryMove('a1a7');
    assert.equal(played.accepted, true); assert.equal(played.moves.length, 2);
    assert.equal(played.state.status, 'solved'); assert.equal(session.game.isCheckmate(), false);
    await session.retry(); assert.equal(session.game.fen(), original);
    assert.equal(session.reveal().state.status, 'revealed');
  } finally { session.dispose(); }
});

test('a checked knight fork wins material in two solver moves, and goal/relevance filters retain old packs', async () => {
  const { pack, proof } = await packFor(FORK, 2);
  assert.equal(proof.goal.moves, 2); assert.equal(proof.solution.move, 'd5f6');
  const session = await api.createPuzzleSession(pack, pack.puzzles[0].id);
  try {
    assert.equal(session.tryMove('d5f6').state.status, 'playing');
    assert.equal(session.tryMove('f6g4').state.status, 'solved');
  } finally { session.dispose(); }
  pack.puzzles[0].relevance = { classification: 'exclusive' };
  const all = [...examples.puzzles, ...pack.puzzles];
  assert.equal(data.filterPuzzles(all, { goalType: 'material' }).length, 1);
  assert.equal(data.filterPuzzles(all, { goalType: 'mate' }).length, examples.puzzles.length);
  assert.equal(data.filterPuzzles(all, { variantRelevance: 'exclusive' }).length, 1);
  assert.equal(data.filterPuzzles(examples.puzzles, { variantRelevance: 'exclusive' }).length, 0);
  data.validatePuzzlePack(examples);
  const fixture = path.join(__dirname, 'fixtures/material-puzzle-pack.json');
  const stored = data.validatePuzzlePack(JSON.parse(fs.readFileSync(fixture, 'utf8')));
  await data.replayPuzzle(stored.puzzles[0], { createGame: api.puzzleGameFactory });
  const tags = await data.derivePuzzlePieces(stored.puzzles[0], { createGame: api.puzzleGameFactory });
  assert.deepEqual(tags, stored.puzzles[0].pieces);
});
