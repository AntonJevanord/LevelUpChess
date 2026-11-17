'use strict';

// Rules traversal, movement and value diagnostics; no engine searches or games.
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
const { TRIALS, NEW_DEFINITIONS, revisionProbes } = require('../src/balance-designs-v18-l1-followup');
const ROOT = path.resolve(__dirname, '..');
const native = process.env.FAIRY_STOCKFISH_PATH || path.join(ROOT, 'node_modules/.cache/levelup-native-values/stockfish');
const priors = { knight: [972, 1093], bishop: [1480, 1302], queen: [2771, 2833] };
const profiles = TRIALS.map(row => ({ ...row, variant: `v18-l1-followup-${row.key}` }));
const config = profiles.map(row => `[${row.variant}:chess]\ncustomPiece1 = a:${row.movement}\npieceToCharTable = -\n`
  + `pieceValueMg = a:${priors[row.family][0]}\npieceValueEg = a:${priors[row.family][1]}\n`).join('\n')
  + '\n[v18-l1-mate-positive:chess]\ncustomPiece1 = a:QgQ0\npieceToCharTable = -\n';
const variants = Object.fromEntries(profiles.map(row => [row.key, row.variant]));
const reflect = square => square[0] + (9 - Number(square[1]));
const swap = piece => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase();
const fixtures = new Map();
let raw, directory;
function fen(pieces, black = false, turn = 'w', castling = '-') {
  const map = new Map(Object.entries(pieces).map(([square, piece]) => black ? [reflect(square), swap(piece)] : [square, piece]));
  return `${placementFromMap(map)} ${black ? turn === 'w' ? 'b' : 'w' : turn} ${castling} - 0 1`;
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
const sq = (dx, dy, distance = 1) => {
  const x = 3 + dx * distance, y = 3 + dy * distance;
  return x >= 0 && x < 8 && y >= 0 && y < 8 ? String.fromCharCode(97 + x) + (y + 1) : null;
};
test.before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v18-l1-followup-'));
  const output = path.join(directory, 'raw.cjs');
  await build({ ...rulesBuildOptions(), absWorkingDir: ROOT,
    stdin: { contents: "import Module from 'ffish-es6'; import bytes from 'variant-wasm'; export async function createRaw(config) { const m = await Module({ wasmBinary: Uint8Array.from(atob(bytes), c => c.charCodeAt(0)) }); m.loadVariantConfig(config); return m; }", resolveDir: ROOT, loader: 'js' },
    bundle: true, platform: 'node', format: 'cjs', outfile: output, legalComments: 'none' });
  raw = await require(output).createRaw(config);
  fs.writeFileSync(path.join(directory, 'profiles.ini'), config);
});
test.after(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

test('five new identities and their control links remain outside the playable catalog', () => {
  assert.deepEqual(TRIALS.map(row => row.movement), ['NmQ', 'NmK', 'BgBgmB0', 'BgB0', 'QmDmAmHmGmNmCmZ']);
  assert.equal(NEW_DEFINITIONS.length, 5);
  for (const definition of NEW_DEFINITIONS) {
    assert.deepEqual(getDesign(definition.id), promoted.get(definition.id));
    assert.ok(Object.isFrozen(definition)); assert.ok(Object.isFrozen(definition.roles));
    assert.equal(definition.level, 1); assert.equal(definition.placement, 'replace');
    assert.deepEqual(definition.roles, { pawn: false, castlingRook: false, enPassant: false });
  }
  assert.deepEqual(TRIALS.map(row => row.controlKey), ['positional-control', 'positional-control', 'hopping-control', 'hopping-control', 'baby-amazon-control']);
  assert.equal(getDesign('knight.positional-expanded@1').movement, 'NmR');
  assert.equal(getDesign('queen.advancing-expanded@1').movement, 'QmN');
});

test('quiet queen paths and king steps preserve only ordinary knight captures', () => {
  for (const black of [false, true]) for (const key of ['positional-quiet-queen', 'positional-quiet-king']) {
    let actual = moves(key, { a1: 'K', h7: 'k', d4: 'A', b3: 'p' }, black);
    for (const target of ['c3', 'e3', 'c4', 'e4', 'c5', 'd5', 'e5']) assert.ok(has(actual, 'd4', target, black));
    assert.equal(has(actual, 'd4', 'g7', black), key === 'positional-quiet-queen');
    assert.equal(has(actual, 'd4', 'd7', black), key === 'positional-quiet-queen');
    assert.ok(has(actual, 'd4', 'b3', black));
    for (const occupant of ['p', 'N']) {
      actual = moves(key, { a1: 'K', h7: 'k', d4: 'A', e5: occupant, e4: occupant }, black);
      assert.ok(!has(actual, 'd4', 'e5', black)); assert.ok(!has(actual, 'd4', 'e4', black));
      assert.ok(!has(actual, 'd4', 'f6', black)); assert.ok(!has(actual, 'd4', 'g4', black));
    }
  }
});

test('bishop quiet-range and full-range hops cross exactly one hurdle in all diagonal directions', () => {
  const directions = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
  for (const black of [false, true]) for (const key of ['hopper-quiet-range', 'hopper-full-range']) {
    for (const [dx, dy] of directions) for (const hurdleDistance of [1, 2]) for (const after of [1, 2]) {
      const hurdle = sq(dx, dy, hurdleDistance), target = sq(dx, dy, hurdleDistance + after);
      if (!target) continue;
      for (const occupant of ['N', 'p']) {
        const pieces = { a2: 'K', h7: 'k', d4: 'A', [hurdle]: occupant };
        assert.ok(has(moves(key, pieces, black), 'd4', target, black), `${key}: quiet ${target}`);
        assert.equal(has(moves(key, { ...pieces, [target]: 'p' }, black), 'd4', target, black), key === 'hopper-full-range' || after === 1, `${key}: capture ${target}`);
        assert.ok(!has(moves(key, { ...pieces, [target]: 'N' }, black), 'd4', target, black));
      }
    }
    for (const [dx, dy] of directions) {
      const first = sq(dx, dy), second = sq(dx, dy, 2), third = sq(dx, dy, 3);
      if (!third) continue;
      assert.ok(!has(moves(key, { a2: 'K', h7: 'k', d4: 'A', [first]: 'N', [second]: 'N' }, black), 'd4', third, black));
      assert.ok(!has(moves(key, { a2: 'K', h7: 'k', d4: 'A', [first]: 'N', [second]: 'p', [third]: 'p' }, black), 'd4', third, black));
    }
  }
});

test('Blink queen quietly jumps to every empty local square through a friendly surrounding ring', () => {
  const ring = Object.fromEntries([-1, 0, 1].flatMap(dx => [-1, 0, 1].filter(dy => dx || dy).map(dy => [sq(dx, dy), 'N'])));
  for (const black of [false, true]) {
    const actual = moves('blink-queen', { a1: 'K', h8: 'k', d4: 'A', ...ring }, black);
    for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 2) continue;
      const target = sq(dx, dy);
      if (target === 'a1') continue;
      assert.ok(has(actual, 'd4', target, black), `${dx},${dy}: ${black}`);
    }
    const occupied = moves('blink-queen', { a1: 'K', h8: 'k', d4: 'A', ...ring, g7: 'p', d7: 'p', f5: 'p', g6: 'p' }, black);
    for (const target of ['g7', 'd7', 'f5', 'g6']) assert.ok(!has(occupied, 'd4', target, black));
    const clear = moves('blink-queen', { a1: 'K', h8: 'k', d4: 'A', g7: 'p', d7: 'p' }, black);
    assert.ok(has(clear, 'd4', 'g7', black)); assert.ok(has(clear, 'd4', 'd7', black));
    assert.ok(!has(moves('blink-queen', { a1: 'K', h8: 'k', d4: 'A' }, black), 'd4', 'h6', black));
  }
});

test('checking attacks use capture geometry rather than quiet movement additions', () => {
  const frames = [
    ['positional-quiet-queen', 'g7', {}, false], ['positional-quiet-king', 'e5', {}, false],
    ['positional-quiet-queen', 'f5', {}, true], ['positional-quiet-king', 'f5', {}, true],
    ['hopper-quiet-range', 'f6', { e5: 'N' }, true], ['hopper-quiet-range', 'g7', { e5: 'N' }, false],
    ['hopper-full-range', 'g7', { e5: 'N' }, true], ['hopper-full-range', 'g7', { e5: 'N', f6: 'N' }, false],
    ['blink-queen', 'f5', {}, false], ['blink-queen', 'g7', { e5: 'N' }, false],
    ['blink-queen', 'g7', {}, true], ['blink-queen', 'd7', {}, true],
  ];
  for (const black of [false, true]) for (const [key, target, hurdles, expected] of frames) {
    const position = fen({ a1: 'K', [target]: 'k', d4: 'A', ...hurdles }, black, 'b'), variant = variants[key];
    fixtures.set(`${variant}:${position}`, { variant, fen: position });
    const board = new raw.Board(variant, position, false);
    try { assert.equal(board.isCheck(), expected, `${key}: ${target}: ${black}`); }
    finally { board.delete(); }
  }
});

function mateInTwo(board) {
  for (const first of board.legalMoves().split(' ').filter(Boolean)) {
    assert.ok(board.push(first));
    const replies = board.legalMoves().split(' ').filter(Boolean);
    if (!replies.length && board.isCheck()) { board.pop(); return first; }
    let forced = replies.length > 0;
    for (const reply of replies) {
      assert.ok(board.push(reply));
      let mate = false;
      for (const finish of board.legalMoves().split(' ').filter(Boolean)) {
        assert.ok(board.push(finish));
        mate = board.isCheck() && board.numberLegalMoves() === 0;
        board.pop(); if (mate) break;
      }
      board.pop(); if (!mate) { forced = false; break; }
    }
    board.pop(); if (forced) return first;
  }
  return null;
}
function startPieces(family) {
  const pieces = { a1: 'R', b1: 'N', c1: 'B', d1: 'Q', e1: 'K', f1: 'B', g1: 'N', h1: 'R',
    a8: 'r', b8: 'n', c8: 'b', d8: 'q', e8: 'k', f8: 'b', g8: 'n', h8: 'r' };
  for (const file of 'abcdefgh') { pieces[file + '2'] = 'P'; pieces[file + '7'] = 'p'; }
  for (const square of { knight: ['b1', 'g1'], bishop: ['c1', 'f1'], queen: ['d1'] }[family]) pieces[square] = 'A';
  return pieces;
}

test('ordinary starting purchases have no forced mate in two for either color', () => {
  for (const row of profiles) for (const black of [false, true]) {
    const position = fen(startPieces(row.family), black, 'w', 'KQkq');
    fixtures.set(`${row.variant}:${position}`, { variant: row.variant, fen: position });
    const board = new raw.Board(row.variant, position, false);
    try { assert.equal(mateInTwo(board), null, row.movement + ': ' + black); }
    finally { board.delete(); }
  }
  const positive = new raw.Board('v18-l1-mate-positive', fen(startPieces('queen'), false, 'w', 'KQkq'), false);
  try { assert.notEqual(mateInTwo(positive), null); }
  finally { positive.delete(); }
});

test('preflight frames use actual allocated letters and both physical colors', () => {
  const definitionsByLetter = Object.fromEntries(NEW_DEFINITIONS.map((definition, index) => [['h', 'i', 'j', 'l', 'm'][index], definition]));
  const probes = revisionProbes({ definitionsByLetter });
  assert.equal(probes.length, 50); assert.equal(probes.filter(probe => probe.name.includes(': Black ')).length, 25);
  assert.ok(probes.some(probe => probe.fen.split(' ')[0].includes('M')));
  assert.equal(revisionProbes({ definitionsByLetter: {} }).length, 0);
});

test('all allocated preflight frames pass the actual match wrapper inactive-king validation', async () => {
  const { ensureResearchOverlay } = require('../scripts/balance/research-overlay');
  const overlay = ensureResearchOverlay({ name: 'v18-l1-followup-probe-validity-test',
    entryFile: 'scripts/v18-balance.js', definitionFile: 'src/balance-designs-v18-screen.js' });
  const { createDesignRegistry } = require(path.join(overlay.directory, 'scripts/balance/design-registry'));
  const { compileDesignProfile } = require(path.join(overlay.directory, 'scripts/balance/design-profile'));
  const homes = { knight: 'b1', bishop: 'c1', queen: 'd1' };
  const registry = createDesignRegistry({ schemaVersion: 3,
    comparisons: TRIALS.map(trial => ({ armyA: { upgrades: { [homes[trial.family]]: trial.id } }, armyB: { upgrades: {} } })) });
  const profile = compileDesignProfile(registry);
  const { createMatchRules } = require('../dist/balance-rules.cjs');
  const rules = await createMatchRules({ profile });
  const probes = revisionProbes(profile);
  assert.equal(probes.length, 50);
  for (const probe of probes) {
    const board = rules.createBoard(probe.fen);
    try { assert.ok(Array.isArray(board.moves()), probe.name); }
    finally { board.dispose(); }
  }
  const allocation = profile.registry.allocations.find(row => row.id === TRIALS[0].id);
  const invalid = fen({ a2: 'K', h7: 'k', d4: allocation.letter.toUpperCase(), e5: 'N', f6: 'N', g7: 'p' });
  assert.throws(() => rules.createBoard(invalid), /position|check|FEN/i,
    'The old fixture must fail because the nonmoving Black king is attacked by the f6 knight.');
});

test('native and browser fixtures agree and all six tables retain the shared family priors', { skip: !fs.existsSync(native), timeout: 180000 }, async t => {
  for (const row of profiles) {
    const engine = new UciEngine({ path: native, variantPath: path.join(directory, 'profiles.ini'), variant: row.variant, options: { threads: 1, hash: 16 } });
    t.after(() => engine.close()); await engine.start();
    const tables = await engine.pieceValues(); assert.deepEqual(tables.pieces.a, tables.pieces.A);
    for (const field of ['rawMg', 'captureMg', 'evalMg']) assert.equal(tables.pieces.a[field], priors[row.family][0]);
    for (const field of ['rawEg', 'captureEg', 'evalEg']) assert.equal(tables.pieces.a[field], priors[row.family][1]);
    for (const fixture of fixtures.values()) if (fixture.variant === row.variant) assert.deepEqual(await engine.perft({ fen: fixture.fen }), allMoves(row.variant, fixture.fen, false), row.movement + ': ' + fixture.fen);
    await engine.close();
  }
  t.diagnostic(`${fixtures.size} native/browser fixture positions; no searches or scored games.`);
});
