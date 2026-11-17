'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { build } = require('esbuild');
const { rulesBuildOptions } = require('../scripts/rules-build');
const { TIERS } = require('../src/designs-v19-selected');
const { PLAYABLE_LIBRARIES, getDesignOptions, getPlayableProfile } = require('../src/design-options');
const { getPlayableProfiles } = require('../scripts/playable-profile');
const { defaultDesignChoices, designSetupFromChoices, loadDesignSetup } = require('../src/design-setup');
const historical = require('./fixtures/playable-initial20-sha256.json');
const root = path.resolve(__dirname, '..');
const libraries = PLAYABLE_LIBRARIES.filter(library => library.generation === 19);

test('new tier libraries preserve every historical profile byte and offer only accepted bodies', () => {
  assert.equal(PLAYABLE_LIBRARIES.length, 23);
  for (const [file, expected] of Object.entries(historical)) {
    const bytes = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, file);
  }
  for (const [index, library] of libraries.entries()) {
    const tier = TIERS[index], profile = getPlayableProfile(library.variant), options = getDesignOptions(library.variant);
    assert.deepEqual(profile, getPlayableProfiles()[PLAYABLE_LIBRARIES.indexOf(library)]);
    assert.ok(profile.registry.definitions.length <= 20);
    assert.deepEqual(options.map(option => option.id).sort(), tier.bodies.map(body => body.id).sort());
    for (const option of options) {
      assert.equal(option.level, tier.level);
      assert.ok(option.name && option.description && !/undefined/.test(option.description));
    }
    assert.equal(profile.capabilityProbes.length > 50, true);
    for (const body of tier.bodies) assert.deepEqual(profile.evaluation.pieceValues[body.id], body.prior);
    if (tier.level === 3) assert.deepEqual(options.filter(option => option.family === 'pawn').map(option => option.accent).sort(), ['purple', 'red']);
  }
});

test('tier-three setup, grants, saved games, PGN and undo retain selected immutable identities', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v19-save-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const output = path.join(directory, 'save.cjs');
  await build({ ...rulesBuildOptions(), bundle: true, platform: 'node', format: 'cjs', outfile: output,
    stdin: { contents: "export * from './src/saved-games.js'; export { VariantGame, initVariantRules } from './src/variant-game.js';", resolveDir: root, loader: 'js' } });
  const api = require(output), profile = getPlayableProfile(libraries[2].variant);
  await api.initVariantRules(profile.variant);
  const knight = 'knight.level3-nad@1', grant = 'king.grant-wd-level3@1';
  const choices = { ...defaultDesignChoices(profile), b1: knight, b8: knight, e1: grant, e8: grant };
  const setup = designSetupFromChoices(choices, 6, profile);
  assert.deepEqual(setup.costs, { w: 6, b: 6 });
  assert.throws(() => designSetupFromChoices(choices, 5, profile), /Budget exceeded/);
  const game = new api.VariantGame(setup.fen, profile.variant); t.after(() => game.dispose());
  for (const [from, to] of [['e2', 'e4'], ['e7', 'e5'], ['b1', 'd3'], ['b8', 'd6']]) assert.ok(game.move({ from, to }));
  const saved = api.makeSave(game, { opponent: 'local', humanSide: 'w', difficulty: 'medium', flipped: false, upgradeBudget: 6 });
  assert.deepEqual(saved.setup, { choices, budget: 6 });
  const restored = await api.parseSave(JSON.stringify(saved)), imported = await api.parsePgn(api.exportPgn(game));
  t.after(() => restored.game.dispose()); t.after(() => imported.dispose());
  for (const copy of [restored.game, imported]) {
    assert.equal(copy.fen(), game.fen());
    for (let index = 0; index < 4; index++) assert.ok(copy.undo());
    assert.deepEqual(loadDesignSetup(copy.fen(), profile), choices);
  }
});
