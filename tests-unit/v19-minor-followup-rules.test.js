'use strict';

// Rules-only geometry, prefix replay and native perft: no scored games.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { rulesBuildOptions } = require('../scripts/rules-build');
const { UciEngine } = require('../scripts/balance/uci');
const { placementFromMap } = require('../src/profile-fen');
const { TRIALS, NEW_DEFINITIONS, revisionProbes } = require('../src/balance-designs-v19-minor-followup');
const ROOT = path.resolve(__dirname, '..');
const native = process.env.FAIRY_STOCKFISH_PATH || path.join(ROOT, 'node_modules/.cache/levelup-native-values/stockfish');
const rows = [...TRIALS, { key: 'ordinary-bishop', movement: 'B', family: 'bishop' }]
  .map((row, index) => ({ ...row, variant: `v19-minor-rule-${index}` }));
const byKey = key => rows.find(row => row.key === key);
const config = rows.map(row => `[${row.variant}:chess]\ncustomPiece1 = a:${row.movement}\npieceToCharTable = -\n`).join('\n');
const reflect = square => square[0] + (9 - Number(square[1]));
const swap = piece => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase();
const kings = { a8: 'K', h1: 'k' };
const blockers = { c3: 'P', c4: 'P', c5: 'P', d3: 'P', d5: 'P', e3: 'P', e4: 'P', e5: 'P' };
const knight = ['b3', 'b5', 'c2', 'c6', 'e2', 'e6', 'f3', 'f5'];
const zebra = ['a2', 'a6', 'b1', 'b7', 'f1', 'f7', 'g2', 'g6'];
const forwardZebra = ['a6', 'b7', 'f7', 'g6'];
const sixZebra = ['a2', 'a6', 'b7', 'f7', 'g2', 'g6'];
const alfil = ['b2', 'b6', 'f2', 'f6'];
const forwardAlfil = ['b6', 'f6'];
const forwardTripper = ['a7', 'g7'];
const orthogonalTwo = ['b4', 'd2', 'd6', 'f4'];
const sideTwo = ['b4', 'f4'];
const verticalTwo = ['d2', 'd6'];
const knightGeometry = [
  ['knight-zebra', [...knight, ...zebra]],
  ['knight-zebra-alfil', [...knight, ...zebra, ...alfil]],
  ['knight-forward-zebra-alfil', [...knight, ...forwardZebra, ...forwardAlfil]],
  ['knight-forward-zebra-diagonals', [...knight, ...forwardZebra, ...forwardAlfil, ...forwardTripper]],
  ['knight-no-tall-back-zebra-alfil', [...knight, ...sixZebra, ...forwardAlfil]],
  ['knight-forward-zebra', [...knight, ...forwardZebra]],
  ['knight-no-tall-back-zebra', [...knight, ...sixZebra]],
];
const bishopGeometry = [
  ['bishop-dabbaba', orthogonalTwo, orthogonalTwo],
  ['bishop-side-dabbaba', sideTwo, sideTwo],
  ['bishop-quiet-dabbaba', orthogonalTwo, []],
  ['bishop-quiet-side-vertical-dabbaba', orthogonalTwo, verticalTwo],
  ['bishop-quiet-side-capture-vertical-dabbaba', sideTwo, verticalTwo],
  ['bishop-full-side-quiet-vertical-dabbaba', orthogonalTwo, sideTwo],
];
const fixtures = new Map();
let raw, directory;
function position(pieces, black = false) {
  const map = new Map(Object.entries(pieces).map(([square, piece]) => black ? [reflect(square), swap(piece)] : [square, piece]));
  return `${placementFromMap(map)} ${black ? 'b' : 'w'} - - 0 1`;
}
function legal(candidate, fen) {
  fixtures.set(`${candidate.variant}:${fen}`, { candidate, fen });
  const board = new raw.Board(candidate.variant, fen, false);
  try { return board.legalMoves().split(' ').filter(Boolean).sort(); }
  finally { board.delete(); }
}
function destinations(key, pieces, black = false) {
  const source = black ? reflect('d4') : 'd4';
  return legal(byKey(key), position(pieces, black)).filter(move => move.startsWith(source))
    .map(move => black ? reflect(move.slice(2, 4)) : move.slice(2, 4)).sort();
}
test.before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v19-minor-rules-'));
  const output = path.join(directory, 'raw.cjs');
  await build({ ...rulesBuildOptions(), absWorkingDir: ROOT,
    stdin: { contents: "import Module from 'ffish-es6'; import bytes from 'variant-wasm'; export async function createRaw(config) {const module=await Module({wasmBinary:Uint8Array.from(atob(bytes),c=>c.charCodeAt(0))});module.loadVariantConfig(config);return module;}", resolveDir: ROOT, loader: 'js' },
    bundle: true, platform: 'node', format: 'cjs', outfile: output, legalComments: 'none' });
  raw = await require(output).createRaw(config);
  fs.writeFileSync(path.join(directory, 'profiles.ini'), config);
});
test.after(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

test('thirteen immutable research bodies preserve the confirmed lowercase knight notation', () => {
  assert.deepEqual(TRIALS.map(row => row.movement), ['NZ', 'NZA', 'NfhZfA', 'NfhZfAfG', 'NfZsZfA', 'NfhZ', 'NsZfZ', 'BD', 'BsD', 'BmD', 'BsmDvD', 'BsmDvcD', 'BsDvmD']);
  assert.equal(new Set(NEW_DEFINITIONS.map(row => row.id)).size, 13);
  assert.equal(new Set(NEW_DEFINITIONS.map(row => row.legacyType)).size, 13);
  const { getDesign } = require('../src/design-catalog');
  for (const definition of NEW_DEFINITIONS) {
    assert.equal(getDesign(definition.id), undefined);
    assert.deepEqual(definition.roles, { pawn: false, castlingRook: false, enPassant: false });
    assert.ok(Object.isFrozen(definition)); assert.ok(Object.isFrozen(definition.roles));
    const probes = revisionProbes({ definitionsByLetter: { a: definition } });
    assert.equal(probes.length, 10);
    for (const probe of probes) legal(rows.find(row => row.id === definition.id), probe.fen);
  }
  assert.equal(revisionProbes({ definitionsByLetter: {} }).length, 0);
});

test('knight compounds have exact forward, full and no-tall-back jumping geometry in both colors', () => {
  const targets = [...new Set([...knight, ...zebra, ...alfil, ...forwardTripper, 'd7', 'd1', 'a4', 'g4'])];
  for (const [key, jumps] of knightGeometry) for (const black of [false, true]) {
    assert.deepEqual(destinations(key, { ...kings, d4: 'A', ...blockers }, black), [...jumps].sort());
    for (const target of targets) {
      assert.equal(destinations(key, { ...kings, d4: 'A', ...blockers, [target]: 'p' }, black).includes(target), jumps.includes(target), `${key} captures ${target}`);
      assert.ok(!destinations(key, { ...kings, d4: 'A', ...blockers, [target]: 'P' }, black).includes(target));
    }
    const enemies = Object.fromEntries(Object.keys(blockers).map(square => [square, 'p']));
    assert.deepEqual(destinations(key, { ...kings, d4: 'A', ...enemies }, black), [...jumps].sort());
  }
});

test('lowercase h keeps four forward zebra jumps and adds no straight H leap', () => {
  const key = 'knight-forward-zebra-diagonals';
  for (const black of [false, true]) {
    const actual = destinations(key, { ...kings, d4: 'A', ...blockers }, black);
    for (const target of [...forwardZebra, ...forwardAlfil, ...forwardTripper]) assert.ok(actual.includes(target));
    for (const target of ['a2', 'b1', 'f1', 'g2', 'd7']) assert.ok(!actual.includes(target));
  }
});

test('bishop variants separate quiet and capturing orthogonal jumps while preserving square color', () => {
  const color = square => (square.charCodeAt(0) + Number(square[1])) % 2;
  for (const [key, quiet, capture] of bishopGeometry) for (const black of [false, true]) {
    assert.deepEqual(destinations(key, { ...kings, d4: 'A', ...blockers }, black), [...quiet].sort());
    for (const target of orthogonalTwo) {
      assert.equal(destinations(key, { ...kings, d4: 'A', ...blockers, [target]: 'p' }, black).includes(target), capture.includes(target));
      assert.ok(!destinations(key, { ...kings, d4: 'A', ...blockers, [target]: 'P' }, black).includes(target));
    }
    for (const target of destinations(key, { ...kings, d4: 'A' }, black)) assert.equal(color(target), color('d4'));
    // Ordinary bishop movement remains blocked by intervening pieces.
    assert.ok(destinations(key, { ...kings, d4: 'A', b6: 'p' }, black).includes('b6'));
    assert.ok(!destinations(key, { ...kings, d4: 'A', c5: 'P', b6: 'p' }, black).includes('b6'));
    assert.deepEqual(destinations(key, { ...kings, d4: 'A', ...blockers }, black).filter(square => !orthogonalTwo.includes(square)), []);
  }
});

test('royal pins forbid off-file escape leaps for every candidate', () => {
  for (const candidate of TRIALS) for (const black of [false, true]) {
    const actual = destinations(candidate.key, { d1: 'K', h7: 'k', d8: 'r', d4: 'A' }, black);
    assert.ok(actual.every(square => square[0] === 'd'));
    if (candidate.family === 'knight') assert.deepEqual(actual, []);
  }
});

test('all sixty-four book prefixes remain legal for all thirteen candidates in either army', () => {
  const { openings } = require('../experiments/balance/v19-panel-openings.json');
  for (const candidate of TRIALS) for (const opening of openings) for (const black of [false, true]) {
    const fields = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'.split('/');
    const rank = black ? 0 : 7, square = candidate.family === 'knight' ? 1 : 2;
    const pieces = fields[rank].split(''); pieces[square] = black ? 'a' : 'A'; fields[rank] = pieces.join('');
    const board = new raw.Board(byKey(candidate.key).variant, `${fields.join('/')} w KQkq - 0 1`, false);
    try {
      for (const move of opening.moves) assert.ok(board.push(move), `${candidate.key} ${opening.id} ${move}`);
      legal(byKey(candidate.key), board.fen());
    } finally { board.delete(); }
  }
});

test('native and browser rules agree on directional, quiet/capture, pin and opening fixtures', { skip: !fs.existsSync(native), timeout: 120000 }, async () => {
  for (const candidate of rows) {
    const engine = new UciEngine({ path: native, variantPath: path.join(directory, 'profiles.ini'), variant: candidate.variant, options: { threads: 1, hash: 16 } });
    try {
      await engine.start();
      for (const fixture of fixtures.values()) if (fixture.candidate.variant === candidate.variant) {
        assert.deepEqual(await engine.perft({ fen: fixture.fen }), legal(candidate, fixture.fen), `${candidate.key}: ${fixture.fen}`);
      }
    } finally { await engine.close(); }
  }
});
