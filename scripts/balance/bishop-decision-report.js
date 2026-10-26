'use strict';

// Outcome-only analysis of the bounded bishop decision campaign. This module
// does not load a rules engine, replay moves, sample positions or fit material.
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { acquireLock } = require('./storage');
const { renameWithRetrySync, unlinkWithRetrySync } = require('./files');

const CANDIDATES = [
  { id: 'bishop.purple@7', label: 'Short side bishop', movement: 'BsWsN' },
  { id: 'bishop.purple@12', label: 'Long quiet hop bishop', movement: 'BsRgmsR0' },
  { id: 'bishop.purple@13', label: 'Blocked wide-knight bishop', movement: 'BsR2nsN' },
];
const REFERENCES = [
  { id: 'rook.purple@10', label: 'RfB' },
  { id: 'knight.purple@3', label: 'NC' },
  { id: 'queen.purple@1', label: 'Amazon' },
];
const SCORES = { '1-0': 1, '1/2-1/2': 0.5, '0-1': 0 };
const STATUSES = ['completed', 'truncated', 'error', 'aborted'];
const FINAL = new Set(['completed', 'truncated']);
const GAME_FIELDS = ['unitId', 'pairId', 'kind', 'aColor', 'openingId', 'comparisonId',
  'startFen', 'designA', 'designB', 'whiteDesign', 'blackDesign'];
const JSON_NAME = 'decision-report.json', MD_NAME = 'decision-report.md';
const sha = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const fail = message => { throw new Error(message); };

function checkAbort(signal) {
  if (signal?.aborted) {
    const error = new Error('Bishop decision report cancelled.');
    error.name = 'AbortError'; error.code = 'ABORT_ERR'; throw error;
  }
}

function openingIds(plan) {
  const openings = plan.openings ?? plan.stages.find(stage => Array.isArray(stage.plan?.openings))?.plan.openings;
  const ids = openings?.map(opening => typeof opening === 'string' ? opening : opening.id);
  if (!ids || ids.length !== 128 || ids.some(id => typeof id !== 'string' || !id)
    || new Set(ids).size !== 128) fail('Decision reports require the exact ordered 128 opening groups.');
  for (const stage of plan.stages) if (stage.plan.openings
    && !isDeepStrictEqual(stage.plan.openings.map(opening => typeof opening === 'string' ? opening : opening.id), ids)) {
    fail('Decision stages must retain the same ordered opening groups.');
  }
  return ids;
}

function validatePlanShape(plan) {
  if (!plan || typeof plan.id !== 'string' || !Array.isArray(plan.stages)
    || !isDeepStrictEqual(plan.stages.map(stage => stage.key), ['restore', 'compare'])) {
    fail('A two-stage bishop decision plan is required.');
  }
  const ids = new Set();
  for (const stage of plan.stages) {
    const item = stage.plan;
    if (!item || !Array.isArray(item.schedule) || !item.profile?.hash || !item.registry?.hash
      || !isDeepStrictEqual(item.profile.registry, item.registry) || !item.settings
      || !Array.isArray(item.study?.checkpoints)) fail(`Incomplete decision ${stage.key} plan.`);
    for (const game of item.schedule) {
      if (!game || typeof game.id !== 'string' || ids.has(game.id) || game.kind !== 'head') {
        fail('Decision stages require distinct scheduled head-to-head identities.');
      }
      ids.add(game.id);
    }
  }
  if (plan.stages[0].plan.schedule.length > 192 || plan.stages[1].plan.schedule.length !== 1280) {
    fail('Decision stages must retain the bounded 0–192 restoration and 1280 comparison games.');
  }
  return openingIds(plan);
}

function validateCounts(record, context) {
  if (!record || typeof record.id !== 'string' || !record.id || !STATUSES.includes(record.status)
    || !Number.isSafeInteger(record.attempt) || record.attempt < 1 || record.schemaVersion !== 1) {
    fail(`Malformed ${context} journal record.`);
  }
  if (!Array.isArray(record.moves) || !Array.isArray(record.sans)
    || record.moves.some(move => typeof move !== 'string' || !move)
    || record.sans.some(san => typeof san !== 'string' || !san)
    || record.moves.length !== record.sans.length || record.totalPlies !== record.moves.length
    || record.playedPlies !== record.moves.length || record.openingPlies !== 0
    || !isDeepStrictEqual(record.openingMoves, []) || typeof record.startFen !== 'string'
    || typeof record.finalFen !== 'string' || !record.finalFen
    || typeof record.reason !== 'string' || !record.reason) fail(`Inconsistent ${context} move/SAN counts or outcome: ${record.id}.`);
  if (record.status === 'completed' ? !Object.hasOwn(SCORES, record.result) : record.result !== '*') {
    fail(`Unscored ${context} attempts cannot be chess results: ${record.id}.`);
  }
}

function appendLatest(latest, record, context) {
  const previous = latest.get(record.id);
  if (previous) {
    if (isDeepStrictEqual(previous, record)) return;
    if (FINAL.has(previous.status) || record.attempt <= previous.attempt
      || previous.moves.some((move, index) => record.moves[index] !== move)
      || previous.sans.some((san, index) => record.sans[index] !== san)) {
      fail(`Conflicting ${context} attempts or completed history: ${record.id}.`);
    }
  }
  latest.set(record.id, record);
}

function stageLatest(stage, records) {
  if (!Array.isArray(records)) fail(`Decision ${stage.key} records must be an array.`);
  const plan = stage.plan, scheduled = new Map(plan.schedule.map(game => [game.id, game])), latest = new Map();
  const engine = Object.fromEntries(['nodes', 'threads', 'hashMb', 'maxPlies'].map(key => [key, plan.settings[key]]));
  for (const record of records) {
    validateCounts(record, stage.key);
    const game = scheduled.get(record.id);
    if (!game) fail(`Foreign ${stage.key} journal record: ${record.id}.`);
    for (const field of GAME_FIELDS) if (record[field] !== game[field]) {
      fail(`Decision ${stage.key} record ${record.id} differs from planned ${field}.`);
    }
    if (record.profileHash !== plan.profile.hash || record.registryHash !== plan.registry.hash
      || record.variant !== plan.profile.variant || record.registryReference !== 'collection.json#plan.registry'
      || record.royalMode !== 'king' || record.evaluationCaveat !== null
      || !isDeepStrictEqual(record.evaluation, plan.profile.evaluation)
      || !isDeepStrictEqual(record.engine, engine)
      || !isDeepStrictEqual(record.whiteStrength, { skill: plan.settings.skill })
      || !isDeepStrictEqual(record.blackStrength, { skill: plan.settings.skill })
      || record.totalPlies > plan.settings.maxPlies) {
      fail(`Decision ${stage.key} identity or search policy mismatch: ${record.id}.`);
    }
    if (record.status === 'truncated' && (record.totalPlies !== plan.settings.maxPlies || record.reason !== 'max-plies')) {
      fail(`Decision ${stage.key} truncation must end at the declared ply cap: ${record.id}.`);
    }
    appendLatest(latest, record, stage.key);
  }
  return latest;
}

function historicalLatest(records, name) {
  if (!Array.isArray(records)) fail(`Decision ${name} evidence records are required.`);
  const latest = new Map();
  for (const record of records) {
    validateCounts(record, name);
    if (typeof record.profileHash !== 'string' || typeof record.registryHash !== 'string'
      || !record.engine || !record.whiteStrength || !record.blackStrength) fail(`Missing ${name} source policy: ${record.id}.`);
    const expected = name === 'inherited bishop'
      ? ['bishop.purple@7', 'bishop.purple@12'].includes(record.designA) && record.designB === 'rook.purple@10'
      : record.designA === 'bishop.purple@7' && ['knight.purple@3', 'queen.purple@1'].includes(record.designB);
    if (!FINAL.has(record.status) || record.kind !== 'head' || !expected) fail(`Unexpected ${name} source matchup or status: ${record.id}.`);
    appendLatest(latest, record, name);
  }
  return latest;
}

function checkpointSelection(plan, stageRecords, checkpoint) {
  if (checkpoint === undefined) return stageRecords;
  if (!checkpoint || typeof checkpoint !== 'object') fail('A decision checkpoint requires stage and count.');
  const index = plan.stages.findIndex(stage => stage.key === checkpoint.stage);
  const stage = plan.stages[index], count = checkpoint.count;
  if (!stage || !Number.isSafeInteger(count) || count < 0 || count > stage.plan.schedule.length
    || !(stage.plan.study.checkpoints.includes(count) || count === stage.plan.schedule.length)) {
    fail('Use a declared decision stage checkpoint.');
  }
  const selected = {};
  for (const [position, current] of plan.stages.entries()) {
    // Validate later records too, but a frozen report only sees its prefix.
    const records = stageRecords[current.key] ?? [], latest = stageLatest(current, records);
    const schedule = position < index ? current.plan.schedule
      : position === index ? current.plan.schedule.slice(0, count) : [];
    if (schedule.some(game => !FINAL.has(latest.get(game.id)?.status))) {
      fail('Cannot freeze a decision checkpoint before every scheduled prefix game is finalized.');
    }
    const ids = new Set(schedule.map(game => game.id));
    selected[current.key] = records.filter(record => ids.has(record.id));
  }
  return selected;
}

function randomSource(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 0x100000000;
  };
}

function percentileInterval(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return { lower: sorted[Math.floor((sorted.length - 1) * 0.025)],
    upper: sorted[Math.ceil((sorted.length - 1) * 0.975)] };
}

function addIntervals(rows, groups, bootstrap, signal) {
  const random = randomSource(42), distributions = rows.map(() => []);
  for (let replicate = 0; replicate < bootstrap; replicate++) {
    checkAbort(signal);
    const multiplicities = new Map();
    for (let index = 0; index < groups.length; index++) {
      const id = groups[Math.floor(random() * groups.length)];
      multiplicities.set(id, (multiplicities.get(id) || 0) + 1);
    }
    rows.forEach((row, index) => {
      let points = 0, weight = 0;
      for (const opening of row.openingScores) {
        const count = multiplicities.get(opening.openingId) || 0;
        points += count * opening.score; weight += count;
      }
      if (weight) distributions[index].push(points / weight);
    });
  }
  rows.forEach((row, index) => {
    const values = distributions[index], available = bootstrap > 0 && row.pairs >= 4
      && values.length >= Math.max(20, Math.ceil(bootstrap * 0.9));
    row.interval = available ? percentileInterval(values) : null;
    row.bootstrap = { requested: bootstrap, valid: values.length, available,
      reason: available ? null : !bootstrap ? 'disabled' : row.pairs < 4 ? 'requires-at-least-four-scored-opening-pairs' : 'insufficient-valid-resamples' };
  });
}

function sourceContext(name, records, declared) {
  const policies = new Map();
  for (const record of records) {
    const policy = { profileHash: record.profileHash, registryHash: record.registryHash, variant: record.variant,
      engine: record.engine, whiteStrength: record.whiteStrength, blackStrength: record.blackStrength,
      evaluation: record.evaluation ?? null };
    policies.set(sha(json(policy)), policy);
  }
  return { name, ...declared, observedRecords: records.length, policies: [...policies.values()] };
}

function makeDecisionReport({ plan, stageRecords = {}, bootstrap = 200, signal, checkpoint } = {}) {
  checkAbort(signal);
  const groups = validatePlanShape(plan), groupSet = new Set(groups);
  if (!stageRecords || typeof stageRecords !== 'object' || Array.isArray(stageRecords)
    || Object.keys(stageRecords).some(key => !['restore', 'compare'].includes(key))) fail('Use restore and compare stage record arrays.');
  if (!Number.isSafeInteger(bootstrap) || bootstrap < 0 || bootstrap > 1000) fail('Use bootstrap 0–1000.');
  if (checkpoint !== undefined && bootstrap !== 200) fail('Frozen decision checkpoints retain bootstrap 200.');
  const selected = checkpointSelection(plan, stageRecords, checkpoint);
  const inherited = historicalLatest(plan.inheritedBishopRecords, 'inherited bishop');
  const restored = historicalLatest(plan.restoredRecords, 'restored revision');
  const latestByStage = Object.fromEntries(plan.stages.map(stage => [stage.key, stageLatest(stage, selected[stage.key] ?? [])]));
  const latest = new Map(), contexts = new Map();
  const append = (records, context) => {
    for (const record of records.values()) {
      const previous = latest.get(record.id);
      if (previous && !isDeepStrictEqual(previous, record)) fail(`Conflicting completed history across decision sources: ${record.id}.`);
      if (!previous) { latest.set(record.id, record); contexts.set(record.id, context); }
    }
  };
  append(inherited, 'inherited-bishop'); append(restored, 'restored-revision');
  for (const stage of plan.stages) append(latestByStage[stage.key], stage.key);
  const rows = CANDIDATES.flatMap(candidate => REFERENCES.map(reference => ({
    designA: candidate.id, designB: reference.id, label: candidate.label, reference: reference.label,
    movement: candidate.movement, expectedGames: 256, expectedPairs: 128, games: 0, pairs: 0,
    wins: 0, draws: 0, losses: 0, score: null, unpairedGames: 0, completedGames: 0,
    missingPairs: 128, missingOpeningIds: [], statusCounts: Object.fromEntries(STATUSES.map(status => [status, 0])),
    openingScores: [], sourceContexts: [],
  })));
  const rowMap = new Map(rows.map(row => [`${row.designA}|${row.designB}`, row]));
  const pairMaps = new Map(rows.map(row => [row, new Map()]));
  let excludedHistoricalGames = 0;
  for (const record of latest.values()) {
    const row = rowMap.get(`${record.designA}|${record.designB}`);
    if (!row || record.kind !== 'head') fail(`Unexpected decision matchup: ${record.id}.`);
    if (!groupSet.has(record.openingId) || !['w', 'b'].includes(record.aColor)
      || record.whiteDesign !== (record.aColor === 'w' ? row.designA : row.designB)
      || record.blackDesign !== (record.aColor === 'b' ? row.designA : row.designB)) {
      fail(`Decision record has inconsistent opening or color identities: ${record.id}.`);
    }
    const pairs = pairMaps.get(row), pair = pairs.get(record.openingId) || {};
    if (pair[record.aColor]) fail(`Duplicate decision opening/color history: ${record.openingId}, ${row.designA}, ${row.designB}.`);
    pair[record.aColor] = record; pairs.set(record.openingId, pair);
    row.statusCounts[record.status]++;
    if (record.status === 'completed') row.completedGames++;
    const context = contexts.get(record.id);
    if (!row.sourceContexts.includes(context)) row.sourceContexts.push(context);
  }
  for (const row of rows) {
    const pairs = pairMaps.get(row);
    for (const openingId of groups) {
      const pair = pairs.get(openingId);
      if (pair?.w?.status !== 'completed' || pair?.b?.status !== 'completed') {
        row.missingOpeningIds.push(openingId); continue;
      }
      if (pair.w.unitId !== pair.b.unitId || pair.w.pairId !== pair.b.pairId
        || pair.w.comparisonId !== pair.b.comparisonId) fail(`Inconsistent decision color pair: ${openingId}.`);
      let points = 0;
      for (const color of ['w', 'b']) {
        const value = color === 'w' ? SCORES[pair[color].result] : 1 - SCORES[pair[color].result];
        row[value === 1 ? 'wins' : value === 0.5 ? 'draws' : 'losses']++;
        points += value;
      }
      row.openingScores.push({ openingId, score: points / 2 }); row.pairs++;
    }
    row.games = 2 * row.pairs;
    row.unpairedGames = row.completedGames - row.games;
    row.missingPairs = 128 - row.pairs;
    row.score = row.games ? (row.wins + row.draws / 2) / row.games : null;
    row.complete = row.pairs === 128;
    row.status = row.complete ? 'complete' : row.games ? 'provisional' : 'unobserved';
  }
  addIntervals(rows, groups, bootstrap, signal);
  const stages = plan.stages.map(stage => {
    const records = [...latestByStage[stage.key].values()];
    const statusCounts = Object.fromEntries(STATUSES.map(status => [status, records.filter(record => record.status === status).length]));
    const finalizedGames = statusCounts.completed + statusCounts.truncated;
    return { key: stage.key, plannedGames: stage.plan.schedule.length, attempts: (selected[stage.key] ?? []).length,
      observedGames: records.length, finalizedGames, remainingGames: stage.plan.schedule.length - finalizedGames,
      complete: finalizedGames === stage.plan.schedule.length, statusCounts };
  });
  const complete = rows.every(row => row.complete), finished = stages.every(stage => stage.complete);
  const report = {
    schemaVersion: 1, format: 'levelup-bishop-decision-report', studyId: plan.id, runId: plan.runId ?? null,
    status: complete ? 'complete' : finished ? 'finished-unscored' : 'provisional', complete, finished,
    checkpoint: checkpoint ?? null, candidates: CANDIDATES, references: REFERENCES, matchups: rows,
    coverage: { expectedMatchups: 9, completeMatchups: rows.filter(row => row.complete).length,
      expectedPairs: 1152, scoredPairs: rows.reduce((sum, row) => sum + row.pairs, 0),
      pairedGames: rows.reduce((sum, row) => sum + row.games, 0),
      unpairedGames: rows.reduce((sum, row) => sum + row.unpairedGames, 0),
      missingPairs: rows.reduce((sum, row) => sum + row.missingPairs, 0),
      inheritedBishopGames: inherited.size, restoredRevisionGames: restored.size,
      excludedHistoricalGames, uniqueGameIds: latest.size, stages },
    method: { score: 'Candidate points per completed color-swapped pair; draws count as one half.',
      bootstrap, seed: 42, confidence: 0.95, interval: 'percentile', groupUnit: 'whole original selected-opening block',
      groupCount: 128, openingIds: groups,
      interpretation: 'All matchups share each resampled opening multiplicity. Ranges condition on the fixed 128 selected positions and recorded source policies; broader opening ancestry and policy comparability are not established.' },
    sources: [sourceContext('inherited-bishop', [...inherited.values()], plan.sources?.bishop),
      sourceContext('restored-revision', [...restored.values()], plan.sources?.revision),
      ...plan.stages.map(stage => ({ name: stage.key, profileHash: stage.plan.profile.hash,
        registryHash: stage.plan.registry.hash, profile: stage.plan.profile, registry: stage.plan.registry,
        settings: stage.plan.settings, observedRecords: latestByStage[stage.key].size }))],
    evidence: plan.sourceEvidence ?? [], sourceProvenance: plan.sources ?? null, provenance: plan.provenance ?? null,
    interpretation: 'Bounded head-to-head bishop decision evidence. Unobserved scores remain unavailable; truncated games are unscored, and completed games without a scored color partner are excluded from points scores. Historical source contexts remain separate provenance. This report does not estimate material prices or change the fixed RfB, NC or Amazon references.',
  };
  checkAbort(signal);
  return report;
}

function markdown(report) {
  const percent = value => Number.isFinite(value) ? `${(100 * value).toFixed(2)}%` : 'unavailable';
  const band = interval => interval ? `${percent(interval.lower)}–${percent(interval.upper)}` : 'unavailable';
  const lines = ['# Bishop decision report', '', report.interpretation, '',
    `Status: ${report.status}. Complete matchups: ${report.coverage.completeMatchups}/9; scored color pairs: ${report.coverage.scoredPairs}/1152; missing pairs: ${report.coverage.missingPairs}.`,
    `Completed unpaired games excluded from scores: ${report.coverage.unpairedGames}.`, '',
    '| Bishop | Reference | Paired games | W / D / L | Points score | Conditional 95% range | Missing pairs | Unpaired completed games |',
    '| --- | --- | ---: | --- | ---: | --- | ---: | ---: |'];
  for (const row of report.matchups) lines.push(`| ${row.label} (${row.movement}) | ${row.reference} | ${row.games}/256 | ${row.wins} / ${row.draws} / ${row.losses} | ${percent(row.score)} | ${band(row.interval)} | ${row.missingPairs} | ${row.unpairedGames} |`);
  lines.push('', `Intervals use ${report.method.bootstrap} deterministic whole-opening percentile resamples, seed 42, over the fixed 128 original groups. Every comparison uses the same sampled opening multiplicities. ${report.method.interpretation}`, '',
    '| Stage | Finalized games | Completed | Truncated | Errors | Aborted | Remaining |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const stage of report.coverage.stages) lines.push(`| ${stage.key} | ${stage.finalizedGames}/${stage.plannedGames} | ${stage.statusCounts.completed} | ${stage.statusCounts.truncated} | ${stage.statusCounts.error} | ${stage.statusCounts.aborted} | ${stage.remainingGames} |`);
  lines.push('', `Historical evidence retained: ${report.coverage.inheritedBishopGames} bishop records and ${report.coverage.restoredRevisionGames} revision records; ${report.coverage.excludedHistoricalGames} other historical conditions do not enter these nine matchups.`, '',
    'Historical journals do not themselves supply original collection manifests or verify historical native inventories. Source hashes, policies and historical identity limitations remain in JSON. New stage manifest identities and native diagnostics are retained separately when supplied.', '',
    'No engine searches, EPD collection, per-ply independence assumptions or material refit enter this report. Reference designs remain fixed; these observed scores support a design decision and do not select a winner automatically.', '');
  return lines.join('\n');
}

function atomicWrite(directory, name, content) {
  const temporary = path.join(directory, `.${name}.${randomUUID()}.tmp`);
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx'); fs.writeFileSync(fd, content); fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined; renameWithRetrySync(temporary, path.join(directory, name));
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    unlinkWithRetrySync(temporary);
  }
}

function readJournal(file) {
  let bytes;
  try { bytes = fs.readFileSync(file); }
  catch (error) { if (error.code !== 'ENOENT') throw error; bytes = Buffer.alloc(0); }
  const text = bytes.toString('utf8'), complete = text.slice(0, text.lastIndexOf('\n') + 1);
  const lines = complete.split('\n').filter(Boolean);
  return { records: lines.map(JSON.parse), lines, complete };
}

function validateEvidence(root, plan) {
  if (!Array.isArray(plan.sourceEvidence)) fail('Decision source evidence declarations are required.');
  const names = new Set();
  for (const item of plan.sourceEvidence) {
    if (!item || typeof item.name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(item.name)
      || item.name.endsWith('.') || names.has(item.name.toLowerCase())
      || typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256)) fail('Malformed decision source evidence declaration.');
    names.add(item.name.toLowerCase());
    const file = path.join(root, 'evidence', item.name);
    if (!fs.existsSync(file) || sha(fs.readFileSync(file)) !== item.sha256) fail(`Frozen decision source evidence checksum differs: ${item.name}.`);
  }
}

function stageManifest(root, stage, records, campaign) {
  const directory = path.join(root, stage.key), runFile = path.join(directory, 'run.json');
  if (!fs.existsSync(runFile)) {
    if (records.length) fail(`Missing ${stage.key} collection manifest for new journal records.`);
    return null;
  }
  const bytes = fs.readFileSync(runFile), manifest = JSON.parse(bytes);
  const collectionFile = path.join(directory, 'collection.json');
  if (fs.existsSync(collectionFile) && !isDeepStrictEqual(manifest, JSON.parse(fs.readFileSync(collectionFile)))) {
    fail(`Decision ${stage.key} collection and run manifests differ.`);
  }
  if (manifest.schemaVersion !== 1 || manifest.format !== 'levelup-head-collection'
    || typeof manifest.runId !== 'string' || !manifest.runId || manifest.jobs !== 4
    || !isDeepStrictEqual(manifest.plan, stage.plan) || !manifest.identity
    || typeof manifest.identity !== 'object' || Array.isArray(manifest.identity)
    || !manifest.native || typeof manifest.native !== 'object' || Array.isArray(manifest.native)
    || !isDeepStrictEqual(manifest.identity, campaign.identity)
    || !isDeepStrictEqual(manifest.native, campaign.native[stage.key])) {
    fail(`Decision ${stage.key} collection identity, plan or native preflight differs.`);
  }
  return { stage: stage.key, runId: manifest.runId, manifestSha256: sha(bytes),
    identity: manifest.identity, native: manifest.native,
    engineSha256: manifest.engineSha256 ?? null, configHash: manifest.configHash ?? null,
    rulesHash: manifest.rulesHash ?? null };
}

async function writeDecisionReport(directory, options = {}) {
  const root = path.resolve(directory), campaignBytes = fs.readFileSync(path.join(root, 'campaign.json'));
  const campaign = JSON.parse(campaignBytes);
  if (campaign.schemaVersion !== 1 || campaign.format !== 'levelup-bishop-decision-campaign'
    || typeof campaign.runId !== 'string' || !campaign.runId
    || !campaign.identity || typeof campaign.identity !== 'object' || Array.isArray(campaign.identity)
    || !campaign.native || typeof campaign.native !== 'object' || Array.isArray(campaign.native)) {
    fail('An intact bishop decision campaign manifest with identity and native context is required.');
  }
  const unlock = acquireLock(root, campaign.runId, 'decision-report.lock');
  try {
    checkAbort(options.signal);
    const plan = campaign.plan;
    (options.validatePlan || require('./bishop-decision-plan').validateDecisionPlan)(plan);
    const nativeKeys = plan.stages.filter(stage => stage.plan.schedule.length).map(stage => stage.key).sort();
    if (!isDeepStrictEqual(Object.keys(campaign.native).sort(), nativeKeys)
      || nativeKeys.some(key => !campaign.native[key] || typeof campaign.native[key] !== 'object'
        || Array.isArray(campaign.native[key]))) fail('Decision campaign native context differs from its stages.');
    validateEvidence(root, plan);
    const journals = Object.fromEntries(plan.stages.map(stage => [stage.key,
      readJournal(path.join(root, stage.key, 'games.jsonl'))]));
    const stageRecords = Object.fromEntries(Object.entries(journals).map(([key, value]) => [key, value.records]));
    const manifests = plan.stages.map(stage => stageManifest(root, stage, stageRecords[stage.key], campaign));
    const selected = checkpointSelection(plan, stageRecords, options.checkpoint);
    const report = makeDecisionReport({ plan, stageRecords, bootstrap: options.bootstrap,
      signal: options.signal, checkpoint: options.checkpoint });
    report.runId = campaign.runId;
    report.campaignIdentity = campaign.identity;
    report.collectionContexts = manifests.filter((manifest, index) => manifest
      && (!options.checkpoint || index <= plan.stages.findIndex(stage => stage.key === options.checkpoint.stage)));
    report.inputs = { campaignSha256: sha(campaignBytes), stages: Object.fromEntries(plan.stages.map(stage => {
      const ids = new Set(selected[stage.key].map(record => record.id)), journal = journals[stage.key];
      const lines = journal.lines.filter((line, index) => ids.has(journal.records[index].id));
      return [stage.key, { journalSha256: sha(lines.join('\n') + (lines.length ? '\n' : '')) }];
    })) };
    const content = json(report), text = markdown(report);
    checkAbort(options.signal);
    let checkpointFiles = null;
    if (options.checkpoint) {
      const checkpointRoot = path.join(root, 'reports', `${options.checkpoint.stage}-${options.checkpoint.count}`);
      const frozen = [[JSON_NAME, content], [MD_NAME, text]];
      for (const [name, value] of frozen) {
        const file = path.join(checkpointRoot, name);
        if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') !== value) fail('Frozen decision checkpoint artifact differs.');
      }
      fs.mkdirSync(checkpointRoot, { recursive: true });
      for (const [name, value] of frozen) if (!fs.existsSync(path.join(checkpointRoot, name))) atomicWrite(checkpointRoot, name, value);
      checkpointFiles = { json: path.join(checkpointRoot, JSON_NAME), markdown: path.join(checkpointRoot, MD_NAME) };
    }
    atomicWrite(root, JSON_NAME, content); atomicWrite(root, MD_NAME, text);
    return { report, files: { json: path.join(root, JSON_NAME), markdown: path.join(root, MD_NAME) }, checkpointFiles };
  } finally { unlock(); }
}

module.exports = { makeDecisionReport, writeDecisionReport, markdown };
