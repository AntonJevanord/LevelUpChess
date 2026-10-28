'use strict';

// Exact uploaded evidence and descriptive outcome projections only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { loadScreenEvidence, analyzeScreenRecords } = require('./v17-screen-evidence');
const { createV17Report, renderV17Report } = require('./v17-report');
const { getDesign } = require('../../src/design-catalog');

const RESULTS = path.resolve(__dirname, '../../experiments/balance/results');
const SOURCES = {
  "level3-revisions": {
    "journal": {
      "archiveFile": "v17-followup-001.level3-revisions.games.jsonl.gz",
      "archivedSha256": "6c85981f6702befb7784ec558d7ce6e85ce7879a8de450382ab3c3ebc92663a2",
      "originalName": "games.jsonl",
      "sha256": "bf65a753ab2fe95e8ceb13f3f64333fec1cd235b5ae2da932fa9dc20d6bbf759",
      "bytes": 2155189
    },
    "uploadedReport": {
      "archiveFile": "v17-followup-001.level3-revisions.uploaded-report.md.gz",
      "archivedSha256": "d5d3a04cc371c7724b9d210a644cb00276f998b43e3963b21041c6bb56cefee7",
      "originalName": "v17-report.md",
      "sha256": "376aeb69e305b39d5951806c3ff2b471ea1d49945ccccc1347dc35c1fa047c7d",
      "bytes": 4343
    }
  },
  "level3-confirm": {
    "journal": {
      "archiveFile": "v17-followup-001.level3-confirm.games.jsonl.gz",
      "archivedSha256": "9eea9676acf1947cc1070b873750302354c9c40fdb5608b5ce05327e51a0fd2b",
      "originalName": "games.jsonl",
      "sha256": "8570022efdf0b1e70551a933b8e778294e59d0b87912037e801ae9bd9c6b3653",
      "bytes": 1907891
    },
    "uploadedReport": {
      "archiveFile": "v17-followup-001.level3-confirm.uploaded-report.md.gz",
      "archivedSha256": "d212bc3e9887882b0f0b65779b2796768e5dfe28da6c66865e06e0cd02a22f08",
      "originalName": "v17-report.md",
      "sha256": "5d359677df1f2fdd58f6b765059ef83f93a166b1c0446f36618d808cb7888558",
      "bytes": 5348
    }
  },
  "pawn-grants-revisions": {
    "journal": {
      "archiveFile": "v17-followup-001.pawn-grants-revisions.games.jsonl.gz",
      "archivedSha256": "9a91b6cce5e36c7022e2a55a5496976d7dfa78882498c62b7a12a5bda8fd2be5",
      "originalName": "games.jsonl",
      "sha256": "4f27e263ac401895ba77c109e9bbbc4a7a7bf95436ac45651c64553dcea792e8",
      "bytes": 1297013
    },
    "uploadedReport": {
      "archiveFile": "v17-followup-001.pawn-grants-revisions.uploaded-report.md.gz",
      "archivedSha256": "eb1f232d7a1a87956c2193705fcd7a85b1c243d64e84c58498cb855c5e4785dc",
      "originalName": "v17-report.md",
      "sha256": "db55dd9b830997b74ddf9f959e1857230f9772eda32174b455c9d1361dce2fc2",
      "bytes": 3236
    }
  }
};

for (const source of Object.values(SOURCES)) {
  Object.values(source).forEach(Object.freeze); Object.freeze(source);
}
Object.freeze(SOURCES);
const PROVENANCE = Object.freeze({
  originalManifestSupplied: false, nativePreflightSupplied: false,
  engineSha256: null, legalMovesIndependentlyReplayed: false,
  descriptorKind: 'derived declaration compatibility descriptor',
  limitations: Object.freeze([
    'Original run.json and v17-preflight.json were not uploaded. Reconstructed declarations check recorded identities and settings; they do not attest to original engine binaries or native value tables.',
    'The audit summarizes recorded completed outcomes without independently replaying moves or certifying terminal positions. It fits no material values or Elo.',
    'The sixteen fixed, related opening cases support descriptive comparisons, not population confidence intervals or demonstrated balance equivalence.',
  ]),
});
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const percent = value => value === null ? 'pending' : `${(100 * value).toFixed(2)}%`;
const md = value => String(value).replace(/[\r\n]/g, ' ').replace(/\|/g, '\\|');

function readPinnedSource(source, readArchive = file => fs.readFileSync(file)) {
  const archived = readArchive(path.join(RESULTS, source.archiveFile));
  assert.equal(sha(archived), source.archivedSha256, `Archive hash changed: ${source.archiveFile}.`);
  const bytes = zlib.gunzipSync(archived);
  assert.equal(bytes.length, source.bytes, `Original byte count changed: ${source.archiveFile}.`);
  assert.equal(sha(bytes), source.sha256, `Original hash changed: ${source.archiveFile}.`);
  return bytes;
}

function analyzeFollowupRecords(experiment, records, uploadedReport) {
  assert.ok(Object.hasOwn(SOURCES, experiment), `Unknown follow-up experiment: ${String(experiment)}.`);
  // Reuse the declaration/schedule/profile/ply validation, not its old renderer.
  const analysis = analyzeScreenRecords(experiment, records);
  if (uploadedReport !== undefined) assert.equal(renderV17Report(analysis.report, { includeOverallSummaryScore: false }), uploadedReport,
    'Recomputed outcome report differs from the exact uploaded report.');
  return { ...analysis, declaration: { ...analysis.declaration, reportReproducedExactly: uploadedReport !== undefined } };
}

function loadFollowupEvidence(experiment, { readArchive } = {}) {
  const source = SOURCES[experiment];
  assert.ok(source, `Unknown follow-up experiment: ${String(experiment)}.`);
  const journal = readPinnedSource(source.journal, readArchive);
  assert.ok(journal.length && journal[journal.length - 1] === 10, 'Uploaded journals must end with a complete newline.');
  const records = journal.toString('utf8').slice(0, -1).split('\n').map(JSON.parse);
  const uploadedReport = readPinnedSource(source.uploadedReport, readArchive).toString('utf8');
  return { ...analyzeFollowupRecords(experiment, records, uploadedReport), source, provenance: PROVENANCE };
}

/** Pool outcomes only after validating each source under its original profile.
 * This projection never assigns old histories to a new rules profile. */
function combineLevel3(confirm, revisions, initial = loadScreenEvidence('level3')) {
  assert.equal(confirm.experiment, 'level3-confirm');
  assert.equal(revisions.experiment, 'level3-revisions');
  const oldById = new Map(initial.config.comparisons.map(item => [item.id, item]));
  for (const comparison of confirm.config.comparisons) {
    const old = oldById.get(comparison.id);
    for (const field of ['armyA', 'armyB', 'strengthA', 'strengthB']) assert.ok(old && isDeepStrictEqual(old[field], comparison[field]),
      'Cannot combine a changed design, starting army or strength with historical outcomes.');
  }
  for (const field of ['engine', 'evaluation', 'repetitions']) {
    assert.deepEqual(initial.config[field], confirm.config[field], 'Historical search or evaluation context changed.');
    assert.deepEqual(confirm.config[field], revisions.config[field], 'Revision search or evaluation context changed.');
  }
  const oldIds = new Set(initial.config.openings.map(item => item.id));
  const oldMoves = new Set(initial.config.openings.map(item => JSON.stringify(item.moves)));
  assert.ok(!confirm.config.openings.some(item => oldIds.has(item.id) || oldMoves.has(JSON.stringify(item.moves))),
    'Old and new opening cases overlap.');
  const openings = [...initial.config.openings, ...confirm.config.openings];
  assert.deepEqual(revisions.config.openings, openings, 'Revision cases do not match the two unchanged opening cohorts.');
  const selected = new Set(confirm.config.comparisons.map(item => item.id));
  const historical = initial.records.filter(record => selected.has(record.comparisonId));
  const records = [...historical, ...confirm.records, ...revisions.records];
  assert.equal(new Set(records.map(record => record.id)).size, records.length, 'Outcome projection repeats a game identity.');
  const config = { ...confirm.config, name: 'Version 17: level-three results across sixteen opening cases', openings,
    comparisons: [...confirm.config.comparisons, ...revisions.config.comparisons] };
  const metadata = { ...confirm.metadata, rows: [...confirm.metadata.rows, ...revisions.metadata.rows],
    comparisons: [...confirm.metadata.comparisons, ...revisions.metadata.comparisons] };
  assert.equal(new Set(config.comparisons.map(item => item.id)).size, config.comparisons.length, 'A revision overlaps an unchanged comparison.');
  const declaration = { experiment: 'level3-sixteen-outcome-projection', config, metadata };
  const report = createV17Report({ ...declaration, records });
  assert.equal(report.progress.completedGames, 1792);
  assert.equal(report.progress.pairedGames, 1792);
  assert.ok(report.overall.rows.every(row => row.games === 128 && row.openingCoverage.shared === 16));
  return { ...declaration, records, report, historicalGamesReused: historical.length,
    source: { journal: initial.source.journal, uploadedReport: initial.source.uploadedReport, provenance: initial.provenance } };
}

function compactRows(analysis, openingsByCohort) {
  const { config, metadata, records, report } = analysis;
  const cohorts = Object.fromEntries(Object.entries(openingsByCohort).map(([cohort, ids]) => {
    const selected = new Set(ids);
    const result = createV17Report({ experiment: analysis.experiment, config: { ...config, openings: config.openings.filter(item => selected.has(item.id)) },
      metadata, records: records.filter(record => selected.has(record.openingId)) });
    return [cohort, new Map(result.overall.rows.map(row => [row.key, row]))];
  }));
  const byId = new Map(config.comparisons.map(item => [item.id, item]));
  return report.overall.rows.map(row => {
    const comparison = metadata.comparisons.find(item => item.aKey === row.key);
    const army = byId.get(comparison.id).armyA;
    const designIds = [...new Set([...Object.values(army.upgrades || {}), ...(army.reserve || []).map(item => item.id)])];
    return { key: row.key, label: row.label, designIds, movements: designIds.map(id => getDesign(id).movement),
      games: row.games, wins: row.wins, draws: row.draws, losses: row.losses, score: row.score,
      opponents: row.opponents.map(item => ({ key: item.key, label: item.label, games: item.games, wins: item.wins, draws: item.draws, losses: item.losses, score: item.score })),
      openingCoverage: row.openingCoverage,
      cohorts: Object.fromEntries(Object.entries(cohorts).map(([cohort, values]) => [cohort, {
        score: values.get(row.key).score, opponents: values.get(row.key).opponents.map(item => ({ key: item.key, score: item.score })),
        games: values.get(row.key).games, wins: values.get(row.key).wins, draws: values.get(row.key).draws, losses: values.get(row.key).losses,
      }])) };
  });
}

function buildFollowupEvidenceAudit() {
  const experiments = Object.fromEntries(Object.keys(SOURCES).map(name => [name, loadFollowupEvidence(name)]));
  const confirm = experiments['level3-confirm'], revisions = experiments['level3-revisions'];
  const initial = loadScreenEvidence('level3');
  const combined = combineLevel3(confirm, revisions, initial);
  const cohorts = { originalEight: initial.config.openings.map(item => item.id), newEight: confirm.config.openings.map(item => item.id) };
  return {
    schemaVersion: 1, format: 'levelup-v17-followup-evidence', recordedDate: '2026-10-28', provenance: PROVENANCE,
    method: { score: '(wins + draws / 2) / scored games', opponentWeight: 'four fixed references equally',
      openingWeight: 'sixteen fixed cases equally; every case has both colors against all four references',
      historicalReuse: 'Only nine unchanged immutable designs reuse the archived original eight cases; revised designs keep separate outcomes.',
      interval: 'No confidence interval, material fit or Elo estimate is claimed.' },
    sources: Object.values(experiments).map(item => ({ experiment: item.experiment, source: item.source,
      declaration: item.declaration, progress: item.report.progress, provenance: item.provenance })),
    initialSource: { source: initial.source, declaration: initial.declaration, provenance: initial.provenance },
    counts: { newlyUploadedCompletedGames: 1600, historicalGamesReused: combined.historicalGamesReused,
      distinctScoredGames: combined.report.progress.pairedGames + experiments['pawn-grants-revisions'].report.progress.pairedGames,
      level3Games: combined.report.progress.pairedGames, pawnGrantGames: 384, engineSearches: 0, newMatchGames: 0 },
    level3: compactRows(combined, cohorts), pawnGrants: compactRows(experiments['pawn-grants-revisions'], cohorts),
  };
}

function renderMatrix(lines, rows) {
  lines.push('| Candidate | Vanguard | Unicorn | Cruisader | Amazon | Overall score | W / D / L | Games |',
    '| --- | ---: | ---: | ---: | ---: | ---: | :--- | ---: |');
  for (const row of rows) lines.push(`| ${md(row.label)} | ${row.opponents.map(item => percent(item.score)).join(' | ')} | ${percent(row.score)} | ${row.wins} / ${row.draws} / ${row.losses} | ${row.games} |`);
  lines.push('');
}

function renderFollowupEvidenceAudit(audit) {
  const lines = ['# Version-17 results across sixteen starting cases', '',
    'Every row below contains **128 games**: 16 fixed starting cases × both colors × four reference opponents. Scores count a draw as half a point. The nine unchanged pieces combine the original eight cases with eight new cases; all five revised pieces already played all sixteen. No revised result is pooled with its predecessor.', '',
    '## Level-three replacements', ''];
  renderMatrix(lines, audit.level3);
  lines.push('The four reference columns each contain 32 games per row. Overall score weights all references and cases equally; it is not the percentage of decisive games won.', '',
    '## Original and new opening cohorts', '',
    '| Candidate | Original eight | New eight | All sixteen |', '| --- | ---: | ---: | ---: |');
  for (const row of audit.level3) lines.push(`| ${md(row.label)} | ${percent(row.cohorts.originalEight.score)} | ${percent(row.cohorts.newEight.score)} | ${percent(row.score)} |`);
  lines.push('', 'Each cohort contains 64 games per row. These are the same definition in both cohorts, including the revised pieces; predecessor results are excluded.', '',
    '## Level-one pawn and grant bundles', '',
    'Each row buys three one-point upgrades. Pawn upgrades use c2/d2/e2; the guard bundle starts with three finite reserves. Drop rules and ordinary royal kings stay unchanged.', '');
  renderMatrix(lines, audit.pawnGrants);
  lines.push('## Design implications', '',
    '- Rook pawn with backward two-square captures scores 46.09%; the unlimited forward-capture alternative scores 43.75%. Both meet the provisional panel target; this small score difference does not establish a superior design. Movement identity and human playtesting can decide between them.',
    '- Mating bishop averages 56.64%, but scores 73.44% against Amazon (65.63% on the original cases; 81.25% on the new cases). That repeated matchup merits a design review; outcomes alone do not establish a forced queen trade or its frequency.',
    '- Archbishop scores 64.06% overall and 78.13% against Amazon. Ranged rook scores 59.77% overall and 75.00% against Amazon. These deserve the same matchup-focused review before declaring the roster balanced.',
    '- Quiet-diagonal pawns remain weak at 24.61%; two-step pawns score 50.39%. Parking the weak line avoids repeatedly buffing a design when a readable alternative already meets the target.',
    '- Diagonal grants score 62.89%. This is above the provisional 40–60% panel target, while not proving that a particular alternative will be weaker or more fun.', '',
    '## Evidence and limits', '',
    'All 1,600 newly uploaded games completed, with no errors, truncations or missing color partners. The six exact uploads are preserved as deterministic gzip archives with pinned compressed/original SHA-256 hashes and byte counts. All three uploaded reports reproduce from their journals using the previous renderer layout. An additional 576 archived games are reused only for unchanged designs.', '',
    'Original run manifests and native preflight proofs were not uploaded. Configurations, schedules, registries and profiles are reconstructed to check recorded context; they do not certify original engine binaries or value tables. This audit does not independently replay moves or certify terminal positions. Sixteen fixed, related opening cases remain a descriptive screen, not a population confidence interval, a material-value estimate or Elo.', '',
    'Reproduce this report, its compact audit JSON and matrix CSV offline:', '',
    '```powershell', 'node scripts/balance/v17-followup-evidence.js', '```', '',
    'Use `--write` to regenerate derived outputs. Source uploads are unchanged and no engine searches or match games are started.', '');
  return lines.join('\n');
}

function renderFollowupCsv(audit) {
  const quote = value => /[",\r\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value);
  const fields = ['section', 'candidate', 'design_ids', 'vanguard_score', 'unicorn_score', 'cruisader_score', 'amazon_score', 'overall_score', 'games', 'wins', 'draws', 'losses', 'original_eight_score', 'new_eight_score'];
  const rows = ['level3', 'pawnGrants'].flatMap(section => audit[section].map(row => [section, row.label, row.designIds.join(';'),
    ...row.opponents.map(item => item.score), row.score, row.games, row.wins, row.draws, row.losses, row.cohorts.originalEight.score, row.cohorts.newEight.score]));
  return [fields, ...rows].map(row => row.map(quote).join(',')).join('\n') + '\n';
}

function main(args = process.argv.slice(2)) {
  assert.ok(!args.length || args.length === 1 && args[0] === '--write', 'Use no arguments to verify or --write to regenerate.');
  const audit = buildFollowupEvidenceAudit();
  for (const [name, content] of [
    ['v17-followup-001.audit.json', json(audit)],
    ['v17-followup-001.report.md', renderFollowupEvidenceAudit(audit)],
    ['v17-followup-001.matrix.csv', renderFollowupCsv(audit)],
  ]) {
    const file = path.join(RESULTS, name);
    if (args.includes('--write')) fs.writeFileSync(file, content);
    else assert.equal(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), content, `Derived follow-up artifact changed: ${name}.`);
  }
  console.log('Version-17 follow-up audit passed: 1,600 uploaded completions + 576 unchanged historical games; no searches or new matches.');
  return audit;
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; }
}
module.exports = { SOURCES, PROVENANCE, analyzeFollowupRecords, loadFollowupEvidence, combineLevel3,
  compactRows, buildFollowupEvidenceAudit, renderFollowupEvidenceAudit, renderFollowupCsv, main };
