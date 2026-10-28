const test = require('node:test');
const assert = require('node:assert/strict');
const { loadExperiment } = require('../scripts/balance/v17-plan');
const { makeSchedule } = require('../scripts/balance/plan');
const { createV17Report, renderV17Report } = require('../scripts/balance/v17-report');
const { main } = require('../scripts/version17-balance');

function fixture(name) {
  const declaration = loadExperiment(name);
  const baselineCells = new Set(declaration.metadata.comparisons.filter(item => item.bKey === 'two-step-pawns').map(item => item.id));
  // Synthetic outcomes only: A wins every reference game and loses every
  // direct-baseline game. No fixture is saved as actual engine evidence.
  const records = makeSchedule(declaration.config).map(game => {
    const aWins = !baselineCells.has(game.comparisonId);
    return { id: game.id, pairId: game.pairId, comparisonId: game.comparisonId,
      openingId: game.openingId, aColor: game.aColor, repetition: game.repetition,
      attempt: 1, status: 'completed', reason: 'synthetic-report-fixture',
      result: aWins === (game.aColor === 'w') ? '1-0' : '0-1' };
  });
  return { declaration, records, baselineCells };
}

test('both actual mobility schedules retain direct baseline scores outside their reference averages', () => {
  for (const [name, games, rows, cases] of [['mobility-confirm', 768, 5, 16], ['mobility-revisions', 960, 3, 32]]) {
    const { declaration, records } = fixture(name);
    const report = createV17Report({ ...declaration, records });
    assert.equal(report.progress.pairedGames, games);
    assert.equal(report.matrix.rows.length, rows);
    assert.equal(report.matrix.columns.length, 5);
    for (const overall of report.overall.rows) {
      assert.equal(overall.score, 1);
      assert.equal(overall.games, cases * 2 * 4);
      assert.equal(overall.opponents.length, 4);
      assert.equal(overall.openingCoverage.shared, cases);
      const baseline = report.matrix.rows.find(row => row.key === overall.key).cells.at(-1);
      assert.equal(baseline.score, overall.key === 'two-step-pawns' ? null : 0);
      assert.equal(baseline.pairedGames, overall.key === 'two-step-pawns' ? 0 : cases * 2);
    }
    assert.match(renderV17Report(report), /Three two-step pawns/);
    assert.match(renderV17Report(report), /Overall score/);
  }
});

test('partial baseline games cannot change panel coverage, while a truncated reference pair remains unscored', () => {
  const { declaration, records, baselineCells } = fixture('mobility-confirm');
  const baselineIndex = records.findIndex(record => baselineCells.has(record.comparisonId));
  let result = createV17Report({ ...declaration, records: records.filter((_, index) => index !== baselineIndex) });
  assert.ok(result.overall.rows.every(row => row.score === 1 && row.openingCoverage.shared === 16));
  const index = records.findIndex(record => !baselineCells.has(record.comparisonId));
  const affected = declaration.metadata.comparisons.find(item => item.id === records[index].comparisonId).aKey;
  const changed = [...records]; changed[index] = { ...changed[index], status: 'truncated', result: '*' };
  result = createV17Report({ ...declaration, records: changed });
  assert.equal(result.overall.rows.find(row => row.key === affected).openingCoverage.shared, 15);
  assert.ok(result.overall.rows.filter(row => row.key !== affected).every(row => row.openingCoverage.shared === 16));
});

test('both named check commands route the exact declarations without writing or playing', async () => {
  for (const [name, games] of [['mobility-confirm', 768], ['mobility-revisions', 960]]) {
    let calls = 0;
    await main(['--experiment', name, '--check', '--rules-only'], {
      check: async (declaration, options) => {
        calls++; assert.equal(declaration.experiment, name);
        assert.equal(declaration.metadata.scheduledGames, games);
        assert.equal(options.enginePath, undefined);
        return { native: false };
      },
      run: () => assert.fail('check must not play'), persist: () => assert.fail('check must not write'), log: () => {},
    });
    assert.equal(calls, 1);
  }
});
