'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { rulesBuildOptions } = require('../scripts/rules-build');
const { OPPONENT_MODES, isOpponentMode, isEngineMode, engineControlsSide,
  canHumanMove, canRequestEngineMove } = require('../src/engine-play');
const { PLAYABLE_LIBRARIES } = require('../src/playable-library');
const { getPlayableProfiles } = require('../scripts/playable-profile');
const { defaultDesignChoices, designSetupFromChoices } = require('../src/design-setup');
const { ChessClock } = require('../src/clock');

const ready = { opponent: 'selfplay', turn: 'w', humanSide: 'w', connected: true,
  busy: false, paused: false, pending: null, editingSetup: false, finished: false, canPlay: true };
const settings = { opponent: 'selfplay', humanSide: 'w', difficulty: 'medium', flipped: false, upgradeBudget: 5 };

test('engine and human ownership are explicit for both colors and every opponent mode', () => {
  assert.deepEqual(OPPONENT_MODES, ['local', 'engine', 'selfplay']);
  for (const mode of OPPONENT_MODES) {
    assert.equal(isOpponentMode(mode), true);
    assert.equal(isEngineMode(mode), mode !== 'local');
    for (const turn of ['w', 'b']) for (const humanSide of ['w', 'b']) {
      assert.equal(engineControlsSide(mode, turn, humanSide), mode === 'selfplay' || mode === 'engine' && turn !== humanSide);
      assert.equal(canHumanMove(mode, turn, humanSide), mode === 'local' || mode === 'engine' && turn === humanSide);
    }
  }
  for (const value of [undefined, null, '', 'watch', 'SELFPLAY']) {
    assert.equal(isOpponentMode(value), false); assert.equal(isEngineMode(value), false);
    assert.equal(engineControlsSide(value, 'w', 'b'), false); assert.equal(canHumanMove(value, 'w', 'w'), false);
  }
  assert.equal(engineControlsSide('selfplay', 'invalid'), false);
  assert.equal(canHumanMove('local', 'invalid'), false);
});

test('both self-play sides can search but an in-flight request, stop or unavailable board blocks another', () => {
  for (const turn of ['w', 'b']) assert.equal(canRequestEngineMove({ ...ready, turn }), true);
  for (const changed of [{ connected: false }, { busy: true }, { paused: true }, { pending: { promotion: true } },
    { editingSetup: true }, { finished: true }, { canPlay: false }, { opponent: 'local' }, { turn: 'invalid' }]) {
    assert.equal(canRequestEngineMove({ ...ready, ...changed }), false, JSON.stringify(changed));
  }
  assert.equal(canRequestEngineMove({ ...ready, opponent: 'engine', turn: 'w' }), false);
  assert.equal(canRequestEngineMove({ ...ready, opponent: 'engine', turn: 'b' }), true);
  assert.equal(canRequestEngineMove(), false);
});

test('single-step bypasses only self-play pause and cannot create a second request or manual move', () => {
  const step = { ...ready, paused: true, stepRequested: true };
  assert.equal(canRequestEngineMove(step), true);
  for (const changed of [{ busy: true }, { connected: false }, { pending: true }, { editingSetup: true },
    { finished: true }, { canPlay: false }, { stepRequested: false }, { stepRequested: 'true' }, { opponent: 'engine' }]) {
    assert.equal(canRequestEngineMove({ ...step, ...changed }), false, JSON.stringify(changed));
  }
  // Simulate consuming the one-step intent before the async operation starts.
  const inFlight = { ...step, stepRequested: false, busy: true };
  assert.equal(canRequestEngineMove(inFlight), false);
  const completed = { ...inFlight, busy: false, turn: 'b' };
  assert.equal(canRequestEngineMove(completed), false);
  assert.equal(canHumanMove('selfplay', 'b', 'w'), false);
});

let api, directory;
test.before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-selfplay-saves-'));
  const outfile = path.join(directory, 'api.cjs');
  await build({ ...rulesBuildOptions(), bundle: true, platform: 'node', format: 'cjs', outfile,
    stdin: { contents: "export * from './src/saved-games.js'; export { VariantGame, initVariantRules } from './src/variant-game.js'; export { Chess } from 'chess.js';", resolveDir: path.resolve(__dirname, '..'), loader: 'js' } });
  api = require(outfile);
});
test.after(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

test('ordinary self-play saves preserve the game, selected mode and paused clocks', async () => {
  const game = new api.Chess();
  const clock = new ChessClock('five'); clock.start('w');
  game.move('e4'); assert.ok(clock.completeMove('w', 'b'));
  game.move('e5'); assert.ok(clock.completeMove('b', 'w'));
  const saved = api.makeSave(game, settings, clock.snapshot());
  const restored = await api.parseSave(JSON.stringify(saved));
  assert.deepEqual(restored.settings, settings);
  assert.equal(restored.game.fen(), game.fen());
  assert.deepEqual(restored.game.history(), game.history());
  const recovered = new ChessClock(); recovered.restore(restored.clock, restored.game.history().length);
  assert.equal(recovered.running, false);
  assert.equal(recovered.active, 'w');
});

test('self-play accepts the selected variant profile and never relaxes the other saved settings', async t => {
  const library = PLAYABLE_LIBRARIES.find(row => row.id === 'v18-roster-confirmed');
  const profile = getPlayableProfiles()[PLAYABLE_LIBRARIES.indexOf(library)];
  await api.initVariantRules(profile.variant);
  const choices = { ...defaultDesignChoices(profile), d2: 'pawn.knight-tall-quiet@1', a1: 'rook.cataphract-no-tall-back@1' };
  const setup = designSetupFromChoices(choices, 5, profile);
  const game = new api.VariantGame(setup.fen, profile.variant); t.after(() => game.dispose());
  assert.ok(game.move({ from: 'd2', to: 'c4' }));
  const saved = api.makeSave(game, settings);
  const restored = await api.parseSave(JSON.stringify(saved)); t.after(() => restored.game.dispose());
  assert.equal(restored.game.variant, profile.variant);
  assert.deepEqual(restored.settings, settings);
  assert.deepEqual(restored.game.history(), game.history());
  assert.deepEqual(restored.game.profile.registry, profile.registry);
  for (const change of [{ opponent: 'watch' }, { humanSide: 'any' }, { difficulty: 'unknown' }, { flipped: 'false' }]) {
    await assert.rejects(api.parseSave(JSON.stringify({ ...saved, settings: { ...saved.settings, ...change } })), /settings are damaged/);
  }
  for (const opponent of ['local', 'engine']) {
    const oldMode = await api.parseSave(JSON.stringify({ ...saved, settings: { ...saved.settings, opponent } }));
    t.after(() => oldMode.game.dispose()); assert.equal(oldMode.settings.opponent, opponent);
  }
});
