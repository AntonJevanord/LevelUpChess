'use strict';

// An outcome summary of the original journals, not a material fit or a replay audit.
const { isDeepStrictEqual } = require('node:util');
const { summarize } = require('./stats');

const RESULTS = new Set(['1-0', '0-1', '1/2-1/2']);
const STATUSES = new Set(['completed', 'truncated', 'aborted', 'error']);
const FINAL = new Set(['completed', 'truncated']);
const keyFor = (a, b) => JSON.stringify([a, b]);
const percent = value => value === null ? '—' : `${(value * 100).toFixed(2)}%`;
const markdown = value => String(value).replace(/[\r\n]/g, ' ').replace(/\|/g, '\\|');
const csv = value => /[",\r\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value);
const REFERENCE_KEYS = new Set(['vanguard', 'unicorn', 'cruisader', 'amazon']);
const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const gameScore = record => record.result === '1/2-1/2' ? 0.5 : Number((record.result === '1-0') === (record.aColor === 'w'));

/** Restrict overall scores to the same fully finished opening cases across
 * opponents. A faster worker or an extra completed repetition adds no weight. */
function overallScores(rows, config, metadata, latest) {
  const completedPairs = new Map();
  for (const record of latest.values()) {
    if (record.status !== 'completed') continue;
    const pair = completedPairs.get(record.pairId) || [];
    pair.push(record); completedPairs.set(record.pairId, pair);
  }
  const pairs = [...completedPairs.values()].filter(pair => pair.length === 2 && pair[0].aColor !== pair[1].aColor);
  const tally = scores => ({ games: scores.length, wins: scores.filter(value => value === 1).length,
    draws: scores.filter(value => value === 0.5).length, losses: scores.filter(value => value === 0).length });
  return {
    method: 'Equal opponent means over shared fully completed opening cases; every configured repetition requires a complete color pair. Draws count half a point.',
    rows: rows.map(row => {
      const matches = metadata.comparisons.flatMap(comparison => comparison.aKey === row.key
        ? [{ id: comparison.id, key: comparison.bKey, label: comparison.bLabel, inverted: false }]
        : metadata.symmetric && comparison.bKey === row.key
          ? [{ id: comparison.id, key: comparison.aKey, label: comparison.aLabel, inverted: true }] : []);
      const references = matches.filter(opponent => REFERENCE_KEYS.has(opponent.key));
      const targets = references.length ? references : matches;
      const byOpponent = targets.map(opponent => {
        const openings = new Map();
        for (const pair of pairs.filter(pair => pair[0].comparisonId === opponent.id)) {
          const opening = openings.get(pair[0].openingId) || [];
          opening.push(pair); openings.set(pair[0].openingId, opening);
        }
        return { ...opponent, openings };
      });
      const fullyCompleted = (opponent, openingId) => {
        const openingPairs = opponent.openings.get(openingId) || [];
        if (openingPairs.length !== config.repetitions) return false;
        if (config.repetitions === 1) return true; // Legacy toy records may omit repetition 1.
        const repetitions = openingPairs.map(pair => pair[0].repetition === pair[1].repetition ? pair[0].repetition : null);
        return new Set(repetitions).size === config.repetitions
          && repetitions.every(repetition => Number.isSafeInteger(repetition) && repetition >= 1 && repetition <= config.repetitions);
      };
      const shared = config.openings.filter(opening => byOpponent.length
        && byOpponent.every(opponent => fullyCompleted(opponent, opening.id))).map(opening => opening.id);
      const opponents = byOpponent.map(opponent => {
        const scores = shared.flatMap(openingId => opponent.openings.get(openingId)
          .flatMap(pair => pair.map(record => opponent.inverted ? 1 - gameScore(record) : gameScore(record))));
        const score = shared.length ? average(shared.map(openingId => average(opponent.openings.get(openingId)
          .map(pair => average(pair.map(record => opponent.inverted ? 1 - gameScore(record) : gameScore(record))))))) : null;
        return { key: opponent.key, label: opponent.label, ...tally(scores), score };
      });
      const totals = opponents.reduce((sum, opponent) => ({ games: sum.games + opponent.games, wins: sum.wins + opponent.wins,
        draws: sum.draws + opponent.draws, losses: sum.losses + opponent.losses }), { games: 0, wins: 0, draws: 0, losses: 0 });
      return { key: row.key, label: row.label, scope: references.length ? 'fixed-reference opponents only' : 'all scheduled opponents except self',
        score: shared.length ? average(opponents.map(opponent => opponent.score)) : null, ...totals, opponents,
        openingCoverage: { shared: shared.length, total: config.openings.length, openingIds: shared, repetitions: config.repetitions },
        status: !shared.length ? 'pending shared opening cases' : shared.length === config.openings.length ? 'complete' : 'partial shared opening cases' };
    }),
  };
}

function axes(input, name) {
  if (!Array.isArray(input) || !input.length) throw new Error(`Report metadata requires ${name}.`);
  const seen = new Set();
  return input.map(item => {
    if (!item || typeof item.key !== 'string' || !item.key || typeof item.label !== 'string' || !item.label.trim() || seen.has(item.key)) throw new Error(`Report ${name} require distinct keys and labels.`);
    seen.add(item.key);
    return { key: item.key, label: item.label };
  });
}

function validateRecords(records, config, comparisons, manifest) {
  if (!Array.isArray(records)) throw new Error('Report records must be an array.');
  if (manifest && !isDeepStrictEqual(manifest.config, config)) throw new Error('Report manifest does not match the declared experiment config.');
  const schedule = manifest && new Map(manifest.schedule?.map(game => [game.id, game]));
  if (manifest && (!Array.isArray(manifest.schedule) || schedule.size !== manifest.schedule.length)) throw new Error('Report manifest requires a distinct game schedule.');
  const openingIds = new Set(config.openings.map(opening => opening.id));
  const unique = [], attempts = new Map(), latest = new Map(), pairs = new Map();
  for (const record of records) {
    if (!record || typeof record !== 'object' || !comparisons.has(record.comparisonId)) throw new Error('Report contains an unknown comparison.');
    if (typeof record.id !== 'string' || !record.id || typeof record.pairId !== 'string' || !record.pairId || typeof record.openingId !== 'string' || !record.openingId
      || !['w', 'b'].includes(record.aColor) || !Number.isSafeInteger(record.attempt) || record.attempt < 1 || !STATUSES.has(record.status)) throw new Error('Report contains an invalid attempt identity or status.');
    if (!openingIds.has(record.openingId)) throw new Error('Report contains an unknown opening prefix.');
    if (record.status === 'completed' ? !RESULTS.has(record.result) : record.result !== '*') throw new Error('Report contains an invalid completed or unscored result.');
    const pair = pairs.get(record.pairId) || { comparisonId: record.comparisonId, openingId: record.openingId, colors: new Map() };
    if (pair.comparisonId !== record.comparisonId || pair.openingId !== record.openingId || pair.colors.has(record.aColor) && pair.colors.get(record.aColor) !== record.id) throw new Error('Report pair has conflicting comparison, opening or color identities.');
    pair.colors.set(record.aColor, record.id); pairs.set(record.pairId, pair);
    if (manifest) {
      const planned = schedule.get(record.id), profile = manifest.designProfile;
      if (!planned || ['pairId', 'comparisonId', 'openingId', 'aColor'].some(field => record[field] !== planned[field])) throw new Error('Report record does not match the frozen schedule.');
      if (!profile || record.profileHash !== profile.hash || record.registryHash !== profile.registryHash || record.registryHash !== manifest.designRegistry?.hash
        || record.variant !== profile.variant || record.registryReference !== 'run.json#designRegistry') throw new Error('Report record does not match the frozen rules profile.');
      const comparison = comparisons.get(record.comparisonId);
      const white = record.aColor === 'w' ? comparison.strengthA : comparison.strengthB;
      const black = record.aColor === 'b' ? comparison.strengthA : comparison.strengthB;
      if (!isDeepStrictEqual(record.engine, config.engine) || !isDeepStrictEqual(record.evaluation, config.evaluation)
        || !isDeepStrictEqual(record.whiteStrength, white) || !isDeepStrictEqual(record.blackStrength, black)
        || !isDeepStrictEqual(record.openingMoves, planned.openingMoves)) throw new Error('Report record engine, strength, evaluation or opening context changed.');
    }
    const attemptKey = keyFor(record.id, record.attempt), existing = attempts.get(attemptKey);
    if (existing) {
      if (!isDeepStrictEqual(existing, record)) throw new Error('Report contains conflicting duplicate attempts.');
      continue; // A repeated copy of a durable line must never add weight.
    }
    const previous = latest.get(record.id);
    if (previous && (record.attempt <= previous.attempt || FINAL.has(previous.status))) throw new Error('Report contains an out-of-order attempt or history after finalization.');
    if (previous && ['pairId', 'comparisonId', 'openingId', 'aColor'].some(field => previous[field] !== record[field])) throw new Error('Report retry changed its game identity.');
    attempts.set(attemptKey, record); latest.set(record.id, record); unique.push(record);
  }
  return { unique, latest };
}

function createV17Report({ experiment, config, metadata, records, manifest } = {}) {
  if (!config || !Array.isArray(config.comparisons) || !config.comparisons.length || !Array.isArray(config.openings) || !Number.isSafeInteger(config.repetitions)) throw new Error('Report requires a declared experiment config.');
  const rows = axes(metadata?.rows, 'rows'), columns = axes(metadata?.columns, 'columns');
  if (!Array.isArray(metadata.comparisons) || metadata.comparisons.length !== config.comparisons.length) throw new Error('Report metadata must describe every declared comparison.');
  const byId = new Map(config.comparisons.map(comparison => [comparison.id, comparison]));
  if (byId.size !== config.comparisons.length) throw new Error('Report config repeats a comparison ID.');
  const described = new Set(), pairs = new Set();
  const rowKeys = new Set(rows.map(row => row.key)), columnKeys = new Set(columns.map(column => column.key));
  for (const item of metadata.comparisons) {
    if (!item) throw new Error('Report comparison metadata is missing.');
    const pair = metadata.symmetric ? [item.aKey, item.bKey].sort() : [item.aKey, item.bKey];
    const key = JSON.stringify(pair);
    if (!item || !byId.has(item.id) || described.has(item.id) || pairs.has(key) || !rowKeys.has(item.aKey) || !columnKeys.has(item.bKey)
      || typeof item.aLabel !== 'string' || typeof item.bLabel !== 'string' || item.aKey === item.bKey) throw new Error('Report comparison metadata is missing, repeated or outside its matrix.');
    described.add(item.id); pairs.add(key);
  }
  const { unique, latest } = validateRecords(records, config, byId, manifest);
  const summary = summarize(unique), results = new Map(summary.comparisons.map(comparison => [comparison.comparisonId, comparison]));
  const expectedPairs = config.openings.length * config.repetitions;
  const comparisons = metadata.comparisons.map(item => {
    const result = results.get(item.id);
    return {
      id: item.id, aKey: item.aKey, aLabel: item.aLabel, bKey: item.bKey, bLabel: item.bLabel,
      scheduledGames: expectedPairs * 2, expectedPairs,
      attempts: result?.attempts || 0,
      pairedGames: result?.paired.games || 0, completePairs: result?.paired.completePairs || 0,
      partialPairs: result?.paired.partialPairs || 0, openings: result?.primaryEstimate.uniqueOpenings || 0,
      wins: result?.paired.wins || 0, draws: result?.paired.draws || 0, losses: result?.paired.losses || 0,
      score: result?.primaryEstimate.score ?? null,
      statusCounts: result?.statusCounts || { completed: 0, truncated: 0, aborted: 0, error: 0, unknown: 0 },
    };
  });
  const cells = new Map();
  for (const comparison of comparisons) {
    const cell = inverted => ({ comparisonId: comparison.id, score: comparison.score === null ? null : inverted ? 1 - comparison.score : comparison.score,
      pairedGames: comparison.pairedGames, completePairs: comparison.completePairs, openings: comparison.openings,
      wins: inverted ? comparison.losses : comparison.wins, draws: comparison.draws, losses: inverted ? comparison.wins : comparison.losses, inverted });
    cells.set(keyFor(comparison.aKey, comparison.bKey), cell(false));
    if (metadata.symmetric) cells.set(keyFor(comparison.bKey, comparison.aKey), cell(true));
  }
  const scheduledGames = config.comparisons.length * expectedPairs * 2;
  return {
    schemaVersion: 1, format: 'levelup-v17-outcome-report', experiment, name: config.name,
    question: metadata.question || null, kind: metadata.kind || experiment, runId: manifest?.runId || null,
    scheduledGames,
    progress: { attempts: unique.length, duplicateCopiesIgnored: records.length - unique.length,
      finalizedGames: [...latest.values()].filter(record => FINAL.has(record.status)).length,
      completedGames: [...latest.values()].filter(record => record.status === 'completed').length,
      pairedGames: comparisons.reduce((sum, comparison) => sum + comparison.pairedGames, 0),
      completePairs: comparisons.reduce((sum, comparison) => sum + comparison.completePairs, 0) },
    comparisons,
    overall: overallScores(rows, config, metadata, latest),
    matrix: { perspective: 'row army score against column army; draws count half', columns,
      rows: rows.map(row => ({ ...row, cells: columns.map(column => ({ columnKey: column.key, ...(cells.get(keyFor(row.key, column.key)) || { comparisonId: null, score: null, pairedGames: 0, completePairs: 0, openings: 0, wins: 0, draws: 0, losses: 0, inverted: false }) })) })) },
    notes: [
      'Scores use complete color-swapped pairs only, with equal weight for each represented opening prefix. Draws count half a point.',
      'Unpaired completions, move-limit truncations, errors and cancelled games do not become draws or losses.',
      `${config.openings.length} fixed short prefixes are a coarse descriptive screen, not independent samples supporting a precise strength estimate. No material values or individual piece Elo are fitted.`,
      'This report validates journal identities and summarizes recorded outcomes; it does not independently replay every move.',
    ],
  };
}

function renderV17Report(report, { includeOverall = true } = {}) {
  const overall = includeOverall && report.overall ? new Map(report.overall.rows.map(row => [row.key, row])) : null;
  const overallCell = row => {
    const summary = overall.get(row.key);
    return `${summary.score === null ? 'pending' : percent(summary.score)} (${summary.openingCoverage.shared}/${summary.openingCoverage.total})`;
  };
  const lines = [`# ${markdown(report.name)}`, '', report.question ? markdown(report.question) : '', '',
    `Finalized games: ${report.progress.finalizedGames}/${report.scheduledGames}; scored complete pairs: ${report.progress.completePairs}.`, '',
    '| Row army / column opponent | ' + report.matrix.columns.map(column => markdown(column.label)).join(' | ') + (overall ? ' | Overall score (cases)' : '') + ' |',
    '| --- | ' + report.matrix.columns.map(() => '---:').join(' | ') + (overall ? ' | ---:' : '') + ' |',
    ...report.matrix.rows.map(row => '| ' + markdown(row.label) + ' | ' + row.cells.map(cell => percent(cell.score)).join(' | ') + (overall ? ` | ${overallCell(row)}` : '') + ' |'), '',
    'Matrix entries are the row army’s score; a blank dash means no scored pair or no scheduled matchup.', '',
    ...(overall ? [
      'Overall score gives each fixed reference equal weight; reference 2v2 teams instead weight all other scheduled teams equally. Direct pawn/grant bundle matches are excluded from reference averages. Draws count half a point. Only opening cases with every scheduled repetition and both colors completed against every included opponent contribute. Other completed games remain in individual matchup cells; overall stays pending until at least one case is shared.', '',
      '| Overall row | Included games | W / D / L | Opponents | Shared cases |',
      '| --- | ---: | :--- | ---: | ---: |',
      ...report.overall.rows.map(row => `| ${markdown(row.label)} | ${row.games} | ${row.wins} / ${row.draws} / ${row.losses} | ${row.opponents.length} | ${row.openingCoverage.shared}/${row.openingCoverage.total} |`), '',
    ] : []),
    '| A versus B | Paired games | A W / D / L | A score | Complete pairs | Openings | Truncated attempts | Errors |',
    '| --- | ---: | :--- | ---: | ---: | ---: | ---: | ---: |',
    ...report.comparisons.map(comparison => `| ${markdown(comparison.aLabel)} / ${markdown(comparison.bLabel)} | ${comparison.pairedGames} | ${comparison.wins} / ${comparison.draws} / ${comparison.losses} | ${percent(comparison.score)} | ${comparison.completePairs}/${comparison.expectedPairs} | ${comparison.openings} | ${comparison.statusCounts.truncated} | ${comparison.statusCounts.error} |`), '',
    ...report.notes.map(note => `- ${note}`), '',
  ];
  return lines.filter((line, index) => line || lines[index - 1] !== '').join('\n');
}

function renderV17Csv(report) {
  const fields = ['comparison_id', 'army_a', 'army_b', 'paired_games', 'a_wins', 'draws', 'a_losses', 'a_score', 'complete_pairs', 'expected_pairs', 'openings', 'truncated_attempts', 'error_attempts'];
  const values = report.comparisons.map(comparison => [comparison.id, comparison.aLabel, comparison.bLabel, comparison.pairedGames, comparison.wins, comparison.draws, comparison.losses,
    comparison.score === null ? '' : comparison.score, comparison.completePairs, comparison.expectedPairs, comparison.openings, comparison.statusCounts.truncated, comparison.statusCounts.error]);
  return [fields, ...values].map(row => row.map(csv).join(',')).join('\r\n') + '\r\n';
}

module.exports = { createV17Report, renderV17Report, renderV17Csv };
