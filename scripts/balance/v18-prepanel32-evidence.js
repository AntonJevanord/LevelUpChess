'use strict';

// Exact uploaded outcomes checked against reconstructed v0.18.10 contexts.
// No original runtime proof, independent move replay or new engine game.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const shared = require('./v18-screen-evidence');
const followups = require('./v18-followup-evidence');

const ROOT = path.resolve(__dirname, '../../experiments/balance/results');
const PREFIX = 'v18-prepanel32-001';
const SOURCES_SHA256 = 'e1b587c4f0dcbe9e0ae5a8b671514ed5cbf257d047dfffcd0fea8970ab4827e3';
const STUDIES = Object.freeze(['prepanel-level2', 'prepanel-level3']);
const TARGET = 32;
const PROVENANCE = Object.freeze({ ...shared.PROVENANCE,
  descriptorKind: 'derived v0.18.10 declaration compatibility descriptors, not original execution manifests',
  limitations: Object.freeze(shared.PROVENANCE.limitations.map(note => note.startsWith('All studies use sixteen')
    ? 'Both studies use thirty-two related fixed opening cases from the reused casebook. Conditional ranges do not make each game an independent starting position.' : note)),
});
const sha = value => createHash('sha256').update(value).digest('hex');
const normalize = text => text.replace(/\r\n/g, '\n');
const percent = value => value === null ? 'pending' : `${(value * 100).toFixed(2)}%`;

function sources() {
  const text = normalize(fs.readFileSync(path.join(ROOT, `${PREFIX}.sources.json`), 'utf8'));
  assert.equal(sha(text), SOURCES_SHA256, 'Prepanel32 source pin declaration changed.');
  const value = JSON.parse(text);
  assert.equal(value.schemaVersion, 1); assert.equal(value.format, 'levelup-v18-prepanel32-source-pins');
  assert.equal(value.targetOpenings, TARGET);
  return value;
}
function analyzeStudy(study, inputs, descriptors, uploadedReport) {
  assert.equal(descriptors.format, 'levelup-v18-prepanel32-derived-declarations');
  assert.equal(descriptors.baseTag, 'v0.18.10'); assert.equal(descriptors.targetOpenings, TARGET);
  return shared.analyzeStudy(study, inputs, descriptors, uploadedReport, { allowedStudies: STUDIES,
    targetOpenings: TARGET, cohortOpeningIds: true, verifyReport: followups.verifyUploadedReport,
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
  return { schemaVersion: 1, format: 'levelup-v18-prepanel32-upload-evidence', recordedDate: '2026-11-17', sources: input.pins, provenance: PROVENANCE,
    counts: { ...counts, unpairedCompletedGames: counts.completedGames - counts.pairedGames, newMatchGames: 0, engineSearches: 0 },
    studies: input.studies.map(study => ({ study: study.study, counts: study.counts,
      uploadedNumericTablesReproducedExactly: study.uploadedNumericTablesReproducedExactly, report: study.report,
      unscoredFinalized: study.stages.flatMap(stage => stage.records.filter(row => row.status === 'truncated').map(row => ({
        id: row.id, pairId: row.pairId, comparisonId: row.comparisonId, openingId: row.openingId, aColor: row.aColor,
        status: row.status, result: row.result, reason: row.reason, totalPlies: row.totalPlies,
        completedPartner: stage.records.some(partner => partner.pairId === row.pairId && partner.aColor !== row.aColor && partner.status === 'completed'),
      }))),
      stages: study.stages.map(stage => ({ nodes: stage.nodes, batchIndex: stage.batchIndex, attempts: stage.records.length,
        configSha256: sha(JSON.stringify(stage.descriptor.declaration.config)), scheduleSha256: sha(JSON.stringify(stage.descriptor.manifest.schedule)),
        profileHash: stage.descriptor.manifest.designProfile.hash, registryHash: stage.descriptor.manifest.designRegistry.hash,
        recordedEngineNames: stage.records[0].engineNames })) })) };
}
function renderAudit(audit) {
  const l2 = audit.studies.find(row => row.study === 'prepanel-level2').report.reports[0];
  const l3 = audit.studies.find(row => row.study === 'prepanel-level3').report.reports[0];
  const table = (stage, title, opponents) => [title, '',
    `| Body | Overall | ${opponents.join(' | ')} | Shared cases |`,
    `| --- | ---: | ${opponents.map(() => '---:').join(' | ')} | ---: |`,
    ...stage.rows.map(row => `| ${row.label} | ${percent(row.score)} | ${stage.report.matrix.rows.find(item => item.key === row.key).cells.map(cell => percent(cell.score)).join(' | ')} | ${row.openingCoverage.shared}/${TARGET} |`), ''];
  const cohorts = (stage, title) => [title, '', '| Body | Cases 01–08 | Cases 09–16 | Cases 17–24 | Cases 25–32 |',
    '| --- | ---: | ---: | ---: | ---: |', ...stage.rows.map(row => `| ${row.label} | ${stage.cohorts.map(cohort => {
      const item = cohort.rows.find(item => item.key === row.key); return `${percent(item.score)} (${item.openingCoverage.shared}/8)`;
    }).join(' | ')} |`), ''];
  return ['# Version 18 L2/L3 alternatives: thirty-two-case evidence', '',
    `${audit.counts.finalizedGames} games finalized on their first attempt: ${audit.counts.completedGames} completed results and ${audit.counts.truncatedGames} unscored move-limit truncations. There are ${audit.counts.completePairs} complete color pairs (${audit.counts.pairedGames} scored games), with ${audit.counts.unpairedCompletedGames} completed partners excluded from paired scores. No errors, aborted attempts or retries occurred.`, '',
    'Every uploaded numeric table, count, color score, four cohort columns, matched-control gain, conditional range and search prior reproduces from the journals. Both studies use 40,000 nodes and the same thirty-two reused fixed case IDs, l3-panel-01 through l3-panel-32. Draws count half a point.', '',
    ...table(l2, '## Level two', ['Knight pawn', 'Rank pawn', 'Bishop grant']),
    'QcC is a viable two-point queen at 55.21%, with 65.63% against Knight pawn and 50.00% against both other references. Its conditional overall range is 48.96%–61.46%. The proposed six-camel-capture alternative QfcCscC remains an untested idea; this archive neither applies that movement nor assumes a nerf is required to reach exactly fifty percent.', '',
    'NDmK remains healthy at 48.96%. NDmW reaches 53.13%, with an uncertain 4.17-point matched lead over NDmK (−3.91 to +12.24). NDmF is lower at 41.67%. These are conditional search outcomes, not evidence that removing diagonal quiet options intrinsically strengthens a piece.', '',
    'Free Boar reaches 55.21%, with individual reference scores of 60.16%, 52.34% and 53.13%. Its four batches are 59.38%, 55.21%, 48.96% and 57.29%; first-sixteen and second-sixteen averages are 57.29% and 53.13%. The 48.96% batch is retained normally rather than called an outlier or reweighted. Every batch is part of the declared book, and the 48.44%–61.72% overall range leaves uncertainty around the upper target boundary.', '',
    'BsW3 also looks viable at 48.44%. BsWsnN is the stronger alternative at 58.07%, while BsW2 is low at 36.46%. This gives bounded bishop alternatives for practical selection, without automatically replacing Free Boar or running another full refinement chain.', '',
    ...cohorts(l2, '### Level-two fixed batches'),
    ...table(l3, '## Level three', ['Vanguard', 'Unicorn', 'Crusader', 'Amazon']),
    'NAD is the preferred design choice from the requested alternatives: 51.76% overall, with 51.56%, 50.00%, 55.47% and 50.00% against the four references. Its conditional overall range is 45.70%–57.03%; its matched lead over Unicorn is only 1.61 points with a −5.65 to +8.67 range. This supports selecting it for playtesting, not proof of an exact material value or superiority over every other close candidate.', '',
    'NZ is another close candidate at 52.34%, though it scores 64.06% against Vanguard. NWH and NDH sit near the upper edge at 59.96% and 59.48%. NH is low at 24.61%; NAZ is high at 81.64%, and NADmK at 66.02%. Keep these results separate from earlier two-point contexts and from the pending opening diagnostic.', '',
    ...cohorts(l3, '### Level-three fixed batches'),
    '## Coverage and interpretation', '',
    'The L3 NDH/Vanguard game on case 02 as Black and Unicorn/Amazon game on case 15 as Black reached 400 plies. They remain unscored; their completed color partners remain archived without becoming pairs. Both affected overall rows have thirty-one shared cases, while individual matrix cells above retain other completed pairs. Overall and per-cell denominators can therefore differ.', '',
    'Earlier Free Boar results (59.38% and 65.56%) used different case sets and contexts. These thirty-two-case scores do not replace or pool those studies. Opening variation can change apparent rankings; more data in a fixed narrow book does not guarantee generalization to every opening.', '',
    'Opening diagnostics can flag captures, pins and tactical exposure, but do not adjust these outcome scores or retrospectively select the best eight openings for each matchup. This review starts no games, changes no movement or price, and promotes no playable profile or frozen reference.', '',
    '## Evidence limits', '', ...PROVENANCE.limitations.map(note => `- ${note}`), '',
    'Exact uploaded bytes are retained in deterministic gzip archives with original and archive SHA-256 pins. Compatibility descriptors and fresh-control mappings were reconstructed from v0.18.10 declarations, not recovered original execution manifests.', '',
    'Run `node scripts/balance/v18-prepanel32-evidence.js` to verify offline; `--write` regenerates only the derived audit and this review. Older evidence remains unchanged.', ''].join('\n');
}
function main(args = process.argv.slice(2), { log = console.log } = {}) {
  assert.ok(!args.length || args.length === 1 && args[0] === '--write', 'Use no arguments or --write.');
  const audit = buildAudit();
  for (const [name, content] of [[`${PREFIX}.audit.json`, JSON.stringify(audit) + '\n'], [`${PREFIX}.report.md`, renderAudit(audit)]]) {
    const file = path.join(ROOT, name);
    if (args.length) fs.writeFileSync(file, content); else assert.equal(normalize(fs.readFileSync(file, 'utf8')), content, `Derived artifact changed: ${name}.`);
  }
  log(`V18 prepanel32 verified: ${audit.counts.finalizedGames} finalized games, ${audit.counts.completePairs} scored pairs; no searches or new games.`);
  return audit;
}
if (require.main === module) { try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; } }
module.exports = { PREFIX, SOURCES_SHA256, STUDIES, TARGET, PROVENANCE, sources, analyzeStudy, loadEvidence, buildAudit, renderAudit, main };
