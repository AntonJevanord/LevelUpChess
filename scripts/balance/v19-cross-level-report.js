'use strict';

// Outcomes only. Stage readers retain original journals; this layer validates
// their declared schedules/profiles and never searches, replays moves or fits
// individual-piece prices/Elo from equal-budget team results.
const { isDeepStrictEqual } = require('node:util');
const { createDesignRegistry } = require('./design-registry');
const { compileDesignProfile } = require('./design-profile');
const { makeSchedule } = require('./plan');
const { createV17Report } = require('./v17-report');
const { conditionalRange } = require('./level3-panel-report');
const { buildOpeningEvaluationReport } = require('./opening-evaluation-report');

const FORMAT = 'levelup-v19-cross-level-report-001';
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const scoreA = row => row.result === '1/2-1/2' ? 0.5 : Number((row.result === '1-0') === (row.aColor === 'w'));
const percent = value => value === null || value === undefined ? '—' : `${(value * 100).toFixed(2)}%`;
const md = value => String(value).replace(/[\r\n]/g, ' ').replace(/\|/g, '\\|');
const csv = value => /[",\r\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value);
const LABEL = row => row.label || row.name || row.key || row.id;
const EMPTY_STATUS = () => ({ completed: 0, truncated: 0, aborted: 0, error: 0 });

function entries(pairs, inverted) {
  return pairs.flatMap(pair => pair.records.map(record => ({
    value: inverted ? 1 - scoreA(record) : scoreA(record),
    color: inverted ? record.aColor === 'w' ? 'b' : 'w' : record.aColor,
  })));
}
function tally(values) {
  return { games: values.length, wins: values.filter(value => value === 1).length,
    draws: values.filter(value => value === 0.5).length, losses: values.filter(value => value === 0).length,
    observedScore: average(values) };
}
/** Every opponent/cell has equal weight, rather than every game giving faster
 * workers more influence. Primary means wait for coverage of every declared
 * opponent. A separate available mean and strict common-case audit remain
 * useful while a run is partial or individual pairs were truncated. */
function summarizeCells(cells, openingIds, salt, inverted = false) {
  const represented = cells.filter(cell => cell.pairs.length), allPairs = cells.flatMap(cell => cell.pairs);
  const allEntries = entries(allPairs, inverted), each = represented.map(cell => average(entries(cell.pairs, inverted).map(row => row.value)));
  const availableScore = average(each), completeCoverage = cells.length > 0 && represented.length === cells.length;
  const shared = openingIds.filter(id => cells.length && cells.every(cell => cell.pairs.some(pair => pair.openingId === id)));
  const sharedPairs = allPairs.filter(pair => shared.includes(pair.openingId));
  const sharedValues = shared.map(id => average(cells.map(cell => average(entries(cell.pairs.filter(pair => pair.openingId === id), inverted).map(row => row.value)))));
  const sharedEntries = entries(sharedPairs, inverted);
  return { ...tally(allEntries.map(row => row.value)), score: completeCoverage ? availableScore : null,
    availableScore, completePairs: allPairs.length,
    opponentCoverage: { represented: represented.length, total: cells.length },
    pairCoverage: { complete: allPairs.length, scheduled: cells.length * openingIds.length },
    physicalColors: ['w', 'b'].map(color => {
      const values = allEntries.filter(row => row.color === color).map(row => row.value);
      const means = represented.map(cell => average(entries(cell.pairs, inverted).filter(row => row.color === color).map(row => row.value)));
      return { color, ...tally(values), score: completeCoverage ? average(means) : null, availableScore: average(means) };
    }),
    sharedOpenings: { score: average(sharedValues), openingIds: shared, total: openingIds.length,
      ...tally(sharedEntries.map(row => row.value)),
      conditionalRange: conditionalRange(sharedValues, salt) },
    status: !allPairs.length ? 'no-complete-pairs' : !completeCoverage ? 'partial-opponent-coverage'
      : allPairs.length === cells.length * openingIds.length ? 'complete' : 'partial-opening-coverage' };
}

/** The existing diagnostic helper groups within its input and repeatedly scans
 * its paired values. Keep independent profiles in bounded strata before
 * merging their disjoint contexts; never change the pinned helper or average
 * centipawns across different custom-piece mappings/evaluation policies. */
function openingDiagnosticsByProfile(records, options) {
  const strata = new Map();
  for (const record of records) {
    const key = record.profileHash || 'unrecorded-profile';
    if (!strata.has(key)) strata.set(key, []);
    strata.get(key).push(record);
  }
  if (!strata.size) return buildOpeningEvaluationReport([], options);
  const chunks = [...strata.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([profileHash, rows]) => ({ profileHash, value: buildOpeningEvaluationReport(rows, options) }));
  const first = chunks[0].value, counts = {}, unavailableReasons = {};
  for (const { value } of chunks) {
    for (const [key, count] of Object.entries(value.counts)) counts[key] = (counts[key] || 0) + count;
    for (const [key, count] of Object.entries(value.unavailableReasons)) unavailableReasons[key] = (unavailableReasons[key] || 0) + count;
  }
  const contexts = chunks.flatMap(({ value }) => value.contexts);
  if (new Set(contexts.map(row => row.contextId)).size !== contexts.length) throw new Error('Opening diagnostic profile strata overlap.');
  const grouped = key => chunks.flatMap(({ profileHash, value }) => value[key].map(row => ({ ...row, stratumProfileHash: profileHash })));
  return { ...first, counts, contexts, openings: grouped('openings'), comparisons: grouped('comparisons'), issues: grouped('issues'),
    unavailableReasons, stratifiedBy: 'recorded-profile-hash',
    notes: [...first.notes, 'Disjoint profile strata are summarized separately for bounded report work. Missing/invalid observations retain their stratum label; no exact-cp scores are combined across profiles.'] };
}

function createCrossLevelReport({ manifest, stages = [], planTools } = {}) {
  const plan = planTools || require('./v19-cross-level-plan');
  if (!manifest || manifest.study !== 'cross-level') throw new Error('A declared cross-level campaign is required.');
  const targetOpenings = manifest.targetOpenings || manifest.initialOpenings || 8;
  const scheduledGames = plan.expectedGames('cross-level', targetOpenings);
  const openingIds = plan.OPENINGS.slice(0, targetOpenings).map(row => row.id);
  const groups = plan.groups(), matches = plan.matches(), cells = new Map(matches.map(row => [row.id, { ...row, pairs: [], statusCounts: EMPTY_STATUS(), latestCounts: EMPTY_STATUS() }]));
  if (cells.size !== matches.length) throw new Error('Cross-level declaration repeats a cell.');
  const descriptors = new Map(plan.selectedStages(targetOpenings, manifest).map(row => [row.id, row]));
  const placementCases = new Map();
  for (const stage of descriptors.values()) {
    const key = `${stage.groupId}:${stage.placement}`;
    if (!placementCases.has(key)) placementCases.set(key, new Set());
    stage.openingIds.forEach(id => placementCases.get(key).add(id));
  }
  const placementIds = (groupId, placement) => [...(placementCases.get(`${groupId}:${placement}`) || [])];
  const seenStages = new Set(), seenPairs = new Set(), observations = [], sources = [];
  const progress = { scheduledGames, attempts: 0, duplicateCopiesIgnored: 0, finalizedGames: 0, completedGames: 0,
    pairedGames: 0, completePairs: 0, unpairedCompletedGames: 0, statusCounts: EMPTY_STATUS(), latestCounts: EMPTY_STATUS() };
  for (const stage of stages) {
    const descriptor = descriptors.get(stage.id);
    if (!descriptor || seenStages.has(stage.id)) throw new Error('Cross-level stages are repeated or outside the requested target.');
    seenStages.add(stage.id);
    for (const key of ['groupId', 'batchIndex', 'placement', 'nodes', 'games']) if (stage[key] !== descriptor[key]) throw new Error('Cross-level stage identity changed.');
    const declaration = plan.getStageDeclaration(stage.id);
    const registry = createDesignRegistry(declaration.config), profile = compileDesignProfile(registry, declaration.config.evaluation);
    const schedule = makeSchedule(declaration.config), stored = stage.manifest;
    if (!stored || !isDeepStrictEqual(stored.designRegistry, registry) || stored.designProfile?.hash !== profile.hash
      || stored.designProfile.registryHash !== registry.hash || stored.designProfile.variant !== profile.variant
      || stored.designProfile.config !== profile.config || !isDeepStrictEqual(stored.schedule, schedule)
      || descriptor.profileHash !== profile.hash || descriptor.registryHash !== registry.hash) throw new Error('Cross-level stage changed its semantic profile or schedule.');
    for (const key of ['engineSha256', 'runnerSha256', 'runnerSources', 'rulesBundleSha256']) {
      if (manifest.identity?.[key] !== undefined && !isDeepStrictEqual(stored[key], manifest.identity[key])) throw new Error('Cross-level stage runtime identity differs from its campaign.');
    }
    const checked = createV17Report({ ...declaration, records: stage.records, manifest: stored });
    for (const key of ['attempts', 'duplicateCopiesIgnored', 'finalizedGames', 'completedGames']) progress[key] += checked.progress[key];
    const metadata = new Map(declaration.metadata.comparisons.map(row => [row.id, row]));
    for (const comparison of checked.comparisons) {
      const cell = cells.get(comparison.id), described = metadata.get(comparison.id);
      if (!cell || !described || ['groupId', 'designL1', 'designL2', 'designL3', 'aKey', 'bKey'].some(key => cell[key] !== described[key])) throw new Error('Cross-level comparison changes its declared pieces.');
      for (const key of Object.keys(cell.statusCounts)) { cell.statusCounts[key] += comparison.statusCounts[key] || 0; progress.statusCounts[key] += comparison.statusCounts[key] || 0; }
    }
    const latest = new Map();
    for (const row of stage.records) {
      if (!latest.has(row.id) || row.attempt > latest.get(row.id).attempt) latest.set(row.id, row);
      const { moves, san, sans, startFen, finalFen, ...small } = row;
      observations.push({ ...small, id: `${stage.id}:${row.id}`, pairId: `${stage.id}:${row.pairId}` });
    }
    const pairs = new Map();
    for (const row of latest.values()) {
      const cell = cells.get(row.comparisonId); cell.latestCounts[row.status]++; progress.latestCounts[row.status]++;
      const pair = pairs.get(row.pairId) || []; pair.push(row); pairs.set(row.pairId, pair);
    }
    for (const rows of pairs.values()) {
      if (rows.length !== 2 || !rows.every(row => row.status === 'completed')) continue;
      const first = rows[0], key = JSON.stringify([first.comparisonId, first.openingId, first.repetition ?? 1]);
      if (seenPairs.has(key)) throw new Error('A cross-level opening/color pair appears in more than one stage.');
      seenPairs.add(key);
      cells.get(first.comparisonId).pairs.push({ openingId: first.openingId, placement: stage.placement,
        batchIndex: stage.batchIndex, records: rows.map(row => ({ result: row.result, aColor: row.aColor })) });
    }
    sources.push({ id: stage.id, groupId: stage.groupId, batchIndex: stage.batchIndex, placement: stage.placement,
      runId: stored.runId, profileHash: profile.hash, registryHash: registry.hash, openingIds: declaration.config.openings.map(row => row.id),
      engineSha256: stored.engineSha256 || null, finalizedGames: checked.progress.finalizedGames });
  }
  const internal = [...cells.values()];
  progress.completePairs = internal.reduce((sum, row) => sum + row.pairs.length, 0);
  progress.pairedGames = progress.completePairs * 2;
  progress.unpairedCompletedGames = progress.completedGames - progress.pairedGames;
  const groupCells = group => internal.filter(cell => cell.groupId === group.id);
  const bodies = Object.fromEntries([1, 2, 3].map(level => [level, plan.candidates(level)]));
  const byId = new Map(Object.values(bodies).flat().map(row => [row.id, row]));
  const summary = (selected, seed, inverted = false, ids = openingIds) => summarizeCells(selected, ids, `v19-cross:${targetOpenings}:${seed}`, inverted);
  const teamRows = groups.map(group => {
    const selected = groupCells(group), first = selected[0], l1 = byId.get(first.designL1), l2 = byId.get(first.designL2);
    return { id: group.id, key: group.id, label: `${LABEL(l1)} + ${LABEL(l2)}`, designL1: l1.id, designL2: l2.id,
      sameFamily: group.sameFamily, slots: group.slots, cohort: group.cohort, upgradePoints: 3,
      ...summary(selected, 'team:' + group.id), cellIds: selected.map(row => row.id),
      fixedReferences: summary(selected.filter(cell => byId.get(cell.designL3).reference), 'team-refs:' + group.id),
      placements: [] };
  });
  // Placement partitions are disjoint opening cases, not extra game weight.
  for (const row of teamRows) {
    const selected = internal.filter(cell => cell.groupId === row.id);
    const arms = [...new Set([...descriptors.values()].filter(stage => stage.groupId === row.id).map(stage => stage.placement))].sort();
    row.placements = arms.map(placement => {
      const ids = placementIds(row.id, placement);
      return { placement, openingIds: ids, ...summary(selected.map(cell => ({ ...cell, pairs: cell.pairs.filter(pair => pair.placement === placement) })), `team:${row.id}:placement:${placement}`, false, ids) };
    });
  }
  const level3Rows = bodies[3].map(body => ({ id: body.id, key: body.key, label: LABEL(body), reference: body.reference,
    ...summary(internal.filter(cell => cell.designL3 === body.id), 'l3:' + body.id, true) }));
  const componentRows = [1, 2].map(level => ({ level, interpretation: 'Descriptive performance of whole teams containing this design, not an isolated piece contribution.',
    rows: bodies[level].map(body => {
      const field = level === 1 ? 'designL1' : 'designL2', selected = internal.filter(cell => cell[field] === body.id);
      const partners = [...new Set(selected.map(cell => level === 1 ? cell.designL2 : cell.designL1))];
      const representedPartners = partners.filter(id => selected.some(cell => cell.pairs.length && (level === 1 ? cell.designL2 : cell.designL1) === id));
      return { id: body.id, key: body.key, label: LABEL(body), family: body.family,
        partnerCoverage: { represented: representedPartners.length, total: partners.length,
          excludedQueenPartners: bodies[level === 1 ? 2 : 1].length - partners.length },
        ...summary(selected, `component:${level}:${body.id}`) };
    }) }));
  const outcomeCells = internal.map(({ pairs, ...cell }) => ({ ...cell, available: true,
    ...summary([{ ...cell, pairs }], 'cell:' + cell.id),
    placements: [...new Set([...descriptors.values()].filter(stage => stage.groupId === cell.groupId).map(stage => stage.placement))].sort().map(placement => ({ placement,
      ...summary([{ ...cell, pairs: pairs.filter(pair => pair.placement === placement) }], `cell:${cell.id}:placement:${placement}`, false, placementIds(cell.groupId, placement)) })) }));
  const unavailable = plan.unavailable().map(row => ({ id: row.id, label: row.label || `${LABEL(row.l1)} + ${LABEL(row.l2)}`,
    designL1: row.l1.id, designL2: row.l2.id, reason: row.reason, opponents: row.opponents }));
  return { schemaVersion: 1, format: FORMAT, runId: manifest.runId || null, study: 'cross-level', nodes: 40000,
    selectionReceipt: manifest.selectionReceipt || plan.getSelectionReceipt?.() || null,
    selectionExclusions: manifest.policy?.exclusions || plan.SELECTION?.exclusions || [],
    targetOpenings, scheduledGames, counts: { level1: bodies[1].length, level2: bodies[2].length, level3: bodies[3].length,
      scheduledTeams: groups.length, scheduledCells: internal.length, unavailableTeams: unavailable.length,
      unavailableCells: unavailable.length * bodies[3].length, grantsIncluded: false },
    progress, overall: { team: summary(internal, 'overall'), level3: summary(internal, 'overall-l3', true) },
    teamRows, level3Rows, componentRows, cells: outcomeCells, unavailable,
    cohorts: ['same-family', 'different-family'].map(kind => ({ kind,
      ...summary(internal.filter(cell => Boolean(groups.find(group => group.id === cell.groupId)?.sameFamily) === (kind === 'same-family')), 'cohort:' + kind) })),
    openingEvaluations: openingDiagnosticsByProfile(observations, { engineSha256: manifest.identity?.engineSha256 }),
    sources,
    notes: [
      'A is the complete L1+L2 army; B is its L3 opponent. Every scored opening requires both physical colors. Draws count half a point.',
      'Primary scores give each scheduled opponent/cell equal weight and wait until every opponent is represented. Available scores cover represented opponents only and remain provisional. W/D/L counts describe the underlying scored games; unequal opening coverage can make the weighted score differ from the raw W/D/L ratio.',
      'Strict shared-opening scores and conditional whole-opening resampling ranges are retained separately. Related opening families, engine priors and placement context limit their interpretation; these are not independent-game confidence intervals.',
      'Latest valid attempts determine scoring. Truncations, errors, aborted games and unpaired completions do not become draws or losses. Historical errors remain counted as attempts.',
      'The three grant designs and all grant-containing games are excluded. Queen+queen teams are unavailable because a standard starting army has only one queen; no replacement queens or extra material are introduced.',
      'Component tables describe teams containing a design with their legal partners. They do not identify an individual piece Elo or material value. Equal-budget teams alone do not identify the cross-tier price scale.',
      'Stage schedules, rule profiles and recorded context are validated; moves are not independently replayed here. No engines, new games, source edits, old same-tier-game reuse or material fits occur in reporting.',
    ] };
}

function renderCrossLevelReport(report) {
  const status = report.progress, coverage = row => `${row.opponentCoverage.represented}/${row.opponentCoverage.total}`;
  const physical = (row, color) => row.physicalColors.find(entry => entry.color === color);
  const overview = rows => ['| Army/design | Scored games | W / D / L | Equal-opponent score | Available score | Opponents | White score | Black score | Shared cases |',
    '| --- | ---: | :--- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...rows.map(row => `| ${md(row.label)} | ${row.games} | ${row.wins} / ${row.draws} / ${row.losses} | ${percent(row.score)} | ${percent(row.availableScore)} | ${coverage(row)} | ${percent(physical(row, 'w').availableScore)} | ${percent(physical(row, 'b').availableScore)} | ${row.sharedOpenings.openingIds.length}/${row.sharedOpenings.total} |`)];
  const lines = ['# Version 19 cross-level panel', '',
    `L1+L2 teams versus one L3 purchase; ${report.targetOpenings} total openings, 40k nodes, both colors.`, '',
    `${report.counts.scheduledTeams} legal teams × ${report.counts.level3} L3 opponents = ${report.counts.scheduledCells} cells. ${report.counts.unavailableTeams} queen+queen teams (${report.counts.unavailableCells} cells) are unavailable. Grants are excluded.`, '',
    `Finalized games: ${status.finalizedGames}/${report.scheduledGames}; scored games: ${status.pairedGames}; complete pairs: ${status.completePairs}. ${status.unpairedCompletedGames} completed games lack a scored partner.`, '',
    `Latest truncations/errors/aborts: ${status.latestCounts.truncated}/${status.latestCounts.error}/${status.latestCounts.aborted}; historical error attempts: ${status.statusCounts.error}.`, '',
    `Overall L1+L2 score: ${percent(report.overall.team.score)}; available-cell score: ${percent(report.overall.team.availableScore)} (${coverage(report.overall.team)} cells). The L3 perspective uses the complementary result.`, '',
    'Equal-opponent scores give each scheduled opponent the same weight and require at least one complete pair against every opponent. Available scores and physical-color columns use represented opponents only: partial coverage is provisional. W/D/L counts retain all complete paired games.', '',
    '## L1+L2 teams', '', ...overview(report.teamRows), '',
    '## L3 opponents', '', ...overview(report.level3Rows), ''];
  for (const group of report.componentRows) lines.push(`## Teams containing each L${group.level} design`, '', group.interpretation, '',
    '| Design | Paired games | Equal-cell score | Available score | Legal partners | Represented partners | Excluded queen partners |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...group.rows.map(row => `| ${md(row.label)} | ${row.games} | ${percent(row.score)} | ${percent(row.availableScore)} | ${row.partnerCoverage.total} | ${row.partnerCoverage.represented} | ${row.partnerCoverage.excludedQueenPartners} |`), '');
  lines.push('## Unavailable teams', '', '| L1 + L2 team | Reason |', '| --- | --- |',
    ...report.unavailable.map(row => `| ${md(row.label || `${row.l1?.label || row.designL1 || row.id} + ${row.l2?.label || row.designL2 || ''}`)} | ${md(row.reason)} |`), '',
    '## Selection exclusions', '',
    ...report.selectionExclusions.map(row => `- ${row.id ? '`' + md(row.id) + '`' : md(row.scope)}: ${md(row.reason)}`), '',
    '## Opening diagnostics', '',
    `${report.openingEvaluations.counts.recorded}/${report.openingEvaluations.counts.latestGames} latest games retain a first-search diagnostic: ${report.openingEvaluations.counts.exactCp} exact cp, ${report.openingEvaluations.counts.boundedCp} bounded cp, ${report.openingEvaluations.counts.mate} mate and ${report.openingEvaluations.counts.missing} missing. Full context-stratified diagnostics remain in the JSON report; no new searches occur.`, '',
    '## Interpretation', '', ...report.notes.map(note => `- ${note}`), '');
  return lines.join('\n');
}
function renderCrossLevelMatrix(report) {
  const opponents = report.level3Rows, byId = new Map(report.cells.map(row => [row.id, row]));
  return ['# L1+L2 versus L3 matchup matrix', '', 'Cells are the L1+L2 team score using complete color pairs; draws count half. Overall gives every represented L3 opponent equal weight and waits for coverage of all opponents. Missing cells remain unscored.', '',
    '| L1+L2 team | ' + opponents.map(row => md(row.label)).join(' | ') + ' | Overall |',
    '| --- | ' + opponents.map(() => '---:').join(' | ') + ' | ---: |',
    ...report.teamRows.map(team => {
      const cells = team.cellIds.map(id => byId.get(id));
      return `| ${md(team.label)} | ` + opponents.map(opponent => percent(cells.find(cell => cell.designL3 === opponent.id)?.score)).join(' | ') + ` | ${percent(team.score)} |`;
    }), ...report.unavailable.map(row => `| ${md(row.label || row.id)} | ` + opponents.map(() => 'unavailable').join(' | ') + ' | unavailable |'), ''].join('\n');
}
function renderCrossLevelCsv(report) {
  const head = ['cell_id', 'team', 'level1_id', 'level2_id', 'level3_id', 'level3_label', 'available', 'reason', 'paired_games', 'team_wins', 'draws', 'team_losses', 'team_score', 'team_white_score', 'team_black_score', 'complete_pairs', 'shared_openings'];
  const rows = report.cells.map(cell => [cell.id, cell.aLabel, cell.designL1, cell.designL2, cell.designL3, cell.bLabel, true, '', cell.games, cell.wins, cell.draws, cell.losses,
    cell.score ?? '', cell.physicalColors[0].availableScore ?? '', cell.physicalColors[1].availableScore ?? '', cell.completePairs, cell.sharedOpenings.openingIds.length]);
  for (const team of report.unavailable) for (const opponent of report.level3Rows) rows.push(['', team.label || team.id, team.designL1 || team.l1?.id || '', team.designL2 || team.l2?.id || '', opponent.id, opponent.label, false, team.reason, 0, 0, 0, 0, '', '', '', 0, 0]);
  return [head, ...rows].map(row => row.map(csv).join(',')).join('\r\n') + '\r\n';
}

module.exports = { FORMAT, summarizeCells, openingDiagnosticsByProfile, createCrossLevelReport, renderCrossLevelReport, renderCrossLevelMatrix, renderCrossLevelCsv,
  reportStudy: (manifest, stages, planTools) => createCrossLevelReport({ manifest, stages, planTools }), renderReport: renderCrossLevelReport };
