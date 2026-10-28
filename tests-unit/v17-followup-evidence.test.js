'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { createHash } = require('node:crypto');
const { renderV17Report } = require('../scripts/balance/v17-report');
const { loadScreenEvidence } = require('../scripts/balance/v17-screen-evidence');
const { SOURCES, PROVENANCE, analyzeFollowupRecords, loadFollowupEvidence, combineLevel3,
  buildFollowupEvidenceAudit, renderFollowupEvidenceAudit, renderFollowupCsv, main } = require('../scripts/balance/v17-followup-evidence');

const directory = path.resolve(__dirname, '../experiments/balance/results');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const evidence = Object.fromEntries(Object.keys(SOURCES).map(name => [name, loadFollowupEvidence(name)]));
const confirm = evidence['level3-confirm'], revisions = evidence['level3-revisions'];
const initial = loadScreenEvidence('level3');

test('six follow-up archives retain exact uploaded bytes with deterministic compressed identities', () => {
  assert.equal(Object.values(SOURCES).flatMap(Object.values).length, 6);
  for (const source of Object.values(SOURCES).flatMap(Object.values)) {
    const bytes = fs.readFileSync(path.join(directory, source.archiveFile)), raw = zlib.gunzipSync(bytes);
    assert.equal(sha(bytes), source.archivedSha256);
    assert.equal(sha(raw), source.sha256);
    assert.equal(raw.length, source.bytes);
    // Deflate bytes may change across supported Node/zlib releases. Pin the
    // archived stream and original bytes, plus the deterministic zero mtime.
    assert.equal(bytes.readUInt32LE(4), 0);
  }
  assert.throws(() => loadFollowupEvidence('foreign-experiment'), /Unknown follow-up/);
});

test('all three follow-up reports reproduce precisely with full paired schedules but no invented native provenance', () => {
  const counts = { 'level3-confirm': 576, 'level3-revisions': 640, 'pawn-grants-revisions': 384 };
  for (const [name, item] of Object.entries(evidence)) {
    const uploaded = zlib.gunzipSync(fs.readFileSync(path.join(directory, SOURCES[name].uploadedReport.archiveFile))).toString('utf8');
    assert.equal(renderV17Report(item.report, { includeOverallSummaryScore: false }), uploaded);
    assert.equal(item.report.progress.completedGames, counts[name]);
    assert.equal(item.report.progress.pairedGames, counts[name]);
    assert.equal(item.report.progress.duplicateCopiesIgnored, 0);
    assert.equal(item.report.runId, null);
    assert.equal(item.declaration.reportReproducedExactly, true);
    assert.deepEqual(item.provenance, PROVENANCE);
    assert.equal(item.provenance.originalManifestSupplied, false);
    assert.equal(item.provenance.nativePreflightSupplied, false);
    assert.equal(item.provenance.legalMovesIndependentlyReplayed, false);
    assert.equal(item.provenance.engineSha256, null);
  }
});

test('corruption, incomplete pairs and copied histories cannot add or silently drop evidence', () => {
  assert.throws(() => loadFollowupEvidence('level3-confirm', { readArchive(file) {
    const bytes = Buffer.from(fs.readFileSync(file)); bytes[bytes.length - 1] ^= 1; return bytes;
  } }), /Archive hash changed/);
  assert.throws(() => analyzeFollowupRecords('level3-confirm', confirm.records.slice(1)), /every scheduled game exactly once/);
  assert.throws(() => analyzeFollowupRecords('level3-confirm', [...confirm.records, confirm.records[0]]), /every scheduled game exactly once/);
  const copied = [...confirm.records]; copied[1] = copied[0];
  assert.throws(() => analyzeFollowupRecords('level3-confirm', copied), /repeats a game identity/);
  const truncated = [...confirm.records]; truncated[0] = { ...truncated[0], status: 'truncated', result: '*' };
  assert.throws(() => analyzeFollowupRecords('level3-confirm', truncated), /only completed games/);
});

test('record identities, original profiles, searches and opening prefixes are checked against declarations', () => {
  for (const change of [
    { id: 'foreign-id' }, { profileHash: 'foreign-profile' }, { registryHash: 'foreign-registry' },
    { engine: { ...confirm.config.engine, nodes: 100000 } }, { whiteStrength: { skill: 1 } },
    { openingId: 'foreign-opening' }, { openingMoves: [] },
  ]) {
    const records = [...confirm.records]; records[0] = { ...records[0], ...change };
    assert.throws(() => analyzeFollowupRecords('level3-confirm', records), /frozen|context|opening|ply count/);
  }
});

test('only unchanged designs reuse exactly 576 old games and every projected row has 128 games on sixteen cases', () => {
  const combined = combineLevel3(confirm, revisions, initial);
  assert.equal(combined.historicalGamesReused, 576);
  assert.equal(combined.report.progress.pairedGames, 1792);
  assert.equal(combined.report.overall.rows.length, 14);
  assert.ok(combined.report.overall.rows.every(row => row.games === 128 && row.openingCoverage.shared === 16 && row.opponents.length === 4));
  assert.ok(combined.report.comparisons.every(row => row.pairedGames === 32 && row.completePairs === 16));
  const rows = new Map(combined.report.overall.rows.map(row => [row.label, row]));
  assert.equal(rows.get('Queen pawn').score, 0.5859375);
  assert.equal(rows.get('Nightrider').score, 0.48046875);
  assert.equal(rows.get('Princess knight').score, 0.5859375);
  assert.equal(rows.get('Archbishop').score, 0.640625);
  assert.equal(rows.get('Ranged rook').score, 0.59765625);
  assert.equal(rows.get('Rook pawn: backward captures').score, 0.4609375);
  assert.equal(rows.get('Mating bishop: short capture set').score, 0.56640625);
  assert.equal(rows.get('Mating bishop: short capture set').opponents.find(item => item.key === 'amazon').score, 0.734375);
  assert.equal(combined.records.filter(record => record.comparisonId.startsWith('bishop-purple-14-')).length, 0);
});

test('projection refuses changed historical designs, settings, overlapping openings or duplicate records', () => {
  const changedArmy = clone(initial);
  changedArmy.config.comparisons.find(row => row.id === confirm.config.comparisons[0].id).armyA.upgrades = { d2: 'pawn.purple@11' };
  assert.throws(() => combineLevel3(confirm, revisions, changedArmy), /changed design/);
  const changedSearch = clone(initial); changedSearch.config.engine.nodes = 100000;
  assert.throws(() => combineLevel3(confirm, revisions, changedSearch), /search or evaluation/);
  const overlapping = clone(initial); overlapping.config.openings[0] = confirm.config.openings[0];
  assert.throws(() => combineLevel3(confirm, revisions, overlapping), /overlap/);
  const copied = { ...confirm, records: [...confirm.records, confirm.records[0]] };
  assert.throws(() => combineLevel3(copied, revisions, initial), /repeats a game identity/);
});

test('cohort comparisons retain actual definition changes and report the replicated Amazon matchups', () => {
  const audit = buildFollowupEvidenceAudit();
  assert.deepEqual(audit.counts, { newlyUploadedCompletedGames: 1600, historicalGamesReused: 576,
    distinctScoredGames: 2176, level3Games: 1792, pawnGrantGames: 384, engineSearches: 0, newMatchGames: 0 });
  const mating = audit.level3.find(row => row.designIds.includes('bishop.purple@17'));
  assert.equal(mating.cohorts.originalEight.opponents.find(row => row.key === 'amazon').score, 0.65625);
  assert.equal(mating.cohorts.newEight.opponents.find(row => row.key === 'amazon').score, 0.8125);
  const pawns = Object.fromEntries(audit.pawnGrants.map(row => [row.designIds[0], row]));
  assert.equal(pawns['pawn.blue@4'].score, 0.24609375);
  assert.equal(pawns['pawn.blue@5'].score, 0.50390625);
  assert.equal(pawns['king.reserve-pawn@2'].score, 0.62890625);
  assert.equal(pawns['pawn.blue@5'].cohorts.originalEight.score, 0.5);
  assert.equal(pawns['pawn.blue@5'].cohorts.newEight.score, 0.5078125);
});

test('derived Markdown, JSON and CSV reproduce offline and give percentages beside WDL', () => {
  const audit = buildFollowupEvidenceAudit(), report = renderFollowupEvidenceAudit(audit), csv = renderFollowupCsv(audit);
  assert.match(report, /\| Overall score \| W \/ D \/ L \| Games \|/);
  assert.match(report, /\| Queen pawn \|[^\n]*58\.59% \| 69 \/ 12 \/ 47 \| 128 \|/);
  assert.match(report, /Original run manifests and native preflight proofs were not uploaded/);
  assert.match(report, /not.*population confidence interval/);
  assert.equal(csv.trim().split('\n').length, 18);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'v17-followup-001.audit.json'), 'utf8')), audit);
  assert.equal(fs.readFileSync(path.join(directory, 'v17-followup-001.report.md'), 'utf8'), report);
  assert.equal(fs.readFileSync(path.join(directory, 'v17-followup-001.matrix.csv'), 'utf8'), csv);
  assert.doesNotThrow(() => main([]));
});
