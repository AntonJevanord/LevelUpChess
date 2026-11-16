'use strict';

// Outcome audit of exact uploads. No engine, match execution or live catalog
// is loaded; archived derived descriptors preserve the tested declaration.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const shared = require('./v18-screen-evidence');
const { conditionalRange } = require('./level3-panel-report');

const ROOT = path.resolve(__dirname, '../../experiments/balance/results');
const PREFIX = 'v18-followups-001';
const SOURCES_SHA256 = '1b35d6489c764d0a9f37f28a9a5eede5054413ec338c9cb678b816ac105a3a9b';
const STUDIES = Object.freeze(['level1-followup', 'level2-followup']);
const PROVENANCE = Object.freeze({ ...shared.PROVENANCE,
  descriptorKind: 'derived v0.18.4 declaration compatibility descriptors, not original execution manifests',
});
const sha = value => createHash('sha256').update(value).digest('hex');
const normalize = text => text.replace(/\r\n/g, '\n');
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const score = row => row.result === '1/2-1/2' ? 0.5 : Number((row.result === '1-0') === (row.aColor === 'w'));
const percent = value => value === null ? 'pending' : `${(value * 100).toFixed(2)}%`;
const pp = value => value === null ? 'pending' : (value * 100).toFixed(2);

function sources() {
  const text = normalize(fs.readFileSync(path.join(ROOT, `${PREFIX}.sources.json`), 'utf8'));
  assert.equal(sha(text), SOURCES_SHA256, 'Follow-up source pin declaration changed.');
  const value = JSON.parse(text);
  assert.equal(value.schemaVersion, 1); assert.equal(value.format, 'levelup-v18-followup-source-pins');
  return value;
}
function latestRecords(records) {
  const latest = new Map();
  for (const row of records) if (!latest.has(row.id) || row.attempt > latest.get(row.id).attempt) latest.set(row.id, row);
  return [...latest.values()];
}
function pairedGains(study, nodes, declaration, records, descriptors) {
  const bodies = descriptors.rosters[study], comparisons = declaration.metadata.comparisons, refs = declaration.metadata.columns;
  assert.ok(Array.isArray(bodies), 'Archived follow-up roster is missing.');
  const values = new Map(), pairs = new Map();
  for (const row of latestRecords(records)) { const pair = pairs.get(row.pairId) || []; pair.push(row); pairs.set(row.pairId, pair); }
  for (const pair of pairs.values()) if (pair.length === 2 && pair.every(row => row.status === 'completed') && pair[0].aColor !== pair[1].aColor) {
    values.set(`${pair[0].comparisonId}:${pair[0].openingId}`, mean(pair.map(score)));
  }
  const comparison = (key, ref) => {
    const row = comparisons.find(cell => cell.aKey === key && cell.bKey === ref);
    assert.ok(row, 'Unknown archived trial or control.'); return row.id;
  };
  return bodies.filter(body => body.controlKey).map(body => {
    const control = bodies.find(row => row.key === body.controlKey);
    assert.ok(control, 'Unknown archived matched control.');
    const common = declaration.config.openings.filter(opening => refs.every(ref => [body.key, control.key].every(key => values.has(`${comparison(key, ref.key)}:${opening.id}`))));
    const differences = common.map(opening => mean(refs.map(ref => values.get(`${comparison(body.key, ref.key)}:${opening.id}`) - values.get(`${comparison(control.key, ref.key)}:${opening.id}`))));
    return { key: body.key, label: body.label, control: control.key, controlLabel: control.label,
      sharedOpenings: common.length, difference: mean(differences), conditionalRange: conditionalRange(differences, `v18gain:${nodes}:${body.key}`) };
  });
}
function verifyUploadedReport(study, report, uploaded) {
  shared.verifyUploadedReport(study, report, uploaded, { cohortHeaderPrefix: 'l3-panel-', gainsHaveControlLabels: true });
  const tables = sharedMarkdownTables(uploaded);
  const cohorts = tables.filter(row => row.header[0] === 'Design' && row.header[1].startsWith('l3-panel-'));
  assert.equal(cohorts.length, report.reports.length, 'Unexpected held-out opening tables.');
  report.reports.forEach((stage, index) => {
    assert.deepEqual(cohorts[index].header, ['Design', ...stage.cohorts.map(cohort => `${cohort.openingIds[0]} … ${cohort.openingIds.at(-1)}`)], 'Held-out opening labels changed.');
  });
  return true;
}
function sharedMarkdownTables(text) {
  // Header identity is the only extra check beyond the shared numeric audit.
  const result = [], lines = normalize(text).split('\n');
  for (let index = 0; index < lines.length; index++) if (lines[index].startsWith('| ') && lines[index + 1]?.startsWith('| ---')) {
    result.push({ header: lines[index].slice(1, -1).split('|').map(value => value.trim()) });
  }
  return result;
}
function analyzeStudy(study, inputs, descriptors, uploadedReport) {
  assert.equal(descriptors.format, 'levelup-v18-followup-derived-declarations');
  assert.equal(descriptors.baseTag, 'v0.18.4');
  return shared.analyzeStudy(study, inputs, descriptors, uploadedReport, { allowedStudies: STUDIES,
    cohortOpeningIds: true, verifyReport: verifyUploadedReport,
    computeGains: (kind, nodes, declaration, records) => pairedGains(kind, nodes, declaration, records, descriptors) });
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
  return { schemaVersion: 1, format: 'levelup-v18-followup-upload-evidence', recordedDate: '2026-11-16', sources: input.pins, provenance: PROVENANCE,
    counts: { ...counts, newMatchGames: 0, engineSearches: 0 },
    studies: input.studies.map(study => ({ study: study.study, counts: study.counts, uploadedNumericTablesReproducedExactly: study.uploadedNumericTablesReproducedExactly,
      report: study.report, stages: study.stages.map(stage => ({ nodes: stage.nodes, batchIndex: stage.batchIndex, attempts: stage.records.length,
        configSha256: sha(JSON.stringify(stage.descriptor.declaration.config)), scheduleSha256: sha(JSON.stringify(stage.descriptor.manifest.schedule)),
        profileHash: stage.descriptor.manifest.designProfile.hash, registryHash: stage.descriptor.manifest.designRegistry.hash,
        recordedEngineNames: stage.records[0].engineNames })) })) };
}
function renderAudit(audit) {
  const l1 = audit.studies.find(row => row.study === 'level1-followup').report.reports[0];
  const l2 = audit.studies.find(row => row.study === 'level2-followup').report.reports[0];
  const table = (stage, title) => [title, '', '| Body | Score | Fixed halves | White / Black |', '| --- | ---: | ---: | ---: |',
    ...stage.rows.map(row => `| ${row.label} | ${percent(row.score)} | ${stage.cohorts.map(cohort => percent(cohort.rows.find(item => item.key === row.key).score)).join(' / ')} | ${row.physicalColors.map(color => percent(color.score)).join(' / ')} |`), ''];
  return ['# Version 18 targeted follow-up evidence', '',
    `${audit.counts.finalizedGames} games completed on their first attempt, with ${audit.counts.completePairs} complete color pairs. There are no errors, aborted attempts, retries or move-limit truncations. Every uploaded numeric table, headline count, physical-color score, fixed-cohort score, conditional range, control gain and search prior reproduces from the journals.`, '',
    'Both studies use 40,000 nodes per move on the same sixteen held-out case IDs, `l3-panel-17` through `l3-panel-32`. These are sixteen related opening blocks, not 1,632 independent starting positions. Draws count half a point.', '',
    ...table(l1, '## Level one'),
    '`NmQ` (46.35%) and `BgB0` (48.44%) are the strongest candidates to keep for human playtesting. Their gains over fresh matched controls are 14.58 and 18.23 percentage points, with conditional ranges of 4.69–24.48 and 6.25–30.22. NmQ retains a 32.81% King-step-pawn matchup; BgB0 scores 39.06% there. Their averages do not remove those interactions.', '',
    'Park `NmK` (18.75%) and `BgBgmB0` (34.38%). Blink queen reaches 39.06%, but its 7.81-point gain has a −2.60 to +18.75 conditional range and it scores only 23.44% against King-step pawns. It remains a lower-edge or exploration design rather than an automatic promotion or another immediate buff.', '',
    ...table(l2, '## Level two'),
    'All four knight compounds are stronger than their fresh control. `NWH` is the clearest high outlier at 77.08%, with 75.00%–81.25% against every reference and 79.17%/75.00% across the fixed halves. `NWD` reaches 66.15%, driven partly by 81.25% against the Bishop grant; `NAD` reaches 64.06%, including 73.44% against Rank pawn.', '',
    '`NFA` is closest to the screening target at 61.46%; its conditional 54.67–68.75 range overlaps the 60% boundary. It is the most reasonable knight to retain for playtesting or a later decision-relevant confirmation, not a proven exact two-point match. Do not promote or reprice a body from this screen alone.', '',
    'The clear-range Bishop pawn (45.31%) is the simpler provisional playtest choice with more even observed opponent scores: 48.44%, 46.88% and 40.63%, compared with 39.06%, 53.13% and 35.94% for the jumping pawn (42.71%). Both improve over the fresh 20.83% control under the same 536/592 prior; matched gains are 24.48 and 21.87 points. The jumping pattern permits every clear-range move plus blocked-path jumps, so its lower observed score can reflect finite search and sampling. This screen does not establish intrinsic superiority for either pawn.', '',
    'The old Bishop-pawn screen used 214/245 on different cases. Do not pool its 22.92% score with this fresh 536/592 control or interpret their difference as a clean valuation experiment. The old body remains weak under the new policy, while both movement revisions improve within this matched study.', '',
    '## Keep the study bounded', '',
    'Keep the fixed references and previously promising unchanged bodies intact. Review NmQ, BgB0 and the clear-range Bishop pawn in human games; park the clearly weak or strong alternatives. No new experiments, movement changes, purchase-price changes, material fits or playable promotions are scheduled by this audit.', '',
    '## Evidence limits', '', ...PROVENANCE.limitations.map(note => `- ${note}`), '',
    'Exact uploaded bytes are retained in deterministic gzip archives with original and archive SHA-256 pins. The archived compatibility descriptors and control mappings were reconstructed from v0.18.4 declarations. They are not recovered original run manifests or native proof.', '',
    'Run `node scripts/balance/v18-followup-evidence.js` to verify offline; `--write` regenerates only the derived audit and review. The earlier `v18-screen-evidence.js` audit remains unchanged.', ''].join('\n');
}
function main(args = process.argv.slice(2), { log = console.log } = {}) {
  assert.ok(!args.length || args.length === 1 && args[0] === '--write', 'Use no arguments or --write.');
  const audit = buildAudit();
  for (const [name, content] of [[`${PREFIX}.audit.json`, JSON.stringify(audit) + '\n'], [`${PREFIX}.report.md`, renderAudit(audit)]]) {
    const file = path.join(ROOT, name);
    if (args.length) fs.writeFileSync(file, content); else assert.equal(normalize(fs.readFileSync(file, 'utf8')), content, `Derived artifact changed: ${name}.`);
  }
  log(`V18 follow-ups verified: ${audit.counts.finalizedGames} completed games, ${audit.counts.completePairs} scored pairs; no searches or new games.`);
  return audit;
}
if (require.main === module) { try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; } }
module.exports = { PREFIX, SOURCES_SHA256, STUDIES, PROVENANCE, sources, pairedGains, verifyUploadedReport, analyzeStudy, loadEvidence, buildAudit, renderAudit, main };
