'use strict';

// Outcome-only analysis of already validated, complete color-swapped pairs.
// A pair stays together during uncertainty calculations; no games or engine
// searches are performed here, and ordinary-army anchors are excluded.
const { conditionalRange } = require('../balance/level3-panel-report');

const SCORES = new Set([0, 0.5, 1]);
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const nonempty = value => typeof value === 'string' && value.length > 0;
const matchupKey = (a, b) => JSON.stringify([a, b]);
const fail = message => { throw new Error(`Panel color analysis: ${message}`); };

function tally(values) {
  return { games: values.length, wins: values.filter(value => value === 1).length,
    draws: values.filter(value => value === 0.5).length, losses: values.filter(value => value === 0).length,
    score: mean(values) };
}
function transformRange(range, factor, offset = 0) {
  if (!range.available) return { ...range };
  const a = factor * range.lower + offset, b = factor * range.upper + offset;
  return { ...range, lower: Math.min(a, b), upper: Math.max(a, b) };
}
function coverage(selected, openingIds) {
  return { shared: selected.length, total: openingIds.length, openingIds: [...selected],
    status: !selected.length ? 'pending shared cases' : selected.length === openingIds.length ? 'complete' : 'partial shared cases' };
}

/** Normalize every selected head matchup to roster order. Other budgets can
 * share the input array, but only the requested budget enters these scores. */
function normalizeInput({ roster, pairs, nodes, openingIds } = {}) {
  if (!Number.isSafeInteger(nodes) || nodes < 1) fail('select a positive node budget.');
  if (!Array.isArray(roster) || roster.length < 2) fail('declare at least two roster pieces.');
  const keys = new Set(), ids = new Set();
  const pieces = roster.map(row => {
    const label = row?.label || row?.name;
    if (!nonempty(row?.key) || !nonempty(row?.id) || !nonempty(label) || keys.has(row.key) || ids.has(row.id)) fail('roster keys, IDs and labels must be distinct.');
    keys.add(row.key); ids.add(row.id); return { key: row.key, id: row.id, label };
  });
  if (!Array.isArray(openingIds) || openingIds.some(id => !nonempty(id)) || new Set(openingIds).size !== openingIds.length) fail('declare distinct opening IDs.');
  if (!Array.isArray(pairs)) fail('provide normalized color pairs.');
  const positions = new Map(pieces.map((row, index) => [row.key, index]));
  const byKey = new Map(pieces.map(row => [row.key, row]));
  const openings = new Set(openingIds), seen = new Set(), games = new Set(), selected = [];
  let ignoredOrdinaryPairs = 0;
  for (const pair of pairs) {
    if (!pair || !Number.isSafeInteger(pair.nodes) || pair.nodes < 1) fail('a pair has an invalid node budget.');
    if (pair.nodes !== nodes) continue;
    if (!['head', 'baseline'].includes(pair.kind)) fail('a pair has an unknown comparison kind.');
    if (!nonempty(pair.stageKey) || !nonempty(pair.comparisonId) || !openings.has(pair.openingId)
      || !nonempty(pair.whiteGameId) || !nonempty(pair.blackGameId) || pair.whiteGameId === pair.blackGameId
      || !SCORES.has(pair.aWhite) || !SCORES.has(pair.aBlack)) fail('a pair has invalid opening, game or score fields.');
    const a = byKey.get(pair.aKey), b = byKey.get(pair.bKey);
    if (!a || a.id !== pair.aId || !nonempty(pair.bKey) || (pair.kind === 'head'
      ? !b || b.id !== pair.bId || a.key === b.key
      : b || pair.bId !== null || pair.bKey !== 'ordinary')) fail('a pair changes its declared roster identity.');
    for (const id of [pair.whiteGameId, pair.blackGameId]) {
      if (games.has(id)) fail('a game occurs in more than one pair at this budget.');
      games.add(id);
    }
    const inverted = pair.kind === 'head' && positions.get(a.key) > positions.get(b.key);
    const first = inverted ? b : a, second = inverted ? a : b;
    const identity = JSON.stringify([pair.kind, first.key, second?.key || pair.bKey, pair.openingId]);
    if (seen.has(identity)) fail('a matchup/opening color pair is duplicated at this budget.');
    seen.add(identity);
    if (pair.kind === 'baseline') { ignoredOrdinaryPairs++; continue; }
    selected.push({ stageKey: pair.stageKey, comparisonId: pair.comparisonId, openingId: pair.openingId,
      aKey: first.key, aId: first.id, bKey: second.key, bId: second.id,
      aWhite: inverted ? 1 - pair.aBlack : pair.aWhite,
      aBlack: inverted ? 1 - pair.aWhite : pair.aBlack,
      // The identifiers describe source A's colors; retaining source labels
      // avoids implying that canonicalization changes the original records.
      source: { aKey: pair.aKey, whiteGameId: pair.whiteGameId, blackGameId: pair.blackGameId } });
  }
  return { pieces, selected, ignoredOrdinaryPairs, openingIds: [...openingIds], nodes };
}

function summarizeMatchup(a, b, pairs, nodes, openingIds) {
  const byOpening = new Map(pairs.map(pair => [pair.openingId, pair]));
  const selectedIds = openingIds.filter(id => byOpening.has(id));
  const cases = selectedIds.map(openingId => {
    const pair = byOpening.get(openingId), aOverall = (pair.aWhite + pair.aBlack) / 2;
    const whiteScore = (pair.aWhite + 1 - pair.aBlack) / 2;
    return { openingId, aWhite: pair.aWhite, aBlack: pair.aBlack, aOverall,
      bWhite: 1 - pair.aBlack, bBlack: 1 - pair.aWhite,
      whiteScore, blackScore: 1 - whiteScore, aColorGap: pair.aWhite - pair.aBlack,
      source: { stageKey: pair.stageKey, comparisonId: pair.comparisonId, ...pair.source } };
  });
  const prefix = `panel-colors:${nodes}:${matchupKey(a.key, b.key)}:${selectedIds.join(',')}`;
  const aOverallRange = conditionalRange(cases.map(row => row.aOverall), `${prefix}:army`);
  const whiteRange = conditionalRange(cases.map(row => row.whiteScore), `${prefix}:physical-white`);
  const aWhiteRange = conditionalRange(cases.map(row => row.aWhite), `${prefix}:a-white`);
  const aBlackRange = conditionalRange(cases.map(row => row.aBlack), `${prefix}:a-black`);
  const aWhite = tally(cases.map(row => row.aWhite)), aBlack = tally(cases.map(row => row.aBlack));
  const bWhite = tally(cases.map(row => row.bWhite)), bBlack = tally(cases.map(row => row.bBlack));
  const physicalWhite = tally(cases.flatMap(row => [row.aWhite, row.bWhite]));
  const physicalBlack = tally(cases.flatMap(row => [row.aBlack, row.bBlack]));
  return { aKey: a.key, aId: a.id, aLabel: a.label, bKey: b.key, bId: b.id, bLabel: b.label,
    completePairs: cases.length, pairedGames: 2 * cases.length, openingCoverage: coverage(selectedIds, openingIds), cases,
    a: { white: aWhite, black: aBlack, overall: tally(cases.flatMap(row => [row.aWhite, row.aBlack])) },
    b: { white: bWhite, black: bBlack, overall: tally(cases.flatMap(row => [row.bWhite, row.bBlack])) },
    physicalWhite, physicalBlack, aOverallScore: mean(cases.map(row => row.aOverall)),
    whiteScore: physicalWhite.score, whiteAdvantage: physicalWhite.score === null ? null : physicalWhite.score - 0.5,
    aColorGap: mean(cases.map(row => row.aColorGap)),
    conditionalRanges: { aOverall: aOverallRange, bOverall: transformRange(aOverallRange, -1, 1),
      aWhite: aWhiteRange, aBlack: aBlackRange, bWhite: transformRange(aBlackRange, -1, 1), bBlack: transformRange(aWhiteRange, -1, 1),
      physicalWhite: whiteRange, physicalBlack: transformRange(whiteRange, -1, 1),
      whiteAdvantage: transformRange(whiteRange, 1, -0.5), aColorGap: transformRange(whiteRange, 2, -1) } };
}

function analyzeColorMatchups(input) {
  const { pieces, selected, nodes, openingIds, ignoredOrdinaryPairs } = normalizeInput(input);
  const byMatchup = new Map();
  for (const pair of selected) {
    const key = matchupKey(pair.aKey, pair.bKey), rows = byMatchup.get(key) || [];
    rows.push(pair); byMatchup.set(key, rows);
  }
  const matchups = pieces.flatMap((a, index) => pieces.slice(index + 1).map(b =>
    summarizeMatchup(a, b, byMatchup.get(matchupKey(a.key, b.key)) || [], nodes, openingIds)));
  const indices = matchups.map(row => new Map(row.cases.map(value => [value.openingId, value])));
  const shared = openingIds.filter(opening => indices.every(index => index.has(opening)));
  const cases = shared.map(openingId => ({ openingId, matchups: matchups.length,
    whiteScore: mean(indices.map(index => index.get(openingId).whiteScore)) }));
  const rawCases = shared.flatMap(openingId => indices.map(index => index.get(openingId)));
  const physicalWhite = tally(rawCases.flatMap(row => [row.aWhite, row.bWhite]));
  const physicalBlack = tally(rawCases.flatMap(row => [row.aBlack, row.bBlack]));
  const whiteRange = conditionalRange(cases.map(row => row.whiteScore), `panel-colors:${nodes}:global:${shared.join(',')}`);
  return { schemaVersion: 1, format: 'levelup-panel-color-analysis', nodes,
    roster: pieces, declaredOpeningIds: openingIds, matchups,
    global: { scope: 'All unordered head-to-head matchups on the same fully scored opening cases, equal matchup/case weights.',
      expectedMatchups: matchups.length, observedScoredPairs: selected.length,
      includedPairs: rawCases.length, pairedGames: rawCases.length * 2,
      openingCoverage: coverage(shared, openingIds), cases, physicalWhite, physicalBlack,
      whiteScore: physicalWhite.score, whiteAdvantage: physicalWhite.score === null ? null : physicalWhite.score - 0.5,
      whiteMinusBlack: physicalWhite.score === null ? null : 2 * physicalWhite.score - 1,
      conditionalRanges: { physicalWhite: whiteRange, physicalBlack: transformRange(whiteRange, -1, 1),
        whiteAdvantage: transformRange(whiteRange, 1, -0.5), whiteMinusBlack: transformRange(whiteRange, 2, -1) } },
    ignoredOrdinaryPairs,
    notes: [
      'Scores count draws as half a point. Each included opening has both physical colors; incomplete color pairs must be excluded before calling this function.',
      'A’s equal-color score measures the recorded army matchup. Physical White score measures initiative across both armies; neither substitutes for the other.',
      'A can score 50% overall when White wins both games, while A winning both colors gives A 100% and physical White 50%. An overall 50% score alone does not establish color fairness.',
      'Equal-color matchup means already balance White and Black. Do not subtract the global White advantage from those means.',
      'Ranges resample whole opening blocks, keeping the two colors and included matchups together. Related fixed openings, engine priors and protocol bias remain outside their scope.',
      'Per-matchup rows use their own complete cases; the global color baseline uses only cases complete across every head-to-head matchup. Coverage is explicit and ordinary-army anchors are excluded.',
    ] };
}

function renderColorReport(report) {
  const escape = value => String(value).replace(/[\r\n]/g, ' ').replace(/\|/g, '\\|');
  const percent = value => value === null ? 'pending' : `${(100 * value).toFixed(2)}%`;
  const points = value => value === null ? 'pending' : `${value >= 0 ? '+' : ''}${(100 * value).toFixed(2)}`;
  const range = value => value.available ? `${percent(value.lower)}–${percent(value.upper)}` : 'pending';
  const global = report.global;
  return [`## ${report.nodes.toLocaleString('en-US')} nodes: head-to-head colors`, '',
    `Physical White score across all ${global.expectedMatchups} matchups on ${global.openingCoverage.shared}/${global.openingCoverage.total} shared opening cases: **${percent(global.whiteScore)}**; conditional 95% range ${range(global.conditionalRanges.physicalWhite)}. Physical Black scores ${percent(global.physicalBlack.score)}.`, '',
    '| A / B | Color pairs | A as White | A as Black | B as White | B as Black | A equal-color score | Physical White score | White conditional 95% range | A White−Black (pp) |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |',
    ...report.matchups.map(row => `| ${escape(row.aLabel)} / ${escape(row.bLabel)} | ${row.completePairs}/${row.openingCoverage.total} | ${percent(row.a.white.score)} | ${percent(row.a.black.score)} | ${percent(row.b.white.score)} | ${percent(row.b.black.score)} | ${percent(row.aOverallScore)} | ${percent(row.whiteScore)} | ${range(row.conditionalRanges.physicalWhite)} | ${points(row.aColorGap)} |`), '',
    'A as White and A as Black are scores for the same army. Physical White combines A as White with B as White. All W/D/L counts and additional conditional ranges are retained in JSON.', '',
    ...report.notes.map(note => `- ${note}`), ''].join('\n');
}

module.exports = { normalizeInput, analyzeColorMatchups, renderColorReport };
