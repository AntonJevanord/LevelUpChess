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
const { pieceMap, placementFromMap } = require('../src/profile-fen');
const { defaultDesignChoices, designSetupFromChoices, loadDesignSetup } = require('../src/design-setup');
const historical = require('./fixtures/playable-initial20-sha256.json');
const revised = require('../src/designs-v19-revised');
const original = require('../src/designs-v19-selected');
const { getDesign } = require('../src/design-catalog');
const { getPlayableProfiles } = require('../scripts/playable-profile');
const { PLAYABLE_LIBRARIES, getDesignOptions, getPlayableProfile } = require('../src/design-options');

const ROOT = path.resolve(__dirname, '..');
const ID = 'queen.wraith-side-through@1';
const hash = file => createHash('sha256').update(fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n')).digest('hex');
const frozenV19 = {
  'experiments/designs/v19-roster.json': '935292aa17ee8c83be98e47b9c2ffb4765f5623f217ed2b797db1155dd37eef8',
  'experiments/designs/v19-panel-values.json': '2cf2661f504c410dc28d5bfdb03517581706666d2a8d3e8a380eef46d32bdd11',
  'src/playable-v19-level1-profile.json': 'e2ad8a9c4973c285d5b5e799306e66ea81a2d24dba98e0a528903e7e0e1c82a7',
  'variants/levelup-playable-v19-level1.ini': '8892e0194deabd418902ec20f8917e4ac9c82f04917ff5ce77a581715e928ff5',
  'src/playable-v19-level2-profile.json': '119e2746e0a4c78a7ec37035a5735d9bcc4a701b2de1681174c5901cbc119bf5',
  'variants/levelup-playable-v19-level2.ini': '58555ff5fd552c1b261972b2b5f23e2d5eec3cd54037c8668b77ed427f06e1b9',
  'src/playable-v19-level3-profile.json': '28f861237b80902b5d432dc16aa7b0769862bacb78f37087c4defc51d536b0c1',
  'variants/levelup-playable-v19-level3.ini': '5126a7dae3da711a3fff0654517fc5415bb2607941719166af21d7e9f44bb1b2',
};
function library(level) { return PLAYABLE_LIBRARIES.find(row => row.id === `v19-level${level}-revised`); }
function profile(level) { return getPlayableProfile(library(level).variant); }
const type = (value, id = ID) => value.registry.allocations.find(row => row.id === id).letter.toUpperCase();

test('revision002 removes only the third L2 pawn and replaces Wraith while every published identity survives', () => {
  for (const [file, expected] of Object.entries({ ...historical, ...frozenV19 })) assert.equal(hash(file), expected, file);
  assert.equal(hash(revised.ROSTER_FILE), revised.ROSTER_SHA256);
  assert.equal(hash(revised.VALUES_FILE), revised.VALUES_SHA256);
  assert.deepEqual(revised.TIERS.map(tier => [tier.level, tier.bodies.length, tier.referenceIds.length]), [[1, 11, 3], [2, 11, 3], [3, 11, 4]]);
  assert.deepEqual(revised.getTierRoster(1), original.getTierRoster(1));
  assert.deepEqual(revised.getTierRoster(2).filter(row => row.family === 'pawn').map(row => row.id), ['pawn.knight-tall-quiet@1', 'pawn.rank-current@1']);
  assert.ok(revised.getTierRoster(3).some(row => row.id === 'pawn.queen-sideways@1'));
  const body = revised.getTierRoster(3).find(row => row.id === ID);
  assert.equal(body.movement, 'QgmQ0gcBgcsR0');
  assert.deepEqual(body.prior, { mg: 3772, eg: 3470 });
  assert.deepEqual(getDesign(ID), require('../src/balance-designs-v18-wraith').NEW_DEFINITIONS.find(row => row.id === ID));
  assert.equal(getDesign('queen.wraith-short-through@1'), undefined);
  assert.equal(getDesign('queen.wraith-full-diagonal@1'), undefined);
});

test('new profile mappings, help text and colors are coherent without changing superseded choices', () => {
  const factory = getPlayableProfiles();
  for (const level of [2, 3]) {
    const row = library(level), value = profile(level), options = getDesignOptions(value.variant);
    assert.ok(row);
    assert.equal(Boolean(row.superseded), true, 'later selections retain both revised libraries as archived choices');
    assert.deepEqual(value, factory[PLAYABLE_LIBRARIES.indexOf(row)]);
    assert.equal(value.registry.definitions.length, 11);
    assert.deepEqual(options.map(option => option.id).sort(), revised.getTierRoster(level).map(body => body.id).sort());
    for (const body of revised.getTierRoster(level)) assert.deepEqual(value.evaluation.pieceValues[body.id], body.prior);
    const priorLibrary = PLAYABLE_LIBRARIES.find(row => row.id === `v19-level${level}`);
    assert.ok(priorLibrary.superseded);
    assert.notEqual(priorLibrary.variant, row.variant);
  }
  const oldL2 = PLAYABLE_LIBRARIES.find(row => row.id === 'v19-level2');
  assert.ok(getDesignOptions(oldL2.variant).some(option => option.id === 'pawn.bishop-diagonal-range@1'));
  assert.ok(!getDesignOptions(profile(2).variant).some(option => option.id === 'pawn.bishop-diagonal-range@1'));
  const wraith = getDesignOptions(profile(3).variant).find(option => option.id === ID);
  assert.match(wraith.name, /Wraith/);
  assert.equal(wraith.accent, 'purple');
  assert.equal(wraith.status, 'exploration');
  assert.match(wraith.description, /hop|hurdle/i);
  assert.match(wraith.description, /sideways|horizontal/i);
  assert.ok(profile(3).capabilityProbes.some(probe => probe.name.includes(ID)));
  assert.equal(getDesign('queen.purple@7').movement, 'QgB0');
});

test('revised Wraith setup, saved profile and PGN preserve exact new mappings through undo', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v19-revised-save-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const output = path.join(directory, 'save.cjs');
  await build({ ...rulesBuildOptions(), bundle: true, platform: 'node', format: 'cjs', outfile: output,
    stdin: { contents: "export * from './src/saved-games.js'; export { VariantGame, initVariantRules } from './src/variant-game.js';", resolveDir: ROOT, loader: 'js' } });
  const api = require(output), value = profile(3);
  await api.initVariantRules(value.variant);
  const choices = { ...defaultDesignChoices(value), d1: ID, d8: ID }, setup = designSetupFromChoices(choices, 3, value);
  assert.deepEqual(setup.costs, { w: 3, b: 3 });
  assert.throws(() => designSetupFromChoices(choices, 2, value), /Budget exceeded/);
  const old = getPlayableProfile(PLAYABLE_LIBRARIES.find(row => row.id === 'v19-level3').variant);
  assert.throws(() => designSetupFromChoices({ ...defaultDesignChoices(old), d1: ID }, 3, old));
  const game = new api.VariantGame(setup.fen, value.variant); t.after(() => game.dispose());
  for (const [from, to] of [['e2', 'e4'], ['e7', 'e5'], ['d1', 'e2'], ['d8', 'e7']]) assert.ok(game.move({ from, to }));
  const saved = api.makeSave(game, { opponent: 'local', humanSide: 'w', difficulty: 'medium', flipped: false, upgradeBudget: 3 });
  const restored = await api.parseSave(JSON.stringify(saved)), imported = await api.parsePgn(api.exportPgn(game));
  t.after(() => restored.game.dispose()); t.after(() => imported.dispose());
  for (const copy of [restored.game, imported]) {
    assert.equal(copy.fen(), game.fen());
    assert.equal(copy.profile.hash, value.hash);
    for (let index = 0; index < 4; index++) assert.ok(copy.undo());
    assert.deepEqual(loadDesignSetup(copy.fen(), value), choices);
  }
});

test('new Wraith keeps quiet vertical hops, long sideways captures and short diagonal through captures in both engines', { timeout: 120000 }, async t => {
  const value = profile(3), piece = type(value), rules = await createMatchRules({ profile: value });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v19-revised-native-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const native = process.env.FAIRY_STOCKFISH_PATH || path.join(ROOT, 'node_modules/.cache/levelup-native-values/stockfish');
  fs.writeFileSync(path.join(directory, 'profile.ini'), value.config);
  const engine = fs.existsSync(native) ? new UciEngine({ path: native, variantPath: path.join(directory, 'profile.ini'), variant: value.variant, options: { threads: 1, hash: 16 } }) : null;
  if (engine) {
    t.after(() => engine.close()); await engine.start();
    const tables = (await engine.pieceValues()).pieces;
    for (const letter of [piece, piece.toLowerCase()]) {
      for (const field of ['rawMg', 'captureMg', 'evalMg']) assert.equal(tables[letter][field], 3772);
      for (const field of ['rawEg', 'captureEg', 'evalEg']) assert.equal(tables[letter][field], 3470);
    }
  }
  const frames = [
    [{ e4: 'P', g4: 'p' }, 'g4', true],
    [{ d5: 'P' }, 'd7', true],
    [{ d5: 'P', d7: 'p' }, 'd7', false],
    [{ e5: 'P', f6: 'p' }, 'f6', true],
    [{ e5: 'P', g7: 'p' }, 'g7', false],
  ];
  const reflect = square => square[0] + (9 - Number(square[1]));
  const swap = letter => letter === letter.toUpperCase() ? letter.toLowerCase() : letter.toUpperCase();
  for (const [pieces, target, expected] of frames) for (const black of [false, true]) {
    const s = black ? reflect : square => square;
    const map = new Map(Object.entries({ a2: 'K', h7: 'k', d4: piece, ...pieces }).map(([square, letter]) => black ? [reflect(square), swap(letter)] : [square, letter]));
    const fen = `${placementFromMap(map)} ${black ? 'b' : 'w'} - - 0 1`, board = rules.createBoard(fen);
    try {
      const moves = board.moves().sort();
      assert.equal(moves.includes(s('d4') + s(target)), expected, JSON.stringify({ pieces, target, black }));
      if (engine) assert.deepEqual(await engine.perft({ fen }), moves);
      if (expected) { assert.ok(board.push(s('d4') + s(target))); assert.equal(pieceMap(board.fen()).get(s(target)).toLowerCase(), piece.toLowerCase()); }
    } finally { board.dispose(); }
  }
});
