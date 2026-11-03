'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeExclusions, renderExclusionReport } = require('../scripts/analysis/panel-exclusions');

const roster = ['a', 'b', 'c'].map(key => ({ key, id: `${key}@1`, label: key.toUpperCase() }));
const openings = ['o0', 'o1', 'o2', 'o3'];
function pair(a, b, openingId, aWhite, aBlack, extra = {}) {
  return { stageKey: 'stage20k', nodes: 20000, openingId, comparisonId: `${a}-v-${b}`,
    kind: 'head', aKey: a, bKey: b, aId: `${a}@1`, bId: `${b}@1`, aWhite, aBlack,
    whiteGameId: `${a}-${b}-${openingId}-w`, blackGameId: `${a}-${b}-${openingId}-b`, ...extra };
}
function completeScores(values, selected = openings) {
  return selected.flatMap(id => [pair('a', 'b', id, ...values.ab), pair('a', 'c', id, ...values.ac), pair('b', 'c', id, ...values.bc)]);
}
const analyze = (pairs, exclude = [], extra = {}) => analyzeExclusions({ roster, pairs, nodes: 20000, openingIds: openings, exclude, ...extra });
const row = (view, key) => view.rows.find(item => item.key === key);
const leave = (report, key) => report.leaveOneOut.find(view => view.excludedKeys.includes(key));

test('dropping a weak opponent lowers remaining means without changing retained matchups', () => {
  const report = analyze(completeScores({ ab: [0.5, 0.5], ac: [1, 1], bc: [1, 1] }), ['c']);
  assert.equal(row(report.baseline, 'a').score, 0.75);
  assert.equal(row(report.baseline, 'b').score, 0.75);
  assert.equal(row(report.baseline, 'c').score, 0);
  for (const key of ['a', 'b']) {
    const filtered = row(report.requested, key);
    assert.equal(filtered.score, 0.5);
    assert.equal(filtered.games, 8);
    assert.deepEqual([filtered.wins, filtered.draws, filtered.losses], [0, 8, 0]);
    assert.equal(filtered.matchedComparison.baselineScore, 0.75);
    assert.equal(filtered.matchedComparison.filteredScore, 0.5);
    assert.equal(filtered.matchedComparison.difference, -0.25);
    assert.equal(filtered.matchedComparison.conditionalRange.lower, -0.25);
    assert.equal(filtered.matchedComparison.conditionalRange.upper, -0.25);
    assert.equal(filtered.newlyAvailableCaseCount, 0);
  }
  assert.deepEqual(report.requested.retainedKeys, ['a', 'b']);
  assert.equal(report.requested.commonRosterMean, 0.5);
  assert.equal(leave(report, 'c').rows[0].score, report.requested.rows[0].score);
});

test('dropping a strong opponent raises remaining means by reweighting observed results', () => {
  const report = analyze(completeScores({ ab: [1, 1], ac: [1, 1], bc: [0.5, 0.5] }), ['a']);
  assert.equal(row(report.baseline, 'a').score, 1);
  for (const key of ['b', 'c']) {
    assert.equal(row(report.baseline, key).score, 0.25);
    assert.equal(row(report.requested, key).score, 0.5);
    assert.equal(row(report.requested, key).matchedComparison.difference, 0.25);
  }
  assert.equal(report.requested.commonRosterMean, 0.5);
});

test('restored opening coverage stays separate from the controlled opponent-basket change', () => {
  const pairs = [pair('a', 'b', 'o0', 0, 0), pair('a', 'b', 'o1', 1, 1), pair('a', 'c', 'o0', 1, 1),
    pair('b', 'c', 'o0', 0.5, 0.5), pair('b', 'c', 'o1', 0.5, 0.5)];
  const report = analyze(pairs, ['c'], { openingIds: ['o0', 'o1'] });
  const baseline = row(report.baseline, 'a'), filtered = row(report.requested, 'a');
  assert.equal(baseline.score, 0.5);
  assert.deepEqual(baseline.openingCoverage.openingIds, ['o0']);
  assert.equal(filtered.score, 0.5);
  assert.deepEqual(filtered.openingCoverage.openingIds, ['o0', 'o1']);
  assert.deepEqual(filtered.newlyAvailableCases, ['o1']);
  assert.deepEqual(filtered.matchedComparison.openingIds, ['o0']);
  assert.equal(filtered.matchedComparison.baselineScore, 0.5);
  assert.equal(filtered.matchedComparison.filteredScore, 0);
  assert.equal(filtered.matchedComparison.difference, -0.5);
  assert.equal(filtered.matchedComparison.conditionalRange.available, false);
  assert.deepEqual(report.baseline.commonRosterCases, ['o0']);
  assert.equal(report.baseline.commonRosterMean, 0.5);
  assert.deepEqual(report.requested.commonRosterCases, ['o0', 'o1']);
});

test('physical colors and draw counts preserve piece perspective when A/B orientation reverses', () => {
  const pairs = completeScores({ ab: [1, 0], ac: [0.5, 0], bc: [0.5, 1] });
  const reverse = pairs.map(item => ({ ...item, aKey: item.bKey, bKey: item.aKey, aId: item.bId, bId: item.aId,
    aWhite: 1 - item.aBlack, aBlack: 1 - item.aWhite }));
  const first = analyze(pairs), second = analyze(reverse);
  for (const key of ['a', 'b', 'c']) {
    const left = row(first.baseline, key), right = row(second.baseline, key);
    assert.equal(left.score, right.score);
    assert.deepEqual(left.physicalColors, right.physicalColors);
    assert.deepEqual([left.wins, left.draws, left.losses], [right.wins, right.draws, right.losses]);
  }
  const a = row(first.baseline, 'a');
  assert.equal(a.physicalColors[0].score, 0.75);
  assert.equal(a.physicalColors[1].score, 0);
  assert.equal(a.score, 0.375);
  assert.deepEqual([a.wins, a.draws, a.losses, a.games], [4, 4, 8, 16]);
});

test('ordinary-army anchors do not affect head-to-head exclusions or case coverage', () => {
  const heads = completeScores({ ab: [0.5, 0.5], ac: [0.5, 0.5], bc: [0.5, 0.5] });
  const ordinary = openings.map(id => pair('a', 'ordinary', id, 1, 1, { kind: 'baseline', bId: null }));
  const first = analyze(heads, ['c']), second = analyze([...heads, ...ordinary], ['c']);
  assert.deepEqual(first, second);
});

test('missing observations produce pending standings rather than guessed results', () => {
  const report = analyze([pair('a', 'b', 'o0', 1, 0)]);
  assert.ok(report.baseline.rows.every(item => item.score === null));
  assert.equal(report.baseline.commonRosterMean, null);
  const filtered = leave(report, 'c');
  assert.equal(row(filtered, 'a').score, 0.5);
  assert.equal(row(filtered, 'a').matchedComparison.difference, null);
  assert.deepEqual(row(filtered, 'a').newlyAvailableCases, ['o0']);
  const empty = analyze([], [], { openingIds: [] });
  assert.equal(empty.baseline.commonRosterMean, null);
  assert.ok(empty.baseline.rows.every(item => item.score === null && item.games === 0));
});

test('other node budgets can share the input array but never enter the selected budget', () => {
  const current = completeScores({ ab: [0.5, 0.5], ac: [1, 1], bc: [1, 1] });
  const other = current.map(item => ({ ...item, nodes: 80000, aWhite: 0, aBlack: 0 }));
  assert.deepEqual(analyze([...current, ...other], ['c']), analyze(current, ['c']));
});

test('requested exclusions require two remaining opponents, while two-piece leave-one-out is unavailable', () => {
  const report = analyze([pair('a', 'b', 'o0', 1, 0)], [], { roster: roster.slice(0, 2) });
  assert.ok(report.leaveOneOut.every(view => !view.available && !view.rows.length));
  assert.equal(report.requested, null);
  for (const exclude of [['unknown'], ['a', 'a'], ['a', 'b'], ['a', 'b', 'c']]) assert.throws(() => analyze([], exclude));
});

test('malformed, duplicate, changed or unpaired observations cannot silently enter standings', () => {
  const original = pair('a', 'b', 'o0', 1, 0);
  for (const change of [{ aBlack: undefined }, { aWhite: 0.25 }, { nodes: 0 }, { aId: 'foreign@1' },
    { bId: 'foreign@1' }, { aKey: 'foreign', aId: undefined }, { bKey: 'foreign', bId: undefined },
    { bKey: 'a', bId: 'a@1' }, { whiteGameId: original.blackGameId }, { openingId: 'foreign' },
    { comparisonId: '' }, { stageKey: '' }, { kind: 'foreign' }]) {
    assert.throws(() => analyze([{ ...original, ...change }]));
  }
  assert.throws(() => analyze([original, { ...original, stageKey: 'another-stage' }]), /Duplicate/);
  const reused = pair('a', 'c', 'o0', 1, 0, { whiteGameId: original.whiteGameId });
  assert.throws(() => analyze([original, reused]), /more than one pair/);
  assert.throws(() => analyze([original, pair('b', 'c', 'o1', 1, 0, { comparisonId: original.comparisonId })]), /orientation or designs/);
});

test('analysis leaves inputs unchanged and renders coverage and same-case effects explicitly', () => {
  const input = { roster, pairs: completeScores({ ab: [0.5, 0.5], ac: [1, 1], bc: [1, 1] }),
    nodes: 20000, openingIds: openings, exclude: ['c'] };
  const before = structuredClone(input);
  function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  freeze(input);
  const report = analyzeExclusions(input), rendered = renderExclusionReport(report);
  assert.deepEqual(input, before);
  assert.match(rendered, /Without C/);
  assert.match(rendered, /Requested exclusions: C/);
  assert.match(rendered, /Same-case full score/);
  assert.match(rendered, /Newly available cases/);
  assert.match(rendered, /not a counterfactual/);
  assert.match(rendered, /50\.00% \(4\)/);
  assert.equal(report.requested.rows[0].conditionalRange.available, true);
});
