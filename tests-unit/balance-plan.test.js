const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeConfig, makeSchedule } = require('../scripts/balance/plan');

function minimal() {
  return {
    schemaVersion: 1,
    name: 'A small experiment',
    comparisons: [{ id: 'blue-v-purple', armyA: { upgrades: { b1: 1 } }, armyB: { upgrades: { e1: 3 } } }],
  };
}

function configured() {
  return {
    ...minimal(),
    repetitions: 2,
    openings: [
      { id: 'start', moves: [] },
      { id: 'open', moves: ['e2e4', 'e7e5'] },
      { id: 'closed', moves: ['d2d4', 'd7d5'] },
    ],
    comparisons: [
      ...minimal().comparisons,
      { id: 'control', armyA: {}, armyB: {} },
    ],
  };
}

test('plan defaults are explicit; white-relative upgrades include independent kings', () => {
  const input = minimal();
  input.comparisons[0].armyA.upgrades.a2 = 0;
  const before = structuredClone(input);
  const config = normalizeConfig(input);
  assert.deepEqual(input, before);
  assert.equal(config.seed, 42);
  assert.equal(config.repetitions, 1);
  assert.deepEqual(config.engine, { nodes: 10000, threads: 1, hashMb: 32, maxPlies: 400 });
  assert.deepEqual(config.openings, [{ id: 'start', moves: [] }]);
  assert.deepEqual(config.comparisons[0].armyA, { upgrades: { b1: 1 }, remove: [] });
  assert.deepEqual(config.comparisons[0].armyB, { upgrades: { e1: 3 }, remove: [] });
  assert.deepEqual(config.comparisons[0].strengthA, { skill: 20 });
  assert.deepEqual(normalizeConfig(config), config, 'normalization is idempotent');
});

test('plan accepts unequal budgets and ordinary material handicap anchors', () => {
  const input = minimal();
  input.comparisons[0].armyA = { upgrades: { d1: 3, a2: 0 }, remove: ['a2', 'b1'] };
  input.comparisons[0].armyB = { remove: ['c1'] };
  const config = normalizeConfig(input);
  assert.deepEqual(config.comparisons[0].armyA, { upgrades: { d1: 3 }, remove: ['a2', 'b1'] });
  assert.deepEqual(config.comparisons[0].armyB, { upgrades: {}, remove: ['c1'] });
  for (const [army, message] of [
    [{ remove: ['e1'] }, /other than the king/],
    [{ remove: ['a7'] }, /starting squares/],
    [{ remove: ['b1', 'b1'] }, /repeat/],
    [{ remove: ['b1'], upgrades: { b1: 1 } }, /both upgrade and remove/],
  ]) {
    const invalid = minimal();
    invalid.comparisons[0].armyA = army;
    assert.throws(() => normalizeConfig(invalid), message);
  }
});

test('search budgets are bounded and mutually exclusive, with one deterministic thread', () => {
  const timed = minimal();
  timed.engine = { movetimeMs: 100, hashMb: 64, maxPlies: 2 };
  assert.deepEqual(normalizeConfig(timed).engine, { movetimeMs: 100, threads: 1, hashMb: 64, maxPlies: 2 });
  const limits = [
    [{ nodes: 10, movetimeMs: 100 }, /not both/],
    [{ nodes: 0 }, /engine.nodes/],
    [{ nodes: 100000001 }, /engine.nodes/],
    [{ nodes: 1.5 }, /engine.nodes/],
    [{ nodes: null }, /engine.nodes/],
    [{ movetimeMs: 0 }, /engine.movetimeMs/],
    [{ threads: 2 }, /engine.threads/],
    [{ hashMb: 4097 }, /engine.hashMb/],
    [{ maxPlies: 1 }, /engine.maxPlies/],
    [{ maxPlies: 2001 }, /engine.maxPlies/],
  ];
  for (const [engine, error] of limits) assert.throws(() => normalizeConfig({ ...minimal(), engine }), error);
});

test('strength selects either skill or requested Elo, without assuming calibration', () => {
  const input = minimal();
  input.comparisons[0].strengthA = { skill: 0 };
  input.comparisons[0].strengthB = { elo: 1500 };
  const config = normalizeConfig(input);
  assert.deepEqual(config.comparisons[0].strengthA, { skill: 0 });
  assert.deepEqual(config.comparisons[0].strengthB, { elo: 1500 });
  for (const strength of [{}, { skill: 21 }, { elo: -1 }, { skill: 10, elo: 1500 }, { skill: null }]) {
    const invalid = minimal();
    invalid.comparisons[0].strengthA = strength;
    assert.throws(() => normalizeConfig(invalid), /strengthA/);
  }
});

test('strict shape validation rejects typos and invalid starting slots at every level', () => {
  const mutations = [
    input => { input.sed = 12; },
    input => { input.engine = { node: 20 }; },
    input => { input.openings = [{ id: 'start', move: [] }]; },
    input => { input.comparisons[0].strength = { skill: 20 }; },
    input => { input.comparisons[0].armyA.upgrade = { b1: 1 }; },
    input => { input.comparisons[0].armyA.upgrades.b8 = 1; },
    input => { input.comparisons[0].armyA.upgrades.e3 = 1; },
    input => { input.comparisons[0].armyA.upgrades.e1 = 4; },
    input => { input.comparisons[0].strengthA = { difficulty: 10 }; },
    input => { input.openings = null; },
    input => { input.seed = null; },
    input => { input.comparisons[0].armyA.upgrades = null; },
  ];
  for (const mutate of mutations) {
    const input = minimal();
    mutate(input);
    assert.throws(() => normalizeConfig(input));
  }
  for (const input of [null, [], { ...minimal(), schemaVersion: 2 }, { ...minimal(), name: '\n' }, { ...minimal(), comparisons: [] }]) {
    assert.throws(() => normalizeConfig(input));
  }
});

test('opening prefixes reject duplicates, malformed moves, and ambiguous identifiers', () => {
  const badOpenings = [
    [{ id: 'a', moves: [] }, { id: 'b', moves: [] }],
    [{ id: 'a', moves: [] }, { id: 'a', moves: ['e2e4'] }],
    [{ id: '../opening', moves: [] }],
    [{ id: 'a', moves: ['Nf3'] }],
    [{ id: 'a', moves: ['e2e2'] }],
    [{ id: 'a', moves: ['a7a8k'] }],
    [{ id: 'a', moves: ['e2e4 '] }],
    [{ id: 'a', moves: Array(41).fill('e2e4') }],
  ];
  for (const openings of badOpenings) assert.throws(() => normalizeConfig({ ...minimal(), openings }));
  const input = configured();
  input.comparisons.push(structuredClone(input.comparisons[0]));
  assert.throws(() => normalizeConfig(input), /duplicate id/);
});

test('schedule contains every color-swapped opening pair once per repetition', () => {
  const input = configured();
  const before = structuredClone(input);
  const schedule = makeSchedule(input);
  assert.deepEqual(input, before);
  assert.equal(schedule.length, 24);
  assert.equal(new Set(schedule.map(game => game.id)).size, 24);
  const combinations = new Set();
  for (let index = 0; index < schedule.length; index += 2) {
    const first = schedule[index];
    const second = schedule[index + 1];
    assert.equal(first.pairId, second.pairId);
    assert.notEqual(first.aColor, second.aColor);
    assert.deepEqual(new Set([first.aColor, second.aColor]), new Set(['w', 'b']));
    assert.deepEqual(first.openingMoves, second.openingMoves, 'color swap uses the same book position, not a mirrored position');
    assert.notEqual(first.openingMoves, second.openingMoves, 'move arrays are independent');
    assert.deepEqual(first.comparison, second.comparison);
    assert.equal(first.comparisonId, first.comparison.id);
    assert.match(first.id, /^[A-Za-z0-9_-]+$/, 'game ids are safe filename components on Windows');
    combinations.add(`${first.comparisonId}/${first.openingId}/${first.repetition}`);
  }
  assert.equal(combinations.size, 12);
  schedule[0].openingMoves.push('a2a3');
  assert.deepEqual(input, before);
});

test('schedule shuffles pair order and first color reproducibly from the uint32 seed', () => {
  const input = configured();
  assert.deepEqual(makeSchedule(input), makeSchedule(input));
  assert.notDeepEqual(makeSchedule({ ...input, seed: 1 }), makeSchedule({ ...input, seed: 2 }));
  for (const seed of [0, 0xffffffff]) assert.equal(makeSchedule({ ...input, seed }).length, 24);
  for (const seed of [-1, 0x100000000, 1.5]) assert.throws(() => makeSchedule({ ...input, seed }), /seed/);
  assert.throws(() => makeSchedule({ ...input, repetitions: 100000 }), /at most 100000 games/);
});

test('checked-in experiments validate and budget-three cases have equal point costs', () => {
  const directory = path.join(__dirname, '../experiments/balance');
  const names = fs.readdirSync(directory).filter(name => name.endsWith('.json'));
  assert.deepEqual(names.sort(), ['amazon-alternatives-roster.json', 'amazon-alternatives.json', 'amazon-revision-roster.json', 'amazon-revision.json', 'blue-rook-confirmation.json', 'budget-3-confirmation.json', 'budget-3.json', 'designs-smoke.json', 'level3-holdout.json', 'level3-roster.json', 'level3-round-robin.json', 'material-anchors.json', 'material-collection.json', 'material-estimate.json', 'material-study.json', 'outlier-effects.json', 'purple-material-handicaps.json', 'revision-1-confirmation.json', 'revision-1-screen.json', 'rook-values-auto.json', 'rook-values-eight.json', 'rook-values-roster.json', 'skill-sweep.json', 'smoke.json', 'upgrade-effects.json']);
  // Rosters and the collection protocol have dedicated bounded validators.
  const { getCollectionProtocol } = require('../scripts/balance/material-collection-plan');
  assert.equal(getCollectionProtocol().settings.totalGames, 96);
  const { getStudyProtocol } = require('../scripts/balance/material-study-plan');
  assert.equal(getStudyProtocol().settings.totalGames, 1152);
  for (const name of names.filter(name => !name.endsWith('-roster.json') && !['material-collection.json', 'material-study.json'].includes(name))) {
    const config = normalizeConfig(JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')));
    const schedule = makeSchedule(config);
    assert.equal(schedule.length, 2 * config.openings.length * config.comparisons.length * config.repetitions);
    if (name === 'budget-3.json' || name === 'budget-3-confirmation.json') {
      assert.equal(config.openings.length, 20);
      for (const comparison of config.comparisons) {
        const costs = ['armyA', 'armyB'].map(army => Object.values(comparison[army].upgrades).reduce((sum, level) => sum + level, 0));
        assert.deepEqual(costs, comparison.id === 'standard-control' ? [0, 0] : [3, 3], comparison.id);
      }
    }
    if (name === 'upgrade-effects.json') {
      assert.equal(config.openings.length, 20);
      assert.equal(config.comparisons.length, 19);
      assert.equal(schedule.length, 760);
      const selections = new Set();
      for (const comparison of config.comparisons) {
        assert.deepEqual(comparison.armyB, { upgrades: {}, remove: [] });
        assert.deepEqual(comparison.strengthA, { skill: 20 });
        assert.deepEqual(comparison.strengthB, { skill: 20 });
        const entries = Object.entries(comparison.armyA.upgrades);
        assert.equal(entries.length, comparison.id === 'standard-control' ? 0 : 1);
        if (entries.length) selections.add(entries[0].join(':'));
      }
      assert.deepEqual([...selections].sort(), ['a2', 'b1', 'c1', 'a1', 'd1', 'e1'].flatMap(square => [1, 2, 3].map(level => `${square}:${level}`)).sort());
    }
  }
});
