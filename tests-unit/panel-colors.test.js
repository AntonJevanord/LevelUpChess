'use strict';

// Synthetic normalized outcomes only; no engine searches or collected games.
const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeColorMatchups, renderColorReport } = require('../scripts/analysis/panel-colors');

const roster = ['alpha', 'beta', 'gamma'].map(key => ({ key, id: `${key}@1`, label: key.toUpperCase() }));
const openingIds = ['o0', 'o1', 'o2', 'o3'];
function pair(aKey, bKey, openingId, aWhite = 1, aBlack = 0, nodes = 20000, kind = 'head') {
  const id = `${nodes}:${aKey}:${bKey}:${openingId}`;
  return { nodes, stageKey: `stage-${nodes}`, comparisonId: `${aKey}-v-${bKey}`, kind, openingId,
    aKey, bKey, aId: `${aKey}@1`, bId: kind === 'baseline' ? null : `${bKey}@1`, aWhite, aBlack,
    whiteGameId: `${id}-w`, blackGameId: `${id}-b` };
}
const analyze = (pairs, extra = {}) => analyzeColorMatchups({ roster, pairs, nodes: 20000, openingIds, ...extra });
const cell = (report, a, b) => report.matchups.find(row => row.aKey === a && row.bKey === b);
function allPairs(scoreFor = () => [1, 0]) {
  return roster.flatMap((a, index) => roster.slice(index + 1).flatMap(b => openingIds.map(opening =>
    pair(a.key, b.key, opening, ...scoreFor(a.key, b.key, opening)))));
}

test('White can dominate both games while the piece matchup is exactly balanced', () => {
  const report = analyze(allPairs()), row = cell(report, 'alpha', 'beta');
  assert.equal(row.aOverallScore, 0.5); assert.equal(row.a.white.score, 1); assert.equal(row.a.black.score, 0);
  assert.equal(row.b.white.score, 1); assert.equal(row.b.black.score, 0);
  assert.equal(row.whiteScore, 1); assert.equal(row.whiteAdvantage, 0.5); assert.equal(row.aColorGap, 1);
  assert.deepEqual([row.a.overall.wins, row.a.overall.draws, row.a.overall.losses], [4, 0, 4]);
  assert.equal(report.global.whiteScore, 1); assert.equal(report.global.physicalBlack.score, 0);
  assert.equal(report.global.pairedGames, 24); assert.equal(report.global.includedPairs, 12);
  assert.deepEqual(report.global.openingCoverage.openingIds, openingIds);
  assert.equal(row.conditionalRanges.physicalWhite.lower, 1); assert.equal(row.conditionalRanges.physicalWhite.upper, 1);
  assert.equal(row.conditionalRanges.aOverall.lower, 0.5);
});

test('winning with both colors shows army strength without a physical White advantage', () => {
  const row = cell(analyze(allPairs(() => [1, 1])), 'alpha', 'beta');
  assert.equal(row.aOverallScore, 1); assert.equal(row.b.overall.score, 0);
  assert.equal(row.whiteScore, 0.5); assert.equal(row.aColorGap, 0);
  assert.equal(row.conditionalRanges.physicalWhite.lower, 0.5);
  assert.equal(row.a.overall.games, 8); assert.equal(row.a.overall.wins, 8);
});

test('draws count half and reversed source orientation preserves canonical armies and physical colors', () => {
  const normal = analyze([pair('alpha', 'beta', 'o0', 1, 0.5)]);
  const reverse = analyze([pair('beta', 'alpha', 'o0', 0.5, 0)]);
  const a = cell(normal, 'alpha', 'beta'), b = cell(reverse, 'alpha', 'beta');
  for (const key of ['a', 'b', 'aOverallScore', 'whiteScore', 'aColorGap', 'physicalWhite', 'physicalBlack']) assert.deepEqual(b[key], a[key]);
  assert.equal(a.aOverallScore, 0.75); assert.equal(a.whiteScore, 0.75);
  assert.deepEqual([a.a.overall.wins, a.a.overall.draws, a.a.overall.losses], [1, 1, 0]);
  assert.equal(b.cases[0].source.aKey, 'beta');
  assert.equal(a.conditionalRanges.physicalWhite.available, false);
});

test('global color baseline uses common cases across all matchups, not whichever matchup finished fastest', () => {
  const pairs = allPairs((a, b, opening) => opening === 'o0' ? [0, 1] : [1, 0]);
  const missing = pairs.filter(row => !(row.aKey === 'beta' && row.bKey === 'gamma' && row.openingId !== 'o0'));
  const report = analyze(missing);
  assert.equal(cell(report, 'alpha', 'beta').completePairs, 4);
  assert.equal(cell(report, 'alpha', 'beta').whiteScore, 0.75);
  assert.equal(report.global.whiteScore, 0); assert.equal(report.global.pairedGames, 6);
  assert.deepEqual(report.global.openingCoverage.openingIds, ['o0']);
  assert.equal(report.global.conditionalRanges.physicalWhite.available, false);
  const empty = analyze([pair('alpha', 'beta', 'o0')]);
  assert.equal(empty.global.whiteScore, null); assert.equal(empty.global.openingCoverage.shared, 0);
  assert.equal(cell(empty, 'alpha', 'gamma').aOverallScore, null);
});

test('ordinary anchors and other search budgets do not contaminate the head-to-head color scores', () => {
  const report = analyze([...allPairs(), pair('alpha', 'ordinary', 'o0', 1, 1, 20000, 'baseline'),
    pair('alpha', 'beta', 'different-budget-case', 0, 1, 80000)]);
  assert.equal(report.global.whiteScore, 1); assert.equal(report.ignoredOrdinaryPairs, 1);
  assert.equal(report.global.observedScoredPairs, 12); assert.equal(report.matchups.length, 3);
});

test('conditional ranges preserve the algebraic relationships between colors', () => {
  const row = cell(analyze(openingIds.map((opening, index) => pair('alpha', 'beta', opening, index % 2 ? 1 : 0.5, index < 2 ? 0 : 0.5))), 'alpha', 'beta');
  const ranges = row.conditionalRanges;
  assert.equal(ranges.physicalWhite.groups, 4);
  assert.equal(ranges.physicalBlack.lower, 1 - ranges.physicalWhite.upper);
  assert.equal(ranges.physicalBlack.upper, 1 - ranges.physicalWhite.lower);
  assert.equal(ranges.aColorGap.lower, 2 * ranges.physicalWhite.lower - 1);
  assert.equal(ranges.whiteAdvantage.upper, ranges.physicalWhite.upper - 0.5);
  assert.equal(ranges.bOverall.lower, 1 - ranges.aOverall.upper);
  assert.equal(ranges.bWhite.lower, 1 - ranges.aBlack.upper);
});

test('duplicate pairs, reused games, unknown identities and malformed scores fail closed', () => {
  const original = pair('alpha', 'beta', 'o0');
  assert.throws(() => analyze([original, { ...original }]), /more than one pair|duplicated/);
  const reversed = pair('beta', 'alpha', 'o0');
  assert.throws(() => analyze([original, reversed]), /duplicated/);
  const reused = pair('alpha', 'gamma', 'o1'); reused.whiteGameId = original.whiteGameId;
  assert.throws(() => analyze([original, reused]), /more than one pair/);
  for (const patch of [{ aKey: 'unknown' }, { bId: 'wrong@1' }, { aWhite: 0.25 }, { aBlack: NaN },
    { openingId: 'not-declared' }, { kind: 'foreign' }, { whiteGameId: original.blackGameId }, { stageKey: '' }]) {
    assert.throws(() => analyze([{ ...original, ...patch }]));
  }
  assert.throws(() => analyze([], { openingIds: ['o0', 'o0'] }), /distinct opening/);
  assert.throws(() => analyze([], { roster: [roster[0], roster[0]] }), /distinct/);
  assert.throws(() => analyze([{ ...pair('alpha', 'ordinary', 'o0', 1, 1, 20000, 'baseline'), bKey: 'foreign' }]), /roster identity/);
});

test('analysis is detached from input and Markdown describes scores without automatic fairness verdicts', () => {
  const input = { roster: structuredClone(roster), pairs: allPairs(), nodes: 20000, openingIds: [...openingIds] };
  const before = structuredClone(input), report = analyzeColorMatchups(input);
  assert.deepEqual(input, before);
  const text = renderColorReport(report);
  assert.match(text, /A as White/); assert.match(text, /A as Black/); assert.match(text, /A equal-color score/);
  assert.match(text, /Do not subtract the global White advantage/);
  assert.match(text, /Ordinary|ordinary-army anchors are excluded/);
  assert.match(text, /4\/4 shared opening cases/);
});
