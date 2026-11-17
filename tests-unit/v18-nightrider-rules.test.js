'use strict';

// Engine movement and value diagnostics only: no scored games or catalog edits.
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
const promoted = new Map(require('../src/designs-v19-selected').NEW_DEFINITIONS.map(definition => [definition.id, definition]));
const { NEW_DEFINITIONS, TRIALS, revisionProbes } = require('../src/balance-designs-v18-nightrider');

const ROOT = path.resolve(__dirname, '..');
const native = process.env.FAIRY_STOCKFISH_PATH || path.join(ROOT, 'node_modules/.cache/levelup-native-values/stockfish');
const ORIGINAL = 'v18-nightrider-original';
const profiles = [{ key: 'original', movement: 'N0', variant: ORIGINAL },
  ...TRIALS.map(trial => ({ ...trial, variant: `v18-${trial.key}` }))];
const config = profiles.map(row => `[${row.variant}:chess]\ncustomPiece1 = a:${row.movement}\npieceToCharTable = -\n`).join('\n')
  + `[v18-nightrider-controlled:chess]\ncustomPiece1 = a:N0mK\npieceValueMg = a:2326\npieceValueEg = a:2211\npieceToCharTable = -\n`;
const diagonal = ['c3', 'e3', 'c5', 'e5'];
const orthogonal = ['c4', 'e4', 'd3', 'd5'];
const adjacent = [...diagonal, ...orthogonal];
const flip = square => square[0] + (9 - Number(square[1]));
const swap = piece => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase();
let directory, raw;
const fixtures = new Map();
function position(pieces, black) {
  const map = new Map(Object.entries(pieces).map(([square, piece]) => black ? [flip(square), swap(piece)] : [square, piece]));
  return `${placementFromMap(map)} ${black ? 'b' : 'w'} - - 0 1`;
}
function moves(variant, pieces, black = false, origin = 'd4') {
  const fen = typeof pieces === 'string' ? pieces : position(pieces, black);
  fixtures.set(`${variant}:${fen}`, { variant, fen });
  const board = new raw.Board(variant, fen, false);
  try { return board.legalMoves().split(' ').filter(move => move.startsWith(black ? flip(origin) : origin)).sort(); }
  finally { board.delete(); }
}
function allMoves(variant, fen) {
  const board = new raw.Board(variant, fen, false);
  try { return board.legalMoves().split(' ').filter(Boolean).sort(); }
  finally { board.delete(); }
}
const targets = row => row.movement.endsWith('F') ? diagonal : row.movement.endsWith('W') ? orthogonal : adjacent;

test.before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v18-nightrider-'));
  const output = path.join(directory, 'raw.cjs');
  await build({ ...rulesBuildOptions(), absWorkingDir: ROOT,
    stdin: { contents: "import Module from 'ffish-es6'; import bytes from 'variant-wasm'; export async function createRaw(config) { const m = await Module({ wasmBinary: Uint8Array.from(atob(bytes), c => c.charCodeAt(0)) }); m.loadVariantConfig(config); return m; }", resolveDir: ROOT, loader: 'js' },
    bundle: true, platform: 'node', format: 'cjs', outfile: output, legalComments: 'none' });
  raw = await require(output).createRaw(config);
  fs.writeFileSync(path.join(directory, 'profiles.ini'), config);
});
test.after(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

test('research definitions are immutable, nonroyal replacements and leave N0 unchanged', () => {
  assert.equal(getDesign('knight.purple@4').movement, 'N0');
  assert.deepEqual(NEW_DEFINITIONS.map(row => row.movement), ['N0mF', 'N0mW', 'N0mK']);
  for (const definition of NEW_DEFINITIONS) {
    assert.deepEqual(getDesign(definition.id), promoted.get(definition.id));
    assert.equal(definition.level, 3);
    assert.equal(definition.placement, 'replace');
    assert.deepEqual(definition.roles, { pawn: false, castlingRook: false, enPassant: false });
    assert.ok(Object.isFrozen(definition)); assert.ok(Object.isFrozen(definition.roles));
  }
});

test('the added quiet component has exactly the stated adjacent empty targets for both colors', () => {
  const pieces = { a1: 'K', h8: 'k', d4: 'A' };
  for (const black of [false, true]) for (const row of profiles.slice(1)) {
    const s = black ? flip : square => square;
    const original = moves(ORIGINAL, pieces, black), actual = moves(row.variant, pieces, black);
    assert.deepEqual(actual, [...original, ...targets(row).map(target => s('d4') + s(target))].sort(), `${row.movement}: ${black}`);
    for (const beyond of ['d2', 'd6', 'b4', 'f4', 'b2', 'f6']) assert.ok(!actual.includes(s('d4') + s(beyond)));
  }
});

test('quiet steps cannot capture enemies or land on allies while original rider captures remain', () => {
  for (const black of [false, true]) for (const row of profiles.slice(1)) for (const occupant of ['p', 'P']) {
    const pieces = { a1: 'K', h8: 'k', d4: 'A', ...Object.fromEntries(adjacent.map(square => [square, occupant])), b3: 'p', f5: 'p' };
    const s = black ? flip : square => square;
    const original = moves(ORIGINAL, pieces, black), actual = moves(row.variant, pieces, black);
    assert.deepEqual(actual, original, `${row.movement}: ${occupant}: ${black}`);
    assert.ok(actual.includes(s('d4') + s('b3'))); assert.ok(actual.includes(s('d4') + s('f5')));
    for (const target of adjacent) assert.ok(!actual.includes(s('d4') + s(target)));
  }
});

test('repeated knight paths retain their landing-square blockers and capture stops', () => {
  for (const black of [false, true]) for (const row of profiles) {
    const s = black ? flip : square => square;
    const open = moves(row.variant, { a1: 'K', h8: 'k', d4: 'A', f8: 'p' }, black);
    assert.ok(open.includes(s('d4') + s('e6'))); assert.ok(open.includes(s('d4') + s('f8')));
    for (const occupant of ['P', 'p']) {
      const blocked = moves(row.variant, { a1: 'K', h8: 'k', d4: 'A', e6: occupant, f8: 'p' }, black);
      assert.equal(blocked.includes(s('d4') + s('e6')), occupant === 'p');
      assert.ok(!blocked.includes(s('d4') + s('f8')));
    }
  }
});

test('one-square quiet king movement does not make the Nightrider royal', () => {
  for (const black of [false, true]) {
    const s = black ? flip : square => square;
    const actual = moves('v18-nightrider-quiet-king', { a1: 'K', h8: 'k', d4: 'A', c8: 'r' }, black);
    assert.ok(actual.includes(s('d4') + s('c3')), 'nonroyal piece may enter an attacked square');
  }
});

test('campaign proof fixtures use allocated letters and both physical colors', () => {
  const definitionsByLetter = Object.fromEntries(NEW_DEFINITIONS.map((row, index) => [['s', 't', 'u'][index], row]));
  const probes = revisionProbes({ definitionsByLetter });
  assert.equal(probes.length, 30);
  assert.equal(new Set(probes.map(row => row.name)).size, 30);
  assert.equal(probes.filter(row => row.name.includes('White')).length, 15);
  assert.equal(revisionProbes({ definitionsByLetter: {} }).length, 0);
  assert.ok(probes.every(row => !row.fen.includes('A')));
});

test('native moves match the browser fixtures and controlled values cover all six tables', { skip: !fs.existsSync(native), timeout: 120000 }, async t => {
  const inventory = {};
  for (const row of [...profiles, { variant: 'v18-nightrider-controlled' }]) {
    const engine = new UciEngine({ path: native, variantPath: path.join(directory, 'profiles.ini'), variant: row.variant, options: { threads: 1, hash: 16 } });
    t.after(() => engine.close()); await engine.start();
    const tables = await engine.pieceValues();
    assert.deepEqual(tables.pieces.a, tables.pieces.A);
    inventory[row.variant] = tables.pieces.a;
    for (const fixture of fixtures.values()) if (fixture.variant === row.variant) {
      assert.deepEqual(await engine.perft({ fen: fixture.fen }), allMoves(row.variant, fixture.fen), `${row.variant}: ${fixture.fen}`);
    }
    await engine.close();
  }
  const original = inventory[ORIGINAL];
  assert.equal(original.rawMg, 2326); assert.equal(original.rawEg, 2211);
  const controlled = inventory['v18-nightrider-controlled'];
  for (const field of ['rawMg', 'captureMg', 'evalMg']) assert.equal(controlled[field], 2326);
  for (const field of ['rawEg', 'captureEg', 'evalEg']) assert.equal(controlled[field], 2211);
  for (const row of profiles.slice(1)) t.diagnostic(`${row.movement} automatic MG/EG: ${inventory[row.variant].rawMg}/${inventory[row.variant].rawEg}; campaign holds 2326/2211.`);
  t.diagnostic(`${fixtures.size} native/browser legal-move fixtures; no scored games or searches.`);
});
