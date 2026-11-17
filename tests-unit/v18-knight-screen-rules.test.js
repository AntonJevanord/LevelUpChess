'use strict';

// Geometry/value diagnostics only: no engine searches, scored games or catalog edits.
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
const { NEW_DEFINITIONS, TRIALS, revisionProbes } = require('../src/balance-designs-v18-knight-screen');

const ROOT = path.resolve(__dirname, '..');
const native = process.env.FAIRY_STOCKFISH_PATH || path.join(ROOT, 'node_modules/.cache/levelup-native-values/stockfish');
const ORIGINAL = 'v18-knight-original-level3-nightrider';
const profiles = TRIALS.map(row => ({ ...row, variant: `v18-knight-screen-${row.key}` }));
const config = profiles.map(row => `[${row.variant}:chess]\ncustomPiece1 = a:${row.movement}\npieceToCharTable = -\npieceValueMg = a:1203\npieceValueEg = a:1352\n`).join('\n')
  + `\n[${ORIGINAL}:chess]\ncustomPiece1 = a:N0\npieceToCharTable = -\n`;
const variants = Object.fromEntries(profiles.map(row => [row.key, row.variant]));
const knightTargets = ['b3', 'b5', 'c2', 'c6', 'e2', 'e6', 'f3', 'f5'];
const threeTargets = ['a4', 'd1', 'd7', 'g4'];
const twoTargets = ['b4', 'd2', 'd6', 'f4'];
const riderTargets = [...knightTargets, 'b8', 'f8', 'h2', 'h6'];
const expectedTargets = { 'knight-nh': [...knightTargets, ...threeTargets],
  'knight-ndh': [...knightTargets, ...twoTargets, ...threeTargets], 'nightrider-level2': riderTargets };
const reflect = square => square[0] + (9 - Number(square[1]));
const swap = piece => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase();
const fixtures = new Map();
let raw, directory;
function fen(pieces, black = false, turn = 'w') {
  const map = new Map(Object.entries(pieces).map(([square, piece]) => black ? [reflect(square), swap(piece)] : [square, piece]));
  return `${placementFromMap(map)} ${black ? turn === 'w' ? 'b' : 'w' : turn} - - 0 1`;
}
function allMoves(variant, position, remember = true) {
  if (remember) fixtures.set(`${variant}:${position}`, { variant, fen: position });
  const board = new raw.Board(variant, position, false);
  try { return board.legalMoves().split(' ').filter(Boolean).sort(); }
  finally { board.delete(); }
}
function moves(key, pieces, black = false, origin = 'd4') {
  return allMoves(variants[key], fen(pieces, black)).filter(move => move.startsWith(black ? reflect(origin) : origin));
}
const has = (actual, from, to, black = false) => actual.includes((black ? reflect(from) : from) + (black ? reflect(to) : to));

test.before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v18-knight-screen-'));
  const output = path.join(directory, 'raw.cjs');
  await build({ ...rulesBuildOptions(), absWorkingDir: ROOT,
    stdin: { contents: "import Module from 'ffish-es6'; import bytes from 'variant-wasm'; export async function createRaw(config) { const m = await Module({ wasmBinary: Uint8Array.from(atob(bytes), c => c.charCodeAt(0)) }); m.loadVariantConfig(config); return m; }", resolveDir: ROOT, loader: 'js' },
    bundle: true, platform: 'node', format: 'cjs', outfile: output, legalComments: 'none' });
  raw = await require(output).createRaw(config);
  fs.writeFileSync(path.join(directory, 'profiles.ini'), config);
});
test.after(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

test('three immutable level-two identities leave the original level-three Nightrider untouched', () => {
  assert.deepEqual(TRIALS.map(row => row.id), ['knight.level2-nh@1', 'knight.level2-ndh@1', 'knight.nightrider-level2@1']);
  assert.deepEqual(TRIALS.map(row => row.movement), ['NH', 'NDH', 'N0']);
  assert.ok(Object.isFrozen(TRIALS)); assert.ok(Object.isFrozen(NEW_DEFINITIONS));
  for (const definition of NEW_DEFINITIONS) {
    assert.deepEqual(getDesign(definition.id), promoted.get(definition.id));
    assert.equal(definition.level, 2); assert.equal(definition.placement, 'replace');
    assert.deepEqual(definition.roles, { pawn: false, castlingRook: false, enPassant: false });
    assert.ok(Object.isFrozen(definition)); assert.ok(Object.isFrozen(definition.roles));
  }
  for (const trial of TRIALS) {
    assert.ok(Object.isFrozen(trial)); assert.equal(trial.anchorId, 'knight.orange@3');
    assert.equal(trial.controlKey, 'nfa-control');
  }
  assert.equal(getDesign('knight.purple@4').movement, 'N0');
  assert.equal(getDesign('knight.purple@4').level, 3);
});

test('open quiet movement matches exact knight, two/three-square jump and rider target sets in both colors', () => {
  for (const black of [false, true]) for (const row of profiles) {
    const s = black ? reflect : square => square;
    const actual = moves(row.key, { a1: 'K', h8: 'k', d4: 'A' }, black);
    assert.deepEqual(actual, expectedTargets[row.key].map(target => s('d4') + s(target)).sort(), row.movement + ': ' + black);
    for (const step of ['c4', 'e4', 'd3', 'd5', 'c3', 'e3', 'c5', 'e5']) assert.ok(!has(actual, 'd4', step, black));
  }
});

test('each landing supports captures but rejects allies; rider captures stop on the first landing', () => {
  for (const black of [false, true]) for (const row of profiles) for (const target of expectedTargets[row.key]) {
    for (const occupant of ['b', 'B']) {
      const actual = moves(row.key, { a1: 'K', h8: 'k', d4: 'A', [target]: occupant }, black);
      assert.equal(has(actual, 'd4', target, black), occupant === 'b', row.movement + ': ' + target + ': ' + black);
    }
  }
  for (const black of [false, true]) for (const occupant of ['b', 'B']) {
    const actual = moves('nightrider-level2', { a1: 'K', h8: 'k', d4: 'A', e6: occupant, f8: 'b' }, black);
    assert.equal(has(actual, 'd4', 'e6', black), occupant === 'b');
    assert.ok(!has(actual, 'd4', 'f8', black));
  }
});

test('orthogonal jumps ignore intervening pieces without acquiring intervening captures', () => {
  const paths = [ ['a4', ['c4', 'b4']], ['g4', ['e4', 'f4']], ['d1', ['d3', 'd2']], ['d7', ['d5', 'd6']] ];
  for (const black of [false, true]) for (const key of ['knight-nh', 'knight-ndh']) for (const [target, transit] of paths) {
    for (const occupant of ['b', 'B']) {
      const pieces = { a1: 'K', h8: 'k', d4: 'A', ...Object.fromEntries(transit.map(square => [square, occupant])) };
      const actual = moves(key, pieces, black);
      assert.ok(has(actual, 'd4', target, black), key + ': ' + target + ': ' + black);
      assert.ok(!has(actual, 'd4', transit[0], black));
      assert.equal(has(actual, 'd4', transit[1], black), key === 'knight-ndh' && occupant === 'b');
    }
  }
  const shortPaths = [['b4', 'c4'], ['f4', 'e4'], ['d2', 'd3'], ['d6', 'd5']];
  for (const black of [false, true]) for (const [target, transit] of shortPaths) for (const occupant of ['b', 'B']) {
    assert.ok(has(moves('knight-ndh', { a1: 'K', h8: 'k', d4: 'A', [transit]: occupant }, black), 'd4', target, black));
  }
});

test('the Nightrider repeats knight vectors and ignores pieces between its discrete landings', () => {
  for (const black of [false, true]) {
    const actual = moves('nightrider-level2', { a1: 'K', h8: 'k', d4: 'A', e5: 'N', d5: 'N', f8: 'b' }, black);
    assert.ok(has(actual, 'd4', 'e6', black)); assert.ok(has(actual, 'd4', 'f8', black));
    for (const target of ['a4', 'g4', 'd1', 'd7', 'b4', 'f4', 'd2', 'd6']) assert.ok(!has(actual, 'd4', target, black));
  }
});

test('pins and check evasions constrain every nonroyal body without changing its geometry', () => {
  const frames = [
    [{ e1: 'K', h8: 'k', e8: 'r', e3: 'A' }, 'e3', { 'knight-nh': ['e6'], 'knight-ndh': ['e5', 'e6'], 'nightrider-level2': [] }],
    [{ e1: 'K', h8: 'k', e8: 'r', b4: 'A' }, 'b4', { 'knight-nh': ['e4'], 'knight-ndh': ['e4'], 'nightrider-level2': [] }],
    [{ e1: 'K', h8: 'k', e8: 'r', c4: 'A' }, 'c4', { 'knight-nh': ['e3', 'e5'], 'knight-ndh': ['e3', 'e4', 'e5'], 'nightrider-level2': ['e3', 'e5', 'e8'] }],
  ];
  for (const black of [false, true]) for (const row of profiles) for (const [pieces, origin, expected] of frames) {
    const s = black ? reflect : square => square;
    assert.deepEqual(moves(row.key, pieces, black, origin), expected[row.key].map(target => s(origin) + s(target)).sort());
  }
  for (const black of [false, true]) for (const row of profiles) {
    assert.ok(has(moves(row.key, { a1: 'K', h8: 'k', d4: 'A', f8: 'r' }, black), 'd4', 'f5', black), 'nonroyal knight may enter a rook attack');
  }
});

test('checking attacks retain exact long-jump and repeated-knight geometry for both colors', () => {
  const frames = [['d7', {}, ['knight-nh', 'knight-ndh']], ['d6', {}, ['knight-ndh']],
    ['f5', {}, profiles.map(row => row.key)], ['d5', {}, []], ['e5', {}, []],
    ['f8', {}, ['nightrider-level2']], ['f8', { e6: 'B' }, []], ['f8', { e6: 'b' }, []],
    ['f8', { e5: 'N' }, ['nightrider-level2']]];
  for (const black of [false, true]) for (const row of profiles) for (const [target, blockers, checked] of frames) {
    const position = fen({ a1: 'K', [target]: 'k', d4: 'A', ...blockers }, black, 'b');
    fixtures.set(`${row.variant}:${position}`, { variant: row.variant, fen: position });
    const board = new raw.Board(row.variant, position, false);
    try { assert.equal(board.isCheck(), checked.includes(row.key), row.key + ': ' + target + ': ' + black); }
    finally { board.delete(); }
  }
});

test('two-point N0 has identical legal movement to the unchanged level-three body in every tested context', () => {
  const contexts = [...fixtures.values()].map(row => row.fen);
  for (const position of new Set(contexts)) {
    assert.deepEqual(allMoves(variants['nightrider-level2'], position), allMoves(ORIGINAL, position), position);
  }
});

test('preflight frames use allocated letters and both physical colors', () => {
  const definitionsByLetter = Object.fromEntries(NEW_DEFINITIONS.map((definition, index) => [['h', 'i', 'j'][index], definition]));
  const probes = revisionProbes({ definitionsByLetter });
  assert.equal(probes.length, 36); assert.equal(probes.filter(row => row.name.includes(': Black ')).length, 18);
  assert.equal(new Set(probes.map(row => row.name)).size, 36);
  assert.ok(probes.every(row => !row.fen.split(' ')[0].includes('A')));
  assert.equal(revisionProbes({ definitionsByLetter: {} }).length, 0);
});

test('every allocated preflight frame passes actual match-wrapper inactive-king validation', async () => {
  const { ensureResearchOverlay } = require('../scripts/balance/research-overlay');
  const overlay = ensureResearchOverlay({ name: 'v18-knight-screen-probe-validity-test',
    entryFile: 'scripts/v18-balance.js', definitionFile: 'src/balance-designs-v18-knight-screen.js' });
  const { createDesignRegistry } = require(path.join(overlay.directory, 'scripts/balance/design-registry'));
  const { compileDesignProfile } = require(path.join(overlay.directory, 'scripts/balance/design-profile'));
  const registry = createDesignRegistry({ schemaVersion: 3,
    comparisons: TRIALS.map(trial => ({ armyA: { upgrades: { b1: trial.id } }, armyB: { upgrades: {} } })) });
  const profile = compileDesignProfile(registry);
  const { createMatchRules } = require('../dist/balance-rules.cjs');
  const rules = await createMatchRules({ profile });
  const probes = revisionProbes(profile); assert.equal(probes.length, 36);
  for (const probe of probes) {
    const board = rules.createBoard(probe.fen);
    try { assert.ok(Array.isArray(board.moves()), probe.name); }
    finally { board.dispose(); }
  }
});

test('native and browser diagnostics agree and the common level-two priors fill all six tables', { skip: !fs.existsSync(native), timeout: 180000 }, async t => {
  for (const row of [...profiles, { variant: ORIGINAL, movement: 'N0 original' }]) {
    const engine = new UciEngine({ path: native, variantPath: path.join(directory, 'profiles.ini'), variant: row.variant, options: { threads: 1, hash: 16 } });
    t.after(() => engine.close()); await engine.start();
    const tables = await engine.pieceValues(); assert.deepEqual(tables.pieces.a, tables.pieces.A);
    const [mg, eg] = row.variant === ORIGINAL ? [2326, 2211] : [1203, 1352];
    for (const field of ['rawMg', 'captureMg', 'evalMg']) assert.equal(tables.pieces.a[field], mg);
    for (const field of ['rawEg', 'captureEg', 'evalEg']) assert.equal(tables.pieces.a[field], eg);
    for (const fixture of fixtures.values()) if (fixture.variant === row.variant) {
      assert.deepEqual(await engine.perft({ fen: fixture.fen }), allMoves(row.variant, fixture.fen, false), row.movement + ': ' + fixture.fen);
    }
    await engine.close();
  }
  t.diagnostic(`${fixtures.size} native/browser fixture positions; no searches or scored games.`);
});
