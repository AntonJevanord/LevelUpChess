'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const hashes = require('./fixtures/playable-initial17-sha256.json');
const { PLAYABLE_LIBRARIES, V17_ROSTER_CANDIDATES, V17_ROSTER_RESERVE_DESIGN_IDS, OFFICIAL_REFERENCE_DESIGN_IDS } = require('../src/playable-library');
const { getPlayableProfiles } = require('../scripts/playable-profile');
const { getDesignOptions, getProfileSnapshot } = require('../src/design-options');
const { defaultDesignChoices, designSetupFromChoices, loadDesignSetup } = require('../src/design-setup');
const { pieceMap, placementFromMap, pocketLetters } = require('../src/profile-fen');
const { TRIALS } = require('../src/balance-designs-v17-revisions');
const { createMatchRules } = require('../dist/balance-rules.cjs');
const { UciEngine } = require('../scripts/balance/uci');
const { build } = require('esbuild');
const { rulesBuildOptions } = require('../scripts/rules-build');

const library = PLAYABLE_LIBRARIES.find(item => item.id === 'v17-roster-trials');
const profile = getPlayableProfiles()[PLAYABLE_LIBRARIES.indexOf(library)];
const ids = { vertical: 'bishop.vertical-blocked@1', pawn: 'pawn.queen-sideways@1', queen: 'queen.xray-rook@1',
  king: 'king.grant-king-level3@1', orthogonal: 'king.grant-orthogonal-three-level3@1', knight: 'king.grant-knight-level3@1' };
const type = id => profile.registry.allocations.find(item => item.id === id).letter.toUpperCase();
const reflect = square => square[0] + (9 - Number(square[1]));
const swap = value => value.replace(/[a-z]/gi, char => char === char.toUpperCase() ? char.toLowerCase() : char.toUpperCase());
const fixtures = [];
let rules, directory, api;
function position(pieces, turn = 'w', ep = '-', pocket = '') {
  const map = new Map(Object.entries(pieces)); map.pocket = pocket;
  return `${placementFromMap(map)} ${turn} - ${ep} 0 1`;
}
function opposite(input) {
  const fields = input.split(' ');
  fields[0] = swap(fields[0].split('[')[0].split('/').reverse().join('/')) + (input.includes('[') ? '[' + swap(pocketLetters(input)) + ']' : '');
  fields[1] = fields[1] === 'w' ? 'b' : 'w';
  if (fields[3] !== '-') fields[3] = fields[3].match(/[a-h][1-8]/g).map(reflect).join('');
  return fields.join(' ');
}
function both(t, name, fen, check) {
  for (const black of [false, true]) {
    const input = black ? opposite(fen) : fen;
    fixtures.push({ name: name + (black ? ': Black' : ': White'), fen: input });
    const board = rules.createBoard(input); t.after(() => board.dispose());
    check(board, black ? reflect : square => square);
  }
}

test.before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-roster-trials-'));
  rules = await createMatchRules({ profile });
  const file = path.join(directory, 'saved.cjs');
  await build({ ...rulesBuildOptions(), bundle: true, platform: 'node', format: 'cjs', outfile: file,
    stdin: { contents: "export * from './src/saved-games.js'; export { VariantGame, initVariantRules } from './src/variant-game.js';", resolveDir: path.resolve(__dirname, '..'), loader: 'js' } });
  api = require(file);
  await api.initVariantRules(profile.variant);
});
test.after(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

test('the archived trial roster preserves all seventeen earlier profiles and remains available', () => {
  assert.equal(PLAYABLE_LIBRARIES.length, 19);
  assert.deepEqual(PLAYABLE_LIBRARIES.slice(0, 17).flatMap(item => [item.json, item.ini]), Object.keys(hashes));
  for (const [file, expected] of Object.entries(hashes)) {
    const bytes = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, file);
  }
  const profiles = getPlayableProfiles();
  for (const [index, old] of PLAYABLE_LIBRARIES.slice(0, 17).entries()) {
    assert.deepEqual(JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', old.json), 'utf8')), profiles[index]);
    assert.equal(fs.readFileSync(path.resolve(__dirname, '..', old.ini), 'utf8'), profiles[index].config);
  }
  const ordered = [...PLAYABLE_LIBRARIES].sort((a, b) => (b.generation || 0) - (a.generation || 0)
    || Number(Boolean(a.superseded)) - Number(Boolean(b.superseded)) || (b.edition || 0) - (a.edition || 0));
  assert.ok(ordered.some(item => item.id === library.id));
  assert.equal(library.name, 'Roster and trials (archive)'); assert.equal(library.edition, 4);
  assert.equal(library.superseded, true);
});

test('twenty custom types include the accepted roster and every new trial with accurate prices, labels and colors', () => {
  assert.equal(profile.registry.definitions.length, 20);
  assert.deepEqual(library.designIds, [...OFFICIAL_REFERENCE_DESIGN_IDS, ...Object.values(V17_ROSTER_CANDIDATES).flat(), ...V17_ROSTER_RESERVE_DESIGN_IDS]);
  const options = getDesignOptions(profile.variant);
  assert.equal(options.length, 20);
  for (const row of TRIALS) {
    const option = options.find(item => item.id === row.id), definition = profile.registry.definitions.find(item => item.id === row.id);
    assert.ok(option); assert.equal(option.level, 3); assert.equal(option.status, 'experimental');
    assert.equal(definition.movement, row.movement);
    assert.match(option.description, row.placement === 'reserve' ? /ordinary royal king keeps its normal moves and castling/ : row.family === 'pawn' ? /Promotes to a standard/ : /moves/);
  }
  for (const [id, movement] of [['pawn.purple@13', 'mRcfB'], ['bishop.purple@18', 'BvWvN'], ['rook.purple@12', 'RC'], ['knight.purple@4', 'N0']]) {
    assert.equal(profile.registry.definitions.find(item => item.id === id).movement, movement);
  }
  for (const id of OFFICIAL_REFERENCE_DESIGN_IDS) assert.equal(options.find(option => option.id === id).accent, 'red');
  for (const id of Object.values(V17_ROSTER_CANDIDATES).flat()) if (options.find(option => option.id === id).level === 3) assert.equal(options.find(option => option.id === id).accent, 'purple');
  for (const [id, accent] of [['pawn.blue@5', 'green'], ['pawn.blue@7', 'blue'], ['pawn.orange@3', 'yellow'], ['pawn.rank-current@1', 'orange']]) assert.equal(options.find(option => option.id === id).accent, accent);
  assert.deepEqual(V17_ROSTER_RESERVE_DESIGN_IDS.map(id => options.find(option => option.id === id).level), [1, 2, 3, 3, 3]);
  assert.deepEqual(V17_ROSTER_RESERVE_DESIGN_IDS.map(id => options.find(option => option.id === id).accent), ['blue', 'green', 'yellow', 'yellow', 'yellow']);
  assert.equal(new Set(V17_ROSTER_RESERVE_DESIGN_IDS.slice(2).map(id => options.find(option => option.id === id).name)).size, 3);
  assert.deepEqual(profile.roles.royalTypes, ['k']);
  assert.equal(profile.roles.reserveTypes.length, 5);
  assert.ok(PLAYABLE_LIBRARIES.every(item => !item.designIds.includes('queen.xray-omni@1')), 'The rejected omnidirectional prototype is not playable.');
});

test('accepted and blocked Vertical bishops retain distinct tall moves in the twenty-type library', t => {
  for (const id of ['bishop.purple@18', ids.vertical]) both(t, id + ' tall blocker', position({ a1: 'K', h7: 'k', d4: type(id), d5: 'P' }), (board, s) => {
    assert.equal(board.moves().includes(s('d4') + s('e6')), id === 'bishop.purple@18');
  });
  both(t, 'blocked vertical slides', position({ a1: 'K', h7: 'k', d4: type(ids.vertical), d6: 'p', e6: 'p' }), (board, s) => {
    assert.ok(board.moves().includes(s('d4') + s('d6')));
    assert.ok(board.moves().includes(s('d4') + s('e6')));
    assert.ok(!board.moves().includes(s('d4') + s('f5')));
  });
});

test('the sideways Queen pawn keeps quiet EP visits and mandatory standard promotions in its playable mapping', t => {
  both(t, 'queen-pawn quiet EP', position({ h1: 'K', h8: 'k', c5: type(ids.pawn), d5: 'p' }, 'w', 'd6'), (board, s) => {
    assert.equal(board.push(s('c5') + s('d6')), true);
    assert.equal(pieceMap(board.fen()).get(s('d5')).toLowerCase(), 'p');
  });
  both(t, 'queen-pawn promotions', position({ h1: 'K', h6: 'k', b7: type(ids.pawn), c8: 'r' }), (board, s) => {
    for (const to of ['b8', 'c8']) {
      const prefix = s('b7') + s(to);
      assert.deepEqual(board.moves().filter(move => move.startsWith(prefix)).sort(), ['b', 'n', 'q', 'r'].map(piece => prefix + piece));
    }
  });
});

test('the Rook-ray queen gains orthogonal hops without diagonal hops, knight moves or the blocked opening Qh5', t => {
  both(t, 'orthogonal xray', position({ a1: 'K', h7: 'k', d4: type(ids.queen), e4: 'P', g4: 'p', h4: 'p' }), (board, s) => {
    for (const to of ['f4', 'g4']) assert.ok(board.moves().includes(s('d4') + s(to)));
    for (const to of ['h4', 'f5', 'e6']) assert.ok(!board.moves().includes(s('d4') + s(to)));
  });
  both(t, 'no diagonal hops', position({ a1: 'K', h7: 'k', d4: type(ids.queen), e5: 'P', g7: 'p' }), (board, s) => {
    for (const to of ['f6', 'g7', 'f5', 'e6']) assert.ok(!board.moves().includes(s('d4') + s(to)), to);
  });
  const start = designSetupFromChoices({ ...defaultDesignChoices(profile), d1: ids.queen }, 3, profile).fen;
  both(t, 'home pawn blocks the opening diagonal', start, (board, s) => {
    assert.ok(!board.moves().includes(s('d1') + s('h5')));
    assert.equal(pieceMap(board.fen()).get(s('e2')).toLowerCase(), 'p');
  });
});

test('all three same-price grants deploy once as capturable nonroyal pieces', t => {
  for (const id of [ids.king, ids.orthogonal, ids.knight]) {
    both(t, id + ' drop', position({ h1: 'K', h8: 'k' }, 'w', '-', type(id)), (board, s) => {
      const move = type(id) + '@' + s('d3');
      assert.ok(board.moves().includes(move)); assert.equal(board.push(move), true);
      assert.equal(pocketLetters(board.fen()), '');
      assert.equal(pieceMap(board.fen()).get(s('h1')).toLowerCase(), 'k');
    });
    both(t, id + ' capture', position({ h1: 'K', a8: 'k', d4: type(id), d8: 'r' }, 'b'), (board, s) => {
      assert.equal(board.push(s('d8') + s('d4')), true);
      assert.equal(pocketLetters(board.fen()), '');
    });
  }
});

test('mixed accepted pieces and new trials retain setup, reserve prices, save, PGN and undo', async t => {
  const choices = { ...defaultDesignChoices(profile), c1: ids.vertical, c2: ids.pawn, e1: ids.king,
    d8: ids.queen, a7: 'pawn.purple@13', e8: ids.knight };
  const setup = designSetupFromChoices(choices, 9, profile);
  assert.deepEqual(setup.costs, { w: 9, b: 9 });
  assert.deepEqual(loadDesignSetup(setup.fen, profile), choices);
  assert.throws(() => designSetupFromChoices(choices, 8, profile), /Budget exceeded/);
  const game = new api.VariantGame(setup.fen, profile.variant); t.after(() => game.dispose());
  const moves = [{ from: 'e2', to: 'e4' }, { from: 'e7', to: 'e5' },
    { drop: type(ids.king).toLowerCase(), to: 'e3' }, { drop: type(ids.knight).toLowerCase(), to: 'e6' },
    { from: 'c2', to: 'c4' }, { from: 'a7', to: 'a5' }, { from: 'c1', to: 'c3' }, { from: 'd8', to: 'd6' }];
  for (const move of moves) assert.ok(game.move(move), JSON.stringify(move));
  const settings = { opponent: 'local', humanSide: 'w', difficulty: 'medium', flipped: false, upgradeBudget: 9 };
  const saved = api.makeSave(game, settings);
  assert.deepEqual(saved.profile, getProfileSnapshot(profile.variant)); assert.deepEqual(saved.setup, { choices, budget: 9 });
  const restored = await api.parseSave(JSON.stringify(saved)); t.after(() => restored.game.dispose());
  const imported = await api.parsePgn(api.exportPgn(game)); t.after(() => imported.dispose());
  for (const copy of [restored.game, imported]) {
    assert.equal(copy.fen(), game.fen()); assert.deepEqual(copy.history(), game.history());
    for (const move of moves) assert.ok(copy.undo());
    assert.deepEqual(loadDesignSetup(copy.fen(), profile), choices);
  }
});

const nativePath = process.env.FAIRY_STOCKFISH_PATH || path.resolve(__dirname, '../node_modules/.cache/levelup-native-values/stockfish');
test('native and browser legal moves agree across the complete twenty-type playable profile', { skip: !fs.existsSync(nativePath), timeout: 120000 }, async t => {
  const ini = path.join(directory, 'roster.ini'); fs.writeFileSync(ini, profile.config);
  const engine = new UciEngine({ path: nativePath, variantPath: ini, variant: profile.variant, options: { threads: 1, hash: 16 } });
  t.after(() => engine.close()); await engine.start();
  const positions = new Map([...profile.capabilityProbes, ...fixtures].map(fixture => [fixture.fen, fixture]));
  for (const { fen, name } of positions.values()) {
    const board = rules.createBoard(fen);
    try { assert.deepEqual(await engine.perft({ fen }), board.moves().sort(), name); }
    finally { board.dispose(); }
  }
  await engine.close(); t.diagnostic(`${positions.size} distinct native/browser fixtures; no searches or scored games.`);
});
