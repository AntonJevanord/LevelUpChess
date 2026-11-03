'use strict';

// Reweight recorded opponents only. Removing a roster entry does not change
// any played move, retained matchup result or previously fitted material value.
const { conditionalRange } = require('../balance/level3-panel-report');

const SCORES = new Set([0, 0.5, 1]);
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const matchupKey = (a, b, opening) => JSON.stringify([[a, b].sort(), opening]);
const percent = value => value === null ? 'pending' : `${(100 * value).toFixed(2)}%`;
const points = value => value === null ? 'pending' : `${value >= 0 ? '+' : ''}${(100 * value).toFixed(2)}`;
const markdown = value => String(value).replace(/[\r\n]/g, ' ').replace(/\|/g, '\\|');

function validateInput({ roster, pairs, nodes, openingIds, exclude }) {
  if (!Array.isArray(roster) || roster.length < 2 || !Number.isSafeInteger(nodes) || nodes < 1
    || !Array.isArray(openingIds) || openingIds.some(id => !nonempty(id))
    || new Set(openingIds).size !== openingIds.length || !Array.isArray(pairs) || !Array.isArray(exclude)) {
    throw new Error('Declare a roster, one node budget, distinct opening IDs, paired outcomes and exclusions.');
  }
  const keys = new Set(), ids = new Set();
  const pieces = roster.map(row => {
    if (!row || !nonempty(row.key) || !nonempty(row.id) || !nonempty(row.label || row.name)
      || keys.has(row.key) || ids.has(row.id)) throw new Error('Roster keys, IDs and labels must be distinct.');
    keys.add(row.key); ids.add(row.id);
    return { key: row.key, id: row.id, label: row.label || row.name };
  });
  if (new Set(exclude).size !== exclude.length || exclude.some(key => !keys.has(key))) throw new Error('Exclusions must be distinct canonical roster keys.');
  if (exclude.length && roster.length - exclude.length < 2) throw new Error('Keep at least two pieces in the requested roster.');
  const byKey = new Map(pieces.map(row => [row.key, row])), knownOpenings = new Set(openingIds);
  const index = new Map(), comparisonIdentities = new Map(), seen = new Set(), gameIds = new Set();
  for (const pair of pairs) {
    if (!pair || !Number.isSafeInteger(pair.nodes) || pair.nodes < 1) throw new Error('A pair has an invalid node budget.');
    if (pair.nodes !== nodes) continue;
    if (!['head', 'baseline'].includes(pair.kind)
      || !nonempty(pair.stageKey) || !nonempty(pair.comparisonId) || !knownOpenings.has(pair.openingId)
      || !nonempty(pair.whiteGameId) || !nonempty(pair.blackGameId) || pair.whiteGameId === pair.blackGameId
      || !SCORES.has(pair.aWhite) || !SCORES.has(pair.aBlack)
      || !byKey.has(pair.aKey) || byKey.get(pair.aKey).id !== pair.aId) throw new Error('Malformed paired outcome or changed roster identity.');
    if (pair.kind === 'head' ? pair.aKey === pair.bKey || !byKey.has(pair.bKey) || byKey.get(pair.bKey).id !== pair.bId
      : !nonempty(pair.bKey) || pair.bId !== null || keys.has(pair.bKey)) throw new Error('A pair changes its head-to-head or ordinary-army identity.');
    const identity = JSON.stringify([pair.kind, pair.aKey, pair.bKey, pair.aId, pair.bId]);
    if (comparisonIdentities.has(pair.comparisonId) && comparisonIdentities.get(pair.comparisonId) !== identity) throw new Error('A comparison changes its recorded orientation or designs.');
    comparisonIdentities.set(pair.comparisonId, identity);
    const key = pair.kind === 'head' ? matchupKey(pair.aKey, pair.bKey, pair.openingId)
      : JSON.stringify(['baseline', pair.aKey, pair.openingId]);
    if (seen.has(key)) throw new Error('Duplicate matchup/opening pair cannot add weight.');
    seen.add(key);
    for (const id of [pair.whiteGameId, pair.blackGameId]) {
      if (gameIds.has(id)) throw new Error('A recorded game belongs to more than one pair.');
      gameIds.add(id);
    }
    if (pair.kind === 'head') index.set(key, pair);
  }
  return { pieces, index };
}

/** Return the piece's points as White and Black, regardless of A/B storage. */
function perspective(pair, key) {
  return pair.aKey === key ? [pair.aWhite, pair.aBlack] : [1 - pair.aBlack, 1 - pair.aWhite];
}
function tally(scores) {
  return { games: scores.length, wins: scores.filter(score => score === 1).length,
    draws: scores.filter(score => score === 0.5).length, losses: scores.filter(score => score === 0).length,
    score: mean(scores) };
}
function summarizeRow(row, opponents, selected, index, nodes, scope) {
  const outcomes = selected.flatMap(openingId => opponents.map(opponent => ({ openingId, opponent: opponent.key,
    scores: perspective(index.get(matchupKey(row.key, opponent.key, openingId)), row.key) })));
  const cases = selected.map(openingId => {
    const records = outcomes.filter(record => record.openingId === openingId);
    const whiteScore = mean(records.map(record => record.scores[0])), blackScore = mean(records.map(record => record.scores[1]));
    return { openingId, score: (whiteScore + blackScore) / 2, whiteScore, blackScore };
  });
  return { ...row, ...tally(outcomes.flatMap(record => record.scores)), score: mean(cases.map(item => item.score)),
    opponents: opponents.map(opponent => ({ ...opponent, ...tally(outcomes.filter(record => record.opponent === opponent.key).flatMap(record => record.scores)) })),
    physicalColors: ['w', 'b'].map((color, colorIndex) => ({ color, ...tally(outcomes.map(record => record.scores[colorIndex])) })),
    cases, conditionalRange: conditionalRange(cases.map(item => item.score), `exclusion:${nodes}:${scope}:${row.key}:score`),
    openingCoverage: { shared: selected.length, openingIds: [...selected] } };
}

function scenario(pieces, index, openingIds, nodes, excludedKeys, baseline) {
  const excluded = new Set(excludedKeys), retained = pieces.filter(row => !excluded.has(row.key));
  const key = excludedKeys.length ? `without:${excludedKeys.join('+')}` : 'full-roster';
  if (retained.length < 2) return { key, excludedKeys: [...excludedKeys], retainedKeys: retained.map(row => row.key),
    available: false, reason: 'Fewer than two retained pieces have no opponent basket.', rows: [], commonRosterCases: [], globalCaseStandings: [] };
  const rows = retained.map(row => {
    const opponents = retained.filter(other => other.key !== row.key);
    const shared = openingIds.filter(openingId => opponents.every(other => index.has(matchupKey(row.key, other.key, openingId))));
    const summary = summarizeRow(row, opponents, shared, index, nodes, key);
    summary.openingCoverage.total = openingIds.length;
    summary.status = !shared.length ? 'pending shared cases' : shared.length === openingIds.length ? 'complete' : 'partial shared cases';
    const original = baseline?.rows.find(other => other.key === row.key) || summary;
    const originalCases = new Map(original.cases.map(item => [item.openingId, item.score]));
    const filteredCases = new Map(summary.cases.map(item => [item.openingId, item.score]));
    const matched = openingIds.filter(id => originalCases.has(id) && filteredCases.has(id));
    const differences = matched.map(id => filteredCases.get(id) - originalCases.get(id));
    summary.matchedComparison = { sharedOpenings: matched.length, openingIds: matched,
      baselineScore: mean(matched.map(id => originalCases.get(id))), filteredScore: mean(matched.map(id => filteredCases.get(id))),
      difference: mean(differences), conditionalRange: conditionalRange(differences, `exclusion:${nodes}:${key}:${row.key}:same-cases`),
      baselineOpponents: original.opponents.map(other => other.key), filteredOpponents: opponents.map(other => other.key) };
    summary.newlyAvailableCases = shared.filter(id => !originalCases.has(id));
    summary.newlyAvailableCaseCount = summary.newlyAvailableCases.length;
    return summary;
  });
  const commonRosterCases = openingIds.filter(id => rows.every(row => row.openingCoverage.openingIds.includes(id)));
  const globalCaseStandings = retained.map(row => ({ ...summarizeRow(row, retained.filter(other => other.key !== row.key), commonRosterCases, index, nodes, `${key}:global-cases`),
    openingCoverage: { shared: commonRosterCases.length, total: openingIds.length, openingIds: [...commonRosterCases] } }));
  return { key, excludedKeys: [...excludedKeys], excluded: pieces.filter(row => excluded.has(row.key)),
    retainedKeys: retained.map(row => row.key), available: true, rows, commonRosterCases, globalCaseStandings,
    commonRosterMean: mean(globalCaseStandings.map(row => row.score).filter(score => score !== null)) };
}

function analyzeExclusions({ roster, pairs, nodes, openingIds, exclude = [] } = {}) {
  const { pieces, index } = validateInput({ roster, pairs, nodes, openingIds, exclude });
  const canonicalExclusions = pieces.filter(row => exclude.includes(row.key)).map(row => row.key);
  const baseline = scenario(pieces, index, openingIds, nodes, []);
  return { schemaVersion: 1, format: 'levelup-panel-opponent-exclusions', nodes, roster: pieces,
    openingIds: [...openingIds], baseline,
    requested: canonicalExclusions.length ? scenario(pieces, index, openingIds, nodes, canonicalExclusions, baseline) : null,
    leaveOneOut: pieces.map(row => scenario(pieces, index, openingIds, nodes, [row.key], baseline)),
    notes: [
      'Scores average both observed colors, declared opening cases and remaining opponents equally. Ordinary-army anchors do not enter standings.',
      'Removing a piece removes its matchups from the opponent basket; every retained head-to-head result stays unchanged. This is reweighting, not a counterfactual game replay or material refit.',
      'Filtered rows may gain opening cases when an excluded opponent had an unfinished pair. Matched changes compare full and filtered baskets only on the same original complete cases.',
      'Row-wise standings retain all cases complete against that row’s opponents, so rows can have different coverage. The separate global-case standings use one common roster-wide case set.',
      'Conditional ranges resample whole opening blocks, retaining both colors and opponents together. Related openings, engine bias and selection after viewing results remain outside them.',
      'Removing weak opponents can lower remaining averages; removing strong opponents can raise them. Neither result means a retained piece changed strength.'
    ] };
}

function renderExclusionReport(report) {
  const cell = row => row ? `${percent(row.score)} (${row.openingCoverage.shared})` : '—';
  const labels = new Map(report.roster.map(row => [row.key, row.label]));
  const lines = [`## Opponent exclusions — ${report.nodes.toLocaleString('en-US')} nodes`, '',
    'Each cell is the retained upgrade’s score, followed by its number of shared opening cases. Excluded matchups are removed; retained games are unchanged.', '',
    '| Upgrade | Full roster | ' + report.roster.map(row => `Without ${markdown(row.label)}`).join(' | ') + ' |',
    '| --- | ---: | ' + report.roster.map(() => '---:').join(' | ') + ' |',
    ...report.roster.map(row => `| ${markdown(row.label)} | ${cell(report.baseline.rows.find(item => item.key === row.key))} | ${report.leaveOneOut.map(view => cell(view.rows.find(item => item.key === row.key))).join(' | ')} |`), '',
    `Full-roster coverage shared by every retained matchup: ${report.baseline.commonRosterCases.length}/${report.openingIds.length} cases. JSON also provides stricter standings using this common case set.`, ''];
  if (report.requested) {
    const selected = report.requested;
    lines.push(`### Requested exclusions: ${selected.excludedKeys.map(key => markdown(labels.get(key))).join(', ')}`, '',
      '| Upgrade | Filtered score | White | Black | Cases | Newly available cases | Same-case full score | Same-case filtered score | Change (pp) | Conditional 95% change (pp) |',
      '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
      ...selected.rows.map(row => {
        const compared = row.matchedComparison, range = compared.conditionalRange;
        return `| ${markdown(row.label)} | ${percent(row.score)} | ${percent(row.physicalColors[0].score)} | ${percent(row.physicalColors[1].score)} | ${row.openingCoverage.shared}/${row.openingCoverage.total} | ${row.newlyAvailableCaseCount} | ${percent(compared.baselineScore)} | ${percent(compared.filteredScore)} | ${points(compared.difference)} | ${range.available ? `${points(range.lower)} to ${points(range.upper)}` : 'pending'} |`;
      }), '',
      `The requested roster has ${selected.commonRosterCases.length}/${report.openingIds.length} cases complete for every retained matchup. Same-case changes use each row’s original complete-case intersection; they do not include newly restored cases.`, '');
  }
  lines.push(...report.notes.map(note => `- ${note}`), '');
  return lines.join('\n');
}

module.exports = { analyzeExclusions, renderExclusionReport };
