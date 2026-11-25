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
const selected = require('../src/designs-v19-current');
const previous = require('../src/designs-v19-revised');
const { getDesign } = require('../src/design-catalog');
const { PLAYABLE_LIBRARIES, getPlayableProfile, getDesignOptions } = require('../src/design-options');
const { getPlayableProfiles } = require('../scripts/playable-profile');
const { defaultDesignChoices, designSetupFromChoices, loadDesignSetup } = require('../src/design-setup');
const historical = require('./fixtures/playable-v19-before-selection-sha256.json');
const ROOT = path.resolve(__dirname, '..');
const QUEEN = 'queen.level1-wide-forward-knight@1', PAWN = 'pawn.level2-forward-queen-only@1';
const library = level => PLAYABLE_LIBRARIES.find(row => row.id === `v19-level${level}-current`);
const profile = level => getPlayableProfile(library(level).variant);
const hash = file => createHash('sha256').update(fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n')).digest('hex');

test('selected queen and pawn reuse their exact tested definitions without altering historical artifacts or panel declarations', () => {
  for (const [file, expected] of Object.entries(historical)) assert.equal(hash(file), expected, file);
  assert.equal(hash(selected.ROSTER_FILE), selected.ROSTER_SHA256);
  assert.equal(hash(selected.VALUES_FILE), selected.VALUES_SHA256);
  assert.deepEqual(selected.getTierRoster(1).filter(body => body.family === 'queen').map(body => body.id), ['queen.level1-forward-knight@1', QUEEN]);
  assert.deepEqual(selected.getTierRoster(2).filter(body => body.family === 'pawn').map(body => body.id), ['pawn.knight-tall-quiet@1', 'pawn.rank-current@1', PAWN]);
  for (const level of [1, 2, 3]) assert.deepEqual(selected.getTier(level).referenceIds, previous.getTier(level).referenceIds);
  assert.deepEqual(selected.getTierRoster(3), previous.getTierRoster(3));
  const trialQueen = require('../src/balance-designs-v19-trials').NEW_DEFINITIONS.find(row => row.id === QUEEN);
  const trialPawn = require('../src/balance-designs-v19-pawn-followup').NEW_DEFINITIONS.find(row => row.id === PAWN);
  assert.deepEqual(getDesign(QUEEN), trialQueen); assert.deepEqual(getDesign(PAWN), trialPawn);
  assert.equal(getDesign('queen.level1-box-jumps@1'), undefined);
  assert.equal(getDesign('pawn.level2-quiet-range-forward-bishop@1'), undefined);
  assert.deepEqual(require('../scripts/balance/v19-panel-plan').buildCampaignPlan({ study: 'level2', jobs: 4 }).roster.map(row => row.id), previous.getTierRoster(2).map(row => row.id));
});

test('current profiles expose the selected choices at their declared costs and colors while preserving earlier libraries', () => {
  const compiled = getPlayableProfiles();
  for (const level of [1, 2]) {
    const row = library(level), value = profile(level), options = getDesignOptions(value.variant);
    assert.ok(row && !row.superseded);
    assert.deepEqual(value, compiled[PLAYABLE_LIBRARIES.indexOf(row)]);
    assert.equal(value.registry.definitions.length, level === 1 ? 11 : 12);
    assert.deepEqual(options.map(option => option.id).sort(), selected.getTierRoster(level).map(body => body.id).sort());
    for (const body of selected.getTierRoster(level)) assert.deepEqual(value.evaluation.pieceValues[body.id], body.prior);
    assert.ok(value.capabilityProbes.some(probe => probe.name.includes(level === 1 ? QUEEN : PAWN)));
  }
  const queen = getDesignOptions(profile(1).variant).find(option => option.id === QUEEN);
  assert.equal(queen.level, 1); assert.equal(queen.accent, 'blue'); assert.match(queen.description, /wide|two files/i);
  assert.ok(!getDesignOptions(profile(1).variant).some(option => option.id === 'queen.level1-tall-knight@1'));
  const pawn = getDesignOptions(profile(2).variant).find(option => option.id === PAWN);
  assert.equal(pawn.level, 2); assert.equal(pawn.accent, 'yellow'); assert.match(pawn.description, /two|2/);
  const oldQueen = getPlayableProfile(PLAYABLE_LIBRARIES.find(row => row.id === 'v19-level1').variant);
  assert.ok(getDesignOptions(oldQueen.variant).some(option => option.id === 'queen.level1-tall-knight@1'));
  const oldPawn = getPlayableProfile(PLAYABLE_LIBRARIES.find(row => row.id === 'v19-level2-revised').variant);
  assert.ok(!getDesignOptions(oldPawn.variant).some(option => option.id === PAWN));
});

test('chosen upgrades preserve their profiles through actual setup, saved games, PGN and undo', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v19-current-save-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const output = path.join(directory, 'save.cjs');
  await build({ ...rulesBuildOptions(), bundle: true, platform: 'node', format: 'cjs', outfile: output,
    stdin: { contents: "export * from './src/saved-games.js'; export { VariantGame, initVariantRules } from './src/variant-game.js';", resolveDir: ROOT, loader: 'js' } });
  const api = require(output);
  for (const [level, id, homes, moves] of [
    [1, QUEEN, ['d1', 'd8'], [['e2', 'e4'], ['e7', 'e5'], ['d1', 'e2'], ['d8', 'e7'], ['e2', 'c3'], ['e7', 'c6']]],
    [2, PAWN, ['c2', 'c7'], [['c2', 'd3'], ['c7', 'd6'], ['d3', 'd5'], ['d6', 'f4']]],
  ]) {
    const value = profile(level); await api.initVariantRules(value.variant);
    const choices = { ...defaultDesignChoices(value), [homes[0]]: id, [homes[1]]: id }, setup = designSetupFromChoices(choices, level, value);
    assert.deepEqual(setup.costs, { w: level, b: level });
    if (level === 2) assert.throws(() => designSetupFromChoices(choices, 1, value), /Budget exceeded/);
    const game = new api.VariantGame(setup.fen, value.variant); t.after(() => game.dispose());
    for (const [from, to] of moves) assert.ok(game.move({ from, to }), `${id}: ${from}${to}`);
    const save = api.makeSave(game, { opponent: 'local', humanSide: 'w', difficulty: 'medium', flipped: false, upgradeBudget: level });
    const restored = await api.parseSave(JSON.stringify(save)), imported = await api.parsePgn(api.exportPgn(game));
    t.after(() => restored.game.dispose()); t.after(() => imported.dispose());
    for (const copy of [restored.game, imported]) {
      assert.equal(copy.fen(), game.fen()); assert.equal(copy.profile.hash, value.hash);
      for (const move of moves) assert.ok(copy.undo());
      assert.deepEqual(loadDesignSetup(copy.fen(), value), choices);
    }
  }
});

test('actual playable mappings agree with native movement and all six applied value tables', { timeout: 120000 }, async t => {
  const native = process.env.FAIRY_STOCKFISH_PATH || path.join(ROOT, 'node_modules/.cache/levelup-native-values/stockfish');
  if (!fs.existsSync(native)) { t.skip('Set FAIRY_STOCKFISH_PATH for native verification.'); return; }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v19-current-native-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const [level, id, mg, eg] of [[1, QUEEN, 2771, 2833], [2, PAWN, 536, 592]]) {
    const value = profile(level), rules = await createMatchRules({ profile: value });
    const file = path.join(directory, `tier${level}.ini`); fs.writeFileSync(file, value.config);
    const engine = new UciEngine({ path: native, variantPath: file, variant: value.variant, options: { threads: 1, hash: 16 } });
    try {
      await engine.start(); const tables = (await engine.pieceValues()).pieces;
      const letter = value.registry.allocations.find(row => row.id === id).letter;
      for (const piece of [letter, letter.toUpperCase()]) {
        for (const field of ['rawMg', 'captureMg', 'evalMg']) assert.equal(tables[piece][field], mg);
        for (const field of ['rawEg', 'captureEg', 'evalEg']) assert.equal(tables[piece][field], eg);
      }
      for (const probe of value.capabilityProbes) {
        const board = rules.createBoard(probe.fen);
        try { assert.deepEqual(await engine.perft({ fen: probe.fen }), board.moves().sort(), probe.name); }
        finally { board.dispose(); }
      }
    } finally { await engine.close(); }
  }
});
