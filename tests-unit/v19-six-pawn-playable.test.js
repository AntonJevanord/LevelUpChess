'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { build } = require('esbuild');
const { rulesBuildOptions } = require('../scripts/rules-build');
const { createMatchRules } = require('../dist/balance-rules.cjs');
const { UciEngine } = require('../scripts/balance/uci');
const { placementFromMap, pieceMap } = require('../src/profile-fen');
const { defaultDesignChoices, designSetupFromChoices, loadDesignSetup } = require('../src/design-setup');
const selected = require('../src/designs-v19-panel-ready');
const previous = require('../src/designs-v19-current');
const { getDesign } = require('../src/design-catalog');
const { getPlayableProfiles } = require('../scripts/playable-profile');
const { PLAYABLE_LIBRARIES, getPlayableProfile, getDesignOptions } = require('../src/design-options');
const historical = require('./fixtures/playable-v19-before-six-pawn-sha256.json');
const ROOT = path.resolve(__dirname, '..'), ID = 'pawn.level3-six-knight@1';
const library = () => PLAYABLE_LIBRARIES.find(row => row.id === 'v19-level3-current');
const profile = () => getPlayableProfile(library().variant);
const type = value => value.registry.allocations.find(row => row.id === ID).letter.toUpperCase();
const hash = file => createHash('sha256').update(fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n')).digest('hex');

test('the six-jump pawn enters a separate L3 edition while all earlier profiles and declarations retain their bytes', () => {
  for (const [file, expected] of Object.entries(historical)) assert.equal(hash(file), expected, file);
  assert.equal(hash(selected.ROSTER_FILE), selected.ROSTER_SHA256);
  assert.equal(hash(selected.VALUES_FILE), selected.VALUES_SHA256);
  for (const level of [1, 2]) assert.deepEqual(selected.getTierRoster(level), previous.getTierRoster(level));
  for (const level of [1, 2, 3]) assert.deepEqual(selected.getTier(level).referenceIds, previous.getTier(level).referenceIds);
  assert.deepEqual(selected.getTierRoster(3).filter(row => row.family === 'pawn').map(row => row.id), ['pawn.queen-sideways@1', 'pawn.purple@13', ID]);
  assert.deepEqual(getDesign(ID), require('../src/balance-designs-v19-trials').NEW_DEFINITIONS.find(row => row.id === ID));
  assert.equal(getDesign(ID).movement, 'ifmnDfmWfceFsNfN');
  assert.equal(getDesign(ID).level, 3);
  assert.equal(getDesign('pawn.level3-full-knight@1'), undefined);
});

test('the selected pawn is a three-point red option beside Herald and Ranger under its actual mapped profile', () => {
  const value = profile(), options = getDesignOptions(value.variant);
  assert.ok(library() && !library().superseded);
  assert.equal(value.registry.definitions.length, 12);
  assert.deepEqual(value, getPlayableProfiles()[PLAYABLE_LIBRARIES.indexOf(library())]);
  assert.deepEqual(options.map(row => row.id).sort(), selected.getTierRoster(3).map(row => row.id).sort());
  const pawn = options.find(row => row.id === ID);
  assert.equal(pawn.level, 3); assert.equal(pawn.accent, 'red'); assert.match(pawn.description, /jump/i);
  assert.deepEqual(value.evaluation.pieceValues[ID], { mg: 762, eg: 808 });
  assert.ok(value.capabilityProbes.some(row => row.name.includes(ID)));
  const old = PLAYABLE_LIBRARIES.find(row => row.id === 'v19-level3-revised');
  assert.ok(old.superseded); assert.ok(!getDesignOptions(old.variant).some(row => row.id === ID));
});

test('six jumps, ordinary captures, en passant and mandatory promotion work with the playable mapping', async () => {
  const value = profile(), rules = await createMatchRules({ profile: value }), letter = type(value);
  const reflect = square => square[0] + (9 - Number(square[1]));
  const swap = piece => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase();
  for (const black of [false, true]) {
    const s = black ? reflect : square => square;
    const fen = (pieces, ep = '-') => `${placementFromMap(new Map(Object.entries(pieces).map(([square, piece]) => black ? [reflect(square), swap(piece)] : [square, piece])))} ${black ? 'b' : 'w'} - ${black && ep !== '-' ? reflect(ep) : ep} 0 1`;
    const board = rules.createBoard(fen({ a1: 'K', h8: 'k', d4: letter, b3: 'p', c5: 'p' }));
    try {
      const destinations = board.moves().filter(move => move.startsWith(s('d4'))).map(move => black ? reflect(move.slice(2, 4)) : move.slice(2, 4)).sort();
      assert.deepEqual(destinations, ['b3', 'b5', 'c5', 'c6', 'd5', 'e6', 'f3', 'f5']);
    } finally { board.dispose(); }
    const ep = rules.createBoard(fen({ a1: 'K', h8: 'k', c5: letter, d5: 'p' }, 'd6'));
    try { assert.ok(ep.push(s('c5') + s('d6'))); assert.equal(pieceMap(ep.fen()).has(s('d5')), false); }
    finally { ep.dispose(); }
    const promotion = rules.createBoard(fen({ a1: 'K', h6: 'k', b7: letter, c8: 'r' }));
    try {
      for (const target of ['b8', 'c8']) assert.deepEqual(promotion.moves().filter(move => move.startsWith(s('b7') + s(target))).map(move => move.slice(4)).sort(), ['b', 'n', 'q', 'r']);
    } finally { promotion.dispose(); }
  }
});

test('setup, save, PGN and undo preserve a six-jump pawn bought by both sides', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v19-six-pawn-save-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const output = path.join(directory, 'save.cjs');
  await build({ ...rulesBuildOptions(), bundle: true, platform: 'node', format: 'cjs', outfile: output,
    stdin: { contents: "export * from './src/saved-games.js'; export { VariantGame, initVariantRules } from './src/variant-game.js';", resolveDir: ROOT, loader: 'js' } });
  const api = require(output), value = profile(); await api.initVariantRules(value.variant);
  const choices = { ...defaultDesignChoices(value), c2: ID, c7: ID }, setup = designSetupFromChoices(choices, 3, value);
  assert.deepEqual(setup.costs, { w: 3, b: 3 });
  assert.throws(() => designSetupFromChoices(choices, 2, value), /Budget exceeded/);
  const game = new api.VariantGame(setup.fen, value.variant); t.after(() => game.dispose());
  const moves = [['e2', 'e4'], ['e7', 'e5'], ['c2', 'b4'], ['c7', 'b5'], ['b4', 'd3'], ['b5', 'd6']];
  for (const [from, to] of moves) assert.ok(game.move({ from, to }), from + to);
  const save = api.makeSave(game, { opponent: 'local', humanSide: 'w', difficulty: 'medium', flipped: false, upgradeBudget: 3 });
  const restored = await api.parseSave(JSON.stringify(save)), imported = await api.parsePgn(api.exportPgn(game));
  t.after(() => restored.game.dispose()); t.after(() => imported.dispose());
  for (const copy of [restored.game, imported]) {
    assert.equal(copy.fen(), game.fen()); assert.equal(copy.profile.hash, value.hash);
    for (const move of moves) assert.ok(copy.undo());
    assert.deepEqual(loadDesignSetup(copy.fen(), value), choices);
  }
});

test('native Stockfish agrees with the playable probe inventory and all six pawn value tables', { timeout: 120000 }, async t => {
  const native = process.env.FAIRY_STOCKFISH_PATH || path.join(ROOT, 'node_modules/.cache/levelup-native-values/stockfish');
  if (!fs.existsSync(native)) { t.skip('Set FAIRY_STOCKFISH_PATH for native verification.'); return; }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v19-six-pawn-native-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const value = profile(), rules = await createMatchRules({ profile: value }), file = path.join(directory, 'profile.ini');
  fs.writeFileSync(file, value.config);
  const engine = new UciEngine({ path: native, variantPath: file, variant: value.variant, options: { threads: 1, hash: 16 } });
  try {
    await engine.start(); const tables = (await engine.pieceValues()).pieces;
    for (const piece of [type(value), type(value).toLowerCase()]) {
      for (const key of ['rawMg', 'captureMg', 'evalMg']) assert.equal(tables[piece][key], 762);
      for (const key of ['rawEg', 'captureEg', 'evalEg']) assert.equal(tables[piece][key], 808);
    }
    for (const probe of value.capabilityProbes) {
      const board = rules.createBoard(probe.fen);
      try { assert.deepEqual(await engine.perft({ fen: probe.fen }), board.moves().sort(), probe.name); }
      finally { board.dispose(); }
    }
  } finally { await engine.close(); }
});
