const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { loadExperiment, FILES: ALL_FILES, CAPS: ALL_CAPS } = require('../scripts/balance/v17-plan');
const { OLD_OPENINGS, NEW_OPENINGS, ALL_OPENINGS, FILES, CAPS, CONFIRM_CANDIDATES,
  REVISIONS, cells, buildMobilityConfig } = require('../scripts/balance/v17-mobility-plan');
const { CANDIDATES: FOCUS_CANDIDATES, BASELINE } = require('../scripts/balance/v17-targeted-plan');
const { makeSchedule } = require('../scripts/balance/plan');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { getDesign } = require('../src/design-catalog');
const { getOfficialReferences } = require('../scripts/balance/official-references');
const { validateDesignConfig } = require('../scripts/balance/validate-designs');
const { createV17Report } = require('../scripts/balance/v17-report');
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const cost = army => Object.values(army.upgrades || {}).reduce((sum, id) => sum + getDesign(id).level, 0)
  + (army.reserve || []).reduce((sum, entry) => sum + getDesign(entry.id).level * entry.count, 0);

test('all seven completed protocols retain their config, schedule, registry and profile identities', () => {
  const frozen = {
    level3: ['ff387bbf03c1fa21836e8d32345cf0d5e29580306d57f43df07d849a761950be', '3764c67cb4144e55d363158ad37678023f91e46d8cd00ff776385b88e10bccf3', 'af5b18a5a3c9b2800b4d78a2cd95ce0efb8058e572cde1763e7334b50d0ac675', '641846d94fe804d0a559596ae7f228c11c8d979eedb5660b9c57f9337cc75418'],
    'reference-2v2': ['2eb75058826013b5221a6105fcdec036bd37c4525d448372d4f2af4a1964b44e', '32e7881d2587045fc4e2bca39d78f8a9a31ce8ad97cc550ed7580dbf2541ba5d', '519a2f0271668d49b9f03616c6794a32d26a9677235008638dc3523300689aef', 'ab96122073ee834fc0592f33e65b022b8829ec652ef413a7d2f4adf5d6523f61'],
    'pawn-grants': ['d3959973372c69e1dd287ab8b552c4981f1dc2d6eb79c0d6126adbf78a0291ce', '21dd957702b714bcaf99ab9ccde0113da300a66e6c08bcdf8c2d0b163d77f5f3', '18c334e76029b533cfe54a2766cdfb5bd7720f9a02bc703926b53b8c46377a22', 'dd75c8d37d974c3aee2091c198803de4d10b86d3a4e68b520540b4d3ae68e552'],
    'level3-confirm': ['afc30087918f42183fc6528bb6de96391efdc0a213d0a6d340b0fb26fd04a4c2', '9084fc49094c2a382af4720b8acd18798bd4ece2d71dc93bf688ddb2bacf2e25', '7c613b0b1b671eab8e2f94d2abd0798c611ce00805934b1a25a1dd70287f9bbe', '7cde1067d14a6940d61c1706829e9cdc3abf3010693bfe7295aba03cca5e5452'],
    'level3-revisions': ['3c5b2969f7716b694ce0702472389f055e3b09a0fd95f605b8a3c65190dacb5b', '75abaec74318045a174b8daf91d76059850a329cf93911eab9b478e87f3fd943', '39bf148d667fbc099cfe835c3aabf3c5dee764d7e9f35eb29311f8693e2edfc0', 'd922295787a47ea639148b06207f097264109309e6f65b845356c0ffdb341fed'],
    'pawn-grants-revisions': ['4b27346bd18ed05308a9082f6bf409e9e0a68ba3ed35f46b464f6523f09ae469', 'a96e34e76a11e736f5e57778f444f0a69f3ffaf6f2a34017d782d0dd291f794e', '7682c72a4c91ba84b3d0dbab5ecdc4617417433dca52cd6a7ef7bba0eb0f2b8c', '54de68690cc1335e035706f4f3d328a79e33f9ec886f8ee6be3d8e3fdfe75738'],
    'design-focus': ['5305aa9bb04ea2ab433bd929010b01cc1abb4f79c23db34065e8093343f7c06c', 'b5ed1481cdf7cdbf885536a0b7787e085efcb4e2865668fddeb76ecee2cd99eb', 'acb5460da2b76ef40f2ec201b8c274005bad44914807eb47926ee881fe7225e4', '87444b5ffda6dbbd3d4f89e4b9eb62126affc2c99c498366e38a1f94592599da'],
  };
  for (const [name, expected] of Object.entries(frozen)) {
    const { config } = loadExperiment(name), registry = createDesignRegistry(config), profile = compileDesignProfile(registry);
    assert.deepEqual([sha(config), sha(makeSchedule(config)), registry.hash, profile.hash], expected, name);
  }
});

test('sixteen genuinely new short prefixes retain the deployment delay and cannot replay old cells', () => {
  assert.equal(OLD_OPENINGS.length, 16);
  assert.equal(NEW_OPENINGS.length, 16);
  assert.equal(ALL_OPENINGS.length, 32);
  assert.equal(new Set(ALL_OPENINGS.map(opening => opening.id)).size, 32);
  assert.equal(new Set(ALL_OPENINGS.map(opening => opening.moves.join(' '))).size, 32);
  assert.ok(NEW_OPENINGS.every(opening => opening.moves.length === 2));
  const oldGames = [...makeSchedule(loadExperiment('design-focus').config),
    ...makeSchedule(loadExperiment('pawn-grants-revisions').config).filter(game => game.comparisonId.startsWith('two-step-pawns-v-'))];
  assert.equal(oldGames.length, 768);
  const oldCells = new Set(oldGames.map(game => JSON.stringify([game.comparisonId, game.openingMoves, game.aColor])));
  for (const game of makeSchedule(loadExperiment('mobility-confirm').config)) {
    assert.equal(oldCells.has(JSON.stringify([game.comparisonId, game.openingMoves, game.aColor])), false);
  }
});

test('confirmation retains all old purchases and adds only new baseline-versus-reference cases', () => {
  const { config, metadata } = loadExperiment('mobility-confirm');
  assert.equal(config.comparisons.length, 24);
  assert.deepEqual(config.openings, NEW_OPENINGS);
  assert.deepEqual(CONFIRM_CANDIDATES, [...FOCUS_CANDIDATES, BASELINE]);
  const oldComparisons = loadExperiment('design-focus').config.comparisons;
  const baselineComparisons = loadExperiment('pawn-grants-revisions').config.comparisons.filter(comparison => comparison.id.startsWith('two-step-pawns-v-'));
  assert.deepEqual(config.comparisons, [...oldComparisons, ...baselineComparisons]);
  assert.equal(metadata.rows.length, 5);
  assert.equal(metadata.columns.length, 5);
  assert.equal(metadata.symmetric, false);
  assert.deepEqual(metadata.openingCohorts.map(cohort => cohort.openingIds.length), [16]);
  assert.deepEqual(metadata.historicalReuse, { designFocusGames: 640, baselineReferenceGames: 128, replayOldCases: false });
  assert.equal(cells('mobility-confirm').filter(([a, b]) => a.key === b.key).length, 0);
  const empty = createV17Report({ ...loadExperiment('mobility-confirm'), records: [] });
  assert.equal(empty.matrix.rows.find(row => row.key === BASELINE.key).cells.at(-1).comparisonId, null);
  assert.equal(empty.overall.rows.find(row => row.key === BASELINE.key).opponents.length, 4);
});

test('new revisions have distinct immutable capture behavior, three-point armies and all thirty-two cases', () => {
  const { config, metadata } = loadExperiment('mobility-revisions');
  assert.deepEqual(REVISIONS.map(candidate => [candidate.designId, getDesign(candidate.designId).movement]), [
    ['king.reserve-pawn@5', 'cfWmfF'], ['king.reserve-pawn@6', 'fWmfF'], ['pawn.blue@7', 'mWFifmnD'],
  ]);
  assert.equal(getDesign('bishop.purple@19').level, 3, 'the measured grid bishop retains its price');
  assert.equal(config.comparisons.length, 15);
  assert.deepEqual(config.openings, ALL_OPENINGS);
  assert.deepEqual(metadata.openingCohorts.map(cohort => cohort.openingIds.length), [16, 16]);
  assert.deepEqual(metadata.columns.map(column => column.key), [...getOfficialReferences().roster.map(reference => reference.key), BASELINE.key]);
  for (const name of Object.keys(FILES)) for (const comparison of loadExperiment(name).config.comparisons) {
    for (const army of [comparison.armyA, comparison.armyB]) {
      assert.equal(cost(army), 3);
      assert.deepEqual(army.remove, []);
      assert.equal(Object.hasOwn(army.upgrades, 'e1'), false);
      if (army.reserve.length) assert.equal(army.reserve[0].count, 3);
    }
  }
  assert.deepEqual(REVISIONS[2].army.upgrades, { c2: 'pawn.blue@7', d2: 'pawn.blue@7', e2: 'pawn.blue@7' });
});

test('both new schedules are bounded paired protocols with unchanged reference and reserve rules', () => {
  assert.equal(Object.values(CAPS).reduce((sum, value) => sum + value, 0), 1728);
  for (const name of Object.keys(FILES)) {
    const { config } = loadExperiment(name), schedule = makeSchedule(config);
    assert.equal(ALL_FILES[name], FILES[name]); assert.equal(ALL_CAPS[name], CAPS[name]);
    assert.deepEqual(config, buildMobilityConfig(name));
    assert.equal(config.schemaVersion, 3);
    assert.equal(config.seed, 20261028); assert.equal(config.repetitions, 1);
    assert.deepEqual(config.engine, { nodes: 20000, threads: 1, hashMb: 32, maxPlies: 400 });
    assert.equal(Object.hasOwn(config, 'evaluation'), false);
    assert.equal(Object.isFrozen(config), true);
    assert.equal(schedule.length, CAPS[name]);
    assert.equal(new Set(schedule.map(game => game.id)).size, CAPS[name]);
    const pairs = new Map();
    for (const game of schedule) pairs.set(game.pairId, [...(pairs.get(game.pairId) || []), game.aColor]);
    assert.equal(pairs.size, CAPS[name] / 2);
    assert.ok([...pairs.values()].every(colors => colors.sort().join('') === 'bw'));
    const registry = createDesignRegistry(config), profile = compileDesignProfile(registry);
    assert.equal(registry.definitions.length, name === 'mobility-confirm' ? 9 : 8);
    assert.deepEqual(profile.roles.royalTypes, ['k']);
    assert.match(profile.config, /dropChecks = false/);
    assert.match(profile.config, /capturesToHand = false/);
    assert.match(profile.config, /promotionPieceTypes = nbrq/);
    assert.match(profile.config, /dropRegionWhite = \*1 \*2 \*3 \*4/);
    assert.match(profile.config, /dropRegionBlack = \*5 \*6 \*7 \*8/);
  }
});

test('all 1,728 new army/opening/color positions replay without playing match games', { timeout: 120000 }, async () => {
  for (const name of Object.keys(FILES)) {
    const proof = await validateDesignConfig(loadExperiment(name).config, { standardOpeningSources: true });
    assert.equal(proof.games, CAPS[name]);
    assert.equal(proof.validatedOpenings, CAPS[name]);
    assert.equal(proof.native, false);
  }
});

test('optional native parity validates the full bounded mobility declarations without scored games',
  { skip: !process.env.FAIRY_STOCKFISH_PATH, timeout: 180000 }, async () => {
    for (const name of Object.keys(FILES)) {
      const proof = await validateDesignConfig(loadExperiment(name).config,
        { standardOpeningSources: true, enginePath: process.env.FAIRY_STOCKFISH_PATH });
      assert.equal(proof.games, CAPS[name]);
      assert.equal(proof.validatedOpenings, CAPS[name]);
      assert.equal(proof.native, true);
    }
  });
