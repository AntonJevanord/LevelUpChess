const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { loadExperiment, replacementCandidates } = require('../scripts/balance/v17-plan');
const { OLD_OPENINGS, NEW_OPENINGS, BOTH_OPENINGS, FILES, CAPS, UNCHANGED, REVISIONS, candidates, buildFollowup } = require('../scripts/balance/v17-followup-plan');
const { makeSchedule } = require('../scripts/balance/plan');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { getOfficialReferences } = require('../scripts/balance/official-references');
const { getDesign } = require('../src/design-catalog');
const { validateDesignConfig } = require('../scripts/balance/validate-designs');
const { createV17Report } = require('../scripts/balance/v17-report');
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('completed version-17 protocols retain their original configs, schedules, registries and profiles', () => {
  const frozen = {
    level3: ['ff387bbf03c1fa21836e8d32345cf0d5e29580306d57f43df07d849a761950be', '3764c67cb4144e55d363158ad37678023f91e46d8cd00ff776385b88e10bccf3', 'af5b18a5a3c9b2800b4d78a2cd95ce0efb8058e572cde1763e7334b50d0ac675', '641846d94fe804d0a559596ae7f228c11c8d979eedb5660b9c57f9337cc75418'],
    'reference-2v2': ['2eb75058826013b5221a6105fcdec036bd37c4525d448372d4f2af4a1964b44e', '32e7881d2587045fc4e2bca39d78f8a9a31ce8ad97cc550ed7580dbf2541ba5d', '519a2f0271668d49b9f03616c6794a32d26a9677235008638dc3523300689aef', 'ab96122073ee834fc0592f33e65b022b8829ec652ef413a7d2f4adf5d6523f61'],
    'pawn-grants': ['d3959973372c69e1dd287ab8b552c4981f1dc2d6eb79c0d6126adbf78a0291ce', '21dd957702b714bcaf99ab9ccde0113da300a66e6c08bcdf8c2d0b163d77f5f3', '18c334e76029b533cfe54a2766cdfb5bd7720f9a02bc703926b53b8c46377a22', 'dd75c8d37d974c3aee2091c198803de4d10b86d3a4e68b520540b4d3ae68e552'],
  };
  for (const [name, expected] of Object.entries(frozen)) {
    const { config } = loadExperiment(name), registry = createDesignRegistry(config), profile = compileDesignProfile(registry);
    assert.deepEqual([sha(config), sha(makeSchedule(config)), registry.hash, profile.hash], expected, name);
  }
});

test('unchanged candidates receive only eight new opening cases, without replaying completed cells', () => {
  const all = replacementCandidates().map(candidate => candidate.designId);
  const stopped = ['pawn.purple@11', 'bishop.purple@14', 'bishop.purple@15', 'rook.purple@13'];
  assert.deepEqual(UNCHANGED.map(([id]) => id), all.filter(id => !stopped.includes(id)));
  assert.equal(OLD_OPENINGS.length, 8);
  assert.equal(NEW_OPENINGS.length, 8);
  assert.equal(new Set(BOTH_OPENINGS.map(opening => opening.id)).size, 16);
  assert.equal(new Set(BOTH_OPENINGS.map(opening => opening.moves.join(' '))).size, 16);
  assert.ok(NEW_OPENINGS.every(opening => opening.moves.length === 2));
  const declaration = loadExperiment('level3-confirm');
  assert.deepEqual(declaration.config.openings, NEW_OPENINGS);
  assert.equal(declaration.metadata.openingCohorts.length, 1);
  const oldCells = new Set(makeSchedule(loadExperiment('level3').config)
    .map(game => JSON.stringify([game.comparisonId, game.openingMoves, game.aColor])));
  for (const game of makeSchedule(declaration.config)) {
    assert.equal(oldCells.has(JSON.stringify([game.comparisonId, game.openingMoves, game.aColor])), false);
  }
});

test('targeted revisions retain immutable behavior, use both cohorts and face only frozen references', () => {
  assert.deepEqual(REVISIONS.map(([id]) => [id, getDesign(id)?.movement]), [
    ['pawn.purple@7', 'mRceB2'], ['pawn.purple@13', 'mRcfB'],
    ['bishop.purple@17', 'BcWcN'], ['bishop.purple@18', 'BvWvN'], ['rook.purple@14', 'RFsNmsC'],
  ]);
  const { config, metadata } = loadExperiment('level3-revisions');
  assert.deepEqual(config.openings, BOTH_OPENINGS);
  assert.deepEqual(metadata.openingCohorts.map(cohort => cohort.openingIds.length), [8, 8]);
  const references = getOfficialReferences().roster.map(reference => reference.id);
  for (const candidate of candidates('level3-revisions')) {
    const cells = config.comparisons.filter(comparison => Object.values(comparison.armyA.upgrades).includes(candidate.designId));
    assert.deepEqual(cells.flatMap(comparison => Object.values(comparison.armyB.upgrades)), references);
  }
  assert.equal(createDesignRegistry(config).definitions.length, 9);
});

test('three revised level-one bundles cost three points and retain the original central files and pocket rules', () => {
  const declaration = loadExperiment('pawn-grants-revisions'), { config } = declaration;
  assert.equal(config.schemaVersion, 3);
  assert.equal(config.comparisons.length, 12, 'no unrequested candidate-versus-candidate games');
  assert.deepEqual(config.openings, BOTH_OPENINGS);
  assert.deepEqual(candidates('pawn-grants-revisions').map(candidate => candidate.army), [
    { upgrades: { c2: 'pawn.blue@4', d2: 'pawn.blue@4', e2: 'pawn.blue@4' } },
    { upgrades: { c2: 'pawn.blue@5', d2: 'pawn.blue@5', e2: 'pawn.blue@5' } },
    { upgrades: {}, reserve: [{ id: 'king.reserve-pawn@2', count: 3 }] },
  ]);
  for (const comparison of config.comparisons) for (const army of [comparison.armyA, comparison.armyB]) {
    const cost = Object.values(army.upgrades).reduce((sum, id) => sum + getDesign(id).level, 0)
      + army.reserve.reduce((sum, entry) => sum + getDesign(entry.id).level * entry.count, 0);
    assert.equal(cost, 3);
    assert.equal(Object.hasOwn(army.upgrades, 'e1'), false);
    assert.deepEqual(army.remove, []);
  }
  const profile = compileDesignProfile(createDesignRegistry(config));
  assert.match(profile.config, /dropChecks = false/);
  assert.match(profile.config, /dropRegionWhite = \*1 \*2 \*3 \*4/);
  assert.match(profile.config, /dropRegionBlack = \*5 \*6 \*7 \*8/);
});

test('new declarations have bounded schedules, paired colors and rectangular four-reference reports', () => {
  assert.equal(Object.values(CAPS).reduce((sum, count) => sum + count, 0), 1600);
  for (const name of Object.keys(FILES)) {
    const declaration = loadExperiment(name), { config, metadata } = declaration;
    assert.deepEqual(config, buildFollowup(name));
    assert.equal(Object.isFrozen(config), true);
    assert.equal(Object.hasOwn(config, 'evaluation'), false);
    const schedule = makeSchedule(config);
    assert.equal(schedule.length, CAPS[name]);
    const pairs = new Map();
    for (const game of schedule) {
      const colors = pairs.get(game.pairId) || new Set();
      assert.equal(colors.has(game.aColor), false);
      colors.add(game.aColor); pairs.set(game.pairId, colors);
    }
    assert.ok([...pairs.values()].every(colors => colors.size === 2));
    assert.equal(createDesignRegistry(config).definitions.length <= 20, true);
    const report = createV17Report({ ...declaration, records: [] });
    assert.equal(report.matrix.columns.length, 4);
    assert.equal(report.matrix.rows.length, metadata.rows.length);
    assert.ok(report.matrix.rows.every(row => row.cells.length === 4 && row.cells.every(cell => cell.score === null)));
  }
});

test('all 1,600 follow-up army/opening/color positions replay legally without match games', { timeout: 180000 }, async () => {
  for (const name of Object.keys(FILES)) {
    const proof = await validateDesignConfig(loadExperiment(name).config, { standardOpeningSources: true });
    assert.equal(proof.validatedOpenings, CAPS[name], name);
    assert.equal(proof.native, false);
  }
});
