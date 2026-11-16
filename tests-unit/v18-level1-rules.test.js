'use strict';

// Movement, attack and value diagnostics only. No search or scored match games.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { rulesBuildOptions } = require('../scripts/rules-build');
const { UciEngine } = require('../scripts/balance/uci');
const { placementFromMap } = require('../src/profile-fen');
const { getDesign } = require('../src/design-catalog');
const { TRIALS, NEW_DEFINITIONS, revisionProbes } = require('../src/balance-designs-v18-level1');
const ROOT = path.resolve(__dirname, '..');
const native = process.env.FAIRY_STOCKFISH_PATH || path.join(ROOT, 'node_modules/.cache/levelup-native-values/stockfish');
const priors = { positional: [972, 1093], 'wazzap-knight': [984, 1105], hopping: [1480, 1302],
  'ghost-diagonal': [1716, 1636], 'ghost-diagonal-omni': [1716, 1636], 'baby-amazon': [2771, 2833] };
const profiles = TRIALS.map(row => ({ ...row, variant: `v18-l1-${row.key}` }));
const config = profiles.map(row => `[${row.variant}:chess]\ncustomPiece1 = a:${row.movement}\npieceToCharTable = -\n`
  + `castlingRookPiece = ${row.family === 'rook' ? 'ra' : 'r'}\npieceValueMg = a:${priors[row.key][0]}\npieceValueEg = a:${priors[row.key][1]}\n`).join('\n');
const variants = Object.fromEntries(profiles.map(row => [row.key, row.variant]));
const flip = square => square[0] + (9 - Number(square[1]));
const swap = piece => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase();
let raw, directory;
const fixtures = new Map();
function position(pieces, black = false, castling = '-') {
  const map = new Map(Object.entries(pieces).map(([square, piece]) => black ? [flip(square), swap(piece)] : [square, piece]));
  return `${placementFromMap(map)} ${black ? 'b' : 'w'} ${castling} - 0 1`;
}
function allMoves(variant, fen) {
  const board = new raw.Board(variant, fen, false);
  try { return board.legalMoves().split(' ').filter(Boolean).sort(); }
  finally { board.delete(); }
}
function moves(key, pieces, black = false, origin = 'd4', castling = '-') {
  const variant = variants[key], fen = position(pieces, black, castling);
  fixtures.set(`${variant}:${fen}`, { variant, fen });
  return allMoves(variant, fen).filter(move => move.startsWith(black ? flip(origin) : origin));
}
const has = (actual, from, to, black = false) => actual.includes((black ? flip(from) : from) + (black ? flip(to) : to));
test.before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v18-l1-'));
  const output = path.join(directory, 'raw.cjs');
  await build({ ...rulesBuildOptions(), absWorkingDir: ROOT,
    stdin: { contents: "import Module from 'ffish-es6'; import bytes from 'variant-wasm'; export async function createRaw(config) { const m = await Module({ wasmBinary: Uint8Array.from(atob(bytes), c => c.charCodeAt(0)) }); m.loadVariantConfig(config); return m; }", resolveDir: ROOT, loader: 'js' },
    bundle: true, platform: 'node', format: 'cjs', outfile: output, legalComments: 'none' });
  raw = await require(output).createRaw(config);
  fs.writeFileSync(path.join(directory, 'profiles.ini'), config);
});
test.after(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

test('six trial identities reuse exact historical bodies and isolate four new definitions', () => {
  assert.deepEqual(TRIALS.map(row => row.movement), ['NmR', 'NW', 'BgB', 'RmBgmR0', 'RmBgmQ0', 'QmN']);
  assert.equal(NEW_DEFINITIONS.length, 4);
  for (const row of NEW_DEFINITIONS) {
    assert.equal(getDesign(row.id), undefined); assert.equal(row.level, 1); assert.equal(row.placement, 'replace');
    assert.equal(row.roles.castlingRook, row.family === 'rook'); assert.ok(Object.isFrozen(row));
  }
  assert.equal(getDesign('knight.positional-expanded@1').movement, 'NmR');
  assert.equal(getDesign('queen.advancing-expanded@1').movement, 'QmN');
  assert.equal(getDesign('knight.blue@3').movement, 'NvW');
  assert.equal(getDesign('bishop.blue@2').movement, 'BgmB');
});

test('positional knight gains clear quiet rook paths without rook captures or jumping blockers', () => {
  for (const black of [false, true]) {
    let actual = moves('positional', { a1: 'K', h7: 'k', d4: 'A', g4: 'p', b3: 'p' }, black);
    assert.ok(has(actual, 'd4', 'f4', black)); assert.ok(!has(actual, 'd4', 'g4', black));
    assert.ok(has(actual, 'd4', 'b3', black));
    for (const occupant of ['p', 'P']) {
      actual = moves('positional', { a1: 'K', h7: 'k', d4: 'A', e4: occupant }, black);
      assert.ok(!has(actual, 'd4', 'e4', black)); assert.ok(!has(actual, 'd4', 'f4', black));
    }
  }
});

test('Wazzap knight keeps knight jumps and gains four single orthogonal moves and captures', () => {
  const adjacent = ['c4', 'e4', 'd3', 'd5'];
  for (const black of [false, true]) {
    for (const occupant of [null, 'p', 'P']) {
      const actual = moves('wazzap-knight', { a1: 'K', h7: 'k', d4: 'A',
        ...Object.fromEntries(occupant ? adjacent.map(square => [square, occupant]) : []) }, black);
      for (const target of adjacent) assert.equal(has(actual, 'd4', target, black), occupant !== 'P');
      assert.ok(has(actual, 'd4', 'b3', black));
      for (const target of ['c3', 'e5', 'd2', 'f4']) assert.ok(!has(actual, 'd4', target, black));
    }
  }
});

test('hopping bishop retains slides and captures immediately after its first diagonal hurdle', () => {
  for (const black of [false, true]) for (const hurdle of ['P', 'p']) {
    let actual = moves('hopping', { a1: 'K', h7: 'k', d4: 'A', e5: hurdle, f6: 'p', g7: 'p' }, black);
    assert.equal(has(actual, 'd4', 'e5', black), hurdle === 'p');
    assert.ok(has(actual, 'd4', 'f6', black)); assert.ok(!has(actual, 'd4', 'g7', black));
    actual = moves('hopping', { a1: 'K', h7: 'k', d4: 'A', e5: hurdle }, black);
    assert.ok(has(actual, 'd4', 'f6', black)); assert.ok(!has(actual, 'd4', 'g7', black));
    actual = moves('hopping', { a1: 'K', h7: 'k', d4: 'A', e5: hurdle, f6: 'P', g7: 'p' }, black);
    assert.ok(!has(actual, 'd4', 'f6', black)); assert.ok(!has(actual, 'd4', 'g7', black));
  }
});

test('Ghost rooks add quiet diagonals while preserving rook-only capture lines', () => {
  for (const black of [false, true]) for (const key of ['ghost-diagonal', 'ghost-diagonal-omni']) {
    let actual = moves(key, { a1: 'K', h7: 'k', d4: 'A', e5: 'p', d7: 'p' }, black);
    assert.ok(!has(actual, 'd4', 'e5', black)); assert.ok(has(actual, 'd4', 'd7', black));
    assert.ok(has(actual, 'd4', 'c3', black));
    actual = moves(key, { a1: 'K', h7: 'k', d4: 'A', e4: 'P', h4: 'p', e5: 'P', h8: 'p' }, black);
    assert.ok(has(actual, 'd4', 'g4', black)); assert.ok(!has(actual, 'd4', 'h4', black));
    assert.equal(has(actual, 'd4', 'g7', black), key === 'ghost-diagonal-omni');
    assert.ok(!has(actual, 'd4', 'h8', black));
    actual = moves(key, { a1: 'K', h7: 'k', d4: 'A', e4: 'P', f4: 'P', g4: 'p', e5: 'P', f6: 'P', g7: 'p' }, black);
    assert.ok(!has(actual, 'd4', 'g4', black)); assert.ok(!has(actual, 'd4', 'g7', black));
  }
});

test('Baby Amazon retains ordinary queen captures but knight jumps remain quiet-only', () => {
  for (const black of [false, true]) {
    let actual = moves('baby-amazon', { a1: 'K', h7: 'k', d4: 'A', g4: 'p', b3: 'p' }, black);
    assert.ok(has(actual, 'd4', 'g4', black)); assert.ok(!has(actual, 'd4', 'b3', black));
    assert.ok(has(actual, 'd4', 'e6', black));
    actual = moves('baby-amazon', { a1: 'K', h7: 'k', d4: 'A', e6: 'P', g4: 'P' }, black);
    assert.ok(!has(actual, 'd4', 'e6', black)); assert.ok(!has(actual, 'd4', 'g4', black));
  }
});

test('both Ghost rooks retain kingside and queenside castling for both royal kings', () => {
  for (const black of [false, true]) for (const key of ['ghost-diagonal', 'ghost-diagonal-omni']) {
    const actual = moves(key, { a1: 'A', e1: 'K', h1: 'A', a8: 'r', e8: 'k', h8: 'r' }, black, 'e1', 'KQkq');
    assert.ok(has(actual, 'e1', 'g1', black)); assert.ok(has(actual, 'e1', 'c1', black));
  }
});

test('checking attacks follow capture components rather than quiet-only paths and hops', () => {
  const frames = [
    ['positional', { a1: 'K', d7: 'k', d4: 'A' }, false],
    ['positional', { a1: 'K', f5: 'k', d4: 'A' }, true],
    ['wazzap-knight', { a1: 'K', e4: 'k', d4: 'A' }, true],
    ['hopping', { a1: 'K', f6: 'k', d4: 'A', e5: 'N' }, true],
    ['hopping', { a1: 'K', g7: 'k', d4: 'A', e5: 'N' }, false],
    ['ghost-diagonal', { a1: 'K', g4: 'k', d4: 'A', e4: 'P' }, false],
    ['ghost-diagonal-omni', { a1: 'K', f6: 'k', d4: 'A', e5: 'N' }, false],
    ['ghost-diagonal-omni', { a1: 'K', d7: 'k', d4: 'A' }, true],
    ['baby-amazon', { a1: 'K', f5: 'k', d4: 'A' }, false],
    ['baby-amazon', { a1: 'K', d7: 'k', d4: 'A' }, true],
  ];
  for (const black of [false, true]) for (const [key, pieces, expected] of frames) {
    const fields = position(pieces, black).split(' '); fields[1] = black ? 'w' : 'b';
    const fen = fields.join(' '), variant = variants[key];
    fixtures.set(`${variant}:${fen}`, { variant, fen });
    const board = new raw.Board(variant, fen, false);
    try { assert.equal(board.isCheck(), expected, `${key}: ${black}`); }
    finally { board.delete(); }
  }
});

test('quiet Ghost components never give diagonal or through-hurdle checks in any ray', () => {
  const sq = (x, y) => String.fromCharCode(97 + x) + (y + 1);
  const diagonal = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const orthogonal = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const black of [false, true]) for (const key of ['ghost-diagonal', 'ghost-diagonal-omni']) {
    for (const [dx, dy] of [...diagonal, ...orthogonal]) for (const hurdle of diagonal.some(([x, y]) => x === dx && y === dy) ? [false, true] : [true]) {
      const hurdleSquare = sq(3 + dx, 3 + dy);
      const pieces = { [hurdle && hurdleSquare === 'e3' ? 'e5' : 'e3']: 'K', d4: 'A',
        [sq(3 + dx * 3, 3 + dy * 3)]: 'k', ...(hurdle ? { [hurdleSquare]: 'N' } : {}) };
      const fields = position(pieces, black).split(' '); fields[1] = black ? 'w' : 'b';
      const fen = fields.join(' '), variant = variants[key];
      fixtures.set(`${variant}:${fen}`, { variant, fen });
      const board = new raw.Board(variant, fen, false);
      try { assert.equal(board.isCheck(), false, `${key}: ${dx},${dy}: hurdle=${hurdle}: black=${black}`); }
      finally { board.delete(); }
    }
  }
});

test('preflight fixtures resolve allocated symbols, both colors and rook castling rights', () => {
  const definitionsByLetter = Object.fromEntries(TRIALS.map((trial, index) => [['c', 'd', 'e', 'f', 'g', 'h'][index],
    NEW_DEFINITIONS.find(row => row.id === trial.id) || getDesign(trial.id)]));
  const probes = revisionProbes({ definitionsByLetter });
  assert.equal(probes.length, 52);
  assert.equal(probes.filter(row => row.name.includes('White')).length, 26);
  assert.equal(probes.filter(row => row.fen.includes(' KQkq ')).length, 4);
  assert.equal(revisionProbes({ definitionsByLetter: {} }).length, 0);
});

test('native and browser fixture moves agree and all six controlled tables retain family priors', { skip: !fs.existsSync(native), timeout: 120000 }, async t => {
  for (const row of profiles) {
    const engine = new UciEngine({ path: native, variantPath: path.join(directory, 'profiles.ini'), variant: row.variant, options: { threads: 1, hash: 16 } });
    t.after(() => engine.close()); await engine.start();
    const tables = await engine.pieceValues(); assert.deepEqual(tables.pieces.a, tables.pieces.A);
    for (const field of ['rawMg', 'captureMg', 'evalMg']) assert.equal(tables.pieces.a[field], priors[row.key][0]);
    for (const field of ['rawEg', 'captureEg', 'evalEg']) assert.equal(tables.pieces.a[field], priors[row.key][1]);
    for (const fixture of fixtures.values()) if (fixture.variant === row.variant) {
      assert.deepEqual(await engine.perft({ fen: fixture.fen }), allMoves(row.variant, fixture.fen), `${row.movement}: ${fixture.fen}`);
    }
    await engine.close();
  }
  t.diagnostic(`${fixtures.size} native/browser position comparisons; no scored games or searches.`);
});
