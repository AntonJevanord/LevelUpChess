'use strict';

// Rule geometry and finite opening-prefix checks only; no scored games.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { rulesBuildOptions } = require('../scripts/rules-build');
const { UciEngine } = require('../scripts/balance/uci');
const { placementFromMap, pieceMap } = require('../src/profile-fen');
const { TRIALS, NEW_DEFINITIONS } = require('../src/balance-designs-v19-pawn-followup');
const ROOT = path.resolve(__dirname, '..');
const native = process.env.FAIRY_STOCKFISH_PATH || path.join(ROOT, 'node_modules/.cache/levelup-native-values/stockfish');
const rows = [
  ...TRIALS.map((row, index) => ({ ...row, variant: `v19-pawn-followup-${index}` })),
  { key: 'literal-quiet-bishop', movement: 'mvQ2fcB2', variant: 'v19-pawn-followup-literal' },
  { key: 'old-forward-queen', movement: 'fQ2mbQ2', variant: 'v19-pawn-followup-old-forward' },
  { key: 'literal-full-vertical', movement: 'vQ2fcB2', variant: 'v19-pawn-followup-full-vertical' },
  { key: 'old-diagonal-vertical', movement: 'B2vR2', variant: 'v19-pawn-followup-old-diagonal' },
];
const first = () => rows.find(row => row.id === 'pawn.level2-forward-queen-only@1');
const second = () => rows.find(row => row.id === 'pawn.level2-quiet-range-forward-bishop@1');
const control = key => rows.find(row => row.key === key);
const reflect = square => square[0] + (9 - Number(square[1]));
const swap = letter => letter === letter.toUpperCase() ? letter.toLowerCase() : letter.toUpperCase();
const forward = ['b6', 'c5', 'd5', 'd6', 'e5', 'f6'];
const diagonals = ['b2', 'b6', 'c3', 'c5', 'e3', 'e5', 'f2', 'f6'];
const vertical = ['d2', 'd3', 'd5', 'd6'];
const forwardDiagonals = ['b6', 'c5', 'e5', 'f6'];
const kings = { a8: 'K', h7: 'k' };
const blockers = { c3: 'P', c4: 'P', c5: 'P', d3: 'P', d5: 'P', e3: 'P', e4: 'P', e5: 'P' };
const fixtures = new Map(), transitions = [];
let directory, raw;
function fen(pieces, black = false, ep = '-') {
  const map = new Map(Object.entries(pieces).map(([square, letter]) => black ? [reflect(square), swap(letter)] : [square, letter]));
  return `${placementFromMap(map)} ${black ? 'b' : 'w'} - ${black && ep !== '-' ? reflect(ep) : ep} 0 1`;
}
function legal(row, position) {
  const board = new raw.Board(row.variant, position, false);
  try {
    const moves = board.legalMoves().split(' ').filter(Boolean).sort();
    fixtures.set(`${row.variant}:${position}`, { row, fen: position, moves });
    return moves;
  } finally { board.delete(); }
}
function destinations(row, pieces, black = false) {
  const source = black ? reflect('d4') : 'd4';
  return legal(row, fen(pieces, black)).filter(move => move.startsWith(source))
    .map(move => black ? reflect(move.slice(2, 4)) : move.slice(2, 4)).sort();
}
test.before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v19-pawn-followup-rules-'));
  const output = path.join(directory, 'raw.cjs');
  await build({ ...rulesBuildOptions(), absWorkingDir: ROOT,
    stdin: { contents: "import Module from 'ffish-es6'; import bytes from 'variant-wasm'; export async function createRaw(config) { const module = await Module({ wasmBinary: Uint8Array.from(atob(bytes), c => c.charCodeAt(0)) }); module.loadVariantConfig(config); return module; }", resolveDir: ROOT, loader: 'js' },
    bundle: true, platform: 'node', format: 'cjs', outfile: output, legalComments: 'none' });
  const config = rows.map(row => `[${row.variant}:chess]\ncustomPiece1 = a:${row.movement}\npieceToCharTable = -\npawnTypes = pa\nenPassantTypes = pa\npromotionPieceTypes = nbrq\n`).join('\n');
  raw = await require(output).createRaw(config);
  fs.writeFileSync(path.join(directory, 'rules.ini'), config);
});
test.after(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

test('the two new immutable pawn definitions separate forward full movement from quiet retreat and diagonal captures', () => {
  assert.equal(first().movement, 'fQ2');
  assert.equal(second().movement, 'mvQ2fceB2');
  for (const row of [first(), second()]) {
    const definition = NEW_DEFINITIONS.find(item => item.id === row.id);
    assert.equal(definition.movement, row.movement);
    assert.equal(definition.roles.pawn, true);
    assert.equal(definition.roles.enPassant, true);
  }
  const quietSecond = [...diagonals, ...vertical].sort();
  const targets = [...new Set([...quietSecond, 'c4', 'e4', 'g7', 'd7'])];
  for (const black of [false, true]) for (const [row, quiet, captures] of [
    [first(), forward, forward], [second(), quietSecond, forwardDiagonals],
  ]) {
    assert.deepEqual(destinations(row, { ...kings, d4: 'A' }, black), quiet);
    assert.deepEqual(destinations(row, { ...kings, d4: 'A', ...blockers }, black), []);
    for (const target of targets) {
      assert.equal(destinations(row, { ...kings, d4: 'A', [target]: 'p' }, black).includes(target), captures.includes(target), `${row.movement}: ${target}`);
      assert.equal(destinations(row, { ...kings, d4: 'A', [target]: 'P' }, black).includes(target), false);
    }
  }
});

test('modifier corrections remove vertical captures while preserving the literal requested quiet geometry', () => {
  for (const black of [false, true]) {
    for (const pieces of [{ ...kings, d4: 'A' }, { ...kings, d4: 'A', ...blockers },
      ...[...diagonals, ...vertical].map(target => ({ ...kings, d4: 'A', [target]: 'p' }))]) {
      assert.deepEqual(destinations(second(), pieces, black), destinations(control('literal-quiet-bishop'), pieces, black));
      assert.deepEqual(destinations(control('literal-full-vertical'), pieces, black), destinations(control('old-diagonal-vertical'), pieces, black));
    }
    assert.deepEqual(destinations(second(), { ...kings, d4: 'A' }, black), destinations(control('old-forward-queen'), { ...kings, d4: 'A' }, black));
    for (const target of ['d5', 'd6']) {
      const pieces = { ...kings, d4: 'A', [target]: 'p' };
      assert.ok(destinations(control('old-forward-queen'), pieces, black).includes(target));
      assert.ok(!destinations(second(), pieces, black).includes(target));
    }
  }
});

test('range-two movement remains clear-path at any rank and legal destinations must preserve royal safety', () => {
  for (const row of [first(), second()]) for (const black of [false, true]) {
    const s = black ? reflect : value => value;
    assert.ok(legal(row, fen({ ...kings, d2: 'A' }, black)).includes(s('d2') + s('d4')));
    assert.ok(!legal(row, fen({ ...kings, d2: 'A', d3: 'P' }, black)).includes(s('d2') + s('d4')));
    assert.ok(legal(row, fen({ ...kings, d3: 'A' }, black)).includes(s('d3') + s('d5')));
    assert.ok(!legal(row, fen({ ...kings, d3: 'A', d4: 'P' }, black)).includes(s('d3') + s('d5')));
    assert.ok(destinations(row, { d1: 'K', h7: 'k', d8: 'r', d4: 'A' }, black).every(target => target[0] === 'd'));
  }
});

test('both pawns promote normally and overlapping quiet diagonal movement retains the actual en-passant convention', () => {
  for (const row of [first(), second(), control('literal-quiet-bishop')]) for (const black of [false, true]) {
    const s = black ? reflect : value => value;
    const position = fen({ h1: 'K', h6: 'k', b7: 'A', c8: 'r' }, black), moves = legal(row, position);
    for (const target of ['b8', 'c8']) assert.deepEqual(moves.filter(move => move.startsWith(s('b7') + s(target))).map(move => move.slice(4)).sort(), ['b', 'n', 'q', 'r']);
    for (const target of ['b8', 'c8']) {
      const move = s('b7') + s(target) + 'q', board = new raw.Board(row.variant, position, false);
      try { assert.ok(board.push(move)); transitions.push({ row, position, move, finalFen: board.fen() }); }
      finally { board.delete(); }
    }
    const ep = fen({ h1: 'K', h8: 'k', c5: 'A', d5: 'p' }, black, 'd6'), move = s('c5') + s('d6');
    assert.ok(legal(row, ep).includes(move));
    const board = new raw.Board(row.variant, ep, false);
    try {
      assert.ok(board.push(move));
      assert.ok(pieceMap(board.fen()).has(s('d5')), 'quiet diagonal overlap leaves the bypassed pawn, even with e on the capture component');
      transitions.push({ row, position: ep, move, finalFen: board.fen() });
    } finally { board.delete(); }
  }
});

test('all sixty-four shared opening cases remain legal with each new pawn on c2 or c7', () => {
  const openings = require('../experiments/balance/v19-panel-openings.json').openings;
  assert.equal(openings.length, 64);
  for (const row of [first(), second()]) for (const black of [false, true]) for (const opening of openings) {
    const start = black ? 'rnbqkbnr/ppappppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
      : 'rnbqkbnr/pppppppp/8/8/8/8/PPAPPPPP/RNBQKBNR w KQkq - 0 1';
    const board = new raw.Board(row.variant, start, false);
    try {
      for (const move of opening.moves) { assert.ok(board.legalMoves().split(' ').includes(move), `${row.movement}: ${opening.id}: ${move}`); assert.ok(board.push(move)); }
      assert.equal(board.isGameOver(), false);
      legal(row, board.fen());
    } finally { board.delete(); }
  }
});

test('native and browser agree on geometry, opening positions, en-passant states and promotions', { skip: !fs.existsSync(native), timeout: 120000 }, async () => {
  for (const row of rows) {
    const engine = new UciEngine({ path: native, variantPath: path.join(directory, 'rules.ini'), variant: row.variant, options: { threads: 1, hash: 16 } });
    try {
      await engine.start();
      for (const fixture of fixtures.values()) if (fixture.row === row) {
        assert.deepEqual(await engine.perft({ fen: fixture.fen }), fixture.moves, `${row.movement}: ${fixture.fen}`);
      }
      for (const transition of transitions.filter(item => item.row === row)) {
        const finalFen = await engine._run(undefined, () => {
          let found;
          return engine._exchange([`position fen ${transition.position} moves ${transition.move}`, 'd', 'isready'], (line, done) => {
            if (line.startsWith('Fen: ')) found = line.slice(5);
            if (line === 'readyok') done(found);
          });
        });
        assert.equal(finalFen, transition.finalFen, `${row.movement}: ${transition.move}`);
      }
    } finally { await engine.close(); }
  }
});
