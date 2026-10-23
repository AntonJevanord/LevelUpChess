'use strict';

// Replay archived evidence only. No engine searches, new games or evidence writes.
// Usage: node experiments/balance/results/material-pilot-001.audit.cjs [RESULTS_DIRECTORY]
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../..');
const { summarize } = require(path.join(ROOT, 'scripts/balance/stats'));
const { getCampaign } = require(path.join(ROOT, 'scripts/balance/material-plan'));
const { estimateMaterial } = require(path.join(ROOT, 'scripts/balance/material-estimate'));
const { createMatchRules } = require(path.join(ROOT, 'dist/balance-rules.cjs'));
const hash = input => createHash('sha256').update(input).digest('hex');
const gameScore = record => record.result === '1/2-1/2' ? 0.5 : Number((record.result === '1-0') === (record.aColor === 'w'));

async function audit(directory = __dirname) {
  const campaign = getCampaign(), rules = await createMatchRules({ profile: campaign.profile });
  const files = {}, phases = {};
  const load = suffix => {
    const name = `material-pilot-001.${suffix}`, bytes = fs.readFileSync(path.join(directory, name));
    files[suffix] = { file: name, bytes: bytes.length, sha256: hash(bytes) };
    return bytes.toString('utf8');
  };
  const report = load('uploaded-report.md');
  for (const [phase, suffix, stageId] of [['control', 'control', 'control'], ['amazon', 'amazon-64', 'amazon-1']]) {
    const uploaded = JSON.parse(load(`${suffix}.summary.json`)), journal = load(`${suffix}.games.jsonl`);
    assert.ok(journal.endsWith('\n'), 'The uploaded journal must end in a complete line.');
    const records = journal.trim().split('\n').map(JSON.parse), summary = summarize(records), core = { ...uploaded };
    for (const key of ['runId', 'scheduledGames', 'nextIndex']) delete core[key];
    assert.deepEqual(summary, core, `${phase}: exact summary regeneration`);
    const stage = campaign.stages.find(stage => stage.id === stageId), schedule = new Map(stage.schedule.map(game => [game.id, game]));
    assert.equal(uploaded.scheduledGames, stage.games); assert.equal(uploaded.nextIndex, stage.games);
    assert.equal(records.length, stage.games); assert.equal(new Set(records.map(record => record.id)).size, records.length);
    assert.deepEqual(records.map(record => record.id).sort(), stage.schedule.map(game => game.id).sort());
    let plies = 0;
    for (const record of records) {
      const game = schedule.get(record.id);
      assert.equal(record.attempt, 1); assert.equal(record.status, 'completed');
      for (const key of ['pairId', 'comparisonId', 'openingId', 'aColor']) assert.equal(record[key], game[key]);
      assert.equal(record.profileHash, campaign.profile.hash); assert.equal(record.registryHash, campaign.registry.hash);
      assert.equal(record.variant, campaign.profile.variant); assert.equal(record.registryReference, 'run.json#designRegistry');
      assert.equal(record.royalMode, 'king'); assert.equal(record.evaluationCaveat, null); assert.equal(record.evaluation, undefined);
      assert.deepEqual(record.engine, campaign.config.engine);
      assert.deepEqual(record.whiteStrength, game.aColor === 'w' ? game.comparison.strengthA : game.comparison.strengthB);
      assert.deepEqual(record.blackStrength, game.aColor === 'b' ? game.comparison.strengthA : game.comparison.strengthB);
      const a = game.comparison.armyA, b = game.comparison.armyB;
      const starting = rules.startingFen(record.aColor === 'w' ? a : b, record.aColor === 'w' ? b : a);
      assert.equal(record.startFen, starting); assert.deepEqual(record.openingMoves, game.openingMoves);
      assert.deepEqual(record.moves.slice(0, game.openingMoves.length), game.openingMoves);
      assert.equal(record.openingPlies, game.openingMoves.length); assert.equal(record.totalPlies, record.moves.length);
      assert.equal(record.playedPlies, record.totalPlies - record.openingPlies); assert.equal(record.sans.length, record.totalPlies);
      const board = rules.createBoard(starting);
      try {
        for (let ply = 0; ply < record.moves.length; ply++) {
          assert.equal(board.outcome(), null, `${record.id}: earlier termination at ${ply}`);
          assert.equal(board.san(record.moves[ply]), record.sans[ply], `${record.id}: SAN at ${ply}`);
          assert.equal(board.push(record.moves[ply]), true, `${record.id}: legal move at ${ply}`); plies++;
        }
        assert.equal(board.fen(), record.finalFen); assert.deepEqual(board.outcome(), { result: record.result, reason: record.reason });
      } finally { board.dispose(); }
    }
    const rows = summary.comparisons.flatMap(comparison => {
      const meta = campaign.metadata.find(meta => meta.comparisonId === comparison.comparisonId);
      return comparison.openingClusters.map(opening => ({ openingId: opening.openingId, layout: meta.layout,
        compensationCp: meta.compensationCp, score: opening.score }));
    });
    const estimate = estimateMaterial(rows);
    const reportSection = phase === 'control'
      ? report.split('## Queen-versus-rook odds control')[1].split('## Amazon-over-queen compensation')[0]
      : report.split('## Amazon-over-queen compensation')[1];
    assert.ok(reportSection.includes(`${records.length}/${records.length} scheduled games finalized; ${records.length} scored paired games`));
    for (const [index, point] of estimate.rawCurve.entries()) {
      const left = estimate.layouts.find(layout => layout.layout === 'left').rawCurve[index].score;
      const right = estimate.layouts.find(layout => layout.layout === 'right').rawCurve[index].score;
      const percent = score => `${(100 * score).toFixed(1)}%`;
      assert.ok(reportSection.includes(`| ${point.compensationCp} | ${percent(point.score)} | ${percent(left)} | ${percent(right)} | ${percent(estimate.fittedCurve[index].score)} |`));
    }
    if (phase === 'control') assert.ok(reportSection.includes('Above the tested 500 material cp boundary'));
    else assert.ok(reportSection.includes(`interpolated crossing about ${Math.round(estimate.estimate.pointCp / 10) * 10} cp`));
    phases[phase] = { runId: uploaded.runId, runIdSource: 'Uploaded summary; journal records have no run ID.',
      stage: stageId, games: records.length, completePairs: summary.comparisons.reduce((sum, comparison) => sum + comparison.paired.completePairs, 0),
      replayedPlies: plies, statusCounts: summary.statusCounts,
      checks: { exactSummaryRegeneration: true, exactStageScheduleAndAnnotations: true, startingArmiesAndForcedPrefixes: true,
        legalMovesAndSAN: true, finalFENAndTerminalOutcomes: true, noMovesAfterTermination: true, uploadedReportMathematics: true },
      estimate,
      comparisons: summary.comparisons.map(comparison => ({ comparisonId: comparison.comparisonId,
        games: comparison.paired.games, wins: comparison.paired.wins, draws: comparison.paired.draws, losses: comparison.paired.losses,
        score: comparison.primaryEstimate.score, reasons: comparison.reasons,
        aColorScores: Object.fromEntries(['w', 'b'].map(color => {
          const games = records.filter(record => record.comparisonId === comparison.comparisonId && record.aColor === color);
          return [color, games.reduce((sum, record) => sum + gameScore(record), 0) / games.length];
        })) })) };
  }
  return { schemaVersion: 1, format: 'levelup-material-pilot-results-audit', recordedDate: '2026-10-23',
    inputs: files, completedGames: 320, completePairs: 160,
    replayedPlies: phases.control.replayedPlies + phases.amazon.replayedPlies,
    originalScheduledGames: 512, unusedGames: 192,
    identity: { variant: campaign.profile.variant, profileHash: campaign.profile.hash, registryHash: campaign.registry.hash,
      protocolRevision: '5ccc720', expectedEngine: campaign.config.engine,
      actualBinaryAndSourceVerified: false, parentAndPolicyManifestsAvailable: false, recordedReferenceDiagnosticAvailable: false },
    phases,
    decision: { status: 'Close the pilot at the supplied 320 games; retain the remaining 192 games unused.',
      conventionalMaterialCalibration: 'not established', calibratedAmazonMaterialValue: 'unmeasured',
      interpretation: 'The observed queen-versus-rook odds curve does not bracket compensation in the tested 2–5-pawn range. The Amazon crossing is nominal pawn-removal compensation in these setups, not calibrated centipawns.' },
    limits: [
      'No parent or child run manifests were supplied. Expected record annotations match, but executable/source identities, worker layout and actual native reference diagnostics are unverified.',
      'The control is a missing-rook versus missing-queen material-odds proxy, not a literal queen-to-rook replacement.',
      'Removing many flank pawns changes development, files, king cover, pawn structure and promotion chances. Two layouts do not eliminate those contextual effects.',
      'The control does not establish that its compensation is intrinsically greater than five pawns or isolate whether engine evaluation or setup effects caused the discrepancy.',
      'The Amazon sample contains four fixed related opening blocks; its approximate 458.33 nominal-cp crossing has no bootstrap stability band and is not an intrinsic material value.',
      'Pooled curves have no reversal; the Amazon right-layout raw curve rises from 68.75% at three removed pawns to 81.25% at four. That remains visible in per-layout data.',
      'Replay validates recorded chess behavior and arithmetic, not process execution or best-play quality. No searches or new games are performed.' ] };
}

if (require.main === module) {
  if (process.argv.length > 3) { console.error('Usage: node material-pilot-001.audit.cjs [RESULTS_DIRECTORY]'); process.exitCode = 1; }
  else audit(process.argv[2]).then(result => process.stdout.write(JSON.stringify(result, null, 2) + '\n'))
    .catch(error => { console.error(error); process.exitCode = 1; });
}
module.exports = { audit };
