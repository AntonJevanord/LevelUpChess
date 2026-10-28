'use strict';

// Outcome audit of exact uploads. A reconstructed declaration is not original
// process provenance, a native value proof or an independent move replay.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const { createHash } = require('node:crypto');
const { analyzeScreenRecords } = require('./v17-screen-evidence');
const { createV17Report, renderV17Report } = require('./v17-report');

const ROOT = path.resolve(__dirname, '../../experiments/balance/results');
const SOURCES = Object.freeze({
  journal: Object.freeze({ archiveFile: 'v17-focus-001.games.jsonl.gz', archivedSha256: '565cdb4a3031980d90418a5a72e735e39ee788781a53dd8d2237841b8fdf8d67',
    originalName: 'games.jsonl', sha256: '8b44db63c4f2b270653aa76aa37dfdf4f6e8eb7bae00e3ccdac87e291ac55bbd', bytes: 2233082 }),
  uploadedReport: Object.freeze({ archiveFile: 'v17-focus-001.uploaded-report.md.gz', archivedSha256: 'fa189e7258630dc54550f6f7a1cf16d5159717819ab8ca36ba3a459cfb51634c',
    originalName: 'v17-report.md', sha256: '281ef71bf4336c1be2f226b026a933d8daf958ffc3481fef80ed5015df9cfb64', bytes: 4184 }),
});
const PROVENANCE = Object.freeze({ originalManifestSupplied: false, nativePreflightSupplied: false,
  engineSha256: null, legalMovesIndependentlyReplayed: false,
  descriptorKind: 'derived declaration compatibility descriptor' });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const percent = value => value === null ? 'pending' : `${(100 * value).toFixed(2)}%`;

function loadFocusEvidence({ readArchive = file => fs.readFileSync(file) } = {}) {
  const decoded = Object.fromEntries(Object.entries(SOURCES).map(([key, source]) => {
    const compressed = readArchive(path.join(ROOT, source.archiveFile));
    assert.equal(sha(compressed), source.archivedSha256, `Archive changed: ${source.archiveFile}.`);
    const bytes = gunzipSync(compressed);
    assert.equal(sha(bytes), source.sha256, `Original bytes changed: ${source.archiveFile}.`);
    assert.equal(bytes.length, source.bytes);
    return [key, bytes];
  }));
  assert.equal(decoded.journal.at(-1), 10, 'The exact journal must have a complete final newline.');
  const records = decoded.journal.toString('utf8').trimEnd().split('\n').map(JSON.parse);
  const analysis = analyzeScreenRecords('design-focus', records);
  assert.equal(renderV17Report(analysis.report), decoded.uploadedReport.toString('utf8'), 'Uploaded report does not reproduce.');
  return { ...analysis, source: SOURCES, provenance: PROVENANCE };
}

function buildFocusAudit() {
  const source = loadFocusEvidence();
  const { config, metadata, report, records } = source;
  const cohorts = Object.fromEntries(metadata.openingCohorts.map(cohort => {
    const ids = new Set(cohort.openingIds);
    const result = createV17Report({ experiment: source.experiment,
      config: { ...config, openings: config.openings.filter(item => ids.has(item.id)) }, metadata,
      records: records.filter(record => ids.has(record.openingId)) });
    return [cohort.id, result];
  }));
  return { schemaVersion: 1, format: 'levelup-v17-design-focus-evidence', recordedDate: '2026-10-28',
    sources: SOURCES, provenance: PROVENANCE, declaration: { ...source.declaration, reportReproducedExactly: true },
    counts: { completedGames: report.progress.completedGames, pairedGames: report.progress.pairedGames,
      completePairs: report.progress.completePairs, newMatchGames: 0, engineSearches: 0 },
    rows: report.overall.rows.map(row => {
      const matrixRow = report.matrix.rows.find(item => item.key === row.key);
      const baseline = matrixRow.cells.find(item => item.columnKey === 'two-step-pawns');
      return { key: row.key, label: row.label, score: row.score, games: row.games,
        wins: row.wins, draws: row.draws, losses: row.losses, opponents: row.opponents,
        baseline: { games: baseline.pairedGames, wins: baseline.wins, draws: baseline.draws,
          losses: baseline.losses, score: baseline.score },
        physicalColors: source.aggregates.find(item => item.key === row.key).physicalColors,
        cohorts: Object.fromEntries(Object.entries(cohorts).map(([name, result]) => {
          const overall = result.overall.rows.find(item => item.key === row.key);
          const cell = result.matrix.rows.find(item => item.key === row.key).cells.find(item => item.columnKey === 'two-step-pawns');
          return [name, { referenceScore: overall.score, baselineScore: cell.score }];
        })) };
    }) };
}

function renderFocusAudit(audit) {
  const lines = ['# Version-17 design-focus results', '',
    'All **640 games completed**, with 320 complete color pairs and no errors or truncations. Each reference column contains 32 games per army. Overall weights the four references equally; the three-two-step-pawn matchup is separate. Draws count half a point.', '',
    '| Purchase | Vanguard | Unicorn | Cruisader | Amazon | Reference overall | Three two-step pawns |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |'];
  for (const row of audit.rows) lines.push(`| ${row.label} | ${row.opponents.map(item => percent(item.score)).join(' | ')} | ${percent(row.score)} | ${percent(row.baseline.score)} |`);
  lines.push('', '| Purchase | References: original / new eight | Two-step pawns: original / new eight |',
    '| --- | ---: | ---: |');
  for (const row of audit.rows) {
    const [old, fresh] = Object.values(row.cohorts);
    lines.push(`| ${row.label} | ${percent(old.referenceScore)} / ${percent(fresh.referenceScore)} | ${percent(old.baselineScore)} / ${percent(fresh.baselineScore)} |`);
  }
  lines.push('', '## Interpretation', '',
    '- Keep Grid bishop `BDC` at level 3 provisionally: 58.59% across references and 48.44–64.06% in individual reference matchups. Its 76.56% against the pawn bundle is a matchup flag, not sufficient reason to reprice it to level 2.',
    '- Full-diagonal pawns remain weak against the reference panel at 34.77%. Their 48.44% against two-step pawns reverses from 65.63% to 31.25% between cohorts, so that direct comparison needs replication.',
    '- Long-forward grants average 55.86% against references but score 71.88% against two-step pawns in both cohorts. Take the direct matchup seriously as a possible counter or deployment effect; a shared reference average does not imply transitive equality.',
    '- Pawn-like grants average 63.67%; capture-square count alone does not explain strength. Direction, quiet mobility, deployment tempo, extra bodies and opponent interaction also matter.',
    '- Unicorn is relatively vulnerable to the full-diagonal pawns and long-forward grants compared with the other references. Pawn-like grants show a different opponent pattern; this does not make Unicorn universally weak.', '',
    'The next bounded batch adds sixteen new two-ply cases. Existing purchases receive only new cases; revisions receive all thirty-two. The two-step baseline also receives new reference games to test its stability. Historical games retain their own IDs and profiles.', '',
    '## Provenance and reproduction', '',
    'Exact uploaded bytes are archived with pinned original/compressed hashes. Recorded schedules, profiles and search settings match reconstructed declarations, and the uploaded Markdown reproduces exactly. Original run manifests and native preflight proofs were not supplied; this audit does not attest to the original executable/value tables, independently replay moves, fit material values or calculate Elo. The fixed related starts remain a descriptive screen.', '',
    '```powershell', 'node scripts/balance/v17-focus-evidence.js', '```', '',
    'Use `--write` to regenerate the derived JSON and this report. No searches or new games are started.', '');
  return lines.join('\n');
}

function main(args = process.argv.slice(2)) {
  assert.ok(!args.length || args.length === 1 && args[0] === '--write', 'Use no arguments or --write.');
  const audit = buildFocusAudit();
  for (const [name, text] of [['v17-focus-001.audit.json', JSON.stringify(audit, null, 2) + '\n'],
    ['v17-focus-001.report.md', renderFocusAudit(audit)]]) {
    const file = path.join(ROOT, name);
    if (args.length) fs.writeFileSync(file, text);
    else assert.equal(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), text, `Derived artifact changed: ${name}.`);
  }
  console.log('Design-focus evidence verified: 640 completed games, no searches or new matches.');
  return audit;
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; }
}
module.exports = { SOURCES, PROVENANCE, loadFocusEvidence, buildFocusAudit, renderFocusAudit, main };
