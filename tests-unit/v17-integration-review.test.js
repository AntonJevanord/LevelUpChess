'use strict';

// Synthetic outcomes exercise the declared schedules and report wiring only.
// These fixtures are not engine games or balance evidence and write no files.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadExperiment } = require('../scripts/balance/v17-plan');
const { makeSchedule } = require('../scripts/balance/plan');
const { createV17Report } = require('../scripts/balance/v17-report');

test('all three declared campaigns produce complete, correctly oriented outcome tables from their own schedules', () => {
  for (const [experiment, games, rows, columns] of [
    ['level3', 832, 13, 4],
    ['reference-2v2', 240, 6, 6],
    ['pawn-grants', 240, 3, 7],
  ]) {
    const declaration = loadExperiment(experiment);
    const expectedScores = new Map(declaration.config.comparisons.map((comparison, index) => [comparison.id, [1, 0.5, 0][index % 3]]));
    const records = makeSchedule(declaration.config).map(game => {
      const score = expectedScores.get(game.comparisonId);
      const result = score === 0.5 ? '1/2-1/2' : (score === 1) === (game.aColor === 'w') ? '1-0' : '0-1';
      return { ...game, attempt: 1, status: 'completed', result, reason: 'synthetic fixture' };
    });
    const report = createV17Report({ experiment, ...declaration, records });
    assert.equal(report.scheduledGames, games);
    assert.equal(report.progress.finalizedGames, games);
    assert.equal(report.progress.pairedGames, games);
    assert.equal(report.progress.completePairs, games / 2);
    assert.equal(report.matrix.rows.length, rows);
    assert.equal(report.matrix.columns.length, columns);
    for (const comparison of report.comparisons) {
      const score = expectedScores.get(comparison.id);
      assert.equal(comparison.score, score);
      assert.equal(comparison.completePairs, 8);
      assert.equal(comparison.pairedGames, 16);
      assert.equal(comparison.openings, 8);
      const row = report.matrix.rows.find(item => item.key === comparison.aKey);
      assert.equal(row.cells.find(item => item.columnKey === comparison.bKey).score, score);
      if (declaration.metadata.symmetric) {
        const reverse = report.matrix.rows.find(item => item.key === comparison.bKey);
        if (reverse) assert.equal(reverse.cells.find(item => item.columnKey === comparison.aKey).score, 1 - score);
      }
    }
    for (const row of report.matrix.rows) {
      const diagonal = row.cells.find(item => item.columnKey === row.key);
      if (diagonal) assert.equal(diagonal.score, null, 'self matchups must remain unscheduled');
    }
  }
});
