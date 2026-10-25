'use strict';

// Offline reporting only. Original manifests and journals are never rewritten.
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { makeCollectionReport } = require('./material-collection-report');
const { analyzeDataset } = require('./material-regression');
const { renameWithRetrySync, unlinkWithRetrySync } = require('./files');

const STUDY_ID = 'material-collection-v16-confirmation-001';
const CHECKPOINTS = [384, 768, 1152];
const ORDINARY = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'tempo'];
const BONUS = 'bonus:queen.purple@1';
const FINAL = new Set(['completed', 'truncated']);
const sha = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const fail = message => { throw new Error(message); };
const turnOfLoop = () => new Promise(resolve => setImmediate(resolve));

function analysisIdentity() {
  const root = path.resolve(__dirname, '../..');
  const files = ['scripts/balance/material-study-report.js', 'scripts/balance/material-collection-report.js',
    'scripts/balance/material-dataset.js', 'scripts/balance/material-regression.js', 'dist/balance-rules.cjs']
    .map(file => ({ file, sha256: sha(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')) }));
  return { normalization: 'UTF-8 text with CRLF normalized to LF', files, sha256: sha(json(files)),
    interpretation: 'Current replay and analysis sources, separate from the original collection manifest identity.' };
}

function validateStudy(manifest) {
  const plan = manifest?.plan, study = plan?.study;
  if (plan?.protocol?.id !== STUDY_ID || !study || !Array.isArray(plan.schedule)
    || plan.schedule.length !== 1152 || plan.settings?.totalGames !== 1152
    || !isDeepStrictEqual(study.checkpoints, CHECKPOINTS) || study.jobs !== 4 || manifest.jobs !== 4
    || !isDeepStrictEqual(study.analysis?.anchors, { pawn: 1, queen: 9 })
    || study.analysis.ridge !== 0.001 || study.analysis.bootstrap !== 200
    || study.analysis.validationFolds !== 5) fail('An intact declared 1,152-game material study is required.');
  const ids = new Set(), groups = new Map();
  for (const game of plan.schedule) {
    if (!game || ids.has(game.id)) fail('Study schedule contains a missing or duplicate game.');
    ids.add(game.id);
    const group = groups.get(game.openingId) || [];
    group.push(game); groups.set(game.openingId, group);
  }
  if (groups.size !== 384 || [...groups.values()].some(group => group.length !== 3
    || group.filter(game => game.kind === 'ordinary').length !== 1
    || group.filter(game => game.kind === 'amazon' && game.aColor === 'w').length !== 1
    || group.filter(game => game.kind === 'amazon' && game.aColor === 'b').length !== 1)) fail('Study schedule must contain 384 complete three-condition positions.');
  for (const count of CHECKPOINTS) {
    const prefix = new Set(plan.schedule.slice(0, count).map(game => game.openingId));
    if (prefix.size !== count / 3 || plan.schedule.slice(count).some(game => prefix.has(game.openingId))) fail('Study checkpoints must preserve complete position triplets.');
  }
  return plan;
}

function selectPrefix(manifest, records, checkpoint) {
  const plan = validateStudy(manifest), fullIds = new Set(plan.schedule.map(game => game.id));
  if (records.some(record => !record || !fullIds.has(record.id))) fail('Foreign record in the material study journal.');
  if (checkpoint !== undefined && !CHECKPOINTS.includes(checkpoint)) fail('Use a declared 384, 768 or 1152-game checkpoint.');
  const schedule = checkpoint === undefined ? plan.schedule : plan.schedule.slice(0, checkpoint);
  const ids = new Set(schedule.map(game => game.id));
  const selected = records.filter(record => ids.has(record.id));
  // Preserve the frozen complete plan separately; replay this prefix only.
  const replayManifest = { ...manifest, plan: { ...plan, schedule } };
  return { plan, schedule, selected, replayManifest };
}

function project(dataset, cohort) {
  const games = cohort === 'combined' ? dataset.games : dataset.games.filter(game => game.kind === 'ordinary');
  const ids = new Set(games.map(game => game.gameId));
  const names = cohort === 'combined' ? dataset.featureNames : ORDINARY;
  const indices = names.map(name => dataset.featureNames.indexOf(name));
  return { ...dataset, featureNames: names, games,
    samples: dataset.samples.filter(sample => ids.has(sample.gameId)).map(sample => ({ ...sample, x: indices.map(index => sample.x[index]) })) };
}

function groupLabels(analysis) {
  const label = value => typeof value === 'string' ? value.replaceAll('opening-families', 'selected-book-position-clusters') : value;
  analysis.method.bootstrapUnit = 'whole selected-book-position cluster';
  analysis.method.groupingCaveat = 'Conditions share a selected position; distinct FENs may still share opening ancestry.';
  analysis.validation.unit = 'whole-selected-book-position-cluster';
  analysis.bootstrap.groupUnit = 'whole-selected-book-position-cluster';
  analysis.bootstrap.interpretation = 'Conditional resampling across selected book-position clusters; broader opening ancestry is unknown.';
  analysis.normalized.reason = label(analysis.normalized.reason);
  analysis.normalized.reasons = analysis.normalized.reasons.map(label);
  analysis.normalized.materialPriceTableSupported = false;
  analysis.normalized.interpretation = 'Conditional estimates under the declared model, not intrinsic exchange prices.';
  analysis.warnings = analysis.warnings.map(label);
  return analysis;
}

function estimates(analysis) {
  const available = analysis.normalized.available, values = analysis.normalized.values || {};
  const intervals = analysis.bootstrap.ratioIntervals || {};
  const result = {};
  for (const name of ['pawn', 'knight', 'bishop', 'rook', 'queen', BONUS]) {
    const assumed = name === 'pawn' || name === 'queen';
    const value = assumed ? (name === 'pawn' ? 1 : 9) : available ? values[name] : null;
    const interval = assumed || !available ? null : intervals[name] || null;
    result[name] = { value: Number.isFinite(value) ? value : null, assumed,
      supported: assumed || available && Number.isFinite(value),
      interval: interval && Number.isFinite(interval.lower) && Number.isFinite(interval.upper) ? interval : null };
  }
  const bonus = result[BONUS];
  result.amazonTotal = { value: bonus.value === null ? null : 9 + bonus.value, assumed: false, supported: bonus.supported,
    interval: bonus.interval ? { lower: 9 + bonus.interval.lower, upper: 9 + bonus.interval.upper } : null };
  return result;
}

function materialSupport(dataset) {
  const index = Object.fromEntries(['rook', 'queen'].map(name => [name, dataset.featureNames.indexOf(name)]));
  const games = new Map(dataset.games.map(game => [game.gameId, game]));
  const support = rows => Object.fromEntries(Object.entries(index).map(([name, column]) => {
    const nonzero = rows.filter(row => row.x[column] !== 0);
    return [name, { samples: nonzero.length, games: new Set(nonzero.map(row => row.gameId)).size,
      groups: new Set(nonzero.map(row => row.groupId)).size,
      positiveGames: new Set(nonzero.filter(row => row.x[column] > 0).map(row => row.gameId)).size,
      negativeGames: new Set(nonzero.filter(row => row.x[column] < 0).map(row => row.gameId)).size }];
  }));
  return Object.fromEntries(['ordinary', 'combined'].map(cohort => {
    const rows = dataset.samples.filter(row => cohort === 'combined' || games.get(row.gameId).kind === 'ordinary');
    return [cohort, { ...support(rows), phases: Object.fromEntries(['middlegame', 'endgame'].map(phase => {
      const selected = rows.filter(row => row.phase === phase);
      return [phase, { samples: selected.length, games: new Set(selected.map(row => row.gameId)).size, ...support(selected) }];
    })) }];
  }));
}

async function makeStudyReport(manifest, records, { checkpoint, rulesFactory, bootstrap, onProgress = () => {}, analyze = analyzeDataset } = {}) {
  if (!Array.isArray(records)) fail('Material study records must be an array.');
  const { plan, schedule, selected, replayManifest } = selectPrefix(manifest, records, checkpoint);
  onProgress(`Replaying ${schedule.length} scheduled games for ${checkpoint === undefined ? 'the current study report' : `checkpoint ${checkpoint}`}.`);
  const extracted = await makeCollectionReport(replayManifest, selected, { rulesFactory, bootstrap: 0, analyze: false });
  const latest = new Map(selected.map(record => [record.id, record]));
  const finalized = schedule.filter(game => FINAL.has(latest.get(game.id)?.status)).length;
  if (checkpoint !== undefined && finalized !== checkpoint) fail('Cannot freeze a checkpoint before every scheduled prefix game is finished.');
  const limitations = [
    'Pawn = 1 and queen = 9 are declared analysis anchors, not measured ratios.',
    'More data can reduce sampling uncertainty without removing selection bias, phase dependence or model assumptions.',
    'Whole selected-position clusters preserve triplets; distinct book positions may share opening ancestry.',
    'Material-stable windows do not prove tactical quietness; sampled games retain unit total weight and draws.',
    'Original pilot and external EPD data are not pooled into this study.',
  ];
  const dataset = { ...extracted.dataset, samples: extracted.samples, limitations };
  const analysis = { primary: {}, diagnostic: {} }, requested = bootstrap ?? plan.study.analysis.bootstrap;
  if (!Number.isSafeInteger(requested) || requested < 0 || requested > 1000) fail('Use bootstrap 0–1000.');
  if (checkpoint !== undefined && requested !== plan.study.analysis.bootstrap) fail('Frozen study checkpoints must retain their declared bootstrap count.');
  for (const mode of ['primary', 'diagnostic']) for (const cohort of ['ordinary', 'combined']) {
    await turnOfLoop();
    const label = `${mode} ${cohort}`;
    onProgress(`Analyzing ${label}: ${requested} cluster resamples and five grouped validation folds.`);
    const options = { bootstrap: requested, seed: plan.settings.seed ?? 42, validationFolds: plan.study.analysis.validationFolds,
      onProgress(event) { onProgress(`${label}: ${event.phase} ${event.completed}/${event.total}.`); } };
    if (mode === 'primary') options.anchors = plan.study.analysis.anchors;
    analysis[mode][cohort] = groupLabels(await analyze(project(dataset, cohort), options));
  }
  const current = { ordinary: estimates(analysis.primary.ordinary), combined: estimates(analysis.primary.combined) };
  const ordinaryRook = current.ordinary.rook.value, combinedRook = current.combined.rook.value;
  const warnings = [...limitations, ...extracted.report.warnings.filter(value => !value.startsWith('This capped book-position pilot')
    && !value.startsWith('Starting-position groups') && !value.startsWith('Material-stable windows')
    && !value.startsWith('Original external baseline'))];
  if (!analysis.primary.ordinary.normalized.available) warnings.push('The ordinary-only primary estimate is currently unsupported; inspect feature coverage and its reporting reasons.');
  if (!analysis.primary.combined.normalized.available) warnings.push('The combined primary estimate is currently unsupported; a fitted coefficient alone is not enough for reporting.');
  const support = materialSupport(dataset);
  if (support.ordinary.rook.groups < 8) warnings.push('Ordinary rook imbalance currently covers fewer than eight starting-position groups; more complete games do not guarantee useful rook support.');
  if (!support.ordinary.rook.positiveGames || !support.ordinary.rook.negativeGames) warnings.push('Ordinary rook imbalance currently lacks at least one sign in the retained samples.');
  const coverage = { ...extracted.report.coverage, studyScheduledGames: plan.schedule.length,
    finalizedGames: finalized, triplets: new Set(schedule.map(game => game.openingId)).size,
    attemptStatusCounts: Object.fromEntries(['completed', 'truncated', 'error', 'aborted'].map(status => [status, selected.filter(record => record.status === status).length])) };
  const report = { schemaVersion: 1, format: 'levelup-material-study-report', runId: manifest.runId,
    studyId: plan.protocol.id, checkpoint: checkpoint ?? null, coveredGames: finalized,
    status: checkpoint !== undefined ? 'checkpoint-complete' : finalized === plan.schedule.length ? 'complete' : 'provisional',
    studyCap: plan.schedule.length, checkpoints: plan.study.checkpoints, profileHash: plan.profile.hash, registryHash: plan.registry.hash,
    analysisIdentity: analysisIdentity(),
    policy: { ...plan.study.analysis, bootstrap: requested, nativeEvaluation: 'unchanged automatic',
      interpretation: 'Primary estimates assume pawn = 1 and queen = 9; unconstrained fits are diagnostics.' },
    coverage, sampling: plan.protocol.sampling, materialSupport: support, analysis,
    estimates: current, currentEstimate: current.combined,
    ordinaryCombinedRookGap: Number.isFinite(ordinaryRook) && Number.isFinite(combinedRook) ? Math.abs(ordinaryRook - combinedRook) : null,
    warnings, materialPriceTableSupported: false,
    interpretation: 'Conditional strength estimates under chosen anchors. No purchase prices or native evaluation values are changed.' };
  const metadata = { ...dataset, samples: undefined, sampleCount: extracted.samples.length };
  return { report, dataset: metadata, samples: extracted.samples, epd: extracted.epd };
}

function markdown(report) {
  const c = report.coverage, number = (value, places = 2) => Number.isFinite(value) ? value.toFixed(places) : 'unavailable';
  const value = estimate => estimate.assumed ? `${number(estimate.value)} (assumed)` : estimate.value === null ? 'unavailable' : number(estimate.value);
  const band = estimate => estimate.assumed ? 'fixed assumption' : estimate.interval ? `${number(estimate.interval.lower)}–${number(estimate.interval.upper)}` : 'unavailable';
  const lines = ['# Material study: cumulative estimates', '', report.interpretation, '',
    `Current analysis source identity: ${report.analysisIdentity.sha256} (normalized LF).`,
    `Status: ${report.status}; checkpoint: ${report.checkpoint ?? 'current'}; finished ${report.coveredGames}/${c.scheduledGames} scheduled games in this report. Study cap: ${report.studyCap}.`,
    `Completed outcomes: ${c.completedRecords}; distinct histories: ${c.uniqueHistories}; sampled games: ${c.sampledGames}; positions: ${c.samples}.`,
    `Latest game statuses: ${c.statusCounts.truncated} truncated, ${c.statusCounts.error} errors, ${c.statusCounts.aborted} aborted. Remaining in this prefix: ${c.remainingGames}.`,
    `Journal records: ${c.journalAttempts}; ${c.attemptStatusCounts.error} error and ${c.attemptStatusCounts.aborted} aborted records, including earlier unfinished attempts. They remain unscored.`, '',
    '| Primary quantity | Ordinary-only | Combined | Combined conditional 95% range |', '| --- | ---: | ---: | --- |'];
  for (const [name, label] of [['pawn', 'Pawn'], ['knight', 'Knight'], ['bishop', 'Bishop'], ['rook', 'Rook'], ['queen', 'Queen'], [BONUS, 'Amazon upgrade bonus'], ['amazonTotal', 'Amazon total']]) {
    lines.push(`| ${label} | ${value(report.estimates.ordinary[name])} | ${value(report.estimates.combined[name])} | ${band(report.estimates.combined[name])} |`);
  }
  lines.push('', `Absolute ordinary/combined rook gap: ${number(report.ordinaryCombinedRookGap)}.`, '',
    '| Fit | Effective rank | Converged | Held-out Brier | Constant baseline | Supported normalized estimates |', '| --- | --- | --- | ---: | ---: | --- |');
  for (const mode of ['primary', 'diagnostic']) for (const cohort of ['ordinary', 'combined']) {
    const a = report.analysis[mode][cohort];
    lines.push(`| ${mode} ${cohort} | ${a.rank.rank}/${a.rank.columns} | ${a.fit.converged} | ${number(a.validation.metrics?.brier, 4)} | ${number(a.validation.baselineMetrics?.brier, 4)} | ${a.normalized.available ? 'conditional only' : a.normalized.reason} |`);
  }
  if (report.checkpointHistory?.length) {
    lines.push('', '| Frozen checkpoint | Samples | Ordinary rook | Combined rook | Rook gap | Amazon bonus | Bonus range |', '| --- | ---: | ---: | ---: | ---: | ---: | --- |');
    for (const previous of report.checkpointHistory) lines.push(`| ${previous.checkpoint} | ${previous.samples} | ${number(previous.ordinaryRook)} | ${number(previous.combinedRook)} | ${number(previous.rookGap)} | ${number(previous.amazonBonus)} | ${previous.bonusInterval ? `${number(previous.bonusInterval.lower)}–${number(previous.bonusInterval.upper)}` : 'unavailable'} |`);
  }
  lines.push('', '| Material variation | Ordinary games / groups | Combined games / groups |', '| --- | ---: | ---: |');
  for (const name of ['rook', 'queen']) {
    const a = report.materialSupport.ordinary[name], b = report.materialSupport.combined[name];
    lines.push(`| ${name} imbalance | ${a.games} / ${a.groups} | ${b.games} / ${b.groups} |`);
  }
  lines.push('', `Amazon imbalance: ${c.upgradeImbalance.games} games across ${c.upgradeImbalance.openingGroups} groups; ${c.upgradeImbalance.positiveSamples} positive and ${c.upgradeImbalance.negativeSamples} negative sampled positions.`,
    `Phase samples: ${c.phases.middlegame} middlegame, ${c.phases.endgame} endgame. Detailed signs, phase support, raw coefficients, unconstrained values and resampling failures are in JSON.`, '',
    'Ranges resample whole selected book-position clusters and are conditional on this book, model and playing policy. They are not universal material confidence intervals. The pawn/queen anchors have no empirical interval because they are assumptions.',
    'The study uses five deterministic grouped validation folds. Related opening ancestry may extend across different FENs. More games do not automatically correct model or selection bias.', '',
    'Review the 384/768/1152-game checkpoints for estimate changes, interval width, ordinary/combined disagreement and phase support. Roughly half a pawn is a practical design-resolution guide, not a statistical acceptance test. No extension follows automatically.', '');
  for (const warning of report.warnings) lines.push(`- ${warning}`);
  lines.push('');
  return lines.join('\n');
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
  for (const count of CHECKPOINTS.filter(value => value <= maximum)) {
    const file = path.join(root, 'checkpoints', String(count), 'material-study-report.json');
    if (!fs.existsSync(file)) continue;
    const previous = JSON.parse(fs.readFileSync(file, 'utf8'));
    const ids = new Set(plan.schedule.slice(0, count).map(game => game.id));
    const selected = lines.filter((line, index) => ids.has(records[index].id));
    const digest = sha(selected.join('\n') + (selected.length ? '\n' : ''));
    if (previous.format !== 'levelup-material-study-report' || previous.checkpoint !== count
      || previous.status !== 'checkpoint-complete' || previous.inputs?.manifestSha256 !== manifestHash
      || previous.inputs?.selectedJournalSha256 !== digest) fail(`Frozen checkpoint inputs differ: ${file}.`);
    result.push({ checkpoint: count, samples: previous.coverage.samples,
      analysisSourceSha256: previous.analysisIdentity?.sha256 || null,
      ordinaryRook: previous.estimates.ordinary.rook.value, combinedRook: previous.estimates.combined.rook.value,
      rookGap: previous.ordinaryCombinedRookGap, amazonBonus: previous.estimates.combined[BONUS].value,
      bonusInterval: previous.estimates.combined[BONUS].interval });
  }
  return result;
}

async function snapshot(root, options) {
  const manifestBytes = fs.readFileSync(path.join(root, 'collection.json')), manifest = JSON.parse(manifestBytes);
  const runFile = path.join(root, 'run.json');
  if (fs.existsSync(runFile) && !isDeepStrictEqual(manifest, JSON.parse(fs.readFileSync(runFile)))) fail('Collection and storage manifest snapshots differ.');
  const plan = validateStudy(manifest), rulesFile = path.join(root, 'rules', `${plan.profile.variant}.ini`);
  if (fs.existsSync(rulesFile) && fs.readFileSync(rulesFile, 'utf8') !== plan.profile.config) fail('The frozen study rules file changed.');
  let journal = '';
  try { journal = fs.readFileSync(path.join(root, 'games.jsonl'), 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const end = journal.lastIndexOf('\n') + 1;
  const lines = journal.slice(0, end).split('\n').filter(Boolean), records = lines.map(line => JSON.parse(line));
  const selection = selectPrefix(manifest, records, options.checkpoint);
  const ids = new Set(selection.schedule.map(game => game.id));
  const selectedLines = lines.filter((line, index) => ids.has(records[index].id));
  const selectedBytes = selectedLines.join('\n') + (selectedLines.length ? '\n' : '');
  const result = await makeStudyReport(manifest, records, options);
  result.report.inputs = { manifestSha256: sha(manifestBytes), selectedJournalSha256: sha(selectedBytes),
    completeJournalLines: selectedLines.length,
    ...(options.checkpoint === undefined ? { ignoredTornTailBytes: Buffer.byteLength(journal.slice(end)) } : {}) };
  const sampleBytes = result.samples.map(sample => JSON.stringify(sample)).join('\n') + (result.samples.length ? '\n' : '');
  result.report.artifacts = { datasetSha256: sha(json(result.dataset)), samplesSha256: sha(sampleBytes),
    ordinaryEpdSha256: sha(result.epd.ordinary), amazonEpdSha256: sha(result.epd.amazon) };
  const outputs = { 'material-study-report.json': json(result.report), 'material-study-report.md': markdown(result.report),
    'material-dataset.json': json(result.dataset), 'material-samples.jsonl': sampleBytes,
    'ordinary.epd': result.epd.ordinary, 'amazon.epd': result.epd.amazon };
  let checkpointDirectory = null;
  if (options.checkpoint !== undefined) {
    checkpointDirectory = path.join(root, 'checkpoints', String(options.checkpoint));
    fs.mkdirSync(checkpointDirectory, { recursive: true });
    for (const name of ['material-study-report.json', 'material-study-report.md']) {
      const file = path.join(checkpointDirectory, name);
      if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') !== outputs[name]) fail(`Frozen checkpoint artifact differs: ${file}.`);
    }
    for (const name of ['material-study-report.json', 'material-study-report.md']) {
      if (!fs.existsSync(path.join(checkpointDirectory, name))) atomicWrite(checkpointDirectory, name, outputs[name]);
    }
  }
  // Historical snapshots stay independent of which later checkpoint files exist.
  // Only the refreshable top-level report includes their trajectory.
  result.report.checkpointHistory = checkpointHistory(root, sha(manifestBytes), plan, lines, records,
    options.checkpoint ?? result.report.coveredGames);
  outputs['material-study-report.json'] = json(result.report);
  outputs['material-study-report.md'] = markdown(result.report);
  for (const [name, content] of Object.entries(outputs)) atomicWrite(root, name, content);
  const files = Object.fromEntries(Object.keys(outputs).map(name => [name, path.join(root, name)]));
  return { report: result.report, checkpoint: options.checkpoint ?? null, checkpointDirectory,
    checkpointFile: checkpointDirectory ? path.join(checkpointDirectory, 'material-study-report.json') : null,
    files: { ...files, markdown: files['material-study-report.md'], json: files['material-study-report.json'],
      dataset: files['material-dataset.json'], samples: files['material-samples.jsonl'] } };
}

async function writeStudyReport(directory, options = {}) {
  const root = path.resolve(directory), lockFile = path.join(root, 'report.lock');
  let descriptor;
  try { descriptor = fs.openSync(lockFile, 'wx'); }
  catch (error) { if (error.code === 'EEXIST') fail(`Another material report writer holds ${lockFile}.`); throw error; }
  const lockIdentity = fs.fstatSync(descriptor);
  try {
    fs.writeFileSync(descriptor, json({ pid: process.pid, token: randomUUID(), startedAt: new Date().toISOString() })); fs.fsyncSync(descriptor);
    return await snapshot(root, options);
  } finally {
    fs.closeSync(descriptor);
    let current;
    try { current = fs.statSync(lockFile); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (current && current.dev === lockIdentity.dev && current.ino === lockIdentity.ino) unlinkWithRetrySync(lockFile);
  }
}

module.exports = { makeStudyReport, writeStudyReport, markdown };
