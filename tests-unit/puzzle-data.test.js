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
const examples = require('../src/puzzle-examples.json');
const clone = value => JSON.parse(JSON.stringify(value));
let api, directory;
test.before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-puzzles-'));
  const outfile = path.join(directory, 'api.cjs');
  await build({ ...rulesBuildOptions(), bundle: true, platform: 'node', format: 'cjs', outfile,
    stdin: { contents: "export * from './src/puzzle-session.js';", resolveDir: path.resolve(__dirname, '..'), loader: 'js' } });
  api = require(outfile);
});
test.after(() => fs.rmSync(directory, { recursive: true, force: true }));

test('pack schema pins exact known profiles and rejects malformed goals, trees, metadata and duplicate identities', () => {
  assert.equal(data.validatePuzzlePack(examples), examples);
  assert.deepEqual(data.validatePuzzlePack({ schemaVersion: 1, format: data.FORMAT, profiles: {}, puzzles: [] }).puzzles, []);
  for (const edit of [pack => pack.puzzles.push(clone(pack.puzzles[0])),
    pack => pack.puzzles[0].goal.moves = 0,
    pack => pack.puzzles[0].solution.move = 'a1a9',
    pack => pack.puzzles[0].pieces.moved = ['not-a-piece'],
    pack => Object.values(pack.profiles)[0].config += '\nchecking = false\n',
    pack => pack.puzzles[0].solverColor = 'b',
    pack => pack.puzzles[0].solution.replies = [{ move: 'h8h7', next: clone(pack.puzzles[0].solution) }]]) {
    const changed = clone(examples); edit(changed); assert.throws(() => data.validatePuzzlePack(changed));
  }
  assert.throws(() => data.validatePuzzlePack('{')); assert.throws(() => data.validatePuzzlePack(' '.repeat(data.MAX_PACK_BYTES + 1)));
});

test('filters distinguish stationary involvement, actual solution movement and mere presence with solver-move lengths', async () => {
  const stationary = examples.puzzles.find(row => row.id === 'authored-stationary-knight');
  assert.ok(stationary.pieces.involved.includes('knight')); assert.ok(stationary.pieces.stationary.includes('knight'));
  assert.ok(!stationary.pieces.moved.includes('knight'));
  assert.deepEqual(data.filterPuzzles(examples.puzzles, { involved: ['knight'] }).map(row => row.id), [stationary.id]);
  assert.equal(data.filterPuzzles(examples.puzzles, { moved: ['knight'] }).length, 0);
  assert.equal(data.filterPuzzles(examples.puzzles, { minMoves: 2 }).length, 0);
  assert.equal(data.filterPuzzles(examples.puzzles, { involved: [], moved: [], present: [] }).length, 3);
  assert.equal(data.filterPuzzles(examples.puzzles, { minMoves: 2, maxMoves: 1 }).length, 0);
  const irrelevantPawn = clone(examples.puzzles[0]);
  irrelevantPawn.fen = irrelevantPawn.initialFen = '7k/8/5KQ1/8/8/8/P7/8 w - - 0 1';
  const pieces = await data.derivePuzzlePieces(irrelevantPawn, { createGame: api.puzzleGameFactory });
  assert.ok(pieces.present.includes('pawn')); assert.ok(!pieces.involved.includes('pawn'));
  assert.equal(data.pieceLabel('rook.purple@10'), 'Vanguard');
});

test('every authored example has exactly one legal mate in one and replays under its actual declared rules', async () => {
  for (const puzzle of examples.puzzles) {
    const proof = await data.replayPuzzle(puzzle, { createGame: api.puzzleGameFactory });
    assert.deepEqual({ moves: proof.moves, leaves: proof.leaves }, { moves: 1, leaves: 1 });
    const game = await api.puzzleGameFactory(puzzle.initialFen, puzzle.variant);
    try {
      const mates = [];
      for (const move of game.moves({ verbose: true })) {
        game.move(move); if (game.isCheckmate()) mates.push(data.uciOf(move)); game.undo();
      }
      assert.deepEqual(mates, [puzzle.solution.move]);
      assert.equal(puzzle.provenance.kind, 'authored');
    } finally { game.dispose?.(); }
    const tags = await data.derivePuzzlePieces(puzzle, { createGame: api.puzzleGameFactory });
    assert.deepEqual(tags, puzzle.pieces);
  }
});

test('session rejects wrong and illegal moves transactionally, supports hints, solve, retry and reveal', async () => {
  const session = await api.createPuzzleSession(examples, 'authored-stationary-knight');
  try {
    const before = session.game.fen(), history = session.game.history();
    assert.equal(session.tryMove({ from: 'g6', to: 'g5' }).accepted, false);
    assert.equal(session.tryMove({ from: 'g6', to: 'a3' }).accepted, false);
    assert.equal(session.game.fen(), before); assert.deepEqual(session.game.history(), history);
    assert.match(session.hint().hint, /Qg7/);
    assert.equal(session.tryMove({ from: 'g6', to: 'g7' }).accepted, true);
    assert.equal(session.state().status, 'solved'); assert.equal(session.game.isCheckmate(), true);
    assert.equal(session.tryMove('g6g7').accepted, false);
    await session.retry(); assert.equal(session.game.fen(), before); assert.equal(session.state().solverMovesPlayed, 0);
    assert.equal(session.reveal().state.status, 'revealed'); assert.equal(session.game.isCheckmate(), true);
  } finally { session.dispose(); }
  assert.throws(() => session.tryMove('g6g7'), /closed/);
});

test('all defender branches and full pre-root history are checked before a session can open', async () => {
  const root = 'k7/8/2K5/3Q4/8/8/8/8 w - - 0 1';
  const puzzle = { ...clone(examples.puzzles[0]), id: 'two-move-fixture', initialFen: root, fen: root,
    goal: { type: 'mate', moves: 2 }, solution: { move: 'd5d7', replies: [{ move: 'a8b8', next: { move: 'd7b7', replies: [] } }] } };
  puzzle.pieces = await data.derivePuzzlePieces(puzzle, { createGame: api.puzzleGameFactory });
  const pack = { schemaVersion: 1, format: data.FORMAT, profiles: {}, puzzles: [puzzle] };
  const session = await api.createPuzzleSession(pack, puzzle.id);
  try {
    const turn = session.tryMove('d5d7'); assert.equal(turn.accepted, true); assert.equal(turn.moves.length, 2);
    assert.equal(session.game.turn(), 'w'); assert.equal(session.state().solverMovesPlayed, 1);
    assert.equal(session.tryMove('d7b7').state.status, 'solved');
  } finally { session.dispose(); }
  const missing = clone(pack); missing.puzzles[0].solution.replies = [];
  await assert.rejects(api.createPuzzleSession(missing, puzzle.id), /omits or invents/);
  const wrongFen = clone(pack); wrongFen.puzzles[0].initialMoves = ['d5d7'];
  await assert.rejects(api.createPuzzleSession(wrongFen, puzzle.id), /source history/);
  const fakeTags = clone(pack); fakeTags.puzzles[0].pieces.present = ['king'];
  await assert.rejects(api.createPuzzleSession(fakeTags, puzzle.id), /participation tags/);
});

test('black solutions, promotion move notation and preserved repetition history follow ordinary rules', async () => {
  const black = clone(examples.puzzles[0]);
  black.id = 'black-mate-fixture'; black.initialFen = black.fen = '8/8/8/8/8/5kq1/8/7K b - - 0 1';
  black.solverColor = 'b'; black.solution.move = 'g3g2';
  black.pieces = await data.derivePuzzlePieces(black, { createGame: api.puzzleGameFactory });
  const proof = await data.replayPuzzle(black, { createGame: api.puzzleGameFactory }); assert.equal(proof.moves, 1);
  const promotion = new Chess('7k/P7/6K1/8/8/8/8/8 w - - 0 1');
  assert.equal(data.playUci(promotion, 'a7a8q').promotion, 'q'); assert.equal(promotion.isCheckmate(), true);
  assert.deepEqual(data.requestForUci('A@d4'), { drop: 'a', to: 'd4' });
  const repeated = clone(examples.puzzles[0]);
  repeated.initialFen = new Chess().fen(); repeated.initialMoves = ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8'];
  const game = new Chess(); repeated.initialMoves.forEach(move => data.playUci(game, move)); repeated.fen = game.fen();
  await assert.rejects(data.replayPuzzle(repeated, { createGame: api.puzzleGameFactory }), /playable puzzle position/);
});

test('castling tags both physically moved units, including an upgraded castling rook', async () => {
  const profile = Object.values(examples.profiles)[0];
  const letter = profile.registry.allocations.find(row => row.id === 'rook.purple@10').letter;
  for (const [variant, type, rookId] of [['chess', 'R', 'rook'], [profile.variant, letter.toUpperCase(), 'rook.purple@10']]) {
    const fen = `4rkr1/4p1p1/8/8/8/8/8/4K2${type} w K - 0 1`;
    const game = await api.puzzleGameFactory(fen, variant);
    const canonical = game.fen();
    const castle = game.moves({ verbose: true }).find(row => row.san === 'O-O#');
    assert.ok(castle, 'the fixture has a legal mating castle');
    game.dispose?.();
    const puzzle = { ...clone(examples.puzzles[0]), id: 'castling-tags', variant, initialFen: fen, fen: canonical,
      solution: { move: data.uciOf(castle), replies: [] } };
    const tags = await data.derivePuzzlePieces(puzzle, { createGame: api.puzzleGameFactory });
    assert.ok(tags.moved.includes('king')); assert.ok(tags.moved.includes(rookId));
    assert.ok(tags.involved.includes(rookId)); assert.ok(!tags.stationary.includes(rookId));
  }
});

test('leaving during an asynchronous retry disposes its replacement without reopening the session', async () => {
  let held = false, release, replacementDisposed = false;
  const createGame = async (fen) => {
    const game = new Chess(fen);
    if (held) {
      game.dispose = () => { replacementDisposed = true; };
      await new Promise(resolve => { release = resolve; });
    }
    return game;
  };
  const session = await api.createPuzzleSession(examples, 'authored-queen-net', { createGame });
  held = true;
  const retry = session.retry();
  session.dispose(); release();
  await assert.rejects(retry, /cancelled/);
  assert.equal(replacementDisposed, true);
  assert.throws(() => session.game, /closed/);
});
