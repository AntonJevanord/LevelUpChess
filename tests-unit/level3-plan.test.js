const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeConfig, makeSchedule } = require('../scripts/balance/plan');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { getDesign } = require('../src/design-catalog');
const roster = require('../experiments/balance/level3-roster.json');
const screen = require('../experiments/balance/level3-round-robin.json');
const holdout = require('../experiments/balance/level3-holdout.json');
const controls = new Set(roster.controls.map(control => control.id));
const army = candidate => ({ upgrades: { [candidate.square]: candidate.id }, remove: [] });

test('the level-3 campaign covers every active purchase family with fixed three-point revisions', () => {
  assert.equal(roster.candidates.length, 14);
  assert.equal(new Set(roster.candidates.map(candidate => candidate.id)).size, 14);
  assert.equal(new Set(roster.candidates.map(candidate => candidate.key)).size, 14);
  const families = {};
  for (const candidate of roster.candidates) {
    const design = getDesign(candidate.id);
    assert.ok(design, candidate.id);
    assert.equal(design.level, 3, candidate.id);
    assert.equal(candidate.square, { pawn: 'd2', knight: 'b1', bishop: 'c1', rook: 'a1', queen: 'd1' }[design.family]);
    families[design.family] = (families[design.family] || 0) + 1;
  }
  assert.deepEqual(families, { pawn: 4, knight: 2, bishop: 2, rook: 3, queen: 3 });
  assert.equal(getDesign('knight.purple@3').movement, 'NC');
  assert.equal(roster.referenceId, 'queen.purple@1');
  assert.ok(!roster.candidates.some(candidate => candidate.id === 'pawn.purple@6'), 'the repriced level-2 Twins are not a third-point candidate');
  assert.ok(!roster.candidates.some(candidate => getDesign(candidate.id).family === 'king'), 'asymmetric royal evaluation remains a separate experiment');
});

test('each unordered matchup appears exactly once, with the same ordinary underlying army', () => {
  const normalized = normalizeConfig(screen);
  const expected = [];
  for (let a = 0; a < roster.candidates.length; a++) for (let b = a + 1; b < roster.candidates.length; b++) {
    const A = roster.candidates[a], B = roster.candidates[b];
    expected.push(`${A.key}-v-${B.key}`);
    const comparison = normalized.comparisons.find(item => item.id === expected.at(-1));
    assert.ok(comparison, expected.at(-1));
    assert.deepEqual(comparison.armyA, army(A));
    assert.deepEqual(comparison.armyB, army(B));
    assert.deepEqual(comparison.strengthA, { skill: 20 });
    assert.deepEqual(comparison.strengthB, { skill: 20 });
  }
  assert.equal(expected.length, 91);
  assert.deepEqual(normalized.comparisons.filter(comparison => !controls.has(comparison.id)).map(comparison => comparison.id), expected);
  assert.equal(normalized.comparisons.length, 93);
  const ordinary = normalized.comparisons.find(comparison => comparison.id === 'standard-control');
  assert.deepEqual(ordinary.armyA, { upgrades: {}, remove: [] });
  assert.deepEqual(ordinary.armyB, ordinary.armyA);
  const amazon = normalized.comparisons.find(comparison => comparison.id === 'amazon-control');
  assert.deepEqual(amazon.armyA, army(roster.candidates.find(candidate => candidate.id === roster.referenceId)));
  assert.deepEqual(amazon.armyB, amazon.armyA);
});

test('the declared screen schedules 1860 games, balanced by comparison, opening, and color', () => {
  const normalized = normalizeConfig(screen), schedule = makeSchedule(normalized);
  assert.equal(normalized.repetitions, 1);
  assert.deepEqual(normalized.engine, { nodes: 100000, threads: 1, hashMb: 32, maxPlies: 400 });
  assert.equal(normalized.openings.length, 10);
  assert.equal(schedule.length, roster.screenGames);
  assert.equal(schedule.length, 1860);
  const pairs = new Map();
  for (const game of schedule) {
    if (!pairs.has(game.pairId)) pairs.set(game.pairId, []);
    pairs.get(game.pairId).push(game);
  }
  assert.equal(pairs.size, 930);
  for (const pair of pairs.values()) {
    assert.equal(pair.length, 2);
    assert.deepEqual(pair.map(game => game.aColor).sort(), ['b', 'w']);
    assert.equal(pair[0].comparisonId, pair[1].comparisonId);
    assert.equal(pair[0].openingId, pair[1].openingId);
  }
  for (const comparison of normalized.comparisons) {
    const games = schedule.filter(game => game.comparisonId === comparison.id);
    assert.equal(games.length, 20, comparison.id);
    assert.equal(new Set(games.map(game => game.openingId)).size, 10, comparison.id);
  }
});

test('reserved holdout keeps exact definitions and allocations but has ten disjoint opening prefixes', () => {
  const first = normalizeConfig(screen), second = normalizeConfig(holdout);
  assert.deepEqual(second.comparisons, first.comparisons);
  assert.deepEqual(second.engine, first.engine);
  assert.equal(second.repetitions, 1);
  assert.equal(second.openings.length, 10);
  assert.equal(new Set([...first.openings, ...second.openings].map(opening => opening.id)).size, 20);
  assert.equal(new Set([...first.openings, ...second.openings].map(opening => opening.moves.join(' '))).size, 20);
  const firstRegistry = createDesignRegistry(first), secondRegistry = createDesignRegistry(second);
  assert.equal(firstRegistry.definitions.length, 14);
  assert.deepEqual(firstRegistry, secondRegistry);
  assert.equal(compileDesignProfile(firstRegistry).hash, compileDesignProfile(secondRegistry).hash);
  // Queen purchases occupy d2/d7; guard knights occupy b2/b7. Those pieces
  // cannot all follow the old ordinary-pawn opening book.
  for (const opening of [...first.openings, ...second.openings]) for (const move of opening.moves) {
    assert.ok(!['b1', 'b8', 'b2', 'b7', 'd2', 'd7'].includes(move.slice(0, 2)), `${opening.id}: ${move}`);
  }
});

test('the holdout allocation cannot exceed the declared 2000-game campaign budget', () => {
  assert.equal(roster.maxGames, 2000);
  assert.equal(roster.maxConfirmationComparisons, 7);
  assert.equal(roster.holdoutGamesMax, 140);
  assert.equal(roster.screenGames + roster.holdoutGamesMax, roster.maxGames);
  assert.equal(roster.maxConfirmationComparisons * holdout.openings.length * 2, roster.holdoutGamesMax);
  assert.deepEqual(roster.mandatoryConfirmationComparisons, ['camel-knight-v-amazon', 'standard-control']);
  assert.equal(roster.mandatoryConfirmationComparisons.length + roster.maxAdditionalConfirmationComparisons, roster.maxConfirmationComparisons);
  for (const id of roster.mandatoryConfirmationComparisons) assert.ok(holdout.comparisons.some(comparison => comparison.id === id));
  assert.deepEqual(roster.practicalScoreBand, [0.35, 0.65]);
});
