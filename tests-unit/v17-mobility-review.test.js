const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFocusEvidence } = require('../scripts/balance/v17-focus-evidence');
const { loadFollowupEvidence } = require('../scripts/balance/v17-followup-evidence');
const { loadMobilityEvidence } = require('../scripts/balance/v17-mobility-evidence');
const { loadMobilityBatchEvidence } = require('../scripts/balance/v17-mobility-batch-evidence');
const {
  combineMobilityOutcomes, buildMobilityReview, renderMobilityReview, renderMobilityMatrix, main,
} = require('../scripts/balance/v17-mobility-review');

function sources() {
  return {
    confirm: loadMobilityBatchEvidence('mobility-confirm'),
    revisions: loadMobilityBatchEvidence('mobility-revisions'),
    additions: loadMobilityEvidence(), focus: loadFocusEvidence(),
    baseline: loadFollowupEvidence('pawn-grants-revisions'),
  };
}

test('historical reuse selects only compatible games and preserves every original identity', () => {
  const inputs = sources();
  const projection = combineMobilityOutcomes(inputs);
  assert.equal(projection.records.length, 3136);
  assert.equal(projection.historicalGamesReused, 768);
  assert.equal(projection.mobilityScheduledGames, 2368);
  assert.equal(new Set(projection.records.map(record => record.id)).size, 3136);
  assert.equal(new Set(projection.records.map(record => JSON.stringify([
    record.comparisonId, record.openingId, record.repetition, record.aColor,
  ]))).size, 3136);
  const historicalBaseline = projection.sourceGroups.find(source => source.key === 'pawn-grants-revisions');
  assert.equal(historicalBaseline.analysis.records.length, 384);
  assert.equal(historicalBaseline.selected.length, 128);
  assert.equal(new Set(historicalBaseline.selected.map(record => record.comparisonId)).size, 4);
  for (const source of projection.sourceGroups) for (const record of source.selected) {
    assert.strictEqual(projection.records.find(item => item.id === record.id), record);
    assert.ok(source.analysis.records.includes(record));
    assert.equal(record.profileHash, source.analysis.profile.hash);
    assert.equal(record.registryHash, source.analysis.profile.registryHash);
  }
});

test('changed armies, search budgets, mappings, profiles or copied games cannot enter a projection', () => {
  const inputs = sources();
  const budget = { ...inputs.focus, config: { ...inputs.focus.config,
    engine: { ...inputs.focus.config.engine, nodes: 1000 } } };
  assert.throws(() => combineMobilityOutcomes({ ...inputs, focus: budget }), /source declaration changed/);
  const comparisons = inputs.baseline.config.comparisons.map((comparison, index) => index ? comparison
    : { ...comparison, armyA: { ...comparison.armyA, upgrades: {} } });
  assert.throws(() => combineMobilityOutcomes({ ...inputs, baseline: { ...inputs.baseline,
    config: { ...inputs.baseline.config, comparisons } } }), /source declaration changed/);
  assert.throws(() => combineMobilityOutcomes({ ...inputs, additions: { ...inputs.additions,
    metadata: { ...inputs.additions.metadata, rows: inputs.additions.metadata.rows.slice(1) } } }), /mapping changed/);
  assert.throws(() => combineMobilityOutcomes({ ...inputs, confirm: { ...inputs.confirm,
    profile: { ...inputs.confirm.profile, hash: 'foreign' } } }), /source profile or immutable design meaning changed/);
  const copied = [...inputs.revisions.records]; copied[1] = copied[0];
  assert.throws(() => combineMobilityOutcomes({ ...inputs,
    revisions: { ...inputs.revisions, records: copied } }), /repeats a game identity/);
});

test('all ten purchase rows keep reference and baseline scores separate at equal budgets', () => {
  const audit = buildMobilityReview();
  const rows = Object.fromEntries(audit.rows.map(row => [row.key, row]));
  for (const [key, score, baseline] of [
    ['two-step-pawns', 0.509765625, null], ['king-step-pawns', 120 / 248, 0.515625],
    ['full-diagonal-pawns', 0.38671875, 0.5703125], ['support-pawns', 0.28515625, 0.25],
    ['mobile-forward-grants', 0.44921875, 36.5 / 60], ['scout-grants', 0.453125, 30 / 62],
    ['capture-forward-grants', 0.416015625, 0.703125], ['long-forward-grants', 0.623046875, 0.703125],
    ['pawn-like-grants', 0.61328125, 48.5 / 62], ['grid-bishop', 0.60546875, 0.7265625],
  ]) {
    assert.equal(rows[key].score, score);
    assert.equal(rows[key].baseline.score, baseline);
    assert.equal(rows[key].purchasePoints, 3);
    assert.equal(rows[key].opponents.length, 4);
    assert.ok(rows[key].opponents.every(opponent => opponent.key !== 'two-step-pawns'));
  }
  assert.equal(rows['two-step-pawns'].baseline.games, 0);
  assert.equal(rows['pawn-like-grants'].baseline.games, 62);
  assert.equal(rows['mobile-forward-grants'].baseline.games, 60);
});

test('changed outcomes cannot retain the archived journal receipt', () => {
  const inputs = sources();
  const records = [...inputs.confirm.records];
  const index = records.findIndex(record => record.reason === 'checkmate');
  records[index] = { ...records[index], result: records[index].result === '1-0' ? '0-1' : '1-0' };
  assert.throws(() => combineMobilityOutcomes({ ...inputs,
    confirm: { ...inputs.confirm, records } }), /Loaded outcomes no longer match the exact source journal hash/);
  assert.throws(() => combineMobilityOutcomes({ ...inputs, confirm: { ...inputs.confirm,
    source: { ...inputs.confirm.source, sha256: 'foreign' } } }), /receipt|descriptor|source/i);
});

test('king-step averages and physical colors use shared cases while full cells retain other scored pairs', () => {
  const audit = buildMobilityReview();
  const king = audit.rows.find(row => row.key === 'king-step-pawns');
  assert.equal(king.games, 248);
  assert.equal(king.openingCoverage.shared, 31);
  assert.deepEqual([king.wins, king.draws, king.losses], [103, 34, 111]);
  assert.ok(king.opponents.every(opponent => opponent.games === 62));
  assert.deepEqual(king.referenceCells.map(cell => cell.pairedGames), [64, 62, 64, 64]);
  assert.deepEqual(king.physicalColors.map(color => [color.key, color.games, color.score]),
    [['w', 124, 64 / 124], ['b', 124, 56 / 124]]);
  assert.equal(king.cohorts['original-sixteen'].sharedCases, 15);
  assert.equal(king.cohorts['original-sixteen'].games, 120);
  assert.equal(king.cohorts['new-sixteen'].sharedCases, 16);
  assert.ok(audit.rows.filter(row => row !== king).every(row => row.games === 256 && row.openingCoverage.shared === 32));
});

test('the baseline stability and repeated grant counter patterns remain visible by cohort', () => {
  const rows = Object.fromEntries(buildMobilityReview().rows.map(row => [row.key, row]));
  assert.equal(rows['two-step-pawns'].cohorts['original-sixteen'].score, 0.50390625);
  assert.equal(rows['two-step-pawns'].cohorts['new-sixteen'].score, 0.515625);
  assert.equal(rows['mobile-forward-grants'].cohorts['original-sixteen'].score, 0.43359375);
  assert.equal(rows['mobile-forward-grants'].cohorts['new-sixteen'].score, 0.46484375);
  assert.ok(Object.values(rows['long-forward-grants'].cohorts).every(cohort => cohort.baselineScore > 0.65));
  assert.ok(Object.values(rows['pawn-like-grants'].cohorts).every(cohort => cohort.baselineScore > 0.65));
  assert.equal(rows['scout-grants'].referenceCells.find(cell => cell.columnKey === 'cruisader').score, 0.2890625);
});

test('counts distinguish the completed mobility batch, historical reuse and unscored source games', () => {
  const audit = buildMobilityReview();
  assert.deepEqual(audit.counts, {
    scheduledGames: 3136, finalizedGames: 3136, completedGames: 3131, truncatedGames: 5,
    pairedGames: 3126, completePairs: 1563, errors: 0, historicalGamesReused: 768,
    mobilityScheduledGames: 2368, mobilityCompletedGames: 2363, newMatchGames: 0, engineSearches: 0,
  });
  assert.equal(audit.truncations.length, 5);
  assert.ok(audit.truncations.every(record => record.totalPlies === 400 && record.excludedCompletedPartner.id !== record.id));
  assert.equal(audit.provenance.originalManifestsSupplied, false);
  assert.equal(audit.provenance.nativePreflightSupplied, false);
  assert.equal(audit.provenance.engineSha256, null);
  assert.equal(audit.provenance.legalMovesIndependentlyReplayed, false);
});

test('combined artifacts reproduce offline without freezing candidates or scheduling further matches', () => {
  const audit = buildMobilityReview();
  const report = renderMobilityReview(audit);
  assert.match(report, /No new full campaign is necessary before playtesting/);
  assert.match(report, /31 shared cases and 248 games/);
  assert.match(report, /not a new runnable manifest/);
  assert.match(report, /Original run manifests and native preflight proofs were not supplied/);
  const csv = renderMobilityMatrix(audit);
  assert.equal(csv.trimEnd().split(/\r?\n/).length, 11);
  assert.match(csv, /shared_reference_cases/);
  assert.match(csv, /two_step_games/);
  assert.doesNotThrow(() => main([]));
  assert.throws(() => main(['--unknown']), /Use no arguments or --write/);
});
