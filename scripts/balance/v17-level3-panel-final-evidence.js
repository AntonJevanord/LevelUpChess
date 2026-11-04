'use strict';

// Outcome evidence only. The full final journal exceeds the attachment-transfer
// limit. Uploaded material coefficients are preserved, never refitted here.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { createHash } = require('node:crypto');
const insights = require('../panel-insights');
const plan = require('./level3-panel-plan');
const { makeSchedule } = require('./plan');
const { renderColorReport } = require('../analysis/panel-colors');
const { renderExclusionReport } = require('../analysis/panel-exclusions');
const ROOT = path.resolve(__dirname, '../../experiments/balance/results');
const PREFIX = 'v17-level3-panel-004';
const SOURCES = Object.freeze({
  "pairs": {
    "file": "v17-level3-panel-004.paired-outcomes.json.gz",
    "originalName": "paired-outcomes.json",
    "sedimentId": "file_00000000c2e0820a98d74045fac25cc0",
    "bytes": 3187028,
    "sha256": "6b0b72b69896b481daf7fd02b47a040961530fded9dc3c89f264673163b683f8",
    "archivedBytes": 135875,
    "archivedSha256": "ec548c2938fddb7c759796a28bf50c42f30d0100472fce659c8dbaf6b588de8b"
  },
  "material": {
    "file": "v17-level3-panel-004.material-report.md",
    "originalName": "material-report.md",
    "sedimentId": "file_000000009424820aaf08f334474dbfd0",
    "bytes": 5599,
    "sha256": "91b48e19a56c5388dd6b20d1eb68ec773d54754145695cee189f4e06f247583d"
  },
  "panel": {
    "file": "v17-level3-panel-004.uploaded-report.md",
    "originalName": "panel-report.md",
    "sedimentId": "file_00000000f8cc820ab4ddc9b3e49a9d49",
    "bytes": 23951,
    "sha256": "ad115f0cce78e833e4c05f9cc3ca0cf5f1478253282ec0e96a23660e078bc8b4"
  },
  "colors": {
    "file": "v17-level3-panel-004.color-report.md",
    "originalName": "color-report.md",
    "sedimentId": "file_000000003500820a8883cd2514976087",
    "bytes": 20140,
    "sha256": "b365c9bd1b415cc8e838963ed89c40efac3abd0888425e8c957e60a49b8bec3d"
  },
  "exclusions": {
    "file": "v17-level3-panel-004.exclusion-report.md",
    "originalName": "exclusion-report.md",
    "sedimentId": "file_000000005124820ab87ce01405385fb3",
    "bytes": 9898,
    "sha256": "05fde97c40935b9f63344e21ced283d8e35b28885354beed477fdab5e5e4e88b"
  },
  "filtered": {
    "file": "v17-level3-panel-004.exclusion-filtered-report.md",
    "originalName": "exclusion-report.md",
    "sedimentId": "file_000000006238820abe0a05ce5588c802",
    "bytes": 13600,
    "sha256": "4700643413562f64310f35e17a124ce1a86ff0c169ba69fed4b1310ab17f72c5"
  }
});
const DUPLICATE_COLOR_UPLOAD = Object.freeze({ sedimentId: 'file_000000008d78820ab38c547f628a450a', identicalTo: 'colors' });
const FAILED_JOURNAL = Object.freeze({ sedimentId: 'file_000000001894820a85f2763bc919434b', originalName: 'games.jsonl', reason: 'Attachment exceeds the executor transfer limit of 32 MiB.' });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const percent = value => `${(100 * value).toFixed(2)}%`;
const cells = line => line.slice(1, -1).split('|').map(value => value.trim());
const sum = values => values.reduce((total, value) => total + value, 0);

function loadBundle({ read = file => fs.readFileSync(file) } = {}) {
  const bundle = {};
  for (const [key, source] of Object.entries(SOURCES)) {
    const archived = read(path.join(ROOT, source.file));
    assert.equal(archived.length, source.archivedBytes || source.bytes, `Archived ${key} byte count changed.`);
    assert.equal(sha(archived), source.archivedSha256 || source.sha256, `Archived ${key} checksum changed.`);
    const bytes = key === 'pairs' ? zlib.gunzipSync(archived) : archived;
    assert.equal(bytes.length, source.bytes, `Original ${key} byte count changed.`);
    assert.equal(sha(bytes), source.sha256, `Original ${key} checksum changed.`);
    bundle[key] = key === 'pairs' ? insights.validateCompact(JSON.parse(bytes.toString('utf8'))) : bytes.toString('utf8');
  }
  return bundle;
}

function table(section, header, count) {
  const lines = section.split('\n'), start = lines.findIndex(line => line.startsWith(header));
  assert.ok(start >= 0, `Missing reported table ${header}.`);
  const rows = [];
  for (let index = start + 2; index < lines.length && lines[index].startsWith('| '); index++) rows.push(cells(lines[index]));
  assert.equal(rows.length, count, `Wrong reported row count in ${header}.`);
  return rows;
}
function section(text, nodes, suffix = '') {
  const heading = `## ${nodes.toLocaleString('en-US')} nodes${suffix}`;
  const lines = text.split('\n'), start = lines.indexOf(heading);
  assert.ok(start >= 0, `Missing ${heading}.`);
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n');
}
function wdl(value) {
  assert.match(value, /^\d+ \/ \d+ \/ \d+$/, 'Malformed reported W/D/L.');
  return value.split(' / ').map(Number);
}
function tallyTuple(row) { return [row.wins, row.draws, row.losses]; }
function fixedNumber(value) {
  assert.match(value, /^-?\d+\.\d{2}$/, 'Expected a printed two-decimal estimate.');
  return Number(value);
}

/** Receipts establish recorded compatibility, not independent native attestation. */
function validateDeclaration(payload) {
  insights.validateCompact(payload);
  assert.equal(payload.source.selectedOpenings, 64);
  const declared = plan.buildCampaignPlan();
  assert.equal(payload.source.stages.length, 24, 'Expected all 24 recorded stage receipts.');
  assert.deepEqual(payload.roster.map(row => [row.key, row.id, row.movement, row.family, row.officialReference]),
    declared.roster.map(row => [row.key, row.id, row.movement, row.family, row.officialReference]), 'Recorded roster changed.');
  const byStage = new Map(payload.source.stages.map(row => [row.stageKey, row]));
  assert.equal(byStage.size, 24, 'A stage receipt is duplicated.');
  const byNode = [];
  for (const cohort of payload.cohorts) {
    const selected = declared.stages.filter(row => row.nodes === cohort.nodes);
    assert.deepEqual(cohort.openingIds, selected.flatMap(row => row.openingIds));
    let finalizedGames = 0, scoredPairedGames = 0, ordinaryPairs = 0;
    for (const descriptor of selected) {
      const receipt = byStage.get(descriptor.id);
      assert.ok(receipt, 'Missing recorded stage receipt.');
      assert.equal(receipt.profileHash, descriptor.profileHash);
      assert.equal(receipt.registryHash, descriptor.registryHash);
      assert.equal(receipt.finalizedGames, 880);
      assert.equal(receipt.coverage.finalizedGames, receipt.finalizedGames);
      assert.equal(receipt.coverage.scoredPairedGames, receipt.scoredPairedGames);
      assert.equal(receipt.coverage.finalizedRecordsOutsideScoredPairs, receipt.finalizedGames - receipt.scoredPairedGames);
      const declaration = plan.getBatchDeclaration(descriptor.batchIndex, descriptor.nodes);
      const metadata = new Map(declaration.metadata.comparisons.map(row => [row.id, row]));
      const schedule = new Map(makeSchedule(declaration.config).map(row => [row.id, row]));
      const pairs = cohort.pairs.filter(row => row.stageKey === descriptor.id);
      assert.equal(pairs.length, receipt.coverage.headPairs);
      assert.equal(receipt.scoredPairedGames, 2 * (pairs.length + receipt.coverage.ordinaryPairsExcluded));
      for (const pair of pairs) {
        const comparison = metadata.get(pair.comparisonId);
        assert.equal(comparison?.kind, 'head', 'Unknown head-to-head comparison.');
        assert.deepEqual([pair.aKey, pair.aId, pair.bKey, pair.bId],
          [comparison.aKey, comparison.designA, comparison.bKey, comparison.designB]);
        for (const [id, color] of [[pair.whiteGameId, 'w'], [pair.blackGameId, 'b']]) {
          const game = schedule.get(id);
          assert.ok(game, 'Unknown scheduled game identity.');
          assert.deepEqual([game.aColor, game.openingId, game.comparisonId], [color, pair.openingId, pair.comparisonId]);
        }
      }
      finalizedGames += receipt.finalizedGames;
      scoredPairedGames += receipt.scoredPairedGames;
      ordinaryPairs += receipt.coverage.ordinaryPairsExcluded;
    }
    assert.equal(cohort.pairs.length, sum(selected.map(row => byStage.get(row.id).coverage.headPairs)), 'Unknown stage outcomes were added.');
    byNode.push({ nodes: cohort.nodes, finalizedGames, scoredPairedGames, headPairs: cohort.pairs.length,
      ordinaryPairsExcludedFromCompact: ordinaryPairs, finalizedRecordsOutsideScoredPairs: finalizedGames - scoredPairedGames });
  }
  return byNode;
}

function renderOriginalInsights(report, filtered) {
  return {
    colors: ['# Panel color fairness', '', 'Scores use observed games with both color partners completed. Ordinary-army anchors are excluded. Exclusion scenarios are reported separately.', '',
      ...report.budgets.map(row => renderColorReport(row.colors)), ''].join('\n'),
    exclusions: ['# Panel roster exclusions', '', 'Every scenario reuses observed results. No games, engine searches or material models are rerun.', '',
      ...report.budgets.map(row => renderExclusionReport(row.exclusions)), ''].join('\n'),
    filtered: ['# Panel roster exclusions', '', 'Every scenario reuses observed results. No games, engine searches or material models are rerun.', '',
      ...filtered.budgets.map(row => renderExclusionReport(row.exclusions)), ''].join('\n'),
  };
}

function verifyReports(bundle, receiptCounts) {
  const report = insights.analyze(bundle.pairs), filtered = insights.analyze(bundle.pairs, ['Cataphract', 'Wraith']);
  const rendered = renderOriginalInsights(report, filtered);
  for (const key of ['colors', 'exclusions', 'filtered']) assert.equal(rendered[key], bundle[key], `Uploaded ${key} report differs from compact outcomes.`);
  const progress = bundle.panel.match(/^Finalized games: (\d+)\/(\d+); scored paired games: (\d+)\.$/m);
  assert.ok(progress, 'Missing panel progress.');
  assert.deepEqual(progress.slice(1).map(Number), [21120, 21120, sum(receiptCounts.map(row => row.scoredPairedGames))]);
  const material = [];
  for (const budget of report.budgets) {
    const panelSection = section(bundle.panel, budget.nodes, ' per move');
    const names = new Map(bundle.pairs.roster.map(row => [row.sourceLabel, row.key]));
    const heads = table(panelSection, '| A versus B |', 45);
    for (const row of heads) {
      const [a, b] = row[0].split(' / ').map(name => names.get(name));
      const expected = budget.colors.matchups.find(item => item.aKey === a && item.bKey === b);
      assert.ok(expected, 'Unknown or reversed printed matchup.');
      assert.equal(Number(row[1]), expected.pairedGames);
      assert.deepEqual(wdl(row[2]), tallyTuple(expected.a.overall));
      assert.equal(row[3], percent(expected.aOverallScore));
    }
    const ordinaryAnchorsReported = [];
    for (const row of table(panelSection, '| Upgrade | Overall W / D / L |', 10)) {
      const expected = budget.exclusions.baseline.rows.find(item => item.key === names.get(row[0]));
      assert.ok(expected, 'Unknown printed overall row.');
      assert.deepEqual(wdl(row[1]), tallyTuple(expected));
      assert.equal(row[2], percent(expected.score));
      assert.equal(row[4], percent(expected.physicalColors[0].score));
      assert.equal(row[5], percent(expected.physicalColors[1].score));
      const [wins, draws, losses] = wdl(row[6]), games = wins + draws + losses;
      const score = (wins + draws / 2) / games;
      assert.equal(row[7], percent(score), 'Reported anchor score disagrees with its own W/D/L.');
      ordinaryAnchorsReported.push({ key: expected.key, label: expected.label, games, wins, draws, losses, score });
    }
    assert.equal(sum(ordinaryAnchorsReported.map(row => row.games)),
      2 * receiptCounts.find(row => row.nodes === budget.nodes).ordinaryPairsExcludedFromCompact);
    const materialSection = section(bundle.material, budget.nodes);
    const coverage = materialSection.match(/(\d+) scored paired games; (\d+) sampled games; (\d+) eligible positions; (\d+) opening groups\./);
    assert.ok(coverage, 'Missing reported material coverage.');
    assert.equal(Number(coverage[1]), receiptCounts.find(row => row.nodes === budget.nodes).scoredPairedGames);
    assert.equal(Number(coverage[4]), 64);
    const ordinary = table(materialSection, '| Ordinary piece |', 5).map(row => ({ piece: row[0],
      value: Number(row[1].split(' ')[0]), conditionalRangePrinted: row[2], assumed: row[1].includes('(assumed)') }));
    const upgrades = table(materialSection, '| Upgrade | Baseline bonus |', 10).map(row => {
      const key = names.get(row[0]); assert.ok(key, 'Unknown reported material upgrade.');
      return { key, label: bundle.pairs.roster.find(item => item.key === key).label,
        baselineBonus: fixedNumber(row[1]), headBonus: fixedNumber(row[2]), combinedBonus: fixedNumber(row[3]),
        wholePiece: fixedNumber(row[4]), wholePieceConditionalRangePrinted: row[5] };
    });
    material.push({ nodes: budget.nodes, provenance: 'Uploaded coefficients only; not reproduced from positions.',
      scoredPairedGames: Number(coverage[1]), sampledGames: Number(coverage[2]), eligiblePositions: Number(coverage[3]), openingGroups: 64,
      ordinary, upgrades, ordinaryAnchorsReported,
      fitsReported: table(materialSection, '| Fit | Effective rank |', 6).map(row => ({ kind: row[0], effectiveRank: row[1],
        converged: row[2] === 'true', heldOutBrierPrinted: row[3], support: row[4] })) });
  }
  return { report, filtered, material };
}

function checkHistoricalContinuity(payload) {
  const prior = require('./v17-level3-panel-second-evidence').loadPanelEvidence();
  let retainedPairs = 0;
  for (const stage of prior.stages.filter(row => row.batch < 2)) {
    const archived = insights.projectStage(stage).pairs;
    const current = new Map(payload.cohorts.find(row => row.nodes === stage.nodes).pairs
      .filter(row => row.stageKey === stage.key).map(row => [row.whiteGameId, row]));
    for (const row of archived) assert.deepEqual(current.get(row.whiteGameId), row, 'A prior head-to-head outcome changed or disappeared.');
    retainedPairs += archived.length;
  }
  return { previousSnapshot: 'v17-level3-panel-002', retainedHeadPairs: retainedPairs,
    retainedHeadGames: retainedPairs * 2, scope: 'First sixteen completed cases: same paired game IDs, scores, colors, openings and designs. Full final journal bytes and anchor histories are unavailable.' };
}

function buildAudit(bundle = loadBundle()) {
  const receiptCounts = validateDeclaration(bundle.pairs);
  const verified = verifyReports(bundle, receiptCounts);
  const continuity = checkHistoricalContinuity(bundle.pairs);
  return { schemaVersion: 1, format: 'levelup-v17-final-panel-outcome-evidence', recordedDate: '2026-11-04',
    sources: SOURCES, duplicateUpload: DUPLICATE_COLOR_UPLOAD, failedJournal: FAILED_JOURNAL,
    sourceRunId: bundle.pairs.source.sourceRunId, sourcePayloadSha256: bundle.pairs.payloadSha256,
    provenance: { basis: 'Uploaded compact paired outcomes plus uploaded Markdown reports.',
      compactIntegrityValidated: true, originalCampaignManifestSupplied: false, originalStageManifestsSupplied: false,
      nativePreflightSupplied: false, sourceReceiptsRecorded: true, recordedEngineSha256: [...new Set(bundle.pairs.source.stages.map(row => row.nativePreflight.engineSha256))],
      originalFilesReverifiedHere: false, finalRawJournalAvailable: false, legalMovesIndependentlyReplayed: false,
      colorAndExclusionReportsReproducedExactly: true, panelHeadAndOverallScoresReproduced: true,
      ordinaryAnchorOutcomesReproduced: false, materialEstimatesRefitted: false, newGames: 0, nativeSearches: 0 },
    counts: { finalizedGames: sum(receiptCounts.map(row => row.finalizedGames)), scoredPairedGames: sum(receiptCounts.map(row => row.scoredPairedGames)),
      headPairs: sum(receiptCounts.map(row => row.headPairs)), headGames: sum(receiptCounts.map(row => row.headPairs)) * 2,
      ordinaryPairedGamesRecorded: sum(receiptCounts.map(row => row.ordinaryPairsExcludedFromCompact)) * 2,
      finalizedRecordsOutsideScoredPairs: sum(receiptCounts.map(row => row.finalizedRecordsOutsideScoredPairs)),
      colorPairsWithoutAScore: sum(receiptCounts.map(row => row.finalizedRecordsOutsideScoredPairs)) / 2,
      exactTruncationCountKnown: false, exactErrorAttemptCountKnown: false },
    continuity, receiptCounts,
    budgets: verified.report.budgets.map(budget => ({ nodes: budget.nodes,
      globalColor: { whiteScore: budget.colors.global.whiteScore, blackScore: budget.colors.global.physicalBlack.score,
        pairedGames: budget.colors.global.pairedGames, openingCoverage: budget.colors.global.openingCoverage,
        conditionalRanges: budget.colors.global.conditionalRanges },
      rows: budget.exclusions.baseline.rows.map(row => ({ key: row.key, label: row.label, score: row.score,
        games: row.games, wins: row.wins, draws: row.draws, losses: row.losses,
        white: row.physicalColors[0].score, black: row.physicalColors[1].score,
        conditionalRange: row.conditionalRange, openingCoverage: row.openingCoverage })),
      withoutCataphractAndWraith: (() => {
        const scenario = verified.filtered.budgets.find(row => row.nodes === budget.nodes).exclusions.requested;
        return { excludedKeys: scenario.excludedKeys, commonRosterCases: scenario.commonRosterCases,
          rows: scenario.rows.map(row => ({ key: row.key, label: row.label, score: row.score, games: row.games,
            white: row.physicalColors[0].score, black: row.physicalColors[1].score,
            openingCoverage: row.openingCoverage, matchedComparison: row.matchedComparison,
            newlyAvailableCaseCount: row.newlyAvailableCaseCount })) };
      })(),
      reportedMaterial: verified.material.find(row => row.nodes === budget.nodes) })),
    limitations: [
      'The full final games.jsonl exceeds the attachment transfer limit; compact outcomes contain no moves, SAN, final positions or ordinary-anchor outcomes.',
      'Recorded source hashes and native proof receipts are preserved, but their original files and executable are not independently supplied or attested here.',
      'Material coefficients, ordinary anchors and fit diagnostics remain uploaded reported evidence. No legal replay, refit or cross-protocol calibration is performed.',
      'Fourteen finalized records lie outside scored pairs; exact truncation and transient error-attempt counts cannot be recovered from the compact export.',
      'This cumulative export supersedes earlier snapshots as outcome coverage; cumulative snapshots must not be summed as independent games.',
      'Conditional ranges resample the declared opening cases and omit related-opening ancestry, engine priors, protocol effects and selection after viewing results.',
    ] };
}

function renderAudit(audit) {
  const lines = ['# Final level-three panel evidence', '',
    `The panel finalized **${audit.counts.finalizedGames.toLocaleString('en-US')} games**; ${audit.counts.scoredPairedGames.toLocaleString('en-US')} are scored color partners. The compact archive retains ${audit.counts.headGames.toLocaleString('en-US')} head-to-head games.`, '',
    'Color and both exclusion reports reproduce byte-for-byte. All 135 head-to-head W/D/L rows and 30 overall rows agree with the uploaded panel. The first 4,320 historical head-to-head outcomes remain unchanged.', '',
    'The material table below preserves uploaded combined upgrade bonuses. It is not a new fit. Pawn = 1 and queen = 9 are fixed assumptions.', ''];
  for (const budget of audit.budgets) {
    const color = budget.globalColor;
    lines.push(`## ${budget.nodes.toLocaleString('en-US')} nodes`, '',
      `Physical White scores **${percent(color.whiteScore)}** on ${color.openingCoverage.shared}/64 cases complete across all 45 matchups. Conditional 95% range: ${percent(color.conditionalRanges.physicalWhite.lower)}–${percent(color.conditionalRanges.physicalWhite.upper)}.`, '',
      '| Upgrade | Full roster | White | Black | Without Cataphract/Wraith | Combined material bonus (reported) |',
      '| --- | ---: | ---: | ---: | ---: | ---: |');
    for (const row of budget.rows) {
      const filtered = budget.withoutCataphractAndWraith.rows.find(item => item.key === row.key);
      const material = budget.reportedMaterial.upgrades.find(item => item.key === row.key);
      lines.push(`| ${row.label} | ${percent(row.score)} | ${percent(row.white)} | ${percent(row.black)} | ${filtered ? percent(filtered.score) : '—'} | ${material.combinedBonus.toFixed(2)} |`);
    }
    lines.push('', 'Full and filtered rows can have different usable-case sets; the original exclusion report retains same-case changes separately.', '');
  }
  lines.push('## Evidence limits', '', ...audit.limitations.map(note => `- ${note}`), '');
  return lines.join('\n');
}
function main(args = process.argv.slice(2)) {
  if (args.length) throw new Error('This pinned evidence review accepts no arguments.');
  const audit = buildAudit();
  fs.writeFileSync(path.join(ROOT, `${PREFIX}.audit.json`), JSON.stringify(audit, null, 2) + '\n');
  fs.writeFileSync(path.join(ROOT, `${PREFIX}.report.md`), renderAudit(audit));
  console.log(`Verified final panel: ${audit.counts.finalizedGames} finalized games; ${audit.counts.headPairs} compact H2H pairs. No games or material refits started.`);
  return audit;
}
if (require.main === module) { try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
module.exports = { SOURCES, DUPLICATE_COLOR_UPLOAD, FAILED_JOURNAL, loadBundle, validateDeclaration,
  renderOriginalInsights, verifyReports, checkHistoricalContinuity, buildAudit, renderAudit, main };
