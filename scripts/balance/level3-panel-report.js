'use strict';

// Outcome reporting only. Original stage readers verify the archived profiles
// and native preflight; this layer repeats journal/schedule validation before
// combining disjoint opening batches. It never starts an engine or fits Elo.
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { createV17Report } = require('./v17-report');

const NODE_BUDGETS = Object.freeze([20000, 40000, 80000]);
const FORMAT = 'levelup-level3-panel-outcome-report';
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const percent = value => value === null ? '—' : `${(value * 100).toFixed(2)}%`;
const escape = value => String(value).replace(/[\r\n]/g, ' ').replace(/\|/g, '\\|');
const pairKey = (a, b) => JSON.stringify([a, b].sort());
const gameScore = record => record.result === '1/2-1/2' ? 0.5 : Number((record.result === '1-0') === (record.aColor === 'w'));

function random(seed) {
  let state = createHash('sha256').update(seed).digest().readUInt32LE(0) || 1;
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
}

/** Resample whole opening cases, retaining both colors and every paired node
 * condition. These are conditional descriptive ranges, not population CIs. */
function conditionalRange(values, seed) {
  const groups = values.length;
  if (groups < 4) return { available: false, lower: null, upper: null, groups,
    reason: 'requires-at-least-four-complete-opening-cases' };
  const draw = random(seed), sampled = [];
  for (let iteration = 0; iteration < 1000; iteration++) {
    let sum = 0;
    for (let index = 0; index < groups; index++) sum += values[Math.floor(draw() * groups)];
    sampled.push(sum / groups);
  }
  sampled.sort((a, b) => a - b);
  const quantile = probability => {
    const index = (sampled.length - 1) * probability, lower = Math.floor(index), fraction = index - lower;
    return sampled[lower] + fraction * (sampled[Math.min(lower + 1, sampled.length - 1)] - sampled[lower]);
  };
  return { available: true, lower: quantile(0.025), upper: quantile(0.975), groups,
    confidence: 0.95, resamples: 1000, unit: 'whole-opening-case',
    interpretation: 'Conditional percentile range over the declared opening cases; related openings and protocol bias remain.' };
}

function entriesFor(pairs, inverted = false) { return pairs.flatMap(pair => pair.records.map(record => ({ record, inverted }))); }
function tally(entries) {
  const score = entry => entry.inverted ? 1 - gameScore(entry.record) : gameScore(entry.record);
  const color = entry => entry.inverted ? entry.record.aColor === 'w' ? 'b' : 'w' : entry.record.aColor;
  const counts = selected => {
    const scores = selected.map(score);
    return { games: scores.length, wins: scores.filter(value => value === 1).length,
      draws: scores.filter(value => value === 0.5).length, losses: scores.filter(value => value === 0).length, score: average(scores) };
  };
  return { ...counts(entries), physicalColors: ['w', 'b'].map(value => ({ color: value, ...counts(entries.filter(entry => color(entry) === value)) })) };
}

function summarizePairs(pairs, seed, inverted = false) {
  const values = pairs.map(pair => inverted ? 1 - pair.score : pair.score);
  return { ...tally(entriesFor(pairs, inverted)), completePairs: pairs.length,
    openingIds: pairs.map(pair => pair.openingId), conditionalRange: conditionalRange(values, seed) };
}

function checkRoster(roster) {
  if (!Array.isArray(roster) || roster.length < 2) throw new Error('Declare the panel roster.');
  const keys = new Set(), ids = new Set();
  return roster.map(row => {
    if (!row || typeof row.key !== 'string' || !row.key || typeof row.id !== 'string' || !row.id
      || typeof (row.label || row.name) !== 'string' || !(row.label || row.name).trim()
      || keys.has(row.key) || ids.has(row.id)) throw new Error('Panel roster keys, design IDs and labels must be distinct.');
    keys.add(row.key); ids.add(row.id);
    return { ...row, label: row.label || row.name };
  });
}

function validateComparisons(metadata, roster) {
  const byId = new Map(roster.map(row => [row.id, row])), heads = new Set(), baselines = new Set();
  for (const row of metadata.comparisons) {
    const a = byId.get(row.designA), b = byId.get(row.designB);
    if (!a || a.key !== row.aKey || a.label !== row.aLabel) throw new Error('Panel comparison changes its A design or roster label.');
    if (row.kind === 'head') {
      const key = pairKey(row.designA, row.designB);
      if (!b || b.key !== row.bKey || b.label !== row.bLabel || a.id === b.id || heads.has(key)) throw new Error('Panel head-to-head comparison is missing, repeated or changes its design.');
      heads.add(key);
    } else if (row.kind === 'baseline') {
      if (row.designB !== null || byId.has(row.bKey) || roster.some(piece => piece.key === row.bKey) || baselines.has(row.designA)) throw new Error('Panel ordinary anchor changes its identity.');
      baselines.add(row.designA);
    } else throw new Error('Panel comparison must be head or baseline.');
  }
  if (heads.size !== roster.length * (roster.length - 1) / 2 || baselines.size !== roster.length) throw new Error('A panel stage must declare every unordered matchup and every ordinary anchor.');
}

function readStages(stages, roster) {
  if (!Array.isArray(stages)) throw new Error('Panel stages must be an array.');
  const keys = new Set(), openingMoves = new Map(), cohortOpenings = new Map(), descriptors = new Map(), semanticIds = new Map();
  const byNode = new Map(NODE_BUDGETS.map(nodes => [nodes, { nodes, openingIds: [], pairs: [], stages: [], progress: {
    attempts: 0, duplicateCopiesIgnored: 0, finalizedGames: 0, completedGames: 0, pairedGames: 0, completePairs: 0 }, scheduledGames: 0 }]));
  for (const stage of stages) {
    if (!stage || typeof stage.key !== 'string' || !stage.key || keys.has(stage.key)
      || !NODE_BUDGETS.includes(stage.nodes) || stage.config?.engine?.nodes !== stage.nodes
      || stage.config?.repetitions !== 1 || !Array.isArray(stage.metadata?.comparisons)) throw new Error('Invalid, duplicate or changed panel stage identity.');
    keys.add(stage.key);
    validateComparisons(stage.metadata, roster);
    const validated = createV17Report({ experiment: stage.key, config: stage.config, metadata: stage.metadata,
      records: stage.records, manifest: stage.manifest });
    const node = byNode.get(stage.nodes), seen = cohortOpenings.get(stage.nodes) || new Set();
    for (const opening of stage.config.openings) {
      if (seen.has(opening.id)) throw new Error('Panel opening batches overlap within a node budget.');
      if (openingMoves.has(opening.id) && !isDeepStrictEqual(openingMoves.get(opening.id), opening.moves)) throw new Error('Panel node conditions change a shared opening prefix.');
      openingMoves.set(opening.id, opening.moves); seen.add(opening.id); node.openingIds.push(opening.id);
    }
    cohortOpenings.set(stage.nodes, seen);
    for (const comparison of stage.metadata.comparisons) {
      const semantic = comparison.kind === 'head' ? pairKey(comparison.designA, comparison.designB) : `baseline:${comparison.designA}`;
      if (semanticIds.has(semantic) && semanticIds.get(semantic) !== comparison.id) throw new Error('Panel batches rename a shared comparison identity.');
      semanticIds.set(semantic, comparison.id);
      const previous = descriptors.get(comparison.id);
      if (previous && !isDeepStrictEqual(previous, comparison)) throw new Error('Panel batches change a comparison declaration.');
      descriptors.set(comparison.id, comparison);
    }
    const latest = new Map();
    for (const record of stage.records) if (!latest.has(record.id) || record.attempt > latest.get(record.id).attempt) latest.set(record.id, record);
    const pairs = new Map();
    for (const record of latest.values()) {
      const pair = pairs.get(record.pairId) || []; pair.push(record); pairs.set(record.pairId, pair);
    }
    const metadata = new Map(stage.metadata.comparisons.map(row => [row.id, row]));
    for (const records of pairs.values()) if (records.length === 2 && records.every(record => record.status === 'completed') && records[0].aColor !== records[1].aColor) {
      const comparison = metadata.get(records[0].comparisonId);
      node.pairs.push({ ...comparison, stageKey: stage.key, openingId: records[0].openingId, records,
        score: average(records.map(gameScore)) });
    }
    node.stages.push({ key: stage.key, batch: stage.batch, runId: stage.manifest?.runId || null,
      scheduledGames: validated.scheduledGames, progress: validated.progress });
    node.scheduledGames += validated.scheduledGames;
    for (const field of Object.keys(node.progress)) node.progress[field] += validated.progress[field];
  }
  return { byNode, descriptors: [...descriptors.values()] };
}

function nodeReport(node, roster, targetOpenings) {
  const openingIds = [...node.openingIds].sort(), expected = targetOpenings ?? openingIds.length;
  if (expected < openingIds.length) throw new Error('The requested opening total is below an existing node cohort.');
  const index = new Map();
  for (const pair of node.pairs) {
    const key = pair.kind === 'head' ? pairKey(pair.aKey, pair.bKey) : `baseline:${pair.aKey}`;
    const rows = index.get(key) || []; rows.push(pair); index.set(key, rows);
  }
  const summarize = (row, opponent, selectedOpenings) => {
    const pairs = index.get(pairKey(row.key, opponent.key)) || [];
    const selected = selectedOpenings ? pairs.filter(pair => selectedOpenings.includes(pair.openingId)) : pairs;
    const inverted = selected.length ? selected[0].aKey !== row.key : false;
    return { key: opponent.key, label: opponent.label, ...summarizePairs(selected, `${node.nodes}:${pairKey(row.key, opponent.key)}:${selectedOpenings?.join(',') || 'all'}`, inverted) };
  };
  const rows = roster.map(row => {
    const opponents = roster.filter(other => other.key !== row.key);
    const shared = openingIds.filter(opening => opponents.every(other => (index.get(pairKey(row.key, other.key)) || []).some(pair => pair.openingId === opening)));
    const opponentSummaries = opponents.map(other => summarize(row, other, shared));
    const included = opponents.flatMap(other => (index.get(pairKey(row.key, other.key)) || [])
      .filter(pair => shared.includes(pair.openingId)).flatMap(pair => entriesFor([pair], pair.aKey !== row.key)));
    const cases = shared.map(opening => ({ openingId: opening, score: average(opponents.map(other => summarize(row, other, [opening]).score)) }));
    const ordinary = summarizePairs(index.get(`baseline:${row.key}`) || [], `${node.nodes}:baseline:${row.key}`);
    return { ...row, overall: { ...tally(included), score: average(cases.map(item => item.score)), opponents: opponentSummaries, cases,
      conditionalRange: conditionalRange(cases.map(item => item.score), `${node.nodes}:overall:${row.key}`),
      openingCoverage: { shared: shared.length, total: expected, openingIds: shared },
      status: shared.length === expected && expected ? 'complete' : shared.length ? 'partial shared cases' : 'pending shared cases' },
      ordinary, cells: roster.map(other => other.key === row.key ? { key: other.key, label: other.label, score: null, games: 0, self: true } : summarize(row, other)) };
  });
  const cells = roster.length * (roster.length - 1) / 2 + roster.length;
  return { nodes: node.nodes, declaredOpenings: openingIds.length, targetOpenings: expected, openingIds,
    stages: node.stages, scheduledGames: expected * cells * 2, declaredScheduledGames: node.scheduledGames, progress: node.progress,
    matrix: { perspective: 'Row upgrade score against column upgrade; draws count half.', columns: roster.map(({ key, label }) => ({ key, label })), rows } };
}

function sensitivity(byNode, descriptors) {
  return descriptors.filter(row => row.kind === 'head').map(comparison => {
    const perNode = NODE_BUDGETS.map(nodes => {
      const pairs = byNode.get(nodes).pairs.filter(pair => pair.id === comparison.id);
      return { nodes, index: new Map(pairs.map(pair => [pair.openingId, pair])) };
    });
    const common = [...perNode[0].index.keys()].filter(opening => perNode.every(condition => condition.index.has(opening))).sort();
    const conditions = perNode.map(condition => ({ nodes: condition.nodes,
      ...summarizePairs(common.map(opening => condition.index.get(opening)), `matched:${comparison.id}:${condition.nodes}`) }));
    const differences = common.map(opening => perNode[2].index.get(opening).score - perNode[0].index.get(opening).score);
    return { ...comparison, openingIds: common, matchedOpenings: common.length, conditions,
      delta20kTo80k: average(differences), conditionalRange: conditionalRange(differences, `delta:${comparison.id}`) };
  });
}

function createPanelReport({ manifest = {}, stages = [], roster } = {}) {
  const pieces = checkRoster(roster);
  const target = manifest.targetOpenings;
  if (target !== undefined && (!Number.isSafeInteger(target) || target < 1 || target > 64)) throw new Error('Invalid requested opening total.');
  const { byNode, descriptors } = readStages(stages, pieces);
  const nodes = NODE_BUDGETS.map(budget => nodeReport(byNode.get(budget), pieces, target));
  return { schemaVersion: 1, format: FORMAT, runId: manifest.runId || null, roster: pieces,
    nodes, sensitivity: sensitivity(byNode, descriptors),
    progress: { stages: stages.length, scheduledGames: nodes.reduce((sum, node) => sum + node.scheduledGames, 0),
      finalizedGames: nodes.reduce((sum, node) => sum + node.progress.finalizedGames, 0),
      pairedGames: nodes.reduce((sum, node) => sum + node.progress.pairedGames, 0) },
    notes: [
      'Each matrix entry uses complete color-swapped pairs. Errors, truncations and unpaired completions are unscored.',
      'Overall scores equally weight the other roster upgrades on shared fully scored opening cases. Ordinary-army anchors do not enter those averages.',
      'Search sensitivity uses only opening cases scored at all three node budgets; its delta is the A-score change from 20,000 to 80,000 nodes.',
      'Ranges resample whole declared opening cases, retaining both colors and paired search conditions. Related openings, fixed search priors and engine bias are outside these conditional ranges.',
      'Outcomes measure upgrade-army matchups under this protocol. They do not establish an intrinsic piece Elo or a normal-chess engine Elo.',
    ] };
}

const rangeText = range => range?.available ? `${percent(range.lower)}–${percent(range.upper)}` : 'pending';
const points = value => value === null ? '—' : `${value >= 0 ? '+' : ''}${(100 * value).toFixed(2)}`;
function renderPanelReport(report) {
  const lines = ['# Level-three roster: matchups and search sensitivity', '',
    `Finalized games: ${report.progress.finalizedGames}/${report.progress.scheduledGames}; scored paired games: ${report.progress.pairedGames}.`, ''];
  for (const node of report.nodes) {
    lines.push(`## ${node.nodes.toLocaleString('en-US')} nodes per move`, '',
      `Declared opening cases: ${node.declaredOpenings}; requested total: ${node.targetOpenings}. Finalized games: ${node.progress.finalizedGames}/${node.scheduledGames}.`, '',
      '| Row upgrade / opponent | ' + node.matrix.columns.map(row => escape(row.label)).join(' | ') + ' | Overall (shared cases) | Ordinary army |',
      '| --- | ' + node.matrix.columns.map(() => '---:').join(' | ') + ' | ---: | ---: |',
      ...node.matrix.rows.map(row => `| ${escape(row.label)} | ${row.cells.map(cell => percent(cell.score)).join(' | ')} | ${percent(row.overall.score)} (${row.overall.openingCoverage.shared}/${row.overall.openingCoverage.total}) | ${percent(row.ordinary.score)} |`), '',
      '| Upgrade | Overall W / D / L | Overall score | Conditional 95% range | White score | Black score | Ordinary W / D / L | Ordinary score |',
      '| --- | :--- | ---: | :--- | ---: | ---: | :--- | ---: |',
      ...node.matrix.rows.map(row => `| ${escape(row.label)} | ${row.overall.wins} / ${row.overall.draws} / ${row.overall.losses} | ${percent(row.overall.score)} | ${rangeText(row.overall.conditionalRange)} | ${percent(row.overall.physicalColors[0].score)} | ${percent(row.overall.physicalColors[1].score)} | ${row.ordinary.wins} / ${row.ordinary.draws} / ${row.ordinary.losses} | ${percent(row.ordinary.score)} |`), '',
      '| A versus B | Paired games | A W / D / L | A score | Conditional 95% range |',
      '| --- | ---: | :--- | ---: | :--- |');
    const emitted = new Set();
    for (const row of node.matrix.rows) {
      for (const cell of row.cells) if (!cell.self && !emitted.has(pairKey(row.key, cell.key))) {
        emitted.add(pairKey(row.key, cell.key));
        lines.push(`| ${escape(row.label)} / ${escape(cell.label)} | ${cell.games} | ${cell.wins} / ${cell.draws} / ${cell.losses} | ${percent(cell.score)} | ${rangeText(cell.conditionalRange)} |`);
      }
    }
    lines.push('');
  }
  lines.push('## Search sensitivity on shared cases', '',
    '| A versus B | Matched openings | A score: 20k | 40k | 80k | 80k minus 20k (pp) | Conditional 95% delta (pp) |',
    '| --- | ---: | ---: | ---: | ---: | ---: | :--- |',
    ...report.sensitivity.map(row => `| ${escape(row.aLabel)} / ${escape(row.bLabel)} | ${row.matchedOpenings} | ${row.conditions.map(condition => percent(condition.score)).join(' | ')} | ${points(row.delta20kTo80k)} | ${row.conditionalRange.available ? `${points(row.conditionalRange.lower)}–${points(row.conditionalRange.upper)}` : 'pending'} |`), '',
    ...report.notes.map(note => `- ${note}`), '');
  return lines.join('\n');
}

module.exports = { FORMAT, NODE_BUDGETS, conditionalRange, createPanelReport, renderPanelReport };
