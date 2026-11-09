'use strict';

// Movement inspection uses a separate WASM module and never plays a real move.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { Chess } = require('chess.js');
const { rulesBuildOptions } = require('../scripts/rules-build');
const { PLAYABLE_LIBRARIES } = require('../src/playable-library');
const { getPlayableProfiles } = require('../scripts/playable-profile');
const { placementFromMap } = require('../src/profile-fen');

const root = path.resolve(__dirname, '..');
const index = PLAYABLE_LIBRARIES.findIndex(row => row.id === 'v18-roster-confirmed');
const profile = getPlayableProfiles()[index];
const type = id => profile.registry.allocations.find(row => row.id === id).letter.toUpperCase();
const reflect = square => square[0] + (9 - Number(square[1]));
const swap = value => value === value.toUpperCase() ? value.toLowerCase() : value.toUpperCase();
let directory, api;
function fen(pieces, black = false, turn = black ? 'b' : 'w', rights = '-', ep = '-') {
  const board = new Map(Object.entries(pieces).map(([square, piece]) => black ? [reflect(square), swap(piece)] : [square, piece]));
  return `${placementFromMap(board)} ${turn} ${black ? rights.toLowerCase() : rights} ${black && ep !== '-' ? reflect(ep) : ep} 0 1`;
}
function variant(t, pieces, black = false, name = profile.variant) {
  const game = new api.VariantGame(fen(pieces, black), name); t.after(() => game.dispose()); return game;
}
function includes(value, key, squares) { for (const square of squares) assert.ok(value[key].includes(square), `${key} includes ${square}`); }
function excludes(value, key, squares) { for (const square of squares) assert.ok(!value[key].includes(square), `${key} excludes ${square}`); }
test.before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-piece-guide-'));
  const outfile = path.join(directory, 'api.cjs');
  await build({ ...rulesBuildOptions(), absWorkingDir: root, bundle: true, platform: 'node', format: 'cjs', outfile,
    stdin: { contents: "export * from './src/piece-guide.js'; export { VariantGame, initVariantRules } from './src/variant-game.js';", resolveDir: root, loader: 'js' } });
  api = require(outfile);
  await api.initVariantRules(profile.variant);
  await api.initVariantRules('levelup-knight');
  await api.initVariantRules('levelup-v5');
});
test.after(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

test('ordinary pawn inspection separates quiet movement from empty-square capture abilities for both colors', async () => {
  for (const black of [false, true]) {
    const game = new Chess(fen({ a1: 'K', h7: 'k', d4: 'P' }, black));
    const s = black ? reflect : square => square;
    const guide = await api.getPieceGuide(game, { square: s('d4') });
    assert.deepEqual(guide.quiet, [s('d5')]);
    assert.deepEqual(guide.capture, [s('c5'), s('e5')].sort());
    assert.deepEqual(guide.legal, [s('d5')]);
    assert.equal(guide.color, black ? 'b' : 'w');
  }
});

test('off-turn enemy pieces can be inspected without inventing real legal moves', async () => {
  const game = new Chess(fen({ a1: 'K', h7: 'k', d4: 'p' }));
  const before = game.fen(), history = game.history();
  const guide = await api.getPieceGuide(game, { square: 'd4' });
  assert.deepEqual(guide.quiet, ['d3']); assert.deepEqual(guide.capture, ['c3', 'e3']);
  assert.deepEqual(guide.legal, []); assert.equal(game.fen(), before); assert.deepEqual(game.history(), history);
});

test('pinned pieces retain their ability map while real king safety still restricts legal moves', async () => {
  const game = new Chess('4r2k/8/8/8/8/8/4R3/4K3 w - - 0 1');
  const guide = await api.getPieceGuide(game, { square: 'e2' });
  includes(guide, 'quiet', ['a2', 'h2', 'e3']); includes(guide, 'capture', ['a2', 'h2', 'e8']);
  excludes(guide, 'legal', ['a2', 'h2']); includes(guide, 'legal', ['e3', 'e8']);
  assert.equal(game.fen(), guide.fen);
  assert.throws(() => game.move({ from: 'e2', to: 'a2' }));
});

test('legacy quiet-only knight steps and ordinary knight jumps retain different capture abilities', async t => {
  for (const black of [false, true]) {
    const game = variant(t, { a1: 'K', h7: 'k', d4: 'E' }, black, 'levelup-knight');
    const s = black ? reflect : square => square;
    const guide = await api.getPieceGuide(game, { square: s('d4') });
    includes(guide, 'quiet', ['d5', 'e4', 'c4', 'd3', 'f5'].map(s));
    excludes(guide, 'capture', ['d5', 'e4', 'c4', 'd3'].map(s));
    includes(guide, 'capture', ['f5', 'f3', 'b5', 'b3'].map(s));
  }
});

test('legacy capture-only knight components show empty capture destinations without quiet dots', async t => {
  for (const black of [false, true]) {
    const game = variant(t, { a1: 'K', h7: 'k', d4: 'I' }, black, 'levelup-v5');
    const s = black ? reflect : square => square;
    const guide = await api.getPieceGuide(game, { square: s('d4') });
    includes(guide, 'capture', ['c6', 'e6'].map(s));
    excludes(guide, 'quiet', ['c6', 'e6'].map(s));
    for (const key of ['quiet', 'capture']) includes(guide, key, ['e5', 'c5', 'e3', 'c3'].map(s));
    excludes(guide, 'capture', ['c2', 'e2'].map(s));
  }
});

test('selected Knight pawn shows quiet tall jumps and capturing wide jumps across intervening blockers', async t => {
  for (const black of [false, true]) {
    const game = variant(t, { a1: 'K', h7: 'k', d4: type('pawn.knight-tall-quiet@1'), d5: 'P', c4: 'P', e4: 'P' }, black);
    const s = black ? reflect : square => square;
    const guide = await api.getPieceGuide(game, { square: s('d4') });
    includes(guide, 'quiet', ['c6', 'e6', 'b5', 'f5'].map(s));
    includes(guide, 'capture', ['b5', 'f5', 'c5', 'e5'].map(s));
    excludes(guide, 'capture', ['c6', 'e6', 'd5'].map(s));
    excludes(guide, 'quiet', ['c2', 'e2', 'b3', 'f3', 'd5'].map(s));
  }
});

test('Cataphract inspection preserves its six camel directions and occupied ray blockers', async t => {
  for (const black of [false, true]) {
    const game = variant(t, { h1: 'K', h7: 'k', d4: type('rook.cataphract-no-tall-back@1'), d5: 'P', d3: 'P', c4: 'P', e4: 'P' }, black);
    const s = black ? reflect : square => square;
    const guide = await api.getPieceGuide(game, { square: s('d4') });
    for (const key of ['quiet', 'capture']) {
      includes(guide, key, ['a3', 'g3', 'a5', 'g5', 'c7', 'e7'].map(s));
      excludes(guide, key, ['c1', 'e1', 'd6', 'b4', 'd2', 'f4'].map(s));
    }
  }
});

test('blocked knight paths and X-ray hurdles are interpreted by the existing rules engine', async t => {
  const blocked = variant(t, { a1: 'K', h7: 'k', d4: type('bishop.purple@13'), e4: 'P' });
  const guide = await api.getPieceGuide(blocked, { square: 'd4' });
  for (const key of ['quiet', 'capture']) { excludes(guide, key, ['f3', 'f5']); includes(guide, key, ['b3', 'b5']); }
  const hopping = variant(t, { a1: 'K', h7: 'k', d4: type('queen.purple@7'), e5: 'P', g7: 'p' });
  const hop = await api.getPieceGuide(hopping, { square: 'd4' });
  for (const key of ['quiet', 'capture']) { includes(hop, key, ['f6', 'g7']); excludes(hop, key, ['h8']); }
});

test('friendly landing squares stay omitted and current enemy blockers still stop rays beyond them', async () => {
  const game = new Chess('7k/8/8/3p4/3R1P2/8/8/K7 w - - 0 1');
  const guide = await api.getPieceGuide(game, { square: 'd4' });
  for (const key of ['quiet', 'capture']) {
    includes(guide, key, ['d5', 'e4']);
    excludes(guide, key, ['d6', 'd7', 'f4', 'g4']);
  }
  assert.ok(!guide.legalQuiet.includes('d5'));
  includes(guide, 'legalCapture', ['d5']);
});

test('ordinary king safety stays real while current castling and en passant remain visible as special legal moves', async () => {
  const king = new Chess('4k3/8/8/8/8/5r2/8/4K3 w - - 0 1');
  const guide = await api.getPieceGuide(king, { square: 'e1' });
  includes(guide, 'quiet', ['f1', 'f2']); excludes(guide, 'legal', ['f1', 'f2']);
  const castles = new Chess('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  const castlingGuide = await api.getPieceGuide(castles, { square: 'e1' });
  includes(castlingGuide, 'quiet', ['c1', 'g1']); includes(castlingGuide, 'legalQuiet', ['c1', 'g1']);
  excludes(castlingGuide, 'capture', ['c1', 'g1']);
  const ep = new Chess('7k/8/8/3pP3/8/8/8/7K w - d6 0 1');
  const epGuide = await api.getPieceGuide(ep, { square: 'e5' });
  includes(epGuide, 'capture', ['d6']); includes(epGuide, 'legalCapture', ['d6']);
  assert.equal(ep.get('d5').type, 'p'); assert.equal(ep.history().length, 0);
});

test('guide results are detached, all source positions stay unchanged and missing/invalid input is explicit', async () => {
  const game = new Chess(); game.move('e4');
  const before = { fen: game.fen(), history: game.history(), pgn: game.pgn() };
  const first = await api.getPieceGuide(game, { square: 'g8' });
  first.quiet.length = 0;
  const cached = await api.getPieceGuide(game, { square: 'g8' });
  includes(cached, 'quiet', ['f6', 'h6']);
  assert.deepEqual({ fen: game.fen(), history: game.history(), pgn: game.pgn() }, before);
  assert.equal(await api.getPieceGuide(game, { square: 'a3' }), null);
  await assert.rejects(api.getPieceGuide(game, { square: 'a9' }), /board square/);
  assert.throws(() => api.inspectionConfig('untrusted-custom-rules'), /no piece guide/);
  for (const library of PLAYABLE_LIBRARIES) assert.match(api.inspectionConfig(profilesFor(library)), /king = -\ncommoner = k/);
});
function profilesFor(library) { return getPlayableProfiles()[PLAYABLE_LIBRARIES.indexOf(library)].variant; }

test('each stored library can inspect its own allocated custom piece without retaining another real-game module', async () => {
  const live = new api.VariantGame(fen({ a1: 'K', h7: 'k', d4: type('pawn.knight-tall-quiet@1') }), profile.variant);
  try {
    const before = { fen: live.fen(), moves: live.moves(), history: live.history(), pgn: live.pgn() };
    for (const source of getPlayableProfiles()) {
      const first = source.registry.allocations[0];
      const position = fen({ a1: 'K', h7: 'k', d4: first.letter.toUpperCase() });
      // Legal movement is covered by real-game tests above. This fixture checks
      // every archived configuration/letter allocation in the private inspector
      // without allocating twenty additional real-game WASM heaps.
      const game = { variant: source.variant, fen: () => position, turn: () => 'w',
        get: square => square === 'd4' ? { color: 'w', type: first.letter } : undefined,
        moves: () => [] };
      const guide = await api.getPieceGuide(game, { square: 'd4' });
      assert.ok(guide.quiet.length + guide.capture.length > 0, first.id);
      assert.deepEqual(guide.legal, []);
      assert.equal(guide.variant, source.variant);
      assert.equal(game.fen(), position);
    }
    assert.deepEqual({ fen: live.fen(), moves: live.moves(), history: live.history(), pgn: live.pgn() }, before,
      'Loading every inspection profile cannot overwrite a real game’s shared movement tables.');
  } finally { live.dispose(); }
});
