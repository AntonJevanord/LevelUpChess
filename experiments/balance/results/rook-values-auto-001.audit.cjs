'use strict';

// Replays existing games only. No engine searches or files are written.
// Usage: node experiments/balance/results/rook-values-auto-001.audit.cjs [summary.json games.jsonl]
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../..');
const { summarize } = require(path.join(ROOT, 'scripts/balance/stats'));
const { getCampaign, exchangePatterns } = require(path.join(ROOT, 'scripts/balance/rook-values-report'));
const { makeLevel3Report } = require(path.join(ROOT, 'scripts/balance/level3-report'));
const { createMatchRules } = require(path.join(ROOT, 'dist/balance-rules.cjs'));

const sha256 = value => createHash('sha256').update(value).digest('hex');
const score = record => record.result === '1/2-1/2' ? 0.5 : Number((record.result === '1-0') === (record.aColor === 'w'));
const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;

async function audit(summaryPath = path.join(__dirname, 'rook-values-auto-001.summary.json'),
  gamesPath = path.join(__dirname, 'rook-values-auto-001.games.jsonl')) {
  const summaryBytes = fs.readFileSync(summaryPath), gameBytes = fs.readFileSync(gamesPath);
  const uploaded = JSON.parse(summaryBytes.toString('utf8'));
  const journal = gameBytes.toString('utf8');
  assert.ok(journal.endsWith('\n'), 'A complete newline-terminated journal is required.');
  const records = journal.trim().split('\n').map(JSON.parse);
  const core = { ...uploaded };
  for (const key of ['runId', 'scheduledGames', 'nextIndex']) delete core[key];
  const summary = summarize(records);
  assert.deepEqual(summary, core, 'The uploaded summary must regenerate exactly.');
  const { policies, roster } = getCampaign(), expected = policies.auto;
  assert.equal(uploaded.scheduledGames, 200);
  assert.equal(uploaded.nextIndex, 200);
  assert.equal(records.length, 200);
  assert.equal(new Set(records.map(record => record.id)).size, 200);
  assert.ok(records.every(record => record.attempt === 1 && record.status === 'completed' && !Object.hasOwn(record, 'evaluation')));
  assert.deepEqual(records.map(record => record.id).sort(), expected.schedule.map(game => game.id).sort());

  // This manifest is constructed from the declared protocol, not supplied by
  // the user. It validates record annotations; it cannot attest their binary.
  const expectedManifest = {
    schemaVersion: 1, runId: uploaded.runId, config: expected.config, schedule: expected.schedule,
    designRegistry: expected.registry,
    designProfile: { variant: expected.profile.variant, config: expected.profile.config,
      hash: expected.profile.hash, registryHash: expected.profile.registryHash },
  };
  makeLevel3Report(expectedManifest, records, roster);
  const rules = await createMatchRules({ profile: expected.profile });
  const scheduled = new Map(expected.schedule.map(game => [game.id, game]));
  let replayPlies = 0;
  for (const record of records) {
    const game = scheduled.get(record.id), a = game.comparison.armyA, b = game.comparison.armyB;
    const start = rules.startingFen(record.aColor === 'w' ? a : b, record.aColor === 'w' ? b : a);
    assert.equal(record.startFen, start, `${record.id}: starting army`);
    assert.deepEqual(record.openingMoves, game.openingMoves);
    assert.deepEqual(record.moves.slice(0, game.openingMoves.length), game.openingMoves);
    assert.equal(record.openingPlies, game.openingMoves.length);
    assert.equal(record.totalPlies, record.moves.length);
    assert.equal(record.playedPlies, record.totalPlies - record.openingPlies);
    assert.equal(record.sans.length, record.moves.length);
    assert.equal(record.royalMode, 'king');
    assert.equal(record.evaluationCaveat, null);
    const board = rules.createBoard(start);
    try {
      for (let ply = 0; ply < record.moves.length; ply++) {
        assert.equal(board.outcome(), null, `${record.id}: play after termination at ${ply}`);
        assert.equal(board.san(record.moves[ply]), record.sans[ply], `${record.id}: SAN at ${ply}`);
        assert.equal(board.push(record.moves[ply]), true, `${record.id}: illegal move at ${ply}`);
        replayPlies++;
      }
      assert.equal(board.fen(), record.finalFen, `${record.id}: final FEN`);
      assert.deepEqual(board.outcome(), { result: record.result, reason: record.reason }, `${record.id}: outcome`);
    } finally { board.dispose(); }
  }

  const comparisons = summary.comparisons.map(row => {
    const games = records.filter(record => record.comparisonId === row.comparisonId);
    const whiteWins = games.filter(record => record.result === '1-0').length;
    const draws = games.filter(record => record.result === '1/2-1/2').length;
    const blackWins = games.filter(record => record.result === '0-1').length;
    return {
      comparisonId: row.comparisonId, games: row.paired.games,
      wins: row.paired.wins, draws: row.paired.draws, losses: row.paired.losses,
      score: row.primaryEstimate.score, completePairs: row.paired.completePairs,
      uniqueOpenings: row.primaryEstimate.uniqueOpenings,
      aColorScores: Object.fromEntries(['w', 'b'].map(color => [color, average(games.filter(record => record.aColor === color).map(score))])),
      physicalColors: { whiteWins, draws, blackWins, whiteScore: (whiteWins + draws / 2) / games.length },
      ...(row.comparisonId.includes('-v-') ? { exchanges: exchangePatterns(games) } : {}),
    };
  });
  const events = records.flatMap(record => [[Date.parse(record.startedAt), 1], [Date.parse(record.finishedAt), -1]])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  assert.ok(events.every(event => Number.isFinite(event[0])));
  let active = 0, maxConcurrent = 0;
  for (const [, change] of events) { active += change; maxConcurrent = Math.max(active, maxConcurrent); }
  return {
    schemaVersion: 1, format: 'levelup-rook-values-auto-results-audit',
    runId: uploaded.runId, runIdSource: 'Uploaded summary; journal records contain no run ID.',
    inputs: {
      summary: { bytes: summaryBytes.length, sha256: sha256(summaryBytes) },
      journal: { bytes: gameBytes.length, sha256: sha256(gameBytes) },
    },
    policy: 'auto', scheduledGames: 200, totalAttempts: records.length,
    statusCounts: summary.statusCounts,
    expectedProtocol: {
      variant: expected.profile.variant, profileHash: expected.profile.hash, registryHash: expected.registry.hash,
      configSha256: sha256(JSON.stringify(expected.config)),
      scheduleSha256: sha256(JSON.stringify(expected.schedule)),
      engine: expected.config.engine, strength: { skill: 20 }, manualEvaluation: null,
      definitions: expected.registry.definitions,
    },
    checks: {
      summaryRegeneratesExactly: true, uniqueFirstAttempts: true,
      fullAutomaticScheduleCovered: true, recordProtocolAnnotationsMatch: true,
      startingArmiesAndForcedPrefixes: true, legalMovesAndSAN: true,
      finalFensAndTerminalOutcomes: true, noMovesAfterTermination: true,
      uploadedManifestAvailable: false, actualBinaryHashVerified: false,
      actualSourceIdentityVerified: false, recordedNativeValueTablesAvailable: false,
    },
    recordedEngineNames: [...new Set(records.flatMap(record => Object.values(record.engineNames)))].sort(),
    replay: { games: records.length, plies: replayPlies },
    comparisons,
    observedTiming: { firstUTC: new Date(events[0][0]).toISOString(), lastUTC: new Date(events.at(-1)[0]).toISOString(),
      elapsedSeconds: (events.at(-1)[0] - events[0][0]) / 1000, maxConcurrentGames: maxConcurrent },
    limits: [
      'No run.json or parent campaign manifest was uploaded. Expected protocol annotations match, but actual engine/source hashes and declared worker layout are unverified.',
      'This is only the automatic baseline. No eight-point-policy results or policy effect are established.',
      'Between-design comparisons change movement and automatic valuation together; they do not isolate either effect.',
      'Observable exchanges and protocol-specific scores do not establish forced trades, engine mistakes, causation, intrinsic material values or calibrated Elo.',
      'Fixed related opening prefixes, one opponent and one search budget limit generalization; controls exercise the pipeline rather than material calibration.',
      'Replay validates recorded chess behavior, not process execution or the full native search trace.',
    ],
  };
}

if (require.main === module) {
  if (![0, 2].includes(process.argv.length - 2)) {
    console.error('Usage: node rook-values-auto-001.audit.cjs [summary.json games.jsonl]');
    process.exitCode = 1;
  } else audit(...process.argv.slice(2)).then(result => process.stdout.write(JSON.stringify(result, null, 2) + '\n'))
    .catch(error => { console.error(error); process.exitCode = 1; });
}
module.exports = { audit };
