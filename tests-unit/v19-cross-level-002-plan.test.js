'use strict';

// Revision 002 owns a separate selection; no historical declaration is edited.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { ensureResearchOverlay } = require('../scripts/balance/research-overlay');
const ROOT = path.resolve(__dirname, '..');
const NZ = 'knight.level3-nz@1';
const EXCLUDED = new Set(['rook.orange@3', 'pawn.knight-tall-quiet@1', 'pawn.queen-sideways@1',
  'bishop.hopper-full-range@1', 'queen.level2-side-knight@1', 'queen.wraith-side-through@1']);
const frozenFiles = ['src/design-catalog.js', 'src/designs-v19-expanded.js',
  'experiments/designs/v19-cross-level-001.json', 'scripts/balance/v19-cross-level-plan.js',
  'tests-unit/v19-cross-level-plan.test.js', 'tests-unit/v19-cross-level-rules.test.js',
  'src/playable-v19-level1-expanded-profile.json', 'src/playable-v19-level2-expanded-profile.json',
  'src/playable-v19-level3-expanded-profile.json', 'dist/balance-rules.cjs'];
const sha = input => createHash('sha256').update(input).digest('hex');
const originalHashes = Object.fromEntries(frozenFiles.map(file => [file, sha(fs.readFileSync(path.join(ROOT, file)))]));
const overlay = ensureResearchOverlay({ name: 'cross-level-panel-v19-002', entryFile: 'scripts/v19-cross-level.js',
  definitionFile: 'src/balance-designs-v19-cross-level-002.js' });
const load = file => require(path.join(overlay.directory, file));
const plan = load('scripts/balance/v19-cross-level-plan-002');
const previous = load('scripts/balance/v19-cross-level-plan');
const roster = load('src/designs-v19-expanded');
const { getDesign } = load('src/design-catalog');
const { makeSchedule } = load('scripts/balance/plan');
const { createDesignRegistry } = load('scripts/balance/design-registry');
const { compileDesignProfile } = load('scripts/balance/design-profile');
const compile = declaration => compileDesignProfile(createDesignRegistry(declaration.config), declaration.config.evaluation);
const triple = row => JSON.stringify([row.designL1, row.designL2, row.designL3]);

test('selection 002 removes exactly the requested alternatives and adds the existing Hippogriff identity', () => {
  assert.equal(plan.FORMAT, 'levelup-v19-cross-level-002');
  assert.equal(plan.STUDY, 'cross-level'); assert.equal(plan.NODES, 40000);
  assert.deepEqual(plan.OPENING_TARGETS, [8, 16, 32, 64]);
  for (const [level, count] of [[1, 10], [2, 11], [3, 11]]) {
    const actual = plan.candidates(level), before = previous.candidates(level);
    const wanted = before.filter(body => !EXCLUDED.has(body.id)).map(body => body.id);
    if (level === 3) wanted.push(NZ);
    assert.equal(actual.length, count);
    assert.deepEqual(actual.map(body => body.id).sort(), wanted.sort());
    for (const body of actual) {
      assert.equal(body.level, level); assert.equal(body.upgradePoints, level);
      assert.notEqual(body.family, 'king'); assert.equal(body.placement, 'replace');
      assert.ok(!EXCLUDED.has(body.id)); assert.equal(body.movement, getDesign(body.id).movement);
      if (body.id !== NZ) {
        const old = before.find(row => row.id === body.id);
        assert.deepEqual(body.prior, old.prior); assert.deepEqual(body.roles, old.roles);
        assert.equal(body.key, old.key); assert.equal(body.movement, old.movement);
      }
    }
  }
  const hippogriff = plan.candidates(3).find(body => body.id === NZ);
  const canonical = load('src/balance-designs-v18-prepanel-level3').NEW_DEFINITIONS.find(row => row.id === NZ);
  assert.equal(hippogriff.label, 'Hippogriff'); assert.equal(hippogriff.movement, 'NZ');
  assert.equal(hippogriff.anchorId, 'knight.purple@3'); assert.deepEqual(hippogriff.prior, { mg: 1663, eg: 1877 });
  assert.deepEqual(getDesign(NZ), canonical);
  assert.deepEqual(hippogriff.roles, { pawn: false, castlingRook: false, enPassant: false });
  assert.equal(require('../src/design-catalog').getDesign(NZ), undefined,
    'The existing research definition is registered only inside the private snapshot');
  assert.equal(previous.candidates(1).length, 11); assert.equal(previous.candidates(2).length, 12);
  assert.equal(previous.candidates(3).length, 11); assert.ok(!previous.candidates(3).some(body => body.id === NZ));
});

test('all 1166 valid triples retain semantic cell IDs and the four queen pairs remain explicitly unavailable', () => {
  const expected = new Set();
  for (const one of plan.candidates(1)) for (const two of plan.candidates(2)) for (const three of plan.candidates(3)) {
    if (one.family !== 'queen' || two.family !== 'queen') expected.add(JSON.stringify([one.id, two.id, three.id]));
  }
  const cells = plan.matches(), previousCells = new Map(previous.matches().map(row => [triple(row), row]));
  assert.equal(plan.groups().length, 106); assert.equal(cells.length, 1166);
  assert.equal(plan.groups().filter(group => group.sameFamily).length, 18);
  assert.deepEqual(new Set(cells.map(triple)), expected);
  assert.equal(new Set(cells.map(row => row.id)).size, 1166);
  let retained = 0;
  for (const cell of cells) {
    assert.ok([cell.designL1, cell.designL2, cell.designL3].every(id => !EXCLUDED.has(id)));
    if (cell.designL3 === NZ) continue;
    assert.equal(cell.id, previousCells.get(triple(cell)).id); retained++;
  }
  assert.equal(retained, 1060); assert.equal(cells.filter(row => row.designL3 === NZ).length, 106);
  assert.equal(plan.unavailable().length, 4);
  for (const row of plan.unavailable()) {
    assert.equal(row.l1.family, 'queen'); assert.equal(row.l2.family, 'queen');
    assert.equal(row.opponents.length, 11); assert.match(row.reason, /standard|queen/i);
  }
  assert.equal(plan.unavailable().reduce((sum, row) => sum + row.opponents.length, 0), 44);
  for (const [openings, games] of [[8, 18656], [16, 37312], [32, 74624], [64, 149248]]) {
    assert.equal(plan.expectedGames('cross-level', openings), games);
  }
});

test('every new group keeps ordinary material, thirteen types and unchanged priors in both placement arms', () => {
  const source = new Map(roster.ALL_BODIES.map(body => [body.id, body]));
  for (const group of plan.groups()) {
    let firstHash;
    for (const placement of group.sameFamily ? [0, 1] : [0]) {
      const declaration = plan.getBatchDeclaration(group.id, 0, placement), profile = compile(declaration);
      assert.equal(profile.registry.definitions.length, 13); assert.equal(profile.registry.allocations.length, 13);
      assert.equal(Object.keys(profile.evaluation.pieceValues).length, 13);
      assert.ok(!profile.roles.reserveTypes?.length); assert.ok(!/^pieceDrops\s*=\s*true$/m.test(profile.config));
      assert.deepEqual(declaration.config.engine, { nodes: 40000, threads: 1, hashMb: 32, maxPlies: 400 });
      const ids = new Set([group.l1.id, group.l2.id, ...plan.candidates(3).map(body => body.id)]);
      assert.deepEqual(new Set(profile.registry.definitions.map(row => row.id)), ids);
      for (const id of ids) {
        assert.ok(!EXCLUDED.has(id));
        assert.deepEqual(profile.evaluation.pieceValues[id], id === NZ ? { mg: 1663, eg: 1877 } : source.get(id).prior);
      }
      if (firstHash) assert.equal(profile.hash, firstHash, 'Home-square swaps must not reassign movement or values');
      firstHash = profile.hash;
      assert.equal(declaration.config.comparisons.length, 11);
      for (const comparison of declaration.config.comparisons) {
        assert.equal(Object.keys(comparison.armyA.upgrades).length, 2);
        assert.equal(Object.keys(comparison.armyB.upgrades).length, 1);
        for (const army of [comparison.armyA, comparison.armyB]) {
          assert.deepEqual(army.remove, []); assert.deepEqual(army.reserve, []);
          assert.equal(Object.values(army.upgrades).reduce((sum, id) => sum + getDesign(id).level, 0), 3);
          assert.ok(!Object.hasOwn(army.upgrades, 'e1'));
        }
        if (group.sameFamily) {
          const homes = plan.HOMES[group.l1.family];
          assert.equal(comparison.armyA.upgrades[homes[placement]], group.l1.id);
          assert.equal(comparison.armyA.upgrades[homes[1 - placement]], group.l2.id);
        }
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

test('extension stages partition shared openings and rotate same-family homes without repeating completed batches', () => {
  const campaign = plan.buildCampaignPlan({ study: 'cross-level', jobs: 4 });
  assert.equal(campaign.stages.length, 992); assert.equal(campaign.games, 149248);
  for (const [openings, count, games] of [[8, 124, 18656], [16, 248, 37312], [32, 496, 74624], [64, 992, 149248]]) {
    const selected = plan.selectedStages(openings, campaign);
    assert.equal(selected.length, count); assert.equal(selected.reduce((sum, row) => sum + row.games, 0), games);
    assert.equal(new Set(selected.map(row => row.id)).size, count);
    assert.ok(selected.every(row => row.batchIndex < openings / 8));
  }
  const batches = [plan.getStageDescriptors(0), plan.getStageDescriptors(1)];
  for (const group of plan.groups()) {
    const seen = new Set(), layouts = new Map();
    for (const [batch, stages] of batches.entries()) {
      const groupStages = stages.filter(row => row.groupId === group.id);
      assert.equal(groupStages.length, group.sameFamily ? 2 : 1);
      assert.equal(groupStages.reduce((sum, row) => sum + row.games, 0), 176);
      for (const stage of groupStages) for (const openingId of stage.openingIds) {
        assert.ok(!seen.has(openingId)); seen.add(openingId);
        const globalIndex = plan.BOOK.openings.findIndex(row => row.id === openingId);
        assert.ok(globalIndex >= batch * 8 && globalIndex < batch * 8 + 8);
        if (!group.sameFamily) continue;
        assert.equal(stage.placement, (globalIndex + batch) % 2);
        const family = plan.BOOK.openings[globalIndex].family, values = layouts.get(family) || [];
        values.push(stage.placement); layouts.set(family, values);
      }
    }
    assert.equal(seen.size, 16);
    if (group.sameFamily) for (const values of layouts.values()) assert.deepEqual(values.sort(), [0, 1]);
  }
  for (const group of [plan.groups().find(row => row.sameFamily), plan.groups().find(row => !row.sameFamily)]) {
    for (const stage of plan.getStageDescriptors(1).filter(row => row.groupId === group.id)) {
      const declaration = plan.getStageDeclaration(stage.id), profile = compile(declaration);
      assert.deepEqual(declaration, plan.getBatchDeclaration(group.id, 1, stage.placement));
      assert.equal(stage.configSha256, sha(JSON.stringify(declaration.config)));
      assert.equal(stage.scheduleSha256, sha(JSON.stringify(makeSchedule(declaration.config))));
      assert.equal(stage.profileHash, profile.hash); assert.equal(stage.registryHash, profile.registry.hash);
    }
  }
  plan.verifyFrozenInputs();
  for (const [file, before] of Object.entries(originalHashes)) assert.equal(sha(fs.readFileSync(path.join(ROOT, file))), before, file);
});
