const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getDesign } = require('../src/design-catalog');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { makeSchedule } = require('../scripts/balance/plan');
const { loadExperiment } = require('../scripts/balance/v17-plan');
const { ALL_OPENINGS } = require('../scripts/balance/v17-mobility-plan');
const { main } = require('../scripts/version17-balance');
const {
  CAPS, FILES, BUDGETS, LEVEL1_ROSTER, getReferencePanelRoster,
  buildPurchaseArmy, level1Singles, level1Teams, buildPanelConfig,
} = require('../scripts/balance/reference-panel-plan');
const cost = army => Object.values(army.upgrades).reduce((sum, id) => sum + getDesign(id).level, 0)
  + army.reserve.reduce((sum, item) => sum + item.count * getDesign(item.id).level, 0);
const members = army => [...Object.values(army.upgrades), ...army.reserve.flatMap(item => Array(item.count).fill(item.id))];

test('the panel pins only the three selected level-one designs beside the four frozen level-three references', () => {
  const roster = getReferencePanelRoster();
  assert.deepEqual(roster.level1.map(item => [item.id, item.movement, item.level]), [
    ['pawn.blue@5', 'fmW2fceF2', 1], ['pawn.blue@7', 'mWFifmnD', 1], ['king.reserve-pawn@6', 'fWmfF', 1],
  ]);
  assert.deepEqual(roster.level3.map(item => item.id),
    ['rook.purple@10', 'knight.purple@3', 'bishop.purple@13', 'queen.purple@1']);
  assert.ok(!roster.level1.some(item => item.id === 'king.reserve-pawn@7'));
  assert.equal(roster.reserves.royalKing, 'ordinary');
  assert.equal(roster.reserves.checkingDrops, false);
  assert.equal(roster.reserves.capturedPiecesReturnToReserve, false);
});

test('three independent capped schedules total 1216 games with complete color pairs and no cross-tier pair games', () => {
  assert.equal(Object.values(CAPS).reduce((sum, games) => sum + games, 0), 1216);
  for (const [experiment, comparisons, budget] of [
    ['panel-gap', 1, 3], ['panel-level1', 3, 1], ['panel-level1-pairs', 15, 2],
  ]) {
    const declaration = loadExperiment(experiment), { config, metadata } = declaration;
    assert.deepEqual(config, buildPanelConfig(experiment));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', FILES[experiment]), 'utf8')), config);
    assert.equal(config.comparisons.length, comparisons);
    assert.deepEqual(config.openings, ALL_OPENINGS);
    assert.deepEqual(config.engine, { nodes: 20000, threads: 1, hashMb: 32, maxPlies: 400 });
    assert.equal(config.seed, 20261028);
    assert.equal(metadata.upgradePoints, budget);
    assert.equal(BUDGETS[experiment], budget);
    assert.equal(metadata.referenceValueProfile, 'official-standalone');
    assert.equal(metadata.symmetric, true);
    const schedule = makeSchedule(config);
    assert.equal(schedule.length, CAPS[experiment]);
    const pairs = new Map();
    for (const game of schedule) {
      const colors = pairs.get(game.pairId) || [];
      colors.push(game.aColor); pairs.set(game.pairId, colors);
    }
    assert.ok([...pairs.values()].every(colors => colors.length === 2 && new Set(colors).size === 2));
    for (const comparison of config.comparisons) {
      assert.notDeepEqual(comparison.armyA, comparison.armyB);
      for (const army of [comparison.armyA, comparison.armyB]) {
        assert.equal(cost(army), budget);
        assert.equal(members(army).length, budget);
        assert.ok(members(army).every(id => LEVEL1_ROSTER.some(reference => reference.id === id)));
        assert.deepEqual(army.remove, []);
        assert.equal(Object.hasOwn(army.upgrades, 'e1'), false);
      }
    }
    const registry = createDesignRegistry(config), profile = compileDesignProfile(registry);
    assert.equal(registry.definitions.length, experiment === 'panel-gap' ? 2 : 3);
    assert.deepEqual(profile.roles.royalTypes, ['k']);
    assert.match(profile.config, /dropChecks = false/);
    assert.match(profile.config, /capturesToHand = false/);
  }
});

test('six two-purchase teams include repeated designs and keep finite grants separate from pawn replacements', () => {
  const teams = level1Teams();
  assert.equal(teams.length, 6);
  assert.equal(new Set(teams.map(team => team.key)).size, 6);
  assert.equal(teams.filter(team => team.members[0] === team.members[1]).length, 3);
  assert.deepEqual(teams.find(team => team.key === 'two-step-king-step').army,
    { upgrades: { c2: 'pawn.blue@5', e2: 'pawn.blue@7' }, reserve: [] });
  assert.deepEqual(teams.find(team => team.key === 'two-step-grant').army,
    { upgrades: { c2: 'pawn.blue@5' }, reserve: [{ id: 'king.reserve-pawn@6', count: 1 }] });
  assert.deepEqual(teams.find(team => team.key === 'grant-grant').army,
    { upgrades: {}, reserve: [{ id: 'king.reserve-pawn@6', count: 2 }] });
  for (const single of level1Singles()) {
    if (single.family === 'pawn') assert.deepEqual(Object.keys(single.army.upgrades), ['c2']);
    assert.equal(cost(single.army), 1);
  }
  assert.deepEqual(buildPurchaseArmy(Array(3).fill('pawn.blue@7')).upgrades,
    { c2: 'pawn.blue@7', d2: 'pawn.blue@7', e2: 'pawn.blue@7' });
  assert.throws(() => buildPurchaseArmy(['king.reserve-pawn@7']), /unknown level-one reference/);
  assert.throws(() => buildPurchaseArmy([]), /one to three/);
});

test('the gap fills only the missing triple King-step versus triple grant matchup', () => {
  const declaration = loadExperiment('panel-gap');
  assert.equal(declaration.config.comparisons[0].id, 'king-step-pawns-v-mobile-forward-grants');
  assert.deepEqual(members(declaration.config.comparisons[0].armyA), Array(3).fill('pawn.blue@7'));
  assert.deepEqual(members(declaration.config.comparisons[0].armyB), Array(3).fill('king.reserve-pawn@6'));
  assert.equal(makeSchedule(declaration.config).length, 64);
});

test('check mode routes each exact panel without starting workers or writing a run', async () => {
  for (const experiment of Object.keys(FILES)) {
    let checks = 0;
    await main(['--experiment', experiment, '--check', '--rules-only'], {
      check: async declaration => { checks++; assert.equal(declaration.metadata.upgradePoints, BUDGETS[experiment]); return { native: false }; },
      run: () => assert.fail('a check cannot start games'), persist: () => assert.fail('a check cannot persist runs'), log: () => {},
    });
    assert.equal(checks, 1);
  }
});
