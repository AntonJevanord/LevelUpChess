'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Chess } = require('chess.js');
const { getDesign } = require('../src/design-catalog');
const { L1_BRACKETS, L2_PAWN_BRACKETS, L2_GRANT_BRACKETS } = require('../src/balance-designs-v17');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { makeSchedule } = require('../scripts/balance/plan');
const { loadExperiment } = require('../scripts/balance/v17-plan');
const { ALL_OPENINGS } = require('../scripts/balance/v17-mobility-plan');
const { getOfficialReferences } = require('../scripts/balance/official-references');
const { main } = require('../scripts/version17-balance');
const {
  ROOT, OPENINGS, ENGINE, FILES, CAPS, L3_ROWS, validateOpenings,
  referencePackages, candidates, cells, selectedIds, buildBracketConfig,
} = require('../scripts/balance/v17-bracket-plan');

const cost = army => Object.values(army.upgrades).reduce((sum, id) => sum + getDesign(id).level, 0)
  + (army.reserve || []).reduce((sum, item) => sum + item.count * getDesign(item.id).level, 0);
const members = army => [...Object.values(army.upgrades), ...(army.reserve || []).flatMap(entry => Array(entry.count).fill(entry.id))];
const physicalPosition = opening => {
  const board = new Chess();
  for (const move of opening.moves) assert.ok(board.move({ from: move.slice(0, 2), to: move.slice(2, 4) }));
  return board.fen().split(' ').slice(0, 4).join(' ');
};

test('sixteen matched two-ply cases are new positions as well as new names', () => {
  assert.equal(validateOpenings(), OPENINGS);
  assert.equal(OPENINGS.length, 16);
  assert.ok(OPENINGS.every(opening => opening.moves.length === 2));
  const historical = new Set(ALL_OPENINGS.map(physicalPosition));
  const current = OPENINGS.map(physicalPosition);
  assert.equal(new Set(current).size, 16);
  assert.ok(current.every(position => !historical.has(position)));
});

test('five declared schedules total 6752 games, pair colors and preserve equal purchase budgets', () => {
  assert.equal(Object.values(CAPS).reduce((sum, count) => sum + count, 0), 6752);
  const expectedRows = { 'acceptance-minors': 12, 'acceptance-majors': 9,
    'reference-pawns': 15, 'reference-grants': 13, 'level3-confirmation': 16 };
  const expectedTypes = { 'acceptance-minors': 15, 'acceptance-majors': 12,
    'reference-pawns': 18, 'reference-grants': 16, 'level3-confirmation': 20 };
  for (const experiment of Object.keys(FILES)) {
    const declaration = loadExperiment(experiment), { config, metadata } = declaration;
    assert.deepEqual(config, buildBracketConfig(experiment));
    assert.deepEqual(config, JSON.parse(fs.readFileSync(path.join(ROOT, FILES[experiment]), 'utf8')));
    assert.deepEqual(config.engine, ENGINE);
    assert.deepEqual(config.openings, OPENINGS);
    assert.equal(config.seed, 20261101);
    assert.equal(config.repetitions, 1);
    assert.equal(candidates(experiment).length, expectedRows[experiment]);
    assert.equal(metadata.symmetric, false);
    assert.equal(metadata.scheduledGames, CAPS[experiment]);
    const registry = createDesignRegistry(config), profile = compileDesignProfile(registry, config.evaluation);
    assert.equal(registry.definitions.length, expectedTypes[experiment]);
    assert.ok(registry.definitions.length <= 20);
    assert.deepEqual(profile.roles.royalTypes, ['k']);
    if (experiment !== 'level3-confirmation') {
      assert.equal(metadata.referenceValueProfile, 'official-standalone');
      assert.match(profile.config, /capturesToHand = false/);
      assert.match(profile.config, /dropChecks = false/);
    }
    const schedule = makeSchedule(config), pairs = new Map();
    assert.equal(schedule.length, CAPS[experiment]);
    for (const game of schedule) {
      const colors = pairs.get(game.pairId) || [];
      colors.push(game.aColor); pairs.set(game.pairId, colors);
    }
    assert.ok([...pairs.values()].every(colors => colors.length === 2 && new Set(colors).size === 2));
    for (const comparison of config.comparisons) {
      assert.equal(cost(comparison.armyA), cost(comparison.armyB));
      for (const army of [comparison.armyA, comparison.armyB]) {
        assert.deepEqual(army.remove, []);
        assert.equal(Object.hasOwn(army.upgrades, 'e1'), false);
      }
    }
    assert.equal(metadata.openingCohorts.length, 2);
    assert.deepEqual(metadata.openingCohorts.flatMap(cohort => cohort.openingIds), OPENINGS.map(opening => opening.id));
    assert.ok(metadata.openingCohorts.every(cohort => cohort.openingIds.length === 8));
    assert.equal(Object.isFrozen(declaration), true);
  }
});

test('level-one rook pairs and single queens occupy separate report budgets', () => {
  const { config, metadata } = loadExperiment('acceptance-majors');
  assert.equal(metadata.columns.length, 6);
  assert.deepEqual(metadata.budgetGroups.map(group => group.upgradePoints).sort(), [1, 2]);
  for (const comparison of config.comparisons) {
    const ids = members(comparison.armyA), family = getDesign(ids[0]).family;
    if (family === 'queen') {
      assert.equal(ids.length, 1);
      assert.deepEqual(Object.keys(comparison.armyA.upgrades), ['d1']);
      assert.equal(members(comparison.armyB).length, 1);
      assert.equal(cost(comparison.armyA), 1);
    } else {
      assert.equal(family, 'rook');
      assert.equal(ids.length, 2);
      assert.equal(new Set(ids).size, 1);
      assert.deepEqual(Object.keys(comparison.armyA.upgrades), ['a1', 'h1']);
      assert.equal(members(comparison.armyB).length, 2);
    }
  }
  const [pairs, singles] = [2, 1].map(points => metadata.budgetGroups.find(group => group.upgradePoints === points));
  assert.equal(pairs.rowKeys.length, 6);
  assert.equal(singles.rowKeys.length, 3);
  assert.ok(pairs.columnKeys.every(key => !singles.columnKeys.includes(key)));
  assert.equal(L1_BRACKETS.find(bracket => bracket.family === 'queen').variants[0].movement, 'QimfhN');
});

test('F and F2 grants share one scored treatment across both bracket views', () => {
  const { config, metadata } = loadExperiment('reference-grants');
  const rows = candidates('reference-grants');
  assert.equal(new Set(rows.map(row => row.designId)).size, 13);
  for (const movement of ['F', 'F2']) {
    const mentions = metadata.brackets.flatMap(bracket => bracket.variants).filter(variant => variant.movement === movement);
    assert.equal(mentions.length, 2);
    assert.equal(new Set(mentions.map(variant => variant.id)).size, 1);
    assert.equal(new Set(mentions.map(variant => variant.rowKey)).size, 1);
    assert.equal(config.comparisons.filter(comparison => members(comparison.armyA).includes(mentions[0].id)).length, 3);
  }
  const selected = selectedIds(config.comparisons);
  assert.equal(selected.includes('king.reserve-rook@1'), false, 'the cost-three W2 predecessor is not repriced in place');
  assert.equal(selected.includes('king.reserve-pawn@3'), false, 'the old one-point fW2 grant remains historical');
  assert.equal(selected.includes('king.reserve-pawn@4'), false, 'the old one-point pawn-like grant remains historical');
  assert.ok(rows.every(row => getDesign(row.designId).level === 2 && getDesign(row.designId).placement === 'reserve'));
});

test('every triplet uses a common declared material prior without changing fixed reference values', () => {
  for (const experiment of Object.keys(FILES)) {
    const { config, metadata } = loadExperiment(experiment);
    assert.equal(metadata.evaluationAudit.file, 'experiments/designs/v17-bracket-values.json');
    assert.match(metadata.evaluationAudit.sha256, /^[a-f0-9]{64}$/);
    for (const bracket of metadata.brackets) {
      const values = bracket.variants.map(variant => config.evaluation.pieceValues[variant.id]);
      assert.ok(values[0]);
      assert.ok(values.every(value => JSON.stringify(value) === JSON.stringify(values[0])), bracket.key);
      assert.ok(bracket.variants.every(variant => metadata.rows.some(row => row.key === variant.rowKey)));
    }
    if (experiment === 'level3-confirmation') for (const reference of getOfficialReferences().roster) {
      assert.deepEqual(config.evaluation.pieceValues[reference.id], reference.engineValue);
    }
  }
});

test('level-three confirmation retains fourteen designs, adds two bishop nerfs and keeps experimental matchups absent', () => {
  const { config, metadata } = loadExperiment('level3-confirmation');
  const rows = candidates('level3-confirmation'), fixed = getOfficialReferences().roster.map(reference => reference.id);
  assert.equal(L3_ROWS.length, 14);
  assert.equal(rows.length, 16);
  assert.ok(rows.some(row => getDesign(row.designId).movement === 'BmN'));
  assert.ok(rows.some(row => getDesign(row.designId).movement === 'BDmC'));
  assert.equal(rows.some(row => ['bishop.purple@14', 'bishop.purple@17'].includes(row.designId)), false);
  for (const row of rows) {
    const matches = config.comparisons.filter(comparison => members(comparison.armyA).includes(row.designId));
    assert.equal(matches.length, 4);
    assert.deepEqual(matches.flatMap(comparison => members(comparison.armyB)), fixed);
    if (getDesign(row.designId).family === 'pawn') assert.deepEqual(Object.keys(matches[0].armyA.upgrades), ['d2']);
  }
  assert.equal(metadata.brackets.length, 2);
  assert.equal(metadata.referenceValueProfile, undefined);
});

test('selected benchmarks and archived pawn predecessors keep their own prices and placements', () => {
  assert.deepEqual(referencePackages(2).map(row => row.designIds), [
    ['pawn.blue@5', 'pawn.blue@5'], ['pawn.blue@7', 'pawn.blue@7'], ['king.reserve-pawn@6', 'king.reserve-pawn@6'],
  ]);
  for (const experiment of ['acceptance-minors', 'acceptance-majors', 'reference-pawns']) {
    const selected = selectedIds(buildBracketConfig(experiment).comparisons);
    assert.equal(selected.includes('pawn.blue@2'), false);
    assert.equal(selected.includes('pawn.blue@3'), false);
  }
  assert.equal(getDesign('pawn.blue@2').level, 1);
  assert.equal(getDesign('pawn.purple@11').level, 3);
  const pawns = candidates('reference-pawns');
  assert.ok(pawns.every(row => getDesign(row.designId).level === 2));
  assert.ok(pawns.every(row => Object.keys(row.army.upgrades).join(',') === 'c2'));
  assert.equal(L2_PAWN_BRACKETS.length, 5);
  assert.equal(L2_GRANT_BRACKETS.length, 5);
  assert.throws(() => buildBracketConfig('unknown'), /Choose a bracket experiment/);
});

test('new experiment names route through check mode without starting workers or persisting runs', async () => {
  for (const experiment of Object.keys(FILES)) {
    let checks = 0;
    await main(['--experiment', experiment, '--check', '--rules-only'], {
      check: async declaration => { checks++; assert.equal(declaration.metadata.scheduledGames, CAPS[experiment]); return { native: false }; },
      run: () => assert.fail('a check cannot start games'), persist: () => assert.fail('a check cannot persist runs'), log: () => {},
    });
    assert.equal(checks, 1);
  }
});
