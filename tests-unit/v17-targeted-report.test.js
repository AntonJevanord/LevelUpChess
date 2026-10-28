'use strict';

// Synthetic outcomes exercise the declared campaign and report wiring only.
// They are not engine games, balance evidence, or native preflight results.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { loadExperiment } = require('../scripts/balance/v17-plan');
const { makeSchedule } = require('../scripts/balance/plan');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { getDesign } = require('../src/design-catalog');
const { getOfficialReferences } = require('../scripts/balance/official-references');
const { createV17Report, renderV17Report } = require('../scripts/balance/v17-report');
const { main, writePreflight } = require('../scripts/version17-balance');

const sha = value => createHash('sha256').update(value).digest('hex');
const BASELINE = 'two-step-pawns';
function fixture(baselineScore = 1) {
  const declaration = loadExperiment('design-focus'), { config, metadata } = declaration;
  const schedule = makeSchedule(config);
  const registry = createDesignRegistry(config), profile = compileDesignProfile(registry, config.evaluation);
  const opponents = new Map(metadata.comparisons.map(item => [item.id, item.bKey]));
  const referenceScores = new Map(getOfficialReferences().roster.map((reference, index) => [reference.key, [0, 0.5, 1, 0.5][index]]));
  const records = schedule.map(game => {
    const score = opponents.get(game.comparisonId) === BASELINE ? baselineScore : referenceScores.get(opponents.get(game.comparisonId));
    const result = score === 0.5 ? '1/2-1/2' : (score === 1) === (game.aColor === 'w') ? '1-0' : '0-1';
    return {
      id: game.id, pairId: game.pairId, comparisonId: game.comparisonId,
      openingId: game.openingId, openingMoves: game.openingMoves, repetition: game.repetition,
      aColor: game.aColor, attempt: 1, status: 'completed', result, reason: 'synthetic-report-fixture-only',
      variant: profile.variant, profileHash: profile.hash, registryHash: registry.hash,
      registryReference: 'run.json#designRegistry', engine: config.engine,
      whiteStrength: game.aColor === 'w' ? game.comparison.strengthA : game.comparison.strengthB,
      blackStrength: game.aColor === 'b' ? game.comparison.strengthA : game.comparison.strengthB,
    };
  });
  return { declaration, config, metadata, schedule, registry, profile, records, opponents, referenceScores };
}
const report = value => createV17Report({ ...value.declaration, records: value.records });
function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v17-targeted-report-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('the targeted campaign reports four candidates against five opponents with correct color perspective', () => {
  const value = fixture(), result = report(value);
  const points = army => Object.values(army.upgrades).reduce((sum, id) => sum + getDesign(id).level, 0)
    + army.reserve.reduce((sum, item) => sum + item.count * getDesign(item.id).level, 0);
  for (const comparison of value.config.comparisons) {
    assert.equal(points(comparison.armyA), 3);
    assert.equal(points(comparison.armyB), 3);
  }
  assert.equal(result.progress.completedGames, 640);
  assert.equal(result.progress.completePairs, 320);
  assert.equal(result.matrix.rows.length, 4);
  assert.equal(result.matrix.columns.length, 5);
  assert.equal(result.comparisons.length, 20);
  for (const comparison of result.comparisons) {
    const expected = value.opponents.get(comparison.id) === BASELINE ? 1 : value.referenceScores.get(value.opponents.get(comparison.id));
    assert.equal(comparison.score, expected);
    assert.equal(comparison.pairedGames, 32);
    assert.equal(comparison.completePairs, 16);
    const source = value.records.filter(record => record.comparisonId === comparison.id);
    assert.equal(source.filter(record => record.aColor === 'w').length, 16);
    assert.equal(source.filter(record => record.aColor === 'b').length, 16);
    if (expected === 1) assert.ok(source.every(record => record.result === (record.aColor === 'w' ? '1-0' : '0-1')));
  }
  for (const row of result.matrix.rows) {
    assert.equal(row.cells.find(cell => cell.columnKey === BASELINE).score, 1);
    const overall = result.overall.rows.find(item => item.key === row.key);
    assert.equal(overall.score, 0.5);
    assert.equal(overall.games, 128);
    assert.equal(overall.opponents.length, 4);
    assert.ok(overall.opponents.every(opponent => opponent.key !== BASELINE));
  }
  const markdown = renderV17Report(result);
  assert.match(markdown, /Three two-step pawns/);
  assert.match(markdown, /Overall score/);
  assert.match(markdown, /50\.00% \(16\/16\)/);
});

test('baseline wins, losses, and unfinished baseline pairs cannot alter the fixed-reference overall score', () => {
  const wins = fixture(1), losses = fixture(0);
  assert.deepEqual(report(wins).overall, report(losses).overall);
  const partial = fixture(1);
  const baseline = partial.records.find(record => partial.opponents.get(record.comparisonId) === BASELINE);
  partial.records = partial.records.filter(record => record.id !== baseline.id);
  const result = report(partial);
  assert.ok(result.overall.rows.every(row => row.score === 0.5 && row.games === 128 && row.openingCoverage.shared === 16));
  const cell = result.comparisons.find(item => item.id === baseline.comparisonId);
  assert.equal(cell.completePairs, 15);
  assert.equal(cell.partialPairs, 1);
});

test('unfinished reference pairs reduce common opening coverage without including the baseline or manufacturing a draw', () => {
  const value = fixture();
  const broken = value.records.find(record => value.opponents.get(record.comparisonId) === 'vanguard');
  value.records = value.records.map(record => record.id === broken.id ? { ...record, status: 'truncated', result: '*', reason: 'max-plies' } : record);
  const result = report(value);
  const metadata = value.metadata.comparisons.find(item => item.id === broken.comparisonId);
  const affected = result.overall.rows.find(row => row.key === metadata.aKey);
  assert.equal(affected.score, 0.5);
  assert.equal(affected.games, 120);
  assert.equal(affected.openingCoverage.shared, 15);
  assert.ok(!affected.openingCoverage.openingIds.includes(broken.openingId));
  assert.equal(result.comparisons.find(item => item.id === broken.comparisonId).statusCounts.truncated, 1);
  assert.equal(result.matrix.rows.find(row => row.key === metadata.aKey).cells.find(cell => cell.columnKey === BASELINE).pairedGames, 32);
});

test('check and launch modes route only the new frozen campaign with all twenty friendly matchup labels', async t => {
  const value = fixture(), directory = path.join(temporary(t), 'run');
  let checks = 0, runs = 0, persisted = 0;
  const check = async declaration => {
    checks++;
    assert.equal(declaration.experiment, 'design-focus');
    assert.equal(declaration.metadata.scheduledGames, 640);
    return { syntheticFixtureOnly: true };
  };
  await main(['--experiment', 'design-focus', '--check', '--rules-only'], {
    check, persist: () => assert.fail('check mode must not write'), run: () => assert.fail('check mode must not start a game'), log: () => {},
  });
  assert.equal(fs.existsSync(directory), false);
  await main(['--experiment', 'design-focus', '--out', directory, '--jobs', '4'], {
    enginePath: '/synthetic-only/unopened-engine', check,
    persist: (output, declaration, validation, options) => {
      persisted++;
      assert.equal(output, directory);
      assert.equal(declaration.experiment, 'design-focus');
      assert.deepEqual(validation, { syntheticFixtureOnly: true });
      assert.equal(options.resume, false);
    },
    run: async (args, options) => {
      runs++;
      assert.equal(persisted, 1);
      assert.deepEqual(args, ['--config', path.resolve(value.declaration.file), '--out', directory, '--jobs', '4']);
      assert.equal(Object.keys(options.comparisonNames).length, 20);
      assert.equal(Object.values(options.comparisonNames).filter(item => item.b === 'Three two-step pawns').length, 4);
      return { stopped: true };
    },
    report: () => ({ report: {}, files: { markdown: 'synthetic-only-report.md' } }), log: () => {},
  });
  assert.equal(checks, 2);
  assert.equal(runs, 1);
  assert.equal(fs.existsSync(directory), false, 'routing fixtures never create experiment evidence');
});

test('the existing offline report command preserves five columns and the separate four-reference overall', async t => {
  const value = fixture(), directory = path.join(temporary(t), 'synthetic-run');
  const runnerSources = [{ file: 'synthetic-fixture-only.js', sha256: '1'.repeat(64) }];
  const runnerSha256 = sha(JSON.stringify(runnerSources)), rulesBundleSha256 = '2'.repeat(64), engineSha256 = '3'.repeat(64);
  const { config, schedule, registry, profile } = value;
  const manifest = {
    schemaVersion: 1, runId: 'synthetic-targeted-report-only', config, schedule,
    configHash: sha(JSON.stringify({ config, schedule })), runnerSources, runnerSha256, rulesBundleSha256, engineSha256,
    rulesHash: sha(JSON.stringify({ bundleHash: rulesBundleSha256, runnerSha256, profiles: [{ variant: profile.variant, config: profile.config }] })),
    designRegistry: registry, designProfile: { variant: profile.variant, config: profile.config, hash: profile.hash, registryHash: registry.hash },
    rulesProfiles: [{ variant: profile.variant, whiteKing: 0, blackKing: 0, configSha256: sha(profile.config),
      file: `rules/${profile.variant}.ini`, royalMode: 'king', evaluationCaveat: null, profileHash: profile.hash, registryHash: registry.hash }],
  };
  const pieces = {};
  for (const reference of getOfficialReferences().roster) {
    const letter = registry.allocations.find(item => item.id === reference.id).letter;
    const fields = Object.fromEntries(['rawMg', 'rawEg', 'captureMg', 'captureEg', 'evalMg', 'evalEg']
      .map(field => [field, reference.engineValue[field.endsWith('Mg') ? 'mg' : 'eg']]));
    pieces[letter] = fields; pieces[letter.toUpperCase()] = fields;
  }
  const validation = { games: 640, validatedOpenings: 640, native: true,
    profileHash: profile.hash, registryHash: registry.hash, engineSha256, configSha256: sha(JSON.stringify(config)), referenceValues: { version: 1, pieces } };
  // Fabricated proof values are isolated test fixtures, never scored run evidence.
  writePreflight(directory, value.declaration, validation);
  fs.mkdirSync(path.join(directory, 'rules'));
  fs.writeFileSync(path.join(directory, 'run.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(directory, manifest.rulesProfiles[0].file), profile.config);
  const journal = value.records.map(record => JSON.stringify(record) + '\n').join('');
  fs.writeFileSync(path.join(directory, 'games.jsonl'), journal);
  const output = await main(['--experiment', 'design-focus', '--report', directory], {
    check: () => assert.fail('offline reporting must not start an engine'), run: () => assert.fail('offline reporting must not start games'), log: () => {},
  });
  assert.equal(output.report.matrix.columns.length, 5);
  assert.ok(output.report.overall.rows.every(row => row.score === 0.5 && row.opponents.length === 4));
  assert.match(fs.readFileSync(output.files.markdown, 'utf8'), /Three two-step pawns/);
  assert.match(fs.readFileSync(output.files.markdown, 'utf8'), /50\.00% \(16\/16\)/);
  assert.equal(fs.readFileSync(path.join(directory, 'games.jsonl'), 'utf8'), journal);
  assert.equal(fs.existsSync(path.join(directory, '.v17-report.lock')), false);
});
