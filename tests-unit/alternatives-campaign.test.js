const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getCampaign, verifyCampaignManifest, makeAlternativesReport, writeAlternativesReport } = require('../scripts/balance/alternatives-report');
const { parseArgs, main } = require('../scripts/alternatives-balance');
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

test('the frozen reference-only schedule contains twelve alternatives, two controls and 1120 whole-pair games', () => {
  const { config, schedule, roster } = getCampaign();
  assert.equal(schedule.length, 1120);
  assert.equal(config.openings.length, 40);
  assert.equal(new Set(config.openings.map(opening => JSON.stringify(opening.moves))).size, 40);
  assert.deepEqual(config.engine, { nodes: 100000, threads: 1, hashMb: 32, maxPlies: 400 });
  const matchups = config.comparisons.filter(row => !row.id.endsWith('-control'));
  assert.equal(matchups.length, 12);
  assert.deepEqual(new Set(matchups.map(row => Object.values(row.armyA.upgrades)[0])),
    new Set(['pawn.purple@7', 'pawn.purple@8', 'pawn.purple@9', 'pawn.purple@10', 'bishop.purple@3', 'bishop.purple@5', 'bishop.purple@4', 'bishop.purple@6', 'rook.purple@4', 'rook.purple@5', 'queen.purple@4', 'queen.purple@5']));
  for (const row of matchups) assert.deepEqual(row.armyB, { upgrades: { d1: 'queen.purple@1' }, remove: [] });
  for (const row of config.comparisons) assert.equal(schedule.filter(game => game.comparisonId === row.id).length, 80);
  for (let index = 0; index < schedule.length; index += 2) {
    assert.equal(schedule[index].pairId, schedule[index + 1].pairId);
    assert.notEqual(schedule[index].aColor, schedule[index + 1].aColor);
  }
  assert.deepEqual(roster.practicalScoreBand, [0.4, 0.6]);
  assert.equal(roster.maxGames, 1200);
  assert.equal(roster.scheduledGames, 1120);
  assert.equal(roster.alternativeGroups.length, 6);
  assert.deepEqual(new Set(roster.alternativeGroups.flatMap(group => group.designIds)),
    new Set(roster.candidates.filter(row => row.id !== roster.referenceId).map(row => row.id)));
  assert.equal(createDesignRegistry(config).definitions.length, 13);
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
  await assert.rejects(main(['--resume', invalidDir]), /frozen 1120-game/);
  assert.equal(serialCalls.length, 1);
  assert.equal(parallelCalls.length, 3);
});

test('the campaign rejects edited settings, schedule subsets, unknown records and altered identities', () => {
  const { manifest, record } = fixture();
  assert.equal(verifyCampaignManifest(manifest).schedule.length, 1120);
  for (const edit of [
    value => { value.config.engine.nodes = 500; },
    value => { value.schedule = value.schedule.slice(0, 2); },
    value => { value.schedule[0].aColor = value.schedule[0].aColor === 'w' ? 'b' : 'w'; },
    value => { value.designRegistry.hash = 'changed'; },
    value => { value.designProfile.hash = 'changed'; },
  ]) {
    const changed = structuredClone(manifest); edit(changed);
    assert.throws(() => makeAlternativesReport(changed, []));
  }
  const first = record(manifest.schedule[0]);
  for (const edit of [
    value => { value.id = 'unknown'; }, value => { value.profileHash = 'changed'; },
    value => { value.engine.nodes = 500; }, value => { value.whiteStrength.skill = 1; },
  ]) {
    const changed = structuredClone(first); edit(changed);
    assert.throws(() => makeAlternativesReport(manifest, [changed]));
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
    value => { value.openings[0].moves = ['e2e4']; },
  ]) {
    changed = structuredClone(config); edit(changed);
    assert.throws(() => getCampaign(), /declared|fixed|match|differ|changed/i);
  }
});

test('the declared alternative groups cannot be reordered, duplicated or reassigned', t => {
  const { roster } = getCampaign(), originalRead = fs.readFileSync;
  let changed;
  t.mock.method(fs, 'readFileSync', (file, ...args) => path.basename(String(file)) === 'amazon-alternatives-roster.json'
    ? JSON.stringify(changed) : originalRead(file, ...args));
  for (const edit of [
    value => { value.alternativeGroups.reverse(); },
    value => { value.alternativeGroups[0].designIds = ['pawn.purple@7', 'pawn.purple@7']; },
    value => { value.alternativeGroups[1].designIds[1] = 'pawn.purple@8'; },
    value => { value.maxGames = 2000; },
  ]) {
    changed = structuredClone(roster); edit(changed);
    assert.throws(() => getCampaign(), /groups|cap/);
  }
});

test('unpaired results and unfinished attempts remain unscored; completed pairs report provisional points', () => {
  const { manifest, record } = fixture();
  const games = manifest.schedule.filter(game => game.comparisonId === 'ranging-pawn-v-amazon');
  const pair = games.filter(game => game.pairId === games[0].pairId);
  const lone = makeAlternativesReport(manifest, [record(pair[0], 1)]);
  assert.equal(candidate(lone).score, null);
  assert.equal(candidate(lone).partialPairs, 1);
  assert.equal(candidate(lone).assessment, 'unscored');
  const interrupted = makeAlternativesReport(manifest, [record(pair[0], 1), record(pair[1], 1, { status: 'truncated', result: '*' })]);
  assert.equal(candidate(interrupted).score, null);
  assert.equal(candidate(interrupted).statusCounts.truncated, 1);
  const report = makeAlternativesReport(manifest, [record(pair[0], 1), record(pair[1], 0.5), record(pair[0], 0, { attempt: 2, status: 'error', result: '*' })]);
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
    const winPairs = id === 'ranging-pawn-v-amazon' ? 16 : id === 'courier-pawn-v-amazon' ? 24 : 20;
    const pairs = [...new Set(games.map(game => game.pairId))];
    return games.map(game => record(game, pairs.indexOf(game.pairId) < winPairs ? 1 : 0));
  });
  const report = makeAlternativesReport(manifest, records);
  assert.equal(candidate(report).score, 0.4);
  assert.equal(candidate(report, 'pawn.purple@8').score, 0.6);
  for (const row of report.candidates) {
    assert.equal(row.assessment, 'within-target');
    assert.equal(row.completePairs, 40);
    assert.equal(row.scoredGames, 80);
    assert.equal(row.complete, true);
    assert.equal(Object.hasOwn(row, 'rank'), false);
  }
  assert.equal(report.complete, true);
  assert.equal(report.controls.length, 2);
  assert.ok(report.controls.every(control => control.scoreA === 0.5));
  assert.equal(report.candidates.length, 12);
  assert.equal(report.alternatives.length, 6);
  assert.ok(report.alternatives.every(group => group.complete && group.sharedOpeningCount === 40));
});

test('alternative comparisons use the same completed openings instead of uneven candidate coverage', () => {
  const { manifest, record } = fixture();
  const comparisons = ['ranging-pawn-v-amazon', 'courier-pawn-v-amazon'];
  const openingIds = getCampaign().config.openings.slice(0, 2).map(opening => opening.id);
  const pair = (comparisonId, openingId) => manifest.schedule.filter(game => game.comparisonId === comparisonId && game.openingId === openingId);
  const records = [
    ...pair(comparisons[0], openingIds[0]).map(game => record(game, 1)),
    ...pair(comparisons[0], openingIds[1]).map(game => record(game, 0)),
    ...pair(comparisons[1], openingIds[0]).map(game => record(game, 0.5)),
    record(pair(comparisons[1], openingIds[1])[0], 1),
  ];
  const report = makeAlternativesReport(manifest, records), group = report.alternatives[0];
  assert.equal(candidate(report).score, 0.5);
  assert.equal(group.sharedOpeningCount, 1);
  assert.deepEqual(group.scores.map(row => row.score), [1, 0.5]);
  assert.deepEqual(group.scores.map(row => row.distanceFromEven), [0.5, 0]);
  assert.equal(group.nearerToEvenId, 'pawn.purple@8');
  assert.equal(group.complete, false);
  assert.equal(group.assessment, 'provisional-comparison');
  assert.deepEqual(group.openingScores.map(row => row.openingId), [openingIds[0]]);
  assert.equal(report.alternatives[1].assessment, 'unscored');
  assert.equal(report.alternatives[1].nearerToEvenId, null);
});

test('equal distance above and below fifty percent stays tied; groups do not choose a design', () => {
  const { manifest, record } = fixture();
  const openingId = getCampaign().config.openings[0].id;
  const records = ['ranging-pawn-v-amazon', 'courier-pawn-v-amazon'].flatMap((comparisonId, candidateIndex) =>
    manifest.schedule.filter(game => game.openingId === openingId && game.comparisonId === comparisonId)
      .map((game, gameIndex) => record(game, gameIndex === 0 ? 0.5 : candidateIndex === 0 ? 1 : 0)));
  const group = makeAlternativesReport(manifest, records).alternatives[0];
  assert.deepEqual(group.scores.map(row => row.score), [0.75, 0.25]);
  assert.equal(group.distanceDifference, 0);
  assert.equal(group.nearerToEvenId, null);
  assert.equal(Object.hasOwn(group, 'winner'), false);
});

test('a fully finished schedule with a truncated game retains provisional unscored pair coverage', () => {
  const { manifest, record } = fixture();
  const truncated = manifest.schedule.find(game => game.comparisonId === 'ranging-pawn-v-amazon');
  const records = manifest.schedule.map(game => record(game, 0.5,
    game.id === truncated.id ? { status: 'truncated', result: '*', reason: 'max-plies' } : {}));
  const report = makeAlternativesReport(manifest, records), row = candidate(report);
  assert.equal(report.finished, true);
  assert.equal(report.finishedGames, 1120);
  assert.equal(report.complete, false);
  assert.equal(report.timing.remainingGames, 0);
  assert.equal(row.score, 0.5);
  assert.equal(row.completePairs, 39);
  assert.equal(row.partialPairs, 1);
  assert.equal(row.scoredGames, 78);
  assert.equal(row.statusCounts.truncated, 1);
  assert.equal(row.assessment, 'provisional-within-target');
});

test('a truncated control does not relabel fully scored candidate comparisons as provisional', t => {
  const directory = temporary(t), { manifest, record } = fixture();
  const truncated = manifest.schedule.find(game => game.comparisonId === 'standard-control');
  const records = manifest.schedule.map(game => record(game, 0.5,
    game.id === truncated.id ? { status: 'truncated', result: '*', reason: 'max-plies' } : {}));
  writeRun(directory, manifest, records);
  const { report, files } = writeAlternativesReport(directory);
  assert.equal(report.finished, true);
  assert.equal(report.complete, false);
  assert.ok(report.candidates.every(row => row.complete && row.assessment === 'within-target'));
  assert.ok(report.alternatives.every(group => group.complete));
  assert.equal(report.controls.find(row => row.comparisonId === 'standard-control').completePairs, 39);
  const markdown = fs.readFileSync(files.markdown, 'utf8');
  assert.match(markdown, /inspect the affected rows and controls/);
  assert.doesNotMatch(markdown, /Target-band labels remain provisional/);
});

test('parallel reports validate whole-pair worker assignments and estimate concurrent remaining queues', () => {
  const { manifest, record } = fixture();
  const shards = [{ worker: 1, scheduleIds: [] }, { worker: 2, scheduleIds: [] }];
  for (let index = 0; index < manifest.schedule.length; index += 2) shards[(index / 2) % 2].scheduleIds.push(...manifest.schedule.slice(index, index + 2).map(game => game.id));
  manifest.parallel = { schemaVersion: 1, jobs: 2, shards };
  const report = makeAlternativesReport(manifest, manifest.schedule.slice(0, 4).map(game => record(game)));
  assert.equal(report.timing.jobs, 2);
  assert.equal(report.timing.estimatedRemainingSeconds, 5580);
  const changed = structuredClone(manifest);
  changed.parallel.shards[1].scheduleIds[0] = changed.parallel.shards[0].scheduleIds[0];
  assert.throws(() => makeAlternativesReport(changed, []), /exactly once/);
});

test('report files preserve the immutable manifest and torn live journal, and empty evidence stays unavailable', t => {
  const directory = temporary(t), { manifest } = fixture();
  writeRun(directory, manifest, [], '{"partial":');
  const beforeManifest = fs.readFileSync(path.join(directory, 'run.json'), 'utf8');
  const beforeJournal = fs.readFileSync(path.join(directory, 'games.jsonl'), 'utf8');
  const { report, files } = writeAlternativesReport(directory);
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
