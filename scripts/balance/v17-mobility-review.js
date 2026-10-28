'use strict';

// Outcome projection only. Every journal is validated under its original
// declaration/profile before selecting compatible rows. No history is relabelled
// with another registry, and this projection is not a runnable run manifest.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { loadExperiment } = require('./v17-plan');
const { createV17Report } = require('./v17-report');
const { analyzeScreenRecords } = require('./v17-screen-evidence');
const { loadFocusEvidence, SOURCES: FOCUS_SOURCES } = require('./v17-focus-evidence');
const { loadFollowupEvidence, analyzeFollowupRecords, SOURCES: FOLLOWUP_SOURCES } = require('./v17-followup-evidence');
const { loadMobilityEvidence, analyzeMobilityRecords, SOURCES: ADDITION_SOURCES } = require('./v17-mobility-evidence');
const { loadMobilityBatchEvidence, analyzeMobilityBatchRecords, SOURCES: BATCH_SOURCES } = require('./v17-mobility-batch-evidence');
const { OLD_OPENINGS, NEW_OPENINGS, ALL_OPENINGS } = require('./v17-mobility-plan');
const { getDesign } = require('../../src/design-catalog');

const ROOT = path.resolve(__dirname, '../../experiments/balance/results');
const PREFIX = 'v17-mobility-001';
const REFERENCES = ['vanguard', 'unicorn', 'cruisader', 'amazon'];
const ROW_ORDER = ['two-step-pawns', 'king-step-pawns', 'full-diagonal-pawns', 'support-pawns',
  'mobile-forward-grants', 'scout-grants', 'capture-forward-grants', 'long-forward-grants',
  'pawn-like-grants', 'grid-bishop'];
const PINNED_SOURCES = {
  'design-focus': FOCUS_SOURCES,
  'pawn-grants-revisions': FOLLOWUP_SOURCES['pawn-grants-revisions'],
  'mobility-additions': ADDITION_SOURCES,
  ...BATCH_SOURCES,
};
const sha = value => createHash('sha256').update(value).digest('hex');
const scoreForA = record => record.result === '1/2-1/2' ? 0.5 : Number((record.result === '1-0') === (record.aColor === 'w'));
const mean = values => values.reduce((total, value) => total + value, 0) / values.length;
const percent = value => value === null ? '—' : `${(100 * value).toFixed(2)}%`;
const md = value => String(value).replace(/[\r\n]/g, ' ').replace(/\|/g, '\\|');
const csv = value => /[",\r\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value);

function semanticDesign(definition) {
  return { id: definition.id, family: definition.family, revision: definition.revision,
    level: definition.level, movement: definition.movement, placement: definition.placement, roles: definition.roles };
}

function validateSource(source, experiment, analyze) {
  assert.equal(source.experiment, experiment, 'A source has the wrong experiment identity.');
  const canonical = loadExperiment(experiment);
  assert.deepEqual(source.config, canonical.config, 'A source declaration changed; do not pool altered armies or settings.');
  assert.deepEqual(source.metadata, canonical.metadata, 'A source row/opponent mapping changed.');
  const checked = analyze(source.records);
  assert.deepEqual(source.profile, checked.profile, 'A source profile or immutable design meaning changed.');
  assert.deepEqual(source.source, PINNED_SOURCES[experiment], 'An original source receipt changed.');
  // These five pinned uploads use compact JSONL with a final LF. Retain this
  // extra identity check for callers injecting loaded objects: a context-valid
  // outcome change must not inherit an unchanged source-byte receipt.
  const journal = source.source.journal || source.source;
  const serialized = Buffer.from(source.records.map(record => JSON.stringify(record)).join('\n') + '\n');
  assert.equal(serialized.length, journal.bytes, 'Loaded records no longer match the exact source journal bytes.');
  assert.equal(sha(serialized), journal.sha256, 'Loaded outcomes no longer match the exact source journal hash.');
  return { ...source, ...checked, declaration: { ...checked.declaration,
    reportReproducedExactly: Boolean(source.declaration.reportReproducedExactly) } };
}

function armyDesigns(army) {
  return [...new Set([...Object.values(army.upgrades), ...army.reserve.map(item => item.id)])];
}

function comparePurchase(oldComparison, currentComparison) {
  assert.ok(currentComparison, 'A historical comparison is absent from the confirmation declaration.');
  for (const field of ['armyA', 'armyB', 'strengthA', 'strengthB']) {
    assert.deepEqual(oldComparison[field], currentComparison[field], 'Historical reuse changed an army, placement, cost or strength.');
  }
}

/** Accept injectable loaded sources so callers can verify incompatible reuse
 * fails before creating a projection. Raw record and pair IDs are retained. */
function combineMobilityOutcomes({
  confirm = loadMobilityBatchEvidence('mobility-confirm'),
  revisions = loadMobilityBatchEvidence('mobility-revisions'),
  additions = loadMobilityEvidence(),
  focus = loadFocusEvidence(),
  baseline = loadFollowupEvidence('pawn-grants-revisions'),
} = {}) {
  confirm = validateSource(confirm, 'mobility-confirm', records => analyzeMobilityBatchRecords('mobility-confirm', records));
  revisions = validateSource(revisions, 'mobility-revisions', records => analyzeMobilityBatchRecords('mobility-revisions', records));
  additions = validateSource(additions, 'mobility-additions', analyzeMobilityRecords);
  focus = validateSource(focus, 'design-focus', records => analyzeScreenRecords('design-focus', records));
  baseline = validateSource(baseline, 'pawn-grants-revisions', records => analyzeFollowupRecords('pawn-grants-revisions', records));
  assert.deepEqual(focus.config.openings, OLD_OPENINGS, 'Focused historical cases changed.');
  assert.deepEqual(baseline.config.openings, OLD_OPENINGS, 'Historical baseline cases changed.');
  assert.deepEqual(confirm.config.openings, NEW_OPENINGS, 'Confirmation cases changed.');
  assert.deepEqual(revisions.config.openings, ALL_OPENINGS, 'Revision cases changed.');
  assert.deepEqual(additions.config.openings, ALL_OPENINGS, 'Addition cases changed.');
  assert.equal(new Set(ALL_OPENINGS.map(item => item.id)).size, 32, 'Opening IDs overlap.');
  assert.equal(new Set(ALL_OPENINGS.map(item => JSON.stringify(item.moves))).size, 32, 'Opening move prefixes overlap.');

  const canonicalComparisons = new Map(confirm.config.comparisons.map(item => [item.id, item]));
  for (const comparison of focus.config.comparisons) comparePurchase(comparison, canonicalComparisons.get(comparison.id));
  const baselineIds = new Set(baseline.metadata.comparisons.filter(item => item.aKey === 'two-step-pawns'
    && REFERENCES.includes(item.bKey)).map(item => item.id));
  assert.equal(baselineIds.size, 4, 'Historical baseline must select exactly the four reference comparisons.');
  for (const comparison of baseline.config.comparisons.filter(item => baselineIds.has(item.id))) {
    comparePurchase(comparison, canonicalComparisons.get(comparison.id));
  }
  const semanticRegistry = new Map();
  for (const source of [focus, baseline, confirm, revisions, additions]) {
    for (const field of ['engine', 'evaluation', 'repetitions']) {
      assert.deepEqual(source.config[field], confirm.config[field], 'Historical search or evaluation context changed.');
    }
    for (const definition of source.profile.registry.definitions) {
      const semantic = semanticDesign(definition);
      assert.deepEqual(semantic, semanticDesign(getDesign(definition.id)), 'An immutable design ID changed its semantics or price.');
      if (semanticRegistry.has(definition.id)) assert.deepEqual(semanticRegistry.get(definition.id), semantic,
        'An ID has different movement, price or placement between sources.');
      semanticRegistry.set(definition.id, semantic);
    }
  }

  const sourceGroups = [
    { key: 'design-focus', analysis: focus, selected: focus.records, historical: true },
    { key: 'pawn-grants-revisions', analysis: baseline,
      selected: baseline.records.filter(record => baselineIds.has(record.comparisonId)), historical: true },
    { key: 'mobility-confirm', analysis: confirm, selected: confirm.records, historical: false },
    { key: 'mobility-revisions', analysis: revisions, selected: revisions.records, historical: false },
    { key: 'mobility-additions', analysis: additions, selected: additions.records, historical: false },
  ];
  assert.equal(sourceGroups[1].selected.length, 128, 'Historical baseline selection changed.');
  const records = sourceGroups.flatMap(source => source.selected);
  assert.equal(records.length, 3136, 'The projection must preserve the declared source-game count.');
  assert.equal(new Set(records.map(record => record.id)).size, records.length, 'A source game appears twice.');
  assert.equal(new Set(records.map(record => JSON.stringify([record.comparisonId, record.openingId,
    record.repetition, record.aColor]))).size, records.length, 'A semantic comparison/opening/color cell appears twice.');
  const configurations = [confirm, revisions, additions];
  const comparisons = configurations.flatMap(source => source.config.comparisons);
  const metadataComparisons = configurations.flatMap(source => source.metadata.comparisons);
  assert.equal(new Set(comparisons.map(item => item.id)).size, 49, 'Projected comparisons overlap.');
  const allRows = new Map(configurations.flatMap(source => source.metadata.rows).map(row => [row.key, row]));
  assert.equal(allRows.size, ROW_ORDER.length, 'Unexpected candidate row coverage.');
  const config = { ...confirm.config, name: 'Version 17: mobility results across thirty-two opening cases',
    openings: ALL_OPENINGS, comparisons };
  const metadata = { ...confirm.metadata, kind: 'mobility-thirty-two-outcome-projection',
    question: 'Compare immutable purchase designs using completed color pairs, keeping direct pawn-baseline results separate from the frozen reference panel.',
    rows: ROW_ORDER.map(key => allRows.get(key)), comparisons: metadataComparisons };
  const experiment = 'mobility-thirty-two-outcome-projection';
  const report = createV17Report({ experiment, config, metadata, records });
  assert.equal(report.progress.finalizedGames, 3136);
  assert.equal(report.progress.completedGames, 3131);
  assert.equal(report.progress.pairedGames, 3126);
  assert.equal(report.progress.completePairs, 1563);
  return { experiment, config, metadata, records, report, sourceGroups, semanticRegistry,
    historicalGamesReused: 768, mobilityScheduledGames: 2368 };
}

function compactRows(projection) {
  const { config, metadata, records, report } = projection;
  const cohorts = Object.fromEntries([['original-sixteen', OLD_OPENINGS], ['new-sixteen', NEW_OPENINGS]].map(([key, openings]) => {
    const ids = new Set(openings.map(item => item.id));
    return [key, createV17Report({ ...projection, config: { ...config, openings },
      records: records.filter(record => ids.has(record.openingId)) })];
  }));
  const byComparison = new Map(config.comparisons.map(item => [item.id, item]));
  return report.overall.rows.map(row => {
    const selectedComparisons = metadata.comparisons.filter(item => item.aKey === row.key);
    const referenceIds = new Set(selectedComparisons.filter(item => REFERENCES.includes(item.bKey)).map(item => item.id));
    const first = byComparison.get(selectedComparisons[0].id), designs = armyDesigns(first.armyA);
    const purchasePoints = Object.values(first.armyA.upgrades).reduce((sum, id) => sum + getDesign(id).level, 0)
      + first.armyA.reserve.reduce((sum, item) => sum + item.count * getDesign(item.id).level, 0);
    assert.equal(purchasePoints, 3, 'Projected purchase budgets differ.');
    const shared = new Set(row.openingCoverage.openingIds);
    const referenceRecords = records.filter(record => referenceIds.has(record.comparisonId) && shared.has(record.openingId));
    assert.equal(referenceRecords.length, row.games, 'Physical-color summary must use the same shared reference cases as Overall.');
    assert.ok(referenceRecords.every(record => record.status === 'completed'));
    const matrix = report.matrix.rows.find(item => item.key === row.key);
    const cell = matrix.cells.find(item => item.columnKey === 'two-step-pawns');
    return { key: row.key, label: row.label, designIds: designs,
      movements: designs.map(id => getDesign(id).movement), purchasePoints,
      score: row.score, games: row.games, wins: row.wins, draws: row.draws, losses: row.losses,
      openingCoverage: row.openingCoverage, opponents: row.opponents,
      referenceCells: matrix.cells.filter(item => REFERENCES.includes(item.columnKey)),
      baseline: { games: cell.pairedGames, completePairs: cell.completePairs, openings: cell.openings,
        wins: cell.wins, draws: cell.draws, losses: cell.losses, score: cell.score },
      physicalColors: ['w', 'b'].map(color => {
        const selected = referenceRecords.filter(record => record.aColor === color);
        return { key: color, games: selected.length, score: mean(selected.map(scoreForA)) };
      }),
      cohorts: Object.fromEntries(Object.entries(cohorts).map(([key, result]) => {
        const overall = result.overall.rows.find(item => item.key === row.key);
        const baseline = result.matrix.rows.find(item => item.key === row.key).cells.find(item => item.columnKey === 'two-step-pawns');
        return [key, { score: overall.score, games: overall.games, sharedCases: overall.openingCoverage.shared,
          opponents: overall.opponents, baselineScore: baseline.score, baselineGames: baseline.pairedGames }];
      })) };
  });
}

function buildMobilityReview(sources) {
  const projection = combineMobilityOutcomes(sources), { report, records, sourceGroups } = projection;
  const recordSource = new Map(sourceGroups.flatMap(source => source.selected.map(record => [record.id, source.key])));
  const truncations = records.filter(record => record.status === 'truncated').map(record => {
    const partner = records.find(item => item.pairId === record.pairId && item.id !== record.id);
    assert.ok(partner && partner.status === 'completed');
    return { source: recordSource.get(record.id), id: record.id, pairId: record.pairId, comparisonId: record.comparisonId,
      openingId: record.openingId, aColor: record.aColor, reason: record.reason, totalPlies: record.totalPlies,
      finalFen: record.finalFen, excludedCompletedPartner: { id: partner.id, aColor: partner.aColor,
        result: partner.result, totalPlies: partner.totalPlies } };
  });
  return { schemaVersion: 1, format: 'levelup-v17-mobility-combined-evidence', recordedDate: '2026-10-28',
    provenance: { originalManifestsSupplied: false, nativePreflightSupplied: false, engineSha256: null,
      legalMovesIndependentlyReplayed: false, descriptorKind: 'compatible outcome projection, not a runnable or original run manifest',
      limitations: [
        'Each exact journal is validated under its original declaration, schedule, registry and profile before semantic outcome selection; raw record and pair identities remain unchanged.',
        'Original manifests and native preflight proofs were not supplied; reconstructed declarations do not attest to original engine binaries or native value tables.',
        'No independent move replay, terminal-position certification, material fit, individual-piece Elo or population confidence interval is claimed.',
        'The thirty-two fixed short prefixes remain related descriptive test cases. A target band is a design criterion, not demonstrated balance equivalence.',
      ] },
    method: { overall: 'Equal frozen-reference means over shared fully completed cases across all four references; draws count half a point.',
      cells: 'Each individual matchup retains all its complete color pairs, even when another opponent lacks that case.',
      baseline: 'Three two-step pawns are a separate equal-cost matchup, excluded from reference Overall; there is no baseline self matchup.',
      colors: 'Physical White/Black summaries use exactly the same shared reference cases and game count as Overall.',
      historicalReuse: '640 design-focus games plus 128 two-step-pawn reference games; no changed candidate reuses predecessor outcomes.' },
    counts: { scheduledGames: report.scheduledGames, finalizedGames: report.progress.finalizedGames,
      completedGames: report.progress.completedGames, truncatedGames: truncations.length, pairedGames: report.progress.pairedGames,
      completePairs: report.progress.completePairs, errors: 0, historicalGamesReused: projection.historicalGamesReused,
      mobilityScheduledGames: projection.mobilityScheduledGames, mobilityCompletedGames: 2363,
      newMatchGames: 0, engineSearches: 0 },
    sources: sourceGroups.map(source => ({ experiment: source.key, source: source.analysis.source,
      declaration: source.analysis.declaration, originalProfileHash: source.analysis.profile.hash,
      originalRegistryHash: source.analysis.profile.registryHash,
      inputGames: source.analysis.records.length, selectedGames: source.selected.length, historical: source.historical,
      selectedComparisonIds: [...new Set(source.selected.map(record => record.comparisonId))].sort(),
      selectedRecordIdsSha256: sha(JSON.stringify(source.selected.map(record => record.id))),
      selectedPairIdsSha256: sha(JSON.stringify(source.selected.map(record => record.pairId))) })),
    rows: compactRows(projection), truncations };
}

function renderMobilityReview(audit) {
  const lines = ['# Version-17 mobility results: complete review', '',
    '**The planned mobility batch has finalized all 2,368 games: 2,363 completed, five unscored 400-ply truncations and no errors.** The latest two journals supply 1,724 completions and four truncations; the prior Support/Scout supplement supplies 639 completions and one truncation.', '',
    'The combined comparison reuses 640 unchanged design-focus games and 128 historical two-step-pawn reference games. Across those 3,136 distinct source-games, 3,131 completed and 3,126 belong to complete color pairs. Five completed partners remain archived but excluded from paired scores. No new matches were played to create this review.', '',
    'Every row spends three upgrade points: one Grid bishop, three upgraded pawns, or three finite nonroyal reserve grants. Scores count draws as half a point. Reference Overall weights Vanguard, Unicorn, Cruisader and Amazon equally; the pawn baseline stays separate.', '',
    '| Purchase | Movement | Reference Overall | Reference W / D / L | Included games / shared cases | Two-step pawn baseline (games) |',
    '| --- | --- | ---: | :--- | ---: | ---: |'];
  for (const row of audit.rows) lines.push(`| ${md(row.label)} | \`${row.movements.join(', ')}\` | ${percent(row.score)} | ${row.wins} / ${row.draws} / ${row.losses} | ${row.games} / ${row.openingCoverage.shared} | ${row.baseline.score === null ? '—' : `${percent(row.baseline.score)} (${row.baseline.games})`} |`);
  lines.push('', '## Individual reference matchups', '',
    'Each cell shows the row purchase’s score and scored game count. These cells retain all available complete pairs; Overall uses only cases complete against every reference.', '',
    '| Purchase | Vanguard | Unicorn | Cruisader | Amazon |',
    '| --- | ---: | ---: | ---: | ---: |');
  for (const row of audit.rows) lines.push(`| ${md(row.label)} | ${row.referenceCells.map(cell => `${percent(cell.score)} (${cell.pairedGames})`).join(' | ')} |`);
  lines.push('', '**King-step pawn coverage:** one Unicorn game reached the move limit. Its overall therefore uses 31 shared cases and 248 games; the other three opponent cells still retain 64 games each. Averaging the four displayed cells would use different cases. The audit retains both the full cells and the shared-case opponent scores.', '',
    '## Opening cohorts and colors', '',
    '| Purchase | References: original / new sixteen | Two-step pawns: original / new sixteen | Reference White / Black |',
    '| --- | ---: | ---: | ---: |');
  for (const row of audit.rows) {
    const old = row.cohorts['original-sixteen'], fresh = row.cohorts['new-sixteen'];
    lines.push(`| ${md(row.label)} | ${percent(old.score)} / ${percent(fresh.score)} | ${percent(old.baselineScore)} / ${percent(fresh.baselineScore)} | ${row.physicalColors.map(color => percent(color.score)).join(' / ')} |`);
  }
  lines.push('', 'The King-step pawn’s original cohort has 15 shared reference cases; its new cohort has 16. Baseline cohorts also retain only complete pairs: pawn-like grants have 16 / 15 pairs, mobile-forward grants 15 / 15, and Scout grants 15 / 16. Other populated baseline cells have 16 / 16. Colors use exactly the Overall cases rather than count an unpaired completion.', '',
    '## Level-1 reference shortlist', '',
    'The clearest provisional level-1 anchors are the **two-step pawn** and **King-step pawn**: their reference averages are close to 50%, their direct equal-cost matchup is close to even, and their movements are simple. For a reserve reference, **mobile-forward grant** is the more uniform candidate across the four references; **Scout** offers a different retreating identity with a pronounced Cruisader weakness. These are a playtest shortlist, not frozen new references. Test human readability and counterplay before choosing the permanent baseline roster.', '',
    '## Bounded design decisions', '',
    '- **Keep the two-step pawn as the level-1 baseline.** It scores 50.98% across references and remains stable between old and new cohorts (50.39% / 51.56%).',
    '- **Playtest the one-point King-step pawn** `mWFifmnD`: 48.39% across shared reference cases and 51.56% versus two-step pawns. Prefer it to further unchanged tests of full-diagonal pawns (38.67%) or Support pawns (28.52%). Its movement was previously available under a separate two-point King-pawn identity; this one-point trial does not rewrite that price.',
    '- **Mobile-forward grant** `fWmfF` is the most uniform current grant trial: 44.92% overall, with every reference cell between 41.41% and 48.44%. **Scout** `fWbmF` remains another one-point playtest option at 45.31%, with a repeated Cruisader weakness (28.91%). Human readability and counterplay can choose between these identities before another campaign.',
    '- **Capture-forward grants** `cfWmfF` score only 41.60% across references but 70.31% against two-step pawns. Adding the quiet forward step in the mobile design changes this matchup pattern; these finite engine games do not establish that the extra legal move intrinsically weakens a piece.',
    '- **Long-forward and pawn-like grants remain on the strong side at one point:** 62.30% / 61.33% against references and 70.31% / 78.23% against two-step pawns. Park or restrict these alternatives pending human playtesting; do not automatically reprice them from a single pooled percentage.',
    '- **Grid bishop** `BDC` stays at level 3 provisionally: 60.55% overall and 58.59% / 62.50% by cohort. This is slightly above the working 40–60% target, not a reason to downgrade it to level 2 or require another large unchanged campaign.', '',
    'No new full campaign is necessary before playtesting these finalists. Keep strong/weak alternatives in the immutable research catalog, preserve specific opponent flags, and schedule a later bounded test only if it could change a concrete design decision. Direct equal-cost purchase results matter alongside the reference panel; equal panel scores do not require every pair to score 50%.', '',
    '## Unscored games', '',
    '| Source | Unscored game | Completed opposite-color partner |',
    '| --- | --- | --- |');
  for (const item of audit.truncations) lines.push(`| ${item.source} | \`${item.id}\` | \`${item.excludedCompletedPartner.id}\` (${item.excludedCompletedPartner.result}) |`);
  lines.push('', 'All five reached the declared 400-ply cap. Preserve them as unscored; no continuation or replacement is required for these decisions. Four affect direct baseline cells, and one affects King-step pawn versus Unicorn.', '',
    '## Provenance and reproduction', '',
    'The two new journals and previous evidence are stored as exact compressed uploads with pinned raw/compressed hashes. Their original schedules, registries, profiles, settings and immutable purchase definitions are checked before pooling compatible outcome rows. Original record/pair identities and letter mappings remain in their source archives; this report is an outcome projection, not a new runnable manifest.', '',
    'Original run manifests and native preflight proofs were not supplied. This review does not attest to the original executable or native value tables, independently replay moves, certify terminal positions, fit material values or calculate individual-piece Elo. The fixed related short prefixes support descriptive screening, not population confidence intervals or demonstrated equivalence.', '',
    '```powershell', 'node scripts/balance/v17-mobility-review.js', '```', '',
    'Use `--write` to regenerate the derived audit JSON, this report and the matrix CSV. No engine searches or new games are started.', '');
  return lines.join('\n');
}

function renderMobilityMatrix(audit) {
  const headings = ['purchase_key', 'purchase', 'movement', 'upgrade_points',
    ...REFERENCES.flatMap(key => [`${key}_score`, `${key}_games`]),
    'reference_overall_score', 'reference_games', 'shared_reference_cases', 'reference_wins', 'reference_draws', 'reference_losses',
    'two_step_score', 'two_step_games', 'original_reference_score', 'new_reference_score'];
  const rows = audit.rows.map(row => [row.key, row.label, row.movements.join(' '), row.purchasePoints,
    ...REFERENCES.flatMap(key => { const cell = row.referenceCells.find(item => item.columnKey === key); return [cell.score, cell.pairedGames]; }),
    row.score, row.games, row.openingCoverage.shared, row.wins, row.draws, row.losses,
    row.baseline.score === null ? '' : row.baseline.score, row.baseline.games,
    row.cohorts['original-sixteen'].score, row.cohorts['new-sixteen'].score]);
  return [headings, ...rows].map(row => row.map(csv).join(',')).join('\n') + '\n';
}

function main(args = process.argv.slice(2)) {
  assert.ok(!args.length || args.length === 1 && args[0] === '--write', 'Use no arguments or --write.');
  const audit = buildMobilityReview();
  for (const [name, content] of [[`${PREFIX}.audit.json`, JSON.stringify(audit, null, 2) + '\n'],
    [`${PREFIX}.report.md`, renderMobilityReview(audit)], [`${PREFIX}.matrix.csv`, renderMobilityMatrix(audit)]]) {
    const file = path.join(ROOT, name);
    if (args.length) fs.writeFileSync(file, content);
    else assert.equal(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), content.replace(/\r\n/g, '\n'), `Derived mobility artifact changed: ${name}.`);
  }
  console.log('Combined mobility review verified: 3,131 completed source-games, five truncations, 768 historical games reused; no new matches.');
  return audit;
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; }
}
module.exports = { REFERENCES, ROW_ORDER, combineMobilityOutcomes, compactRows, buildMobilityReview,
  renderMobilityReview, renderMobilityMatrix, main };
