const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { normalizeConfig, makeSchedule } = require('../scripts/balance/plan');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { getDesign } = require('../src/design-catalog');
const { getOfficialReferences } = require('../scripts/balance/official-references');
const { validateDesignConfig } = require('../scripts/balance/validate-designs');
const { OPENINGS, ENGINE, FILES, replacementCandidates, referenceTeams, buildLevel3Screen, buildReferencePairs, loadExperiment } = require('../scripts/balance/v17-plan');

test('level-three screening includes every current replacement candidate against all four unchanged references', () => {
  const candidateIds = ['pawn.purple@11', 'pawn.purple@12', 'knight.purple@4', 'knight.purple@5', 'knight.purple@6',
    'bishop.purple@14', 'bishop.purple@15', 'bishop.purple@16', 'rook.purple@12', 'rook.purple@13',
    'queen.purple@6', 'queen.purple@7', 'queen.purple@8'];
  const references = getOfficialReferences().roster;
  const config = buildLevel3Screen();
  assert.deepEqual(replacementCandidates().map(candidate => candidate.designId), candidateIds);
  assert.equal(config.comparisons.length, 52);
  assert.equal(createDesignRegistry(config).definitions.length, 17);
  assert.deepEqual(normalizeConfig(JSON.parse(readFileSync(FILES.level3, 'utf8'))), config);
  for (const id of candidateIds) {
    const cells = config.comparisons.filter(comparison => Object.values(comparison.armyA.upgrades).includes(id));
    assert.equal(cells.length, 4, id);
    assert.deepEqual(cells.flatMap(comparison => Object.values(comparison.armyB.upgrades)), references.map(reference => reference.id));
    assert.equal(getDesign(id).level, 3);
    assert.equal(getDesign(id).placement, 'replace');
  }
  const schedule = makeSchedule(config);
  assert.equal(schedule.length, 832);
  assert.equal(new Set(schedule.map(game => game.pairId)).size, 416);
  assert.equal(schedule.filter(game => game.aColor === 'w').length, 416);
  assert.deepEqual(config.engine, ENGINE);
  assert.equal(Object.hasOwn(config, 'evaluation'), false, 'automatic engine values are explicit protocol context, not fitted prices');
});

test('reference 2v2 compares exactly six legal distinct-family partnerships once per eight-opening color pair', () => {
  const teams = referenceTeams(), config = buildReferencePairs();
  assert.equal(teams.length, 6);
  assert.equal(config.comparisons.length, 15);
  assert.equal(makeSchedule(config).length, 240);
  assert.equal(createDesignRegistry(config).definitions.length, 4);
  assert.deepEqual(normalizeConfig(JSON.parse(readFileSync(FILES['reference-2v2'], 'utf8'))), config);
  const pairs = new Set();
  for (const comparison of config.comparisons) {
    const members = [comparison.armyA, comparison.armyB].map(army => {
      const ids = Object.values(army.upgrades);
      assert.equal(ids.length, 2);
      assert.equal(ids.reduce((total, id) => total + getDesign(id).level, 0), 6);
      assert.equal(new Set(ids.map(id => getDesign(id).family)).size, 2);
      assert.equal(Object.hasOwn(army.upgrades, 'e1'), false);
      return ids.sort().join(',');
    }).sort();
    assert.equal(pairs.has(members.join('/')), false);
    pairs.add(members.join('/'));
  }
  const metadata = loadExperiment('reference-2v2').metadata;
  assert.equal(metadata.rows.length, 6);
  assert.equal(metadata.columns.length, 6);
  assert.equal(metadata.symmetric, true);
});

test('shared eight-opening cohort retains a move-one reserve case and declares the seven two-ply delays', () => {
  assert.equal(OPENINGS.length, 8);
  assert.deepEqual(OPENINGS[0], { id: 'start', moves: [] });
  assert.ok(OPENINGS.slice(1).every(opening => opening.moves.length === 2));
  assert.equal(new Set(OPENINGS.map(opening => opening.moves.join(' '))).size, 8);
  for (const name of ['level3', 'reference-2v2']) {
    const declaration = loadExperiment(name);
    assert.equal(declaration.config.seed, 20261028);
    assert.equal(declaration.config.repetitions, 1);
    assert.match(declaration.metadata.uncertainty, /coarse screen/);
    assert.equal(Object.isFrozen(declaration.config), true);
  }
  assert.throws(() => loadExperiment('../unknown'), /Choose an experiment/);
});

test('all declared replacement and 2v2 opening/color positions replay legally without match games', { timeout: 120000 }, async () => {
  for (const config of [buildLevel3Screen(), buildReferencePairs()]) {
    const proof = await validateDesignConfig(config, { standardOpeningSources: true });
    assert.equal(proof.validatedOpenings, makeSchedule(config).length);
    assert.equal(proof.native, false);
  }
});
