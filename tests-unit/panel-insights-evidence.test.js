'use strict';

// Reuse the pinned historical upload; no engine, searches or material fitting.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPanelEvidence } = require('../scripts/balance/v17-level3-panel-second-evidence');
const { DISPLAY_NAMES, projectStage } = require('../scripts/panel-insights');
const { analyzeColorMatchups } = require('../scripts/analysis/panel-colors');
const { analyzeExclusions } = require('../scripts/analysis/panel-exclusions');

let evidence, roster, cohorts;
test.before(() => {
  evidence = loadPanelEvidence();
  roster = evidence.report.roster.map(row => ({ ...row, label: DISPLAY_NAMES[row.key] || row.label }));
  cohorts = evidence.balancedReport.nodes.map(node => {
    const stages = evidence.stages.filter(stage => stage.batch < 2 && stage.nodes === node.nodes);
    return { roster, nodes: node.nodes, openingIds: node.openingIds,
      pairs: stages.flatMap(stage => projectStage(stage).pairs), stages, original: node };
  });
});
function sameTally(actual, expected) {
  for (const field of ['games', 'wins', 'draws', 'losses']) assert.equal(actual[field], expected[field]);
  assert.ok(Math.abs(actual.score - expected.score) < 1e-12);
}

test('compact projection of archived games reproduces every original matchup and both army colors', () => {
  for (const cohort of cohorts) {
    const colors = analyzeColorMatchups(cohort);
    assert.equal(colors.matchups.length, 45);
    assert.equal(colors.global.includedPairs, 720);
    for (const row of colors.matchups) {
      const originalA = cohort.original.matrix.rows.find(piece => piece.key === row.aKey);
      const originalB = cohort.original.matrix.rows.find(piece => piece.key === row.bKey);
      const a = originalA.overall.opponents.find(piece => piece.key === row.bKey);
      const b = originalB.overall.opponents.find(piece => piece.key === row.aKey);
      sameTally(row.a.overall, a); sameTally(row.b.overall, b);
      sameTally(row.a.white, a.physicalColors.find(color => color.color === 'w'));
      sameTally(row.a.black, a.physicalColors.find(color => color.color === 'b'));
      sameTally(row.b.white, b.physicalColors.find(color => color.color === 'w'));
      sameTally(row.b.black, b.physicalColors.find(color => color.color === 'b'));
    }
  }
});

test('physical White totals agree with independently counted raw H2H result strings', () => {
  for (const cohort of cohorts) {
    const raw = cohort.stages.flatMap(stage => {
      const heads = new Set(stage.metadata.comparisons.filter(row => row.kind === 'head').map(row => row.id));
      return stage.records.filter(row => heads.has(row.comparisonId));
    });
    const colors = analyzeColorMatchups(cohort);
    assert.equal(raw.length, 1440);
    assert.equal(colors.global.physicalWhite.wins, raw.filter(row => row.result === '1-0').length);
    assert.equal(colors.global.physicalWhite.draws, raw.filter(row => row.result === '1/2-1/2').length);
    assert.equal(colors.global.physicalWhite.losses, raw.filter(row => row.result === '0-1').length);
    assert.equal(colors.global.physicalWhite.games, 1440);
  }
});

test('full-roster exclusion baseline preserves historical overall scores and pair subsets', () => {
  for (const cohort of cohorts) {
    const result = analyzeExclusions({ ...cohort, exclude: ['xray-queen', 'ranged-rook'] });
    for (const row of result.baseline.rows) {
      const original = cohort.original.matrix.rows.find(piece => piece.key === row.key);
      sameTally(row, original.overall);
      assert.equal(row.openingCoverage.shared, 16);
    }
    assert.equal(result.requested.rows.length, 8);
    assert.ok(Math.abs(result.requested.commonRosterMean - 0.5) < 1e-12);
    for (const row of result.requested.rows) {
      assert.equal(row.games, 224);
      assert.equal(row.newlyAvailableCaseCount, 0);
      assert.equal(row.matchedComparison.sharedOpenings, 16);
      for (const opponent of row.opponents) {
        const original = result.baseline.rows.find(piece => piece.key === row.key).opponents.find(piece => piece.key === opponent.key);
        sameTally(opponent, original);
      }
    }
  }
});
