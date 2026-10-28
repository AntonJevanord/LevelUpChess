const test = require('node:test');
const assert = require('node:assert/strict');
const { loadExperiment } = require('../scripts/balance/v17-plan');
const { makeSchedule } = require('../scripts/balance/plan');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { getDesign } = require('../src/design-catalog');
const { createV17Report } = require('../scripts/balance/v17-report');
const { validateDesignConfig } = require('../scripts/balance/validate-designs');
const { ADDITIONS } = require('../scripts/balance/v17-mobility-extras-plan');
const { ALL_OPENINGS } = require('../scripts/balance/v17-mobility-plan');
const cost = army => Object.values(army.upgrades).reduce((sum, id) => sum + getDesign(id).level, 0)
  + army.reserve.reduce((sum, item) => sum + getDesign(item.id).level * item.count, 0);

test('expanded and additions-only declarations preserve the previous 960-game revision protocol', () => {
  const original = loadExperiment('mobility-revisions');
  const expanded = loadExperiment('mobility-expanded');
  const additions = loadExperiment('mobility-additions');
  assert.equal(makeSchedule(original.config).length, 960);
  assert.equal(makeSchedule(loadExperiment('mobility-confirm').config).length, 768);
  assert.equal(makeSchedule(expanded.config).length, 1600);
  assert.equal(makeSchedule(additions.config).length, 640);
  assert.deepEqual(expanded.config.comparisons.slice(0, 15), original.config.comparisons);
  assert.deepEqual(expanded.config.comparisons.slice(15), additions.config.comparisons);
  const old = new Set(makeSchedule(original.config).map(game => game.id));
  const extra = new Set(makeSchedule(additions.config).map(game => game.id));
  assert.equal([...extra].filter(id => old.has(id)).length, 0);
  assert.ok(makeSchedule(expanded.config).every(game => old.has(game.id) || extra.has(game.id)));
  assert.equal(expanded.metadata.alternativeTo, 'mobility-revisions');
  assert.ok(expanded.metadata.doNotRunAlongside.includes('mobility-additions'));
});

test('both new purchases use immutable one-point designs and equal three-point armies', () => {
  assert.deepEqual(ADDITIONS.map(item => [item.designId, getDesign(item.designId).movement]), [
    ['pawn.blue@8', 'fmWfceFifmnDsW'], ['king.reserve-pawn@7', 'fWbmF'],
  ]);
  for (const [name, rows, comparisons, types] of [['mobility-expanded', 5, 25, 10], ['mobility-additions', 2, 10, 7]]) {
    const declaration = loadExperiment(name), { config, metadata } = declaration;
    assert.equal(metadata.rows.length, rows); assert.equal(metadata.columns.length, 5);
    assert.equal(config.comparisons.length, comparisons);
    assert.deepEqual(config.openings, ALL_OPENINGS);
    assert.deepEqual(config.engine, loadExperiment('mobility-revisions').config.engine);
    assert.equal(createDesignRegistry(config).definitions.length, types);
    assert.equal(Object.hasOwn(config, 'evaluation'), false);
    for (const comparison of config.comparisons) for (const army of [comparison.armyA, comparison.armyB]) {
      assert.equal(cost(army), 3);
      assert.deepEqual(army.remove, []);
      assert.equal(Object.hasOwn(army.upgrades, 'e1'), false);
    }
  }
});

test('Support/Scout baseline outcomes cannot change their four-reference overall score', () => {
  const declaration = loadExperiment('mobility-additions');
  const baselineCells = new Set(declaration.metadata.comparisons.filter(item => item.bKey === 'two-step-pawns').map(item => item.id));
  const records = makeSchedule(declaration.config).map(game => {
    const aWins = !baselineCells.has(game.comparisonId);
    return { id: game.id, pairId: game.pairId, comparisonId: game.comparisonId, openingId: game.openingId,
      aColor: game.aColor, attempt: 1, status: 'completed', result: aWins === (game.aColor === 'w') ? '1-0' : '0-1' };
  });
  const report = createV17Report({ ...declaration, records });
  assert.equal(report.progress.pairedGames, 640);
  assert.ok(report.overall.rows.every(row => row.score === 1 && row.games === 256 && row.opponents.length === 4));
  assert.ok(report.matrix.rows.every(row => row.cells.at(-1).score === 0 && row.cells.at(-1).pairedGames === 64));
});

test('all expanded starting armies and opening positions replay legally without match games', { timeout: 120000 }, async () => {
  for (const [name, games] of [['mobility-expanded', 1600], ['mobility-additions', 640]]) {
    const proof = await validateDesignConfig(loadExperiment(name).config, { standardOpeningSources: true });
    assert.equal(proof.validatedOpenings, games);
    assert.equal(proof.native, false);
  }
});
