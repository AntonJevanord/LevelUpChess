'use strict';

// Offline journal replay and exports. No UCI engine or new games are started.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { decodeMaterial, DEFAULT_SAMPLING } = require('./material-dataset');
const { analyzeDataset } = require('./material-regression');
const { renameWithRetrySync, unlinkWithRetrySync } = require('./files');

const SCORES = { '1-0': 1, '1/2-1/2': 0.5, '0-1': 0 };
const STATUSES = new Set(['completed', 'truncated', 'aborted', 'error']);
const ORDINARY = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'tempo'];
const BONUS = 'bonus:queen.purple@1';
const hash = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const fail = message => { throw new Error(message); };

function atomicWrite(directory, name, bytes) {
  const temporary = path.join(directory, `.${name}.${randomUUID()}.tmp`);
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx'); fs.writeFileSync(fd, bytes); fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    renameWithRetrySync(temporary, path.join(directory, name));
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(temporary)) unlinkWithRetrySync(temporary);
  }
}

function validateSnapshot(manifest) {
  const plan = manifest?.plan;
  if (!manifest || manifest.schemaVersion !== 1 || manifest.format !== 'levelup-material-collection'
    || typeof manifest.runId !== 'string' || !manifest.runId || /[;\r\n]/.test(manifest.runId)
    || !plan || !Array.isArray(plan.schedule) || !plan.schedule.length || !plan.settings
    || !plan.profile || !plan.registry || plan.profile.registryHash !== plan.registry.hash
    || !isDeepStrictEqual(plan.profile.registry, plan.registry)) fail('An intact collection manifest and frozen profile are required.');
  if (!isDeepStrictEqual(plan.protocol?.sampling, DEFAULT_SAMPLING)) fail('Collection sampling differs from the frozen min16/stride5/stable2 protocol. Use its matching reporter revision.');
  const ids = new Set();
  for (const game of plan.schedule) {
    for (const field of ['id', 'unitId', 'openingId', 'comparisonId']) {
      if (typeof game[field] !== 'string' || !game[field] || /[;\r\n]/.test(game[field])) fail(`Invalid planned collection ${field}.`);
    }
    if (ids.has(game.id) || !['ordinary', 'amazon'].includes(game.kind) || !['w', 'b'].includes(game.aColor)
      || typeof game.startFen !== 'string') fail('The collection schedule has duplicate or malformed games.');
    ids.add(game.id);
  }
  // This also checks canonical registry definitions/profile compilation.
  decodeMaterial(plan.schedule[0].startFen, plan.profile);
  return plan;
}

function latestRecords(manifest, records) {
  const plan = validateSnapshot(manifest), scheduled = new Map(plan.schedule.map(game => [game.id, game]));
  const latest = new Map();
  const settings = { nodes: plan.settings.nodes, threads: plan.settings.threads,
    hashMb: plan.settings.hashMb, maxPlies: plan.settings.maxPlies };
  for (const record of records) {
    const game = record && scheduled.get(record.id);
    if (!game || !STATUSES.has(record.status) || !Number.isSafeInteger(record.attempt) || record.attempt < 1) fail('Foreign or malformed collection journal record.');
    for (const field of ['unitId', 'kind', 'aColor', 'openingId', 'comparisonId', 'startFen']) {
      if (record[field] !== game[field]) fail(`Collection record ${record.id} differs from planned ${field}.`);
    }
    if (record.profileHash !== plan.profile.hash || record.registryHash !== plan.registry.hash
      || record.variant !== plan.profile.variant || record.registryReference !== 'collection.json#plan.registry'
      || record.royalMode !== 'king' || record.evaluationCaveat !== null
      || !isDeepStrictEqual(record.evaluation, plan.profile.evaluation)
      || !isDeepStrictEqual(record.engine, settings)
      || !isDeepStrictEqual(record.whiteStrength, { skill: plan.settings.skill })
      || !isDeepStrictEqual(record.blackStrength, { skill: plan.settings.skill })) fail(`Collection identity or search policy mismatch: ${record.id}.`);
    if (!Array.isArray(record.moves) || !Array.isArray(record.sans) || record.moves.length !== record.sans.length
      || record.totalPlies !== record.moves.length || record.playedPlies !== record.moves.length
      || record.openingPlies !== 0 || !Array.isArray(record.openingMoves) || record.openingMoves.length !== 0) fail(`Inconsistent collection move counts: ${record.id}.`);
    if (record.status === 'completed' ? !Object.hasOwn(SCORES, record.result) : record.result !== '*') fail(`Unscored collection records cannot be chess results: ${record.id}.`);
    const previous = latest.get(record.id);
    if (previous) {
      if (isDeepStrictEqual(previous, record)) continue;
      if (previous.status === 'completed' || previous.status === 'truncated'
        || record.attempt <= previous.attempt || previous.moves.some((move, index) => record.moves[index] !== move)) fail(`Conflicting attempts or completed collection history: ${record.id}.`);
    }
    latest.set(record.id, record);
  }
  return { plan, latest };
}

function project(dataset, kind, featureNames) {
  const games = kind ? dataset.games.filter(game => game.kind === kind) : dataset.games;
  const ids = new Set(games.map(game => game.gameId)), indices = featureNames.map(name => dataset.featureNames.indexOf(name));
  return { ...dataset, featureNames, games,
    samples: dataset.samples.filter(sample => ids.has(sample.gameId)).map(sample => ({ ...sample, x: indices.map(index => sample.x[index]) })) };
}

function clusterAnalysis(dataset, options) {
  const analysis = analyzeDataset(dataset, options);
  const clusterLabel = value => typeof value === 'string' ? value.replaceAll('opening-families', 'selected-book-position-clusters') : value;
  analysis.method.bootstrapUnit = 'whole selected-book-position cluster';
  analysis.method.groupingCaveat = 'Conditions share one selected book position; separate positions are not proved independent opening families.';
  analysis.validation.unit = 'whole-selected-book-position-cluster';
  analysis.bootstrap.groupUnit = 'whole-selected-book-position-cluster';
  analysis.bootstrap.interpretation = 'Conditional stability across selected book-position clusters; broader opening-family dependence is unknown.';
  analysis.normalized.reason = clusterLabel(analysis.normalized.reason);
  analysis.normalized.reasons = analysis.normalized.reasons.map(clusterLabel);
  analysis.warnings = analysis.warnings.map(clusterLabel);
  analysis.normalized.materialPriceTableSupported = false;
  analysis.normalized.interpretation = 'When available, these are conditional arithmetic coefficient ratios only; this coverage pilot does not establish a material-price table.';
  return analysis;
}

function epdText(states, record, manifest) {
  const variant = record.kind === 'ordinary' ? 'chess' : manifest.plan.profile.variant;
  const metadata = `;variant ${variant};collection_profile ${manifest.plan.profile.variant};result ${record.result};game ${manifest.runId}:${record.id}`
    + `;opening ${record.openingId};kind ${record.kind};profile ${manifest.plan.profile.hash};registry ${manifest.plan.registry.hash}`;
  return states.slice(1).map((state, index) => `${state.fen};bm ${record.moves[index + 1] || 'none'};hmvc ${state.hmvc}${metadata}\n`).join('');
}

function startingCounts(fen, profile) {
  const counts = Object.fromEntries(['white', 'black'].map(color => [color, {
    families: Object.fromEntries([...ORDINARY.slice(0, -1), 'king'].map(name => [name, 0])),
    upgrades: Object.fromEntries(profile.registry.definitions.map(definition => [definition.id, 0])),
  }]));
  const ordinary = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
  for (const piece of fen.split(' ')[0].replace(/[1-8/]/g, '')) {
    const letter = piece.toLowerCase(), color = piece === piece.toUpperCase() ? 'white' : 'black';
    const definition = profile.definitionsByLetter[letter];
    counts[color].families[definition?.family || ordinary[letter]]++;
    if (definition) counts[color].upgrades[definition.id]++;
  }
  return counts;
}

async function makeCollectionReport(manifest, records, { rulesFactory, bootstrap = 200, analyze = true } = {}) {
  if (!Array.isArray(records) || !Number.isSafeInteger(bootstrap) || bootstrap < 0 || bootstrap > 1000 || typeof analyze !== 'boolean') fail('Use collection records, bootstrap 0–1000 and a boolean analysis switch.');
  const { plan, latest } = latestRecords(manifest, records);
  const rules = await (rulesFactory || require('../../dist/balance-rules.cjs').createMatchRules)({ profile: plan.profile });
  const featureNames = [...ORDINARY, ...plan.registry.definitions.map(definition => `bonus:${definition.id}`).sort()];
  if (!isDeepStrictEqual(featureNames, [...ORDINARY, BONUS])) fail('This collection report requires the declared Amazon-only registry.');
  const cache = new Map();
  const material = fen => {
    const fields = fen.split(' '), key = [...fields[0].replace(/[1-8/]/g, '')].sort().join('') + fields[1];
    if (!cache.has(key)) cache.set(key, decodeMaterial(fen, plan.profile));
    return cache.get(key);
  };
  const dataset = { schemaVersion: 1, format: 'levelup-material-collection-dataset', featureNames,
    sampling: plan.protocol.sampling, profile: { hash: plan.profile.hash, registryHash: plan.registry.hash, registry: plan.registry },
    identity: { runId: manifest.runId, manifestIdentity: manifest.identity || null },
    games: [], samples: [], limitations: [
      'This capped book-position pilot is a coverage diagnostic, not a representative or intrinsic material-price measurement.',
      'Starting-position groups keep all three conditions together, but relationships between different book positions may remain unknown.',
      'Material-stable windows do not establish tactical quietness; each retained game has unit total sample weight.',
      'Manifest hashes identify frozen inputs when present; journal replay alone does not attest executable or process identity.',
      'Original external baseline EPDs are separate cohorts and are not pooled with this collection.' ] };
  const histories = new Map(), duplicateGames = [], excluded = { terminal: 0, windowEdge: 0, materialChange: 0 };
  const epd = { ordinary: '', amazon: '' }, statusCounts = Object.fromEntries([...STATUSES].map(status => [status, 0]));
  let replayedPlies = 0, completedRecords = 0, candidates = 0;
  for (const game of plan.schedule) {
    const record = latest.get(game.id);
    if (!record) continue;
    statusCounts[record.status]++;
    if (record.status !== 'completed') continue;
    completedRecords++;
    const board = rules.createBoard(record.startFen), states = [];
    try {
      const snapshot = () => {
        const fen = board.fen(), decoded = material(fen), previous = states.at(-1);
        states.push({ fen, outcome: board.outcome(), ...decoded,
          hmvc: previous && previous.signature === decoded.signature ? previous.hmvc + 1 : 0 });
      };
      snapshot();
      for (let ply = 0; ply < record.moves.length; ply++) {
        if (states.at(-1).outcome !== null || board.san(record.moves[ply]) !== record.sans[ply]
          || board.push(record.moves[ply]) !== true) fail(`Illegal move/SAN or continuation after termination: ${record.id}, ply ${ply + 1}.`);
        replayedPlies++; snapshot();
      }
      if (board.fen() !== record.finalFen || !isDeepStrictEqual(states.at(-1).outcome, { result: record.result, reason: record.reason })) fail(`Final collection FEN/outcome mismatch: ${record.id}.`);
    } finally { board.dispose(); }
    const historyHash = hash(JSON.stringify({ startFen: record.startFen, moves: record.moves, result: record.result, reason: record.reason, finalFen: record.finalFen }));
    if (histories.has(historyHash)) {
      duplicateGames.push({ gameId: record.id, retainedGameId: histories.get(historyHash), historyHash });
      continue;
    }
    histories.set(historyHash, record.id);
    epd[record.kind] += epdText(states, record, manifest);
    const accepted = [];
    const { minPly, stride, stableBefore, stableAfter } = plan.protocol.sampling;
    for (let ply = minPly; ply < states.length; ply += stride) {
      candidates++;
      const state = states[ply];
      if (state.outcome !== null) { excluded.terminal++; continue; }
      if (ply < stableBefore || ply + stableAfter >= states.length) { excluded.windowEdge++; continue; }
      if (states.slice(ply - stableBefore, ply + stableAfter + 1).some(other => other.signature !== state.signature)) { excluded.materialChange++; continue; }
      accepted.push({ x: [...state.x], y: SCORES[record.result], weight: 0, gameId: record.id,
        pairId: record.unitId, groupId: record.openingId, phase: state.phase, ply, fen: state.fen });
    }
    for (const sample of accepted) { sample.weight = 1 / accepted.length; dataset.samples.push(sample); }
    dataset.games.push({ gameId: record.id, pairId: record.unitId, groupId: record.openingId,
      kind: record.kind, aColor: record.aColor, openingId: record.openingId, result: record.result,
      samples: accepted.length, historyHash, startFen: record.startFen,
      startingCounts: startingCounts(record.startFen, plan.profile) });
  }
  const sampled = dataset.games.filter(game => game.samples), bonusIndex = featureNames.indexOf(BONUS);
  const upgradeSamples = dataset.samples.filter(sample => sample.x[bonusIndex] !== 0);
  const amazonUnits = new Map();
  for (const game of plan.schedule.filter(game => game.kind === 'amazon')) {
    const unit = amazonUnits.get(game.unitId) || [];
    unit.push(latest.get(game.id)?.status || 'pending'); amazonUnits.set(game.unitId, unit);
  }
  const partialScoredAmazonUnits = [...amazonUnits.values()].filter(unit => unit.filter(status => status === 'completed').length === 1).length;
  const cohorts = Object.fromEntries(['ordinary', 'amazon'].map(kind => [kind, {
    completedRecords: [...latest.values()].filter(record => record.kind === kind && record.status === 'completed').length,
    uniqueHistories: dataset.games.filter(game => game.kind === kind).length,
    sampledGames: sampled.filter(game => game.kind === kind).length,
    samples: dataset.samples.filter(sample => dataset.games.find(game => game.gameId === sample.gameId).kind === kind).length,
  }]));
  const coverage = { scheduledGames: plan.schedule.length, journalAttempts: records.length, observedGames: latest.size,
    remainingGames: plan.schedule.length - [...latest.values()].filter(record => ['completed', 'truncated'].includes(record.status)).length,
    statusCounts, completedRecords, uniqueHistories: dataset.games.length, duplicateGames,
    sampledGames: sampled.length, gamesWithoutSamples: dataset.games.length - sampled.length,
    samples: dataset.samples.length, replayedPlies, candidates, excluded, cohorts,
    partialScoredAmazonUnits,
    openingGroups: new Set(sampled.map(game => game.groupId)).size,
    upgradeImbalance: { samples: upgradeSamples.length, games: new Set(upgradeSamples.map(sample => sample.gameId)).size,
      openingGroups: new Set(upgradeSamples.map(sample => sample.groupId)).size,
      positiveSamples: upgradeSamples.filter(sample => sample.x[bonusIndex] > 0).length,
      negativeSamples: upgradeSamples.filter(sample => sample.x[bonusIndex] < 0).length },
    phases: Object.fromEntries(['middlegame', 'endgame'].map(phase => [phase, dataset.samples.filter(sample => sample.phase === phase).length])) };
  const ordinary = analyze ? clusterAnalysis(project(dataset, 'ordinary', ORDINARY), { bootstrap, seed: plan.settings.seed ?? 42 }) : null;
  const combined = analyze ? clusterAnalysis(dataset, { bootstrap, seed: plan.settings.seed ?? 42 }) : null;
  const warnings = [...dataset.limitations];
  if (coverage.remainingGames) warnings.push('Collection is incomplete; estimates use only completed recorded outcomes and may be affected by unfinished-game selection.');
  if (statusCounts.truncated) warnings.push('Ply-limited games are unscored and excluded, not drawn games or losses.');
  if (partialScoredAmazonUnits) warnings.push(`${partialScoredAmazonUnits} Amazon units currently contribute a completed outcome from only one color; provisional evidence is not fully color-paired.`);
  if (!coverage.upgradeImbalance.games) warnings.push('No retained Amazon-count imbalance: its bonus is unidentifiable, not zero-valued.');
  if (ordinary && (!ordinary.rank.fullRank || !ordinary.fit.converged || !ordinary.normalized.available)) warnings.push('The ordinary baseline does not yet support the conditional normalized table; do not price the Amazon bonus from this pilot.');
  const metadata = { ...dataset, samples: undefined, sampleCount: dataset.samples.length };
  const report = { schemaVersion: 1, format: 'levelup-material-collection-report', runId: manifest.runId,
    profileHash: plan.profile.hash, registryHash: plan.registry.hash, coverage,
    sampling: plan.protocol.sampling, analysis: analyze ? { ordinary, combined } : {}, warnings,
    materialPriceTableSupported: false,
    interpretation: 'Capped collection diagnostic. Outcome-predictive coefficients are provisional; no playing value, purchase price or extra game budget is assigned.' };
  return { report, dataset: metadata, samples: dataset.samples, epd };
}

function markdown(report) {
  const c = report.coverage, number = value => Number.isFinite(value) ? value.toFixed(4) : 'unavailable';
  const lines = ['# Material collection: coverage and provisional estimates', '', report.interpretation, '',
    `Completed records: ${c.completedRecords}/${c.scheduledGames}; distinct histories: ${c.uniqueHistories}; sampled games: ${c.sampledGames}; positions: ${c.samples}.`,
    `Unscored: ${c.statusCounts.truncated} truncated, ${c.statusCounts.error} errors, ${c.statusCounts.aborted} aborted. Remaining: ${c.remainingGames}.`, '',
    `Amazon imbalance appears in ${c.upgradeImbalance.games} games across ${c.upgradeImbalance.openingGroups} starting-position groups `
      + `(${c.upgradeImbalance.positiveSamples} positive and ${c.upgradeImbalance.negativeSamples} negative sampled positions).`, '',
    '| Fit | Rank | Converged | Held-out Brier | Constant baseline | Conditional normalized diagnostics |', '| --- | --- | --- | ---: | ---: | --- |'];
  for (const [name, fit] of Object.entries(report.analysis)) lines.push(`| ${name} | ${fit.rank.rank}/${fit.rank.columns} | ${fit.fit.converged} | ${number(fit.validation.metrics?.brier)} | ${number(fit.validation.baselineMetrics?.brier)} | ${fit.normalized.available ? 'conditional only' : fit.normalized.reason} |`);
  lines.push('', 'Raw coefficients, conditional resampling ranges and feature support are in the JSON report. A zero coefficient for an unsupported feature is not a zero piece value.', '',
    'Groups are selected book-position clusters containing all three conditions. They are not demonstrated independent opening families; even an available normalized diagnostic is not an adopted material-price table.', '',
    'The ordinary EPD contains ordinary pieces only. The Amazon EPD uses the frozen custom letters and requires its registry mapping; the ordinary-only Python EPD helper cannot decode it. '
      + 'EPDs contain post-move states from completed distinct histories, including terminal states; Node fits use only the separately defined sparse nonterminal sample windows.', '');
  for (const warning of report.warnings) lines.push(`- ${warning}`);
  lines.push('', 'Stop at the declared pilot cap and review coverage before any further collection. No stage starts automatically.', '');
  return lines.join('\n');
}

async function writeCollectionSnapshot(root, options) {
  const manifestBytes = fs.readFileSync(path.join(root, 'collection.json'));
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const runFile = path.join(root, 'run.json');
  if (fs.existsSync(runFile) && !isDeepStrictEqual(JSON.parse(fs.readFileSync(runFile, 'utf8')), manifest)) fail('Collection and storage manifest snapshots differ.');
  const profile = manifest.plan?.profile;
  if (profile) {
    const rulesFile = path.join(root, 'rules', `${profile.variant}.ini`);
    if (fs.existsSync(rulesFile) && !fs.readFileSync(rulesFile).equals(Buffer.from(profile.config))) fail('The frozen collection rules file changed.');
  }
  let journal = Buffer.alloc(0);
  try { journal = fs.readFileSync(path.join(root, 'games.jsonl')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const input = journal.toString('utf8'), end = input.lastIndexOf('\n') + 1;
  const records = input.slice(0, end).split('\n').filter(Boolean).map(line => JSON.parse(line));
  const result = await makeCollectionReport(manifest, records, options);
  result.report.inputs = { manifestSha256: hash(manifestBytes), journalSha256: hash(journal),
    ignoredTornTailBytes: Buffer.byteLength(input.slice(end)), completeJournalLines: records.length };
  const sampleBytes = result.samples.map(sample => JSON.stringify(sample)).join('\n') + (result.samples.length ? '\n' : '');
  result.report.artifacts = { datasetSha256: hash(json(result.dataset)), samplesSha256: hash(sampleBytes),
    ordinaryEpdSha256: hash(result.epd.ordinary), amazonEpdSha256: hash(result.epd.amazon) };
  const outputs = { 'material-dataset.json': json(result.dataset), 'material-samples.jsonl': sampleBytes,
    'ordinary.epd': result.epd.ordinary, 'amazon.epd': result.epd.amazon,
    'material-collection-report.json': json(result.report), 'material-collection-report.md': markdown(result.report) };
  // Validate the entire report before replacing only derived artifacts.
  for (const [name, content] of Object.entries(outputs)) atomicWrite(root, name, content);
  const files = Object.fromEntries(Object.keys(outputs).map(name => [name, path.join(root, name)]));
  return { report: result.report, files: { ...files,
    markdown: files['material-collection-report.md'], json: files['material-collection-report.json'],
    dataset: files['material-dataset.json'], samples: files['material-samples.jsonl'] } };
}

async function writeCollectionReport(directory, options = {}) {
  const root = path.resolve(directory), lockFile = path.join(root, 'report.lock');
  let descriptor;
  try { descriptor = fs.openSync(lockFile, 'wx'); }
  catch (error) {
    if (error.code === 'EEXIST') fail(`Another material report writer holds ${lockFile}. Retry after it finishes; remove this lock only if its recorded process has stopped.`);
    throw error;
  }
  const owner = { pid: process.pid, token: randomUUID(), startedAt: new Date().toISOString() };
  const lockIdentity = fs.fstatSync(descriptor);
  try {
    fs.writeFileSync(descriptor, json(owner)); fs.fsyncSync(descriptor);
    return await writeCollectionSnapshot(root, options);
  } finally {
    fs.closeSync(descriptor);
    // Release only this writer's file, independent of the active collector's run.lock.
    let current;
    try { current = fs.statSync(lockFile); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (current && current.dev === lockIdentity.dev && current.ino === lockIdentity.ino) unlinkWithRetrySync(lockFile);
  }
}

module.exports = { makeCollectionReport, writeCollectionReport, markdown };
