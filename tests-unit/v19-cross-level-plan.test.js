'use strict';

// Schedule/declaration checks only: these fixtures never play scored games.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const plan = require('../scripts/balance/v19-cross-level-plan');
const roster = require('../src/designs-v19-expanded');
const { getDesign } = require('../src/design-catalog');
const { makeSchedule } = require('../scripts/balance/plan');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const historical = require('./fixtures/playable-v19-before-expanded-sha256.json');
const ROOT = path.resolve(__dirname, '..');
const sha = value => createHash('sha256').update(value).digest('hex');
const tuple = (a, b, c) => JSON.stringify([a, b, c]);
const EXCLUDED = new Set(['rook.orange@3', 'pawn.knight-tall-quiet@1', 'pawn.queen-sideways@1']);
const compiled = declaration => {
  const registry = createDesignRegistry(declaration.config);
  return { registry, profile: compileDesignProfile(registry, declaration.config.evaluation) };
};
const stageFor = (group, batch = 0, placement = 0) => plan.getBatchDeclaration(group.id, batch, placement);

test('cross-level coverage is every board L1/L2/L3 triple except explicitly unavailable queen pairs', () => {
  assert.equal(plan.FORMAT, 'levelup-v19-cross-level-001');
  assert.equal(plan.STUDY, 'cross-level'); assert.equal(plan.NODES, 40000);
  assert.deepEqual(plan.OPENING_TARGETS, [8, 16, 32, 64]);
  for (const [level, count] of [[1, 11], [2, 12], [3, 11]]) {
    const selected = plan.candidates(level);
    assert.equal(selected.length, count);
    assert.deepEqual(selected.map(row => row.id).sort(), roster.getTierRoster(level)
      .filter(row => row.family !== 'king' && row.placement !== 'reserve' && !EXCLUDED.has(row.id)).map(row => row.id).sort());
    for (const body of selected) {
      assert.equal(body.level, level); assert.notEqual(body.family, 'king'); assert.ok(!EXCLUDED.has(body.id));
      assert.equal(body.placement, 'replace');
      assert.equal(body.movement, getDesign(body.id).movement);
      assert.deepEqual(body.prior, roster.getTierRoster(level).find(row => row.id === body.id).prior);
    }
  }
  const groups = plan.groups(), cells = plan.matches(), absent = plan.unavailable();
  assert.equal(groups.length, 126); assert.equal(cells.length, 1386); assert.equal(absent.length, 6);
  assert.equal(groups.filter(row => row.sameFamily).length, 20);
  const expected = new Set();
  for (const l1 of plan.candidates(1)) for (const l2 of plan.candidates(2)) for (const l3 of plan.candidates(3)) {
    if (l1.family !== 'queen' || l2.family !== 'queen') expected.add(tuple(l1.id, l2.id, l3.id));
  }
  const observed = new Set(cells.map(row => tuple(row.designL1, row.designL2, row.designL3)));
  assert.deepEqual(observed, expected); assert.equal(observed.size, cells.length);
  assert.equal(new Set(cells.map(row => row.id)).size, 1386);
  assert.ok(absent.every(row => row.l1.family === 'queen' && row.l2.family === 'queen'
    && /queen|standard|home/i.test(row.reason)));
  assert.equal(absent.reduce((sum, row) => sum + row.opponents.length, 0), 66);
  for (const openings of plan.OPENING_TARGETS) assert.equal(plan.expectedGames('cross-level', openings), 1386 * openings * 2);
  assert.throws(() => plan.expectedGames('level1', 8));
  assert.throws(() => plan.expectedGames('cross-level', 24));
});

test('placement partitions cover the same book and rotate each same-family pair across both homes by sixteen openings', () => {
  const groups = plan.groups(), byGroup = new Map(groups.map(group => [group.id, group]));
  const stagesByBatch = [plan.getStageDescriptors(0), plan.getStageDescriptors(1)];
  assert.equal(plan.getStageDescriptors(0).length, 146);
  for (const group of groups) {
    const seen = new Set(), layoutsByFamily = new Map();
    for (const batch of [0, 1]) {
      const stages = stagesByBatch[batch].filter(row => row.groupId === group.id);
      assert.equal(stages.length, group.sameFamily ? 2 : 1);
      assert.equal(stages.reduce((sum, row) => sum + row.games, 0), 176);
      for (const stage of stages) {
        assert.equal(stage.nodes, 40000); assert.equal(stage.openingIds.length, group.sameFamily ? 4 : 8);
        for (const openingId of stage.openingIds) {
          assert.ok(!seen.has(openingId), group.id + ' duplicated a shared opening'); seen.add(openingId);
          const global = plan.BOOK.openings.findIndex(row => row.id === openingId);
          assert.equal(global >= batch * 8 && global < batch * 8 + 8, true);
          if (group.sameFamily) {
            assert.equal(stage.placement, (global + batch) % 2);
            const family = plan.BOOK.openings[global].family;
            const layouts = layoutsByFamily.get(family) || [];
            layouts.push(stage.placement); layoutsByFamily.set(family, layouts);
          }
        }
      }
    }
    assert.equal(seen.size, 16);
    if (group.sameFamily) {
      assert.equal(layoutsByFamily.size, 8);
      for (const layouts of layoutsByFamily.values()) assert.deepEqual(layouts.sort(), [0, 1]);
    }
  }
  assert.equal(byGroup.size, 126);
  for (const invalid of [-1, 8, 0.5]) assert.throws(() => plan.getStageDescriptors(invalid));
});

test('group configurations retain standard material, declared priors, both colors and thirteen custom types', () => {
  const homes = { pawn: ['c2', 'e2'], knight: ['b1', 'g1'], bishop: ['c1', 'f1'], rook: ['a1', 'h1'] };
  for (const group of plan.groups()) {
    let firstProfile;
    for (const placement of group.sameFamily ? [0, 1] : [0]) {
      const declaration = stageFor(group, 0, placement), { registry, profile } = compiled(declaration);
      assert.equal(registry.definitions.length, 13); assert.equal(registry.allocations.length, 13);
      assert.ok(registry.definitions.every(row => row.family !== 'king' && row.placement === 'replace'));
      assert.ok(!profile.roles.reserveTypes?.length); assert.ok(!/^pieceDrops\s*=\s*true$/m.test(profile.config));
      assert.deepEqual(declaration.config.engine, { nodes: 40000, threads: 1, hashMb: 32, maxPlies: 400 });
      assert.equal(declaration.config.comparisons.length, 11);
      assert.equal(Object.keys(declaration.config.evaluation.pieceValues).length, 13);
      const ids = new Set([group.l1.id, group.l2.id, ...plan.candidates(3).map(row => row.id)]);
      assert.ok([...ids].every(id => !EXCLUDED.has(id)));
      assert.deepEqual(new Set(registry.definitions.map(row => row.id)), ids);
      for (const id of ids) {
        const body = roster.ALL_BODIES.find(row => row.id === id);
        assert.deepEqual(profile.evaluation.pieceValues[id], body.prior);
      }
      if (firstProfile) assert.equal(profile.hash, firstProfile.hash, 'moving an upgrade to the other home must not reassign its rules');
      firstProfile = profile;
      for (const comparison of declaration.config.comparisons) {
        assert.equal(Object.keys(comparison.armyA.upgrades).length, 2);
        assert.equal(Object.keys(comparison.armyB.upgrades).length, 1);
        for (const army of [comparison.armyA, comparison.armyB]) {
          assert.deepEqual(army.remove, []); assert.deepEqual(army.reserve, []);
          assert.ok(!Object.hasOwn(army.upgrades, 'e1'));
          assert.equal(Object.values(army.upgrades).reduce((sum, id) => sum + getDesign(id).level, 0), 3);
        }
        if (group.sameFamily) {
          const slots = homes[group.l1.family];
          assert.equal(comparison.armyA.upgrades[slots[placement]], group.l1.id);
          assert.equal(comparison.armyA.upgrades[slots[1 - placement]], group.l2.id);
        }
        assert.deepEqual(comparison.strengthA, { skill: 20 }); assert.deepEqual(comparison.strengthB, { skill: 20 });
      }
      const pairs = new Map();
      for (const game of makeSchedule(declaration.config)) {
        const colors = pairs.get(game.pairId) || []; colors.push(game.aColor); pairs.set(game.pairId, colors);
      }
      assert.equal(pairs.size, (group.sameFamily ? 4 : 8) * 11);
      for (const colors of pairs.values()) assert.deepEqual(colors.sort(), ['b', 'w']);
    }
  }
});

test('full campaign targets append disjoint stages without changing frozen research artifacts', () => {
  const campaign = plan.buildCampaignPlan({ study: 'cross-level', jobs: 4 });
  assert.equal(campaign.stages.length, 1168); assert.equal(campaign.games, 177408);
  for (const [openings, stages, games] of [[8, 146, 22176], [16, 292, 44352], [32, 584, 88704], [64, 1168, 177408]]) {
    const selected = plan.selectedStages(openings, campaign);
    assert.equal(selected.length, stages); assert.equal(selected.reduce((sum, row) => sum + row.games, 0), games);
    assert.equal(new Set(selected.map(row => row.id)).size, selected.length);
    assert.ok(selected.every(row => row.batchIndex < openings / 8));
  }
  for (const [file, expected] of Object.entries({ ...historical,
    'src/playable-v19-level1-expanded-profile.json': '07f7f93439de6afd0cc65d813df3251805787df1dc5089248875ded1ddb1e1f2',
    'src/playable-v19-level2-expanded-profile.json': 'e4e7320af9bfae395a68a34de88158035d179c17d31886f7ed69abf3db8794d4',
    'src/playable-v19-level3-expanded-profile.json': '1fea630bd32d31426972dd7d705f36fe8910276c580baf04a3bb8ac4e337565e',
    'variants/levelup-playable-v19-level1-expanded.ini': 'd356e384724cced3ecb5d396c69549f0b61de979121342cfe3f7b71fc78a43a0',
    'variants/levelup-playable-v19-level2-expanded.ini': '72def0239d3d6a3942930977d6b97872a5f086b5bc7c723c10ff6720f7ba218c',
    'variants/levelup-playable-v19-level3-expanded.ini': '89fb7010fe47c9f4bcd5ddc0c26ed96a999301f93172cd95dbb753ac7a78bc9d',
    'dist/balance-rules.cjs': '5359a946df87f79d8fd84320ef016a04cf7012f67e27a8e154b392d265d579b1',
  })) assert.equal(sha(fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n')), expected, file);
});

test('representative saved-stage identities reconstruct exact configs, schedules and semantic profiles across extensions', () => {
  const groups = [plan.groups().find(group => group.sameFamily), plan.groups().find(group => !group.sameFamily)];
  for (let batchIndex = 0; batchIndex < 8; batchIndex++) {
    for (const group of groups) for (const stage of plan.getStageDescriptors(batchIndex).filter(row => row.groupId === group.id)) {
      const declaration = plan.getStageDeclaration(stage.id);
      assert.deepEqual(declaration, plan.getBatchDeclaration(group.id, batchIndex, stage.placement));
      const schedule = makeSchedule(declaration.config), { registry, profile } = compiled(declaration);
      assert.equal(stage.configSha256, sha(JSON.stringify(declaration.config)));
      assert.equal(stage.scheduleSha256, sha(JSON.stringify(schedule)));
      assert.equal(stage.registryHash, registry.hash); assert.equal(stage.profileHash, profile.hash);
      assert.equal(stage.games, schedule.length);
      assert.deepEqual(stage.openingIds, declaration.config.openings.map(row => row.id));
    }
  }
  assert.throws(() => plan.getStageDeclaration('b99-g999-p0'));
  assert.throws(() => plan.getBatchDeclaration('not-a-declared-group', 0, 0));
});
