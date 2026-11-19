'use strict';

// Bounded move generation and prefix replay only; no search games.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { rulesBuildOptions } = require('../scripts/rules-build');
const { UciEngine } = require('../scripts/balance/uci');
const { placementFromMap } = require('../src/profile-fen');
const { TRIALS, NEW_DEFINITIONS, revisionProbes } = require('../src/balance-designs-v19-queen-rook-followup');
const ROOT = path.resolve(__dirname, '..');
const native = process.env.FAIRY_STOCKFISH_PATH || path.join(ROOT, 'node_modules/.cache/levelup-native-values/stockfish');
const rows = [...TRIALS, { key: 'ordinary-queen', movement: 'Q', family: 'queen' },
  { key: 'side-knight-control', movement: 'QsN', family: 'queen' },
  { key: 'rook-control', movement: 'RcN', family: 'rook' }]
  .map((row, index) => ({ ...row, variant: `v19-queen-rook-rule-${index}` }));
const byKey = key => rows.find(row => row.key === key);
const config = rows.map(row => `[${row.variant}:chess]\ncustomPiece1 = a:${row.movement}\npieceToCharTable = -\ncastlingRookPiece = ${row.family === 'rook' ? 'ra' : 'r'}\n`).join('\n');
const reflect = square => square[0] + (9 - Number(square[1]));
const swap = piece => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase();
const kings = { a8: 'K', h1: 'k' };
const blockers = { c3: 'P', c4: 'P', c5: 'P', d3: 'P', d5: 'P', e3: 'P', e4: 'P', e5: 'P' };
const sideKnight = ['b3', 'b5', 'f3', 'f5'];
const knight = [...sideKnight, 'c2', 'c6', 'e2', 'e6'];
const camel = ['a3', 'a5', 'c1', 'c7', 'e1', 'e7', 'g3', 'g5'];
const zebra = ['a2', 'a6', 'b1', 'b7', 'f1', 'f7', 'g2', 'g6'];
const diagonalJumps = ['a1', 'a7', 'b2', 'b6', 'f2', 'f6', 'g1', 'g7'];
const fixtures = new Map();
let raw, directory;
function position(pieces, black = false, castling = '-') {
  const map = new Map(Object.entries(pieces).map(([square, piece]) => black ? [reflect(square), swap(piece)] : [square, piece]));
  return `${placementFromMap(map)} ${black ? 'b' : 'w'} ${black ? castling.toLowerCase() : castling} - 0 1`;
}
function legal(candidate, fen) {
  fixtures.set(`${candidate.variant}:${fen}`, { candidate, fen });
  const board = new raw.Board(candidate.variant, fen, false);
  try { return board.legalMoves().split(' ').filter(Boolean).sort(); }
  finally { board.delete(); }
}
function destinations(key, pieces, black = false, origin = 'd4', castling = '-') {
  const source = black ? reflect(origin) : origin;
  return legal(byKey(key), position(pieces, black, castling)).filter(move => move.startsWith(source))
    .map(move => black ? reflect(move.slice(2, 4)) : move.slice(2, 4)).sort();
}
test.before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v19-queen-rook-rules-'));
  const output = path.join(directory, 'raw.cjs');
  await build({ ...rulesBuildOptions(), absWorkingDir: ROOT,
    stdin: { contents: "import Module from 'ffish-es6'; import bytes from 'variant-wasm'; export async function createRaw(config) {const module=await Module({wasmBinary:Uint8Array.from(atob(bytes),c=>c.charCodeAt(0))});module.loadVariantConfig(config);return module;}", resolveDir: ROOT, loader: 'js' },
    bundle: true, platform: 'node', format: 'cjs', outfile: output, legalComments: 'none' });
  raw = await require(output).createRaw(config);
  fs.writeFileSync(path.join(directory, 'profiles.ini'), config);
});
test.after(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

test('nine research identities are immutable, distinct, and do not enter the playable catalog', () => {
  assert.deepEqual(TRIALS.map(row => row.movement), ['QsNfD', 'QsNfDfH', 'RcsNcfN', 'QsCfC', 'QsZfZ', 'QZAG', 'QZH', 'QC', 'QZ']);
  assert.equal(NEW_DEFINITIONS.length, 9);
  const { getDesign } = require('../src/design-catalog');
  for (const definition of NEW_DEFINITIONS) {
    assert.equal(getDesign(definition.id), undefined);
    assert.equal(definition.roles.castlingRook, definition.family === 'rook');
    assert.equal(definition.placement, 'replace'); assert.ok(Object.isFrozen(definition));
    assert.ok(Object.isFrozen(definition.roles));
  }
  assert.equal(revisionProbes({ definitionsByLetter: {} }).length, 0);
  for (const definition of NEW_DEFINITIONS) {
    const probes = revisionProbes({ definitionsByLetter: { a: definition } });
    assert.equal(probes.length, definition.family === 'rook' ? 16 : 12);
    for (const probe of probes) legal(rows.find(row => row.id === definition.id), probe.fen);
  }
});

test('camel and zebra queens keep full jumps in six directions and omit only tall backward jumps', () => {
  for (const [key, all, omitted] of [['queen-no-tall-back-camel', camel, ['c1', 'e1']],
    ['queen-no-tall-back-zebra', zebra, ['b1', 'f1']]]) for (const black of [false, true]) {
    const expected = all.filter(square => !omitted.includes(square)).sort();
    assert.deepEqual(destinations(key, { ...kings, d4: 'A', ...blockers }, black), expected);
    for (const target of all) {
      const allowed = expected.includes(target);
      assert.equal(destinations(key, { ...kings, d4: 'A', ...blockers, [target]: 'p' }, black).includes(target), allowed, `${key} capture ${target}`);
      assert.equal(destinations(key, { ...kings, d4: 'A', ...blockers, [target]: 'P' }, black).includes(target), false);
    }
    for (const target of ['d6', 'g4', 'f6', 'b2']) assert.ok(destinations(key, { ...kings, d4: 'A', [target]: 'p' }, black).includes(target));
  }
});

test('forward D/H components add blocker jumps, not new destinations on an empty queen line', () => {
  for (const black of [false, true]) for (const [key, jumps] of [
    ['queen-forward-two-jump', ['d6']], ['queen-forward-two-three-jumps', ['d6', 'd7']],
  ]) {
    assert.deepEqual(destinations(key, { ...kings, d4: 'A' }, black), destinations('side-knight-control', { ...kings, d4: 'A' }, black));
    assert.deepEqual(destinations(key, { ...kings, d4: 'A', ...blockers }, black), [...sideKnight, ...jumps].sort());
    for (const target of ['d2', 'd1', 'b4', 'a4', 'f4', 'g4', 'd6', 'd7', 'd8']) {
      assert.equal(destinations(key, { ...kings, d4: 'A', ...blockers, [target]: 'p' }, black).includes(target), jumps.includes(target));
      assert.equal(destinations(key, { ...kings, d4: 'A', ...blockers, [target]: 'P' }, black).includes(target), false);
    }
    // A three-square leap also crosses an occupied two-square landing square.
    assert.equal(destinations(key, { ...kings, d4: 'A', d5: 'p', d6: 'P', d7: 'p' }, black).includes('d7'), jumps.includes('d7'));
  }
});

test('QZAG keeps all zebra jumps and jumps two or three diagonal squares over either blocker color', () => {
  const key = 'zebra-diagonal-queen';
  for (const black of [false, true]) {
    assert.deepEqual(destinations(key, { ...kings, d4: 'A', ...blockers }, black), [...zebra, ...diagonalJumps].sort());
    for (const target of [...zebra, ...diagonalJumps]) {
      assert.ok(destinations(key, { ...kings, d4: 'A', ...blockers, [target]: 'p' }, black).includes(target));
      assert.ok(!destinations(key, { ...kings, d4: 'A', ...blockers, [target]: 'P' }, black).includes(target));
    }
    for (const blocker of ['p', 'P']) for (const [one, two, three] of [['c3', 'b2', 'a1'], ['e3', 'f2', 'g1'], ['c5', 'b6', 'a7'], ['e5', 'f6', 'g7']]) {
      const actual = destinations(key, { ...kings, d4: 'A', [one]: blocker, [two]: blocker, [three]: 'p' }, black);
      assert.ok(actual.includes(three));
      assert.equal(actual.includes(two), blocker === 'p');
    }
  }
});

test('full QC and QZ retain all eight jumps while QZH also jumps three squares orthogonally', () => {
  for (const [key, jumps] of [['queen-full-camel', camel], ['queen-full-zebra', zebra],
    ['queen-zebra-threeleap', [...zebra, 'a4', 'd1', 'd7', 'g4']]]) for (const black of [false, true]) {
    assert.deepEqual(destinations(key, { ...kings, d4: 'A', ...blockers }, black), [...jumps].sort());
    for (const target of jumps) {
      assert.ok(destinations(key, { ...kings, d4: 'A', ...blockers, [target]: 'p' }, black).includes(target));
      assert.ok(!destinations(key, { ...kings, d4: 'A', ...blockers, [target]: 'P' }, black).includes(target));
    }
    if (key === 'queen-zebra-threeleap') for (const [one, two, three] of [
      ['d5', 'd6', 'd7'], ['d3', 'd2', 'd1'], ['c4', 'b4', 'a4'], ['e4', 'f4', 'g4'],
    ]) for (const blocker of ['p', 'P']) {
      assert.ok(destinations(key, { ...kings, d4: 'A', [one]: blocker, [two]: blocker, [three]: 'p' }, black).includes(three));
    }
  }
});

test('the rook retains ordinary quiet lines and only six knight-capture jumps', () => {
  const key = 'rook-no-tall-back-captures', expected = [...sideKnight, 'c6', 'e6'];
  for (const black of [false, true]) {
    assert.deepEqual(destinations(key, { ...kings, d4: 'A', ...blockers }, black), []);
    for (const target of knight) {
      assert.equal(destinations(key, { ...kings, d4: 'A', ...blockers, [target]: 'p' }, black).includes(target), expected.includes(target));
      assert.ok(!destinations(key, { ...kings, d4: 'A', ...blockers, [target]: 'P' }, black).includes(target));
      assert.ok(destinations('rook-control', { ...kings, d4: 'A', ...blockers, [target]: 'p' }, black).includes(target));
    }
    assert.deepEqual(destinations(key, { ...kings, d4: 'A' }, black), destinations('rook-control', { ...kings, d4: 'A' }, black));
    assert.ok(destinations(key, { ...kings, d4: 'A', d7: 'p' }, black).includes('d7'));
    assert.ok(!destinations(key, { ...kings, d4: 'A', d5: 'P', d7: 'p' }, black).includes('d7'));
    const castle = destinations(key, { a1: 'A', e1: 'K', h1: 'A', e8: 'k' }, black, 'e1', 'KQ');
    assert.ok(castle.includes('g1')); assert.ok(castle.includes('c1'));
    const checkedTransit = destinations(key, { e1: 'K', h1: 'R', e2: 'P', e3: 'a', e8: 'k' }, black, 'e1', 'K');
    assert.ok(!checkedTransit.includes('g1'));
  }
});

test('royal pins still forbid off-file escape jumps for every trial', () => {
  for (const candidate of TRIALS) for (const black of [false, true]) {
    const actual = destinations(candidate.key, { d1: 'K', h7: 'k', d8: 'r', d4: 'A' }, black);
    assert.ok(actual.length); assert.ok(actual.every(target => target[0] === 'd'));
  }
});

test('all 64 shared opening prefixes replay for each candidate in either army', () => {
  const { openings } = require('../experiments/balance/v19-panel-openings.json');
  for (const candidate of TRIALS) for (const opening of openings) for (const black of [false, true]) {
    let start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
    const fields = start.split('/'), rank = black ? 0 : 7, square = candidate.family === 'rook' ? 0 : 3;
    const pieces = fields[rank].split(''); pieces[square] = black ? 'a' : 'A'; fields[rank] = pieces.join('');
    const board = new raw.Board(byKey(candidate.key).variant, fields.join('/') + ' w KQkq - 0 1', false);
    try {
      for (const move of opening.moves) assert.ok(board.push(move), `${candidate.key} ${opening.id} ${move}`);
      legal(byKey(candidate.key), board.fen());
    } finally { board.delete(); }
  }
});

test('native and browser engines agree on all directional, blocker, capture, pin and castling fixtures', { skip: !fs.existsSync(native), timeout: 120000 }, async () => {
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
