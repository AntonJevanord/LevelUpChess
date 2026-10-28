'use strict';

// Exact user uploads plus a declaration-compatibility audit. No original run
// manifest, native proof or engine executable was supplied with these files.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { createHash } = require('node:crypto');
const { loadExperiment } = require('./v17-plan');
const { makeSchedule } = require('./plan');
const { createDesignRegistry } = require('./design-registry');
const { compileDesignProfile } = require('./design-profile');
const { getOfficialReferences } = require('./official-references');
const { createV17Report, renderV17Report } = require('./v17-report');

const RESULTS = path.resolve(__dirname, '../../experiments/balance/results');
const SOURCES = {
  level3: {
    journal: { archiveFile: 'v17-screen-001.level3.games.jsonl.gz', archivedSha256: '73cb45f5e4c6ad9b3453d9282fd2cee9bd3d7bf86d35fd3f1ba1e726ea10058f', originalName: 'games.jsonl', sha256: 'aba44b4801c03ae50b01dab878f742fa7193455c8a0692d5b8f409aaf2b1697f', bytes: 2733335 },
    uploadedReport: { archiveFile: 'v17-screen-001.level3.uploaded-report.md.gz', archivedSha256: '1b2af644010b26328325be26d14f2b25e0efcfee60fe708739286b93d150d95e', originalName: 'v17-report.md', sha256: 'd68801386447e5f9f1df9442921a6b36b4183d09cbbc1bba298761ae191b50d3', bytes: 5505 },
  },
  'pawn-grants': {
    journal: { archiveFile: 'v17-screen-001.pawn-grants.games.jsonl.gz', archivedSha256: '0f948061c0e4f727badbcc5a69fccf1ab0a8104b6975c48e4a5be348e5c049a8', originalName: 'games.jsonl', sha256: 'f2106bb6355c0ed55ed3364da21eccdc040a77b8db1fb83de1226ed8df7558d0', bytes: 810819 },
    uploadedReport: { archiveFile: 'v17-screen-001.pawn-grants.uploaded-report.md.gz', archivedSha256: 'd7c98d3b4df2baeaca3e2bc84d3ed3df3e2cad0ed0dfec3de3ef1d19225f1d10', originalName: 'v17-report.md', sha256: '69bd802be4d05652907f6d3fdf240b7ebe5af6c780e1511b8aec6391d5dbf0a4', bytes: 2681 },
  },
  'reference-2v2': {
    journal: { archiveFile: 'v17-screen-001.reference-2v2.games.jsonl.gz', archivedSha256: '7b08875c0bfc8bea8120d80ac81adacf9b9e63dd8c279abd273e435855daeddd', originalName: 'games.jsonl', sha256: 'a2ae4387885fc6a551e91eef98faa772327c9df5a338bb733e0be648e0f53e71', bytes: 773406 },
    uploadedReport: { archiveFile: 'v17-screen-001.reference-2v2.uploaded-report.md.gz', archivedSha256: '82aa7667ef703dca3bf2068b4f8d5c29343b80bc231c0a2e0e11840faed9956d', originalName: 'v17-report.md', sha256: '26b6f31bf29e801d18ffbdee495c47f897669415ac08266cac0fefb767c207bf', bytes: 2969 },
  },
};
for (const source of Object.values(SOURCES)) {
  Object.values(source).forEach(Object.freeze); Object.freeze(source);
}
Object.freeze(SOURCES);
const PROVENANCE = Object.freeze({
  originalManifestSupplied: false,
  nativePreflightSupplied: false,
  engineSha256: null,
  legalMovesIndependentlyReplayed: false,
  descriptorKind: 'derived declaration compatibility descriptor',
  limitations: Object.freeze([
    'The original run.json and v17-preflight.json were not uploaded; reconstructed declarations do not attest to the original process, executable or native value tables.',
    'Recorded identities, search settings and result summaries match the declared protocols; engine names are recorded strings, not binary provenance.',
    'The audit does not independently replay legal moves or certify terminal positions, and does not fit material values or Elo.',
    'Eight fixed related opening cases support descriptive screening, not population confidence intervals; leave-one-opening-out ranges measure sensitivity only.',
  ]),
});
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const scoreForA = record => record.result === '1/2-1/2' ? 0.5 : Number((record.result === '1-0') === (record.aColor === 'w'));

function readPinnedSource(source, readArchive = file => fs.readFileSync(file)) {
  const archived = readArchive(path.join(RESULTS, source.archiveFile));
  assert.equal(sha(archived), source.archivedSha256, `Archive hash changed: ${source.archiveFile}.`);
  const decoded = zlib.gunzipSync(archived);
  assert.equal(decoded.length, source.bytes, `Original byte count changed: ${source.archiveFile}.`);
  assert.equal(sha(decoded), source.sha256, `Original hash changed: ${source.archiveFile}.`);
  return decoded;
}

function summarizeRows(experiment, records, metadata) {
  const referenceKeys = new Set(getOfficialReferences().roster.map(reference => reference.key));
  const comparisons = new Map(metadata.comparisons.map(comparison => [comparison.id, comparison]));
  return metadata.rows.map(row => {
    const samples = [];
    for (const record of records) {
      const comparison = comparisons.get(record.comparisonId);
      if (experiment === 'reference-2v2') {
        if (comparison.aKey === row.key) samples.push({ score: scoreForA(record), record, color: record.aColor, opponent: comparison.bKey });
        else if (comparison.bKey === row.key) samples.push({ score: 1 - scoreForA(record), record, color: record.aColor === 'w' ? 'b' : 'w', opponent: comparison.aKey });
      } else if (comparison.aKey === row.key && referenceKeys.has(comparison.bKey)) {
        samples.push({ score: scoreForA(record), record, color: record.aColor, opponent: comparison.bKey });
      }
    }
    assert.ok(samples.length, `No reference or team samples for ${row.label}.`);
    const group = selector => {
      const groups = new Map();
      for (const sample of samples) {
        const key = selector(sample), values = groups.get(key) || [];
        values.push(sample.score); groups.set(key, values);
      }
      return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([key, scores]) => ({ key, games: scores.length, score: mean(scores) }));
    };
    const openings = group(sample => sample.record.openingId);
    const byOpponent = group(sample => sample.opponent);
    const leaveOneOut = openings.map(omitted => ({ omitted: omitted.key,
      score: mean(openings.filter(opening => opening.key !== omitted.key).map(opening => opening.score)) }));
    const pooled = mean(openings.map(opening => opening.score));
    const low = byOpponent.filter(opponent => opponent.score < 0.4).length;
    const high = byOpponent.filter(opponent => opponent.score > 0.6).length;
    // Explicitly retrospective coarse flags, not preregistered significance tests.
    const flag = experiment === 'reference-2v2' ? 'descriptive-team-baseline'
      : pooled < 0.35 && low >= 3 ? 'coarse-low-outlier'
        : pooled > 0.65 && high >= 3 ? 'coarse-high-outlier' : 'unchanged-follow-up';
    return { key: row.key, label: row.label, scope: experiment === 'reference-2v2' ? 'all five other reference teams' : 'four references only; direct bundle games excluded',
      games: samples.length, wins: samples.filter(sample => sample.score === 1).length,
      draws: samples.filter(sample => sample.score === 0.5).length, losses: samples.filter(sample => sample.score === 0).length,
      score: pooled, physicalColors: group(sample => sample.color), openings, opponents: byOpponent,
      leaveOneOpeningOut: { lower: Math.min(...leaveOneOut.map(item => item.score)), upper: Math.max(...leaveOneOut.map(item => item.score)), omissions: leaveOneOut }, flag };
  });
}

function analyzeScreenRecords(experiment, records, uploadedReport) {
  const declaration = loadExperiment(experiment), { config, metadata } = declaration;
  const schedule = makeSchedule(config), registry = createDesignRegistry(config), profile = compileDesignProfile(registry, config.evaluation);
  assert.equal(records.length, schedule.length, 'The archived screen must contain every scheduled game exactly once.');
  assert.equal(new Set(records.map(record => record.id)).size, records.length, 'The archived screen repeats a game identity; copied games add no weight.');
  for (const record of records) {
    assert.equal(record.schemaVersion, 1, 'Unexpected recorded schema.');
    assert.equal(record.status, 'completed', 'The archived initial screen contains only completed games.');
    assert.equal(record.attempt, 1, 'The archived initial screen contains one attempt per game.');
    assert.ok(Array.isArray(record.moves) && record.moves.every(move => typeof move === 'string'), 'Recorded moves must be an array of strings.');
    assert.ok(Array.isArray(record.sans) && record.sans.length === record.moves.length, 'Recorded SAN and UCI counts differ.');
    assert.equal(record.totalPlies, record.moves.length, 'Recorded total ply count changed.');
    assert.equal(record.openingPlies, record.openingMoves.length, 'Recorded opening ply count changed.');
    assert.equal(record.playedPlies + record.openingPlies, record.totalPlies, 'Recorded played/opening ply counts differ.');
    assert.deepEqual(record.moves.slice(0, record.openingPlies), record.openingMoves, 'Recorded moves do not start with the declared opening.');
    assert.ok(['checkmate', 'insufficient-material', 'threefold-repetition', 'fifty-move-rule', 'stalemate'].includes(record.reason), 'Unexpected recorded terminal reason.');
    assert.equal(record.result === '1/2-1/2', record.reason !== 'checkmate', 'Recorded outcome and terminal reason disagree.');
  }
  // This object is generated now for comparison only, not restored run provenance.
  const derivedManifest = { config, schedule, designRegistry: registry, designProfile: profile };
  const report = createV17Report({ experiment, config, metadata, records, manifest: derivedManifest });
  assert.equal(report.progress.completedGames, schedule.length);
  assert.equal(report.progress.pairedGames, schedule.length);
  assert.equal(report.progress.duplicateCopiesIgnored, 0);
  if (uploadedReport !== undefined) assert.equal(renderV17Report(report, { includeOverall: false }), uploadedReport, 'Recomputed outcome report differs from the exact uploaded report.');
  return { experiment, records, config, metadata, profile, report, aggregates: summarizeRows(experiment, records, metadata),
    declaration: { configSha256: sha(JSON.stringify(config)), registryHash: registry.hash, profileHash: profile.hash,
      scheduleSha256: sha(JSON.stringify(schedule)), scheduledGames: schedule.length, reportReproducedExactly: uploadedReport !== undefined } };
}

function loadScreenEvidence(experiment, { readArchive } = {}) {
  const source = SOURCES[experiment];
  assert.ok(source, `Unknown initial-screen experiment: ${String(experiment)}.`);
  const journal = readPinnedSource(source.journal, readArchive);
  const uploadedReport = readPinnedSource(source.uploadedReport, readArchive).toString('utf8');
  assert.ok(journal.length && journal[journal.length - 1] === 10, 'The exact uploaded journal must end with a complete newline.');
  const records = journal.toString('utf8').slice(0, -1).split('\n').map(line => JSON.parse(line));
  return { ...analyzeScreenRecords(experiment, records, uploadedReport), source, provenance: PROVENANCE };
}

function buildScreenEvidenceAudit() {
  const experiments = Object.keys(SOURCES).map(experiment => {
    const loaded = loadScreenEvidence(experiment);
    return { experiment, source: loaded.source, declaration: loaded.declaration, progress: loaded.report.progress,
      comparisons: loaded.report.comparisons, matrix: loaded.report.matrix, aggregates: loaded.aggregates,
      recordedEngineNames: [...new Set(loaded.records.flatMap(record => Object.values(record.engineNames)))].sort() };
  });
  return { schemaVersion: 1, format: 'levelup-v17-initial-screen-evidence', recordedDate: '2026-10-28', provenance: PROVENANCE,
    method: { opponentWeight: 'equal fixed-reference or team weight', openingWeight: 'equal fixed-opening weight', draws: 'half a point',
      flags: 'Retrospective descriptive triage only: pooled score below 35% with at least three opponents below 40%, or above 65% with at least three opponents above 60%. Other candidates retain their definition for follow-up.',
      sensitivity: 'Delete one complete opening case at a time across all opponents and both colors; range is not a confidence interval.',
      decisionTarget: 'A future 40–60% pooled design target is not a per-cell significance test or a demonstrated equivalence band.' },
    totalCompletedGames: experiments.reduce((sum, item) => sum + item.progress.completedGames, 0), newMatchGames: 0, engineSearches: 0, experiments };
}

const percent = value => `${(value * 100).toFixed(2)}%`;
function renderScreenEvidenceAudit(audit) {
  const lines = ['# Version-17 initial screens', '',
    'All **1,312 games completed**, with no truncated games, errors or missing color partners. The exact six user uploads are archived as deterministic gzip files; the original bytes, names, sizes and SHA-256 hashes are pinned in the audit JSON and loader.', '',
    'All three uploaded Markdown reports reproduce byte-for-byte from their journals and the declared settings. The configuration, schedule, allocated registry and compiled profile are reconstructed for compatibility checks. **The original run manifests and native preflight proofs were not uploaded.** This audit does not attest to the original engine binary or native evaluation tables, independently replay legal moves, fit material values or calculate Elo.', ''];
  for (const experiment of audit.experiments) {
    lines.push(`## ${experiment.experiment}`, '', '| Army | Games | W / D / L | Score | White / Black | Leave-one-opening-out range | Coarse flag |',
      '| --- | ---: | :--- | ---: | :--- | :--- | :--- |');
    for (const row of experiment.aggregates) {
      const colors = Object.fromEntries(row.physicalColors.map(item => [item.key, item.score]));
      lines.push(`| ${row.label} | ${row.games} | ${row.wins} / ${row.draws} / ${row.losses} | ${percent(row.score)} | ${percent(colors.w)} / ${percent(colors.b)} | ${percent(row.leaveOneOpeningOut.lower)}–${percent(row.leaveOneOpeningOut.upper)} | ${row.flag} |`);
    }
    lines.push('', experiment.experiment === 'reference-2v2' ? 'Team scores average all five opponents. They describe partnership matchups without identifying individual strength or synergy.'
      : 'These pooled scores weight the four fixed references equally. Direct pawn/grant bundle matchups remain in the source report and audit matrix, but are excluded from this pooled comparison.', '');
  }
  lines.push('## Interpretation', '',
    'The Rook pawn, Mating bishop, Vertical bishop and Side rook are the clearest level-three revision signals. Queen pawn and most other designs should retain their movement for the next opening batch. Princess knight and Archbishop are borderline; Zebra queen is near the lower target boundary. Their individual opponent cells contain only 16 games, so apparent matchup differences need replication.', '',
    'The pawn upgrade bundles score 24.22% and 19.53% against references and need stronger alternatives. Three forward-step guards score 41.41%, so a forward-diagonal guard is an alternate worth testing, rather than a required correction established by this screen.', '',
    'Eight fixed, related cases provide a coarse screen. Leave-one-opening-out ranges describe sensitivity to those cases; they are not 95% confidence intervals. The retrospective flags use a pooled score below 35% or above 65% with at least three opponent scores beyond 40% or 60% in the same direction. These thresholds were chosen after seeing this screen and are not a preregistered hypothesis test.', '',
    'Preserve old results by immutable definition. Unchanged candidates can combine these eight cases with eight new cases; revised candidates need a separate identity and all sixteen cases. Do not pool a changed definition with its predecessor or relabel old games under a new profile. Keep the four references fixed and judge pooled performance alongside repeatable opponent differences.', '',
    'Vanguard–Amazon leads the 2v2 pilot at 60.0%; the other teams range from 44.4% to 50.6%. This is a baseline for later mixed-army work, not sufficient reason to change frozen references or add another whole 2v2 campaign now.', '',
    'Reproduce the archive audit without an engine:', '', '```powershell', 'node scripts/balance/v17-screen-evidence.js', '```', '',
    'Use `--write` to regenerate the derived audit JSON and this report. Exact uploaded reports and games remain untouched. No engine searches or new match games are performed.', '');
  return lines.join('\n');
}

function main(args = process.argv.slice(2)) {
  assert.ok(!args.length || args.length === 1 && args[0] === '--write', 'Use no arguments to verify or --write to regenerate.');
  const audit = buildScreenEvidenceAudit();
  const refreshedReports = Object.keys(SOURCES).map(experiment => {
    const rendered = renderV17Report(loadScreenEvidence(experiment).report);
    const note = '> Rebuilt from the archived uploads with an overall-score column. Original reports and games are unchanged. Original run manifests and native preflight proofs were not uploaded; see [the evidence audit](v17-screen-001.report.md).';
    return [`v17-screen-001.${experiment}.report.md`, rendered.replace('\n\n', `\n\n${note}\n\n`)];
  });
  for (const [name, content] of [
    ['v17-screen-001.audit.json', JSON.stringify(audit, null, 2) + '\n'],
    ['v17-screen-001.report.md', renderScreenEvidenceAudit(audit)],
    ...refreshedReports,
  ]) {
    const file = path.join(RESULTS, name);
    if (args.includes('--write')) fs.writeFileSync(file, content);
    else assert.equal(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), content, `Derived screen artifact changed: ${name}.`);
  }
  console.log(`Version-17 screen archive audit passed: ${audit.totalCompletedGames} completed games; no new match games or engine searches.`);
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; }
}
module.exports = { SOURCES, PROVENANCE, loadScreenEvidence, analyzeScreenRecords, summarizeRows, buildScreenEvidenceAudit, renderScreenEvidenceAudit, main };
