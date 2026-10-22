const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { normalizeConfig, makeSchedule } = require('../scripts/balance/plan');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { makeLevel3Report, writeLevel3Report } = require('../scripts/balance/level3-report');

const roster = {
  referenceId: 'queen.purple@1', maxGames: 2000,
  candidates: [
    { id: 'rook.purple@2', key: 'rook', label: 'Rook', square: 'a1' },
    { id: 'bishop.purple@1', key: 'bishop', label: 'Bishop', square: 'c1' },
    { id: 'queen.purple@1', key: 'amazon', label: 'Amazon', square: 'd1' },
  ],
  controls: [{ id: 'standard-control' }, { id: 'amazon-control' }],
};
const army = candidate => ({ upgrades: { [candidate.square]: candidate.id } });
function fixture() {
  const [rook, bishop, amazon] = roster.candidates;
  const config = normalizeConfig({
    schemaVersion: 2, name: 'Synthetic level-3 report', seed: 2, repetitions: 1,
    engine: { nodes: 100000, threads: 1, hashMb: 32, maxPlies: 400 },
    openings: [{ id: 'start', moves: [] }, { id: 'e-open', moves: ['e2e4', 'e7e5'] }],
    comparisons: [
      { id: 'rook-v-bishop', armyA: army(rook), armyB: army(bishop) },
      { id: 'rook-v-amazon', armyA: army(rook), armyB: army(amazon) },
      { id: 'bishop-v-amazon', armyA: army(bishop), armyB: army(amazon) },
      { id: 'standard-control', armyA: { upgrades: {} }, armyB: { upgrades: {} } },
      { id: 'amazon-control', armyA: army(amazon), armyB: army(amazon) },
    ],
  });
  const registry = createDesignRegistry(config), profile = compileDesignProfile(registry);
  const manifest = {
    schemaVersion: 1, runId: 'synthetic', config, schedule: makeSchedule(config), designRegistry: registry,
    designProfile: { variant: profile.variant, config: profile.config, hash: profile.hash, registryHash: profile.registryHash },
  };
  function record(game, score = 1, extra = {}) {
    return {
      schemaVersion: 1, id: game.id, pairId: game.pairId, comparisonId: game.comparisonId,
      openingId: game.openingId, aColor: game.aColor, attempt: 1, status: 'completed',
      result: score === 0.5 ? '1/2-1/2' : (score === 1) === (game.aColor === 'w') ? '1-0' : '0-1',
      reason: 'checkmate', profileHash: profile.hash, registryHash: profile.registryHash,
      registryReference: 'run.json#designRegistry', variant: profile.variant, engine: config.engine,
      whiteStrength: game.comparison.strengthA, blackStrength: game.comparison.strengthB,
      startedAt: '2026-10-21T10:00:00.000Z', finishedAt: '2026-10-21T10:00:10.000Z', ...extra,
    };
  }
  return { manifest, record };
}
const row = (report, id) => report.standings.find(value => value.id === id);

test('standings invert Army B scores, weight opponents equally and retain opening clusters', () => {
  const { manifest, record } = fixture();
  const records = manifest.schedule.map(game => record(game,
    game.comparisonId === 'rook-v-amazon' ? game.aColor === 'w' ? 0.5 : 0 : 1));
  const report = makeLevel3Report(manifest, records, roster);
  assert.equal(report.matrix['rook.purple@2']['queen.purple@1'].score, 0.25);
  assert.equal(report.matrix['queen.purple@1']['rook.purple@2'].score, 0.75);
  assert.equal(row(report, 'rook.purple@2').meanScore, 0.625);
  assert.equal(row(report, 'bishop.purple@1').meanScore, 0.5);
  assert.equal(row(report, 'queen.purple@1').meanScore, 0.375);
  assert.equal(row(report, 'rook.purple@2').versusReference.score, 0.25);
  assert.deepEqual(report.standings.map(value => value.rank), [1, 2, 3]);
  assert.equal(row(report, 'rook.purple@2').completePairs, 4);
  assert.equal(row(report, 'rook.purple@2').scoredGames, 8);
  assert.equal(row(report, 'rook.purple@2').uniqueOpenings, 2, 'shared openings are not multiplied by opponent count');
  assert.equal(row(report, 'queen.purple@1').completePairs, 4, 'Amazon self-play controls do not enter its standings');
});

test('unfinished color partners do not score and unequal opponent coverage cannot produce rankings', () => {
  const { manifest, record } = fixture();
  const pair = manifest.schedule.filter(game => game.comparisonId === 'rook-v-bishop' && game.openingId === 'start');
  const lone = makeLevel3Report(manifest, [record(pair[0])], roster);
  assert.equal(row(lone, 'rook.purple@2').scoredGames, 0);
  const partial = makeLevel3Report(manifest, pair.map(game => record(game)), roster);
  assert.equal(row(partial, 'rook.purple@2').partialMeanScore, 1);
  assert.equal(row(partial, 'rook.purple@2').meanScore, null);
  assert.equal(row(partial, 'rook.purple@2').opponentCoverage, 1);
  assert.equal(row(partial, 'rook.purple@2').rank, null);
  assert.equal(row(partial, 'queen.purple@1').partialMeanScore, null);
});

test('full means give each opponent equal weight even while their scored pair counts differ', () => {
  const { manifest, record } = fixture();
  const games = manifest.schedule.filter(game => game.comparisonId === 'rook-v-bishop'
    || game.comparisonId === 'rook-v-amazon' && game.openingId === 'start');
  const report = makeLevel3Report(manifest, games.map(game => record(game, game.comparisonId === 'rook-v-bishop' ? 1 : 0)), roster);
  assert.equal(row(report, 'rook.purple@2').partialMeanScore, 0.5, 'two winning pairs and one losing pair are not averaged as three independent opponents');
  assert.equal(row(report, 'rook.purple@2').meanScore, null, 'a full mean waits for the planned complete schedule');
  assert.equal(row(report, 'rook.purple@2').rank, null, 'the planned schedule is still incomplete');
});

test('control A scores can be exactly fifty percent while White wins every physical game', () => {
  const { manifest, record } = fixture();
  const games = manifest.schedule.filter(game => game.comparisonId.endsWith('-control'));
  const report = makeLevel3Report(manifest, games.map(game => record(game, 1, { result: '1-0' })), roster);
  for (const control of report.controls) {
    assert.equal(control.scoreA, 0.5);
    assert.deepEqual(control.physicalColors, { games: 4, whiteWins: 4, draws: 0, blackWins: 0, whiteScore: 1 });
  }
  assert.ok(report.standings.every(value => value.scoredGames === 0 && value.meanScore === null));
});

test('one finished purchase does not receive a rank while other purchases remain incomplete', () => {
  const { manifest, record } = fixture();
  const games = manifest.schedule.filter(game => game.comparisonId !== 'rook-v-bishop' || game.openingId !== 'start');
  const report = makeLevel3Report(manifest, games.map(game => record(game, 0.5)), roster);
  assert.equal(row(report, 'queen.purple@1').meanScore, 0.5, 'the Amazon has a complete individual result');
  assert.equal(row(report, 'queen.purple@1').completeScheduledScores, true);
  assert.equal(row(report, 'rook.purple@2').meanScore, null);
  assert.equal(report.rankingAvailable, false);
  assert.ok(report.standings.every(value => value.rank === null));
});

test('failed retries and duplicate completions retain the latest valid completed pair', () => {
  const { manifest, record } = fixture();
  const pair = manifest.schedule.filter(game => game.comparisonId === 'rook-v-bishop' && game.openingId === 'start');
  const records = [record(pair[0], 0), record(pair[1], 1), record(pair[0], 1, { attempt: 2 }), record(pair[0], 0, { attempt: 3, status: 'error', result: '*' })];
  const report = makeLevel3Report(manifest, records, roster);
  assert.equal(report.matrix['rook.purple@2']['bishop.purple@1'].score, 1);
  assert.equal(row(report, 'rook.purple@2').completePairs, 1);
  assert.equal(row(report, 'rook.purple@2').statusCounts.completed, 3, 'attempt counts stay visible');
  assert.equal(row(report, 'rook.purple@2').statusCounts.error, 1);
  assert.equal(report.timing.sampleGames, 1, 'retried completions may contain saved moves and cannot estimate full-game duration');
  assert.equal(report.timing.excludedRetryGames, 1);
});

test('timing uses completed/truncated attempts, excludes interruptions and leaves truncations unscored', () => {
  const { manifest, record } = fixture();
  const games = manifest.schedule.slice(0, 4);
  const report = makeLevel3Report(manifest, [
    record(games[0]),
    record(games[1], 1, { status: 'truncated', result: '*', finishedAt: '2026-10-21T10:00:30.000Z' }),
    record(games[2], 1, { status: 'aborted', result: '*', finishedAt: '2026-10-21T11:00:00.000Z' }),
    record(games[3], 1, { status: 'error', result: '*', finishedAt: '2026-10-21T12:00:00.000Z' }),
  ], roster);
  assert.equal(report.timing.sampleGames, 2);
  assert.equal(report.timing.meanSeconds, 20);
  assert.equal(report.timing.medianSeconds, 20);
  assert.equal(report.timing.remainingGames, manifest.schedule.length - 2);
  assert.equal(report.timing.estimatedRemainingSeconds, 20 * (manifest.schedule.length - 2));
  assert.equal(report.timing.smallSample, true);
  assert.equal(report.statusCounts.truncated, 1);
});

test('missing timestamps cannot invent runtime estimates', () => {
  const { manifest, record } = fixture();
  const report = makeLevel3Report(manifest, [record(manifest.schedule[0], 1, { startedAt: undefined, finishedAt: undefined })], roster);
  assert.equal(report.timing.sampleGames, 0);
  assert.equal(report.timing.estimatedRemainingSeconds, null);
  assert.equal(report.timing.missingOrInvalidTimestamps, 1);
});

test('parallel runtime estimates account for simultaneous games and the longest remaining queue', () => {
  const { manifest, record } = fixture();
  const shards = [{ worker: 1, scheduleIds: [] }, { worker: 2, scheduleIds: [] }];
  for (let index = 0; index < manifest.schedule.length; index += 2) shards[(index / 2) % 2].scheduleIds.push(...manifest.schedule.slice(index, index + 2).map(game => game.id));
  manifest.parallel = { schemaVersion: 1, jobs: 2, shards };
  const balanced = makeLevel3Report(manifest, manifest.schedule.slice(0, 4).map(game => record(game)), roster);
  assert.equal(balanced.timing.executionMode, 'parallel');
  assert.equal(balanced.timing.estimatedSequentialRemainingSeconds, 160);
  assert.equal(balanced.timing.estimatedRemainingSeconds, 80, 'two remaining eight-game queues run concurrently');
  const firstWorker = new Set(shards[0].scheduleIds);
  const tail = makeLevel3Report(manifest, manifest.schedule.filter(game => firstWorker.has(game.id)).map(game => record(game)), roster);
  assert.equal(tail.timing.estimatedRemainingSeconds, 100, 'a finished worker cannot halve the remaining worker queue');
  assert.deepEqual(tail.timing.remainingByWorker, [{ worker: 1, remainingGames: 0 }, { worker: 2, remainingGames: 10 }]);
  const noSamples = makeLevel3Report(manifest, [], roster);
  assert.equal(noSamples.timing.estimatedRemainingSeconds, null);
  const duplicate = structuredClone(manifest); duplicate.parallel.shards[1].scheduleIds[0] = duplicate.parallel.shards[0].scheduleIds[0];
  assert.throws(() => makeLevel3Report(duplicate, [], roster), /exactly once/);
  const splitPair = structuredClone(manifest);
  [splitPair.parallel.shards[0].scheduleIds[0], splitPair.parallel.shards[1].scheduleIds[0]] = [splitPair.parallel.shards[1].scheduleIds[0], splitPair.parallel.shards[0].scheduleIds[0]];
  assert.throws(() => makeLevel3Report(splitPair, [], roster), /color pair/);
});

test('unknown armies, mixed rule/settings identities and schedule edits are rejected', () => {
  const { manifest, record } = fixture();
  const first = record(manifest.schedule[0]);
  for (const edit of [
    value => { value.profileHash = '0'.repeat(64); },
    value => { value.registryHash = '0'.repeat(64); },
    value => { value.engine.nodes = 1; },
    value => { value.whiteStrength.skill = 0; },
    value => { value.comparisonId = 'some-other-comparison'; },
    value => { value.openingId = 'some-other-opening'; },
  ]) {
    const modified = structuredClone(first); edit(modified);
    assert.throws(() => makeLevel3Report(manifest, [modified], roster));
  }
  const unknown = structuredClone(manifest);
  unknown.config.comparisons[0].armyA.upgrades = { d2: 'pawn.purple@3' };
  assert.throws(() => makeLevel3Report(unknown, [], roster), /Unrecognized/);
  const edited = structuredClone(manifest); edited.designRegistry.definitions[0].movement = 'Q';
  assert.throws(() => makeLevel3Report(edited, [], roster), /manifest/);
  const moved = structuredClone(manifest); moved.schedule[0].aColor = moved.schedule[0].aColor === 'w' ? 'b' : 'w';
  assert.throws(() => makeLevel3Report(moved, [], roster), /schedule/);
  const mixedStrength = structuredClone(manifest);
  mixedStrength.config.comparisons[0].strengthA.skill = 0;
  mixedStrength.config.comparisons[0].strengthB.skill = 0;
  mixedStrength.schedule = makeSchedule(mixedStrength.config);
  assert.throws(() => makeLevel3Report(mixedStrength, [], roster), /different engine strength/);
});

test('writing a live campaign report ignores torn journal data without changing its source files', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-level3-report-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const rosterPath = path.resolve(__dirname, '../experiments/balance/level3-roster.json');
  const declared = JSON.parse(fs.readFileSync(rosterPath, 'utf8'));
  const config = normalizeConfig(JSON.parse(fs.readFileSync(path.join(path.dirname(rosterPath), declared.screen), 'utf8')));
  const registry = createDesignRegistry(config), profile = compileDesignProfile(registry);
  const manifest = { schemaVersion: 1, runId: 'actual-roster', config, schedule: makeSchedule(config), designRegistry: registry,
    designProfile: { variant: profile.variant, config: profile.config, hash: profile.hash, registryHash: profile.registryHash } };
  const originalManifest = JSON.stringify(manifest);
  const journal = '{"unfinished":';
  fs.writeFileSync(path.join(directory, 'run.json'), originalManifest);
  fs.writeFileSync(path.join(directory, 'games.jsonl'), journal);
  const result = writeLevel3Report(directory);
  assert.equal(result.report.totalAttempts, 0);
  assert.equal(result.report.scheduledGames, declared.screenGames);
  assert.equal(fs.readFileSync(path.join(directory, 'run.json'), 'utf8'), originalManifest);
  assert.equal(fs.readFileSync(path.join(directory, 'games.jsonl'), 'utf8'), journal);
  for (const file of Object.values(result.files)) assert.ok(fs.statSync(file).size > 0);
  assert.match(fs.readFileSync(result.files.markdown, 'utf8'), /No usable game timestamps/);
  assert.doesNotMatch(fs.readFileSync(result.files.matrix, 'utf8'), /undefined|NaN/);
});
