const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getCampaign, verifyCampaignManifest, makeAmazonReport, writeAmazonReport } = require('../scripts/balance/amazon-report');
const { parseArgs, main } = require('../scripts/amazon-balance');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');

function fixture() {
  const { config, schedule, roster } = getCampaign();
  const registry = createDesignRegistry(config), profile = compileDesignProfile(registry);
  const manifest = { schemaVersion: 1, runId: 'synthetic-amazon', config, schedule, designRegistry: registry,
    designProfile: { variant: profile.variant, config: profile.config, hash: profile.hash, registryHash: registry.hash } };
  const record = (game, score = 0.5, extra = {}) => ({
    schemaVersion: 1, id: game.id, pairId: game.pairId, comparisonId: game.comparisonId, openingId: game.openingId,
    aColor: game.aColor, attempt: 1, status: 'completed',
    result: score === 0.5 ? '1/2-1/2' : (score === 1) === (game.aColor === 'w') ? '1-0' : '0-1',
    reason: 'synthetic result', profileHash: profile.hash, registryHash: registry.hash,
    registryReference: 'run.json#designRegistry', variant: profile.variant, engine: config.engine,
    whiteStrength: game.comparison.strengthA, blackStrength: game.comparison.strengthB,
    startedAt: '2026-10-22T12:00:00.000Z', finishedAt: '2026-10-22T12:00:10.000Z', ...extra,
  });
  return { manifest, roster, record };
}
function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-amazon-campaign-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function writeRun(directory, manifest, records = [], tail = '') {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'run.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(directory, 'games.jsonl'), records.map(record => JSON.stringify(record) + '\n').join('') + tail);
}
const candidate = (report, id = 'pawn.purple@7') => report.candidates.find(row => row.id === id);

test('the frozen reference-only schedule contains seven new revisions, two controls and 540 whole-pair games', () => {
  const { config, schedule, roster } = getCampaign();
  assert.equal(schedule.length, 540);
  assert.equal(config.openings.length, 30);
  assert.equal(new Set(config.openings.map(opening => JSON.stringify(opening.moves))).size, 30);
  assert.deepEqual(config.engine, { nodes: 100000, threads: 1, hashMb: 32, maxPlies: 400 });
  const matchups = config.comparisons.filter(row => !row.id.endsWith('-control'));
  assert.equal(matchups.length, 7);
  assert.deepEqual(new Set(matchups.map(row => Object.values(row.armyA.upgrades)[0])),
    new Set(['pawn.purple@7', 'pawn.purple@8', 'pawn.purple@9', 'bishop.purple@3', 'bishop.purple@4', 'rook.purple@4', 'queen.purple@4']));
  for (const row of matchups) assert.deepEqual(row.armyB, { upgrades: { d1: 'queen.purple@1' }, remove: [] });
  for (const row of config.comparisons) assert.equal(schedule.filter(game => game.comparisonId === row.id).length, 60);
  for (let index = 0; index < schedule.length; index += 2) {
    assert.equal(schedule[index].pairId, schedule[index + 1].pairId);
    assert.notEqual(schedule[index].aColor, schedule[index + 1].aColor);
  }
  assert.deepEqual(roster.practicalScoreBand, [0.4, 0.6]);
  assert.equal(createDesignRegistry(config).definitions.length, 8);
});

test('campaign flags reject mixed modes, reduced schedules, resume worker changes and report logging', () => {
  assert.deepEqual(parseArgs(['--check']), { check: true });
  assert.deepEqual(parseArgs(['--out', 'run', '--jobs', '4', '--log', 'games']), { out: 'run', jobs: 4, log: 'games' });
  assert.deepEqual(parseArgs(['--resume', 'run', '--log', 'plies']), { resume: 'run', log: 'plies' });
  assert.deepEqual(parseArgs(['--report', 'run']), { report: 'run' });
  for (const args of [[], ['--check', '--out', 'run'], ['--out'], ['--out', 'a', '--out', 'b'],
    ['--out', 'a', '--resume', 'b'], ['--out', 'a', '--limit-pairs', '1'],
    ['--resume', 'a', '--jobs', '2'], ['--out', 'a', '--jobs', '17'], ['--out', 'a', '--jobs', '1.5'],
    ['--report', 'a', '--log', 'games'], ['--out', 'a', '--log', 'quiet']]) assert.throws(() => parseArgs(args));
});

test('new runs use the fixed configuration and parallel defaults; resume routes by saved execution mode', async t => {
  const directory = temporary(t), parallelCalls = [], serialCalls = [];
  t.mock.method(require('../scripts/parallel-balance'), 'main', async args => { parallelCalls.push(args); });
  t.mock.method(require('../scripts/balance'), 'main', async args => { serialCalls.push(args); });
  await main(['--out', path.join(directory, 'new')]);
  assert.deepEqual(parallelCalls[0], ['--config', getCampaign().configFile, '--out', path.join(directory, 'new'), '--jobs', '2']);
  await main(['--out', path.join(directory, 'four'), '--jobs', '4', '--log', 'plies']);
  assert.equal(parallelCalls[1].at(-1), 'plies');
  assert.ok(parallelCalls[1].includes('4'));
  const { manifest } = fixture(), serialDir = path.join(directory, 'serial'), parallelDir = path.join(directory, 'parallel');
  writeRun(serialDir, manifest);
  writeRun(parallelDir, { ...manifest, parallel: { jobs: 2 } });
  await main(['--resume', serialDir, '--log', 'games']);
  await main(['--resume', parallelDir]);
  assert.deepEqual(serialCalls[0], ['--resume', serialDir, '--log', 'games']);
  assert.deepEqual(parallelCalls[2], ['--resume', parallelDir]);
  const changed = structuredClone(manifest); changed.schedule.pop();
  const invalidDir = path.join(directory, 'invalid'); writeRun(invalidDir, changed);
  await assert.rejects(main(['--resume', invalidDir]), /frozen 540-game/);
  assert.equal(serialCalls.length, 1);
  assert.equal(parallelCalls.length, 3);
});

test('the campaign rejects edited settings, schedule subsets, unknown records and altered identities', () => {
  const { manifest, record } = fixture();
  assert.equal(verifyCampaignManifest(manifest).schedule.length, 540);
  for (const edit of [
    value => { value.config.engine.nodes = 500; },
    value => { value.schedule = value.schedule.slice(0, 2); },
    value => { value.schedule[0].aColor = value.schedule[0].aColor === 'w' ? 'b' : 'w'; },
    value => { value.designRegistry.hash = 'changed'; },
    value => { value.designProfile.hash = 'changed'; },
  ]) {
    const changed = structuredClone(manifest); edit(changed);
    assert.throws(() => makeAmazonReport(changed, []));
  }
  const first = record(manifest.schedule[0]);
  for (const edit of [
    value => { value.id = 'unknown'; }, value => { value.profileHash = 'changed'; },
    value => { value.engine.nodes = 500; }, value => { value.whiteStrength.skill = 1; },
  ]) {
    const changed = structuredClone(first); edit(changed);
    assert.throws(() => makeAmazonReport(manifest, [changed]));
  }
});

test('edited campaign files cannot silently change control armies, handicap material, or engine strength', t => {
  const { config, configFile } = getCampaign(), originalRead = fs.readFileSync;
  let changed;
  t.mock.method(fs, 'readFileSync', (file, ...args) => path.resolve(String(file)) === configFile
    ? JSON.stringify(changed) : originalRead(file, ...args));
  for (const edit of [
    value => { value.comparisons.find(row => row.id === 'amazon-control').armyA.upgrades = {}; },
    value => { value.comparisons.find(row => row.id === 'ranging-pawn-v-amazon').armyA.remove = ['a2']; },
    value => { value.comparisons[0].strengthA.skill = 19; value.comparisons[0].strengthB.skill = 19; },
  ]) {
    changed = structuredClone(config); edit(changed);
    assert.throws(() => getCampaign(), /declared|fixed|match|differ|changed/i);
  }
});

test('unpaired results and unfinished attempts remain unscored; completed pairs report provisional points', () => {
  const { manifest, record } = fixture();
  const games = manifest.schedule.filter(game => game.comparisonId === 'ranging-pawn-v-amazon');
  const pair = games.filter(game => game.pairId === games[0].pairId);
  const lone = makeAmazonReport(manifest, [record(pair[0], 1)]);
  assert.equal(candidate(lone).score, null);
  assert.equal(candidate(lone).partialPairs, 1);
  assert.equal(candidate(lone).assessment, 'unscored');
  const interrupted = makeAmazonReport(manifest, [record(pair[0], 1), record(pair[1], 1, { status: 'truncated', result: '*' })]);
  assert.equal(candidate(interrupted).score, null);
  assert.equal(candidate(interrupted).statusCounts.truncated, 1);
  const report = makeAmazonReport(manifest, [record(pair[0], 1), record(pair[1], 0.5), record(pair[0], 0, { attempt: 2, status: 'error', result: '*' })]);
  const row = candidate(report);
  assert.equal(row.score, 0.75);
  assert.equal(row.completePairs, 1);
  assert.equal(row.scoredGames, 2);
  assert.deepEqual([row.wins, row.draws, row.losses], [1, 1, 0]);
  assert.equal(row.assessment, 'provisional-above-target');
  assert.equal(report.complete, false);
  assert.equal(Object.hasOwn(report, 'rankingAvailable'), false);
});

test('forty and sixty percent are included in the practical band, while complete campaigns retain controls separately', () => {
  const { manifest, record } = fixture();
  const byComparison = new Map();
  for (const game of manifest.schedule) {
    if (!byComparison.has(game.comparisonId)) byComparison.set(game.comparisonId, []);
    byComparison.get(game.comparisonId).push(game);
  }
  const records = [...byComparison].flatMap(([id, games]) => {
    if (id.endsWith('-control')) return games.map(game => record(game, 0.5));
    const winPairs = id === 'ranging-pawn-v-amazon' ? 12 : id === 'courier-pawn-v-amazon' ? 18 : 15;
    const pairs = [...new Set(games.map(game => game.pairId))];
    return games.map(game => record(game, pairs.indexOf(game.pairId) < winPairs ? 1 : 0));
  });
  const report = makeAmazonReport(manifest, records);
  assert.equal(candidate(report).score, 0.4);
  assert.equal(candidate(report, 'pawn.purple@8').score, 0.6);
  for (const row of report.candidates) {
    assert.equal(row.assessment, 'within-target');
    assert.equal(row.completePairs, 30);
    assert.equal(row.scoredGames, 60);
    assert.equal(row.complete, true);
    assert.equal(Object.hasOwn(row, 'rank'), false);
  }
  assert.equal(report.complete, true);
  assert.equal(report.controls.length, 2);
  assert.ok(report.controls.every(control => control.scoreA === 0.5));
  assert.equal(report.candidates.length, 7);
});

test('a fully finished schedule with a truncated game retains provisional unscored pair coverage', () => {
  const { manifest, record } = fixture();
  const truncated = manifest.schedule.find(game => game.comparisonId === 'ranging-pawn-v-amazon');
  const records = manifest.schedule.map(game => record(game, 0.5,
    game.id === truncated.id ? { status: 'truncated', result: '*', reason: 'max-plies' } : {}));
  const report = makeAmazonReport(manifest, records), row = candidate(report);
  assert.equal(report.finished, true);
  assert.equal(report.finishedGames, 540);
  assert.equal(report.complete, false);
  assert.equal(report.timing.remainingGames, 0);
  assert.equal(row.score, 0.5);
  assert.equal(row.completePairs, 29);
  assert.equal(row.partialPairs, 1);
  assert.equal(row.scoredGames, 58);
  assert.equal(row.statusCounts.truncated, 1);
  assert.equal(row.assessment, 'provisional-within-target');
});

test('parallel reports validate whole-pair worker assignments and estimate concurrent remaining queues', () => {
  const { manifest, record } = fixture();
  const shards = [{ worker: 1, scheduleIds: [] }, { worker: 2, scheduleIds: [] }];
  for (let index = 0; index < manifest.schedule.length; index += 2) shards[(index / 2) % 2].scheduleIds.push(...manifest.schedule.slice(index, index + 2).map(game => game.id));
  manifest.parallel = { schemaVersion: 1, jobs: 2, shards };
  const report = makeAmazonReport(manifest, manifest.schedule.slice(0, 4).map(game => record(game)));
  assert.equal(report.timing.jobs, 2);
  assert.equal(report.timing.estimatedRemainingSeconds, 2680);
  const changed = structuredClone(manifest);
  changed.parallel.shards[1].scheduleIds[0] = changed.parallel.shards[0].scheduleIds[0];
  assert.throws(() => makeAmazonReport(changed, []), /exactly once/);
});

test('report files preserve the immutable manifest and torn live journal, and empty evidence stays unavailable', t => {
  const directory = temporary(t), { manifest } = fixture();
  writeRun(directory, manifest, [], '{"partial":');
  const beforeManifest = fs.readFileSync(path.join(directory, 'run.json'), 'utf8');
  const beforeJournal = fs.readFileSync(path.join(directory, 'games.jsonl'), 'utf8');
  const { report, files } = writeAmazonReport(directory);
  assert.equal(report.complete, false);
  assert.ok(report.candidates.every(row => row.score === null && row.assessment === 'unscored'));
  assert.equal(fs.readFileSync(path.join(directory, 'run.json'), 'utf8'), beforeManifest);
  assert.equal(fs.readFileSync(path.join(directory, 'games.jsonl'), 'utf8'), beforeJournal);
  for (const file of Object.values(files)) assert.ok(fs.statSync(file).size > 0);
  const markdown = fs.readFileSync(files.markdown, 'utf8');
  assert.match(markdown, /Incomplete campaign/);
  assert.match(markdown, /not a confidence interval/);
  assert.match(markdown, /No usable game timestamps/);
});
