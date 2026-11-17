'use strict';

// Geometry, royal-safety and table diagnostics only. No scored engine games.
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
const { getOfficialReferences } = require('../scripts/balance/official-references');
const { TRIALS, NEW_DEFINITIONS, revisionProbes } = require('../src/balance-designs-v18-prepanel-level3');

const ROOT = path.resolve(__dirname, '..');
const native = process.env.FAIRY_STOCKFISH_PATH || path.join(ROOT, 'node_modules/.cache/levelup-native-values/stockfish');
const anchor = getOfficialReferences().roster.find(row => row.id === 'knight.purple@3');
const profiles = TRIALS.map(trial => ({ ...trial, variant: `v18-prepanel-l3-${trial.key}` }));
const config = profiles.map(row => `[${row.variant}:chess]\ncustomPiece1 = a:${row.movement}\npieceToCharTable = -\npieceValueMg = a:${anchor.engineValue.mg}\npieceValueEg = a:${anchor.engineValue.eg}\n`).join('\n');
const N = ['b3', 'b5', 'c2', 'c6', 'e2', 'e6', 'f3', 'f5'];
const W = ['c4', 'e4', 'd3', 'd5'];
const H = ['a4', 'g4', 'd1', 'd7'];
const Z = ['b1', 'b7', 'f1', 'f7', 'a2', 'a6', 'g2', 'g6'];
const A = ['b2', 'b6', 'f2', 'f6'];
const D = ['b4', 'd2', 'd6', 'f4'];
const K = ['c3', 'c4', 'c5', 'd3', 'd5', 'e3', 'e4', 'e5'];
const targets = { NWH: [...N, ...W, ...H], NH: [...N, ...H], NZ: [...N, ...Z],
  NAZ: [...N, ...A, ...Z], NAD: [...N, ...A, ...D], NADmK: [...N, ...A, ...D], NDH: [...N, ...D, ...H] };
const reflect = square => square[0] + (9 - Number(square[1]));
const swap = piece => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase();
const fixtures = new Map();
let raw, directory;
function fen(pieces, black = false, turn = 'w') {
  const map = new Map(Object.entries(pieces).map(([square, piece]) => black ? [reflect(square), swap(piece)] : [square, piece]));
  return `${placementFromMap(map)} ${black ? turn === 'w' ? 'b' : 'w' : turn} - - 0 1`;
}
function allMoves(selected, position, remember = true) {
  if (remember) fixtures.set(`${selected}:${position}`, { variant: selected, fen: position });
  const board = new raw.Board(selected, position, false);
  try { return board.legalMoves().split(' ').filter(Boolean).sort(); }
  finally { board.delete(); }
}
function moves(profile, pieces, black = false, origin = 'd4') {
  return allMoves(profile.variant, fen(pieces, black)).filter(move => move.startsWith(black ? reflect(origin) : origin));
}
const has = (actual, from, to, black = false) => actual.includes((black ? reflect(from) : from) + (black ? reflect(to) : to));

test.before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v18-prepanel-l3-'));
  const output = path.join(directory, 'raw.cjs');
  await build({ ...rulesBuildOptions(), absWorkingDir: ROOT,
    stdin: { contents: "import Module from 'ffish-es6'; import bytes from 'variant-wasm'; export async function createRaw(config) { const m = await Module({ wasmBinary: Uint8Array.from(atob(bytes), c => c.charCodeAt(0)) }); m.loadVariantConfig(config); return m; }", resolveDir: ROOT, loader: 'js' },
    bundle: true, platform: 'node', format: 'cjs', outfile: output, legalComments: 'none' });
  raw = await require(output).createRaw(config);
  fs.writeFileSync(path.join(directory, 'profile.ini'), config);
});
test.after(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

test('seven immutable three-point trials preserve old two-point bodies and frozen Unicorn', () => {
  assert.deepEqual(TRIALS.map(row => [row.id, row.movement]), [
    ['knight.level3-nwh@1', 'NWH'], ['knight.level3-nh@1', 'NH'], ['knight.level3-nz@1', 'NZ'],
    ['knight.level3-naz@1', 'NAZ'], ['knight.level3-nad@1', 'NAD'], ['knight.level3-nad-quiet-king@1', 'NADmK'],
    ['knight.level3-ndh@1', 'NDH'],
  ]);
  assert.equal(anchor.movement, 'NC'); assert.equal(anchor.level, 3);
  assert.deepEqual(anchor.engineValue, { mg: 1663, eg: 1877 });
  for (const [index, trial] of TRIALS.entries()) {
    assert.deepEqual(getDesign(trial.id), promoted.get(trial.id));
    assert.equal(trial.anchorId, anchor.id); assert.equal(trial.controlKey, 'unicorn-control');
    assert.ok(Object.isFrozen(trial));
    const definition = NEW_DEFINITIONS[index];
    assert.equal(definition.level, 3); assert.equal(definition.placement, 'replace');
    assert.deepEqual(definition.roles, { pawn: false, castlingRook: false, enPassant: false });
    assert.ok(Object.isFrozen(definition)); assert.ok(Object.isFrozen(definition.roles));
  }
  assert.ok(Object.isFrozen(TRIALS)); assert.ok(Object.isFrozen(NEW_DEFINITIONS));
  assert.equal(require('../src/balance-designs-v18-l2-followup').NEW_DEFINITIONS.find(row => row.movement === 'NWH').level, 2);
  assert.equal(require('../src/balance-designs-v18-l2-followup').NEW_DEFINITIONS.find(row => row.movement === 'NAD').level, 2);
  assert.equal(require('../src/balance-designs-v18-knight-screen').NEW_DEFINITIONS.find(row => row.movement === 'NH').level, 2);
  assert.equal(require('../src/balance-designs-v18-knight-screen').NEW_DEFINITIONS.find(row => row.movement === 'NDH').level, 2);
  assert.deepEqual([NEW_DEFINITIONS.at(-1).legacyType, NEW_DEFINITIONS.at(-1).legacySlot], ['h', 7]);
});

test('quiet geometry matches exactly the declared stepped and jumping target sets for both colors', () => {
  for (const row of profiles) for (const black of [false, true]) {
    const s = black ? reflect : square => square;
    const expected = [...targets[row.movement], ...(row.movement === 'NADmK' ? K : [])];
    assert.deepEqual(moves(row, { a1: 'K', h8: 'k', d4: 'A' }, black), expected.map(to => s('d4') + s(to)).sort(), row.movement);
  }
});

test('every normal landing captures enemies, rejects allies and retains the quiet-only K restriction', () => {
  for (const row of profiles) for (const black of [false, true]) for (const target of targets[row.movement]) for (const occupant of ['b', 'B']) {
    const actual = moves(row, { a1: 'K', h8: 'k', d4: 'A', [target]: occupant }, black);
    assert.equal(has(actual, 'd4', target, black), occupant === 'b', row.movement + ': ' + target);
  }
  const quiet = profiles.find(row => row.movement === 'NADmK');
  for (const black of [false, true]) for (const target of K) for (const occupant of ['p', 'P']) {
    assert.ok(!has(moves(quiet, { a1: 'K', h8: 'k', d4: 'A', [target]: occupant }, black), 'd4', target, black));
  }
});

test('D, A, H and zebra jumps cross intervening occupants while orthogonal steps cannot', () => {
  const frames = [
    ['d6', { d5: 'B' }, ['NAD', 'NADmK', 'NDH']],
    ['d7', { d5: 'B', d6: 'B' }, ['NWH', 'NH', 'NDH']],
    ['f6', { e5: 'P' }, ['NAZ', 'NAD', 'NADmK']],
    ['g6', { e4: 'B', e5: 'P', f5: 'P' }, ['NZ', 'NAZ']],
  ];
  for (const row of profiles) for (const black of [false, true]) for (const [target, blockers, supported] of frames) {
    assert.equal(has(moves(row, { a1: 'K', h8: 'k', d4: 'A', ...blockers }, black), 'd4', target, black), supported.includes(row.movement));
  }
  const stepped = profiles.find(row => row.movement === 'NWH');
  for (const black of [false, true]) assert.ok(!has(moves(stepped, { a1: 'K', h8: 'k', d4: 'A', d5: 'P' }, black), 'd4', 'd5', black));
});

test('royal safety still restricts pinned bodies and check evasions without making the knight royal', () => {
  const frames = [
    [{ e1: 'K', h8: 'k', e8: 'r', e3: 'A' }, 'e3', { NWH: ['e2', 'e4', 'e6'], NH: ['e6'], NZ: [], NAZ: [], NAD: ['e5'], NADmK: ['e2', 'e4', 'e5'], NDH: ['e5', 'e6'] }],
    [{ e1: 'K', h8: 'k', e8: 'r', c4: 'A' }, 'c4', { NWH: ['e3', 'e5'], NH: ['e3', 'e5'], NZ: ['e3', 'e5', 'e7'], NAZ: ['e2', 'e3', 'e5', 'e6', 'e7'], NAD: ['e2', 'e3', 'e4', 'e5', 'e6'], NADmK: ['e2', 'e3', 'e4', 'e5', 'e6'], NDH: ['e3', 'e4', 'e5'] }],
  ];
  for (const row of profiles) for (const black of [false, true]) {
    const s = black ? reflect : square => square;
    for (const [pieces, origin, expected] of frames) assert.deepEqual(moves(row, pieces, black, origin), expected[row.movement].map(to => s(origin) + s(to)).sort(), row.movement);
    assert.ok(has(moves(row, { a1: 'K', h8: 'k', d4: 'A', f8: 'r' }, black), 'd4', 'f5', black));
  }
});

test('checking attacks use capture geometry rather than quiet king steps for either color', () => {
  const frames = [['f5', profiles.map(row => row.movement)], ['d5', ['NWH']], ['d6', ['NAD', 'NADmK', 'NDH']],
    ['d7', ['NWH', 'NH', 'NDH']], ['f6', ['NAZ', 'NAD', 'NADmK']], ['g6', ['NZ', 'NAZ']], ['c3', []]];
  for (const row of profiles) for (const black of [false, true]) for (const [target, supported] of frames) {
    const position = fen({ a1: 'K', [target]: 'k', d4: 'A' }, black, 'b');
    fixtures.set(`${row.variant}:${position}`, { variant: row.variant, fen: position });
    const board = new raw.Board(row.variant, position, false);
    try { assert.equal(board.isCheck(), supported.includes(row.movement), row.movement + ': ' + target); }
    finally { board.delete(); }
  }
});

test('allocated campaign preflight frames pass the actual match wrapper', async () => {
  const { ensureResearchOverlay } = require('../scripts/balance/research-overlay');
  const overlay = ensureResearchOverlay({ name: 'v18-prepanel-l3-validity-test', entryFile: 'scripts/v18-balance.js', definitionFile: 'src/balance-designs-v18-prepanel-level3.js' });
  const { createDesignRegistry } = require(path.join(overlay.directory, 'scripts/balance/design-registry'));
  const { compileDesignProfile } = require(path.join(overlay.directory, 'scripts/balance/design-profile'));
  const registry = createDesignRegistry({ schemaVersion: 3, comparisons: TRIALS.map(row => ({ armyA: { upgrades: { b1: row.id } }, armyB: { upgrades: {} } })) });
  const profile = compileDesignProfile(registry);
  const { createMatchRules } = require('../dist/balance-rules.cjs');
  const rules = await createMatchRules({ profile }), probes = revisionProbes(profile);
  assert.equal(probes.length, 74); assert.equal(probes.filter(row => row.name.includes(': Black ')).length, 37);
  assert.equal(revisionProbes({ definitionsByLetter: {} }).length, 0);
  for (const probe of probes) {
    const board = rules.createBoard(probe.fen);
    try { assert.ok(Array.isArray(board.moves()), probe.name); } finally { board.dispose(); }
  }
});

test('native/browser legal moves agree and the frozen Unicorn prior fills all six tables for both colors', { skip: !fs.existsSync(native), timeout: 180000 }, async t => {
  for (const row of profiles) {
    const engine = new UciEngine({ path: native, variantPath: path.join(directory, 'profile.ini'), variant: row.variant, options: { threads: 1, hash: 16 } });
    t.after(() => engine.close()); await engine.start();
    const values = await engine.pieceValues(); assert.deepEqual(values.pieces.a, values.pieces.A);
    for (const field of ['rawMg', 'captureMg', 'evalMg']) assert.equal(values.pieces.a[field], anchor.engineValue.mg);
    for (const field of ['rawEg', 'captureEg', 'evalEg']) assert.equal(values.pieces.a[field], anchor.engineValue.eg);
    for (const fixture of fixtures.values()) if (fixture.variant === row.variant) assert.deepEqual(await engine.perft({ fen: fixture.fen }), allMoves(row.variant, fixture.fen, false), row.movement + ': ' + fixture.fen);
    await engine.close();
  }
  t.diagnostic(`${fixtures.size} native/browser fixture positions; no searches or scored games.`);
});
