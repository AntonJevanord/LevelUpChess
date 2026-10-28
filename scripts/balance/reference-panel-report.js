'use strict';

// A read-only outcome panel. Every source retains its original profile and
// opening context; purchase counts are never recoded as individual pieces.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { getDesign } = require('../../src/design-catalog');
const { getOfficialReferences } = require('./official-references');
const { combineMobilityOutcomes } = require('./v17-mobility-review');
const { loadScreenEvidence } = require('./v17-screen-evidence');
const { getReferencePanelRoster, ROSTER_SHA256, CAPS, BUDGETS } = require('./reference-panel-plan');
const { loadExperiment } = require('./v17-plan');
const { createV17Report } = require('./v17-report');
const { validateManifest } = require('../version17-balance');

const FORMAT = 'levelup-reference-panel-report';
const INPUTS = Object.freeze({ gap: 'panel-gap', singles: 'panel-level1', pairs: 'panel-level1-pairs' });
const RESULTS = path.resolve(__dirname, '../../experiments/balance/results');
const HISTORICAL_FILE = 'reference-material-001.audit.json';
const HISTORICAL_SHA256 = '58adb170a150d58ff7780b7d229befb0e4aaee1a199d40a62da0920e75192eba';
const TRIPLE_KEYS = ['two-step-pawns', 'king-step-pawns', 'mobile-forward-grants'];
const REFERENCE_KEYS = ['vanguard', 'unicorn', 'cruisader', 'amazon'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const pairKey = (a, b) => JSON.stringify([a, b].sort());
const pct = score => score === null ? 'pending' : `${(100 * score).toFixed(2)}%`;
const md = value => String(value).replace(/[\r\n]/g, ' ').replace(/\|/g, '\\|');
const csv = value => /[",\r\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value);
const scoreForA = record => record.result === '1/2-1/2' ? 0.5 : Number((record.result === '1-0') === (record.aColor === 'w'));

/** Only scored opposite-color pairs contribute. Truncations and their completed
 * partners stay visible but never become draws, losses or new scheduled games. */
function summarizeArchivedPairs(records) {
  assert.equal(new Set(records.map(record => record.id)).size, records.length, 'Archived source repeats a game identity.');
  const pairs = new Map();
  for (const record of records) {
    const pair = pairs.get(record.pairId) || [];
    pair.push(record); pairs.set(record.pairId, pair);
  }
  const selected = [];
  let partialPairs = 0;
  for (const pair of pairs.values()) {
    assert.equal(pair.length, 2, 'Archived source is missing a scheduled color partner.');
    assert.equal(new Set(pair.map(record => record.aColor)).size, 2, 'Archived pair repeats a physical color.');
    for (const field of ['comparisonId', 'openingId', 'designA', 'designB']) {
      assert.equal(pair[0][field], pair[1][field], 'Archived pair changed its matchup or opening.');
    }
    if (pair.every(record => record.status === 'completed')) selected.push(...pair);
    else partialPairs++;
  }
  const scores = selected.map(scoreForA);
  const wins = scores.filter(score => score === 1).length, draws = scores.filter(score => score === 0.5).length;
  return { pairedGames: scores.length, completePairs: scores.length / 2, partialPairs,
    openings: new Set(selected.map(record => record.openingId)).size,
    wins, draws, losses: scores.length - wins - draws,
    score: scores.length ? (wins + draws / 2) / scores.length : null,
    statusCounts: { completed: records.filter(record => record.status === 'completed').length,
      truncated: records.filter(record => record.status === 'truncated').length, aborted: 0, error: 0, unknown: 0 } };
}

/** Read and hash original historical inputs, validate their original contexts,
 * and reproduce only outcome counts. No legal replay or material fit runs. */
function loadHistoricalReferenceEvidence({ read = file => fs.readFileSync(file) } = {}) {
  const bytes = read(path.join(RESULTS, HISTORICAL_FILE));
  assert.equal(sha(bytes), HISTORICAL_SHA256, 'Historical reference outcome audit changed.');
  const audited = JSON.parse(bytes.toString('utf8'));
  const decoded = Object.fromEntries(Object.entries(audited.inputs).map(([name, pin]) => {
    const archived = read(path.join(RESULTS, name));
    assert.equal(sha(archived), pin.archivedSha256, `Historical source changed: ${name}.`);
    const original = name.endsWith('.gz') ? gunzipSync(archived) : archived;
    assert.equal(original.length, pin.decodedBytes, `Historical byte count changed: ${name}.`);
    assert.equal(sha(original), pin.decodedSha256, `Historical decoded bytes changed: ${name}.`);
    return [name, original];
  }));
  const { sourceDeclarations } = require('../../experiments/balance/results/reference-material-001.audit.cjs');
  const { sources, compatibility } = sourceDeclarations(decoded);
  const roster = getOfficialReferences().roster, byId = new Map(roster.map(reference => [reference.id, reference]));
  const comparisons = [], receipts = [];
  let archivedGames = 0;
  for (const source of sources) {
    const selected = source.records.filter(record => record.kind === 'head'
      && byId.has(record.designA) && byId.has(record.designB) && record.designA !== record.designB);
    archivedGames += selected.length;
    const groups = new Map();
    for (const record of selected) {
      assert.equal(record.profileHash, source.profile.hash, 'Historical record profile changed.');
      assert.equal(record.registryHash, source.profile.registryHash, 'Historical record registry changed.');
      assert.equal(record.variant, source.profile.variant, 'Historical record variant changed.');
      assert.equal(record.registryReference, 'collection.json#plan.registry');
      assert.equal(record.attempt, 1, 'Historical outcomes contain a new attempt.');
      assert.ok(['completed', 'truncated'].includes(record.status));
      if (record.status === 'completed') assert.ok(['1-0', '0-1', '1/2-1/2'].includes(record.result));
      else { assert.equal(record.result, '*'); assert.equal(record.reason, 'max-plies'); }
      for (const id of [record.designA, record.designB]) assert.deepEqual(
        source.profile.registry.definitions.find(definition => definition.id === id), getDesign(id), 'A historical reference definition changed.');
      const key = pairKey(record.designA, record.designB), group = groups.get(key) || [];
      group.push(record); groups.set(key, group);
    }
    const context = { id: source.id, kind: 'historical-level3', openings: 128,
      description: '128 historical book-derived position groups; distinct from the 32 short-prefix lower-tier cases.',
      engine: { nodes: 20000, threads: 1, hashMb: 32, maxPlies: 400 },
      engineSha256: source.identity.engineSha256, profileHash: source.profile.hash,
      registryHash: source.profile.registryHash,
      provenance: compatibility.find(item => item.id === source.id) };
    for (const records of groups.values()) {
      const first = records[0], summary = summarizeArchivedPairs(records);
      const expected = audited.matchups.find(row => row.designA === first.designA && row.designB === first.designB);
      assert.ok(expected, 'A historical outcome matchup is absent from its pinned audit.');
      for (const field of ['wins', 'draws', 'losses', 'score']) assert.equal(summary[field], expected[field]);
      assert.equal(summary.pairedGames, expected.games);
      comparisons.push({ aKey: byId.get(first.designA).key, bKey: byId.get(first.designB).key,
        ...summary, expectedPairs: 128, contexts: [context], source: 'archived-level3' });
    }
    receipts.push({ id: source.id, profileHash: source.profile.hash, registryHash: source.profile.registryHash,
      engineSha256: source.identity.engineSha256, selectedGames: selected.length,
      selectedRecordIdsSha256: sha(JSON.stringify(selected.map(record => record.id))) });
  }
  assert.equal(comparisons.length, 6);
  assert.equal(archivedGames, 1536);
  assert.equal(comparisons.reduce((sum, row) => sum + row.pairedGames, 0), 1534);
  return { comparisons, sources: { kind: 'archived-level3', audit: { file: HISTORICAL_FILE, sha256: HISTORICAL_SHA256 },
    inputs: audited.inputs, contexts: receipts,
    provenance: 'Original journals and archived compatibility descriptors are hash-checked; stored native-value evidence is checked. Outcomes reproduce the pinned audit without new move replay or fitting.' },
    archivedGames, pairedGames: 1534 };
}

function loadArchivedReferenceEvidence({ loadHistorical = loadHistoricalReferenceEvidence,
  loadMobility = combineMobilityOutcomes, loadLevel3Pairs = () => loadScreenEvidence('reference-2v2') } = {}) {
  const historical = loadHistorical(), mobility = loadMobility(), level3Pairs = loadLevel3Pairs();
  assert.equal(level3Pairs.experiment, 'reference-2v2');
  assert.equal(level3Pairs.report.progress.pairedGames, 240);
  assert.equal(level3Pairs.report.comparisons.length, 15);
  const referenceKeys = new Set(REFERENCE_KEYS), tripleKeys = new Set(TRIPLE_KEYS);
  const chosen = mobility.report.comparisons.filter(comparison => tripleKeys.has(comparison.aKey)
    && (referenceKeys.has(comparison.bKey) || tripleKeys.has(comparison.bKey)));
  assert.equal(chosen.length, 14, 'Archived lower-tier panel coverage changed.');
  const selectedIds = new Set(chosen.map(comparison => comparison.id));
  const selected = mobility.records.filter(record => selectedIds.has(record.comparisonId));
  assert.equal(selected.length, 896);
  const contributing = mobility.sourceGroups.flatMap(source => {
    const used = source.selected.filter(record => selectedIds.has(record.comparisonId));
    return used.length ? [{ experiment: source.key, source: source.analysis.source,
      profileHash: source.analysis.profile.hash, registryHash: source.analysis.profile.registryHash,
      selectedGames: used.length, selectedRecordIdsSha256: sha(JSON.stringify(used.map(record => record.id))) }] : [];
  });
  const comparisons = chosen.map(comparison => ({ ...comparison, source: 'archived-lower-tier',
    contexts: [{ id: 'mobility-thirty-two', kind: 'lower-tier-three-point-packages', openings: 32,
      description: '32 fixed short-prefix cases; three one-point purchases versus one three-point upgrade or three other one-point purchases.',
      engine: mobility.config.engine, engineSha256: null,
      provenance: 'Exact supplied journals match reconstructed declarations. Original run manifests and native preflight proofs were not uploaded.',
      sources: contributing.filter(source => source.selectedGames && mobility.sourceGroups.find(group => group.key === source.experiment)
        .selected.some(record => record.comparisonId === comparison.id)).map(source => source.experiment) }] }));
  const primaryRoster = [
    ...getOfficialReferences().roster.map(reference => ({ key: reference.key, label: reference.name,
      designId: reference.id, level: 3, purchases: 1, upgradePoints: 3 })),
    ...getReferencePanelRoster().level1.map((reference, index) => ({ key: TRIPLE_KEYS[index], label: `3 × ${reference.name}`,
      designId: reference.id, level: 1, purchases: 3, upgradePoints: 3 })),
  ];
  return { roster: primaryRoster, comparisons: [...historical.comparisons, ...comparisons], level3Pairs,
    sources: [historical.sources, { kind: 'archived-lower-tier', contexts: contributing,
      provenance: 'Raw source identities, profiles, schedules and immutable definitions checked by the archived mobility projection; no new moves or material fit.' }],
    counts: { recordedGames: historical.archivedGames + selected.length,
      pairedGames: historical.pairedGames + comparisons.reduce((sum, row) => sum + row.pairedGames, 0),
      truncatedGames: 1 + selected.filter(record => record.status === 'truncated').length } };
}

/** Input must be returned by readReportInput/checkedInput. Revalidate the
 * canonical declaration and all complete journal lines before using outcomes. */
function validatePanelInput(input, experiment) {
  const declaration = loadExperiment(experiment);
  assert.equal(input.declaration?.experiment, experiment, 'A reference-panel input has the wrong experiment.');
  assert.deepEqual(input.declaration.config, declaration.config, 'A reference-panel input changed its config.');
  assert.deepEqual(input.declaration.metadata, declaration.metadata, 'A reference-panel input changed its metadata.');
  validateManifest(input.manifest, declaration);
  assert.ok(input.source?.nativePreflight && /^[a-f0-9]{64}$/.test(input.source.nativePreflight.sha256 || ''),
    'A reference-panel input is missing its checked native-preflight receipt.');
  assert.equal(input.source.nativePreflight.engineSha256, input.manifest.engineSha256, 'Native-preflight engine identity changed.');
  assert.ok(/^[a-f0-9]{64}$/.test(input.source.completePrefixSha256 || ''), 'A reference-panel input is missing its journal-prefix hash.');
  assert.ok(Number.isSafeInteger(input.source.completePrefixBytes) && input.source.completePrefixBytes >= 0,
    'A reference-panel input has an invalid journal prefix.');
  assert.equal(input.recordsSha256, sha(JSON.stringify(input.records)),
    'A reference-panel input changed its observed outcome records.');
  const report = createV17Report({ ...declaration, records: input.records, manifest: input.manifest });
  return { ...input, declaration, report };
}

function matrixFor(roster, comparisons) {
  const lookup = new Map();
  for (const comparison of comparisons) {
    const key = pairKey(comparison.aKey, comparison.bKey);
    assert.ok(!lookup.has(key), 'A reference matchup would replace or duplicate existing evidence.');
    lookup.set(key, comparison);
  }
  return { columns: roster.map(({ key, label }) => ({ key, label })), rows: roster.map(row => ({ key: row.key, label: row.label,
    cells: roster.map(column => {
      if (row.key === column.key) return { columnKey: column.key, status: 'self', score: null, games: 0 };
      const comparison = lookup.get(pairKey(row.key, column.key));
      if (!comparison) return { columnKey: column.key, status: 'pending', score: null, games: 0 };
      const inverted = comparison.aKey !== row.key;
      return { columnKey: column.key, status: comparison.score === null ? 'pending' : 'scored',
        score: comparison.score === null ? null : inverted ? 1 - comparison.score : comparison.score,
        games: comparison.pairedGames, wins: inverted ? comparison.losses : comparison.wins,
        draws: comparison.draws, losses: inverted ? comparison.wins : comparison.losses,
        completePairs: comparison.completePairs, expectedPairs: comparison.expectedPairs,
        contextIds: comparison.contexts.map(context => context.id), inverted };
    }) })) };
}

function buildReferencePanel(inputs = {}, { loadArchive = loadArchivedReferenceEvidence } = {}) {
  assert.ok(inputs && typeof inputs === 'object' && !Array.isArray(inputs), 'Reference-panel inputs must be named run folders.');
  for (const name of Object.keys(inputs)) assert.ok(Object.hasOwn(INPUTS, name), `Unknown reference-panel input: ${name}.`);
  const roster = getReferencePanelRoster(), archived = loadArchive();
  const supplied = Object.fromEntries(Object.entries(inputs).map(([name, input]) => [name, validatePanelInput(input, INPUTS[name])]));
  const comparisons = [...archived.comparisons], sources = [...archived.sources], ownership = {};
  for (const [name, input] of Object.entries(supplied)) {
    ownership[name] = { directory: path.resolve(input.root), runId: input.manifest.runId,
      configHash: input.manifest.configHash, profileHash: input.manifest.designProfile.hash, engineSha256: input.manifest.engineSha256 };
    sources.push({ kind: name, ...ownership[name], journal: input.source, recordsSha256: input.recordsSha256,
      provenance: 'Original run manifest, archived INI and native preflight checked; complete journal prefix validated. This does not independently replay legal moves.' });
  }
  const gap = supplied.gap;
  const gapDeclaration = loadExperiment(INPUTS.gap);
  const gapReport = gap?.report || createV17Report({ ...gapDeclaration, records: [] });
  assert.equal(gapReport.comparisons.length, 1);
  const gapComparison = gapReport.comparisons[0];
  assert.deepEqual([gapComparison.aKey, gapComparison.bKey], ['king-step-pawns', 'mobile-forward-grants']);
  comparisons.push({ ...gapComparison, source: 'new-panel-gap', contexts: [{ id: 'panel-gap', kind: 'lower-tier-three-point-packages', openings: 32,
    description: '32 short-prefix cases for the previously missing King-step/Pawn-grant triple-package matchup only.',
    engine: gapDeclaration.config.engine, engineSha256: gap?.manifest.engineSha256 || null,
    runId: gap?.manifest.runId || null, provenance: gap ? 'Original run, archived rules and native preflight checked.' : 'Planned; no run supplied.' }] });
  assert.equal(comparisons.length, 21);
  const primary = { id: 'three-point', title: 'Equal three-point reference purchases', upgradePoints: 3,
    roster: archived.roster, comparisons, matrix: matrixFor(archived.roster, comparisons), overall: null,
    reasonNoOverall: 'Historical level-3 cells use 128 book-derived position groups; lower-tier cells use 32 short starts. No global row average or uncertainty estimate mixes these contexts.' };
  const sections = [primary];
  for (const name of ['singles', 'pairs']) {
    const declaration = loadExperiment(INPUTS[name]), report = supplied[name]?.report || createV17Report({ ...declaration, records: [] });
    const rowRoster = declaration.metadata.armies.map(army => ({ ...army, purchases: BUDGETS[INPUTS[name]] }));
    const detailed = report.comparisons.map(comparison => ({ ...comparison, source: `new-panel-${name}`,
      contexts: [{ id: INPUTS[name], kind: `level1-${name}`, openings: 32,
        description: `${BUDGETS[INPUTS[name]]} one-point purchase${BUDGETS[INPUTS[name]] === 1 ? '' : 's'} per side on the declared fixed home squares; 32 short-prefix cases.`,
        engine: declaration.config.engine, engineSha256: supplied[name]?.manifest.engineSha256 || null,
        runId: supplied[name]?.manifest.runId || null,
        provenance: supplied[name] ? 'Original run, archived rules and native preflight checked.' : 'Planned; no run supplied.' }] }));
    sections.push({ id: name, title: name === 'singles' ? 'Level-one references: one purchase per side' : 'Level-one teams: two purchases per side',
      upgradePoints: BUDGETS[INPUTS[name]], roster: rowRoster, comparisons: detailed,
      matrix: matrixFor(rowRoster, detailed), overall: report.overall, progress: report.progress });
  }
  // This completed six-point table stays separate from all one-, two- and
  // three-point sections. It adds evidence, never another scheduled campaign.
  const level3Pairs = archived.level3Pairs;
  assert.ok(level3Pairs?.report && level3Pairs.metadata, 'The archived level-three team table is required.');
  const membersByKey = new Map();
  for (const comparison of level3Pairs.metadata.comparisons) {
    const configured = level3Pairs.config.comparisons.find(item => item.id === comparison.id);
    for (const [key, army] of [[comparison.aKey, configured.armyA], [comparison.bKey, configured.armyB]]) {
      const members = Object.values(army.upgrades);
      assert.equal(members.length, 2);
      assert.ok(members.every(id => getDesign(id).level === 3));
      if (membersByKey.has(key)) assert.deepEqual(membersByKey.get(key), members);
      membersByKey.set(key, members);
    }
  }
  const pairRoster = level3Pairs.metadata.rows.map(row => ({ ...row, members: membersByKey.get(row.key), purchases: 2, upgradePoints: 6 }));
  const pairComparisons = level3Pairs.report.comparisons.map(comparison => ({ ...comparison,
    source: 'archived-level3-pairs', contexts: [{ id: 'archived-reference-2v2', kind: 'level3-two-purchase-teams', openings: 8,
      description: 'Eight original short-prefix cases; two distinct-family frozen level-three purchases per side, six points per army.',
      engine: level3Pairs.config.engine, engineSha256: null,
      provenance: 'Exact archived journal and uploaded report match reconstructed declarations. Original run manifests and native preflight proofs were not supplied.' }] }));
  sections.push({ id: 'level3-pairs', title: 'Level-three reference teams: two purchases per side',
    upgradePoints: 6, roster: pairRoster, comparisons: pairComparisons,
    matrix: matrixFor(pairRoster, pairComparisons), overall: level3Pairs.report.overall, progress: level3Pairs.report.progress });
  sources.push({ kind: 'archived-level3-pairs', source: level3Pairs.source, provenance: level3Pairs.provenance,
    declaration: level3Pairs.declaration,
    scope: '240 already completed six-point team games; separate from the primary three-point panel.' });
  return { schemaVersion: 1, format: FORMAT, roster, ownership, sources, sections,
    archivedCounts: archived.counts,
    archivedLevel3PairCounts: { recordedGames: 240, pairedGames: 240, truncatedGames: 0 },
    newRunProgress: Object.fromEntries(Object.entries(INPUTS).map(([name, experiment]) => {
      const report = name === 'gap' ? gapReport : sections.find(section => section.id === name);
      return [name, { experiment, scheduledGames: CAPS[experiment], upgradePoints: BUDGETS[experiment],
        supplied: Boolean(supplied[name]), ...(report.progress || {}) }];
    })),
    plannedNewGames: Object.values(CAPS).reduce((sum, games) => sum + games, 0),
    notes: [
      'The selected level-one panel contains Two-step pawn, King-step pawn and Pawn grant. Scout is excluded. The four version-16 official level-three references remain frozen.',
      'Three-point cells compare one level-three purchase or three copies of a level-one purchase. One-point duels and two-point teams are separate matrices; triple-package games never stand in for singles or doubles.',
      'Two-point teams face only other two-point teams. Repeated designs are included; no two-point-versus-level-three games or same-army controls are scheduled.',
      'The completed level-three 2v2 pilot is reused as its own six-point section: 240 games on eight starts. It adds no new games and is not pooled with lower-tier team results.',
      'Scores use complete color-swapped pairs only; draws count half a point. Pending cells are not assigned a score. Unscored truncations and their completed partners stay excluded.',
      'Historical level-three and newer lower-tier sources have different opening cohorts and provenance. Per-cell contexts and sample counts remain explicit; no global mixed-context Overall, confidence interval, material estimate or Elo is calculated.',
      'New run folders require their original manifest, archived rules and native preflight. Only the complete newline-terminated journal prefix is read; a torn suffix is ignored.',
      'Original lower-tier mobility uploads lacked run manifests and native preflight proofs. Reconstructed declaration compatibility does not attest to their original executable or native value tables.',
      'This command only builds reports. It never starts engines or games and never appends, replaces or continues source journals.',
    ] };
}

function renderReferencePanel(panel) {
  const lines = ['# Complete reference matchup panel', '',
    `Planned new games: **${panel.plannedNewGames}** (64 missing three-point bridge, 192 one-point duels, 960 two-point team games). Existing evidence is reused without replaying completed cells.`, '',
    `Archived evidence contributes **${panel.archivedCounts.pairedGames.toLocaleString('en-US')} scored games** to twenty existing three-point cells. Historical truncations remain unscored.`, '',
    `The separate six-point level-three team table reuses **${panel.archivedLevel3PairCounts.pairedGames} scored games**; its eight opening cases remain distinct from the lower-tier panels.`, '',
    '| New stage | Points per side | Finalized / scheduled | Scored pairs | Run folder supplied |',
    '| --- | ---: | ---: | ---: | --- |',
    ...Object.entries(panel.newRunProgress).map(([name, progress]) => `| ${name} | ${progress.upgradePoints} | ${progress.finalizedGames}/${progress.scheduledGames} | ${progress.completePairs} | ${progress.supplied ? 'yes' : 'no'} |`), '',
    ...panel.notes.map(note => `- ${note}`), ''];
  for (const section of panel.sections) {
    lines.push(`## ${section.title}`, '', `Purchase budget: **${section.upgradePoints} point${section.upgradePoints === 1 ? '' : 's'} per side**.`, '',
      '| Row against column | ' + section.matrix.columns.map(column => md(column.label)).join(' | ') + ' |',
      '| --- | ' + section.matrix.columns.map(() => '---:').join(' | ') + ' |');
    for (const row of section.matrix.rows) lines.push(`| ${md(row.label)} | ${row.cells.map(cell => cell.status === 'self' ? '—'
      : cell.score === null ? 'pending' : `${pct(cell.score)} (${cell.games})`).join(' | ')} |`);
    lines.push('');
    if (section.reasonNoOverall) lines.push(section.reasonNoOverall, '');
    if (section.overall) {
      lines.push('| Army | Overall | W / D / L | Included games | Shared cases |', '| --- | ---: | :--- | ---: | ---: |');
      for (const row of section.overall.rows) lines.push(`| ${md(row.label)} | ${pct(row.score)} | ${row.wins} / ${row.draws} / ${row.losses} | ${row.games} | ${row.openingCoverage.shared}/${row.openingCoverage.total} |`);
      lines.push('', 'Overall uses equal opponent means on shared cases with every scheduled color pair complete; cells may retain additional completed pairs.', '');
    }
    lines.push('| Matchup (first army perspective) | Scored games | W / D / L | Score | Pairs | Truncated / errors | Context |',
      '| --- | ---: | :--- | ---: | ---: | ---: | --- |');
    const labels = Object.fromEntries(section.roster.map(row => [row.key, row.label]));
    for (const row of section.comparisons) lines.push(`| ${md(labels[row.aKey])} / ${md(labels[row.bKey])} | ${row.pairedGames} | ${row.wins} / ${row.draws} / ${row.losses} | ${pct(row.score)} | ${row.completePairs}/${row.expectedPairs} | ${row.statusCounts.truncated} / ${row.statusCounts.error} | ${row.contexts.map(context => md(context.id)).join(', ')} |`);
    lines.push('');
  }
  lines.push('## Source contexts', '');
  const contexts = new Map(panel.sections.flatMap(section => section.comparisons.flatMap(comparison => comparison.contexts)).map(context => [context.id, context]));
  for (const context of contexts.values()) lines.push(`- **${md(context.id)}:** ${context.description}`);
  lines.push('', 'Use the JSON for original source/profile hashes, journal prefix hashes, native-preflight receipts and detailed coverage. No source game or historical truncation is changed by refreshing this panel.', '');
  return lines.join('\n');
}

function renderReferencePanelCsv(panel) {
  const headers = ['section', 'budget_per_side', 'army_a', 'army_b', 'paired_games', 'a_wins', 'draws', 'a_losses',
    'a_score', 'complete_pairs', 'expected_pairs', 'truncated_attempts', 'errors', 'source_contexts'];
  const rows = panel.sections.flatMap(section => section.comparisons.map(comparison => [section.id, section.upgradePoints,
    comparison.aKey, comparison.bKey, comparison.pairedGames, comparison.wins, comparison.draws, comparison.losses,
    comparison.score === null ? '' : comparison.score, comparison.completePairs, comparison.expectedPairs,
    comparison.statusCounts.truncated, comparison.statusCounts.error, comparison.contexts.map(context => context.id).join(';')]));
  return [headers, ...rows].map(row => row.map(csv).join(',')).join('\n') + '\n';
}

module.exports = { FORMAT, INPUTS, HISTORICAL_SHA256, summarizeArchivedPairs, loadHistoricalReferenceEvidence,
  loadArchivedReferenceEvidence, validatePanelInput, matrixFor, buildReferencePanel, renderReferencePanel, renderReferencePanelCsv };
