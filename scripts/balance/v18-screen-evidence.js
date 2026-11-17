'use strict';

// Exact uploaded evidence, not original execution manifests or a replay audit.
// Frozen compatibility descriptors remove dependence on later roster revisions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { gunzipSync } = require('node:zlib');
const { createV17Report } = require('./v17-report');
const { conditionalRange } = require('./level3-panel-report');
const { declaredStartFen } = require('./reference-panel-evidence');

const ROOT = path.resolve(__dirname, '../../experiments/balance/results');
const PREFIX = 'v18-screens-001';
const SOURCES_SHA256 = 'edd585e744ee575753edf6402f8eaaac132ed6e79722950da5e3cf97189e1bfc';
const STUDIES = Object.freeze(['level1', 'level2', 'mobility']);
const FIELDS = Object.freeze(['aColor', 'attempt', 'blackStrength', 'comparisonId', 'comparisonLabel', 'engine', 'engineNames', 'evaluation', 'evaluationCaveat',
  'finalFen', 'finishedAt', 'id', 'lastInfo', 'moves', 'openingId', 'openingMoves', 'openingPlies', 'pairId', 'playedPlies', 'profileHash', 'reason', 'registryHash',
  'registryReference', 'repetition', 'result', 'royalMode', 'sans', 'scheduleIndex', 'schemaVersion', 'startFen', 'startedAt', 'status', 'totalPlies', 'variant', 'whiteStrength']);
const PROVENANCE = Object.freeze({
  originalCampaignManifestsSupplied: false, originalStageManifestsSupplied: false,
  originalRuntimeReceiptsSupplied: false, nativePreflightSupplied: false,
  uploadedReportsSupplied: true, engineSha256: null, legalMovesIndependentlyReplayed: false,
  descriptorKind: 'derived v0.18.3 declaration compatibility descriptors, not original execution manifests',
  limitations: Object.freeze([
    'Original screen.json, stage run.json, archived INI files, runtime receipts and native-preflight proofs were not supplied. Derived descriptors check recorded declaration compatibility; they are not recovered original manifests.',
    'Recorded profile/registry hashes, starting armies, openings, strengths, search settings and applied value policies match the reconstructed declarations. Engine names and profile hashes do not attest the executable or its native tables.',
    'Moves and terminal outcomes were not independently replayed. No new matches, engine searches, outcome-fitted material values or individual-piece Elo were produced.',
    'All studies use sixteen related fixed opening cases. Opening-block ranges are conditional; raw game counts do not imply that many independent starting positions.',
  ]),
});
const sha = value => createHash('sha256').update(value).digest('hex');
const normalize = text => text.replace(/\r\n/g, '\n');
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const score = row => row.result === '1/2-1/2' ? 0.5 : Number((row.result === '1-0') === (row.aColor === 'w'));
const percent = value => value === null ? 'pending' : `${(value * 100).toFixed(2)}%`;
const dashPercent = value => value === null ? '—' : percent(value);
const pp = value => value === null ? 'pending' : (value * 100).toFixed(2);
const range = (value, suffix = '%') => value.available ? `${pp(value.lower)}–${pp(value.upper)}${suffix}` : 'pending';

function sources() {
  const text = normalize(fs.readFileSync(path.join(ROOT, `${PREFIX}.sources.json`), 'utf8'));
  assert.equal(sha(text), SOURCES_SHA256, 'Source pin declaration changed.');
  const value = JSON.parse(text);
  assert.equal(value.schemaVersion, 1); assert.equal(value.format, 'levelup-v18-screen-source-pins');
  return value;
}
function readPinned(pin, read = file => fs.readFileSync(file)) {
  const bytes = read(path.join(ROOT, pin.archiveFile));
  assert.equal(sha(bytes), pin.archivedSha256, `Archive changed: ${pin.archiveFile}.`);
  const original = gunzipSync(bytes);
  assert.equal(original.length, pin.bytes, `Original byte count changed: ${pin.archiveFile}.`);
  assert.equal(sha(original), pin.sha256, `Original upload changed: ${pin.archiveFile}.`);
  return original;
}
function parseJournal(bytes) {
  assert.equal(bytes.at(-1), 10, 'An uploaded journal must end with a complete newline.');
  return bytes.toString('utf8').slice(0, -1).split('\n').map(line => JSON.parse(line));
}
function latestRecords(records) {
  const latest = new Map();
  for (const record of records) if (!latest.has(record.id) || record.attempt > latest.get(record.id).attempt) latest.set(record.id, record);
  return [...latest.values()];
}
function validateRecord(record, planned, descriptor) {
  const { config } = descriptor.declaration, profile = descriptor.manifest.designProfile;
  assert.ok(record && planned, 'Unknown scheduled game.');
  assert.deepEqual(Object.keys(record).sort(), FIELDS, 'Uploaded record schema changed.');
  assert.equal(record.schemaVersion, 1); assert.equal(record.repetition, planned.repetition);
  assert.equal(record.comparisonLabel, planned.comparison.label, 'Comparison label changed.');
  assert.ok(Number.isSafeInteger(record.scheduleIndex) && record.scheduleIndex >= 0 && record.scheduleIndex < descriptor.manifest.schedule.length, 'Invalid worker-local schedule index.');
  const white = record.aColor === 'w' ? planned.comparison.armyA : planned.comparison.armyB;
  const black = record.aColor === 'b' ? planned.comparison.armyA : planned.comparison.armyB;
  assert.equal(record.startFen, declaredStartFen(profile, white, black), 'Recorded starting army changed.');
  assert.equal(record.royalMode, 'king'); assert.equal(record.evaluationCaveat, null);
  if (['completed', 'truncated'].includes(record.status)) assert.deepEqual(record.engineNames, { w: 'Fairy-Stockfish 230826', b: 'Fairy-Stockfish 230826' }, 'Recorded engine name changed.');
  else assert.ok(record.engineNames && Object.entries(record.engineNames).every(([color, name]) => ['w', 'b'].includes(color) && name === 'Fairy-Stockfish 230826'), 'Invalid partial engine startup metadata.');
  assert.ok(Array.isArray(record.moves) && record.moves.every(move => typeof move === 'string'));
  assert.ok(Array.isArray(record.sans) && record.sans.length === record.moves.length, 'SAN/UCI count mismatch.');
  assert.equal(record.totalPlies, record.moves.length, 'Total-ply count changed.');
  assert.equal(record.openingPlies, record.openingMoves.length);
  assert.equal(record.playedPlies + record.openingPlies, record.totalPlies);
  assert.deepEqual(record.moves.slice(0, record.openingPlies), record.openingMoves, 'Recorded prefix changed.');
  assert.ok(record.totalPlies <= config.engine.maxPlies);
  const fields = record.finalFen.split(' ');
  assert.equal(fields.length, 6, 'Invalid final FEN shape.');
  assert.equal(fields[1], record.totalPlies % 2 ? 'b' : 'w', 'Final turn disagrees with history.');
  assert.equal(Number(fields[5]), Math.floor(record.totalPlies / 2) + 1, 'Final fullmove count disagrees with history.');
  if (record.status === 'completed') {
    assert.ok(['checkmate', 'insufficient-material', 'threefold-repetition', 'fifty-move-rule', 'stalemate'].includes(record.reason), 'Unknown scored terminal reason.');
    assert.equal(record.result === '1/2-1/2', record.reason !== 'checkmate', 'Result/terminal reason mismatch.');
    if (record.reason === 'checkmate') assert.equal(record.result, fields[1] === 'w' ? '0-1' : '1-0', 'Checkmate winner mismatch.');
  } else {
    assert.equal(record.result, '*', 'An unscored attempt cannot become a result.');
    if (record.status === 'truncated') { assert.equal(record.reason, 'max-plies'); assert.equal(record.totalPlies, config.engine.maxPlies); }
    else assert.ok(['error', 'aborted'].includes(record.status), 'Unknown unscored status.');
  }
  assert.ok(Number.isFinite(Date.parse(record.startedAt)) && Date.parse(record.finishedAt) >= Date.parse(record.startedAt), 'Invalid attempt timestamps.');
  assert.ok(record.lastInfo && typeof record.lastInfo === 'object' && !Array.isArray(record.lastInfo));
}
function summaries(report, records, declaration, salt) {
  const latest = latestRecords(records), comparisons = declaration.metadata.comparisons;
  return report.overall.rows.map(row => {
    const shared = new Set(row.openingCoverage.openingIds), ids = new Set(comparisons.filter(cell => cell.aKey === row.key).map(cell => cell.id));
    const included = latest.filter(record => record.status === 'completed' && shared.has(record.openingId) && ids.has(record.comparisonId));
    const blocks = [...shared].map(id => mean(included.filter(record => record.openingId === id).map(score)));
    const physicalColors = ['w', 'b'].map(color => { const values = included.filter(record => record.aColor === color).map(score); return { color, games: values.length, score: mean(values) }; });
    const flags = row.score === null ? ['pending shared cases'] : [row.score < 0.4 ? 'below descriptive target' : row.score > 0.6 ? 'above descriptive target' : 'within descriptive target'];
    if (row.openingCoverage.shared < row.openingCoverage.total) flags.push('partial screen');
    if (row.opponents.some(opponent => opponent.score !== null && (opponent.score < 0.3 || opponent.score > 0.7))) flags.push('matchup concern');
    return { ...row, upgradePoints: declaration.metadata.rowBudgets[row.key], physicalColors, flags, conditionalRange: conditionalRange(blocks, `${salt}:${row.key}`) };
  });
}
function pairedGains(study, nodes, declaration, records) {
  if (study !== 'mobility') return [];
  const bodies = declaration.metadata.rows, comparisons = declaration.metadata.comparisons, refs = declaration.metadata.columns;
  const values = new Map(), pairs = new Map();
  for (const row of latestRecords(records)) { const pair = pairs.get(row.pairId) || []; pair.push(row); pairs.set(row.pairId, pair); }
  for (const pair of pairs.values()) if (pair.length === 2 && pair.every(row => row.status === 'completed') && pair[0].aColor !== pair[1].aColor) values.set(`${pair[0].comparisonId}:${pair[0].openingId}`, mean(pair.map(score)));
  return bodies.filter(body => !body.key.endsWith('-control')).map(body => {
    const control = body.key.startsWith('nightrider-') ? 'nightrider-control' : 'wraith-control';
    const comparison = (key, ref) => comparisons.find(cell => cell.aKey === key && cell.bKey === ref).id;
    const common = declaration.config.openings.filter(opening => refs.every(ref => [body.key, control].every(key => values.has(`${comparison(key, ref.key)}:${opening.id}`))));
    const differences = common.map(opening => mean(refs.map(ref => values.get(`${comparison(body.key, ref.key)}:${opening.id}`) - values.get(`${comparison(control, ref.key)}:${opening.id}`))));
    return { key: body.key, label: body.label, control, sharedOpenings: common.length, difference: mean(differences), conditionalRange: conditionalRange(differences, `v18gain:${nodes}:${body.key}`) };
  });
}
function markdownTables(text) {
  const tables = [], lines = normalize(text).split('\n');
  for (let index = 0; index < lines.length; index++) if (lines[index].startsWith('| ') && lines[index + 1]?.startsWith('| ---')) {
    const cells = line => line.slice(1, -1).split('|').map(cell => cell.trim());
    const table = { header: cells(lines[index]), rows: [] }; index += 2;
    while (lines[index]?.startsWith('| ')) table.rows.push(cells(lines[index++]));
    index--; tables.push(table);
  }
  return tables;
}
function verifyUploadedReport(study, report, uploaded, { cohortHeaderPrefix = 'Cases', gainsHaveControlLabels = false } = {}) {
  assert.ok(uploaded.includes(`${report.targetOpenings} fixed opening cases; ${report.scheduledGames} scheduled games.`), 'Uploaded headline count differs.');
  const budgets = uploaded.split(/^## (40000|80000) nodes\r?$/m), sections = new Map();
  for (let index = 1; index < budgets.length; index += 2) sections.set(Number(budgets[index]), markdownTables(budgets[index + 1]));
  for (const stage of report.reports) {
    const tables = sections.get(stage.nodes); assert.ok(tables, 'Missing uploaded node budget.');
    const table = first => { const matches = tables.filter(item => item.header[0] === first); assert.equal(matches.length, 1, `Missing/repeated ${first} table.`); return matches[0]; };
    const overall = tables.find(item => item.header[0] === 'Design' && item.header[1] === 'Purchase points per side');
    assert.ok(overall, 'Missing uploaded overall summary.');
    assert.deepEqual(overall.rows, stage.rows.map(row => [row.label, String(row.upgradePoints), percent(row.score), ...row.physicalColors.map(color => percent(color.score)), range(row.conditionalRange), `${row.openingCoverage.shared}/${row.openingCoverage.total}`, row.flags.join('; ')]), 'Uploaded overall/color/range values differ.');
    const matrix = table('Row army / column opponent');
    assert.deepEqual(matrix.header.slice(1), [...stage.report.matrix.columns.map(row => row.label), 'Overall score (cases)']);
    const byKey = new Map(stage.rows.map(row => [row.key, row]));
    assert.deepEqual(matrix.rows, stage.report.matrix.rows.map(row => { const summary = byKey.get(row.key); return [row.label, ...row.cells.map(cell => dashPercent(cell.score)), `${percent(summary.score)} (${summary.openingCoverage.shared}/${summary.openingCoverage.total})`]; }), 'Uploaded matchup matrix differs.');
    assert.deepEqual(table('Overall row').rows, stage.rows.map(row => [row.label, String(row.games), `${row.wins} / ${row.draws} / ${row.losses}`, percent(row.score), String(row.opponents.length), `${row.openingCoverage.shared}/${row.openingCoverage.total}`]), 'Uploaded W/D/L totals differ.');
    assert.deepEqual(table('A versus B').rows, stage.report.comparisons.map(row => [`${row.aLabel} / ${row.bLabel}`, String(row.pairedGames), `${row.wins} / ${row.draws} / ${row.losses}`, percent(row.score), `${row.completePairs}/${row.expectedPairs}`, String(row.openings), String(row.statusCounts.truncated), String(row.statusCounts.error)]), 'Uploaded comparison counts differ.');
    const cohortTables = tables.filter(item => item.header[0] === 'Design' && item.header[1].startsWith(cohortHeaderPrefix));
    assert.equal(cohortTables.length, 1, 'Missing fixed-cohort table.');
    assert.deepEqual(cohortTables[0].rows, stage.rows.map(row => [row.label, ...stage.cohorts.map(cohort => { const value = cohort.rows.find(item => item.key === row.key); return `${percent(value.score)} (${value.openingCoverage.shared}/8)`; })]), 'Uploaded fixed-cohort scores differ.');
    if (study === 'mobility' || gainsHaveControlLabels) assert.deepEqual(table('Trial').rows, stage.gains.map(row => [row.label,
      ...(gainsHaveControlLabels ? [row.controlLabel] : []), String(row.sharedOpenings), pp(row.difference), range(row.conditionalRange, '')]), 'Uploaded matched-control gains differ.');
    assert.ok(uploaded.includes(`Finalized games: ${stage.report.progress.finalizedGames}/${stage.report.scheduledGames}; scored complete pairs: ${stage.report.progress.completePairs}.`), 'Uploaded progress count differs.');
  }
  const priors = markdownTables(uploaded).filter(table => table.header[0] === 'Design' && table.header[1] === 'Movement');
  assert.equal(priors.length, 1, 'Missing/repeated frozen-prior table.');
  assert.deepEqual(priors[0].rows, report.evaluationAudit.values.map(row => [row.id, `\`${row.movement}\``, row.anchorId, `${row.applied.mg} / ${row.applied.eg}`]), 'Uploaded frozen search priors differ.');
  return true;
}

function analyzeStudy(study, inputs, descriptors, uploadedReport, { allowedStudies = STUDIES, computeGains = pairedGains,
  verifyReport = verifyUploadedReport, cohortOpeningIds = false, targetOpenings = 16 } = {}) {
  assert.ok(allowedStudies.includes(study), 'Choose a declared archived study.');
  assert.ok([8, 16, 32, 64].includes(targetOpenings), 'Choose a declared opening target.');
  const expected = descriptors.stages.filter(row => row.study === study);
  assert.equal(inputs.length, expected.length, 'Every expected node/batch journal is required.');
  const seen = new Set(), stages = inputs.map(input => {
    const key = `${input.batchIndex}:${input.nodes}`;
    assert.ok(!seen.has(key), 'Duplicate source stage.'); seen.add(key);
    const descriptor = expected.find(row => row.batchIndex === input.batchIndex && row.nodes === input.nodes);
    assert.ok(descriptor, 'Foreign node/batch source.');
    const byId = new Map(descriptor.manifest.schedule.map(row => [row.id, row]));
    const attemptIds = new Set();
    for (const record of input.records) {
      const attempt = `${record.id}:${record.attempt}`; assert.ok(!attemptIds.has(attempt), 'Duplicate uploaded attempt.'); attemptIds.add(attempt);
      validateRecord(record, byId.get(record.id), descriptor);
    }
    const report = createV17Report({ ...descriptor.declaration, records: input.records, manifest: descriptor.manifest });
    assert.equal(report.progress.finalizedGames, descriptor.manifest.schedule.length, 'An uploaded stage is unfinished.');
    assert.equal(report.progress.duplicateCopiesIgnored, 0);
    return { ...input, descriptor, report };
  }).sort((a, b) => a.batchIndex - b.batchIndex || a.nodes - b.nodes);
  const reports = [...new Set(stages.map(stage => stage.nodes))].sort((a, b) => a - b).map(nodes => {
    const selected = stages.filter(stage => stage.nodes === nodes), first = selected[0].descriptor.declaration;
    const config = { ...first.config, openings: selected.flatMap(stage => stage.descriptor.declaration.config.openings) };
    assert.equal(config.openings.length, targetOpenings, 'Archived opening count differs from its declared target.');
    assert.equal(new Set(config.openings.map(opening => opening.id)).size, targetOpenings, 'Archived opening IDs repeat.');
    const declaration = { ...first, config };
    const records = selected.flatMap(stage => stage.records.map(row => ({ ...row, id: `${stage.batchIndex}:${row.id}`, pairId: `${stage.batchIndex}:${row.pairId}` })));
    const report = createV17Report({ ...declaration, records });
    const rows = summaries(report, records, declaration, `${study}:${nodes}`);
    const cohorts = selected.map(stage => {
      const cohort = stage.descriptor.declaration;
      return { batchIndex: stage.batchIndex,
        ...(cohortOpeningIds ? { openingIds: cohort.config.openings.map(opening => opening.id) } : {}),
        rows: summaries(stage.report, stage.records, cohort, `${study}:${nodes}:${stage.batchIndex}`) };
    });
    return { nodes, report, rows, cohorts, gains: computeGains(study, nodes, declaration, records) };
  });
  const report = { study, targetOpenings, scheduledGames: stages.reduce((sum, stage) => sum + stage.report.scheduledGames, 0), reports,
    evaluationAudit: stages[0].descriptor.declaration.metadata.evaluationAudit };
  if (uploadedReport !== undefined) verifyReport(study, report, uploadedReport);
  const latest = stages.flatMap(stage => latestRecords(stage.records)), attempts = stages.flatMap(stage => stage.records);
  const counts = { attempts: attempts.length, scheduledGames: report.scheduledGames, finalizedGames: latest.length,
    completedGames: latest.filter(row => row.status === 'completed').length, truncatedGames: latest.filter(row => row.status === 'truncated').length,
    errorAttempts: attempts.filter(row => row.status === 'error').length, abortedAttempts: attempts.filter(row => row.status === 'aborted').length,
    retries: attempts.filter(row => row.attempt > 1).length, pairedGames: reports.reduce((sum, row) => sum + row.report.progress.pairedGames, 0),
    completePairs: reports.reduce((sum, row) => sum + row.report.progress.completePairs, 0) };
  return { study, stages, report, counts, uploadedNumericTablesReproducedExactly: uploadedReport !== undefined };
}
function loadEvidence({ readArchive } = {}) {
  const pins = sources(), descriptors = JSON.parse(readPinned(pins.declarations, readArchive));
  assert.equal(descriptors.format, 'levelup-v18-screen-derived-declarations');
  const studies = STUDIES.map(study => {
    const source = pins.studies[study], inputs = source.journals.map(pin => ({ nodes: pin.nodes, batchIndex: pin.batchIndex, records: parseJournal(readPinned(pin, readArchive)) }));
    return analyzeStudy(study, inputs, descriptors, readPinned(source.uploadedReport, readArchive).toString('utf8'));
  });
  return { pins, descriptors, studies };
}
function buildAudit(input = loadEvidence()) {
  const fields = Object.keys(input.studies[0].counts), counts = Object.fromEntries(fields.map(field => [field, input.studies.reduce((sum, study) => sum + study.counts[field], 0)]));
  return { schemaVersion: 1, format: 'levelup-v18-screen-upload-evidence', recordedDate: '2026-11-16', sources: input.pins, provenance: PROVENANCE,
    counts: { ...counts, newMatchGames: 0, engineSearches: 0 }, studies: input.studies.map(study => ({ study: study.study, counts: study.counts,
      uploadedNumericTablesReproducedExactly: study.uploadedNumericTablesReproducedExactly, report: study.report,
      stages: study.stages.map(stage => ({ nodes: stage.nodes, batchIndex: stage.batchIndex, attempts: stage.records.length,
        configSha256: sha(JSON.stringify(stage.descriptor.declaration.config)), scheduleSha256: sha(JSON.stringify(stage.descriptor.manifest.schedule)),
        profileHash: stage.descriptor.manifest.designProfile.hash, registryHash: stage.descriptor.manifest.designRegistry.hash,
        recordedEngineNames: stage.records[0].engineNames })) })) };
}
function renderAudit(audit) {
  const stage = (study, nodes = 40000) => audit.studies.find(row => row.study === study).report.reports.find(row => row.nodes === nodes);
  const l1 = stage('level1'), l2 = stage('level2'), mobility = [stage('mobility'), stage('mobility', 80000)];
  return ['# Version 18 initial screen evidence', '',
    `${audit.counts.finalizedGames} games finalized from ${audit.counts.attempts} recorded attempts: ${audit.counts.completedGames} completed results, ${audit.counts.truncatedGames} unscored move-limit truncations, ${audit.counts.errorAttempts} historical error attempts and ${audit.counts.abortedAttempts} aborted attempts. All three reports’ numeric tables, headline counts and matched-control gains reproduce from their journals.`, '',
    '| Level-one design | Score | First / second eight cases |', '| --- | ---: | ---: |',
    ...l1.rows.map(row => `| ${row.label} | ${percent(row.score)} | ${l1.cohorts.map(cohort => percent(cohort.rows.find(item => item.key === row.key).score)).join(' / ')} |`), '',
    'Wazzap knight, Wazzap bishop, the Ghost rook with quiet diagonal hops and Pawn rook are promising. The Pawn rook has 15/16 shared cases because one game reached the move limit; this is not a loss or draw. Positional knight, Hopping bishop and Baby Amazon remain weak. Expanded Climbing knight is above the descriptive band in both halves.', '',
    '| Level-two design | Overall | Knight pawn | Rank pawn | Bishop grant |', '| --- | ---: | ---: | ---: | ---: |',
    ...l2.rows.map(row => `| ${row.label} | ${percent(row.score)} | ${row.opponents.map(opponent => percent(opponent.score)).join(' | ')} |`), '',
    'Bishop pawn is a replacement pawn, not a reserve grant. The F Bishop grant is a fixed level-two reference. Free Boar’s 59.38% overall score is driven by its 82.81% Rank-pawn matchup; its other two scores are 46.88% and 48.44%. This points to a counter or matchup effect, not proof that it is uniformly too strong.', '',
    'Candidates face fixed references, not one another. Strengthening a weak candidate therefore cannot pull the other candidates’ reference scores down. The game itself is zero-sum, while this screening roster is not a closed round robin.', '',
    '| Mobility design | 40k | 80k |', '| --- | ---: | ---: |',
    ...mobility[0].rows.map(row => `| ${row.label} | ${percent(row.score)} | ${percent(mobility[1].rows.find(item => item.key === row.key).score)} |`), '',
    'Quiet diagonal and quiet orthogonal Nightriders are promising; quiet king steps overshoot, especially at 80k. The full-diagonal/sideways Wraith is strong relative to the requested below-50% off-meta target. Its 80k summary uses 15/16 shared cases. The other Wraith variants remain weaker; this archive schedules no automatic revision or promotion.', '',
    '## Evidence limits', '', ...PROVENANCE.limitations.map(note => `- ${note}`), '',
    'Exact uploaded bytes are retained in deterministic gzip archives with both original and archive SHA-256 pins. Separately archived compatibility descriptors were reconstructed from v0.18.3 definitions; they are not original run manifests. No unscored attempt is discarded from the evidence, and no historical game is replayed or counted again.', '',
    'Run `node scripts/balance/v18-screen-evidence.js` to verify offline; `--write` regenerates only the derived audit and this review. No engine or match starts.', ''].join('\n');
}
function main(args = process.argv.slice(2), { log = console.log } = {}) {
  assert.ok(!args.length || args.length === 1 && args[0] === '--write', 'Use no arguments or --write.');
  const audit = buildAudit();
  for (const [name, content] of [[`${PREFIX}.audit.json`, JSON.stringify(audit) + '\n'], [`${PREFIX}.report.md`, renderAudit(audit)]]) {
    const file = path.join(ROOT, name);
    if (args.length) fs.writeFileSync(file, content); else assert.equal(normalize(fs.readFileSync(file, 'utf8')), content, `Derived artifact changed: ${name}.`);
  }
  log(`V18 screens verified: ${audit.counts.finalizedGames} finalized games, ${audit.counts.completePairs} scored pairs; no searches or new games.`);
  return audit;
}
if (require.main === module) { try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; } }
module.exports = { PREFIX, SOURCES_SHA256, STUDIES, PROVENANCE, sources, readPinned, parseJournal, analyzeStudy, verifyUploadedReport, loadEvidence, buildAudit, renderAudit, main };
