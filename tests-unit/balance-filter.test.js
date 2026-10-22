const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseArgs, selectComparisons, main, shouldPrintProgress } = require('../scripts/balance');
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
  const logs = [];
  t.mock.method(console, 'log', (...args) => { logs.push(args.join(' ')); });
  const calls = [];
  t.mock.method(require('../scripts/balance/run'), 'runMatches', async options => {
    calls.push(options);
    return { stopped: false, summary: { comparisons: [] } };
  });
  return { directory, calls, logs };
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

test('game logging is the default and ply progress is an explicit diagnostic option', async t => {
  assert.equal(shouldPrintProgress('Starting game 1/2: example (attempt 1).'), true);
  assert.equal(shouldPrintProgress('Finished example: 1-0 (checkmate).'), true);
  assert.equal(shouldPrintProgress('Preflight: validating all requested engine strength settings.'), true);
  for (const ply of [1, 10, 20]) assert.equal(shouldPrintProgress(`Game example: ply ${ply}, e2e4 (e4).`), false);
  assert.equal(shouldPrintProgress('Game example: ply 10, e2e4 (e4).', 'plies'), true);
  assert.equal(shouldPrintProgress('Game example: ply 11, e2e4 (e4).', 'plies'), false);
  assert.deepEqual(parseArgs(['--resume', 'run', '--log', 'games']), { resume: 'run', log: 'games' });
  for (const args of [['--resume', 'run', '--log', 'unknown'], ['--status', 'run', '--log', 'games'], ['--config', 'file', '--log']]) assert.throws(() => parseArgs(args));
  const { directory, calls, logs } = mockRun(t);
  await main(['--config', CONFIRMATION, '--out', path.join(directory, 'default')]);
  const defaultCount = logs.length;
  calls[0].onProgress('Game example: ply 10, e2e4 (e4).');
  assert.equal(logs.length, defaultCount, 'default logging removes every ply line');
  await main(['--config', CONFIRMATION, '--out', path.join(directory, 'diagnostic'), '--log', 'plies']);
  const diagnosticCount = logs.length;
  calls[1].onProgress('Game example: ply 10, e2e4 (e4).');
  assert.equal(logs.length, diagnosticCount + 1);
  assert.deepEqual(calls[0].config, calls[1].config, 'logging cannot change search settings or rules identity');
  assert.deepEqual(calls[0].schedule, calls[1].schedule);
});

test('the sequential CLI refuses a parallel parent before launching engines or writing files', async t => {
  const { directory, calls } = mockRun(t);
  const run = path.join(directory, 'parallel'); fs.mkdirSync(run);
  const manifest = JSON.stringify({ parallel: { jobs: 2 } });
  fs.writeFileSync(path.join(run, 'run.json'), manifest);
  await assert.rejects(main(['--resume', run]), /balance:parallel/);
  assert.equal(calls.length, 0);
  assert.equal(fs.readFileSync(path.join(run, 'run.json'), 'utf8'), manifest);
});
