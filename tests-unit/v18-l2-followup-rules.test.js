'use strict';

// Standalone movement/value fixtures. No engine searches or scientific games.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { rulesBuildOptions } = require('../scripts/rules-build');
const { UciEngine } = require('../scripts/balance/uci');
const { placementFromMap, pieceMap } = require('../src/profile-fen');
const { getDesign } = require('../src/design-catalog');
const { TRIALS, NEW_DEFINITIONS, revisionProbes } = require('../src/balance-designs-v18-l2-followup');
const ROOT = path.resolve(__dirname, '..');
const native = process.env.FAIRY_STOCKFISH_PATH || path.join(ROOT, 'node_modules/.cache/levelup-native-values/stockfish');
const profiles = TRIALS.map(row => ({ ...row, variant: `v18-l2-followup-${row.key}` }));
const configBody = row => `customPiece1 = a:${row.movement}\npieceToCharTable = -\n`
  + 'castlingRookPiece = r\ndoubleStepRegionWhite = *1 *2\ndoubleStepRegionBlack = *7 *8\n'
  + (row.family === 'pawn' ? 'pawnTypes = pa\nenPassantTypes = pa\npromotionPieceTypes = nbrq\n' : '');
const config = profiles.map(row => `[${row.variant}:chess]\n${configBody(row)}`
  + `pieceValueMg = a:${row.family === 'pawn' ? 536 : 1203}\npieceValueEg = a:${row.family === 'pawn' ? 592 : 1352}\n`
  + `\n[${row.variant}-auto:chess]\n${configBody(row)}`).join('\n');
const variants = Object.fromEntries(profiles.map(row => [row.key, row.variant]));
const flip = square => square[0] + (9 - Number(square[1]));
const swap = piece => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase();
const square = (x, y) => String.fromCharCode(97 + x) + (y + 1);
const KNIGHTS = TRIALS.filter(row => row.family === 'knight');
const PAWNS = TRIALS.filter(row => row.family === 'pawn');
const fixtures = new Map();
let raw, directory;
function position(pieces, black = false, ep = '-') {
  const map = new Map(Object.entries(pieces).map(([s, piece]) => black ? [flip(s), swap(piece)] : [s, piece]));
  return `${placementFromMap(map)} ${black ? 'b' : 'w'} - ${ep === '-' ? '-' : black ? flip(ep) : ep} 0 1`;
}
function board(key, pieces, black = false, ep = '-', turn) {
  const fields = position(pieces, black, ep).split(' ');
  if (turn) fields[1] = turn;
  const variant = variants[key], fen = fields.join(' ');
  fixtures.set(`${variant}:${fen}`, { variant, fen });
  return new raw.Board(variant, fen, false);
}
const moves = b => b.legalMoves().split(' ').filter(Boolean).sort();
function available(key, pieces, black = false, origin = 'd4') {
  const b = board(key, pieces, black);
  try { return moves(b).filter(move => move.startsWith(black ? flip(origin) : origin)); }
  finally { b.delete(); }
}
const has = (actual, from, to, black = false) => actual.includes((black ? flip(from) : from) + (black ? flip(to) : to));
const leaps = {
  N: [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]],
  W: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  D: [[2, 0], [-2, 0], [0, 2], [0, -2]],
  H: [[3, 0], [-3, 0], [0, 3], [0, -3]],
  F: [[1, 1], [-1, 1], [1, -1], [-1, -1]],
  A: [[2, 2], [-2, 2], [2, -2], [-2, -2]],
};
test.before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v18-l2-followup-'));
  const output = path.join(directory, 'raw.cjs');
  await build({ ...rulesBuildOptions(), absWorkingDir: ROOT,
    stdin: { contents: "import Module from 'ffish-es6'; import bytes from 'variant-wasm'; export async function createRaw(config) { const m = await Module({ wasmBinary: Uint8Array.from(atob(bytes), c => c.charCodeAt(0)) }); m.loadVariantConfig(config); return m; }", resolveDir: ROOT, loader: 'js' },
    bundle: true, platform: 'node', format: 'cjs', outfile: output, legalComments: 'none' });
  raw = await require(output).createRaw(config);
  fs.writeFileSync(path.join(directory, 'profiles.ini'), config);
});
test.after(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

test('six immutable two-point replacements do not register or reprice live designs', () => {
  assert.deepEqual(TRIALS.map(row => row.movement), ['NWD', 'NWH', 'NFA', 'NAD', 'fmWifmnDfceF2bF2', 'fmWifmnDfceFfceAbFbA']);
  assert.equal(NEW_DEFINITIONS.length, 6);
  for (const row of NEW_DEFINITIONS) {
    assert.equal(getDesign(row.id), undefined); assert.equal(row.level, 2); assert.equal(row.placement, 'replace');
    assert.equal(row.roles.pawn, row.family === 'pawn'); assert.equal(row.roles.enPassant, row.family === 'pawn');
    assert.equal(row.roles.castlingRook, false); assert.ok(Object.isFrozen(row));
  }
  assert.equal(getDesign('pawn.bishop-step-current@1').movement, 'fmWfeFifmnD');
  assert.equal(getDesign('king.reserve-bishop@1').movement, 'F');
});

test('all four knight compounds exactly move/capture on sixteen declared leap destinations', () => {
  for (const row of KNIGHTS) for (const black of [false, true]) {
    const targets = [...row.movement].flatMap(component => leaps[component]).map(([dx, dy]) => square(3 + dx, 3 + dy));
    assert.equal(new Set(targets).size, 16);
    for (const occupant of [null, 'p', 'P']) {
      const actual = available(row.key, { a8: 'K', h8: 'k', d4: 'A',
        ...(occupant ? Object.fromEntries(targets.map(target => [target, occupant])) : {}) }, black);
      const expected = occupant === 'P' ? [] : targets.map(target => (black ? flip('d4') : 'd4') + (black ? flip(target) : target)).sort();
      assert.deepEqual(actual, expected, `${row.movement}: ${black}: ${occupant}`);
    }
  }
});

test('D/H/A components jump intermediate friendly pieces while respecting their landing squares', () => {
  for (const black of [false, true]) for (const [key, blockers, target] of [
    ['knight-nwd', { e4: 'P' }, 'f4'], ['knight-nwh', { e4: 'P', f4: 'P' }, 'g4'],
    ['knight-nfa', { e5: 'P' }, 'f6'], ['knight-nad', { e5: 'P' }, 'f6'],
  ]) {
    const base = { a1: 'K', h8: 'k', d4: 'A', ...blockers };
    assert.ok(has(available(key, base, black), 'd4', target, black));
    assert.ok(has(available(key, { ...base, [target]: 'p' }, black), 'd4', target, black));
    assert.ok(!has(available(key, { ...base, [target]: 'P' }, black), 'd4', target, black));
  }
});

test('both bishop pawns keep forward-only quiet advances and capture-only forward diagonals', () => {
  for (const row of PAWNS) for (const black of [false, true]) {
    const base = { a1: 'K', h8: 'k', d4: 'A' };
    let actual = available(row.key, base, black);
    assert.ok(has(actual, 'd4', 'd5', black)); assert.ok(!has(actual, 'd4', 'd6', black));
    for (const target of ['c5', 'e5', 'b6', 'f6', 'c4', 'e4', 'd3']) assert.ok(!has(actual, 'd4', target, black), `${row.movement}: unexpected quiet ${target}, black=${black}: ${JSON.stringify(actual)}`);
    for (const target of ['c3', 'e3', 'b2', 'f2']) assert.ok(has(actual, 'd4', target, black));
    for (const target of ['c5', 'e5', 'b6', 'f6', 'c3', 'e3', 'b2', 'f2']) {
      actual = available(row.key, { ...base, [target]: 'p' }, black);
      assert.ok(has(actual, 'd4', target, black), `${row.movement} captures ${target}`);
      assert.ok(!has(available(row.key, { ...base, [target]: 'P' }, black), 'd4', target, black));
    }
    assert.ok(!has(available(row.key, { ...base, d5: 'p' }, black), 'd4', 'd5', black));
  }
});

test('clear diagonal range respects its intermediate square while the A pawn jumps it', () => {
  for (const black of [false, true]) for (const [blocker, target] of [['e5', 'f6'], ['e3', 'f2']]) {
    const pieces = { a1: 'K', h8: 'k', d4: 'A', [blocker]: 'P', [target]: 'p' };
    assert.ok(!has(available('bishop-pawn-range', pieces, black), 'd4', target, black));
    assert.ok(has(available('bishop-pawn-jump', pieces, black), 'd4', target, black));
  }
});

test('home double advances remain clear and disappear away from home ranks', () => {
  for (const row of PAWNS) for (const black of [false, true]) {
    const base = { a1: 'K', h8: 'k', c2: 'A' };
    assert.ok(has(available(row.key, base, black, 'c2'), 'c2', 'c4', black));
    assert.ok(!has(available(row.key, { ...base, c3: 'P' }, black, 'c2'), 'c2', 'c4', black));
    assert.ok(!has(available(row.key, { a1: 'K', h8: 'k', c3: 'A' }, black, 'c3'), 'c3', 'c5', black));
  }
});

test('actual en-passant captures remove the bypassed pawn for both colors', () => {
  for (const row of PAWNS) for (const black of [false, true]) {
    const s = black ? flip : value => value;
    const b = board(row.key, { a1: 'K', h8: 'k', e5: 'A', d5: 'p' }, black, 'd6');
    try {
      const move = s('e5') + s('d6');
      assert.ok(moves(b).includes(move)); assert.equal(b.isCapture(move), true); assert.ok(b.push(move));
      const pieces = pieceMap(b.fen());
      assert.ok(!pieces.has(s('e5'))); assert.ok(!pieces.has(s('d5')));
      assert.equal(pieces.get(s('d6')), black ? 'a' : 'A');
    } finally { b.delete(); }
  }
});

test('both pawn bodies use mandatory ordinary QRBN promotions on quiet and capture landings', () => {
  for (const row of PAWNS) for (const black of [false, true]) {
    const s = black ? flip : value => value;
    const b = board(row.key, { a1: 'K', h6: 'k', c7: 'A', d8: 'r' }, black);
    try {
      for (const target of ['c8', 'd8']) assert.deepEqual(moves(b).filter(move => move.startsWith(s('c7') + s(target))).map(move => move.slice(4)), ['b', 'n', 'q', 'r']);
    } finally { b.delete(); }
    const leap = board(row.key, { a1: 'K', h8: 'k', c6: 'A', d7: 'P', e8: 'r' }, black);
    try {
      assert.deepEqual(moves(leap).filter(move => move.startsWith(s('c6') + s('e8'))).map(move => move.slice(4)), row.key === 'bishop-pawn-jump' ? ['b', 'n', 'q', 'r'] : []);
    } finally { leap.delete(); }
  }
});

test('check attacks follow forward capture directions, backward diagonals and blocker geometry', () => {
  for (const row of PAWNS) for (const black of [false, true]) for (const [target, blocker, expected] of [
    ['d5', null, false], ['c3', null, true], ['f6', null, true],
    ['f6', 'e5', row.key === 'bishop-pawn-jump'], ['f2', 'e3', row.key === 'bishop-pawn-jump'],
  ]) {
    const b = board(row.key, { a1: 'K', d4: 'A', [target]: 'k', ...(blocker ? { [blocker]: 'N' } : {}) }, black, '-', black ? 'w' : 'b');
    try { assert.equal(b.isCheck(), expected, `${row.key}: ${target}: ${blocker}: ${black}`); }
    finally { b.delete(); }
  }
  for (const row of PAWNS) for (const black of [false, true]) {
    const actual = available(row.key, { e1: 'K', h8: 'k', e2: 'A', e8: 'r', d3: 'p' }, black, 'e2');
    assert.ok(!has(actual, 'e2', 'd3', black)); assert.ok(has(actual, 'e2', 'e3', black));
  }
});

test('campaign probes resolve actual allocated letters and mirrored EP/promotion frames', () => {
  const definitionsByLetter = Object.fromEntries(NEW_DEFINITIONS.map((definition, index) => [['c', 'd', 'e', 'f', 'g', 'h'][index], definition]));
  const probes = revisionProbes({ definitionsByLetter });
  assert.equal(probes.length, 56); assert.equal(probes.filter(row => row.name.includes('White')).length, 28);
  assert.equal(probes.filter(row => / - d[36] /.test(row.fen)).length, 4);
  assert.equal(revisionProbes({ definitionsByLetter: {} }).length, 0);
});

test('native and browser agree on every fixture and all six controlled value tables', { skip: !fs.existsSync(native), timeout: 120000 }, async t => {
  const automatic = [];
  for (const row of profiles) {
    const engine = new UciEngine({ path: native, variantPath: path.join(directory, 'profiles.ini'), variant: row.variant, options: { threads: 1, hash: 16 } });
    t.after(() => engine.close()); await engine.start();
    const tables = await engine.pieceValues(); assert.deepEqual(tables.pieces.a, tables.pieces.A);
    for (const field of ['rawMg', 'captureMg', 'evalMg']) assert.equal(tables.pieces.a[field], row.family === 'pawn' ? 536 : 1203);
    for (const field of ['rawEg', 'captureEg', 'evalEg']) assert.equal(tables.pieces.a[field], row.family === 'pawn' ? 592 : 1352);
    for (const fixture of fixtures.values()) if (fixture.variant === row.variant) {
      const b = new raw.Board(row.variant, fixture.fen, false);
      try { assert.deepEqual(await engine.perft({ fen: fixture.fen }), moves(b), `${row.movement}: ${fixture.fen}`); }
      finally { b.delete(); }
    }
    await engine.close();
    const auto = new UciEngine({ path: native, variantPath: path.join(directory, 'profiles.ini'), variant: row.variant + '-auto', options: { threads: 1, hash: 16 } });
    t.after(() => auto.close()); await auto.start();
    const measured = await auto.pieceValues(); automatic.push({ movement: row.movement, mg: measured.pieces.a.rawMg, eg: measured.pieces.a.rawEg });
    await auto.close();
  }
  t.diagnostic(`${fixtures.size} native/browser positions, no searches or scored games. Automatic diagnostics: ${JSON.stringify(automatic)}`);
});
