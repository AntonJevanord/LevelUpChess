'use strict';

// Unsupported-hopper regression fixtures and possible alternative movements.
// No changes to the catalog, scientific bundles, search or scored games.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { rulesBuildOptions } = require('../scripts/rules-build');
const { UciEngine } = require('../scripts/balance/uci');
const { getDesign } = require('../src/design-catalog');
const { placementFromMap } = require('../src/profile-fen');

const ROOT = path.resolve(__dirname, '..');
const INI = path.join(ROOT, 'prototypes/nightrider-hop/variants.ini');
const config = fs.readFileSync(INI, 'utf8');
const nativePath = process.env.FAIRY_STOCKFISH_PATH || path.join(ROOT, 'node_modules/.cache/levelup-native-values/stockfish');
const ORIGINAL = 'nightrider-original', REQUESTED = 'nightrider-hop-requested', COMPONENT = 'nightrider-hop-component';
const FIXED = 'nightrider-hop-fixed-values';
const candidates = [
  { variant: 'nightrider-diagonal-capture', movement: 'N0cF', targets: ['c3', 'e3', 'c5', 'e5'] },
  { variant: 'nightrider-orthogonal-capture', movement: 'N0cW', targets: ['c4', 'e4', 'd3', 'd5'] },
  { variant: 'nightrider-camel-capture', movement: 'N0cC', targets: ['a3', 'a5', 'c1', 'c7', 'e1', 'e7', 'g3', 'g5'] },
];
const reflect = square => square[0] + (9 - Number(square[1]));
const swap = piece => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase();
let directory, raw, activeBoard, activeVariant;

function fen(pieces, black = false) {
  const map = new Map(Object.entries(pieces).map(([square, piece]) => black ? [reflect(square), swap(piece)] : [square, piece]));
  return `${placementFromMap(map)} ${black ? 'b' : 'w'} - - 0 1`;
}
function moves(variant, position) {
  if (activeVariant !== variant) {
    activeBoard?.delete(); activeBoard = new raw.Board(variant, position, false); activeVariant = variant;
  } else activeBoard.setFen(position);
  return activeBoard.legalMoves().split(' ').filter(Boolean).sort();
}
function from(variant, pieces, black = false, origin = 'd4') {
  const square = black ? reflect(origin) : origin;
  return moves(variant, fen(pieces, black)).filter(move => move.startsWith(square));
}
function ray(a, b) {
  const dx = Math.abs(a.charCodeAt(0) - b.charCodeAt(0)), dy = Math.abs(Number(a[1]) - Number(b[1]));
  return dx && dy && (dx === 2 * dy || dy === 2 * dx);
}
const allSquares = Array.from({ length: 64 }, (_, i) => 'abcdefgh'[i % 8] + (1 + Math.floor(i / 8)));
const fixtures = [];
for (const origin of allSquares) {
  // Keep the opponent king away from the nightrider ray in the open position.
  const enemy = ['a8', 'h8', 'a1', 'h1'].find(square => square !== origin && !ray(origin, square));
  const own = ['h1', 'a1', 'h8', 'a8'].find(square => square !== origin && square !== enemy
    && Math.max(Math.abs(square.charCodeAt(0) - enemy.charCodeAt(0)), Math.abs(Number(square[1]) - Number(enemy[1]))) > 1);
  const base = { [own]: 'K', [enemy]: 'k', [origin]: 'A' };
  for (const black of [false, true]) {
    fixtures.push({ fen: fen(base, black), origin: black ? reflect(origin) : origin, baseOrigin: origin, name: `${origin}: empty: ${black}` });
    for (const square of allSquares.filter(square => !Object.hasOwn(base, square))) for (const blocker of ['P', 'p']) {
      fixtures.push({ fen: fen({ ...base, [square]: blocker }, black), origin: black ? reflect(origin) : origin,
        baseOrigin: origin, name: `${origin}: ${blocker}@${square}: ${black}` });
    }
  }
}
const extraFixtures = [];

test.before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-nightrider-hop-'));
  const output = path.join(directory, 'raw.cjs');
  await build({ ...rulesBuildOptions(), absWorkingDir: ROOT,
    stdin: { contents: "import Module from 'ffish-es6'; import bytes from 'variant-wasm'; export async function createRaw(config) { const m = await Module({ wasmBinary: Uint8Array.from(atob(bytes), c => c.charCodeAt(0)) }); m.loadVariantConfig(config); return m; }", resolveDir: ROOT, loader: 'js' },
    bundle: true, platform: 'node', format: 'cjs', outfile: output, legalComments: 'none' });
  raw = await require(output).createRaw(config);
});
test.after(() => { activeBoard?.delete(); if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

test('the accepted N0 catalog definition stays unchanged and diagnostic profiles remain separate', () => {
  assert.equal(getDesign('knight.purple@4').movement, 'N0');
  for (const [variant, movement] of [[ORIGINAL, 'N0'], [REQUESTED, 'N0gN0'], [COMPONENT, 'gN0'], [FIXED, 'N0gN0'], ...candidates.map(row => [row.variant, row.movement])]) {
    assert.ok(config.includes(`[${variant}:chess]\ncustomPiece1 = a:${movement}\n`));
  }
});

test('gN0 adds no runtime moves across all64 origins, both colors and every single friendly/enemy hurdle', t => {
  // Group variants to avoid rebuilding attack tables on every interleaved
  // comparison. This is the same complete matrix with two variant switches.
  const original = fixtures.map(fixture => moves(ORIGINAL, fixture.fen));
  fixtures.forEach((fixture, index) => assert.deepEqual(moves(REQUESTED, fixture.fen), original[index], fixture.name));
  for (const fixture of fixtures) assert.deepEqual(moves(COMPONENT, fixture.fen).filter(move => move.startsWith(fixture.origin)), [], fixture.name);
  t.diagnostic(`${fixtures.length} blocker fixtures; parsed gN0 has no runtime move component in this build.`);
});

test('one and two hurdles on a repeated-knight ray do not activate the requested hopper', () => {
  const base = { a1: 'K', h8: 'k', b1: 'A' };
  for (const black of [false, true]) for (const hurdle of ['P', 'p']) for (const after of [{}, { e7: 'p' }, { d5: 'p' }, { d5: 'P', e7: 'p' }]) {
    const pieces = { ...base, c3: hurdle, ...after }, s = black ? reflect : square => square;
    const original = from(ORIGINAL, pieces, black, 'b1');
    assert.ok(!original.includes(s('b1') + s('d5')));
    assert.ok(!original.includes(s('b1') + s('e7')));
    assert.deepEqual(from(REQUESTED, pieces, black, 'b1'), original);
    assert.deepEqual(from(COMPONENT, pieces, black, 'b1'), []);
    extraFixtures.push({ fen: fen(pieces, black), name: `repeated ray: ${hurdle}: ${black}: ${JSON.stringify(after)}` });
  }
});

test('the missing hopper neither gives a checking attack nor adds an evasion through a hurdle', () => {
  // A hypothetical b1→c3(hurdle)→d5 king attack must not be claimed by gN0.
  for (const black of [false, true]) {
    const pieces = { a1: 'K', d5: 'k', b1: 'A', c3: 'P' };
    for (const variant of [ORIGINAL, REQUESTED, COMPONENT]) {
      const position = fen(pieces, black), fields = position.split(' '); fields[1] = black ? 'w' : 'b';
      const board = new raw.Board(variant, fields.join(' '), false);
      try { assert.equal(board.isCheck(), false); }
      finally { board.delete(); }
      extraFixtures.push({ fen: fields.join(' '), name: `no phantom hopper check: ${black}` });
    }
    const pinned = { e1: 'K', h8: 'k', e3: 'A', e8: 'r', f5: 'P' };
    assert.deepEqual(from(REQUESTED, pinned, black, 'e3'), from(ORIGINAL, pinned, black, 'e3'));
    extraFixtures.push({ fen: fen(pinned, black), name: `royal pin unchanged: ${black}` });
  }
});

test('supported alternative capture components add their exact targets without new quiet moves', () => {
  const base = { h1: 'K', a8: 'k', d4: 'A' };
  for (const candidate of candidates) for (const black of [false, true]) {
    const s = black ? reflect : square => square;
    assert.deepEqual(from(candidate.variant, base, black), from(ORIGINAL, base, black));
    for (const target of candidate.targets) for (const occupant of ['P', 'p']) {
      const pieces = { ...base, [target]: occupant }, actual = from(candidate.variant, pieces, black);
      assert.equal(actual.includes(s('d4') + s(target)), occupant === 'p', `${candidate.movement}: ${target}: ${black}`);
      assert.deepEqual(actual.filter(move => move !== s('d4') + s(target)), from(ORIGINAL, pieces, black));
      extraFixtures.push({ fen: fen(pieces, black), name: `${candidate.movement}: ${occupant}@${target}: ${black}` });
    }
  }
});

test('native diagnostic confirms the requested value inflation and exact supported capture behavior', { skip: !fs.existsSync(nativePath), timeout: 600000 }, async t => {
  const inventory = {};
  const selected = process.env.NIGHTRIDER_FULL_NATIVE === '1' ? fixtures : fixtures.filter(row => ['b1', 'd4'].includes(row.baseOrigin));
  for (const variant of [ORIGINAL, REQUESTED, COMPONENT, FIXED, ...candidates.map(row => row.variant)]) {
    const engine = new UciEngine({ path: nativePath, variantPath: INI, variant, options: { threads: 1, hash: 16 } });
    t.after(() => engine.close()); await engine.start();
    const tables = await engine.pieceValues();
    assert.deepEqual(tables.pieces.a, tables.pieces.A, `${variant}: both colors must share the diagnostic tables`);
    inventory[variant] = tables.pieces.a;
    const parity = [ORIGINAL, REQUESTED, COMPONENT].includes(variant) ? [...selected, ...extraFixtures] : extraFixtures;
    for (const fixture of parity) assert.deepEqual(await engine.perft({ fen: fixture.fen }), moves(variant, fixture.fen), `${variant}: ${fixture.name}`);
    await engine.close();
  }
  assert.equal(inventory[ORIGINAL].rawMg, 2326); assert.equal(inventory[ORIGINAL].rawEg, 2211);
  assert.equal(inventory[REQUESTED].rawMg, 4776); assert.equal(inventory[REQUESTED].rawEg, 3979);
  for (const field of ['rawMg', 'captureMg', 'evalMg']) assert.equal(inventory[FIXED][field], 2326);
  for (const field of ['rawEg', 'captureEg', 'evalEg']) assert.equal(inventory[FIXED][field], 2211);
  for (const [variant, values] of Object.entries(inventory)) t.diagnostic(`${variant}: automatic/applied six-table inventory ${JSON.stringify(values)}`);
  t.diagnostic(`Native/browser parity: ${selected.length} blocker fixtures for each of three requested-body variants, plus ${extraFixtures.length} targeted fixtures across seven profiles. No searches or scored games.`);
});
