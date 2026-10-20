const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseArgs, selectComparisons, main } = require('../scripts/balance');
const { normalizeConfig, makeSchedule } = require('../scripts/balance/plan');
const { createDesignRegistry } = require('../scripts/balance/design-registry');

const CONFIRMATION = path.resolve(__dirname, '../experiments/balance/revision-1-confirmation.json');
const CHOSEN = ['purple-rook-v-blue-minors', 'purple-rook-v-blue-orange', 'standard-control'];
function configuration() { return normalizeConfig(JSON.parse(fs.readFileSync(CONFIRMATION, 'utf8'))); }

test('comparison selection parses a trimmed CSV only for a new config run', () => {
  assert.deepEqual(parseArgs(['--config', 'a.json', '--comparisons', 'one, two-three,control']), {
    config: 'a.json', comparisons: ['one', 'two-three', 'control'],
  });
  for (const input of ['', ',', 'one,', ',one', 'one,,two', 'one,one', 'one, one', 'bad/id', 'a '.repeat(33)]) {
    assert.throws(() => parseArgs(['--config', 'a.json', '--comparisons', input]));
  }
  for (const mode of ['resume', 'status', 'stop-now', 'stop-after-game', 'stop-after-pair']) {
    assert.throws(() => parseArgs([`--${mode}`, 'run', '--comparisons', 'one']), /only to a new --config/);
  }
  assert.throws(() => parseArgs(['--config', 'a.json', '--comparisons', 'one', '--comparisons', 'two']), /Repeated argument/);
});

test('selecting confirmation comparisons keeps sixty paired games and the full frozen registry', () => {
  const config = configuration();
  const before = structuredClone(config);
  const registry = createDesignRegistry(config);
  const schedule = makeSchedule(config);
  const selected = selectComparisons(config, schedule, CHOSEN);
  assert.equal(schedule.length, 100);
  assert.equal(selected.length, 60);
  assert.deepEqual(config, before);
  assert.deepEqual(createDesignRegistry(config), registry);
  assert.deepEqual(new Set(selected.map(game => game.comparisonId)), new Set(CHOSEN));
  assert.deepEqual(selected, schedule.filter(game => CHOSEN.includes(game.comparisonId)));
  assert.deepEqual(selectComparisons(config, schedule, [...CHOSEN].reverse()), selected, 'selection does not reorder seeded pairs');
  for (let index = 0; index < selected.length; index += 2) {
    assert.equal(selected[index].pairId, selected[index + 1].pairId);
    assert.notEqual(selected[index].aColor, selected[index + 1].aColor);
    assert.deepEqual(selected[index].openingMoves, selected[index + 1].openingMoves);
  }
  assert.equal(selectComparisons(config, schedule), schedule);
  assert.throws(() => selectComparisons(config, schedule, ['does-not-exist']), /Unknown comparison ID/);
  for (const invalid of [[], ['standard-control', 'standard-control'], [''], ['bad/id'], 'standard-control']) {
    assert.throws(() => selectComparisons(config, schedule, invalid));
  }
});

function mockRun(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-filter-cli-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const previous = process.env.FAIRY_STOCKFISH_PATH;
  process.env.FAIRY_STOCKFISH_PATH = path.join(directory, 'mock engine');
  t.after(() => {
    if (previous === undefined) delete process.env.FAIRY_STOCKFISH_PATH;
    else process.env.FAIRY_STOCKFISH_PATH = previous;
  });
  t.mock.method(console, 'log', () => {});
  const calls = [];
  t.mock.method(require('../scripts/balance/run'), 'runMatches', async options => {
    calls.push(options);
    return { stopped: false, summary: { comparisons: [] } };
  });
  return { directory, calls };
}

test('CLI filters before limiting pairs and passes every declared comparison to the runner', async t => {
  const { directory, calls } = mockRun(t);
  await main(['--config', CONFIRMATION, '--out', path.join(directory, 'results'), '--comparisons', CHOSEN.join(','), '--limit-pairs', '2']);
  assert.equal(calls.length, 1);
  const expectedConfig = configuration();
  const expectedSchedule = selectComparisons(expectedConfig, makeSchedule(expectedConfig), CHOSEN).slice(0, 4);
  assert.deepEqual(calls[0].config, expectedConfig);
  assert.equal(calls[0].config.comparisons.length, 5);
  assert.deepEqual(calls[0].schedule, expectedSchedule);
  assert.equal(calls[0].resume, false);
  assert.equal(fs.existsSync(path.join(directory, 'results')), false, 'mocked CLI test executes no games');
});

test('CLI rejects an unknown selection before starting a run', async t => {
  const { directory, calls } = mockRun(t);
  await assert.rejects(main(['--config', CONFIRMATION, '--out', path.join(directory, 'results'), '--comparisons', 'typo']), /Unknown comparison ID: typo/);
  assert.equal(calls.length, 0);
  assert.equal(fs.existsSync(path.join(directory, 'results')), false);
});
