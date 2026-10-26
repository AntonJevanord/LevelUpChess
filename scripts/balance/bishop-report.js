'use strict';

// Offline linked simple analysis. Raw manifests and journals are never changed.
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { acquireLock } = require('./storage');
const { renameWithRetrySync, unlinkWithRetrySync } = require('./files');
const { validateManifest, selectPrefix, extractBishopDataset } = require('./bishop-dataset');

const sha = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const fail = message => { throw new Error(message); };
const COHORTS = ['baseline', 'head', 'combined'];
const REPORT_JSON = 'bishop-report.json', REPORT_MD = 'bishop-report.md';

function checkAbort(signal) {
  if (signal?.aborted) { const error = new Error('Bishop report cancelled.'); error.name = 'AbortError'; error.code = 'ABORT_ERR'; throw error; }
}

function analysisIdentity() {
  const root = path.resolve(__dirname, '../..');
  const names = ['scripts/balance/bishop-report.js', 'scripts/balance/bishop-dataset.js',
    'scripts/balance/bishop-analysis.js', 'scripts/balance/bishop-source.js',
    'scripts/balance/simple-dataset.js', 'scripts/balance/simple-plan.js', 'scripts/balance/reference-regression.js',
    'scripts/balance/bishop-plan.js', 'scripts/balance/material-dataset.js',
    'scripts/balance/reference-dataset.js', 'scripts/balance/reference-plan.js',
    'scripts/balance/design-profile.js', 'scripts/balance/design-registry.js',
    'scripts/balance/evaluation.js', 'src/design-catalog.js', 'dist/balance-rules.cjs'];
  const files = names.map(file => ({ file, sha256: sha(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')) }));
  return { normalization: 'UTF-8 text with CRLF normalized to LF', files, sha256: sha(json(files)),
    interpretation: 'Current replay and analysis sources, separate from the original collection manifest identity.' };
}

function estimates(analysis, roster) {
  const normalized = analysis?.normalized, values = normalized?.values || {}, intervals = analysis?.bootstrap?.ratioIntervals || {};
  const result = { pawn: { value: 1, assumed: true, interval: null }, queen: { value: 9, assumed: true, interval: null } };
  for (const name of ['knight', 'bishop', 'rook', ...roster.map(reference => `bonus:${reference.id}`)]) {
    const available = normalized?.available && Number.isFinite(values[name]);
    const interval = intervals[name];
    result[name] = { value: available ? values[name] : null, assumed: false, supported: Boolean(available),
      interval: available && Number.isFinite(interval?.lower) && Number.isFinite(interval?.upper) ? interval : null,
      reason: available ? null : analysis?.omittedFeatures?.includes(name) ? 'not-observed-in-cohort' : normalized?.reason || 'unsupported' };
  }
  return result;
}

function queenRookGap(estimates) {
  const rook = estimates?.rook;
  const supported = Boolean(rook?.supported && Number.isFinite(rook.value));
  const interval = supported && Number.isFinite(rook.interval?.lower) && Number.isFinite(rook.interval?.upper)
    ? { ...rook.interval, lower: 9 - rook.interval.upper, upper: 9 - rook.interval.lower } : null;
  return { value: supported ? 9 - rook.value : null, supported, assumedQueen: 9, interval,
    reason: supported ? null : rook?.reason || 'unsupported',
    interpretation: 'Queen is assumed to equal 9. The conditional range reverses each paired rook bootstrap range; no independent interval subtraction is used.' };
}

async function makeBishopReport(manifest, records, { checkpoint, rulesFactory, bootstrap,
  onProgress = () => {}, analyze, signal, ...parentOptions } = {}) {
  checkAbort(signal);
  const plan = validateManifest(manifest), requested = bootstrap ?? plan.study.analysis.bootstrap;
  if (!Number.isSafeInteger(requested) || requested < 0 || requested > 1000) fail('Use bootstrap 0–1000.');
  if (checkpoint !== undefined && requested !== plan.study.analysis.bootstrap) fail('Frozen bishop checkpoints must retain their declared bootstrap count.');
  onProgress(`Replaying recorded moves for ${checkpoint ?? plan.schedule.length} scheduled new games and the completed parent; no games are played again.`);
  const extracted = await extractBishopDataset(manifest, records, { checkpoint, rulesFactory, onProgress, signal, ...parentOptions });
  checkAbort(signal);
  const dataset = { ...extracted.dataset, samples: extracted.samples };
  const analyzeDataset = analyze || require('./bishop-analysis').analyzeBishopDataset;
  const analysis = await analyzeDataset(dataset, { bootstrap: requested, seed: plan.settings.seed,
    validationFolds: plan.study.analysis.validationFolds, onProgress, signal });
  checkAbort(signal);
  const current = Object.fromEntries(COHORTS.map(cohort => [cohort, estimates(analysis.primary?.[cohort], plan.roster)]));
  const ordinaryEstimates = Object.fromEntries(COHORTS.map(cohort => [cohort,
    Object.fromEntries(['pawn', 'knight', 'bishop', 'rook', 'queen'].map(name => [name, current[cohort][name]]))]));
  const gaps = Object.fromEntries(COHORTS.map(cohort => [cohort, queenRookGap(current[cohort])]));
  const report = { schemaVersion: 1, format: 'levelup-bishop-report', runId: manifest.runId,
    studyId: plan.id, checkpoint: checkpoint ?? null,
    coveredGames: extracted.coverage.newGames, inheritedGames: extracted.coverage.inheritedGames,
    linkedGames: extracted.coverage.finalizedGames, studyCap: plan.schedule.length, linkedStudyCap: plan.linkedTotalGames,
    status: checkpoint !== undefined ? 'checkpoint-complete' : extracted.coverage.newGames === plan.schedule.length ? 'complete' : 'provisional',
    checkpoints: plan.study.checkpoints, profileHash: plan.profile.hash, registryHash: plan.registry.hash,
    roster: plan.roster, analysisIdentity: analysisIdentity(), coverage: extracted.coverage,
    parent: { ...plan.parent, compatibility: manifest.native?.parentCompatibility || null },
    simpleSource: { ...plan.simpleSource, originalManifestSupplied: false, historicalNativeInventoryVerified: false },
    policy: { ...plan.study.analysis, bootstrap: requested,
      nativeEvaluation: 'RB matches the ordinary queen at MG2538/EG2682; all other native values remain automatic.',
      nativePieceValues: plan.profile.evaluation?.pieceValues || {},
      interpretation: 'Primary estimates assume P=1/Q=9; historical and new games contribute once, with shared whole-position out-of-fold groups. Pooled estimates assume contextual comparability.' },
    sampling: plan.protocol.sampling, analysis, estimates: current, currentEstimate: current.combined,
    ordinaryEstimates, queenRookGap: gaps, currentQueenRookGap: gaps.combined,
    warnings: [...extracted.warnings, ...(analysis.warnings || [])], materialPriceTableSupported: false,
    interpretation: 'Conditional ordinary-piece values and added upgrade bonuses from linked evidence. Analysis assumes P=1/Q=9; native search values follow the separate frozen queen-match policy.' };
  return { report, dataset: extracted.dataset, samples: extracted.samples, epd: extracted.epd };
}

function markdown(report) {
  const c = report.coverage, number = (value, digits = 2) => Number.isFinite(value) ? value.toFixed(digits) : 'unavailable';
  const band = interval => Number.isFinite(interval?.lower) && Number.isFinite(interval?.upper)
    ? `${number(interval.lower)}–${number(interval.upper)}` : 'unavailable';
  const percent = value => Number.isFinite(value) ? `${number(100 * value)}%` : 'unavailable';
  const percentBand = interval => Number.isFinite(interval?.lower) && Number.isFinite(interval?.upper)
    ? `${number(100 * interval.lower)}%–${number(100 * interval.upper)}%` : 'unavailable';
  const lines = ['# Bishop versus forward-diagonal rook report', '', report.interpretation, '',
    `Analysis source identity: ${report.analysisIdentity.sha256} (normalized LF).`,
    `Status: ${report.status}; checkpoint: ${report.checkpoint ?? 'current'} new games; new finished ${report.coveredGames}/${c.newScheduledGames}; new cap: ${report.studyCap}.`,
    `Inherited: ${report.inheritedGames}; linked finalized: ${report.linkedGames}/${c.scheduledGames}; linked study cap: ${report.linkedStudyCap}.`,
    `Parent run: ${report.parent.runId}; parent manifest/journal hashes: ${report.parent.manifestSha256} / ${report.parent.journalSha256}.`,
    `Simple source: ${report.simpleSource.runId}; pinned reconstructed replay descriptor, not the original collection manifest. Historical native inventory and original manifest checksum remain unattested.`,
    'New bishop variants have head-to-head evidence only. Unobserved ordinary/single bonus columns are omitted from that cohort; their baseline values and cohort comparisons remain unavailable.',
    `Bounded parent compatibility diagnostics: ${report.parent.compatibility?.passed ? 'passed' : 'not supplied'}; historical contexts remain separate provenance.`,
    `Completed outcomes: ${c.completedRecords}; distinct histories: ${c.uniqueHistories}; sampled games: ${c.sampledGames}; positions: ${c.samples}.`,
    `Latest statuses: ${c.statusCounts.truncated} truncated, ${c.statusCounts.error} errors, ${c.statusCounts.aborted} aborted; remaining: ${c.remainingGames}.`,
    `Journal attempts: ${c.journalAttempts}; historical errors: ${c.attemptStatusCounts.error}; historical aborted attempts: ${c.attemptStatusCounts.aborted}.`,
    '', 'Pawn = 1 and queen = 9 are assumed anchors. Fitted ordinary-piece values and upgrade bonuses use that conditional scale, separate from native MG/EG search parameters.', '',
    '| Ordinary piece | Ordinary/single | Head-to-head | Combined | Combined conditional 95% range |',
    '| --- | ---: | ---: | ---: | --- |'];
  for (const [name, label] of [['pawn', 'Pawn (assumed)'], ['knight', 'Knight'], ['bishop', 'Bishop'], ['rook', 'Rook'], ['queen', 'Queen (assumed)']]) {
    lines.push(`| ${label} | ${number(report.estimates.baseline[name].value)} | ${number(report.estimates.head[name].value)} | ${number(report.estimates.combined[name].value)} | ${report.estimates.combined[name].assumed ? 'fixed assumption' : band(report.estimates.combined[name].interval)} |`);
  }
  lines.push(`| Queen minus rook | ${number(report.queenRookGap.baseline.value)} | ${number(report.queenRookGap.head.value)} | ${number(report.queenRookGap.combined.value)} | ${band(report.queenRookGap.combined.interval)} |`, '',
    'Kings have no estimated exchange value. The queen-minus-rook range conditions on Q=9 and reverses the paired rook bootstrap range.', '',
    'The following table reports added upgrade bonuses over ordinary pieces.', '',
    '| Upgrade (role) | Ordinary/single bonus | Head-to-head bonus | Combined bonus | Combined conditional 95% range |',
    '| --- | ---: | ---: | ---: | --- |');
  for (const reference of report.roster) {
    const key = `bonus:${reference.id}`;
    lines.push(`| ${reference.label} (${reference.role}) | ${number(report.estimates.baseline[key].value)} | ${number(report.estimates.head[key].value)} | ${number(report.estimates.combined[key].value)} | ${band(report.estimates.combined[key].interval)} |`);
  }
  lines.push('', '| Cohort difference, head minus ordinary/single | Point | Paired conditional 95% range | Decision at ±0.5 pawn |',
    '| --- | ---: | --- | --- |');
  for (const reference of report.roster) {
    const difference = report.analysis.differences?.byFeature?.[`bonus:${reference.id}`];
    lines.push(`| ${reference.label} | ${number(difference?.difference)} | ${band(difference?.interval)} | ${difference?.decision || 'unavailable'} |`);
  }
  lines.push('', '| Head-to-head matchup (A versus B) | Paired games | A W / D / L | A score | Conditional range | Out-of-fold predicted A score | Observed minus predicted (pp) |',
    '| --- | ---: | --- | ---: | --- | ---: | ---: |');
  const labels = Object.fromEntries(report.roster.map(reference => [reference.id, reference.label]));
  const partial = [];
  for (const match of report.analysis.predictions?.matchups || []) {
    lines.push(`| ${labels[match.designA] || match.designA} / ${labels[match.designB] || match.designB} | ${match.games} | ${match.wins ?? '—'} / ${match.draws ?? '—'} / ${match.losses ?? '—'} | ${percent(match.observedAScore)} | ${percentBand(match.observedInterval)} | ${percent(match.predictedAScore)} | ${Number.isFinite(match.predictionError) ? number(100 * match.predictionError) : 'unavailable'} |`);
    if (match.partialGames) partial.push(`Partial ${match.comparisonId}: ${match.partialGames} completed games lack a scored partner and are excluded from the paired score.`);
  }
  if (!(report.analysis.predictions?.matchups?.length)) lines.push('| No scored head-to-head pairs yet | 0 | — | unavailable | unavailable | unavailable | unavailable |');
  lines.push('', ...partial, '', 'Matchup scores count draws as half a point; prediction differences are percentage points. JSON retains the 0–1 score scale, physical-color results and out-of-fold support.', '',
    '| Fit | Games sampled | Groups | Effective rank | Converged | Held-out Brier | Supported estimates |',
    '| --- | ---: | ---: | --- | --- | ---: | --- |');
  for (const mode of ['primary', 'diagnostic']) for (const cohort of COHORTS) {
    const fit = report.analysis[mode]?.[cohort];
    lines.push(`| ${mode} ${cohort} | ${fit?.coverage?.games ?? '—'} | ${fit?.coverage?.groups ?? '—'} | ${fit?.rank?.rank ?? '—'}/${fit?.rank?.columns ?? '—'} | ${fit?.fit?.converged ?? false} | ${number(fit?.validation?.metrics?.brier, 4)} | ${fit?.normalized?.available ? 'conditional only' : fit?.normalized?.reason || 'unavailable'} |`);
  }
  if (report.checkpointHistory?.length) {
    lines.push('', '| Frozen checkpoint | Ordinary value / difference | Ordinary/single | Head-to-head | Combined |', '| --- | --- | ---: | ---: | ---: |');
    for (const previous of report.checkpointHistory) {
      for (const [name, label] of [['pawn', 'Pawn (assumed)'], ['knight', 'Knight'], ['bishop', 'Bishop'], ['rook', 'Rook'], ['queen', 'Queen (assumed)']]) {
        lines.push(`| ${previous.checkpoint} | ${label} | ${number(previous.ordinary.baseline[name])} | ${number(previous.ordinary.head[name])} | ${number(previous.ordinary.combined[name])} |`);
      }
      lines.push(`| ${previous.checkpoint} | Queen minus rook | ${number(previous.queenRookGap.baseline)} | ${number(previous.queenRookGap.head)} | ${number(previous.queenRookGap.combined)} |`);
    }
    lines.push('', '| Frozen checkpoint | Upgrade | Ordinary/single | Head-to-head | Combined |', '| --- | --- | ---: | ---: | ---: |');
    for (const previous of report.checkpointHistory) for (const reference of report.roster) {
      const key = `bonus:${reference.id}`;
      lines.push(`| ${previous.checkpoint} | ${reference.label} | ${number(previous.bonuses.baseline[key])} | ${number(previous.bonuses.head[key])} | ${number(previous.bonuses.combined[key])} |`);
    }
  }
  lines.push('', `Coverage: ${c.phases.middlegame} middlegame and ${c.phases.endgame} endgame samples; ${c.gamesWithoutSamples} completed distinct games contain no eligible sampled positions.`, '',
    'Each completed sampled game has total weight one. Whole selected-position blocks retain all 55 historical and follow-up conditions in folds and paired resamples; broader opening ancestry remains unknown.',
    'Head-to-head games contribute to estimates. Prediction checks hold out every game in an opening group before fitting; final all-game fit agreement is descriptive.',
    'Cohort agreement is a practical design-resolution check, not proof of universal equivalence. Unsupported values remain unavailable. The declared RB queen-match policy stays fixed; purchase prices do not change.',
    'This extension stops after 1280 new games. Completed parent games are never played again or rewritten. At early checkpoints all parent groups are present while only the new prefix is collected.', '');
  for (const warning of report.warnings) lines.push(`- ${warning}`);
  return lines.join('\n') + '\n';
}

function atomicWrite(root, name, content) {
  const temporary = path.join(root, `.${name}.${randomUUID()}.tmp`);
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx'); fs.writeFileSync(fd, content); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    renameWithRetrySync(temporary, path.join(root, name));
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(temporary)) unlinkWithRetrySync(temporary);
  }
}

function checkpointHistory(root, manifestHash, plan, lines, records, maximum) {
  const result = [];
  for (const checkpoint of plan.study.checkpoints.filter(count => count <= maximum)) {
    const file = path.join(root, 'checkpoints', String(checkpoint), REPORT_JSON);
    if (!fs.existsSync(file)) continue;
    const previous = JSON.parse(fs.readFileSync(file, 'utf8'));
    const ids = new Set(plan.schedule.slice(0, checkpoint).map(game => game.id));
    const selected = lines.filter((line, index) => ids.has(records[index].id));
    const digest = sha(selected.join('\n') + (selected.length ? '\n' : ''));
    if (previous.format !== 'levelup-bishop-report' || previous.checkpoint !== checkpoint
      || previous.status !== 'checkpoint-complete' || previous.inputs?.manifestSha256 !== manifestHash
      || previous.inputs?.selectedJournalSha256 !== digest
      || previous.inputs?.parentManifestSha256 !== plan.parent.manifestSha256
      || previous.inputs?.parentJournalSha256 !== plan.parent.journalSha256
      || previous.inputs?.simpleReplaySourceSha256 !== plan.simpleSource.manifestSha256
      || previous.inputs?.simpleJournalSha256 !== plan.simpleSource.journalSha256) fail(`Frozen bishop checkpoint inputs differ: ${file}.`);
    result.push({ checkpoint, samples: previous.coverage.samples, analysisSourceSha256: previous.analysisIdentity.sha256,
      ordinary: Object.fromEntries(COHORTS.map(cohort => [cohort, Object.fromEntries(
        ['pawn', 'knight', 'bishop', 'rook', 'queen'].map(name => [name, previous.estimates[cohort][name].value]))])),
      queenRookGap: Object.fromEntries(COHORTS.map(cohort => [cohort, previous.queenRookGap[cohort].value])),
      bonuses: Object.fromEntries(COHORTS.map(cohort => [cohort, Object.fromEntries(plan.roster.map(reference => {
        const key = `bonus:${reference.id}`; return [key, previous.estimates[cohort][key].value];
      }))])) });
  }
  return result;
}

async function snapshot(root, options) {
  checkAbort(options.signal);
  const manifestBytes = fs.readFileSync(path.join(root, 'collection.json')), manifest = JSON.parse(manifestBytes);
  const plan = validateManifest(manifest), runFile = path.join(root, 'run.json');
  if (fs.existsSync(runFile) && !isDeepStrictEqual(manifest, JSON.parse(fs.readFileSync(runFile)))) fail('Collection and storage manifest snapshots differ.');
  const rulesFile = path.join(root, 'rules', `${plan.profile.variant}.ini`);
  if (fs.existsSync(rulesFile) && fs.readFileSync(rulesFile, 'utf8') !== plan.profile.config) fail('Frozen bishop rules changed.');
  let journal = '';
  try { journal = fs.readFileSync(path.join(root, 'games.jsonl'), 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const end = journal.lastIndexOf('\n') + 1;
  const lines = journal.slice(0, end).split('\n').filter(Boolean), records = lines.map(line => JSON.parse(line));
  const selection = selectPrefix(manifest, records, options.checkpoint), ids = new Set(selection.schedule.map(game => game.id));
  const selectedLines = lines.filter((line, index) => ids.has(records[index].id));
  const selectedBytes = selectedLines.join('\n') + (selectedLines.length ? '\n' : '');
  const parentManifestBytes = fs.readFileSync(path.join(root, 'parent', 'collection.json'));
  const parentJournalBytes = fs.readFileSync(path.join(root, 'parent', 'games.jsonl'));
  const sourceManifestBytes = fs.readFileSync(path.join(root, 'simple-source', 'replay-source.json'));
  const sourceJournalBytes = fs.readFileSync(path.join(root, 'simple-source', 'games.jsonl'));
  const result = await makeBishopReport(manifest, records, { ...options, parentManifestBytes, parentJournalBytes, sourceManifestBytes, sourceJournalBytes });
  checkAbort(options.signal);
  result.report.inputs = { manifestSha256: sha(manifestBytes), selectedJournalSha256: sha(selectedBytes), completeJournalLines: selectedLines.length,
    parentManifestSha256: sha(parentManifestBytes), parentJournalSha256: sha(parentJournalBytes),
    simpleReplaySourceSha256: sha(sourceManifestBytes), simpleJournalSha256: sha(sourceJournalBytes),
    ...(options.checkpoint === undefined ? { ignoredTornTailBytes: Buffer.byteLength(journal.slice(end)) } : {}) };
  const sampleBytes = result.samples.map(sample => JSON.stringify(sample)).join('\n') + (result.samples.length ? '\n' : '');
  result.report.artifacts = { datasetSha256: sha(json(result.dataset)), samplesSha256: sha(sampleBytes),
    epdSha256: Object.fromEntries(Object.entries(result.epd).map(([kind, text]) => [kind, sha(text)])) };
  const outputs = { [REPORT_JSON]: json(result.report), [REPORT_MD]: markdown(result.report),
    'bishop-dataset.json': json(result.dataset), 'bishop-samples.jsonl': sampleBytes,
    'ordinary.epd': result.epd.ordinary, 'single.epd': result.epd.single, 'head.epd': result.epd.head };
  let checkpointDirectory = null;
  if (options.checkpoint !== undefined) {
    checkpointDirectory = path.join(root, 'checkpoints', String(options.checkpoint));
    fs.mkdirSync(checkpointDirectory, { recursive: true });
    for (const name of [REPORT_JSON, REPORT_MD]) {
      const file = path.join(checkpointDirectory, name);
      if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') !== outputs[name]) fail(`Frozen bishop checkpoint artifact differs: ${file}.`);
    }
    for (const name of [REPORT_JSON, REPORT_MD]) if (!fs.existsSync(path.join(checkpointDirectory, name))) atomicWrite(checkpointDirectory, name, outputs[name]);
  }
  result.report.checkpointHistory = checkpointHistory(root, sha(manifestBytes), plan, lines, records,
    options.checkpoint ?? result.report.coveredGames);
  outputs[REPORT_JSON] = json(result.report); outputs[REPORT_MD] = markdown(result.report);
  for (const [name, content] of Object.entries(outputs)) atomicWrite(root, name, content);
  const files = Object.fromEntries(Object.keys(outputs).map(name => [name, path.join(root, name)]));
  return { report: result.report, checkpoint: options.checkpoint ?? null, checkpointDirectory,
    checkpointFile: checkpointDirectory ? path.join(checkpointDirectory, REPORT_JSON) : null,
    files: { ...files, markdown: files[REPORT_MD], json: files[REPORT_JSON], dataset: files['bishop-dataset.json'], samples: files['bishop-samples.jsonl'] } };
}

async function writeBishopReport(directory, options = {}) {
  const root = path.resolve(directory), unlock = acquireLock(root, 'bishop-study-report', 'report.lock');
  try { return await snapshot(root, options); } finally { unlock(); }
}

module.exports = { makeBishopReport, writeBishopReport, markdown, queenRookGap };
