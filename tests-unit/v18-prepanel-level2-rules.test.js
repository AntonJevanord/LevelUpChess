'use strict';

// Geometry/value diagnostics only. No searches, scored games or catalog edits.
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
const { TRIALS, NEW_DEFINITIONS, revisionProbes } = require('../src/balance-designs-v18-prepanel-level2');

const ROOT = path.resolve(__dirname, '..');
const native = process.env.FAIRY_STOCKFISH_PATH || path.join(ROOT, 'node_modules/.cache/levelup-native-values/stockfish');
const profiles = TRIALS.map(trial => ({ ...trial, variant: `v18-prepanel-${trial.key}` }));
const values = trial => trial.family === 'knight' ? [1203, 1352] : [1782, 1756];
const config = profiles.map(trial => `[${trial.variant}:chess]\ncustomPiece1 = a:${trial.movement}\npieceToCharTable = -\npieceValueMg = a:${values(trial)[0]}\npieceValueEg = a:${values(trial)[1]}\n`).join('\n');
const knight = ['b3', 'b5', 'c2', 'c6', 'e2', 'e6', 'f3', 'f5', 'b4', 'd2', 'd6', 'f4'];
const diagonal = ['a1', 'b2', 'c3', 'e5', 'f6', 'g7', 'h8', 'c5', 'b6', 'a7', 'e3', 'f2', 'g1'];
const orthogonalSteps = ['c4', 'd3', 'd5', 'e4'];
const diagonalSteps = ['c3', 'c5', 'e3', 'e5'];
const expected = {
  NDmW: [...knight, ...orthogonalSteps], NDmF: [...knight, ...diagonalSteps],
  BsW2: [...diagonal, 'b4', 'c4', 'e4', 'f4'],
  BsWsnN: [...diagonal, 'c4', 'e4', 'b3', 'b5', 'f3', 'f5'],
  BsW3: [...diagonal, 'a4', 'b4', 'c4', 'e4', 'f4', 'g4'],
};
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
function moves(trial, pieces, black = false, origin = 'd4') {
  return allMoves(trial.variant, fen(pieces, black)).filter(move => move.startsWith(black ? reflect(origin) : origin));
}
const has = (actual, from, to, black = false) => actual.includes((black ? reflect(from) : from) + (black ? reflect(to) : to));
const base = { h1: 'K', a8: 'k', d4: 'A' };
const occupant = (square, enemy = false) => {
  const piece = ['1', '8'].includes(square[1]) ? 'N' : 'P';
  return enemy ? piece.toLowerCase() : piece;
};

test.before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v18-prepanel-level2-'));
  const output = path.join(directory, 'raw.cjs');
  await build({ ...rulesBuildOptions(), absWorkingDir: ROOT,
    stdin: { contents: "import Module from 'ffish-es6'; import bytes from 'variant-wasm'; export async function createRaw(config) { const m = await Module({ wasmBinary: Uint8Array.from(atob(bytes), c => c.charCodeAt(0)) }); m.loadVariantConfig(config); return m; }", resolveDir: ROOT, loader: 'js' },
    bundle: true, platform: 'node', format: 'cjs', outfile: output, legalComments: 'none' });
  raw = await require(output).createRaw(config);
  fs.writeFileSync(path.join(directory, 'profile.ini'), config);
});
test.after(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

test('five new level-two bodies stay immutable and outside the playable catalog', () => {
  assert.deepEqual(TRIALS.map(trial => trial.movement), ['NDmW', 'NDmF', 'BsW2', 'BsWsnN', 'BsW3']);
  assert.ok(Object.isFrozen(TRIALS)); assert.ok(Object.isFrozen(NEW_DEFINITIONS));
  for (const [index, trial] of TRIALS.entries()) {
    assert.equal(getDesign(trial.id), undefined); assert.ok(Object.isFrozen(trial));
    assert.equal(trial.anchorId, trial.family === 'knight' ? 'knight.orange@3' : 'bishop.orange@3');
    assert.equal(trial.controlKey, trial.family === 'knight' ? 'ndmk-control' : 'free-boar-control');
    const definition = NEW_DEFINITIONS[index];
    assert.equal(definition.id, trial.id); assert.equal(definition.level, 2); assert.equal(definition.placement, 'replace');
    assert.deepEqual(definition.roles, { pawn: false, castlingRook: false, enPassant: false });
    assert.ok(Object.isFrozen(definition)); assert.ok(Object.isFrozen(definition.roles));
  }
  assert.equal(getDesign('bishop.purple@13').movement, 'BsR2nsN');
});

test('open positions have exactly the declared quiet geometry in both physical colors', () => {
  for (const trial of profiles) for (const black of [false, true]) {
    const s = black ? reflect : square => square;
    assert.deepEqual(moves(trial, base, black), expected[trial.movement].map(target => s('d4') + s(target)).sort(), trial.movement);
  }
});

test('enemy and friendly landing tests distinguish quiet knight steps from full bishop movement', () => {
  for (const trial of profiles) for (const black of [false, true]) for (const target of expected[trial.movement]) {
    for (const enemy of [false, true]) {
      const actual = moves(trial, { ...base, [target]: occupant(target, enemy) }, black);
      const captures = trial.family !== 'knight' || knight.includes(target);
      assert.equal(has(actual, 'd4', target, black), enemy && captures, trial.movement + ': ' + target);
    }
  }
});

test('D leaps ignore transit blockers while quiet W/F steps never capture neighboring enemies', () => {
  for (const trial of profiles.filter(row => row.family === 'knight')) for (const black of [false, true]) {
    for (const [target, transit] of [['b4', 'c4'], ['f4', 'e4'], ['d2', 'd3'], ['d6', 'd5']]) for (const piece of ['p', 'P']) {
      const actual = moves(trial, { ...base, [transit]: piece }, black);
      assert.ok(has(actual, 'd4', target, black)); assert.ok(!has(actual, 'd4', transit, black));
    }
    for (const target of [...orthogonalSteps, ...diagonalSteps]) {
      assert.ok(!has(moves(trial, { ...base, [target]: 'p' }, black), 'd4', target, black));
    }
  }
});

test('sideways W2/W3 require every intervening square and stop on their first capture', () => {
  for (const trial of profiles.filter(row => ['BsW2', 'BsW3'].includes(row.movement))) for (const black of [false, true]) {
    for (const [first, second, third] of [['c4', 'b4', 'a4'], ['e4', 'f4', 'g4']]) {
      for (const piece of ['p', 'P']) {
        const actual = moves(trial, { ...base, [first]: piece }, black);
        assert.equal(has(actual, 'd4', first, black), piece === 'p');
        assert.ok(!has(actual, 'd4', second, black)); assert.ok(!has(actual, 'd4', third, black));
      }
      const secondBlocked = moves(trial, { ...base, [second]: 'p' }, black);
      assert.ok(has(secondBlocked, 'd4', first, black)); assert.ok(has(secondBlocked, 'd4', second, black));
      assert.ok(!has(secondBlocked, 'd4', third, black));
      assert.equal(has(moves(trial, base, black), 'd4', third, black), trial.movement === 'BsW3');
    }
    for (const piece of ['p', 'P']) {
      const diagonalBlocked = moves(trial, { ...base, c5: piece }, black);
      assert.equal(has(diagonalBlocked, 'd4', 'c5', black), piece === 'p');
      assert.ok(!has(diagonalBlocked, 'd4', 'b6', black)); assert.ok(!has(diagonalBlocked, 'd4', 'a7', black));
    }
  }
});

test('lame wide knight uses the first sideways leg but ignores the second sideways square', () => {
  const trial = profiles.find(row => row.movement === 'BsWsnN');
  for (const black of [false, true]) for (const [first, second, targets] of [['c4', 'b4', ['b3', 'b5']], ['e4', 'f4', ['f3', 'f5']]]) {
    for (const piece of ['p', 'P']) {
      const firstBlocked = moves(trial, { ...base, [first]: piece }, black);
      for (const target of targets) assert.ok(!has(firstBlocked, 'd4', target, black));
      const secondBlocked = moves(trial, { ...base, [second]: piece }, black);
      for (const target of targets) assert.ok(has(secondBlocked, 'd4', target, black));
    }
    assert.ok(!has(moves(trial, base, black), 'd4', second, black));
  }
});

test('king safety constrains pins and evasions while the purchased bodies remain nonroyal', () => {
  for (const trial of profiles) for (const black of [false, true]) {
    const s = black ? reflect : square => square;
    const expectedPin = trial.movement === 'NDmW' ? ['e2', 'e4', 'e5'] : trial.movement === 'NDmF' ? ['e5'] : [];
    assert.deepEqual(moves(trial, { e1: 'K', h7: 'k', e8: 'r', e3: 'A' }, black, 'e3'), expectedPin.map(target => s('e3') + s(target)).sort());
    const evasions = trial.movement === 'NDmW' ? ['e2', 'e4', 'e6'] : trial.movement === 'NDmF' ? ['e2', 'e3', 'e5', 'e6'] : ['e3', 'e4', 'e5'];
    assert.deepEqual(moves(trial, { e1: 'K', h7: 'k', e8: 'r', d4: 'A' }, black), evasions.map(target => s('d4') + s(target)).sort());
    const target = trial.family === 'knight' ? 'f5' : 'g7';
    assert.ok(has(moves(trial, { ...base, [target[0] + '8']: 'r' }, black), 'd4', target, black));
  }
});

test('checking attacks omit quiet steps and respect the blocked-knight leg', () => {
  for (const trial of profiles) for (const black of [false, true]) {
    const frames = trial.family === 'knight'
      ? [['d5', {}, false], ['e5', {}, false], ['d6', {}, true], ['f5', {}, true]]
      : [['d5', {}, false], ['e5', {}, true], ['f4', {}, trial.movement !== 'BsWsnN'],
        ['f5', {}, trial.movement === 'BsWsnN'], ['f5', { e4: 'N' }, false],
        ['f5', { f4: 'P' }, trial.movement === 'BsWsnN']];
    for (const [target, blockers, expectedCheck] of frames) {
      const position = fen({ h1: 'K', [target]: 'k', d4: 'A', ...blockers }, black, 'b');
      fixtures.set(`${trial.variant}:${position}`, { variant: trial.variant, fen: position });
      const board = new raw.Board(trial.variant, position, false);
      try { assert.equal(board.isCheck(), expectedCheck, trial.movement + ': ' + target); }
      finally { board.delete(); }
    }
  }
});

test('all allocated preflight frames are valid through actual match-wrapper king validation', async () => {
  const { ensureResearchOverlay } = require('../scripts/balance/research-overlay');
  const overlay = ensureResearchOverlay({ name: 'v18-prepanel-level2-probe-test', entryFile: 'scripts/v18-balance.js', definitionFile: 'src/balance-designs-v18-prepanel-level2.js' });
  const { createDesignRegistry } = require(path.join(overlay.directory, 'scripts/balance/design-registry'));
  const { compileDesignProfile } = require(path.join(overlay.directory, 'scripts/balance/design-profile'));
  const registry = createDesignRegistry({ schemaVersion: 3, comparisons: TRIALS.map(trial => ({ armyA: { upgrades: { [trial.family === 'knight' ? 'b1' : 'c1']: trial.id } }, armyB: { upgrades: {} } })) });
  const profile = compileDesignProfile(registry);
  const { createMatchRules } = require('../dist/balance-rules.cjs');
  const rules = await createMatchRules({ profile });
  const probes = revisionProbes(profile);
  assert.equal(probes.length, 60); assert.equal(probes.filter(row => row.name.includes(': Black ')).length, 30);
  assert.equal(revisionProbes({ definitionsByLetter: {} }).length, 0);
  for (const probe of probes) {
    const board = rules.createBoard(probe.fen);
    try { assert.ok(Array.isArray(board.moves()), probe.name); }
    finally { board.dispose(); }
  }
});

test('native/browser diagnostics agree and both colors receive the controlled family values in all six tables', { skip: !fs.existsSync(native), timeout: 180000 }, async t => {
  for (const trial of profiles) {
    const engine = new UciEngine({ path: native, variantPath: path.join(directory, 'profile.ini'), variant: trial.variant, options: { threads: 1, hash: 16 } });
    t.after(() => engine.close()); await engine.start();
    const tables = await engine.pieceValues(); assert.deepEqual(tables.pieces.a, tables.pieces.A);
    const [mg, eg] = values(trial);
    for (const field of ['rawMg', 'captureMg', 'evalMg']) assert.equal(tables.pieces.a[field], mg);
    for (const field of ['rawEg', 'captureEg', 'evalEg']) assert.equal(tables.pieces.a[field], eg);
    for (const fixture of fixtures.values()) if (fixture.variant === trial.variant) {
      assert.deepEqual(await engine.perft({ fen: fixture.fen }), allMoves(trial.variant, fixture.fen, false), trial.movement + ': ' + fixture.fen);
    }
    await engine.close();
  }
  t.diagnostic(`${fixtures.size} native/browser fixture positions; no searches or scored games.`);
});
