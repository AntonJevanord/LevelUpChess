'use strict';

// Rules and valuation diagnostics only: no search or scored match games.
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
const { LEVEL1_TRIALS, LEVEL2_TRIALS, NEW_DEFINITIONS, revisionProbes } = require('../src/balance-designs-v18-queen-screen');

const ROOT = path.resolve(__dirname, '..');
const native = process.env.FAIRY_STOCKFISH_PATH || path.join(ROOT, 'node_modules/.cache/levelup-native-values/stockfish');
const cases = [...LEVEL1_TRIALS, ...LEVEL2_TRIALS].map(row => ({ ...row, variant: `v18-queen-screen-${row.key}`,
  values: row.level === 1 ? [2771, 2833] : [3738, 4155] }));
const ordinary = { key: 'ordinary', variant: 'v18-queen-screen-ordinary', movement: 'Q', values: [2771, 2833] };
const rejected = { key: 'rejected', variant: 'v18-queen-screen-rejected-mate', movement: 'QgQ0', values: [2771, 2833] };
const config = [...cases, ordinary, rejected].map(row => `[${row.variant}:chess]\ncustomPiece1 = a:${row.movement}\npieceToCharTable = -\npieceValueMg = a:${row.values[0]}\npieceValueEg = a:${row.values[1]}\n`).join('\n');
const knight = ['b3', 'b5', 'c2', 'c6', 'e2', 'e6', 'f3', 'f5'];
const camel = ['a3', 'a5', 'c1', 'c7', 'e1', 'e7', 'g3', 'g5'];
const subsets = { 'queen-camel-capture': camel, 'queen-forward-knight': ['c6', 'e6'],
  'queen-forward-half-knight': ['b5', 'c6', 'e6', 'f5'],
  'queen-side-knight': ['b3', 'b5', 'f3', 'f5'], 'queen-tall-knight': ['c2', 'c6', 'e2', 'e6'] };
const kings = { a1: 'K', h7: 'k' };
const reflect = square => square[0] + (9 - Number(square[1]));
const swap = piece => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase();
const fixtures = new Map();
let directory, raw;

function fen(pieces, black = false, turn = 'w', rights = '-') {
  const map = new Map(Object.entries(pieces).map(([square, piece]) => black ? [reflect(square), swap(piece)] : [square, piece]));
  return `${placementFromMap(map)} ${black ? turn === 'w' ? 'b' : 'w' : turn} ${rights} - 0 1`;
}
function allMoves(row, position, remember = true) {
  if (remember) fixtures.set(`${row.variant}:${position}`, { variant: row.variant, fen: position });
  const board = new raw.Board(row.variant, position, false);
  try { return board.legalMoves().split(' ').filter(Boolean).sort(); }
  finally { board.delete(); }
}
function moves(row, pieces, black = false, origin = 'd4') {
  return allMoves(row, fen(pieces, black)).filter(move => move.startsWith(black ? reflect(origin) : origin));
}
const has = (actual, target, black = false) => actual.includes((black ? reflect('d4') + reflect(target) : 'd4' + target));

test.before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v18-queen-screen-'));
  const output = path.join(directory, 'raw.cjs');
  await build({ ...rulesBuildOptions(), absWorkingDir: ROOT,
    stdin: { contents: "import Module from 'ffish-es6'; import bytes from 'variant-wasm'; export async function createRaw(config) { const m = await Module({ wasmBinary: Uint8Array.from(atob(bytes), c => c.charCodeAt(0)) }); m.loadVariantConfig(config); return m; }", resolveDir: ROOT, loader: 'js' },
    bundle: true, platform: 'node', format: 'cjs', outfile: output, legalComments: 'none' });
  raw = await require(output).createRaw(config);
  fs.writeFileSync(path.join(directory, 'profiles.ini'), config);
});
test.after(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

test('five immutable tiered research identities leave historical queens outside the extension', () => {
  assert.deepEqual(NEW_DEFINITIONS.map(row => [row.id, row.level, row.movement]), [
    ['queen.level1-camel-capture@1', 1, 'QcC'], ['queen.level1-forward-knight@1', 1, 'QfN'],
    ['queen.level1-forward-half-knight@1', 1, 'QfhN'],
    ['queen.level2-side-knight@1', 2, 'QsN'], ['queen.level2-tall-knight@1', 2, 'QvN'],
  ]);
  assert.ok(Object.isFrozen(LEVEL1_TRIALS)); assert.ok(Object.isFrozen(LEVEL2_TRIALS));
  for (const definition of NEW_DEFINITIONS) {
    assert.equal(getDesign(definition.id), undefined); assert.ok(Object.isFrozen(definition));
    assert.ok(Object.isFrozen(definition.roles)); assert.equal(definition.placement, 'replace');
    assert.deepEqual(definition.roles, { pawn: false, castlingRook: false, enPassant: false });
  }
  for (const trial of [...LEVEL1_TRIALS, ...LEVEL2_TRIALS]) {
    assert.ok(Object.isFrozen(trial)); assert.equal(trial.family, 'queen');
    assert.equal(trial.anchorId, trial.level === 1 ? 'queen.blue@2' : 'queen.orange@2');
    assert.equal(trial.controlKey, trial.level === 1 ? 'baby-amazon-control' : 'box-control');
  }
  assert.equal(getDesign('queen.purple@1').movement, 'QN');
  assert.equal(getDesign('queen.orange@2').movement, 'QmHmCmZmG');
});

test('quiet geometry retains every queen ray and adds only the declared directional knight subset', () => {
  for (const black of [false, true]) {
    const pieces = { ...kings, d4: 'A' }, baseline = moves(ordinary, pieces, black);
    const s = black ? reflect : square => square;
    for (const row of cases) {
      const expected = row.movement === 'QcC' ? [] : subsets[row.key].map(target => s('d4') + s(target));
      assert.deepEqual(moves(row, pieces, black), [...baseline, ...expected].sort(), row.movement + ': ' + black);
    }
  }
});

test('camel captures and directional knight captures reject empty-only or friendly landings correctly', () => {
  for (const black of [false, true]) for (const row of cases) for (const target of [...knight, ...camel]) {
    const supported = subsets[row.key].includes(target);
    const clear = moves(row, { ...kings, d4: 'A' }, black);
    assert.equal(has(clear, target, black), supported && row.movement !== 'QcC');
    assert.equal(has(moves(row, { ...kings, d4: 'A', [target]: 'b' }, black), target, black), supported);
    const friendly = ['c2', 'f5'].includes(target) ? 'P' : 'B';
    assert.equal(has(moves(row, { ...kings, d4: 'A', [target]: friendly }, black), target, black), false);
  }
});

test('queen rays stop at blockers while selective leaps ignore every intermediate square', () => {
  const blockers = { c3: 'P', d3: 'P', e3: 'P', c4: 'P', e4: 'P', c5: 'P', d5: 'P', e5: 'P' };
  for (const black of [false, true]) for (const row of cases) {
    const pieces = { ...kings, d4: 'A', ...blockers };
    assert.deepEqual(moves(ordinary, pieces, black), []);
    const s = black ? reflect : square => square;
    const quiet = row.movement === 'QcC' ? [] : subsets[row.key].map(target => s('d4') + s(target)).sort();
    assert.deepEqual(moves(row, pieces, black), quiet);
    for (const target of subsets[row.key]) assert.ok(has(moves(row, { ...pieces, [target]: 'b' }, black), target, black));
  }
  const rays = ['d6', 'f4', 'd2', 'b4', 'f6', 'f2', 'b2', 'b6'];
  for (const black of [false, true]) for (const target of rays) for (const row of cases) {
    assert.ok(has(moves(row, { ...kings, d4: 'A', [target]: 'b' }, black), target, black));
    assert.ok(!has(moves(row, { ...kings, d4: 'A', [target]: 'B' }, black), target, black));
  }
});

test('capture geometry alone gives check and queen safety remains nonroyal under pins and evasions', () => {
  for (const black of [false, true]) for (const row of cases) {
    for (const target of [...knight, ...camel, 'd6', 'f6']) {
      const position = fen({ a1: 'K', d4: 'A', [target]: 'k' }, black, 'b');
      fixtures.set(`${row.variant}:${position}`, { variant: row.variant, fen: position });
      const board = new raw.Board(row.variant, position, false);
      try { assert.equal(board.isCheck(), subsets[row.key].includes(target) || ['d6', 'f6'].includes(target), row.movement + ': ' + target); }
      finally { board.delete(); }
    }
    for (const [pieces, origin] of [
      [{ d1: 'K', h7: 'k', d8: 'r', d4: 'A' }, 'd4'],
      [{ a1: 'K', h7: 'k', a8: 'r', d4: 'A' }, 'd4'],
    ]) assert.deepEqual(moves(row, pieces, black, origin), moves(ordinary, pieces, black, origin));
    assert.ok(has(moves(row, { ...kings, d4: 'A', e8: 'r' }, black), 'e4', black), 'nonroyal queen may enter a rook attack');
  }
});

test('all fifty allocated campaign preflight positions pass actual wrapper king-safety validation', async () => {
  const { ensureResearchOverlay } = require('../scripts/balance/research-overlay');
  const overlay = ensureResearchOverlay({ name: 'v18-queen-screen-probe-test', entryFile: 'scripts/v18-balance.js',
    definitionFile: 'src/balance-designs-v18-queen-screen.js' });
  const { createDesignRegistry } = require(path.join(overlay.directory, 'scripts/balance/design-registry'));
  const { compileDesignProfile } = require(path.join(overlay.directory, 'scripts/balance/design-profile'));
  const registry = createDesignRegistry({ schemaVersion: 3,
    comparisons: cases.map(row => ({ armyA: { upgrades: { d1: row.id } }, armyB: { upgrades: {} } })) });
  const profile = compileDesignProfile(registry), probes = revisionProbes(profile);
  assert.equal(probes.length, 50); assert.equal(probes.filter(row => row.name.includes(': Black ')).length, 25);
  const { createMatchRules } = require('../dist/balance-rules.cjs');
  const rules = await createMatchRules({ profile });
  for (const probe of probes) {
    const board = rules.createBoard(probe.fen);
    try { assert.ok(Array.isArray(board.moves()), probe.name); }
    finally { board.dispose(); }
  }
  assert.deepEqual(revisionProbes({ definitionsByLetter: {} }), []);
});

function mateInTwo(board) {
  for (const first of board.legalMoves().split(' ').filter(Boolean)) {
    assert.ok(board.push(first));
    const replies = board.legalMoves().split(' ').filter(Boolean);
    if (!replies.length && board.isCheck()) { board.pop(); return first; }
    let forced = replies.length > 0;
    for (const reply of replies) {
      assert.ok(board.push(reply)); let mate = false;
      for (const finish of board.legalMoves().split(' ').filter(Boolean)) {
        assert.ok(board.push(finish)); mate = board.isCheck() && board.numberLegalMoves() === 0;
        board.pop(); if (mate) break;
      }
      board.pop(); if (!mate) { forced = false; break; }
    }
    board.pop(); if (forced) return first;
  }
  return null;
}

test('ordinary starting queen purchases have no forced mate in two in either color', () => {
  const start = { a1: 'R', b1: 'N', c1: 'B', d1: 'A', e1: 'K', f1: 'B', g1: 'N', h1: 'R',
    a8: 'r', b8: 'n', c8: 'b', d8: 'q', e8: 'k', f8: 'b', g8: 'n', h8: 'r' };
  for (const file of 'abcdefgh') { start[file + '2'] = 'P'; start[file + '7'] = 'p'; }
  for (const row of [...cases, rejected]) for (const black of [false, true]) {
    const position = fen(start, black, 'w', 'KQkq');
    const board = new raw.Board(row.variant, position, false);
    if (row !== rejected) fixtures.set(`${row.variant}:${position}`, { variant: row.variant, fen: position });
    try { assert.equal(mateInTwo(board) !== null, row === rejected, row.movement + ': ' + black); }
    finally { board.delete(); }
  }
});

test('native/browser move diagnostics agree and tier priors fill all six value tables for both colors',
  { skip: !fs.existsSync(native), timeout: 180000 }, async t => {
    let compared = 0;
    for (const row of cases) {
      const engine = new UciEngine({ path: native, variantPath: path.join(directory, 'profiles.ini'), variant: row.variant, options: { threads: 1, hash: 16 } });
      t.after(() => engine.close()); await engine.start();
      const tables = await engine.pieceValues(); assert.deepEqual(tables.pieces.a, tables.pieces.A);
      for (const field of ['rawMg', 'captureMg', 'evalMg']) assert.equal(tables.pieces.a[field], row.values[0]);
      for (const field of ['rawEg', 'captureEg', 'evalEg']) assert.equal(tables.pieces.a[field], row.values[1]);
      for (const fixture of fixtures.values()) if (fixture.variant === row.variant) {
        assert.deepEqual(await engine.perft({ fen: fixture.fen }), allMoves(row, fixture.fen, false), row.movement + ': ' + fixture.fen);
        compared++;
      }
      await engine.close();
    }
    t.diagnostic(`${compared} native/browser positions; no engine searches or scored games.`);
  });
