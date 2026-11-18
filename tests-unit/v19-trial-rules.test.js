'use strict';

// Exact geometry and bounded tactical diagnostics; no scored games.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { rulesBuildOptions } = require('../scripts/rules-build');
const { UciEngine } = require('../scripts/balance/uci');
const { placementFromMap, pieceMap } = require('../src/profile-fen');
const { P, TRIALS, NEW_DEFINITIONS } = require('../src/balance-designs-v19-trials');
const ROOT = path.resolve(__dirname, '..');
const native = process.env.FAIRY_STOCKFISH_PATH || path.join(ROOT, 'node_modules/.cache/levelup-native-values/stockfish');
const cases = TRIALS.map(row => ({ ...row, variant: `v19-trial-rule-${row.key}` }));
const controls = [
  { key: 'ordinary-queen', movement: 'Q', family: 'queen', variant: 'v19-trial-rule-ordinary' },
  { key: 'ignored-order', movement: 'QsfN', family: 'queen', variant: 'v19-trial-rule-ignored' },
  { key: 'rejected-mate', movement: 'QgQ0', family: 'queen', variant: 'v19-trial-rule-rejected' },
];
const config = [...cases, ...controls].map(row => `[${row.variant}:chess]\ncustomPiece1 = a:${row.movement}\npieceToCharTable = -\n${row.family === 'pawn' ? 'pawnTypes = pa\nenPassantTypes = pa\npromotionPieceTypes = nbrq\n' : ''}`).join('\n');
const reflect = square => square[0] + (9 - Number(square[1]));
const swap = letter => letter === letter.toUpperCase() ? letter.toLowerCase() : letter.toUpperCase();
const knight = ['b3', 'b5', 'c2', 'c6', 'e2', 'e6', 'f3', 'f5'];
const pawnKnight = {
  'pawn-full-knight': knight,
  'pawn-six-knight': ['b3', 'b5', 'c6', 'e6', 'f3', 'f5'],
  'pawn-forward-knight': ['b5', 'c6', 'e6', 'f5'],
};
const blockers = { c3: 'P', c4: 'P', c5: 'P', d3: 'P', d5: 'P', e3: 'P', e4: 'P', e5: 'P' };
const kings = { a8: 'K', h7: 'k' };
const fixtures = new Map();
let directory, raw;
const row = key => cases.find(candidate => candidate.key === key) || controls.find(candidate => candidate.key === key);
function fen(pieces, black = false, ep = '-', turn = 'w') {
  return `${placementFromMap(new Map(Object.entries(pieces).map(([square, letter]) => black ? [reflect(square), swap(letter)] : [square, letter])))} ${black ? turn === 'w' ? 'b' : 'w' : turn} - ${black && ep !== '-' ? reflect(ep) : ep} 0 1`;
}
const legal = board => board.legalMoves().split(' ').filter(Boolean).sort();
function allMoves(candidate, position) {
  fixtures.set(`${candidate.variant}:${position}`, { candidate, fen: position });
  const board = new raw.Board(candidate.variant, position, false);
  try { return legal(board); } finally { board.delete(); }
}
function destinations(candidate, pieces, black = false) {
  const source = black ? reflect('d4') : 'd4';
  return allMoves(candidate, fen(pieces, black)).filter(move => move.startsWith(source)).map(move => black ? reflect(move.slice(2, 4)) : move.slice(2, 4)).sort();
}

test.before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v19-trial-rules-'));
  const output = path.join(directory, 'raw.cjs');
  await build({ ...rulesBuildOptions(), absWorkingDir: ROOT,
    stdin: { contents: "import Module from 'ffish-es6'; import bytes from 'variant-wasm'; export async function createRaw(config) { const module = await Module({ wasmBinary: Uint8Array.from(atob(bytes), c => c.charCodeAt(0)) }); module.loadVariantConfig(config); return module; }", resolveDir: ROOT, loader: 'js' },
    bundle: true, platform: 'node', format: 'cjs', outfile: output, legalComments: 'none' });
  raw = await require(output).createRaw(config);
  fs.writeFileSync(path.join(directory, 'profiles.ini'), config);
});
test.after(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

test('the requested wide-forward queen uses supported modifier order and QAD jumps only two squares', () => {
  assert.equal(row('queen-wide-forward').requestedMovement, 'QsfN');
  assert.equal(row('queen-wide-forward').movement, 'QfsN');
  assert.equal(P, 'ifmnDfmWfceF');
  assert.equal(NEW_DEFINITIONS.length, 8);
  for (const black of [false, true]) {
    const pieces = { ...kings, d4: 'A' }, blocked = { ...pieces, ...blockers };
    const ordinary = destinations(row('ordinary-queen'), pieces, black);
    assert.deepEqual(destinations(row('ignored-order'), pieces, black), ordinary);
    assert.deepEqual(destinations(row('ignored-order'), blocked, black), []);
    assert.deepEqual(destinations(row('queen-wide-forward'), pieces, black), [...ordinary, 'b5', 'f5'].sort());
    assert.deepEqual(destinations(row('queen-wide-forward'), blocked, black), ['b5', 'f5']);
    assert.deepEqual(destinations(row('queen-box-jumps'), pieces, black), ordinary);
    assert.deepEqual(destinations(row('queen-box-jumps'), blocked, black), ['b2', 'b4', 'b6', 'd2', 'd6', 'f2', 'f4', 'f6']);
    for (const target of ['b5', 'f5']) assert.ok(destinations(row('queen-wide-forward'), { ...blocked, [target]: 'p' }, black).includes(target));
    for (const target of ['d6', 'f6', 'f4']) assert.ok(destinations(row('queen-box-jumps'), { ...blocked, [target]: 'p' }, black).includes(target));
  }
});

test('P retains ordinary pawn movement while the three knight patterns give eight, six and four full jumps', () => {
  for (const [key, targets] of Object.entries(pawnKnight)) for (const black of [false, true]) {
    const candidate = row(key), s = black ? reflect : value => value;
    assert.deepEqual(destinations(candidate, { ...kings, d4: 'A' }, black), [...targets, 'd5'].sort());
    assert.deepEqual(destinations(candidate, { ...kings, d4: 'A', ...blockers }, black), targets);
    for (const target of knight) {
      const expected = targets.includes(target);
      assert.equal(destinations(candidate, { ...kings, d4: 'A', [target]: 'p' }, black).includes(target), expected, `${key}: ${target}`);
      assert.equal(destinations(candidate, { ...kings, d4: 'A', [target]: 'P' }, black).includes(target), false);
    }
    for (const target of ['c5', 'e5']) assert.ok(destinations(candidate, { ...kings, d4: 'A', [target]: 'p' }, black).includes(target));
    assert.ok(!destinations(candidate, { ...kings, d4: 'A', d5: 'p' }, black).includes('d5'));
    const home = fen({ ...kings, d2: 'A' }, black), blocked = fen({ ...kings, d2: 'A', d3: 'P' }, black);
    assert.ok(allMoves(candidate, home).includes(s('d2') + s('d4')));
    assert.ok(!allMoves(candidate, blocked).includes(s('d2') + s('d4')));
    assert.ok(!allMoves(candidate, fen({ ...kings, d3: 'A' }, black)).includes(s('d3') + s('d5')));
  }
});

test('the level-two pawn ranges share quiet paths but differ on backward captures and cannot move sideways', () => {
  const expected = ['b2', 'b6', 'c3', 'c5', 'd2', 'd3', 'd5', 'd6', 'e3', 'e5', 'f2', 'f6'];
  for (const key of ['pawn-diagonal-vertical', 'pawn-forward-queen']) for (const black of [false, true]) {
    const candidate = row(key), pieces = { ...kings, d4: 'A' };
    assert.deepEqual(destinations(candidate, pieces, black), expected);
    assert.deepEqual(destinations(candidate, { ...pieces, ...blockers }, black), []);
    for (const target of [...expected, 'c4', 'e4', 'f4', 'g7', 'd7']) {
      const allowed = expected.includes(target) && (key === 'pawn-diagonal-vertical' || Number(target[1]) > 4);
      assert.equal(destinations(candidate, { ...pieces, [target]: 'p' }, black).includes(target), allowed, `${key}: ${target}`);
    }
  }
});

test('all trial pawns keep standard promotion choices and their actual en-passant convention', () => {
  for (const candidate of cases.filter(candidate => candidate.family === 'pawn')) for (const black of [false, true]) {
    const s = black ? reflect : value => value;
    const promotion = fen({ h1: 'K', h6: 'k', b7: 'A', c8: 'r' }, black), moves = allMoves(candidate, promotion);
    for (const target of ['b8', 'c8']) assert.deepEqual(moves.filter(move => move.startsWith(s('b7') + s(target))).map(move => move.slice(4)).sort(), ['b', 'n', 'q', 'r']);
    const groups = new Map();
    for (const move of moves.filter(move => move.length === 5)) { const key = move.slice(0, 4), group = groups.get(key) || []; group.push(move[4]); groups.set(key, group); }
    for (const promotionTypes of groups.values()) assert.deepEqual(promotionTypes.sort(), ['b', 'n', 'q', 'r']);
    const ep = fen({ h1: 'K', h8: 'k', c5: 'A', d5: 'p' }, black, 'd6'), move = s('c5') + s('d6');
    assert.ok(allMoves(candidate, ep).includes(move));
    const board = new raw.Board(candidate.variant, ep, false);
    try { assert.ok(board.push(move)); assert.equal(pieceMap(board.fen()).has(s('d5')), candidate.level === 2); fixtures.set(`${candidate.variant}:${board.fen()}`, { candidate, fen: board.fen() }); }
    finally { board.delete(); }
  }
});

test('QgsQ0 permits full sideways and diagonal hops while excluding vertical hops', () => {
  const candidate = row('wraith-side-rays');
  const hops = ['a1', 'a4', 'a7', 'b2', 'b4', 'b6', 'f2', 'f4', 'f6', 'g1', 'g4', 'g7', 'h4', 'h8'];
  for (const black of [false, true]) {
    const pieces = { a2: 'K', h7: 'k', d4: 'A', ...blockers };
    assert.deepEqual(destinations(candidate, pieces, black), hops);
    for (const target of [...hops, 'd6', 'd7', 'd8', 'd2', 'd1']) {
      assert.equal(destinations(candidate, { ...pieces, [target]: 'p' }, black).includes(target), hops.includes(target), target);
    }
    for (const candidate of cases) {
      const moves = destinations(candidate, { d1: 'K', h7: 'k', d8: 'r', d4: 'A' }, black);
      assert.ok(moves.every(target => target[0] === 'd'), candidate.key);
    }
  }
});

function mateWithinTwo(board) {
  function mateOne() { for (const move of legal(board)) { board.push(move); const mate = board.isCheck() && !legal(board).length; board.pop(); if (mate) return true; } return false; }
  const firsts = [];
  for (const first of legal(board)) {
    board.push(first); const replies = legal(board);
    let forced = Boolean(replies.length) || board.isCheck();
    for (const reply of replies) { board.push(reply); const mate = mateOne(); board.pop(); if (!mate) { forced = false; break; } }
    board.pop(); if (forced) firsts.push(first);
  }
  return firsts;
}
test('QgsQ0 avoids the exact opening mate-in-two of the rejected full-ray queen in both colors', () => {
  const startPieces = pieceMap('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBAKBNR w KQkq - 0 1');
  for (const black of [false, true]) for (const candidate of [row('wraith-side-rays'), row('rejected-mate')]) {
    const s = black ? reflect : value => value, start = fen(Object.fromEntries(startPieces), black);
    const board = new raw.Board(candidate.variant, start, false);
    try {
      assert.deepEqual(mateWithinTwo(board), candidate.key === 'rejected-mate' ? [s('d1') + s('h5')] : []);
      for (const [from, to] of [['d1', 'h5'], ['g7', 'g6'], ['h5', 'e5']]) { allMoves(candidate, board.fen()); assert.ok(board.push(s(from) + s(to))); }
      assert.equal(board.isCheck() && legal(board).length === 0, candidate.key === 'rejected-mate');
      if (candidate.key !== 'rejected-mate') assert.equal(board.isCheck(), false);
      allMoves(candidate, board.fen());
    } finally { board.delete(); }
  }
});

test('native and browser rules agree for all geometry, promotion, royal-safety and opening fixtures', { skip: !fs.existsSync(native), timeout: 120000 }, async () => {
  for (const candidate of [...cases, ...controls]) {
    const engine = new UciEngine({ path: native, variantPath: path.join(directory, 'profiles.ini'), variant: candidate.variant, options: { threads: 1, hash: 16 } });
    try {
      await engine.start();
      for (const fixture of fixtures.values()) if (fixture.candidate.variant === candidate.variant) {
        assert.deepEqual(await engine.perft({ fen: fixture.fen }), allMoves(candidate, fixture.fen), `${candidate.key}: ${fixture.fen}`);
      }
      if (candidate.family === 'pawn') for (const black of [false, true]) {
        const s = black ? reflect : value => value, position = fen({ h1: 'K', h8: 'k', c5: 'A', d5: 'p' }, black, 'd6');
        const result = await engine._run(undefined, () => {
          let found;
          return engine._exchange([`position fen ${position} moves ${s('c5') + s('d6')}`, 'd', 'isready'], (line, done) => {
            if (line.startsWith('Fen: ')) found = line.slice(5);
            if (line === 'readyok') done(found);
          });
        });
        assert.ok(result, 'Native post-move FEN is available.');
        assert.equal(pieceMap(result).has(s('d5')), candidate.level === 2, candidate.id);
      }
    } finally { await engine.close(); }
  }
});
