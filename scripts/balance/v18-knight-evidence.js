'use strict';

// Offline audit of exact uploaded evidence against derived v0.18.6 contexts.
// This module starts no engine and does not load or rewrite the live catalog.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const shared = require('./v18-screen-evidence');
const followups = require('./v18-followup-evidence');

const ROOT = path.resolve(__dirname, '../../experiments/balance/results');
const PREFIX = 'v18-knights-001';
const SOURCES_SHA256 = '380e5d504310f3f6d61c052d901e7c2561dce24f7ab0a6876fabf34478418137';
const STUDIES = Object.freeze(['level2-knights']);
const PROVENANCE = Object.freeze({ ...shared.PROVENANCE,
  descriptorKind: 'derived v0.18.6 declaration compatibility descriptors, not original execution manifests',
});
const sha = value => createHash('sha256').update(value).digest('hex');
const normalize = text => text.replace(/\r\n/g, '\n');
const percent = value => value === null ? 'pending' : `${(value * 100).toFixed(2)}%`;

function sources() {
  const text = normalize(fs.readFileSync(path.join(ROOT, `${PREFIX}.sources.json`), 'utf8'));
  assert.equal(sha(text), SOURCES_SHA256, 'Knight source pin declaration changed.');
  const value = JSON.parse(text);
  assert.equal(value.schemaVersion, 1); assert.equal(value.format, 'levelup-v18-knight-source-pins');
  return value;
}
function analyzeStudy(study, inputs, descriptors, uploadedReport) {
  assert.equal(descriptors.format, 'levelup-v18-knight-derived-declarations');
  assert.equal(descriptors.baseTag, 'v0.18.6');
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
  const study = input.studies[0];
  return { schemaVersion: 1, format: 'levelup-v18-knight-upload-evidence', recordedDate: '2026-11-16', sources: input.pins, provenance: PROVENANCE,
    counts: { ...study.counts, newMatchGames: 0, engineSearches: 0 },
    studies: [{ study: study.study, counts: study.counts, uploadedNumericTablesReproducedExactly: study.uploadedNumericTablesReproducedExactly,
      report: study.report, stages: study.stages.map(stage => ({ nodes: stage.nodes, batchIndex: stage.batchIndex, attempts: stage.records.length,
        configSha256: sha(JSON.stringify(stage.descriptor.declaration.config)), scheduleSha256: sha(JSON.stringify(stage.descriptor.manifest.schedule)),
        profileHash: stage.descriptor.manifest.designProfile.hash, registryHash: stage.descriptor.manifest.designRegistry.hash,
        recordedEngineNames: stage.records[0].engineNames })) }] };
}
function renderAudit(audit) {
  const stage = audit.studies[0].report.reports[0];
  return ['# Version 18 level-two knight evidence', '',
    `${audit.counts.finalizedGames} games completed on their first attempt, with ${audit.counts.completePairs} complete color pairs. There are no errors, aborted attempts, retries or move-limit truncations. Every uploaded numeric table, headline count, physical-color score, fixed-cohort score, conditional range, control gain and search prior reproduces from the journals.`, '',
    'The study uses 40,000 nodes per move on sixteen fixed opening IDs, `l3-panel-33` through `l3-panel-48`, with both colors. Every body has 96 games against the three unchanged L2 references. Draws count half a point.', '',
    '| Body | Overall | Knight pawn | Rank pawn | Bishop grant | First / second eight cases | White / Black |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...stage.rows.map(row => `| ${row.label} | ${percent(row.score)} | ${row.opponents.map(opponent => percent(opponent.score)).join(' | ')} | ${stage.cohorts.map(cohort => percent(cohort.rows.find(item => item.key === row.key).score)).join(' / ')} | ${row.physicalColors.map(color => percent(color.score)).join(' / ')} |`), '',
    '`N0` is the clear level-two candidate in this screen: 42 wins, 21 draws and 33 losses give 54.69%, with opponent scores spanning 51.56%–57.81%. Its two fixed halves score 53.13% and 56.25%. The conditional opening-block 95% range is 47.92%–61.98%; this supports a practical L2 fit rather than proof of exact balance.', '',
    '`NH` is weak at 31.77%; `NDH` is high at 75.00%, exceeding 73% against every reference. Fresh NA and NFA controls bracket the trials at 28.65% and 69.79%. Keep those comparisons within this protocol rather than pooling their earlier screens into a single score.', '',
    'All five bodies share the 1203/1352 MG/EG search prior; references retain their frozen priors. The historical L3 Nightrider used 2326/2211 and different opponents and purchase context. This screen cannot isolate the effect of its price change, and its old results are not pooled here. No material value or individual-piece Elo is fitted.', '',
    'Human counterplay and later mixed-army results can confirm the practical choice; this audit schedules no automatic refinement, additional matches, playable promotion or reference change.', '',
    '## Evidence limits', '', ...PROVENANCE.limitations.map(note => `- ${note}`), '',
    'Exact uploaded bytes are retained in deterministic gzip archives with original and archive SHA-256 pins. Compatibility descriptors and fresh-control mappings were reconstructed from v0.18.6 declarations, not recovered from original execution manifests.', '',
    'Run `node scripts/balance/v18-knight-evidence.js` to verify offline; `--write` regenerates only the derived audit and this review. Older evidence remains unchanged.', ''].join('\n');
}
function main(args = process.argv.slice(2), { log = console.log } = {}) {
  assert.ok(!args.length || args.length === 1 && args[0] === '--write', 'Use no arguments or --write.');
  const audit = buildAudit();
  for (const [name, content] of [[`${PREFIX}.audit.json`, JSON.stringify(audit) + '\n'], [`${PREFIX}.report.md`, renderAudit(audit)]]) {
    const file = path.join(ROOT, name);
    if (args.length) fs.writeFileSync(file, content); else assert.equal(normalize(fs.readFileSync(file, 'utf8')), content, `Derived artifact changed: ${name}.`);
  }
  log(`V18 knights verified: ${audit.counts.finalizedGames} completed games, ${audit.counts.completePairs} scored pairs; no searches or new games.`);
  return audit;
}
if (require.main === module) { try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; } }
module.exports = { PREFIX, SOURCES_SHA256, STUDIES, PROVENANCE, sources, analyzeStudy, loadEvidence, buildAudit, renderAudit, main };
