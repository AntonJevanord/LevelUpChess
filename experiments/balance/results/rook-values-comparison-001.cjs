'use strict';

// Compare archived evidence only. No searches, games or evidence writes.
// Stage audit helpers reproduce the separate legal-move replay checks.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../..');
const { summarize } = require(path.join(ROOT, 'scripts/balance/stats'));
const { getCampaign, exchangePatterns } = require(path.join(ROOT, 'scripts/balance/rook-values-report'));
const { makeLevel3Report } = require(path.join(ROOT, 'scripts/balance/level3-report'));
const sha256 = value => createHash('sha256').update(value).digest('hex');
const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const history = record => JSON.stringify(['startFen', 'moves', 'sans', 'finalFen', 'result', 'reason', 'totalPlies'].map(key => record[key]));

function compare(directory = __dirname) {
  const { policies, roster } = getCampaign();
  const stages = Object.fromEntries(['auto', 'eight'].map(policy => {
    const prefix = `rook-values-${policy}-001`;
    const files = Object.fromEntries(['summary.json', 'games.jsonl', 'audit.json'].map(suffix => {
      const filename = `${prefix}.${suffix}`, bytes = fs.readFileSync(path.join(directory, filename));
      return [suffix, { filename, bytes, sha256: sha256(bytes) }];
    }));
    const summary = JSON.parse(files['summary.json'].bytes.toString('utf8'));
    const journal = files['games.jsonl'].bytes.toString('utf8');
    assert.ok(journal.endsWith('\n'));
    const records = journal.trim().split('\n').map(JSON.parse);
    const audit = JSON.parse(files['audit.json'].bytes.toString('utf8'));
    for (const [suffix, label] of [['summary.json', 'summary'], ['games.jsonl', 'journal']]) {
      assert.deepEqual({ bytes: files[suffix].bytes.length, sha256: files[suffix].sha256 }, audit.inputs[label]);
    }
    assert.equal(audit.policy, policy);
    assert.equal(summary.runId, audit.runId);
    const core = { ...summary };
    for (const key of ['runId', 'scheduledGames', 'nextIndex']) delete core[key];
    assert.deepEqual(summarize(records), core);
    assert.equal(summary.scheduledGames, 200); assert.equal(summary.nextIndex, 200);
    assert.equal(records.length, 200); assert.equal(new Set(records.map(record => record.id)).size, 200);
    assert.ok(records.every(record => record.attempt === 1 && record.status === 'completed'));
    const expected = policies[policy];
    assert.deepEqual(records.map(record => record.id).sort(), expected.schedule.map(game => game.id).sort());
    assert.equal(audit.expectedProtocol.variant, expected.profile.variant);
    assert.equal(audit.expectedProtocol.profileHash, expected.profile.hash);
    assert.equal(audit.expectedProtocol.registryHash, expected.registry.hash);
    assert.equal(audit.expectedProtocol.configSha256, sha256(JSON.stringify(expected.config)));
    assert.equal(audit.expectedProtocol.scheduleSha256, sha256(JSON.stringify(expected.schedule)));
    assert.deepEqual(audit.expectedProtocol.engine, expected.config.engine);
    for (const record of records) assert.deepEqual(record.evaluation, expected.config.evaluation);
    // This is an expected protocol for annotation checks, not an uploaded manifest.
    makeLevel3Report({ schemaVersion: 1, runId: summary.runId, config: expected.config,
      schedule: expected.schedule, designRegistry: expected.registry,
      designProfile: { variant: expected.profile.variant, config: expected.profile.config,
        hash: expected.profile.hash, registryHash: expected.profile.registryHash } }, records, roster);
    for (const key of ['summaryRegeneratesExactly', 'uniqueFirstAttempts', 'fullAutomaticScheduleCovered',
      'recordProtocolAnnotationsMatch', 'startingArmiesAndForcedPrefixes', 'legalMovesAndSAN',
      'finalFensAndTerminalOutcomes', 'noMovesAfterTermination']) {
      // The eight-point helper names its schedule check for the tested policy.
      if (key === 'fullAutomaticScheduleCovered' && policy === 'eight') continue;
      assert.equal(audit.checks[key], true, `${policy}: stage audit ${key}`);
    }
    assert.equal(audit.replay.games, records.length);
    assert.equal(audit.replay.plies, records.reduce((sum, record) => sum + record.totalPlies, 0));
    return [policy, { summary, records, audit, files }];
  }));
  const manualScheduleCheck = stages.eight.audit.checks.fullEightPointScheduleCovered;
  assert.equal(manualScheduleCheck, true);
  const comparisons = roster.candidates.filter(candidate => candidate.id !== roster.referenceId).map(candidate => {
    const comparisonId = `${candidate.key}-v-amazon`;
    const rows = ['auto', 'eight'].map(policy => stages[policy].summary.comparisons.find(row => row.comparisonId === comparisonId));
    assert.ok(rows.every(Boolean));
    assert.ok(rows.every(row => row.paired.completePairs === 20 && row.paired.games === 40));
    const maps = rows.map(row => new Map(row.openingClusters.map(opening => [opening.openingId, opening.score])));
    const openings = [...maps[0].keys()].sort();
    assert.deepEqual(openings, [...maps[1].keys()].sort()); assert.equal(openings.length, 20);
    const openingScores = openings.map(openingId => ({ openingId, automatic: maps[0].get(openingId), eightPoint: maps[1].get(openingId),
      difference: maps[1].get(openingId) - maps[0].get(openingId) }));
    const scores = maps.map(map => average(openings.map(opening => map.get(opening))));
    const result = { id: candidate.id, label: candidate.label, comparisonId, sharedOpenings: 20,
      automaticScore: scores[0], eightPointScore: scores[1], scoreDifference: scores[1] - scores[0],
      openingChanges: { better: openingScores.filter(row => row.difference > 0).length,
        same: openingScores.filter(row => row.difference === 0).length,
        worse: openingScores.filter(row => row.difference < 0).length },
      policies: Object.fromEntries(['auto', 'eight'].map((policy, index) => {
        const games = stages[policy].records.filter(record => record.comparisonId === comparisonId);
        const exchanges = exchangePatterns(games);
        assert.deepEqual(exchanges, stages[policy].audit.comparisons.find(row => row.comparisonId === comparisonId).exchanges);
        return [policy, { games: rows[index].paired.games, completePairs: rows[index].paired.completePairs,
          wins: rows[index].paired.wins, draws: rows[index].paired.draws, losses: rows[index].paired.losses, exchanges }];
      })), openingScores };
    return result;
  });
  const manualById = new Map(stages.eight.records.map(record => [record.id, record]));
  const controls = roster.controls.map(control => {
    const games = stages.auto.records.filter(record => record.comparisonId === control.id);
    return { id: control.id, gamesPerPolicy: games.length,
      identicalHistoriesAndOutcomes: games.filter(record => history(record) === history(manualById.get(record.id))).length,
      scorePerPolicy: Object.fromEntries(['auto', 'eight'].map(policy => [policy,
        stages[policy].summary.comparisons.find(row => row.comparisonId === control.id).primaryEstimate.score])) };
  });
  const subjects = stages.auto.records.filter(record => !roster.controls.some(control => control.id === record.comparisonId));
  return {
    schemaVersion: 1, format: 'levelup-rook-values-policy-comparison',
    status: '400-game sensitivity question closed',
    totalGames: 400, completePairs: 200,
    replayedPliesFromStageAudits: stages.auto.audit.replay.plies + stages.eight.audit.replay.plies,
    errors: 0, truncations: 0,
    inputs: Object.fromEntries(['auto', 'eight'].map(policy => [policy, {
      runId: stages[policy].summary.runId,
      files: Object.values(stages[policy].files).map(file => ({ file: file.filename, bytes: file.bytes.length, sha256: file.sha256 })),
      expectedProfileHash: policies[policy].profile.hash,
      expectedRegistryHash: policies[policy].registry.hash,
      evaluation: policies[policy].config.evaluation || null,
    }])), comparisons, controls,
    subjectGamesPerPolicy: subjects.length,
    identicalSubjectHistoriesAndOutcomes: subjects.filter(record => history(record) === history(manualById.get(record.id))).length,
    decision: {
      sensitivity: 'Observed matchup sensitivity is substantial for Quiet Blink; capturing revisions retain high observed scores under both policies.',
      authoritativeEvaluationPolicy: 'deferred', intrinsicMaterialValue: 'unmeasured', movementChange: 'deferred',
      prototypes: 'Preserve all three; neither certify Quiet Blink as balanced nor assign eight points universally.',
      furtherGamesScheduled: 0,
      nextMaterialQuestion: 'A bounded Amazon-over-queen compensation pilot can use unchanged ordinary/Amazon evaluation: no Blink is present, so choosing a Blink policy is not a prerequisite.',
      optionalCalibrationQuestion: 'Choosing authoritative Blink search values may justify one separately capped identical-army policy duel. The shared-policy runner needs new support; no duel is scheduled.',
    },
    limits: [
      'Both engines use the same policy within each game. A lower Blink-army score does not identify which policy makes either engine play better.',
      'All stage journal annotations match expected configurations and profiles, but no run.json or parent manifest was supplied; actual executable/source identities remain unverified.',
      'Stage helpers replay the archived games. This comparison rechecks hashes, summaries, protocol annotations, paired opening scores and observed histories without searches.',
      'Twenty fixed related opening prefixes are descriptive evidence, not independent random samples or a universal material calibration.',
      'Exchange counts describe recorded behavior; they do not prove forced trades, mistakes, causation or intrinsic material strength.',
    ],
  };
}

if (require.main === module) {
  if (process.argv.length > 3) { console.error('Usage: node rook-values-comparison-001.cjs [RESULTS_DIRECTORY]'); process.exitCode = 1; }
  else try { process.stdout.write(JSON.stringify(compare(process.argv[2]), null, 2) + '\n'); }
  catch (error) { console.error(error); process.exitCode = 1; }
}
module.exports = { compare };
