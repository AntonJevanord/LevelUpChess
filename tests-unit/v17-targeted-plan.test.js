const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { loadExperiment, FILES, CAPS } = require('../scripts/balance/v17-plan');
const { EXPERIMENT, CANDIDATES, BASELINE, opponents, buildTargetedConfig } = require('../scripts/balance/v17-targeted-plan');
const { BOTH_OPENINGS } = require('../scripts/balance/v17-followup-plan');
const { makeSchedule } = require('../scripts/balance/plan');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { getOfficialReferences } = require('../scripts/balance/official-references');
const { validateDesignConfig } = require('../scripts/balance/validate-designs');
const { getDesign } = require('../src/design-catalog');
const { PLAYABLE_LIBRARIES } = require('../src/playable-library');
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const cost = army => Object.values(army.upgrades || {}).reduce((sum, id) => sum + getDesign(id).level, 0)
  + (army.reserve || []).reduce((sum, entry) => sum + getDesign(entry.id).level * entry.count, 0);

test('all six completed protocols retain their config, schedule, registry and profile identities', () => {
  const frozen = {
    level3: ['ff387bbf03c1fa21836e8d32345cf0d5e29580306d57f43df07d849a761950be', '3764c67cb4144e55d363158ad37678023f91e46d8cd00ff776385b88e10bccf3', 'af5b18a5a3c9b2800b4d78a2cd95ce0efb8058e572cde1763e7334b50d0ac675', '641846d94fe804d0a559596ae7f228c11c8d979eedb5660b9c57f9337cc75418'],
    'reference-2v2': ['2eb75058826013b5221a6105fcdec036bd37c4525d448372d4f2af4a1964b44e', '32e7881d2587045fc4e2bca39d78f8a9a31ce8ad97cc550ed7580dbf2541ba5d', '519a2f0271668d49b9f03616c6794a32d26a9677235008638dc3523300689aef', 'ab96122073ee834fc0592f33e65b022b8829ec652ef413a7d2f4adf5d6523f61'],
    'pawn-grants': ['d3959973372c69e1dd287ab8b552c4981f1dc2d6eb79c0d6126adbf78a0291ce', '21dd957702b714bcaf99ab9ccde0113da300a66e6c08bcdf8c2d0b163d77f5f3', '18c334e76029b533cfe54a2766cdfb5bd7720f9a02bc703926b53b8c46377a22', 'dd75c8d37d974c3aee2091c198803de4d10b86d3a4e68b520540b4d3ae68e552'],
    'level3-confirm': ['afc30087918f42183fc6528bb6de96391efdc0a213d0a6d340b0fb26fd04a4c2', '9084fc49094c2a382af4720b8acd18798bd4ece2d71dc93bf688ddb2bacf2e25', '7c613b0b1b671eab8e2f94d2abd0798c611ce00805934b1a25a1dd70287f9bbe', '7cde1067d14a6940d61c1706829e9cdc3abf3010693bfe7295aba03cca5e5452'],
    'level3-revisions': ['3c5b2969f7716b694ce0702472389f055e3b09a0fd95f605b8a3c65190dacb5b', '75abaec74318045a174b8daf91d76059850a329cf93911eab9b478e87f3fd943', '39bf148d667fbc099cfe835c3aabf3c5dee764d7e9f35eb29311f8693e2edfc0', 'd922295787a47ea639148b06207f097264109309e6f65b845356c0ffdb341fed'],
    'pawn-grants-revisions': ['4b27346bd18ed05308a9082f6bf409e9e0a68ba3ed35f46b464f6523f09ae469', 'a96e34e76a11e736f5e57778f444f0a69f3ffaf6f2a34017d782d0dd291f794e', '7682c72a4c91ba84b3d0dbab5ecdc4617417433dca52cd6a7ef7bba0eb0f2b8c', '54de68690cc1335e035706f4f3d328a79e33f9ec886f8ee6be3d8e3fdfe75738'],
  };
  for (const [name, expected] of Object.entries(frozen)) {
    const { config } = loadExperiment(name), registry = createDesignRegistry(config), profile = compileDesignProfile(registry);
    assert.deepEqual([sha(config), sha(makeSchedule(config)), registry.hash, profile.hash], expected, name);
  }
});

test('design-focus declares four new alternatives against four fixed references and three two-step pawns', () => {
  const declaration = loadExperiment(EXPERIMENT), { config, metadata } = declaration;
  assert.equal(FILES[EXPERIMENT], 'experiments/balance/v17-design-focus.json');
  assert.equal(CAPS[EXPERIMENT], 640);
  assert.deepEqual(config, buildTargetedConfig());
  assert.equal(config.schemaVersion, 3);
  assert.equal(config.seed, 20261028);
  assert.equal(config.repetitions, 1);
  assert.deepEqual(config.engine, { nodes: 20000, threads: 1, hashMb: 32, maxPlies: 400 });
  assert.deepEqual(config.openings, BOTH_OPENINGS);
  assert.equal(Object.hasOwn(config, 'evaluation'), false);
  assert.equal(Object.isFrozen(config), true);
  assert.equal(config.comparisons.length, 20);
  assert.equal(metadata.rows.length, 4);
  assert.equal(metadata.columns.length, 5);
  assert.deepEqual(metadata.columns.map(column => column.key), [...getOfficialReferences().roster.map(reference => reference.key), 'two-step-pawns']);
  assert.deepEqual(metadata.openingCohorts.map(cohort => cohort.openingIds.length), [8, 8]);
  assert.equal(metadata.symmetric, false);
  for (const a of CANDIDATES) {
    const matches = config.comparisons.filter(comparison => comparison.id.startsWith(a.key + '-v-'));
    assert.equal(matches.length, 5);
    assert.deepEqual(matches.map(comparison => comparison.id), opponents().map(b => a.key + '-v-' + b.key));
  }
  assert.deepEqual(BASELINE.army.upgrades, { c2: 'pawn.blue@5', d2: 'pawn.blue@5', e2: 'pawn.blue@5' });
  assert.equal(config.comparisons.filter(comparison => comparison.id.endsWith('-v-two-step-pawns')).length, 4);
  assert.ok(config.comparisons.every(comparison => CANDIDATES.some(candidate => comparison.id.startsWith(candidate.key + '-v-'))),
    'no reference controls, baseline-self matches or historical cells are replayed');
});

test('all armies spend three points and ordinary kings, files, finite pockets and historical designs stay fixed', () => {
  const { config } = loadExperiment(EXPERIMENT);
  assert.deepEqual(CANDIDATES.map(candidate => [candidate.designId, getDesign(candidate.designId).movement]), [
    ['bishop.purple@19', 'BDC'], ['pawn.blue@6', 'FfmWifmnD'],
    ['king.reserve-pawn@3', 'fW2'], ['king.reserve-pawn@4', 'fmWfceF'],
  ]);
  assert.equal(getDesign('pawn.blue@5').movement, 'fmW2fceF2');
  for (const comparison of config.comparisons) for (const army of [comparison.armyA, comparison.armyB]) {
    assert.equal(cost(army), 3);
    assert.deepEqual(army.remove, []);
    assert.equal(Object.hasOwn(army.upgrades, 'e1'), false);
    if (army.reserve.length) {
      assert.equal(army.reserve.length, 1);
      assert.equal(army.reserve[0].count, 3);
      assert.deepEqual(army.upgrades, {});
    }
  }
  for (const candidate of CANDIDATES) for (const library of PLAYABLE_LIBRARIES) {
    assert.equal(library.designIds.includes(candidate.designId), false, 'research candidates do not alter playable libraries');
  }
  const registry = createDesignRegistry(config), profile = compileDesignProfile(registry);
  assert.equal(registry.definitions.length, 9);
  assert.deepEqual(registry.definitions.map(design => design.id).sort(),
    [...getOfficialReferences().roster.map(reference => reference.id), ...CANDIDATES.map(candidate => candidate.designId), BASELINE.designId].sort());
  assert.match(profile.config, /dropChecks = false/);
  assert.match(profile.config, /capturesToHand = false/);
  assert.match(profile.config, /dropRegionWhite = \*1 \*2 \*3 \*4/);
  assert.match(profile.config, /dropRegionBlack = \*5 \*6 \*7 \*8/);
  assert.match(profile.config, /promotionPieceTypes = nbrq/);
  assert.deepEqual(profile.roles.royalTypes, ['k']);
});

test('the 640-game cap contains all sixteen openings in mirrored pairs with no missing or duplicate cells', () => {
  const { config } = loadExperiment(EXPERIMENT), schedule = makeSchedule(config);
  assert.equal(schedule.length, 640);
  assert.equal(new Set(schedule.map(game => game.id)).size, 640);
  const pairs = new Map(), comparisons = new Map();
  for (const game of schedule) {
    const colors = pairs.get(game.pairId) || [];
    colors.push(game.aColor); pairs.set(game.pairId, colors);
    const cases = comparisons.get(game.comparisonId) || new Map();
    const entries = cases.get(game.openingId) || [];
    entries.push(game.aColor); cases.set(game.openingId, entries); comparisons.set(game.comparisonId, cases);
  }
  assert.equal(pairs.size, 320);
  assert.ok([...pairs.values()].every(colors => colors.sort().join('') === 'bw'));
  assert.equal(comparisons.size, 20);
  assert.ok([...comparisons.values()].every(cases => cases.size === 16 && [...cases.values()].every(colors => colors.sort().join('') === 'bw')));
});

test('all 640 declared army/opening/color positions replay legally without match games', { timeout: 120000 }, async () => {
  const proof = await validateDesignConfig(loadExperiment(EXPERIMENT).config, { standardOpeningSources: true });
  assert.equal(proof.games, 640);
  assert.equal(proof.validatedOpenings, 640);
  assert.equal(proof.native, false);
});

test('optional native parity covers the declared positions without requesting scored games',
  { skip: !process.env.FAIRY_STOCKFISH_PATH, timeout: 120000 }, async () => {
    const proof = await validateDesignConfig(loadExperiment(EXPERIMENT).config,
      { standardOpeningSources: true, enginePath: process.env.FAIRY_STOCKFISH_PATH });
    assert.equal(proof.games, 640);
    assert.equal(proof.validatedOpenings, 640);
    assert.equal(proof.native, true);
  });
