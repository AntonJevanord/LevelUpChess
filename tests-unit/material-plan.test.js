const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { getCampaign, CONFIG_FILE, CHECKPOINT_GAMES } = require('../scripts/balance/material-plan');
const { normalizeConfig, makeSchedule } = require('../scripts/balance/plan');
const { createMatchRules } = require('../dist/balance-rules.cjs');

test('the material pilot freezes 512 equal-effort games with only the unchanged Amazon design', () => {
  const campaign = getCampaign(), { config, registry, metadata } = campaign;
  assert.equal(campaign.id, 'material-estimate-v16');
  assert.equal(campaign.totalGames, 512);
  assert.equal(config.schemaVersion, 2); assert.equal(config.seed, 42); assert.equal(config.repetitions, 1);
  assert.deepEqual(config.engine, { nodes: 100000, threads: 1, hashMb: 32, maxPlies: 400 });
  assert.equal(config.openings.length, 16); assert.equal(config.comparisons.length, 16);
  assert.equal(config.evaluation, undefined);
  assert.deepEqual(registry.definitions.map(definition => [definition.id, definition.movement]), [['queen.purple@1', 'QN']]);
  assert.equal(metadata.length, 16);
  assert.deepEqual(normalizeConfig(config), config);
  assert.deepEqual(campaign.schedule, makeSchedule(config));
  for (const comparison of config.comparisons) {
    assert.deepEqual(comparison.strengthA, { skill: 20 });
    assert.deepEqual(comparison.strengthB, { skill: 20 });
  }
});

test('two distinct nested pawn layouts preserve every central pawn and ordinary king', () => {
  const { layouts, config, metadata } = getCampaign();
  assert.deepEqual(layouts.map(layout => [layout.id, layout.rookSquare, [...layout.pawnOrder]]), [
    ['left', 'a1', ['a2', 'b2', 'c2', 'f2', 'g2']],
    ['right', 'h1', ['h2', 'g2', 'f2', 'c2', 'b2']],
  ]);
  for (const phase of ['control', 'amazon']) for (const count of [2, 3, 4, 5]) {
    const masks = layouts.map(layout => {
      const meta = metadata.find(row => row.phase === phase && row.layout === layout.id && row.compensationCp === count * 100);
      const comparison = config.comparisons.find(row => row.id === meta.comparisonId);
      const pawns = comparison.armyA.remove.filter(square => square.endsWith('2'));
      assert.deepEqual(pawns, layout.pawnOrder.slice(0, count).sort());
      assert.equal(pawns.length, count);
      for (const square of ['d2', 'e2', 'e1']) assert.ok(!comparison.armyA.remove.includes(square));
      if (count > 2) {
        const lower = config.comparisons.find(row => row.id === `${phase}-${layout.id}-h${count - 1}`);
        assert.ok(lower.armyA.remove.every(square => comparison.armyA.remove.includes(square)));
      }
      return pawns;
    });
    assert.notDeepEqual(masks[0], masks[1]);
  }
});

test('the control measures queen-versus-rook odds and compensation without claiming a literal replacement', () => {
  const { config, metadata, layouts } = getCampaign();
  for (const row of metadata.filter(meta => meta.phase === 'control')) {
    const comparison = config.comparisons.find(comparison => comparison.id === row.comparisonId);
    const layout = layouts.find(layout => layout.id === row.layout);
    assert.deepEqual(comparison.armyA.upgrades, {});
    assert.deepEqual(comparison.armyB, { upgrades: {}, remove: ['d1'] });
    assert.ok(comparison.armyA.remove.includes(layout.rookSquare));
    assert.ok(!comparison.armyA.remove.includes('d1'));
    assert.equal(comparison.armyA.remove.length, row.compensationCp / 100 + 1);
    // Familiar 900/500 references imply Q-R-H; they are not engine table values.
    const ordinaryReference = square => square.endsWith('2') ? 100 : square === 'd1' ? 900 : 500;
    const removedA = comparison.armyA.remove.reduce((sum, square) => sum + ordinaryReference(square), 0);
    const removedB = comparison.armyB.remove.reduce((sum, square) => sum + ordinaryReference(square), 0);
    assert.equal(removedB - removedA, 400 - row.compensationCp);
  }
});

test('Amazon comparisons estimate one upgrade bonus against an ordinary queen army', () => {
  const { config, metadata } = getCampaign();
  for (const row of metadata.filter(meta => meta.phase === 'amazon')) {
    const comparison = config.comparisons.find(comparison => comparison.id === row.comparisonId);
    assert.deepEqual(comparison.armyA.upgrades, { d1: 'queen.purple@1' });
    assert.deepEqual(comparison.armyB, { upgrades: {}, remove: [] });
    assert.equal(comparison.armyA.remove.length, row.compensationCp / 100);
    assert.ok(comparison.armyA.remove.every(square => square.endsWith('2')));
  }
});

test('the control and three disjoint Amazon increments preserve canonical whole color pairs', () => {
  const { stages, config, schedule } = getCampaign();
  assert.deepEqual(CHECKPOINT_GAMES, [64, 128, 256]);
  assert.deepEqual(stages.map(stage => [stage.id, stage.phase, stage.number, stage.directory, stage.games, stage.cumulativeGames]), [
    ['control', 'control', 0, 'control', 256, 256],
    ['amazon-1', 'amazon', 1, 'amazon-stage-1', 64, 64],
    ['amazon-2', 'amazon', 2, 'amazon-stage-2', 64, 128],
    ['amazon-3', 'amazon', 3, 'amazon-stage-3', 128, 256],
  ]);
  const canonical = new Map(schedule.map(game => [game.id, game]));
  const seen = new Set();
  for (const stage of stages) {
    assert.equal(stage.schedule.length, stage.games);
    assert.equal(new Set(stage.schedule.map(game => game.comparisonId)).size, 8);
    // Each group of 16 games completes one balanced block for live reporting.
    for (let index = 0; index < stage.schedule.length; index += 16) {
      const block = stage.schedule.slice(index, index + 16);
      assert.equal(new Set(block.map(game => game.openingId)).size, 1);
      assert.equal(new Set(block.map(game => game.comparisonId)).size, 8);
    }
    for (const comparisonId of new Set(stage.schedule.map(game => game.comparisonId))) {
      assert.ok(comparisonId.startsWith(stage.phase + '-'));
      const games = stage.schedule.filter(game => game.comparisonId === comparisonId);
      assert.equal(games.length, stage.openingIds.length * 2);
      assert.deepEqual(new Set(games.map(game => game.openingId)), new Set(stage.openingIds));
    }
    for (let index = 0; index < stage.schedule.length; index += 2) {
      const [a, b] = stage.schedule.slice(index, index + 2);
      assert.equal(a.pairId, b.pairId);
      assert.notEqual(a.aColor, b.aColor);
    }
    for (const game of stage.schedule) {
      assert.deepEqual(game, canonical.get(game.id));
      assert.ok(!seen.has(game.id)); seen.add(game.id);
    }
  }
  assert.equal(seen.size, schedule.length);
  assert.deepEqual(stages[0].openingIds, config.openings.map(opening => opening.id));
  assert.deepEqual(stages.slice(1).flatMap(stage => stage.openingIds), config.openings.map(opening => opening.id));
});

test('every checkpoint retains the full unchanged registry and profile', () => {
  const { stages, config, registry, profile } = getCampaign();
  const { createDesignRegistry } = require('../scripts/balance/design-registry');
  const { compileDesignProfile } = require('../scripts/balance/design-profile');
  for (const stage of stages) {
    const fullConfig = normalizeConfig(config);
    assert.deepEqual(createDesignRegistry(fullConfig), registry);
    assert.deepEqual(compileDesignProfile(createDesignRegistry(fullConfig)), profile);
    assert.ok(stage.schedule.every(game => fullConfig.comparisons.some(row => row.id === game.comparisonId)));
  }
  // Building a control-only library would discard Amazon and change identity.
  const controlOnly = { ...config, comparisons: config.comparisons.filter(row => row.id.startsWith('control-')) };
  assert.notEqual(compileDesignProfile(createDesignRegistry(controlOnly)).hash, profile.hash);
});

test('Windows line endings preserve the pinned plan while actual edits are rejected', t => {
  const original = fs.readFileSync;
  let alter = source => source.replace(/\n/g, '\r\n');
  t.mock.method(fs, 'readFileSync', (file, ...args) => {
    const value = original(file, ...args);
    return String(file) === CONFIG_FILE ? alter(String(value)) : value;
  });
  assert.equal(getCampaign().totalGames, 512);
  alter = source => source.replace('100000', '99999');
  assert.throws(getCampaign, /frozen.*changed/);
});

test('reading the plan again cannot inherit caller edits to mutable configurations or schedules', () => {
  const first = getCampaign(), second = getCampaign();
  first.config.engine.nodes = 500;
  first.schedule[0].openingMoves.push('a2a3');
  first.metadata[0].compensationCp = 1;
  const current = getCampaign();
  assert.deepEqual(current, second);
});

test('all 512 army/color/opening assignments remain legal after the declared removals', async () => {
  const { profile, schedule } = getCampaign();
  const rules = await createMatchRules({ profile });
  for (const game of schedule) {
    const { armyA, armyB } = game.comparison;
    const board = rules.createBoard(rules.startingFen(game.aColor === 'w' ? armyA : armyB, game.aColor === 'w' ? armyB : armyA));
    try {
      assert.equal(board.outcome(), null, game.id);
      for (const move of game.openingMoves) {
        assert.equal(board.push(move), true, `${game.id}: ${move}`);
        assert.equal(board.outcome(), null, game.id);
      }
    } finally { board.dispose(); }
  }
});
