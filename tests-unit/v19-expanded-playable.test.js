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
const { placementFromMap } = require('../src/profile-fen');
const { defaultDesignChoices, designSetupFromChoices, loadDesignSetup } = require('../src/design-setup');
const { PLAYABLE_LIBRARIES, getPlayableProfile, getDesignOptions, pieceInfoForProfile } = require('../src/design-options');
const { getPlayableProfiles } = require('../scripts/playable-profile');
const selected = require('../src/designs-v19-expanded');
const previous = require('../src/designs-v19-panel-ready');
const historical = require('./fixtures/playable-v19-before-expanded-sha256.json');

const ROOT = path.resolve(__dirname, '..');
const IDS = {
  bishop: 'bishop.level1-dabbaba@1', knight: 'knight.level2-forward-zebra@1',
  rook: 'rook.level2-no-tall-back-capture-knight@1', queen2: 'queen.level2-side-knight-side-dabbaba-alfil@1',
  queen3: 'queen.level3-side-threeleap-camel-zebra-tripper@1',
};
const library = level => PLAYABLE_LIBRARIES.find(row => row.id === `v19-level${level}-expanded`);
const profile = level => getPlayableProfile(library(level).variant);
const type = (value, id) => value.registry.allocations.find(row => row.id === id).letter.toUpperCase();
const reflect = square => square[0] + (9 - Number(square[1]));
const swap = piece => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase();
const kings = { a8: 'K', h1: 'k' };
const blockers = { c3: 'P', c4: 'P', c5: 'P', d3: 'P', d5: 'P', e3: 'P', e4: 'P', e5: 'P' };
function fen(pieces, black = false, castling = '-') {
  const map = new Map(Object.entries(pieces).map(([square, piece]) => black ? [reflect(square), swap(piece)] : [square, piece]));
  return `${placementFromMap(map)} ${black ? 'b' : 'w'} ${black ? castling.toLowerCase() : castling} - 0 1`;
}
function destinations(rules, value, id, pieces, black = false) {
  const square = black ? reflect('d4') : 'd4', board = rules.createBoard(fen({ ...pieces, d4: type(value, id) }, black));
  try {
    return board.moves().filter(move => move.startsWith(square))
      .map(move => black ? reflect(move.slice(2, 4)) : move.slice(2, 4)).sort();
  } finally { board.dispose(); }
}

test('expanded editions retain every earlier profile byte and contain only the five selected alternatives', () => {
  for (const [file, expected] of Object.entries(historical)) {
    const bytes = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, file);
  }
  assert.deepEqual(selected.TIERS.map(tier => tier.bodies.length), [12, 15, 13]);
  assert.deepEqual(selected.NEW_DEFINITIONS.map(row => row.id).sort(), Object.values(IDS).sort());
  const compiled = getPlayableProfiles();
  for (const level of [1, 2, 3]) {
    const edition = library(level), value = profile(level), options = getDesignOptions(value.variant);
    assert.ok(edition && !edition.superseded);
    assert.deepEqual(value, compiled[PLAYABLE_LIBRARIES.indexOf(edition)]);
    assert.equal(value.registry.definitions.length, { 1: 12, 2: 15, 3: 13 }[level]);
    assert.deepEqual(options.map(row => row.id).sort(), selected.getTierRoster(level).map(row => row.id).sort());
    for (const old of previous.getTierRoster(level)) assert.deepEqual(selected.getTierRoster(level).find(row => row.id === old.id), old);
    for (const body of selected.getTierRoster(level)) assert.deepEqual(value.evaluation.pieceValues[body.id], body.prior);
    assert.ok(!options.some(row => ['knight.level2-zebra@1', 'knight.level2-zebra-alfil@1', 'bishop.level1-quiet-dabbaba@1'].includes(row.id)));
  }
});

test('all alternatives share their existing choice color, expose correct prices and resolve through their actual mapped piece', () => {
  for (const body of selected.ALL_BODIES.filter(row => row.alternativeTo)) {
    const value = profile(body.level), options = getDesignOptions(value.variant);
    const option = options.find(row => row.id === body.id), anchor = options.find(row => row.id === body.alternativeTo);
    assert.ok(option && anchor, body.id);
    assert.equal(option.accent, anchor.accent, body.id);
    assert.equal(option.status, 'alternative'); assert.equal(option.alternativeTo, anchor.id);
    assert.equal(option.level, body.level); assert.ok(option.name && option.description && !/undefined/.test(option.description));
    const info = pieceInfoForProfile(value, type(value, body.id));
    assert.equal(info.designId, body.id); assert.equal(info.cost, body.level); assert.equal(info.accent, anchor.accent);
    assert.equal(info.family, body.family); assert.equal(info.status, 'alternative');
    assert.ok(value.capabilityProbes.some(probe => probe.name.includes(body.id)), body.id);
  }
});

test('the five playable mappings retain their jumps, capture limits and royal safety in both colors', async () => {
  const expected = new Map([
    [IDS.bishop, ['b4', 'd2', 'd6', 'f4']],
    [IDS.knight, ['a6', 'b3', 'b5', 'b7', 'c2', 'c6', 'e2', 'e6', 'f3', 'f5', 'f7', 'g6']],
    [IDS.rook, []],
    [IDS.queen2, ['b2', 'b3', 'b4', 'b5', 'b6', 'f2', 'f3', 'f4', 'f5', 'f6']],
    [IDS.queen3, ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7']],
  ]);
  for (const level of [1, 2, 3]) {
    const value = profile(level), rules = await createMatchRules({ profile: value });
    for (const body of selected.getTierRoster(level).filter(row => row.alternativeTo)) for (const black of [false, true]) {
      assert.deepEqual(destinations(rules, value, body.id, { ...kings, ...blockers }, black), expected.get(body.id), body.id);
      const jumps = body.id === IDS.rook ? ['b3', 'b5', 'c6', 'e6', 'f3', 'f5'] : expected.get(body.id);
      for (const target of jumps) {
        assert.ok(destinations(rules, value, body.id, { ...kings, ...blockers, [target]: 'p' }, black).includes(target), body.id + ':' + target);
        assert.ok(!destinations(rules, value, body.id, { ...kings, ...blockers, [target]: 'P' }, black).includes(target));
      }
      if (body.id === IDS.rook) for (const target of ['c2', 'e2']) {
        assert.ok(!destinations(rules, value, body.id, { ...kings, ...blockers, [target]: 'p' }, black).includes(target));
      }
      const pinned = destinations(rules, value, body.id, { d1: 'K', h7: 'k', d8: 'r' }, black);
      assert.ok(pinned.every(target => target[0] === 'd'), body.id + ' royal safety');
    }
    if (level === 2) for (const black of [false, true]) {
      const rook = type(value, IDS.rook), board = rules.createBoard(fen({ a1: rook, e1: 'K', h1: rook, e8: 'k' }, black, 'KQ'));
      const source = black ? 'e8' : 'e1';
      try { for (const target of black ? ['g8', 'c8'] : ['g1', 'c1']) assert.ok(board.moves().includes(source + target)); }
      finally { board.dispose(); }
      const transit = rules.createBoard(fen({ e1: 'K', h1: 'R', e2: 'P', e8: 'k', e3: rook.toLowerCase() }, black, 'K'));
      try { assert.ok(!transit.moves().includes(black ? 'e8g8' : 'e1g1')); }
      finally { transit.dispose(); }
    }
  }
});

test('setup, save, PGN and undo preserve all alternatives, including three bought together in the L2 army', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v19-expanded-save-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const output = path.join(directory, 'save.cjs');
  await build({ ...rulesBuildOptions(), bundle: true, platform: 'node', format: 'cjs', outfile: output,
    stdin: { contents: "export * from './src/saved-games.js'; export { VariantGame, initVariantRules } from './src/variant-game.js';", resolveDir: ROOT, loader: 'js' } });
  const api = require(output);
  const cases = [
    { level: 1, budget: 1, choices: { c1: IDS.bishop, c8: IDS.bishop }, moves: ['c1c3', 'c8c6', 'h2h3', 'h7h6'] },
    { level: 2, budget: 6, choices: { b1: IDS.knight, b8: IDS.knight, a1: IDS.rook, a8: IDS.rook, d1: IDS.queen2, d8: IDS.queen2 },
      moves: ['a2a4', 'a7a5', 'd1b3', 'd8b6', 'b1d4', 'b8d5', 'a1a3', 'a8a6'] },
    { level: 3, budget: 3, choices: { d1: IDS.queen3, d8: IDS.queen3 }, moves: ['d1g4', 'd8g5', 'h2h3', 'h7h6'] },
  ];
  for (const scenario of cases) {
    const value = profile(scenario.level); await api.initVariantRules(value.variant);
    const choices = { ...defaultDesignChoices(value), ...scenario.choices }, setup = designSetupFromChoices(choices, scenario.budget, value);
    assert.deepEqual(setup.costs, { w: scenario.budget, b: scenario.budget });
    if (scenario.level === 1) assert.throws(() => designSetupFromChoices({ ...choices, f1: IDS.bishop }, 1, value), /Budget exceeded/);
    else assert.throws(() => designSetupFromChoices(choices, scenario.budget - 1, value), /Budget exceeded/);
    const game = new api.VariantGame(setup.fen, value.variant); t.after(() => game.dispose());
    for (const uci of scenario.moves) assert.ok(game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4) }), uci);
    const save = api.makeSave(game, { opponent: 'local', humanSide: 'w', difficulty: 'medium', flipped: false, upgradeBudget: scenario.budget });
    assert.deepEqual(save.setup, { choices, budget: scenario.budget });
    const restored = await api.parseSave(JSON.stringify(save)), imported = await api.parsePgn(api.exportPgn(game));
    t.after(() => restored.game.dispose()); t.after(() => imported.dispose());
    for (const copy of [restored.game, imported]) {
      assert.equal(copy.fen(), game.fen()); assert.equal(copy.profile.hash, value.hash);
      for (const uci of scenario.moves) assert.ok(copy.undo(), uci);
      assert.deepEqual(loadDesignSetup(copy.fen(), value), choices);
    }
  }
});

test('native Stockfish agrees with each expanded playable probe inventory and all six new-piece value tables', { timeout: 120000 }, async t => {
  const native = process.env.FAIRY_STOCKFISH_PATH || path.join(ROOT, 'node_modules/.cache/levelup-native-values/stockfish');
  if (!fs.existsSync(native)) { t.skip('Set FAIRY_STOCKFISH_PATH for native verification.'); return; }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v19-expanded-native-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const level of [1, 2, 3]) {
    const value = profile(level), rules = await createMatchRules({ profile: value }), file = path.join(directory, `level${level}.ini`);
    fs.writeFileSync(file, value.config);
    const engine = new UciEngine({ path: native, variantPath: file, variant: value.variant, options: { threads: 1, hash: 16 } });
    try {
      await engine.start(); const tables = (await engine.pieceValues()).pieces;
      for (const body of selected.getTierRoster(level).filter(row => row.alternativeTo)) for (const letter of [type(value, body.id), type(value, body.id).toLowerCase()]) {
        for (const key of ['rawMg', 'captureMg', 'evalMg']) assert.equal(tables[letter][key], body.prior.mg, body.id);
        for (const key of ['rawEg', 'captureEg', 'evalEg']) assert.equal(tables[letter][key], body.prior.eg, body.id);
      }
      for (const probe of value.capabilityProbes) {
        const board = rules.createBoard(probe.fen);
        try { assert.deepEqual(await engine.perft({ fen: probe.fen }), board.moves().sort(), probe.name); }
        finally { board.dispose(); }
      }
    } finally { await engine.close(); }
  }
});
