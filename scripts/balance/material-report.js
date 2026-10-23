'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { getCampaign } = require('./material-plan');
const { estimateMaterial } = require('./material-estimate');
const { normalizeConfig } = require('./plan');
const { partitionSchedule } = require('./parallel');
const { summarize } = require('./stats');
const { renameWithRetrySync, unlinkWithRetrySync } = require('./files');

const ROOT = path.resolve(__dirname, '../..');
const MANIFEST = 'material-campaign.json';
const SOURCES = ['scripts/balance/parallel.js', 'scripts/balance/parallel-worker.js',
  'scripts/parallel-balance.js', 'scripts/balance/material-plan.js',
  'scripts/balance/material-estimate.js', 'scripts/balance/material-report.js', 'scripts/material-balance.js'];
const FINAL = new Set(['completed', 'truncated']);
const RESULTS = new Set(['1-0', '0-1', '1/2-1/2']);
const STATUSES = new Set([...FINAL, 'aborted', 'error']);
const sha256 = input => createHash('sha256').update(input).digest('hex');
const fingerprint = value => sha256(JSON.stringify(value));
const equal = (actual, expected, message) => { if (!isDeepStrictEqual(actual, expected)) throw new Error(message); };
const percent = value => value === null ? '—' : `${(100 * value).toFixed(1)}%`;

function coordinatorSources() {
  return SOURCES.map(file => ({ file, sha256: sha256(fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n')) }));
}

/** Read the actual native reference tables; material points are a separate convention. */
function validateReferenceValues(report) {
  if (report?.version !== 1 || !report.pieces) throw new Error('The material pilot requires the version-16 levelupvalues diagnostic.');
  const amazon = getCampaign().registry.allocations.find(item => item.id === 'queen.purple@1')?.letter;
  if (!amazon) throw new Error('The material pilot must retain its Amazon reference.');
  for (const [letter, mg, eg] of [['r', 1276, 1380], ['q', 2538, 2682], [amazon, 3738, 3875]]) {
    for (const piece of [letter, letter.toUpperCase()]) for (const field of ['rawMg', 'rawEg', 'captureMg', 'captureEg', 'evalMg', 'evalEg']) {
      if (report.pieces[piece]?.[field] !== (field.endsWith('Mg') ? mg : eg)) throw new Error(`Material reference ${piece} ${field} changed; use the frozen version-16 reference engine.`);
    }
  }
  return report;
}

function protocol(campaign = getCampaign()) {
  return { id: campaign.id, totalGames: campaign.totalGames, configHash: fingerprint(campaign.config),
    registryHash: campaign.registry.hash, profileHash: campaign.profile.hash,
    layouts: campaign.layouts, metadata: campaign.metadata,
    stages: campaign.stages.map(stage => ({ id: stage.id, phase: stage.phase, number: stage.number,
      directory: stage.directory, games: stage.games, cumulativeGames: stage.cumulativeGames,
      openingIds: stage.openingIds, scheduleHash: fingerprint(stage.schedule) })) };
}

function createCampaignManifest(jobs, engineIdentity, referenceValues) {
  if (!Number.isSafeInteger(jobs) || jobs < 1 || jobs > 16) throw new Error('Use 1–16 workers.');
  validateReferenceValues(referenceValues);
  const manifest = { schemaVersion: 1, format: 'levelup-material-campaign', campaignId: randomUUID(),
    createdAt: new Date().toISOString(), jobs, protocol: protocol(), engineIdentity,
    referenceValues, coordinatorSources: coordinatorSources() };
  return verifyCampaignManifest(manifest);
}

function verifyCampaignManifest(manifest) {
  if (!manifest || manifest.schemaVersion !== 1 || manifest.format !== 'levelup-material-campaign'
    || typeof manifest.campaignId !== 'string' || !manifest.campaignId
    || !Number.isSafeInteger(manifest.jobs) || manifest.jobs < 1 || manifest.jobs > 16) throw new Error('Invalid material campaign manifest.');
  equal(manifest.protocol, protocol(), 'The frozen material protocol changed.');
  for (const key of ['engineSha256', 'rulesBundleSha256', 'runnerSha256']) {
    if (!/^[a-f0-9]{64}$/.test(manifest.engineIdentity?.[key])) throw new Error('The material campaign engine/build identity is missing.');
  }
  if (!Array.isArray(manifest.engineIdentity.runnerSources) || !manifest.engineIdentity.runnerSources.length) throw new Error('The material campaign runner identity is missing.');
  equal(manifest.coordinatorSources, coordinatorSources(), 'The material estimator or coordinator changed. Keep the matching checkout.');
  validateReferenceValues(manifest.referenceValues);
  return manifest;
}

function verifyCurrentIdentity(manifest, identity) {
  verifyCampaignManifest(manifest);
  equal(manifest.engineIdentity, identity, 'Cannot continue: material campaign engine, rules or runner changed.');
}

function verifyRun(manifest, stage, parent) {
  const campaign = getCampaign(), profile = campaign.profile;
  if (!manifest || manifest.schemaVersion !== 1) throw new Error(`Missing ${stage.id} run manifest.`);
  equal(normalizeConfig(manifest.config), campaign.config, `${stage.id} configuration changed.`);
  equal(manifest.schedule, stage.schedule, `${stage.id} schedule changed.`);
  equal(manifest.designRegistry, campaign.registry, `${stage.id} registry changed.`);
  equal(manifest.designProfile, { variant: profile.variant, config: profile.config, hash: profile.hash, registryHash: profile.registryHash }, `${stage.id} profile changed.`);
  for (const key of ['engineSha256', 'rulesBundleSha256', 'runnerSha256', 'runnerSources']) equal(manifest[key], parent.engineIdentity[key], `${stage.id} engine/build identity changed.`);
  const shards = partitionSchedule(stage.schedule, parent.jobs).map((games, index) => ({ worker: index + 1,
    directory: `workers/worker-${String(index + 1).padStart(2, '0')}`, scheduleIds: games.map(game => game.id) }));
  equal(manifest.parallel, { schemaVersion: 1, jobs: parent.jobs, sources: parent.coordinatorSources.slice(0, 3), shards }, `${stage.id} worker assignments changed.`);
  equal(manifest.configHash, fingerprint({ config: campaign.config, schedule: stage.schedule }), `${stage.id} configuration hash changed.`);
  equal(manifest.rulesHash, fingerprint({ bundleHash: parent.engineIdentity.rulesBundleSha256,
    runnerSha256: parent.engineIdentity.runnerSha256, profiles: [{ variant: profile.variant, config: profile.config }] }), `${stage.id} rules hash changed.`);
  equal(manifest.rulesProfiles, [{ variant: profile.variant, whiteKing: 0, blackKing: 0,
    configSha256: sha256(profile.config), file: `rules/${profile.variant}.ini`, royalMode: 'king',
    evaluationCaveat: null, profileHash: profile.hash, registryHash: campaign.registry.hash }], `${stage.id} rules snapshot changed.`);
}

function validatedRecords(records, stage, parent, manifest) {
  verifyRun(manifest, stage, parent);
  if (!Array.isArray(records)) throw new Error('Material journals must contain records.');
  const campaign = getCampaign(), scheduled = new Map(stage.schedule.map(game => [game.id, game])), latest = new Map();
  for (const record of records) {
    const game = record && scheduled.get(record.id), previous = latest.get(record?.id);
    if (!game || record.comparisonId !== game.comparisonId || record.pairId !== game.pairId
      || record.openingId !== game.openingId || record.aColor !== game.aColor
      || record.profileHash !== campaign.profile.hash || record.registryHash !== campaign.registry.hash
      || record.variant !== campaign.profile.variant || record.registryReference !== 'run.json#designRegistry'
      || record.royalMode !== 'king' || record.evaluationCaveat !== null) throw new Error('A material journal record does not match its frozen stage/profile.');
    equal(record.engine, campaign.config.engine, 'Material journal search settings changed.');
    equal(record.evaluation, undefined, 'Material reference evaluation changed.');
    equal(record.whiteStrength, game.aColor === 'w' ? game.comparison.strengthA : game.comparison.strengthB, 'Material White strength changed.');
    equal(record.blackStrength, game.aColor === 'b' ? game.comparison.strengthA : game.comparison.strengthB, 'Material Black strength changed.');
    if (!STATUSES.has(record.status) || !Number.isSafeInteger(record.attempt) || record.attempt < 1
      || record.status === 'completed' && !RESULTS.has(record.result)
      || previous && (record.attempt <= previous.attempt || FINAL.has(previous.status))) throw new Error('Invalid or duplicate material journal attempt.');
    latest.set(record.id, record);
  }
  return { records, finishedGames: [...latest.values()].filter(record => FINAL.has(record.status)).length };
}

function stageReport(stage, run, parent) {
  if (!run) return { id: stage.id, started: false, finished: false, scheduledGames: stage.games, finishedGames: 0 };
  const checked = validatedRecords(run.records, stage, parent, run.manifest);
  return { id: stage.id, started: true, finished: checked.finishedGames === stage.games,
    scheduledGames: stage.games, finishedGames: checked.finishedGames,
    statusCounts: summarize(run.records).statusCounts, runId: run.manifest.runId };
}

function phaseSnapshot(parent, runs, phase, throughStage) {
  const campaign = getCampaign();
  const selected = campaign.stages.filter(stage => stage.phase === phase && (phase === 'control' || stage.number <= throughStage));
  const openingIds = [...new Set(selected.flatMap(stage => stage.openingIds))];
  const records = selected.flatMap(stage => runs[stage.id]?.records || []);
  const comparisons = summarize(records).comparisons;
  const metadata = campaign.metadata.filter(item => item.phase === phase);
  const cells = metadata.map(item => ({ ...item, openings: comparisons.find(row => row.comparisonId === item.comparisonId)?.openingClusters || [] }));
  const eligible = openingIds.filter(openingId => cells.every(cell => cell.openings.some(opening => opening.openingId === openingId)));
  const rows = eligible.flatMap(openingId => cells.map(cell => ({ openingId, layout: cell.layout,
    compensationCp: cell.compensationCp, score: cell.openings.find(opening => opening.openingId === openingId).score })));
  const summary = summarize(records), scoredPairs = comparisons.reduce((sum, row) => sum + row.paired.completePairs, 0);
  const finishedGames = selected.reduce((sum, stage) => sum + (runs[stage.id]
    ? new Set(runs[stage.id].records.filter(record => FINAL.has(record.status)).map(record => record.id)).size : 0), 0);
  const estimate = estimateMaterial(rows);
  const expectedCp = phase === 'control' ? 400 : null;
  return { schemaVersion: 1, format: 'levelup-material-estimate', campaignId: parent.campaignId, phase,
    throughStage: phase === 'control' ? 'control' : throughStage,
    plannedGames: selected.reduce((sum, stage) => sum + stage.games, 0), openingIds,
    sources: selected.map(stage => ({ stage: stage.id, runId: runs[stage.id]?.manifest.runId || null,
      journalHash: fingerprint(runs[stage.id]?.records || []) })),
    estimatorHash: parent.coordinatorSources.find(source => source.file.endsWith('/material-estimate.js')).sha256,
    coverage: { finishedGames, completedGames: summary.statusCounts.completed, completePairs: scoredPairs,
      scoredPairedGames: 2 * scoredPairs, eligibleOpeningBlocks: eligible.length, plannedOpeningBlocks: openingIds.length,
      matchedGames: eligible.length * metadata.length * 2, excludedScoredPairedGames: 2 * scoredPairs - eligible.length * metadata.length * 2,
      statusCounts: summary.statusCounts },
    estimate, cells,
    reference: { materialCpPerPawn: 100, conventionalControlCp: expectedCp,
      conventionalReferenceInsideBracket: expectedCp === null || estimate.estimate.status === 'no-data' ? null
        : (estimate.estimate.lowerCp ?? -Infinity) <= expectedCp && (estimate.estimate.upperCp ?? Infinity) >= expectedCp,
      interpretation: phase === 'control'
        ? 'Queen-versus-rook odds proxy. About 400 material cp is a conventional diagnostic expectation, not exact ground truth; do not rescale Amazon results to force agreement.'
        : 'Contextual Amazon-over-queen pawn-compensation estimate. Raw engine MG/EG and displayed evaluation cp are separate units.' },
    interpretation: 'Complete matched opening blocks only. Pawn-removal layout effects remain; larger samples improve precision without guaranteeing accuracy. The related fixed prefixes support a conditional stability analysis, not universal confidence.' };
}

function makeMaterialReport(parent, runs) {
  verifyCampaignManifest(parent);
  const campaign = getCampaign(), stages = Object.fromEntries(campaign.stages.map(stage => [stage.id, stageReport(stage, runs[stage.id], parent)]));
  for (let index = 1; index < campaign.stages.length; index++) {
    if (stages[campaign.stages[index].id].started && !stages[campaign.stages[index - 1].id].finished) throw new Error('A material stage started before its prerequisite finished.');
  }
  const snapshots = [];
  if (stages.control.finished) snapshots.push({ file: 'estimates/control.json', estimate: phaseSnapshot(parent, runs, 'control', 0) });
  for (const stage of campaign.stages.filter(stage => stage.phase === 'amazon')) {
    if (stages[stage.id].finished) snapshots.push({ file: `estimates/amazon-${stage.cumulativeGames}.json`, estimate: phaseSnapshot(parent, runs, 'amazon', stage.number) });
  }
  const amazonStarted = campaign.stages.filter(stage => stage.phase === 'amazon' && stages[stage.id].started);
  return { schemaVersion: 1, format: 'levelup-material-report', campaignId: parent.campaignId,
    scheduledGames: campaign.totalGames, stages,
    finished: Object.values(stages).every(stage => stage.finished),
    finishedGames: Object.values(stages).reduce((sum, stage) => sum + stage.finishedGames, 0),
    control: phaseSnapshot(parent, runs, 'control', 0),
    amazon: phaseSnapshot(parent, runs, 'amazon', amazonStarted.at(-1)?.number || 1),
    snapshots, controlReuse: 'The control is reused only within this frozen engine, reference evaluation, rules, node budget, layout method and opening protocol. Relevant protocol changes require a fresh control.',
    stoppingRule: '512 scheduled games maximum. No extrapolation, automatic extra stage, or sample-size selection based on the preferred estimate.' };
}

function readJournal(directory) {
  try { const input = fs.readFileSync(path.join(directory, 'games.jsonl'), 'utf8');
    return input.slice(0, input.lastIndexOf('\n') + 1).split('\n').filter(Boolean).map(JSON.parse);
  } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

function readCampaignDirectory(directory) {
  const root = path.resolve(directory), campaign = verifyCampaignManifest(JSON.parse(fs.readFileSync(path.join(root, MANIFEST), 'utf8'))), runs = {};
  for (const stage of getCampaign().stages) {
    const dir = path.join(root, stage.directory), filename = path.join(dir, 'run.json');
    if (fs.existsSync(filename)) runs[stage.id] = { manifest: JSON.parse(fs.readFileSync(filename, 'utf8')), records: readJournal(dir) };
  }
  return { root, campaign, runs };
}

function atomicWrite(filename, text) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = path.join(path.dirname(filename), `.${path.basename(filename)}.${randomUUID()}.tmp`);
  try { fs.writeFileSync(temporary, text, { flag: 'wx' }); renameWithRetrySync(temporary, filename); }
  finally { unlinkWithRetrySync(temporary); }
}

function describe(estimate) {
  if (estimate.status === 'no-data') return 'No complete matched opening blocks yet.';
  if (estimate.status === 'below-range') return 'Below the tested 200 material cp boundary; no extrapolation.';
  if (estimate.status === 'above-range') return 'Above the tested 500 material cp boundary; no extrapolation.';
  if (estimate.status === 'plateau') return `50% plateau: ${estimate.lowerCp}–${estimate.upperCp} material cp.`;
  return `${estimate.lowerCp}–${estimate.upperCp} material cp bracket; interpolated crossing about ${Math.round(estimate.pointCp / 10) * 10} cp (provisional).`;
}

function renderPhase(phase, title) {
  const result = phase.estimate;
  const rows = result.rawCurve.map((point, index) => `| ${point.compensationCp} | ${percent(point.score)} | ${percent(result.layouts.find(layout => layout.layout === 'left').rawCurve[index].score)} | ${percent(result.layouts.find(layout => layout.layout === 'right').rawCurve[index].score)} | ${percent(result.fittedCurve[index].score)} |`).join('\n');
  const layouts = result.layouts.map(layout => `- ${layout.layout}: ${describe(layout.estimate)}`).join('\n');
  const stability = result.bootstrap.available
    ? `95% opening-resampling stability band: ${result.bootstrap.lowerCp ?? 'below tested range'} to ${result.bootstrap.upperCp ?? 'above tested range'} material cp. Fixed related openings make this conditional, not universal confidence.`
    : `Resampling band unavailable: ${result.bootstrap.reason}.`;
  return `## ${title}\n\n${phase.coverage.finishedGames}/${phase.plannedGames} scheduled games finalized; ${phase.coverage.scoredPairedGames} scored paired games, ${phase.coverage.eligibleOpeningBlocks}/${phase.coverage.plannedOpeningBlocks} complete matched opening blocks. ${phase.coverage.excludedScoredPairedGames} paired scored games excluded from the balanced estimate.\n\n${describe(result.estimate)}\n\n| Compensation (material cp) | Raw A score | Left raw | Right raw | Monotone fit |\n| --- | ---: | ---: | ---: | ---: |\n${rows}\n\n${layouts || 'No per-layout estimates yet.'}\n\n${stability}\n\nRaw reversals: ${result.diagnostics.reversals.length}. Inspect layout differences; the fit does not remove their bias.\n\n${phase.reference.interpretation}\n`;
}

function writeMaterialReport(directory) {
  const { root, campaign, runs } = readCampaignDirectory(directory), report = makeMaterialReport(campaign, runs);
  // Check every old checkpoint before writing anything. A changed estimator or
  // journal never silently replaces a previously stored cumulative result.
  const declared = ['estimates/control.json', ...getCampaign().stages.filter(stage => stage.phase === 'amazon')
    .map(stage => `estimates/amazon-${stage.cumulativeGames}.json`)];
  for (const file of declared) {
    if (fs.existsSync(path.join(root, file)) && !report.snapshots.some(snapshot => snapshot.file === file)) {
      throw new Error('A stored material checkpoint no longer has its completed stage; preserve the original evidence.');
    }
  }
  for (const snapshot of report.snapshots) {
    const filename = path.join(root, snapshot.file);
    if (fs.existsSync(filename)) equal(JSON.parse(fs.readFileSync(filename, 'utf8')), snapshot.estimate, 'A stored material checkpoint differs; preserve the original evidence.');
  }
  for (const snapshot of report.snapshots) {
    const filename = path.join(root, snapshot.file);
    if (!fs.existsSync(filename)) atomicWrite(filename, JSON.stringify(snapshot.estimate, null, 2) + '\n');
  }
  const files = { json: path.join(root, 'material-report.json'), markdown: path.join(root, 'material-report.md') };
  atomicWrite(files.json, JSON.stringify(report, null, 2) + '\n');
  atomicWrite(files.markdown, `# Material compensation pilot\n\n${report.finishedGames}/${report.scheduledGames} games finalized. ${report.stoppingRule}\n\nCheckpoints are cumulative and dependent; sample sizes are not guaranteed accuracy levels. A snapshot filename denotes planned games, while scored coverage is reported separately.\n\n${renderPhase(report.control, 'Queen-versus-rook odds control')}\n${renderPhase(report.amazon, 'Amazon-over-queen compensation')}\n${report.controlReuse}\n`);
  return { report, files };
}

module.exports = { MANIFEST, createCampaignManifest, verifyCampaignManifest, verifyCurrentIdentity,
  validateReferenceValues, coordinatorSources, readCampaignDirectory, makeMaterialReport,
  writeMaterialReport, fingerprint };
