const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildCampaign } = require('../scripts/balance/prepare');
const { parseArgs, writePreparedCampaign, main } = require('../scripts/prepare-balance');
const { makeSchedule } = require('../scripts/balance/plan');
const { DESIGNS } = require('../src/design-catalog');
const fullRoster = require('../experiments/balance/level3-roster.json');

const simple = () => ({ name: 'Preparation test', referenceId: 'queen.purple@1', candidates: [{ id: 'knight.purple@3' }, { id: 'queen.purple@1' }] });
function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-balance-prepare-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function rosterFile(directory, roster = simple()) {
  const file = path.join(directory, 'roster.json'); fs.writeFileSync(file, JSON.stringify(roster)); return file;
}

test('the existing roster generates the full round robin without mutating source data', () => {
  const before = structuredClone(fullRoster), result = buildCampaign(fullRoster);
  assert.deepEqual(fullRoster, before);
  assert.equal(result.config.comparisons.length, 93);
  assert.equal(result.preparation.matchupComparisons, 91);
  assert.equal(result.preparation.controlComparisons, 2);
  assert.equal(result.preparation.scheduledGames, 1860);
  assert.equal(result.preparation.colorPairs, 930);
  assert.equal(result.preparation.designRegistry.definitions.length, 14);
  assert.deepEqual(result.config.engine, { nodes: 100000, threads: 1, hashMb: 32, maxPlies: 400 });
  assert.deepEqual(buildCampaign(fullRoster), result, 'identical declarations produce identical rules and schedules');
});

test('reference mode changes pairings but retains the full selected design allocation', () => {
  const full = buildCampaign(fullRoster), focused = buildCampaign(fullRoster, { mode: 'reference' });
  assert.equal(focused.preparation.matchupComparisons, 13);
  assert.equal(focused.preparation.scheduledGames, 300);
  assert.deepEqual(focused.preparation.designRegistry, full.preparation.designRegistry);
  assert.deepEqual(focused.preparation.designProfile, full.preparation.designProfile);
  const matchups = focused.config.comparisons.filter(comparison => !comparison.id.endsWith('-control'));
  assert.ok(matchups.every(comparison => comparison.armyB.upgrades.d1 === 'queen.purple@1'));
  assert.equal(new Set(matchups.map(comparison => Object.values(comparison.armyA.upgrades)[0])).size, 13);
});

test('pairing counts are bounded before writing and never silently prune candidates or openings', () => {
  assert.throws(() => buildCampaign(fullRoster, { maxGames: 1000 }), /1860 games.*at most 5 opening pairs/);
  const result = buildCampaign(fullRoster, { maxGames: 1000, openingPairs: 5 });
  assert.equal(result.preparation.scheduledGames, 930);
  assert.equal(result.preparation.candidateCount, 14);
  assert.equal(result.preparation.unselectedPrefixes, 5);
  assert.throws(() => buildCampaign(simple(), { maxGames: 2 }), /exceeding/);
  assert.throws(() => buildCampaign(simple(), { openingPairs: 11 }), /contains only 10 prefixes/);
  for (const options of [{ mode: 'random' }, { nodes: 0 }, { maxGames: 1.5 }, { seed: -1 }, { openingPairs: 0 }, { allowUnequalCosts: 'yes' }, { unexpected: true }]) assert.throws(() => buildCampaign(simple(), options));
});

test('candidate IDs, slots, duplicates and type capacity are checked before creating an experiment', () => {
  const result = buildCampaign(simple(), { openingPairs: 1 });
  assert.deepEqual(result.preparation.candidates.map(candidate => [candidate.key, candidate.square]), [['knight-purple-3', 'b1'], ['queen-purple-1', 'd1']]);
  for (const edit of [
    roster => { roster.candidates[0].id = 'unknown@1'; },
    roster => { roster.candidates[0].square = 'a2'; },
    roster => { roster.candidates[0].key = '../unsafe'; },
    roster => { roster.candidates[0].label = 'broken\nlabel'; },
    roster => { roster.candidates.push({ ...roster.candidates[0] }); },
    roster => { roster.candidates[0].key = 'same'; roster.candidates[1].key = 'same'; },
    roster => { roster.referenceId = 'rook.purple@3'; },
    roster => { roster.candidates[0].cost = 3; },
  ]) {
    const roster = simple(); edit(roster); assert.throws(() => buildCampaign(roster));
  }
  const oversized = { referenceId: 'queen.purple@1', candidates: Object.keys(DESIGNS).map(id => ({ id })) };
  assert.throws(() => buildCampaign(oversized, { allowUnequalCosts: true }), /custom letters/);
});

test('different purchase costs require explicit intent and are recorded as a handicap comparison', () => {
  const roster = simple(); roster.candidates[0].id = 'knight.blue@1';
  assert.throws(() => buildCampaign(roster), /different upgrade costs/);
  const result = buildCampaign(roster, { allowUnequalCosts: true, openingPairs: 1 });
  assert.equal(result.preparation.unequalCosts, true);
  assert.deepEqual(result.preparation.candidates.map(candidate => candidate.cost), [1, 3]);
});

test('schedules contain whole distinct color pairs and keep declared opening order and nodes', () => {
  const openings = [{ id: 'first', moves: [] }, { id: 'second', moves: ['e2e4', 'e7e5'] }];
  const result = buildCampaign(simple(), { openings, openingPairs: 2, seed: 7, nodes: 500 });
  const schedule = makeSchedule(result.config);
  assert.equal(schedule.length, 12);
  for (let index = 0; index < schedule.length; index += 2) {
    assert.equal(schedule[index].pairId, schedule[index + 1].pairId);
    assert.deepEqual([schedule[index].aColor, schedule[index + 1].aColor].sort(), ['b', 'w']);
  }
  assert.deepEqual(result.config.openings, openings);
  assert.equal(result.config.engine.nodes, 500);
  assert.throws(() => buildCampaign(simple(), { openings: [{ id: 'a', moves: [] }, { id: 'b', moves: [] }], openingPairs: 2 }), /repeat the same move sequence/);
});

test('exclusive output writes preserve existing files and clean up a partial pair on failure', t => {
  const directory = temporary(t), output = path.join(directory, 'new.json'), result = buildCampaign(simple(), { openingPairs: 1 });
  const files = writePreparedCampaign(result, output);
  assert.deepEqual(JSON.parse(fs.readFileSync(files.config, 'utf8')), result.config);
  assert.deepEqual(JSON.parse(fs.readFileSync(files.preparation, 'utf8')), result.preparation);
  const original = fs.readFileSync(files.config, 'utf8');
  assert.throws(() => writePreparedCampaign(result, output), /Refusing to overwrite/);
  assert.equal(fs.readFileSync(files.config, 'utf8'), original);
  const partialOutput = path.join(directory, 'partial.json'), write = fs.writeFileSync;
  t.mock.method(fs, 'writeFileSync', (...args) => {
    if (typeof args[0] === 'number' && String(args[1]).includes('levelup-balance-preparation')) throw new Error('Injected metadata write failure');
    return write(...args);
  });
  assert.throws(() => writePreparedCampaign(result, partialOutput), /Injected/);
  assert.equal(fs.existsSync(partialOutput), false);
  assert.equal(fs.existsSync(path.join(directory, 'partial.prepare.json')), false);
});

test('dry-run previews perform no writes or rule replay, and write validates all prefixes first', async t => {
  const directory = temporary(t), file = rosterFile(directory), output = path.join(directory, 'future', 'config.json');
  const messages = [];
  await main(['--roster', file, '--out', output, '--dry-run'], { log: message => messages.push(message), validate: () => { throw new Error('Dry-run must not replay'); } });
  assert.equal(fs.existsSync(path.dirname(output)), false);
  assert.match(messages.join('\n'), /60\/2000 scheduled games/);
  let validated = 0;
  const result = await main(['--roster', file, '--out', output, '--opening-pairs', '1'], {
    log: () => {}, validate: async (config, options) => { validated++; assert.equal(config.comparisons.length, 3); assert.equal(options.standardOpeningSources, true); return { games: 6, native: false }; },
  });
  assert.equal(validated, 1);
  assert.equal(result.preparation.validation.games, 6);
  assert.ok(fs.existsSync(result.files.config));
  const badOutput = path.join(directory, 'bad', 'config.json');
  await assert.rejects(main(['--roster', file, '--out', badOutput], { log: () => {}, validate: async () => { throw new Error('Illegal shared opening'); } }), /Illegal shared opening/);
  assert.equal(fs.existsSync(path.dirname(badOutput)), false);
});

test('a declared illegal prefix is rejected by real WASM validation before output', { timeout: 30000 }, async t => {
  const directory = temporary(t), file = rosterFile(directory), output = path.join(directory, 'checked.json');
  const openings = path.join(directory, 'openings.json');
  fs.writeFileSync(openings, JSON.stringify([{ id: 'blocked', moves: ['e2e5'] }]));
  await assert.rejects(main(['--roster', file, '--out', output, '--openings', openings], { log: () => {} }), /Illegal opening move|not legal in the standard/);
  assert.equal(fs.existsSync(output), false);
  assert.equal(fs.existsSync(path.join(directory, 'checked.prepare.json')), false);
});

test('CLI arguments reject ambiguous or malformed preparation declarations', () => {
  assert.deepEqual(parseArgs(['--roster', 'r.json', '--dry-run']), { roster: 'r.json', 'dry-run': true });
  assert.equal(parseArgs(['--roster', 'r.json', '--out', 'c.json', '--seed', '0']).seed, 0);
  for (const args of [[], ['--roster'], ['--roster', 'a'], ['--roster', 'a', '--roster', 'b', '--dry-run'], ['--roster', 'a', '--dry-run', '--unknown'], ['--roster', 'a', '--dry-run', '--nodes', '1.5'], ['--roster', 'a', '--dry-run', '--seed', '-1']]) assert.throws(() => parseArgs(args));
});
