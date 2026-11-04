'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { build } = require('esbuild');
const { rulesBuildOptions } = require('../scripts/rules-build');
const historicalHashes = require('./fixtures/playable-initial19-sha256.json');
const { PLAYABLE_LIBRARIES, OFFICIAL_REFERENCE_DESIGN_IDS } = require('../src/playable-library');
const { getPlayableProfiles } = require('../scripts/playable-profile');
const { getDesignOptions, getProfileSnapshot } = require('../src/design-options');
const { getDesign } = require('../src/design-catalog');
const { defaultDesignChoices, designSetupFromChoices, loadDesignSetup } = require('../src/design-setup');
const { pieceMap, placementFromMap } = require('../src/profile-fen');
const { createMatchRules } = require('../dist/balance-rules.cjs');
const { UciEngine } = require('../scripts/balance/uci');

const ids = { pawn: 'pawn.knight-tall-quiet@1', rook: 'rook.cataphract-no-tall-back@1' };
const library = PLAYABLE_LIBRARIES.find(row => row.id === 'v18-roster-confirmed');
const oldLibrary = PLAYABLE_LIBRARIES.find(row => row.id === 'v17-roster-confirmed');
const profiles = getPlayableProfiles();
const profile = profiles[PLAYABLE_LIBRARIES.indexOf(library)];
const previous = profiles[PLAYABLE_LIBRARIES.indexOf(oldLibrary)];
const type = (id, value = profile) => value.registry.allocations.find(row => row.id === id).letter.toUpperCase();
const flip = square => square[0] + (9 - Number(square[1]));
const swap = piece => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase();
const native = process.env.FAIRY_STOCKFISH_PATH || path.resolve(__dirname, '../node_modules/.cache/levelup-native-values/stockfish');
const fixtures = [];
let rules, api, directory;

function position(pieces, black = false, { ep = '-', rights = '-' } = {}) {
  const map = new Map(Object.entries(pieces).map(([square, piece]) => black ? [flip(square), swap(piece)] : [square, piece]));
  return `${placementFromMap(map)} ${black ? 'b' : 'w'} ${black ? rights.toLowerCase() : rights} ${ep === '-' ? ep : black ? flip(ep) : ep} 0 1`;
}
function both(t, name, pieces, check, fields) {
  for (const black of [false, true]) {
    const fen = position(pieces, black, fields), board = rules.createBoard(fen);
    fixtures.push({ name: `${name}: ${black ? 'Black' : 'White'}`, fen });
    t.after(() => board.dispose()); check(board, black ? flip : square => square, black);
  }
}
test.before(async () => {
  assert.ok(library, 'The version-18 library is declared.');
  rules = await createMatchRules({ profile });
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v18-roster-'));
  const output = path.join(directory, 'save-api.cjs');
  await build({ ...rulesBuildOptions(), bundle: true, platform: 'node', format: 'cjs', outfile: output,
    stdin: { contents: "export * from './src/saved-games.js'; export { VariantGame, initVariantRules } from './src/variant-game.js';", resolveDir: path.resolve(__dirname, '..'), loader: 'js' } });
  api = require(output);
  await api.initVariantRules(profile.variant);
  await api.initVariantRules(previous.variant);
});
test.after(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

test('version 18 selects fresh definitions while all nineteen historical profiles retain their rules', () => {
  assert.equal(PLAYABLE_LIBRARIES.length, 20);
  assert.equal(library.generation, 18); assert.equal(profile.registry.definitions.length, 19);
  assert.notEqual(profile.variant, previous.variant); assert.notEqual(profile.hash, previous.hash);
  assert.deepEqual(PLAYABLE_LIBRARIES.slice(0, 19).flatMap(row => [row.json, row.ini]), Object.keys(historicalHashes));
  for (const [file, expected] of Object.entries(historicalHashes)) {
    const bytes = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, file);
  }
  for (const [index, row] of PLAYABLE_LIBRARIES.slice(0, 19).entries()) {
    assert.deepEqual(JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', row.json), 'utf8')), profiles[index]);
    assert.equal(fs.readFileSync(path.resolve(__dirname, '..', row.ini), 'utf8').replace(/\r\n/g, '\n'), profiles[index].config);
  }
  for (const [selected, original] of [[ids.pawn, 'pawn.orange@3'], [ids.rook, 'rook.purple@12']]) {
    assert.ok(library.designIds.includes(selected)); assert.ok(!library.designIds.includes(original));
    assert.ok(oldLibrary.designIds.includes(original)); assert.ok(!oldLibrary.designIds.includes(selected));
  }
  for (const id of OFFICIAL_REFERENCE_DESIGN_IDS) assert.ok(library.designIds.includes(id));
  assert.equal(getDesign(ids.pawn).movement, 'ifmnDfmWfceFfsNfmN');
  assert.equal(getDesign(ids.rook).movement, 'RsCfC');
  assert.deepEqual(profile.evaluation.pieceValues, {
    [ids.pawn]: { mg: 536, eg: 592 }, [ids.rook]: { mg: 2240, eg: 2413 },
  });
  const choices = getDesignOptions(profile.variant);
  assert.equal(choices.find(row => row.id === ids.pawn).level, 2);
  assert.equal(choices.find(row => row.id === ids.rook).level, 3);
  assert.equal(choices.find(row => row.id === ids.pawn).accent, 'yellow');
  assert.equal(choices.find(row => row.id === ids.rook).accent, 'purple');
  assert.deepEqual(choices.filter(row => row.status === 'reference').map(row => row.id).sort(), [...OFFICIAL_REFERENCE_DESIGN_IDS].sort());
});

test('the selected pawn keeps capturing wide jumps and quiet tall jumps, including jumping over blockers', t => {
  for (const occupied of [false, true]) both(t, `Knight pawn destinations ${occupied}`, {
    a1: 'K', h8: 'k', d4: type(ids.pawn), d5: 'P', c4: 'P', e4: 'P',
    ...(occupied ? { b5: 'p', f5: 'p', c6: 'p', e6: 'p' } : {}),
  }, (board, s) => {
    for (const to of ['b5', 'f5']) assert.ok(board.moves().includes(s('d4') + s(to)), to);
    for (const to of ['c6', 'e6']) assert.equal(board.moves().includes(s('d4') + s(to)), !occupied, to);
    for (const to of ['b3', 'f3', 'c2', 'e2']) assert.ok(!board.moves().includes(s('d4') + s(to)), to);
  });
});

test('the selected pawn retains clear home double steps, actual diagonal en passant and standard promotion', t => {
  for (const blocked of [false, true]) both(t, `pawn double ${blocked}`, {
    a1: 'K', h8: 'k', d2: type(ids.pawn), ...(blocked ? { d3: 'P' } : {}),
  }, (board, s) => assert.equal(board.moves().includes(s('d2') + s('d4')), !blocked));
  both(t, 'pawn no later double', { a1: 'K', h8: 'k', d3: type(ids.pawn) }, (board, s) => {
    assert.ok(!board.moves().includes(s('d3') + s('d5')));
  });
  both(t, 'pawn en passant', { a1: 'K', h8: 'k', e5: type(ids.pawn), d5: 'p' }, (board, s) => {
    assert.ok(board.push(s('e5') + s('d6')));
    assert.ok(!pieceMap(board.fen()).has(s('d5')));
    assert.equal(pieceMap(board.fen()).get(s('d6')).toLowerCase(), type(ids.pawn).toLowerCase());
  }, { ep: 'd6' });
  both(t, 'pawn promotion', { a1: 'K', h6: 'k', d7: type(ids.pawn) }, (board, s) => {
    assert.deepEqual(board.moves().filter(move => move.startsWith(s('d7') + s('d8'))).map(move => move.slice(4)).sort(), ['b', 'n', 'q', 'r']);
  });
});

test('Cataphract retains six camel jumps and rook paths while tall backward jumps stay absent', t => {
  for (const occupied of [false, true]) both(t, `Cataphract destinations ${occupied}`, {
    h1: 'K', h8: 'k', d4: type(ids.rook), d5: 'P', d3: 'P', c4: 'P', e4: 'P',
    ...(occupied ? { a3: 'p', g3: 'p', a5: 'p', g5: 'p', c7: 'p', e7: 'p', c1: 'p', e1: 'p' } : {}),
  }, (board, s) => {
    for (const to of ['a3', 'g3', 'a5', 'g5', 'c7', 'e7']) assert.ok(board.moves().includes(s('d4') + s(to)), to);
    for (const to of ['c1', 'e1', 'e5', 'd6', 'b4']) assert.ok(!board.moves().includes(s('d4') + s(to)), to);
  });
  both(t, 'rook clear capture and blocker', { h1: 'K', h8: 'k', d4: type(ids.rook), d6: 'p', f4: 'p' }, (board, s) => {
    for (const to of ['d5', 'd6', 'e4', 'f4', 'b4', 'd2']) assert.ok(board.moves().includes(s('d4') + s(to)), to);
    for (const to of ['d7', 'g4']) assert.ok(!board.moves().includes(s('d4') + s(to)), to);
  });
});

test('Cataphract preserves castling on both sides with an ordinary royal king', t => {
  both(t, 'upgraded rook castling', { a1: type(ids.rook), e1: 'K', h1: type(ids.rook), e8: 'k' }, (board, s, black) => {
    assert.ok(board.moves().includes(s('e1') + s('c1')));
    assert.ok(board.moves().includes(s('e1') + s('g1')));
    assert.ok(board.push(s('e1') + s('g1')));
    assert.equal(pieceMap(board.fen()).get(s('g1')), black ? 'k' : 'K');
    assert.equal(pieceMap(board.fen()).get(s('f1')).toLowerCase(), type(ids.rook).toLowerCase());
    assert.ok(!pieceMap(board.fen()).has(s('h1')));
  }, { rights: 'KQ' });
});

test('new setup, saved games, PGN and undo preserve exact revised identities while old saves retain old rules', async t => {
  const choices = { ...defaultDesignChoices(profile), d2: ids.pawn, d7: ids.pawn, a1: ids.rook, a8: ids.rook };
  const setup = designSetupFromChoices(choices, 5, profile);
  assert.deepEqual(setup.costs, { w: 5, b: 5 });
  assert.throws(() => designSetupFromChoices(choices, 4, profile), /Budget exceeded/);
  const game = new api.VariantGame(setup.fen, profile.variant); t.after(() => game.dispose());
  for (const move of [{ from: 'd2', to: 'c4' }, { from: 'd7', to: 'c5' }, { from: 'a1', to: 'd2' }, { from: 'a8', to: 'd7' }]) assert.ok(game.move(move), JSON.stringify(move));
  const settings = { opponent: 'local', humanSide: 'w', difficulty: 'medium', flipped: false, upgradeBudget: 5 };
  const saved = api.makeSave(game, settings);
  assert.deepEqual(saved.profile, getProfileSnapshot(profile.variant));
  assert.deepEqual(saved.setup, { choices, budget: 5 });
  const restored = await api.parseSave(JSON.stringify(saved)), imported = await api.parsePgn(api.exportPgn(game));
  t.after(() => restored.game.dispose()); t.after(() => imported.dispose());
  for (const copy of [restored.game, imported]) {
    assert.equal(copy.fen(), game.fen()); assert.deepEqual(copy.history(), game.history());
    for (let count = 0; count < 4; count++) assert.ok(copy.undo());
    assert.deepEqual(loadDesignSetup(copy.fen(), profile), choices);
  }
  const oldChoices = { ...defaultDesignChoices(previous), d2: 'pawn.orange@3', a1: 'rook.purple@12' };
  const oldSetup = designSetupFromChoices(oldChoices, 5, previous), old = new api.VariantGame(oldSetup.fen, previous.variant);
  t.after(() => old.dispose());
  const oldRestored = await api.parseSave(JSON.stringify(api.makeSave(old, settings))); t.after(() => oldRestored.game.dispose());
  assert.equal(oldRestored.game.variant, previous.variant);
  assert.deepEqual(loadDesignSetup(oldRestored.game.fen(), previous), oldChoices);
  assert.notEqual(oldRestored.game.profile.hash, profile.hash);
});

test('native and WASM moves agree for every revised-piece fixture and native searches return legal replies', {
  skip: !fs.existsSync(native), timeout: 120000,
}, async t => {
  const ini = path.join(directory, 'v18.ini'); fs.writeFileSync(ini, profile.config);
  const engine = new UciEngine({ path: native, variantPath: ini, variant: profile.variant, options: { threads: 1, hash: 16 } });
  t.after(() => engine.close()); await engine.start();
  const tables = (await engine.pieceValues()).pieces;
  for (const [id, expected] of Object.entries(profile.evaluation.pieceValues)) {
    for (const letter of [type(id), type(id).toLowerCase()]) {
      for (const field of ['rawMg', 'captureMg', 'evalMg']) assert.equal(tables[letter][field], expected.mg, `${id} ${letter} ${field}`);
      for (const field of ['rawEg', 'captureEg', 'evalEg']) assert.equal(tables[letter][field], expected.eg, `${id} ${letter} ${field}`);
    }
  }
  const selected = new Map([...profile.capabilityProbes, ...fixtures].map(fixture => [fixture.fen, fixture]));
  for (const { fen, name } of selected.values()) {
    const board = rules.createBoard(fen);
    try { assert.deepEqual(await engine.perft({ fen }), board.moves().sort(), name); }
    finally { board.dispose(); }
  }
  for (const black of [false, true]) {
    const fen = position({ h1: 'K', h8: 'k', d4: type(ids.pawn), a3: type(ids.rook), e6: 'p' }, black);
    const board = rules.createBoard(fen);
    try { const result = await engine.search({ fen, nodes: 128 }); assert.ok(board.moves().includes(result.move), result.move); }
    finally { board.dispose(); }
  }
  await engine.close();
  t.diagnostic(`${selected.size} native/WASM fixtures and two unscored legal-reply searches; no balance games.`);
});
