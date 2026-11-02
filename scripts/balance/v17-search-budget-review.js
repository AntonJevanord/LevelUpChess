'use strict';

// Derived offline comparisons only. No frozen campaign or search value changes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadFocusEvidence, SOURCES: FOCUS_SOURCES, PROVENANCE: FOCUS_PROVENANCE } = require('./v17-nightrider-focus-evidence');
const { loadPanelEvidence, SOURCES: PANEL_SOURCES, PROVENANCE: PANEL_PROVENANCE } = require('./v17-level3-panel-second-evidence');
const { summarizeOpeningChanges } = require('../analysis/paired-opening-sensitivity');

const ROOT = path.resolve(__dirname, '../../experiments/balance/results');
const PREFIX = 'v17-search-review-001';
const REFERENCES = ['vanguard', 'unicorn', 'cruisader', 'amazon'];
const BODIES = ['original', 'diagonal-captures', 'orthogonal-captures'];
const average = values => values.reduce((a, b) => a + b, 0) / values.length;
const aScore = row => row.result === '1/2-1/2' ? 0.5 : Number((row.result === '1-0') === (row.aColor === 'w'));
const percent = value => `${(value * 100).toFixed(2)}%`;
const points = value => (value * 100).toFixed(2);
const band = value => `${points(value.lower)} to ${points(value.upper)}`;

function focusCases(stage) {
  return stage.config.openings.map(opening => ({ openingId: opening.id,
    ...Object.fromEntries(BODIES.map(body => [body, average(REFERENCES.map(reference => {
      const pair = stage.records.filter(record => record.openingId === opening.id && record.comparisonId === `${body}-v-${reference}`);
      assert.equal(pair.length, 2); assert.equal(new Set(pair.map(row => row.aColor)).size, 2);
      return average(pair.map(aScore));
    }))])) }));
}
function panelCases(stages, opponents) {
  const records = stages.flatMap(stage => {
    const metadata = new Map(stage.metadata.comparisons.map(row => [row.id, row]));
    return stage.records.flatMap(record => {
      const comparison = metadata.get(record.comparisonId);
      if (comparison.kind !== 'head' || ![comparison.aKey, comparison.bKey].includes('ranged-rook')) return [];
      const inverted = comparison.bKey === 'ranged-rook', opponent = inverted ? comparison.aKey : comparison.bKey;
      if (!opponents.includes(opponent)) return [];
      return [{ record, opponent, score: inverted ? 1 - aScore(record) : aScore(record),
        color: inverted ? record.aColor === 'w' ? 'b' : 'w' : record.aColor }];
    });
  });
  const openings = stages.flatMap(stage => stage.config.openings).map(row => row.id);
  assert.equal(new Set(openings).size, 16);
  const cases = openings.map(openingId => {
    const pairs = opponents.map(opponent => {
      const pair = records.filter(row => row.opponent === opponent && row.record.openingId === openingId);
      assert.equal(pair.length, 2); assert.equal(new Set(pair.map(row => row.color)).size, 2);
      return average(pair.map(row => row.score));
    });
    return { openingId, score: average(pairs) };
  });
  return { cases, games: records.length,
    whiteScore: average(records.filter(row => row.color === 'w').map(row => row.score)),
    blackScore: average(records.filter(row => row.color === 'b').map(row => row.score)),
    opponents: opponents.map(key => ({ key, score: average(records.filter(row => row.opponent === key).map(row => row.score)) })) };
}
function matchedDelta(first, second, value, units) {
  const index = new Map(first.map(row => [row.openingId, value(row)]));
  assert.equal(first.length, second.length);
  const cases = second.map(row => {
    assert.ok(index.has(row.openingId)); return { openingId: row.openingId, difference: value(row) - index.get(row.openingId) };
  });
  return { ...summarizeOpeningChanges(cases.map(row => row.difference), { units }), cases };
}
function buildSearchReview() {
  const focus = loadFocusEvidence(), panel = loadPanelEvidence();
  const focusBudgets = focus.stages.map(stage => {
    const cases = focusCases(stage);
    return { nodes: stage.nodes, cases, rows: BODIES.map(key => {
      const records = stage.records.filter(row => row.comparisonId.startsWith(`${key}-v-`));
      return { key, games: records.length, ...summarizeOpeningChanges(cases.map(row => row[key])),
        whiteScore: average(records.filter(row => row.aColor === 'w').map(aScore)),
        blackScore: average(records.filter(row => row.aColor === 'b').map(aScore)) };
    }) };
  });
  const at = nodes => focusBudgets.find(row => row.nodes === nodes);
  const changes = [20000, 40000].map(from => ({ from, to: 80000,
    diagonalScore: matchedDelta(at(from).cases, at(80000).cases, row => row['diagonal-captures'], 16),
    controlScore: matchedDelta(at(from).cases, at(80000).cases, row => row.original, 16),
    diagonalGainOverControl: matchedDelta(at(from).cases, at(80000).cases, row => row['diagonal-captures'] - row.original, 16) }));
  const roster = panel.balancedReport.roster.map(row => row.key);
  const opponents = roster.filter(key => key !== 'ranged-rook');
  const cataphract = [20000, 40000, 80000].map(nodes => {
    const stages = panel.stages.filter(stage => stage.nodes === nodes && stage.batch < 2);
    const scopes = { allNine: { opponents, units: 36 }, frozenFour: { opponents: REFERENCES, units: 16 },
      withoutNightriderAndWraith: { opponents: opponents.filter(key => !['nightrider', 'xray-queen'].includes(key)), units: 28 } };
    return { nodes, scopes: Object.fromEntries(Object.entries(scopes).map(([key, scope]) => {
      const input = panelCases(stages, scope.opponents);
      return [key, { ...input, ...summarizeOpeningChanges(input.cases.map(row => row.score), { units: scope.units }),
        firstEight: average(input.cases.slice(0, 8).map(row => row.score)),
        secondEight: average(input.cases.slice(8).map(row => row.score)) }];
    })) };
  });
  const cat = nodes => cataphract.find(row => row.nodes === nodes);
  const cataphractChanges = Object.entries({ allNine: 36, frozenFour: 16 }).map(([scope, units]) => ({ scope, from: 40000, to: 80000,
    ...matchedDelta(cat(40000).scopes[scope].cases, cat(80000).scopes[scope].cases, row => row.score, units) }));
  return { schemaVersion: 1, format: 'levelup-v17-search-budget-review', recordedDate: '2026-11-02',
    sources: { focus: FOCUS_SOURCES, panel: PANEL_SOURCES }, provenance: { focus: FOCUS_PROVENANCE, panel: PANEL_PROVENANCE },
    counts: { focusGames: 576, cumulativePanelGames: 5288, balancedPanelGames: 5280,
      extraPanelGamesExcludedFromComparisons: 8, focusOpeningGroups: 8, panelOpeningGroups: 16, newMatchGames: 0, engineSearches: 0 },
    focus: { budgets: focusBudgets, changes }, cataphract: { budgets: cataphract, changes: cataphractChanges },
    interpretation: ['A physical game count is not an independent-opening count. Both colors and all fixed opponents stay in each opening block.',
      'Budget changes are paired by the same opening. Small-sample t intervals are sensitivity checks, not valid population intervals for selected fixed books.',
      'Conditional percentile bootstrap coverage can be fragile with eight blocks. A positive endpoint in one method does not establish a depth interaction.',
      'Cataphract cohort replication compares the first and second eight-case batches, rather than counting the cumulative snapshots twice.',
      'A complete symmetric round robin averages 50% by construction. Individual scores and dispersion still matter.',
      'Keep node budgets and opponent baskets separate. No material values, intrinsic Elo, movement or engine priors are changed.'] };
}
function renderSearchReview(review) {
  const lines = ['# Search budgets: Nightrider revisions and Cataphract', '',
    'This review uses 576 completed focused games and 5,280 balanced panel games across sixteen cases. Eight extra 20k games from the next panel batch remain archived and are excluded from these matched comparisons.', '',
    '| Nodes | Original N0 | Diagonal N0cF | Orthogonal N0cW |', '| ---: | ---: | ---: | ---: |',
    ...review.focus.budgets.map(row => `| ${row.nodes} | ${row.rows.map(body => percent(body.mean)).join(' | ')} |`), '',
    'Each cell contains 64 games: eight openings × four opponents × two colors. It contains 32 color pairs and eight opening blocks, not 64 independent opening positions. Even an idealized 64 independent decisive games near 50% has standard error 6.25 percentage points and an approximate 95% margin of ±12 points. That illustration does not replace the grouped analysis here.', '',
    '| Change to 80k | Metric | Difference (pp) | Conditional block-bootstrap 95% | Small-sample t sensitivity 95% |',
    '| --- | --- | ---: | --- | --- |',
    ...review.focus.changes.flatMap(row => [['Diagonal score', row.diagonalScore], ['N0 score', row.controlScore], ['Diagonal gain over N0', row.diagonalGainOverControl]]
      .map(([label, result]) => `| ${row.from}→${row.to} | ${label} | ${points(result.mean)} | ${band(result.conditionalBootstrap)} | ${band(result.smallSampleT)} |`)), '',
    'The original focus-report intervals compare each revision with N0 at the same budget; they do not directly test a change between budgets. The diagonal 40k→80k score change is +16.41 points, but its paired opening-bootstrap range includes zero. Its gain over the fresh control rises too; that interaction has a positive percentile lower endpoint while the small-sample t sensitivity range crosses zero. With eight fixed holdout cases, neither endpoint should be treated as definitive proof of a stable computation effect.', '',
    'Five of eight openings favor the diagonal version at 80k over 40k, and three favor 40k. The mean budget gain stays positive when any one opening is omitted; this is broader than one outlier, but it still needs replication. At 80k the diagonal version scores 78.13% against Vanguard, 50% against Unicorn, 75% against Crusader and 68.75% against Amazon. Its physical-color scores are 79.69% as White and 56.25% as Black. Orthogonal captures remain high at every budget and can be parked.', '',
    '## Cataphract', '', '| Nodes | All nine opponents | Frozen four | Without Nightrider/Wraith | First eight (all9) | Second eight (all9) |',
    '| ---: | ---: | ---: | ---: | ---: | ---: |', ...review.cataphract.budgets.map(row => `| ${row.nodes} | ${percent(row.scopes.allNine.mean)} | ${percent(row.scopes.frozenFour.mean)} | ${percent(row.scopes.withoutNightriderAndWraith.mean)} | ${percent(row.scopes.allNine.firstEight)} | ${percent(row.scopes.allNine.secondEight)} |`), '',
    'At 80k Cataphract repeats 66.32% in each distinct eight-case cohort. Combined, it has 288 head-to-head games, sixteen opening blocks and a conditional overall range of'
      + ` ${band(review.cataphract.budgets.find(row => row.nodes === 80000).scopes.allNine.conditionalBootstrap)}%. `
      + 'Its lead persists against the frozen four and after excluding the two weakest roster pieces. Against the references it scores 65.63% versus Vanguard, 50% versus Unicorn, 57.81% versus Crusader and 78.13% versus Amazon. Its largest reference advantage is the Amazon matchup. This is more convincing evidence of a high 80k score than a single eight-case fluctuation, without establishing a universal exchange value or a required nerf.', '',
    'The roster mean is mechanically 50%. Most central pieces are near it, but the full distribution does not tighten monotonically: the sixteen-case spread narrows at 40k and widens at 80k. Inquisitor also scores 61.28% at 20k. Finish the already-running 32-case panel before redesigning Cataphract or the rest of the roster.', '',
    '## Bounded next decision', '',
    'Keep diagonal Nightrider as a candidate rather than freeze it as balanced. One fresh confirmation can compare N0/N0cF at 40k/80k on 16 new matched openings against the four references: 512 games. The omitted 20k budget and already-strong orthogonal variant need not be repeated. Preregister the cases and completion target, keep the discovery results separate, and review opponent/color effects. This recommendation starts no games and does not alter an existing campaign.', '',
    'The deterministic bootstrap enumerates the empirical opening-block distribution by discrete convolution; it removes Monte Carlo variation in the displayed endpoints. It does not improve small-sample coverage or account for wider opening ancestry, post-selection or search-prior bias. Existing uploaded reports and their original bootstrap ranges remain unchanged.', '',
    ...review.interpretation.map(note => `- ${note}`), '',
    'Verify with `node scripts/balance/v17-search-budget-review.js`. No engine is started.', ''];
  return lines.join('\n');
}
function main(args = process.argv.slice(2)) {
  assert.ok(!args.length || args.length === 1 && args[0] === '--write', 'Use no arguments or --write.');
  const review = buildSearchReview(), files = [[`${PREFIX}.audit.json`, JSON.stringify(review) + '\n'], [`${PREFIX}.report.md`, renderSearchReview(review)]];
  for (const [name, contents] of files) {
    const file = path.join(ROOT, name);
    if (args.length) fs.writeFileSync(file, contents);
    else assert.equal(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), contents, `Derived review changed: ${name}.`);
  }
  console.log('Search-budget review verified: paired opening blocks; no searches, new games or campaign changes.'); return review;
}
if (require.main === module) { try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; } }
module.exports = { focusCases, panelCases, matchedDelta, buildSearchReview, renderSearchReview, main };
