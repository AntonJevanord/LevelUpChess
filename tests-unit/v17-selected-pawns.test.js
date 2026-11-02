'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { build } = require('esbuild');
const { rulesBuildOptions } = require('../scripts/rules-build');
const hashes = require('./fixtures/playable-initial16-sha256.json');
const { PLAYABLE_LIBRARIES, V17_SELECTED_PAWN_CANDIDATES, OFFICIAL_REFERENCE_DESIGN_IDS, V17_RESERVE_DESIGN_IDS } = require('../src/playable-library');
const { getPlayableProfiles } = require('../scripts/playable-profile');
const { getDesignOptions, getProfileSnapshot } = require('../src/design-options');
const { defaultDesignChoices, designSetupFromChoices, loadDesignSetup } = require('../src/design-setup');
const { pieceMap, placementFromMap, pocketLetters } = require('../src/profile-fen');
const { createMatchRules } = require('../dist/balance-rules.cjs');
const { UciEngine } = require('../scripts/balance/uci');

const library = PLAYABLE_LIBRARIES.find(item => item.id === 'v17-pawns-selected');
const profile = getPlayableProfiles()[PLAYABLE_LIBRARIES.indexOf(library)];
const ids = { knight: 'pawn.orange@3', rank: 'pawn.rank-current@1', grant: 'king.reserve-bishop@1' };
const type = id => profile.registry.allocations.find(item => item.id === id).letter.toUpperCase();
const reflect = square => square[0] + (9 - Number(square[1]));
const swap = value => value.replace(/[a-z]/gi, char => char === char.toUpperCase() ? char.toLowerCase() : char.toUpperCase());
const fixtures = [];
let rules, api, directory;
function position(pieces, turn = 'w', ep = '-', pocket = '') {
  const map = new Map(Object.entries(pieces)); map.pocket = pocket;
  return `${placementFromMap(map)} ${turn} - ${ep} 0 1`;
}
function opposite(fen) {
  const fields = fen.split(' ');
  fields[0] = swap(fields[0].split('[')[0].split('/').reverse().join('/')) + (fen.includes('[') ? '[' + swap(pocketLetters(fen)) + ']' : '');
  fields[1] = fields[1] === 'w' ? 'b' : 'w';
  if (fields[3] !== '-') fields[3] = fields[3].match(/[a-h][1-8]/g).map(reflect).join('');
  return fields.join(' ');
}
function both(t, name, fen, check) {
  for (const color of ['w', 'b']) {
    const input = color === 'w' ? fen : opposite(fen);
    fixtures.push({ name: `${name} (${color})`, fen: input });
    const board = rules.createBoard(input);
    t.after(() => board.dispose());
    check(board, color === 'w' ? square => square : reflect, color);
  }
}

test.before(async () => {
  rules = await createMatchRules({ profile });
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-selected-pawns-'));
  const outfile = path.join(directory, 'facade.cjs');
  await build({ ...rulesBuildOptions(), bundle: true, platform: 'node', format: 'cjs', outfile,
    stdin: { contents: "export * from './src/saved-games.js'; export { VariantGame, initVariantRules } from './src/variant-game.js';",
      resolveDir: path.resolve(__dirname, '..'), loader: 'js' } });
  api = require(outfile);
  await api.initVariantRules(profile.variant);
});
test.after(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

test('the selected workshop preserves all sixteen earlier profile artifacts and identities', () => {
  const profiles = getPlayableProfiles();
  assert.equal(PLAYABLE_LIBRARIES.length, 17);
  assert.deepEqual(PLAYABLE_LIBRARIES.slice(0, 16).flatMap(item => [item.json, item.ini]), Object.keys(hashes));
  for (const [file, expected] of Object.entries(hashes)) {
    const bytes = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, file);
  }
  for (const [index, old] of PLAYABLE_LIBRARIES.slice(0, 16).entries()) {
    assert.deepEqual(JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', old.json), 'utf8')), profiles[index]);
    assert.equal(fs.readFileSync(path.resolve(__dirname, '..', old.ini), 'utf8'), profiles[index].config);
  }
  const ordered = [...PLAYABLE_LIBRARIES].sort((a, b) => (b.generation || 0) - (a.generation || 0)
    || Number(Boolean(a.superseded)) - Number(Boolean(b.superseded)) || (b.edition || 0) - (a.edition || 0));
  assert.equal(ordered[0].id, library.id);
  assert.equal(library.edition, 3);
  assert.equal(library.name, 'Pawn workshop');
  assert.equal(PLAYABLE_LIBRARIES.find(item => item.id === 'v17-pawns-revised').name, 'Pawn workshop (bishop trial)');
});

test('the picker exposes the selected two-point pawns with stable colors and a finite diagonal grant', () => {
  assert.equal(profile.registry.definitions.length, 19);
  assert.deepEqual(library.designIds, [...OFFICIAL_REFERENCE_DESIGN_IDS, ...V17_SELECTED_PAWN_CANDIDATES, ...V17_RESERVE_DESIGN_IDS]);
  const options = getDesignOptions(profile.variant);
  assert.deepEqual(options.filter(option => option.family === 'pawn' && option.level === 2).map(option => option.id), [ids.knight, ids.rank]);
  for (const [id, name, accent] of [[ids.knight, 'Knight pawn', 'yellow'], [ids.rank, 'Rank pawn', 'orange'], [ids.grant, 'Bishop grant', 'green']]) {
    const option = options.find(item => item.id === id);
    assert.equal(option.level, 2); assert.equal(option.name, name); assert.equal(option.accent, accent);
    assert.equal(option.status, 'experimental');
  }
  const rank = options.find(option => option.id === ids.rank);
  assert.match(rank.description, /any clear distance sideways/);
  assert.match(rank.description, /en passant/);
  assert.match(rank.description, /cannot jump/);
  assert.match(rank.description, /Promotes to a standard queen, rook, bishop, or knight/);
  assert.deepEqual(profile.roles.royalTypes, ['k']);
  assert.equal(profile.roles.reserveTypes.length, 9);
  assert.match(profile.config, /dropChecks = false/);
});

test('the Rank pawn controls clear ranks without jumping blockers or gaining backward moves', t => {
  both(t, 'clear rank', position({ h1: 'K', h7: 'k', d4: type(ids.rank), a4: 'p', c5: 'p' }), (board, square) => {
    for (const target of ['a4', 'b4', 'c4', 'e4', 'f4', 'g4', 'h4', 'd5', 'c5']) assert.ok(board.moves().includes(square('d4') + square(target)), target);
    for (const target of ['d3', 'c3', 'e3', 'd6', 'e5']) assert.ok(!board.moves().includes(square('d4') + square(target)), target);
  });
  both(t, 'rank blockers', position({ h1: 'K', h7: 'k', d4: type(ids.rank), c4: 'P', a4: 'p', e4: 'p', f4: 'p', d5: 'P' }), (board, square) => {
    assert.ok(board.moves().includes(square('d4') + square('e4')));
    for (const target of ['c4', 'b4', 'a4', 'f4', 'd5', 'd6']) assert.ok(!board.moves().includes(square('d4') + square(target)), target);
  });
});

test('selected pawns retain real en-passant capture, initial double vulnerability and mandatory standard promotion', t => {
  for (const id of [ids.knight, ids.rank]) {
    both(t, id + ' en-passant capture', position({ h1: 'K', h8: 'k', c5: type(id), d5: 'p' }, 'w', 'd6'), (board, square) => {
      assert.equal(board.push(square('c5') + square('d6')), true);
      assert.ok(!pieceMap(board.fen()).has(square('d5')));
    });
    both(t, id + ' double-step victim', position({ h1: 'K', h8: 'k', d2: type(id), e4: 'p' }), (board, square) => {
      assert.equal(board.push(square('d2') + square('d4')), true);
      fixtures.push({ name: id + ' after double advance', fen: board.fen() });
      assert.equal(board.push(square('e4') + square('d3')), true);
      assert.ok(!pieceMap(board.fen()).has(square('d4')));
    });
    both(t, id + ' promotion', position({ h1: 'K', h6: 'k', b7: type(id) }), (board, square) => {
      const prefix = square('b7') + square('b8');
      assert.deepEqual(board.moves().filter(move => move.startsWith(prefix)).sort(), ['b', 'n', 'q', 'r'].map(piece => prefix + piece));
      assert.equal(board.push(prefix + 'q'), true);
      assert.equal(pieceMap(board.fen()).get(square('b8')).toLowerCase(), 'q');
    });
  }
});

test('the selected Knight pawn keeps all four forward jumps and the diagonal grant keeps finite legal drops', t => {
  both(t, 'forward jumps', position({ h1: 'K', h7: 'k', d4: type(ids.knight), c5: 'P', d5: 'P', e5: 'P', b5: 'p', f5: 'p', c6: 'p', e6: 'p' }), (board, square) => {
    for (const target of ['b5', 'f5', 'c6', 'e6']) assert.ok(board.moves().includes(square('d4') + square(target)), target);
    for (const target of ['b3', 'f3', 'c2', 'e2']) assert.ok(!board.moves().includes(square('d4') + square(target)), target);
  });
  both(t, 'finite diagonal grant', position({ h1: 'K', d5: 'k' }, 'w', '-', type(ids.grant)), (board, square) => {
    const prefix = type(ids.grant) + '@';
    assert.ok(!board.moves().includes(prefix + square('c4')), 'Checking diagonal drops are forbidden.');
    assert.ok(!board.moves().includes(prefix + square('c5')), 'Drops stay in the own half.');
    assert.equal(board.push(prefix + square('c3')), true);
    assert.equal(pocketLetters(board.fen()), '');
    assert.equal(pieceMap(board.fen()).get(square('h1')).toLowerCase(), 'k');
  });
});

test('selected pawn purchases and deployed grants survive saves, PGN and full undo', async t => {
  const choices = { ...defaultDesignChoices(profile), b2: ids.knight, c2: ids.rank, e1: ids.grant,
    b7: ids.knight, c7: ids.rank, e8: ids.grant };
  const setup = designSetupFromChoices(choices, 6, profile);
  assert.deepEqual(setup.costs, { w: 6, b: 6 });
  assert.deepEqual(loadDesignSetup(setup.fen, profile), choices);
  const game = new api.VariantGame(setup.fen, profile.variant); t.after(() => game.dispose());
  const initial = game.fen();
  const moves = [
    { from: 'c2', to: 'c4' }, { from: 'c7', to: 'c5' }, { from: 'c4', to: 'a4' }, { from: 'c5', to: 'a5' },
    { drop: type(ids.grant).toLowerCase(), to: 'd4' }, { drop: type(ids.grant).toLowerCase(), to: 'd5' },
    { from: 'b2', to: 'c4' }, { from: 'b7', to: 'c5' },
  ];
  for (const move of moves) assert.ok(game.move(move), JSON.stringify(move));
  const settings = { opponent: 'local', humanSide: 'w', difficulty: 'medium', flipped: false, upgradeBudget: 6 };
  const saved = api.makeSave(game, settings);
  assert.equal(saved.profile.hash, profile.hash);
  assert.deepEqual(saved.profile, getProfileSnapshot(profile.variant));
  assert.deepEqual(saved.setup, { choices, budget: 6 });
  const loaded = await api.parseSave(JSON.stringify(saved)); t.after(() => loaded.game.dispose());
  const imported = await api.parsePgn(api.exportPgn(game)); t.after(() => imported.dispose());
  for (const restored of [loaded.game, imported]) {
    assert.equal(restored.fen(), game.fen());
    assert.deepEqual(restored.history(), game.history());
    for (const move of moves) assert.ok(restored.undo());
    assert.equal(restored.fen(), initial);
    assert.deepEqual(loadDesignSetup(restored.fen(), profile), choices);
  }
});

const nativePath = process.env.FAIRY_STOCKFISH_PATH || path.resolve(__dirname, '../node_modules/.cache/levelup-native-values/stockfish');
test('native and browser rules agree on the selected profile and both-color pawn fixtures', { skip: !fs.existsSync(nativePath), timeout: 120000 }, async t => {
  const ini = path.join(directory, 'selected.ini'); fs.writeFileSync(ini, profile.config);
  const engine = new UciEngine({ path: nativePath, variantPath: ini, variant: profile.variant, options: { threads: 1, hash: 16 } });
  t.after(() => engine.close());
  await engine.start();
  const inputs = new Map([...profile.capabilityProbes, ...fixtures].map(fixture => [fixture.fen, fixture]));
  for (const { fen, name } of inputs.values()) {
    const board = rules.createBoard(fen);
    try { assert.deepEqual(await engine.perft({ fen }), board.moves().sort(), name); }
    finally { board.dispose(); }
  }
  await engine.close();
  t.diagnostic(`${inputs.size} distinct native/browser fixtures; no search or scored games.`);
});
