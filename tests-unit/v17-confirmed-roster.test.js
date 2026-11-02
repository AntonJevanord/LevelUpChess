'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { build } = require('esbuild');
const { rulesBuildOptions } = require('../scripts/rules-build');
const hashes = require('./fixtures/playable-initial18-sha256.json');
const { PLAYABLE_LIBRARIES, V17_CONFIRMED_CANDIDATES, V17_CONFIRMED_RESERVE_DESIGN_IDS, OFFICIAL_REFERENCE_DESIGN_IDS } = require('../src/playable-library');
const { getPlayableProfiles } = require('../scripts/playable-profile');
const { getDesignOptions, getProfileSnapshot } = require('../src/design-options');
const { getDesign } = require('../src/design-catalog');
const { defaultDesignChoices, designSetupFromChoices, loadDesignSetup } = require('../src/design-setup');
const { pieceMap, placementFromMap, pocketLetters } = require('../src/profile-fen');
const { createMatchRules } = require('../dist/balance-rules.cjs');
const { UciEngine } = require('../scripts/balance/uci');

const library = PLAYABLE_LIBRARIES.find(item => item.id === 'v17-roster-confirmed');
const profile = getPlayableProfiles()[PLAYABLE_LIBRARIES.indexOf(library)];
const ids = { bishop: 'bishop.vertical-blocked@1', pawn: 'pawn.queen-sideways@1', queen: 'queen.purple@7',
  slider: 'king.reserve-rook@1', jumper: 'king.grant-wd-level3@1', king: 'king.reserve-king@1' };
const type = id => profile.registry.allocations.find(item => item.id === id).letter.toUpperCase();
const reflect = square => square[0] + (9 - Number(square[1]));
const swap = value => value.replace(/[a-z]/gi, char => char === char.toUpperCase() ? char.toLowerCase() : char.toUpperCase());
const fixtures = [];
let rules, api, directory;
function position(pieces, turn = 'w', pocket = '') {
  const map = new Map(Object.entries(pieces)); map.pocket = pocket;
  return `${placementFromMap(map)} ${turn} - - 0 1`;
}
function opposite(input) {
  const fields = input.split(' ');
  fields[0] = swap(fields[0].split('[')[0].split('/').reverse().join('/')) + (input.includes('[') ? '[' + swap(pocketLetters(input)) + ']' : '');
  fields[1] = fields[1] === 'w' ? 'b' : 'w';
  return fields.join(' ');
}
function both(t, name, input, check) {
  for (const black of [false, true]) {
    const fen = black ? opposite(input) : input;
    fixtures.push({ name: name + (black ? ': Black' : ': White'), fen });
    const board = rules.createBoard(fen); t.after(() => board.dispose());
    check(board, black ? reflect : square => square);
  }
}
test.before(async () => {
  rules = await createMatchRules({ profile });
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-confirmed-roster-'));
  const outfile = path.join(directory, 'api.cjs');
  await build({ ...rulesBuildOptions(), bundle: true, platform: 'node', format: 'cjs', outfile,
    stdin: { contents: "export * from './src/saved-games.js'; export { VariantGame, initVariantRules } from './src/variant-game.js';", resolveDir: path.resolve(__dirname, '..'), loader: 'js' } });
  api = require(outfile); await api.initVariantRules(profile.variant);
});
test.after(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

test('the nineteen-type confirmed roster comes first and preserves all eighteen earlier profiles', () => {
  assert.equal(PLAYABLE_LIBRARIES.length, 19);
  assert.equal(profile.registry.definitions.length, 19);
  assert.deepEqual(library.designIds, [...OFFICIAL_REFERENCE_DESIGN_IDS, ...Object.values(V17_CONFIRMED_CANDIDATES).flat(), ...V17_CONFIRMED_RESERVE_DESIGN_IDS]);
  assert.deepEqual(PLAYABLE_LIBRARIES.slice(0, 18).flatMap(item => [item.json, item.ini]), Object.keys(hashes));
  for (const [file, expected] of Object.entries(hashes)) assert.equal(createHash('sha256').update(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n')).digest('hex'), expected, file);
  const profiles = getPlayableProfiles();
  for (const [index, old] of PLAYABLE_LIBRARIES.slice(0, 18).entries()) {
    assert.deepEqual(JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', old.json), 'utf8')), profiles[index]);
    assert.equal(fs.readFileSync(path.resolve(__dirname, '..', old.ini), 'utf8'), profiles[index].config);
  }
  const sorted = [...PLAYABLE_LIBRARIES].sort((a, b) => (b.generation || 0) - (a.generation || 0)
    || Number(Boolean(a.superseded)) - Number(Boolean(b.superseded)) || (b.edition || 0) - (a.edition || 0));
  assert.equal(sorted[0].id, library.id); assert.equal(library.edition, 5);
  assert.equal(library.name, 'Roster and king trials');
  for (const id of ['bishop.purple@18', 'queen.xray-rook@1', 'king.grant-king-level3@1', 'king.grant-orthogonal-three-level3@1', 'king.grant-knight-level3@1']) assert.ok(!library.designIds.includes(id), id);
  const archived = PLAYABLE_LIBRARIES.find(item => item.id === 'v17-roster-trials');
  assert.equal(archived.superseded, true); assert.equal(archived.name, 'Roster and trials (archive)');
});

test('accepted names and colors retain Warden alongside the remaining W2 and four-point trials', () => {
  const options = getDesignOptions(profile.variant), option = id => options.find(item => item.id === id);
  assert.equal(option(ids.bishop).name, 'Inquisitor'); assert.equal(option(ids.pawn).name, 'Herald');
  assert.equal(option(ids.bishop).status, 'accepted'); assert.equal(option(ids.pawn).status, 'accepted');
  assert.deepEqual(options.filter(item => item.status === 'experimental').map(item => item.id).sort(), [ids.slider, ids.king].sort());
  assert.match(option(ids.slider).name, /Sliding.*trial/); assert.equal(option(ids.jumper).name, 'Warden');
  assert.equal(option(ids.jumper).status, 'accepted');
  assert.equal(getDesign(ids.king).level, 4); assert.equal(getDesign(ids.king).movement, 'K');
  assert.equal(getDesign('king.grant-king-level3@1').level, 3, 'The archived price is not rewritten.');
  assert.deepEqual(V17_CONFIRMED_RESERVE_DESIGN_IDS.map(id => option(id).level), [1, 2, 3, 3, 4]);
  assert.deepEqual(V17_CONFIRMED_RESERVE_DESIGN_IDS.map(id => option(id).accent), ['blue', 'green', 'yellow', 'yellow', 'orange']);
  for (const id of OFFICIAL_REFERENCE_DESIGN_IDS) { assert.equal(option(id).accent, 'red'); assert.equal(option(id).status, 'reference'); }
  for (const id of Object.values(V17_CONFIRMED_CANDIDATES).flat()) if (option(id).level === 3) assert.equal(option(id).accent, 'purple');
  for (const [id, accent] of [['pawn.blue@5', 'green'], ['pawn.blue@7', 'blue'], ['pawn.orange@3', 'yellow'], ['pawn.rank-current@1', 'orange']]) assert.equal(option(id).accent, accent);
  const old = PLAYABLE_LIBRARIES.find(item => item.id === 'v17-roster-trials');
  const previous = getDesignOptions(getPlayableProfiles()[PLAYABLE_LIBRARIES.indexOf(old)].variant);
  assert.equal(previous.find(item => item.id === ids.bishop).name, 'Blocked Vertical bishop');
  assert.equal(previous.find(item => item.id === ids.pawn).name, 'Sideways Queen pawn');
});

test('W2 and WD give different legal captures when intermediate orthogonal squares are occupied', t => {
  for (const id of [ids.slider, ids.jumper]) both(t, id + ' blockers', position({ h1: 'K', h7: 'k', d4: type(id),
    d5: 'P', e4: 'P', d3: 'P', c4: 'P', d6: 'p', f4: 'p', d2: 'p', b4: 'p' }), (board, s) => {
    for (const to of ['d6', 'f4', 'd2', 'b4']) assert.equal(board.moves().includes(s('d4') + s(to)), id === ids.jumper, to);
    for (const to of ['d7', 'g4', 'e5']) assert.ok(!board.moves().includes(s('d4') + s(to)), to);
  });
});

test('king purchases remain finite, nonroyal and unable to give check on deployment', t => {
  assert.deepEqual(profile.roles.royalTypes, ['k']); assert.equal(profile.roles.reserveTypes.length, 5);
  for (const id of [ids.slider, ids.jumper, ids.king]) {
    both(t, id + ' finite drop', position({ h1: 'K', h8: 'k' }, 'w', type(id)), (board, s) => {
      assert.equal(board.push(type(id) + '@' + s('d3')), true);
      assert.equal(pocketLetters(board.fen()), ''); assert.equal(pieceMap(board.fen()).get(s('h1')).toLowerCase(), 'k');
    });
    both(t, id + ' checking drop forbidden', position({ h1: 'K', g5: 'k' }, 'w', type(id)), (board, s) => {
      const square = id === ids.king ? 'g4' : 'g3';
      assert.ok(!board.moves().includes(type(id) + '@' + s(square)));
    });
  }
});

test('the chosen old X-ray queen hops diagonally while ordinary rank movement stays blocked', t => {
  assert.equal(profile.registry.definitions.find(item => item.id === ids.queen).movement, 'QgB0');
  both(t, 'diagonal xray retained', position({ a1: 'K', h7: 'k', d4: type(ids.queen), e5: 'P', g7: 'p', h8: 'p', e4: 'P', g4: 'p' }), (board, s) => {
    for (const to of ['f6', 'g7']) assert.ok(board.moves().includes(s('d4') + s(to)), to);
    for (const to of ['h8', 'f4', 'g4', 'f5', 'e6']) assert.ok(!board.moves().includes(s('d4') + s(to)), to);
  });
});

test('confirmed pieces, trial grants and the original four-point price survive setup, saves, PGN and undo', async t => {
  const choices = { ...defaultDesignChoices(profile), c1: ids.bishop, c2: ids.pawn, e1: ids.jumper,
    a8: 'rook.purple@12', d8: ids.queen, e8: ids.slider };
  const setup = designSetupFromChoices(choices, 9, profile); assert.deepEqual(setup.costs, { w: 9, b: 9 });
  assert.deepEqual(loadDesignSetup(setup.fen, profile), choices);
  const kingChoices = { ...defaultDesignChoices(profile), e1: ids.king, e8: ids.king, c2: 'pawn.orange@3', c7: 'pawn.rank-current@1' };
  assert.deepEqual(designSetupFromChoices(kingChoices, 6, profile).costs, { w: 6, b: 6 });
  assert.throws(() => designSetupFromChoices(kingChoices, 5, profile), /Budget exceeded/);
  const game = new api.VariantGame(setup.fen, profile.variant); t.after(() => game.dispose());
  const moves = [{ from: 'e2', to: 'e4' }, { from: 'e7', to: 'e5' },
    { drop: type(ids.jumper).toLowerCase(), to: 'd3' }, { drop: type(ids.slider).toLowerCase(), to: 'd6' },
    { from: 'c2', to: 'c4' }, { from: 'h7', to: 'h5' }, { from: 'c1', to: 'c3' }, { from: 'd8', to: 'h4' }];
  for (const move of moves) assert.ok(game.move(move), JSON.stringify(move));
  const settings = { opponent: 'local', humanSide: 'w', difficulty: 'medium', flipped: false, upgradeBudget: 9 };
  const saved = api.makeSave(game, settings); assert.deepEqual(saved.profile, getProfileSnapshot(profile.variant)); assert.deepEqual(saved.setup, { choices, budget: 9 });
  const restored = await api.parseSave(JSON.stringify(saved)); t.after(() => restored.game.dispose());
  const imported = await api.parsePgn(api.exportPgn(game)); t.after(() => imported.dispose());
  for (const copy of [restored.game, imported]) {
    assert.equal(copy.fen(), game.fen()); assert.deepEqual(copy.history(), game.history());
    for (const move of moves) assert.ok(copy.undo());
    assert.deepEqual(loadDesignSetup(copy.fen(), profile), choices);
  }
});

const nativePath = process.env.FAIRY_STOCKFISH_PATH || path.resolve(__dirname, '../node_modules/.cache/levelup-native-values/stockfish');
test('native and browser agree on the nineteen-type confirmed roster and grant trial fixtures', { skip: !fs.existsSync(nativePath), timeout: 120000 }, async t => {
  const ini = path.join(directory, 'confirmed.ini'); fs.writeFileSync(ini, profile.config);
  const engine = new UciEngine({ path: nativePath, variantPath: ini, variant: profile.variant, options: { threads: 1, hash: 16 } });
  t.after(() => engine.close()); await engine.start();
  const positions = new Map([...profile.capabilityProbes, ...fixtures].map(fixture => [fixture.fen, fixture]));
  for (const { fen, name } of positions.values()) {
    const board = rules.createBoard(fen); try { assert.deepEqual(await engine.perft({ fen }), board.moves().sort(), name); }
    finally { board.dispose(); }
  }
  await engine.close(); t.diagnostic(`${positions.size} distinct native/browser fixtures; no searches or scored games.`);
});
