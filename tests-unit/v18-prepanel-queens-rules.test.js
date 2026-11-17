'use strict';

// Geometry and valuation diagnostics only; no searches or scored match games.
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
const current = require('../src/balance-designs-v18-prepanel-queens');
const earlier = require('../src/balance-designs-v18-queen-screen');

const ROOT = path.resolve(__dirname, '..');
const native = process.env.FAIRY_STOCKFISH_PATH || path.join(ROOT, 'node_modules/.cache/levelup-native-values/stockfish');
const cases = current.TRIALS.map(row => ({ ...row, variant: `v18-prepanel-${row.key}`,
  values: row.level === 1 ? [2771, 2833] : [3738, 4155],
  oldId: row.movement === 'QvN' ? 'queen.level2-tall-knight@1' : 'queen.level1-camel-capture@1',
  oldVariant: `v18-prepanel-${row.key}-historical`,
}));
const historical = cases.map(row => ({ ...row, variant: row.oldVariant,
  values: row.movement === 'QvN' ? [3738, 4155] : [2771, 2833] }));
const ordinary = { variant: 'v18-prepanel-queen-ordinary', movement: 'Q', values: [2771, 2833] };
const config = [...cases, ...historical, ordinary].map(row => `[${row.variant}:chess]\ncustomPiece1 = a:${row.movement}\npieceToCharTable = -\npieceValueMg = a:${row.values[0]}\npieceValueEg = a:${row.values[1]}\n`).join('\n');
const knight = ['b3', 'b5', 'c2', 'c6', 'e2', 'e6', 'f3', 'f5'];
const camel = ['a3', 'a5', 'c1', 'c7', 'e1', 'e7', 'g3', 'g5'];
const tall = ['c2', 'c6', 'e2', 'e6'];
const kings = { a1: 'K', h7: 'k' };
const reflect = square => square[0] + (9 - Number(square[1]));
const swap = piece => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase();
const fixtures = new Map();
let directory, raw;

function fen(pieces, black = false, turn = 'w') {
  const map = new Map(Object.entries(pieces).map(([square, piece]) => black ? [reflect(square), swap(piece)] : [square, piece]));
  return `${placementFromMap(map)} ${black ? turn === 'w' ? 'b' : 'w' : turn} - - 0 1`;
}
function allMoves(row, position, remember = true) {
  if (remember) fixtures.set(`${row.variant}:${position}`, { variant: row.variant, fen: position });
  const board = new raw.Board(row.variant, position, false);
  try { return board.legalMoves().split(' ').filter(Boolean).sort(); }
  finally { board.delete(); }
}
function moves(row, pieces, black = false) {
  return allMoves(row, fen(pieces, black)).filter(move => move.startsWith(black ? reflect('d4') : 'd4'));
}
const has = (actual, target, black = false) => actual.includes(black ? reflect('d4') + reflect(target) : 'd4' + target);

test.before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v18-prepanel-queens-'));
  const output = path.join(directory, 'raw.cjs');
  await build({ ...rulesBuildOptions(), absWorkingDir: ROOT,
    stdin: { contents: "import Module from 'ffish-es6'; import bytes from 'variant-wasm'; export async function createRaw(config) { const m = await Module({ wasmBinary: Uint8Array.from(atob(bytes), c => c.charCodeAt(0)) }); m.loadVariantConfig(config); return m; }", resolveDir: ROOT, loader: 'js' },
    bundle: true, platform: 'node', format: 'cjs', outfile: output, legalComments: 'none' });
  raw = await require(output).createRaw(config);
  fs.writeFileSync(path.join(directory, 'profiles.ini'), config);
});
test.after(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

test('queen swaps receive new immutable tier identities while earlier definitions stay intact', () => {
  assert.deepEqual(current.NEW_DEFINITIONS.map(row => [row.id, row.level, row.movement]), [
    ['queen.level1-tall-knight@1', 1, 'QvN'], ['queen.level2-camel-capture@1', 2, 'QcC'],
  ]);
  for (const rows of [current.TRIALS, current.LEVEL1_TRIALS, current.LEVEL2_TRIALS, current.NEW_DEFINITIONS]) assert.ok(Object.isFrozen(rows));
  for (const definition of current.NEW_DEFINITIONS) {
    assert.deepEqual(getDesign(definition.id), promoted.get(definition.id)); assert.ok(Object.isFrozen(definition));
    assert.ok(Object.isFrozen(definition.roles)); assert.equal(definition.placement, 'replace');
    assert.deepEqual(definition.roles, { pawn: false, castlingRook: false, enPassant: false });
  }
  for (const row of cases) {
    const old = earlier.NEW_DEFINITIONS.find(definition => definition.id === row.oldId);
    assert.equal(old.movement, row.movement); assert.equal(old.level, row.level === 1 ? 2 : 1);
    assert.equal(row.anchorId, row.level === 1 ? 'queen.blue@2' : 'queen.orange@2');
    assert.equal(row.controlKey, row.level === 1 ? 'forward-queen-control' : 'side-queen-control');
  }
});

test('both colors retain normal queen rays and only QvN adds quiet tall knight jumps', () => {
  for (const black of [false, true]) for (const row of cases) {
    const baseline = moves(ordinary, { ...kings, d4: 'A' }, black), s = black ? reflect : square => square;
    assert.deepEqual(moves(row, { ...kings, d4: 'A' }, black), [...baseline,
      ...(row.movement === 'QvN' ? tall.map(target => s('d4') + s(target)) : [])].sort());
  }
});

test('capture-only camels and full tall-knight jumps have exact occupied-target behavior', () => {
  for (const black of [false, true]) for (const row of cases) for (const target of [...knight, ...camel]) {
    const supported = (row.movement === 'QvN' ? tall : camel).includes(target);
    assert.equal(has(moves(row, { ...kings, d4: 'A' }, black), target, black), supported && row.movement === 'QvN');
    assert.equal(has(moves(row, { ...kings, d4: 'A', [target]: 'b' }, black), target, black), supported);
    const friendly = ['c2', 'f5'].includes(target) ? 'P' : 'B';
    assert.equal(has(moves(row, { ...kings, d4: 'A', [target]: friendly }, black), target, black), false);
  }
});

test('sliding rays stop at blockers while the additional jumps cross intermediate pieces', () => {
  const blockers = { c3: 'P', d3: 'P', e3: 'P', c4: 'P', e4: 'P', c5: 'P', d5: 'P', e5: 'P' };
  for (const black of [false, true]) for (const row of cases) {
    const pieces = { ...kings, d4: 'A', ...blockers }, s = black ? reflect : square => square;
    assert.deepEqual(moves(ordinary, pieces, black), []);
    assert.deepEqual(moves(row, pieces, black), row.movement === 'QvN' ? tall.map(target => s('d4') + s(target)).sort() : []);
    for (const target of row.movement === 'QvN' ? tall : camel) assert.ok(has(moves(row, { ...pieces, [target]: 'b' }, black), target, black));
  }
});

test('royal safety constrains pinned queens while added captures give the correct checks', () => {
  for (const black of [false, true]) for (const row of cases) {
    for (const pieces of [
      { d1: 'K', h7: 'k', d8: 'r', d4: 'A' },
      { a1: 'K', h7: 'k', a8: 'r', d4: 'A' },
    ]) assert.deepEqual(moves(row, pieces, black), moves(ordinary, pieces, black));
    assert.ok(has(moves(row, { ...kings, d4: 'A', e8: 'r' }, black), 'e4', black), 'nonroyal queen can enter a rook attack');
    for (const target of [...knight, ...camel, 'd6', 'f6']) {
      const position = fen({ a1: 'K', d4: 'A', [target]: 'k' }, black, 'b');
      fixtures.set(`${row.variant}:${position}`, { variant: row.variant, fen: position });
      const board = new raw.Board(row.variant, position, false);
      try { assert.equal(board.isCheck(), (row.movement === 'QvN' ? tall : camel).includes(target) || ['d6', 'f6'].includes(target)); }
      finally { board.delete(); }
    }
  }
});

test('each new price/prior context has identical legal geometry to its earlier queen counterpart', () => {
  for (const row of cases) {
    const positions = [...fixtures.values()].filter(fixture => fixture.variant === row.variant).map(fixture => fixture.fen);
    for (const position of positions) assert.deepEqual(allMoves(row, position), allMoves({ variant: row.oldVariant }, position));
  }
});

test('all twenty allocated positions pass the actual match-wrapper king-safety validation', async () => {
  const { ensureResearchOverlay } = require('../scripts/balance/research-overlay');
  const overlay = ensureResearchOverlay({ name: 'v18-prepanel-queen-probes', entryFile: 'scripts/v18-balance.js',
    definitionFile: 'src/balance-designs-v18-prepanel-queens.js' });
  const { createDesignRegistry } = require(path.join(overlay.directory, 'scripts/balance/design-registry'));
  const { compileDesignProfile } = require(path.join(overlay.directory, 'scripts/balance/design-profile'));
  const registry = createDesignRegistry({ schemaVersion: 3,
    comparisons: cases.map(row => ({ armyA: { upgrades: { d1: row.id } }, armyB: { upgrades: {} } })) });
  const profile = compileDesignProfile(registry), probes = current.revisionProbes(profile);
  assert.equal(probes.length, 20); assert.equal(probes.filter(row => row.name.includes(': Black ')).length, 10);
  const { createMatchRules } = require('../dist/balance-rules.cjs');
  const rules = await createMatchRules({ profile });
  for (const probe of probes) {
    const board = rules.createBoard(probe.fen);
    try { assert.ok(Array.isArray(board.moves()), probe.name); }
    finally { board.dispose(); }
  }
  assert.deepEqual(current.revisionProbes({ definitionsByLetter: {} }), []);
});

test('native/browser diagnostics agree and all six value tables retain explicit old and new priors',
  { skip: !fs.existsSync(native), timeout: 180000 }, async t => {
    let compared = 0;
    for (const row of [...cases, ...historical]) {
      const engine = new UciEngine({ path: native, variantPath: path.join(directory, 'profiles.ini'), variant: row.variant, options: { threads: 1, hash: 16 } });
      t.after(() => engine.close()); await engine.start();
      const tables = await engine.pieceValues(); assert.deepEqual(tables.pieces.a, tables.pieces.A);
      for (const field of ['rawMg', 'captureMg', 'evalMg']) assert.equal(tables.pieces.a[field], row.values[0]);
      for (const field of ['rawEg', 'captureEg', 'evalEg']) assert.equal(tables.pieces.a[field], row.values[1]);
      for (const fixture of fixtures.values()) if (fixture.variant === row.variant) {
        assert.deepEqual(await engine.perft({ fen: fixture.fen }), allMoves(row, fixture.fen, false), row.variant + ': ' + fixture.fen);
        compared++;
      }
      await engine.close();
    }
    t.diagnostic(`${compared} native/browser positions; no searches or scored games.`);
  });
