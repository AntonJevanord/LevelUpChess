'use strict';

// Exact uploads checked offline against derived v0.18.10 compatibility contexts.
// No original runtime, executable or independently replayed outcome is claimed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const shared = require('./v18-screen-evidence');
const followups = require('./v18-followup-evidence');

const ROOT = path.resolve(__dirname, '../../experiments/balance/results');
const PREFIX = 'v18-queen32-001';
const SOURCES_SHA256 = '242674c8d328e524618c9c22e1ff3cb7fc430a60c535aad9b764b05fd23231e4';
const STUDY = 'prepanel-level1', TARGET = 32;
const PROVENANCE = Object.freeze({ ...shared.PROVENANCE,
  descriptorKind: 'derived v0.18.10 declaration compatibility descriptors, not original execution manifests',
  limitations: Object.freeze(shared.PROVENANCE.limitations.map(note => note.startsWith('All studies use sixteen')
    ? 'This study uses thirty-two related fixed opening cases from the reused casebook. Opening-block ranges are conditional; raw game counts do not imply that many independent starting positions.' : note)),
});
const sha = value => createHash('sha256').update(value).digest('hex');
const normalize = text => text.replace(/\r\n/g, '\n');
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const score = row => row.result === '1/2-1/2' ? 0.5 : Number((row.result === '1-0') === (row.aColor === 'w'));
const percent = value => value === null ? 'pending' : `${(value * 100).toFixed(2)}%`;
const pp = value => value === null ? 'pending' : (value * 100).toFixed(2);
const range = value => value.available ? `${pp(value.lower)}–${pp(value.upper)}` : 'pending';

function sources() {
  const text = normalize(fs.readFileSync(path.join(ROOT, `${PREFIX}.sources.json`), 'utf8'));
  assert.equal(sha(text), SOURCES_SHA256, 'Queen32 source pin declaration changed.');
  const value = JSON.parse(text);
  assert.equal(value.schemaVersion, 1); assert.equal(value.format, 'levelup-v18-queen32-source-pins');
  assert.equal(value.targetOpenings, TARGET);
  return value;
}
function analyzeStudy(study, inputs, descriptors, uploadedReport) {
  assert.equal(descriptors.format, 'levelup-v18-queen32-derived-declarations');
  assert.equal(descriptors.baseTag, 'v0.18.10'); assert.equal(descriptors.targetOpenings, TARGET);
  return shared.analyzeStudy(study, inputs, descriptors, uploadedReport, { allowedStudies: [STUDY],
    targetOpenings: TARGET, cohortOpeningIds: true, verifyReport: followups.verifyUploadedReport,
    computeGains: (kind, nodes, declaration, records) => followups.pairedGains(kind, nodes, declaration, records, descriptors) });
}
function loadEvidence({ readArchive } = {}) {
  const pins = sources(), descriptors = JSON.parse(shared.readPinned(pins.declarations, readArchive));
  const source = pins.studies[STUDY];
  const inputs = source.journals.map(pin => ({ nodes: pin.nodes, batchIndex: pin.batchIndex,
    records: shared.parseJournal(shared.readPinned(pin, readArchive)) }));
  const study = analyzeStudy(STUDY, inputs, descriptors, shared.readPinned(source.uploadedReport, readArchive).toString('utf8'));
  return { pins, descriptors, study };
}
function matchedComparison(input) {
  const stage = input.study.report.reports[0], gain = stage.gains[0];
  const trial = stage.rows.find(row => row.key === gain.key), control = stage.rows.find(row => row.key === gain.control);
  const common = trial.openingCoverage.openingIds.filter(id => control.openingCoverage.openingIds.includes(id));
  assert.equal(common.length, gain.sharedOpenings);
  const allRecords = input.study.stages.flatMap(row => row.records);
  const cells = input.study.stages[0].descriptor.declaration.metadata.comparisons;
  const values = (key, openingIds = common) => {
    const ids = new Set(cells.filter(cell => cell.aKey === key).map(cell => cell.id));
    return allRecords.filter(row => row.status === 'completed' && openingIds.includes(row.openingId) && ids.has(row.comparisonId));
  };
  const trialValues = values(gain.key), controlValues = values(gain.control);
  assert.equal(trialValues.length, gain.sharedOpenings * 6); assert.equal(controlValues.length, trialValues.length);
  const trialScore = mean(trialValues.map(score)), controlScore = mean(controlValues.map(score));
  assert.ok(Math.abs(trialScore - controlScore - gain.difference) < 1e-12);
  const halves = [input.study.stages.slice(0, 2), input.study.stages.slice(2, 4)].map(stages => {
    const openingIds = stages.flatMap(stage => stage.descriptor.declaration.config.openings.map(opening => opening.id));
    const sharedOpeningIds = common.filter(id => openingIds.includes(id));
    const trialRecords = values(gain.key, sharedOpeningIds), controlRecords = values(gain.control, sharedOpeningIds);
    assert.equal(trialRecords.length, sharedOpeningIds.length * 6); assert.equal(controlRecords.length, trialRecords.length);
    return { openingIds, sharedOpeningIds, gamesPerBody: trialRecords.length,
      trialScore: mean(trialRecords.map(score)), controlScore: mean(controlRecords.map(score)) };
  });
  return { trial: gain.key, control: gain.control, sharedOpeningIds: common, gamesPerBody: trialValues.length,
    trialScore, controlScore, difference: gain.difference, conditionalRange: gain.conditionalRange, halves };
}
function buildAudit(input = loadEvidence()) {
  const { study } = input;
  return { schemaVersion: 1, format: 'levelup-v18-queen32-upload-evidence', recordedDate: '2026-11-17', sources: input.pins, provenance: PROVENANCE,
    counts: { ...study.counts, unpairedCompletedGames: study.counts.completedGames - study.counts.pairedGames, newMatchGames: 0, engineSearches: 0 },
    study: { study: study.study, counts: study.counts, uploadedNumericTablesReproducedExactly: study.uploadedNumericTablesReproducedExactly,
      report: study.report, matchedComparison: matchedComparison(input),
      unscoredFinalized: study.stages.flatMap(stage => stage.records.filter(row => row.status === 'truncated').map(row => ({
        id: row.id, pairId: row.pairId, comparisonId: row.comparisonId, openingId: row.openingId, aColor: row.aColor,
        status: row.status, result: row.result, reason: row.reason, totalPlies: row.totalPlies,
        completedPartner: stage.records.some(partner => partner.pairId === row.pairId && partner.aColor !== row.aColor && partner.status === 'completed'),
      }))),
      stages: study.stages.map(stage => ({ nodes: stage.nodes, batchIndex: stage.batchIndex, attempts: stage.records.length,
        configSha256: sha(JSON.stringify(stage.descriptor.declaration.config)), scheduleSha256: sha(JSON.stringify(stage.descriptor.manifest.schedule)),
        profileHash: stage.descriptor.manifest.designProfile.hash, registryHash: stage.descriptor.manifest.designRegistry.hash,
        recordedEngineNames: stage.records[0].engineNames })) } };
}
function renderAudit(audit) {
  const stage = audit.study.report.reports[0], comparison = audit.study.matchedComparison;
  const trial = stage.rows.find(row => row.key === comparison.trial), control = stage.rows.find(row => row.key === comparison.control);
  return ['# Version 18 L1 queens: thirty-two-case evidence', '',
    `${audit.counts.finalizedGames} games finalized on their first attempt: ${audit.counts.completedGames} completed results and ${audit.counts.truncatedGames} unscored move-limit truncation. There are ${audit.counts.completePairs} complete color pairs (${audit.counts.pairedGames} scored games), with one otherwise completed partner excluded from paired scores. No errors, aborted attempts or retries occurred.`, '',
    'Every uploaded numeric table, headline count, physical-color score, four fixed-cohort columns, conditional range, matched-control gain and search prior reproduces from the journals. The study uses 40,000 nodes on thirty-two reused fixed cases, l3-panel-01 through l3-panel-32. Draws count half a point.', '',
    '| Body | Overall | Two-step pawn | King-step pawn | Pawn grant | White / Black | Shared cases |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...stage.rows.map(row => {
      const cells = stage.report.matrix.rows.find(item => item.key === row.key).cells;
      return `| ${row.label} | ${percent(row.score)} | ${cells.map(cell => percent(cell.score)).join(' | ')} | ${row.physicalColors.map(color => percent(color.score)).join(' / ')} | ${row.openingCoverage.shared}/${TARGET} |`;
    }), '',
    `Keep QfN as a level-one queen candidate: its ${percent(control.score)} score and ${range(control.conditionalRange)}% conditional range support the earlier choice. QvN also remains a viable L1 alternative at ${percent(trial.score)}, with a ${range(trial.conditionalRange)}% range. These scores do not establish exact equivalence, intrinsic material values or that backward moves have no value.`, '',
    `The matched comparison uses the same ${comparison.sharedOpeningIds.length} complete cases for both bodies: QvN ${percent(comparison.trialScore)} versus QfN ${percent(comparison.controlScore)}, a ${pp(comparison.difference)}-percentage-point difference with a conditional ${range(comparison.conditionalRange)}-point range. That interval includes zero. The raw overall difference is ${pp(trial.score - control.score)} points because the headline QfN score includes all thirty-two cases; it is not the matched gain.`, '',
    `On matched first-half cases, QfN scores ${percent(comparison.halves[0].controlScore)} and QvN ${percent(comparison.halves[0].trialScore)} (${comparison.halves[0].sharedOpeningIds.length} cases). In the second half QfN scores ${percent(comparison.halves[1].controlScore)} and QvN ${percent(comparison.halves[1].trialScore)} (${comparison.halves[1].sharedOpeningIds.length} complete cases). This reversal is a reason to retain the paired comparison rather than treating one early average as intrinsic strength.`, '',
    '| Body | Cases 01–08 | Cases 09–16 | Cases 17–24 | Cases 25–32 |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...stage.rows.map(row => `| ${row.label} | ${stage.cohorts.map(cohort => {
      const item = cohort.rows.find(item => item.key === row.key);
      return `${percent(item.score)} (${item.openingCoverage.shared}/8)`;
    }).join(' | ')} |`), '',
    'One QvN/Two-step-pawn game reached 400 plies. Its completed color partner remains archived but is excluded from paired scores. QvN’s overall row uses 186 games on thirty-one common cases, while its King-step-pawn and Pawn-grant cells retain their other complete pairs. QfN’s overall row uses 192 games. Per-reference cells above use the full uploaded matrix denominators rather than substituting restricted overall subsets.', '',
    'The previous QfN 44.79% screen used different case IDs and a different matched roster. Keep that earlier result separate instead of pooling it into the new average or attributing the change solely to sample size. The first sixteen and next sixteen cases here also show variation; thirty-two fixed positions are not 384 independent starts.', '',
    'Retain QfN and QvN for human and version-19 panel review. This audit schedules no automatic sixty-four-case extension, new movement revision, repricing, playable promotion or reference change.', '',
    '## Evidence limits', '', ...PROVENANCE.limitations.map(note => `- ${note}`), '',
    'Exact uploaded bytes are retained in deterministic gzip archives with original and archive SHA-256 pins. Compatibility descriptors and the fresh-control mapping were reconstructed from v0.18.10 declarations, not recovered original execution manifests.', '',
    'Run `node scripts/balance/v18-queen32-evidence.js` to verify offline; `--write` regenerates only the derived audit and this review. Older evidence remains unchanged.', ''].join('\n');
}
function main(args = process.argv.slice(2), { log = console.log } = {}) {
  assert.ok(!args.length || args.length === 1 && args[0] === '--write', 'Use no arguments or --write.');
  const audit = buildAudit();
  for (const [name, content] of [[`${PREFIX}.audit.json`, JSON.stringify(audit) + '\n'], [`${PREFIX}.report.md`, renderAudit(audit)]]) {
    const file = path.join(ROOT, name);
    if (args.length) fs.writeFileSync(file, content); else assert.equal(normalize(fs.readFileSync(file, 'utf8')), content, `Derived artifact changed: ${name}.`);
  }
  log(`V18 queen32 verified: ${audit.counts.finalizedGames} finalized games, ${audit.counts.completePairs} scored pairs; no searches or new games.`);
  return audit;
}
if (require.main === module) { try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; } }
module.exports = { PREFIX, SOURCES_SHA256, STUDY, TARGET, PROVENANCE, sources, analyzeStudy, loadEvidence, matchedComparison, buildAudit, renderAudit, main };
