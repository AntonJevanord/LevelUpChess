'use strict';

// Offline audit of exact uploaded evidence against derived v0.18.8 contexts.
// This module starts no engine and does not rewrite any playable files.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const shared = require('./v18-screen-evidence');
const followups = require('./v18-followup-evidence');

const ROOT = path.resolve(__dirname, '../../experiments/balance/results');
const PREFIX = 'v18-completion-001';
const SOURCES_SHA256 = '86dfe157a1861ff672e9c3f2ee8c68feded0fae049c25843f9a5c8e8d3b5326e';
const STUDIES = Object.freeze(['level1-queens', 'level2-completion']);
const PROVENANCE = Object.freeze({ ...shared.PROVENANCE,
  descriptorKind: 'derived v0.18.8 declaration compatibility descriptors, not original execution manifests',
});
const sha = value => createHash('sha256').update(value).digest('hex');
const normalize = text => text.replace(/\r\n/g, '\n');
const percent = value => value === null ? 'pending' : `${(value * 100).toFixed(2)}%`;

function sources() {
  const text = normalize(fs.readFileSync(path.join(ROOT, `${PREFIX}.sources.json`), 'utf8'));
  assert.equal(sha(text), SOURCES_SHA256, 'Completion source pin declaration changed.');
  const value = JSON.parse(text);
  assert.equal(value.schemaVersion, 1); assert.equal(value.format, 'levelup-v18-completion-source-pins');
  return value;
}
function analyzeStudy(study, inputs, descriptors, uploadedReport) {
  assert.equal(descriptors.format, 'levelup-v18-completion-derived-declarations');
  assert.equal(descriptors.baseTag, 'v0.18.8');
  return shared.analyzeStudy(study, inputs, descriptors, uploadedReport, { allowedStudies: STUDIES,
    cohortOpeningIds: true, verifyReport: followups.verifyUploadedReport,
    computeGains: (kind, nodes, declaration, records) => followups.pairedGains(kind, nodes, declaration, records, descriptors) });
}
function loadEvidence({ readArchive } = {}) {
  const pins = sources(), descriptors = JSON.parse(shared.readPinned(pins.declarations, readArchive));
  const studies = STUDIES.map(study => {
    const source = pins.studies[study];
    const inputs = source.journals.map(pin => ({ nodes: pin.nodes, batchIndex: pin.batchIndex,
      records: shared.parseJournal(shared.readPinned(pin, readArchive)) }));
    return analyzeStudy(study, inputs, descriptors, shared.readPinned(source.uploadedReport, readArchive).toString('utf8'));
  });
  return { pins, descriptors, studies };
}
function buildAudit(input = loadEvidence()) {
  const fields = Object.keys(input.studies[0].counts);
  const counts = Object.fromEntries(fields.map(field => [field, input.studies.reduce((sum, study) => sum + study.counts[field], 0)]));
  return { schemaVersion: 1, format: 'levelup-v18-completion-upload-evidence', recordedDate: '2026-11-17', sources: input.pins, provenance: PROVENANCE,
    counts: { ...counts, unpairedCompletedGames: counts.completedGames - counts.pairedGames, newMatchGames: 0, engineSearches: 0 },
    studies: input.studies.map(study => ({ study: study.study, counts: study.counts,
      uploadedNumericTablesReproducedExactly: study.uploadedNumericTablesReproducedExactly, report: study.report,
      unscoredFinalized: study.stages.flatMap(stage => stage.records.filter(row => row.status === 'truncated').map(row => ({
        id: row.id, pairId: row.pairId, comparisonId: row.comparisonId, openingId: row.openingId,
        aColor: row.aColor, status: row.status, result: row.result, reason: row.reason, totalPlies: row.totalPlies,
        completedPartner: stage.records.some(partner => partner.pairId === row.pairId && partner.aColor !== row.aColor && partner.status === 'completed'),
      }))),
      stages: study.stages.map(stage => ({ nodes: stage.nodes, batchIndex: stage.batchIndex, attempts: stage.records.length,
        configSha256: sha(JSON.stringify(stage.descriptor.declaration.config)), scheduleSha256: sha(JSON.stringify(stage.descriptor.manifest.schedule)),
        profileHash: stage.descriptor.manifest.designProfile.hash, registryHash: stage.descriptor.manifest.designRegistry.hash,
        recordedEngineNames: stage.records[0].engineNames })) })) };
}
function renderAudit(audit) {
  const l1 = audit.studies.find(row => row.study === 'level1-queens').report.reports[0];
  const l2 = audit.studies.find(row => row.study === 'level2-completion').report.reports[0];
  const table = (stage, title, opponentLabels) => [title, '',
    `| Body | Overall | ${opponentLabels.join(' | ')} | First / second eight cases | Shared cases |`,
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...stage.rows.map(row => {
      const cells = stage.report.matrix.rows.find(item => item.key === row.key).cells;
      return `| ${row.label} | ${percent(row.score)} | ${cells.map(cell => percent(cell.score)).join(' | ')} | ${stage.cohorts.map(cohort => percent(cohort.rows.find(item => item.key === row.key).score)).join(' / ')} | ${row.openingCoverage.shared}/16 |`;
    }), ''];
  return ['# Version 18 roster-completion evidence', '',
    `${audit.counts.finalizedGames} games finalized on their first attempt: ${audit.counts.completedGames} completed results and ${audit.counts.truncatedGames} unscored move-limit truncations. There are ${audit.counts.completePairs} complete color pairs (${audit.counts.pairedGames} scored games), with ${audit.counts.unpairedCompletedGames} otherwise completed partners excluded from paired scores. No errors, aborted attempts or retries occurred.`, '',
    'Every uploaded numeric table, headline count, physical-color score, fixed-cohort score, conditional range, matched-control gain and search prior reproduces from the journals. Both studies use 40,000 nodes per move on fixed opening IDs `l3-panel-49` through `l3-panel-64`. Draws count half a point.', '',
    'Overall scores and fixed halves use only opening cases complete against every reference. Per-reference cells retain every complete color pair for that individual matchup, matching the uploaded matrix; their denominators can therefore differ from the overall row.', '',
    ...table(l1, '## Level-one queens', ['Two-step pawn', 'King-step pawn', 'Pawn grant']),
    '`QfN` is the closest, more conservative L1 queen candidate at 44.79%, with 42.19%–48.44% across references. `QfhN` remains a stronger alternative at 59.38%, near the top of the descriptive band, including 62.50% against King-step pawns. Both improve over the fresh QmN control with matched gain ranges above zero. The 14.58-point difference between QfhN and QfN is observed within this study; it is not a material-value estimate.', '',
    '`QcC` reaches 64.58% and both fixed halves exceed 63%. It is a high L1 candidate rather than an automatic selection or a proven L2 piece. Its conditional 56.77%–71.35% range still overlaps the screening ceiling.', '',
    ...table(l2, '## Level-two completion', ['Knight pawn', 'Rank pawn', 'Bishop grant']),
    '`QsN` is the stronger queen choice at 47.40%, with every reference between 40.63% and 56.25%. Its 13.02-point matched gain over the Box queen has a conditional 0.52–23.96-point range. `QvN` remains weak at 38.54%, with only 29.69% against the Bishop grant; its gain range includes zero.', '',
    '`NDmK` reaches 56.77%, with stable fixed halves at 57.29% and 56.25%, while ND reaches 38.54%. This supports retaining NDmK as the practical second-knight candidate alongside N0, while noting its 64.06% Bishop-grant matchup. It does not force an immediate NDmW/NDmF refinement. Fresh N0 remains near balance at 51.11% on fifteen shared cases; the old L3 results are not pooled.', '',
    'Free Boar scores 65.56% on fifteen shared cases. Its individual matchups are now 64.06%, 71.88% and 61.67%, so the concern is broader than only Rank pawn in this screen. Keep the requested candidate available for human and mixed-army checks; this audit does not nerf it or rewrite its earlier 59.38% result.', '',
    '## Partial outcomes and next decisions', '',
    'The N0/grant game on l3-panel-59 as White and the Free-Boar/grant game on l3-panel-62 as Black reached 400 plies. Neither is counted as a draw or loss. Their two valid completed partners remain archived but cannot form scored pairs. Each affected overall row omits the entire affected opening across all three opponents, retaining ninety games and fifteen shared cases; individual matchup cells keep their other completed pairs. Matched knight gains use the same fifteen complete cases as the N0 control.', '',
    'The review shortlists QfN, QfhN, QsN and NDmK for practical playtesting, with the stated strength and matchup concerns. It schedules no additional games, movement changes, playable promotions or frozen-reference changes. All search priors and purchase budgets remain separate; no material value or individual-piece Elo is fitted.', '',
    '## Evidence limits', '', ...PROVENANCE.limitations.map(note => `- ${note}`), '',
    'Exact uploaded bytes are retained in deterministic gzip archives with original and archive SHA-256 pins. Compatibility descriptors and fresh-control mappings were reconstructed from v0.18.8 declarations, not recovered original execution manifests.', '',
    'Run `node scripts/balance/v18-completion-evidence.js` to verify offline; `--write` regenerates only the derived audit and this review. Older evidence remains unchanged.', ''].join('\n');
}
function main(args = process.argv.slice(2), { log = console.log } = {}) {
  assert.ok(!args.length || args.length === 1 && args[0] === '--write', 'Use no arguments or --write.');
  const audit = buildAudit();
  for (const [name, content] of [[`${PREFIX}.audit.json`, JSON.stringify(audit) + '\n'], [`${PREFIX}.report.md`, renderAudit(audit)]]) {
    const file = path.join(ROOT, name);
    if (args.length) fs.writeFileSync(file, content); else assert.equal(normalize(fs.readFileSync(file, 'utf8')), content, `Derived artifact changed: ${name}.`);
  }
  log(`V18 completion verified: ${audit.counts.finalizedGames} finalized games, ${audit.counts.completePairs} scored pairs; no searches or new games.`);
  return audit;
}
if (require.main === module) { try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; } }
module.exports = { PREFIX, SOURCES_SHA256, STUDIES, PROVENANCE, sources, analyzeStudy, loadEvidence, buildAudit, renderAudit, main };
