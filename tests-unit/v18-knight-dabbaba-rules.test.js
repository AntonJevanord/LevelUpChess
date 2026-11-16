'use strict';

// Geometry and engine-table diagnostics only; no searches or scored games.
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
const { TRIALS, NEW_DEFINITIONS, revisionProbes } = require('../src/balance-designs-v18-knight-dabbaba');

const ROOT = path.resolve(__dirname, '..');
const native = process.env.FAIRY_STOCKFISH_PATH || path.join(ROOT, 'node_modules/.cache/levelup-native-values/stockfish');
const variant = 'v18-knight-dabbaba-diagnostics';
const quietVariant = 'v18-knight-dabbaba-quiet-king-diagnostics';
const config = [[variant, 'ND'], [quietVariant, 'NDmK']].map(([name, movement]) => `[${name}:chess]\ncustomPiece1 = a:${movement}\npieceToCharTable = -\npieceValueMg = a:1203\npieceValueEg = a:1352\n`).join('\n');
const targets = ['b3', 'b5', 'c2', 'c6', 'e2', 'e6', 'f3', 'f5', 'b4', 'd2', 'd6', 'f4'];
const neighbors = ['c3', 'c4', 'c5', 'd3', 'd5', 'e3', 'e4', 'e5'];
const reflect = square => square[0] + (9 - Number(square[1]));
const swap = piece => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase();
const fixtures = new Map();
let raw, directory;
function fen(pieces, black = false, turn = 'w') {
  const map = new Map(Object.entries(pieces).map(([square, piece]) => black ? [reflect(square), swap(piece)] : [square, piece]));
  return `${placementFromMap(map)} ${black ? turn === 'w' ? 'b' : 'w' : turn} - - 0 1`;
}
function allMoves(position, remember = true, selected = variant) {
  if (remember) fixtures.set(`${selected}:${position}`, { variant: selected, fen: position });
  const board = new raw.Board(selected, position, false);
  try { return board.legalMoves().split(' ').filter(Boolean).sort(); }
  finally { board.delete(); }
}
function moves(pieces, black = false, origin = 'd4', selected = variant) {
  return allMoves(fen(pieces, black), true, selected).filter(move => move.startsWith(black ? reflect(origin) : origin));
}
const has = (actual, from, to, black = false) => actual.includes((black ? reflect(from) : from) + (black ? reflect(to) : to));

test.before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v18-knight-dabbaba-'));
  const output = path.join(directory, 'raw.cjs');
  await build({ ...rulesBuildOptions(), absWorkingDir: ROOT,
    stdin: { contents: "import Module from 'ffish-es6'; import bytes from 'variant-wasm'; export async function createRaw(config) { const m = await Module({ wasmBinary: Uint8Array.from(atob(bytes), c => c.charCodeAt(0)) }); m.loadVariantConfig(config); return m; }", resolveDir: ROOT, loader: 'js' },
    bundle: true, platform: 'node', format: 'cjs', outfile: output, legalComments: 'none' });
  raw = await require(output).createRaw(config);
  fs.writeFileSync(path.join(directory, 'profile.ini'), config);
});
test.after(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

test('ND and NDmK have distinct immutable level-two identities with the declared control', () => {
  assert.equal(getDesign('knight.level2-nd@1'), undefined);
  assert.equal(getDesign('knight.level2-nd-quiet-king@1'), undefined);
  assert.deepEqual(TRIALS.map(trial => [trial.id, trial.movement, trial.anchorId, trial.controlKey]), [
    ['knight.level2-nd@1', 'ND', 'knight.orange@3', 'nightrider-control'],
    ['knight.level2-nd-quiet-king@1', 'NDmK', 'knight.orange@3', 'nightrider-control'],
  ]);
  assert.ok(Object.isFrozen(TRIALS)); assert.ok(Object.isFrozen(TRIALS[0]));
  assert.ok(Object.isFrozen(NEW_DEFINITIONS)); assert.ok(Object.isFrozen(NEW_DEFINITIONS[0]));
  assert.equal(NEW_DEFINITIONS[0].level, 2); assert.equal(NEW_DEFINITIONS[0].placement, 'replace');
  assert.deepEqual(NEW_DEFINITIONS[0].roles, { pawn: false, castlingRook: false, enPassant: false });
  assert.ok(Object.isFrozen(NEW_DEFINITIONS[0].roles));
  assert.deepEqual(NEW_DEFINITIONS.map(row => [row.legacyType, row.legacySlot]), [['a', 1], ['c', 2]]);
  for (const row of NEW_DEFINITIONS) { assert.ok(Object.isFrozen(row)); assert.ok(Object.isFrozen(row.roles)); assert.equal(row.level, 2); }
});

test('both colors get exactly the ordinary knight and four orthogonal two-square jumps', () => {
  for (const black of [false, true]) {
    const s = black ? reflect : square => square;
    const actual = moves({ a1: 'K', h8: 'k', d4: 'A' }, black);
    assert.deepEqual(actual, targets.map(target => s('d4') + s(target)).sort());
    for (const target of ['c4', 'e4', 'd3', 'd5', 'a4', 'g4', 'd1', 'd7', 'c3', 'e5']) assert.ok(!has(actual, 'd4', target, black));
  }
});

test('every added and ordinary landing captures enemies and rejects friendly occupants', () => {
  for (const selected of [variant, quietVariant]) for (const black of [false, true]) for (const target of targets) for (const occupant of ['b', 'B']) {
    assert.equal(has(moves({ a1: 'K', h8: 'k', d4: 'A', [target]: occupant }, black, 'd4', selected), 'd4', target, black), occupant === 'b');
  }
});

test('NDmK adds exactly quiet adjacent king steps without any adjacent captures', () => {
  for (const black of [false, true]) {
    const s = black ? reflect : square => square;
    const actual = moves({ a1: 'K', h8: 'k', d4: 'A' }, black, 'd4', quietVariant);
    assert.deepEqual(actual, [...targets, ...neighbors].map(target => s('d4') + s(target)).sort());
    for (const target of neighbors) for (const occupant of ['p', 'P']) {
      assert.ok(!has(moves({ a1: 'K', h8: 'k', d4: 'A', [target]: occupant }, black, 'd4', quietVariant), 'd4', target, black));
    }
  }
});

test('both D jumps cross intermediate blockers without capturing the transit occupant', () => {
  for (const selected of [variant, quietVariant]) for (const black of [false, true]) for (const [target, transit] of [['b4', 'c4'], ['f4', 'e4'], ['d2', 'd3'], ['d6', 'd5']]) {
    for (const occupant of ['b', 'B']) {
      const actual = moves({ a1: 'K', h8: 'k', d4: 'A', [transit]: occupant }, black, 'd4', selected);
      assert.ok(has(actual, 'd4', target, black));
      assert.ok(!has(actual, 'd4', transit, black));
    }
  }
});

test('pins, check evasions and nonroyal landing behavior remain legal for both colors', () => {
  for (const black of [false, true]) {
    const s = black ? reflect : square => square;
    assert.deepEqual(moves({ e1: 'K', h8: 'k', e8: 'r', e3: 'A' }, black, 'e3'), [s('e3') + s('e5')]);
    assert.deepEqual(moves({ e1: 'K', h8: 'k', e8: 'r', c4: 'A' }, black, 'c4'), ['e3', 'e4', 'e5'].map(target => s('c4') + s(target)).sort());
    assert.deepEqual(moves({ e1: 'K', h8: 'k', e8: 'r', b4: 'A' }, black, 'b4'), []);
    assert.ok(has(moves({ a1: 'K', h8: 'k', d4: 'A', f8: 'r' }, black), 'd4', 'f5', black));
    assert.deepEqual(moves({ e1: 'K', h8: 'k', e8: 'r', e3: 'A' }, black, 'e3', quietVariant), ['e2', 'e4', 'e5'].map(target => s('e3') + s(target)).sort());
    assert.ok(has(moves({ e1: 'K', h8: 'k', e8: 'r', d4: 'A' }, black, 'd4', quietVariant), 'd4', 'e4', black));
    assert.ok(has(moves({ a1: 'K', h8: 'k', d4: 'A', f8: 'r' }, black, 'd4', quietVariant), 'd4', 'f5', black));
  }
  for (const selected of [variant, quietVariant]) for (const black of [false, true]) for (const [target, expected] of [['d6', true], ['f5', true], ['d5', false], ['d7', false]]) {
    const position = fen({ a1: 'K', [target]: 'k', d4: 'A' }, black, 'b');
    fixtures.set(`${selected}:${position}`, { variant: selected, fen: position });
    const board = new raw.Board(selected, position, false);
    try { assert.equal(board.isCheck(), expected); } finally { board.delete(); }
  }
});

test('allocated preflight probes are valid through the actual match wrapper', async () => {
  const { ensureResearchOverlay } = require('../scripts/balance/research-overlay');
  const overlay = ensureResearchOverlay({ name: 'v18-knight-dabbaba-validity-test', entryFile: 'scripts/v18-balance.js', definitionFile: 'src/balance-designs-v18-knight-dabbaba.js' });
  const { createDesignRegistry } = require(path.join(overlay.directory, 'scripts/balance/design-registry'));
  const { compileDesignProfile } = require(path.join(overlay.directory, 'scripts/balance/design-profile'));
  const registry = createDesignRegistry({ schemaVersion: 3, comparisons: TRIALS.map(trial => ({ armyA: { upgrades: { b1: trial.id } }, armyB: { upgrades: {} } })) });
  const profile = compileDesignProfile(registry);
  const { createMatchRules } = require('../dist/balance-rules.cjs');
  const rules = await createMatchRules({ profile });
  const probes = revisionProbes(profile);
  assert.equal(probes.length, 24); assert.equal(probes.filter(row => row.name.includes(': Black ')).length, 12);
  assert.equal(revisionProbes({ definitionsByLetter: {} }).length, 0);
  for (const probe of probes) {
    const board = rules.createBoard(probe.fen);
    try { assert.ok(Array.isArray(board.moves()), probe.name); } finally { board.dispose(); }
  }
});

test('native/browser fixtures agree and all six tables use the controlled value for both colors', { skip: !fs.existsSync(native), timeout: 180000 }, async t => {
  for (const selected of [variant, quietVariant]) {
    const engine = new UciEngine({ path: native, variantPath: path.join(directory, 'profile.ini'), variant: selected, options: { threads: 1, hash: 16 } });
    t.after(() => engine.close()); await engine.start();
    const values = await engine.pieceValues(); assert.deepEqual(values.pieces.a, values.pieces.A);
    for (const field of ['rawMg', 'captureMg', 'evalMg']) assert.equal(values.pieces.a[field], 1203);
    for (const field of ['rawEg', 'captureEg', 'evalEg']) assert.equal(values.pieces.a[field], 1352);
    for (const fixture of fixtures.values()) if (fixture.variant === selected) assert.deepEqual(await engine.perft({ fen: fixture.fen }), allMoves(fixture.fen, false, selected), fixture.fen);
    await engine.close();
  }
  t.diagnostic(`${fixtures.size} native/browser fixture positions; no searches or scored games.`);
});
