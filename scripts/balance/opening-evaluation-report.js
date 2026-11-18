'use strict';

// Read the first ordinary search already stored with each game. This module
// never starts an engine, replays a position, filters openings or scores games.
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { validateOpeningEvaluation } = require('./opening-evaluation');

const FORMAT = 'levelup-opening-evaluation-report';
const CATEGORIES = ['exactCp', 'boundedCp', 'mate', 'unavailable', 'missing', 'invalid'];
const copy = value => JSON.parse(JSON.stringify(value));
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const key = value => JSON.stringify(stable(value));
const hash = value => createHash('sha256').update(key(value)).digest('hex');
const count = rows => ({ latestGames: rows.length,
  recorded: rows.filter(row => row.category !== 'missing').length,
  ...Object.fromEntries(CATEGORIES.map(category => [category, rows.filter(row => row.category === category).length])) });
function statistics(values) {
  if (!values.length) return { samples: 0, mean: null, median: null, min: null, max: null };
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return { samples: sorted.length, mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    min: sorted[0], max: sorted.at(-1) };
}
function latestAttempts(records) {
  if (!Array.isArray(records)) throw new Error('Opening diagnostics require an array of game records.');
  const attempts = new Map(), latest = new Map(); let duplicates = 0;
  for (const record of records) {
    if (!record || typeof record.id !== 'string' || !record.id || !Number.isSafeInteger(record.attempt) || record.attempt < 1
      || !['w', 'b'].includes(record.aColor) || ['pairId', 'comparisonId', 'openingId'].some(field => typeof record[field] !== 'string' || !record[field])) {
      throw new Error('Opening diagnostics require a valid recorded game/attempt identity.');
    }
    const attempt = key([record.id, record.attempt]), previous = attempts.get(attempt);
    if (previous) {
      if (!isDeepStrictEqual(previous, record)) throw new Error('Conflicting duplicate opening-evaluation attempt.');
      duplicates++; continue;
    }
    attempts.set(attempt, record);
    if (!latest.has(record.id) || latest.get(record.id).attempt < record.attempt) latest.set(record.id, record);
  }
  return { records: [...latest.values()], duplicateCopiesIgnored: duplicates, uniqueAttempts: attempts.size };
}
function limitsFor(record, value) {
  if (record.engine?.movetimeMs !== undefined) return { movetimeMs: record.engine.movetimeMs };
  if (record.engine?.nodes !== undefined) return { nodes: record.engine.nodes };
  return value.limits;
}
function observe(record, { engineSha256 } = {}) {
  const base = { id: record.id, pairId: record.pairId, comparisonId: record.comparisonId,
    comparisonLabel: record.comparisonLabel || record.comparisonId, openingId: record.openingId,
    repetition: record.repetition ?? 1, aColor: record.aColor, attempt: record.attempt, status: record.status,
    openingMoves: record.openingMoves || null, contextId: null, context: null };
  const value = record.openingEvaluation;
  if (value === undefined) return { ...base, category: 'missing' };
  try {
    if (!value || typeof value.fen !== 'string') throw new Error('Missing recorded opening position.');
    const color = value.fen.trim().split(/\s+/)[1];
    const openingPlies = Array.isArray(record.openingMoves) ? record.openingMoves.length : record.openingPlies ?? value.openingPlies;
    if (record.openingPlies !== undefined && record.openingPlies !== openingPlies) throw new Error('Recorded opening lengths disagree.');
    const strength = (color === 'w' ? record.whiteStrength : record.blackStrength) || value.strength;
    const limits = limitsFor(record, value);
    if (!limits || Object.keys(limits).length !== 1 || !['nodes', 'movetimeMs'].includes(Object.keys(limits)[0])
      || !Number.isSafeInteger(Object.values(limits)[0]) || Object.values(limits)[0] < 1) throw new Error('Invalid recorded search limits.');
    if (!strength || typeof strength !== 'object' || Array.isArray(strength) || Object.keys(strength).length !== 1
      || !(Number.isSafeInteger(strength.skill) && strength.skill >= 0 && strength.skill <= 20
        || Number.isSafeInteger(strength.elo) && strength.elo >= 1)) throw new Error('Invalid evaluator strength.');
    const checked = validateOpeningEvaluation(value, { fen: value.fen, color, openingPlies, attempt: record.attempt,
      engineSha256: engineSha256 || value.engineSha256, strength, limits });
    const context = { engineSha256: checked.engineSha256, limits: checked.limits, strength: checked.strength,
      evaluatingColor: checked.color, variant: record.variant || null, profileHash: record.profileHash || null,
      registryHash: record.registryHash || null, evaluation: record.evaluation || null };
    const result = { ...base, context, contextId: hash(context), capturedOnAttempt: checked.capturedOnAttempt,
      category: !checked.available ? 'unavailable' : checked.score.type === 'mate' ? 'mate' : checked.score.bound ? 'boundedCp' : 'exactCp' };
    if (checked.available) result.score = checked.score;
    else result.reason = checked.reason;
    return result;
  } catch (error) { return { ...base, category: 'invalid', reason: error.message }; }
}
function pairObservations(rows) {
  const groups = new Map();
  for (const row of rows) {
    const group = groups.get(row.pairId) || [];
    if (group.some(previous => previous.comparisonId !== row.comparisonId || previous.openingId !== row.openingId
      || previous.repetition !== row.repetition || !isDeepStrictEqual(previous.openingMoves, row.openingMoves))) {
      throw new Error('Opening-evaluation pair identities or prefixes disagree.');
    }
    if (group.some(previous => previous.aColor === row.aColor)) throw new Error('Opening-evaluation pair repeats a physical color.');
    group.push(row); groups.set(row.pairId, group);
  }
  const exact = []; let completeColorPairs = 0, incompatibleContextPairs = 0;
  for (const group of groups.values()) {
    if (group.length !== 2) continue;
    completeColorPairs++;
    if (!group.every(row => row.category === 'exactCp')) continue;
    if (group[0].contextId !== group[1].contextId) { incompatibleContextPairs++; continue; }
    exact.push({ pairId: group[0].pairId, comparisonId: group[0].comparisonId, openingId: group[0].openingId,
      contextId: group[0].contextId, whiteCp: (group[0].score.value + group[1].score.value) / 2,
      gameIds: group.map(row => row.id) });
  }
  return { exact, completeColorPairs, incompatibleContextPairs };
}
function summarize(rows, pairs) {
  const exact = rows.filter(row => row.category === 'exactCp'), ids = new Set(rows.map(row => row.id));
  const paired = pairs.filter(pair => pair.gameIds.every(id => ids.has(id)));
  const mateScores = new Map(), boundedScores = new Map();
  for (const row of rows.filter(row => ['mate', 'boundedCp'].includes(row.category))) {
    const groups = row.category === 'mate' ? mateScores : boundedScores, id = key(row.score);
    const group = groups.get(id) || { score: row.score, games: 0 }; group.games++; groups.set(id, group);
  }
  return { counts: count(rows),
    exactCp: { white: statistics(exact.map(row => row.score.value)),
      a: statistics(exact.map(row => row.score.value * (row.aColor === 'w' ? 1 : -1))) },
    aColors: ['w', 'b'].map(color => { const selected = rows.filter(row => row.aColor === color), cp = selected.filter(row => row.category === 'exactCp');
      return { color, counts: count(selected), exactWhiteCp: statistics(cp.map(row => row.score.value)),
        exactACp: statistics(cp.map(row => row.score.value * (color === 'w' ? 1 : -1))) }; }),
    pairedWhiteCp: { pairs: paired.length, ...statistics(paired.map(pair => pair.whiteCp)) },
    unpairedExactCpGames: exact.length - paired.length * 2,
    mateScores: [...mateScores.values()].sort((a, b) => key(a.score).localeCompare(key(b.score))),
    boundedCpScores: [...boundedScores.values()].sort((a, b) => key(a.score).localeCompare(key(b.score))) };
}
function grouped(rows, fields, pairs) {
  const groups = new Map();
  for (const row of rows) {
    const identity = Object.fromEntries(fields.map(field => [field, row[field]])), id = key(identity);
    if (!groups.has(id)) groups.set(id, { identity, rows: [] });
    groups.get(id).rows.push(row);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, group]) => ({ ...group.identity,
    ...(fields.includes('comparisonId') ? { comparisonLabel: group.rows[0].comparisonLabel } : {}), ...summarize(group.rows, pairs) }));
}

function buildOpeningEvaluationReport(records, options = {}) {
  const latest = latestAttempts(records), observations = latest.records.map(record => observe(record, options));
  const paired = pairObservations(observations), contexts = new Map();
  for (const row of observations) if (row.contextId) contexts.set(row.contextId, row.context);
  return { schemaVersion: 1, format: FORMAT, source: 'stored-first-post-opening-search', perspective: 'white',
    counts: { inputAttempts: records.length, uniqueAttempts: latest.uniqueAttempts, duplicateCopiesIgnored: latest.duplicateCopiesIgnored,
      ...count(observations), completeColorPairs: paired.completeColorPairs, pairedExactCp: paired.exact.length,
      unpairedExactCpGames: observations.filter(row => row.category === 'exactCp').length - paired.exact.length * 2,
      incompatibleContextPairs: paired.incompatibleContextPairs },
    contexts: [...contexts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([contextId, context]) => ({ contextId, ...copy(context),
      ...summarize(observations.filter(row => row.contextId === contextId), paired.exact) })),
    openings: grouped(observations, ['openingId', 'contextId'], paired.exact),
    comparisons: grouped(observations, ['comparisonId', 'contextId'], paired.exact),
    issues: observations.filter(row => row.category === 'invalid').map(({ id, attempt, reason }) => ({ id, attempt, reason })),
    unavailableReasons: Object.fromEntries([...new Set(observations.filter(row => row.category === 'unavailable').map(row => row.reason))]
      .sort().map(reason => [reason, observations.filter(row => row.category === 'unavailable' && row.reason === reason).length])),
    notes: [
      'Only stored first-search diagnostics are read. No engine search, replay or historical backfill occurs.',
      'Scores use White POV. A POV is derived from each game\'s recorded physical color. Mate scores and bounds are never averaged with exact centipawns.',
      'Each diagnostic pair averages its two White-POV exact-cp scores with A\'s colors swapped. Opening rows summarize those pair averages; this is conditional color context, not a causal correction or proof of fairness.',
      'Latest attempts count once. Diagnostic pairs may include truncated, aborted or error games because their opening search happened; game results and outcome-pair scoring remain unchanged.',
      'Engine, profile, evaluation policy, evaluator strength and search-budget contexts remain separate. Missing legacy observations are explicit.',
    ] };
}

function renderOpeningEvaluationReport(summary) {
  if (!summary) return '';
  const counts = summary.counts, fmt = value => value === null ? 'unavailable' : `${Number(value.toFixed(2))}`;
  const labels = new Map(summary.contexts.map((context, index) => [context.contextId, `C${index + 1}`]));
  const text = value => String(value).replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
  return ['## Opening evaluations', '',
    `${counts.recorded}/${counts.latestGames} latest games contain a stored observation: ${counts.exactCp} exact cp, ${counts.boundedCp} bounded cp, ${counts.mate} mate, ${counts.unavailable} unavailable and ${counts.invalid} invalid. ${counts.missing} legacy/missing observations remain unfilled. ${counts.duplicateCopiesIgnored} duplicate copies were ignored.`, '',
    'This uses the first normal search after the forced prefix; no extra searches are added. Positive scores favor White and negative scores favor Black. Mate scores and bounds stay separate from exact centipawns. Error/truncated games can contribute diagnostics without becoming scored results.', '',
    ...(summary.contexts.length ? ['| Context | Engine hash | Evaluator | Search limit | Profile |', '| --- | --- | --- | --- | --- |',
      ...summary.contexts.map(context => `| ${labels.get(context.contextId)} | ${context.engineSha256.slice(0, 12)} | ${context.evaluatingColor === 'w' ? 'White' : 'Black'} ${text(JSON.stringify(context.strength))} | ${text(JSON.stringify(context.limits))} | ${text((context.profileHash || context.variant || 'ordinary').slice(0, 16))} |`), ''] : []),
    ...(summary.openings.length ? ['| Opening | Context | Recorded / games | Exact cp | Bounded cp / mate | Paired exact games | Paired White cp median | Pair range (cp) |',
      '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
      ...summary.openings.map(row => `| ${text(row.openingId)} | ${labels.get(row.contextId) || 'not recorded / invalid'} | ${row.counts.recorded}/${row.counts.latestGames} | ${row.counts.exactCp} | ${row.counts.boundedCp} / ${row.counts.mate} | ${row.pairedWhiteCp.pairs * 2} | ${fmt(row.pairedWhiteCp.median)} | ${row.pairedWhiteCp.pairs ? `${fmt(row.pairedWhiteCp.min)}–${fmt(row.pairedWhiteCp.max)}` : 'unavailable'} |`), ''] : []),
    `Each paired value averages two exact White-POV scores with A's colors swapped; the table reports the median across matchup pairs. ${counts.incompatibleContextPairs} pairs have incompatible search contexts. Missing, bounded or mate counterparts do not become cp pairs.`, '',
    'These are engine estimates under the declared positions and priors, not material values or a certificate of opening fairness. They do not select openings, alter weights or change any recorded result. Reports refresh at the existing batch boundaries; offline reporting performs no new evaluation.', ''].join('\n');
}

module.exports = { FORMAT, statistics, latestAttempts, buildOpeningEvaluationReport, renderOpeningEvaluationReport };
