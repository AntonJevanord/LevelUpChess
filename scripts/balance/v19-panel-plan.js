'use strict';

// A new declaration and outcome layer. No historical runtime, profile or
// balance bundle is rewritten and this module never starts match games.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { Chess } = require('chess.js');
const { normalizeConfig, makeSchedule } = require('./plan');
const { getDesign } = require('../../src/design-catalog');
const { getTierRoster, getTier, getRosterReceipt, getValueReceipt, TIERS, VALUE_POLICY } = require('../../src/designs-v19-revised');
const { createDesignRegistry } = require('./design-registry');
const { compileDesignProfile } = require('./design-profile');
const { createV17Report } = require('./v17-report');
const { conditionalRange } = require('./level3-panel-report');

const ROOT = path.resolve(__dirname, '../..');
const FORMAT = 'levelup-v19-tier-panels';
const STUDIES = Object.freeze(['level1', 'level2', 'level3']);
const OPENING_TARGETS = Object.freeze([8, 16, 32, 64]);
const NODES = 40000;
const OPENINGS_FILE = 'experiments/balance/v19-panel-openings.json';
const OPENINGS_SHA256 = 'f664628bf44244db002a68b731ead706ca18c3d37c2db9de2d165430a98d6989';
const sha = value => createHash('sha256').update(value).digest('hex');
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const LEVEL = study => { if (!STUDIES.includes(study)) throw new Error('Choose level1, level2 or level3.'); return Number(study.at(-1)); };
const HOME = Object.freeze({ pawn: 'c2', knight: 'b1', bishop: 'c1', rook: 'a1', queen: 'd1' });

function verifyFrozenInputs(read = file => fs.readFileSync(path.join(ROOT, file))) {
  for (const receipt of [getRosterReceipt(), getValueReceipt(), ...VALUE_POLICY.sources]) {
    if (sha(read(receipt.file).toString('utf8').replace(/\r\n/g, '\n')) !== receipt.sha256) throw new Error(`The frozen version-19 declaration changed: ${receipt.file}.`);
  }
  const values = new Map(VALUE_POLICY.values.map(row => [row.id, row]));
  for (const tier of TIERS) for (const body of tier.bodies) {
    const definition = getDesign(body.id);
    for (const key of ['movement', 'family', 'level', 'roles', 'placement']) {
      if (!isDeepStrictEqual(definition?.[key], body[key])) throw new Error(`Accepted piece semantics changed: ${body.id} ${key}.`);
    }
    if (!isDeepStrictEqual(values.get(body.id)?.applied, body.prior)) throw new Error(`Accepted search prior changed: ${body.id}.`);
  }
}
verifyFrozenInputs();

function readBook() {
  const bytes = fs.readFileSync(path.join(ROOT, OPENINGS_FILE));
  if (sha(bytes.toString('utf8').replace(/\r\n/g, '\n')) !== OPENINGS_SHA256) throw new Error('The frozen version-19 opening book changed.');
  const book = JSON.parse(bytes);
  if (book.schemaVersion !== 1 || book.format !== 'levelup-v19-shared-opening-book' || book.families.length !== 8 || book.openings.length !== 64) throw new Error('Invalid shared opening-book declaration.');
  const sequences = new Set(), positions = new Set(), ids = new Set(), familyIds = new Set(book.families.map(row => row.id));
  for (const row of book.openings) {
    if (!familyIds.has(row.family) || ids.has(row.id) || sequences.has(row.moves.join(' '))) throw new Error('Opening identities, prefixes and families must be distinct and declared.');
    ids.add(row.id); sequences.add(row.moves.join(' '));
    const board = new Chess();
    for (const move of row.moves) {
      const made = board.move({ from: move.slice(0, 2), to: move.slice(2, 4), ...(move[4] ? { promotion: move[4] } : {}) });
      if (!made || made.captured || board.isGameOver()) throw new Error(`Opening ${row.id} fails material-preserving ordinary replay.`);
    }
    if (row.moves.length !== 8 || board.isCheck() || board.fen() !== row.ordinaryFen) throw new Error(`Opening ${row.id} changed its ordinary position or structural criterion.`);
    const position = board.fen().split(' ').slice(0, 4).join(' ');
    if (positions.has(position)) throw new Error(`Opening ${row.id} duplicates an ordinary position through transposition.`);
    positions.add(position);
  }
  for (let batch = 0; batch < 8; batch++) if (new Set(book.openings.slice(batch * 8, batch * 8 + 8).map(row => row.family)).size !== 8) throw new Error('Every eight-case batch must cover all eight structural families.');
  return freeze(book);
}
const BOOK = readBook();
const OPENINGS = freeze(BOOK.openings.map(({ id, moves }) => ({ id, moves })));

function army(id) {
  const design = getDesign(id);
  if (!design) throw new Error(`Missing accepted version-19 design: ${id}.`);
  return design.placement === 'reserve' ? { upgrades: {}, reserve: [{ id, count: 1 }] }
    : { upgrades: { [HOME[design.family]]: id } };
}
function candidates(study) {
  return freeze(getTierRoster(LEVEL(study)).map(row => ({ ...row, army: army(row.id), count: 1, upgradePoints: row.level })));
}
function references(study) { return candidates(study).filter(row => row.reference); }
function matches(study) {
  const bodies = candidates(study);
  return freeze(bodies.flatMap((a, index) => bodies.slice(index + 1).map(b => ({
    id: `${a.key}-v-${b.key}`, aKey: a.key, aLabel: a.label, bKey: b.key, bLabel: b.label,
    designA: a.id, designB: b.id, armyA: a.army, armyB: b.army,
  }))));
}
function getValueAudit(study) {
  const bodies = candidates(study);
  return freeze({ sources: [getRosterReceipt(), getValueReceipt()],
    policy: 'Retain each accepted body\'s tested MG/EG search prior and every frozen reference prior. The new panel changes opponent distribution, opening book and one-purchase L1 minor budgets; old outcomes are not pooled. Priors apply to all six native tables for both colors and are not purchase costs or fitted material estimates.',
    values: bodies.map(body => ({ id: body.id, movement: body.movement, applied: body.prior, anchorId: body.anchorId, source: body.priorSource })) });
}
function getBatchDeclaration(study, batchIndex, nodes = NODES) {
  const tier = LEVEL(study);
  if (nodes !== NODES || !Number.isInteger(batchIndex) || batchIndex < 0 || batchIndex > 7) throw new Error('Select one of the eight declared 40k-node panel batches.');
  const rows = candidates(study), cells = matches(study), audit = getValueAudit(study);
  const config = normalizeConfig({ schemaVersion: 3, name: `Version 19 level ${tier} panel: batch ${batchIndex + 1}`,
    seed: 20261117 + batchIndex, repetitions: 1, engine: { nodes, threads: 1, hashMb: 32, maxPlies: 400 },
    openings: OPENINGS.slice(batchIndex * 8, batchIndex * 8 + 8),
    comparisons: cells.map(cell => ({ id: cell.id, label: `${cell.aLabel} versus ${cell.bLabel}`,
      armyA: cell.armyA, armyB: cell.armyB, strengthA: { skill: 20 }, strengthB: { skill: 20 } })),
    evaluation: { pieceValues: Object.fromEntries(audit.values.map(row => [row.id, row.applied])) } });
  return freeze({ experiment: `v19-${study}-b${batchIndex + 1}-n${nodes}`, file: null, config,
    metadata: { kind: `v19-${study}-round-robin`, tier, nodes, batchIndex, scheduledGames: cells.length * 16, symmetric: true,
      rows: rows.map(({ key, label }) => ({ key, label })), columns: rows.map(({ key, label }) => ({ key, label })),
      comparisons: cells.map(({ armyA, armyB, ...cell }) => ({ ...cell, kind: 'head' })),
      referenceKeys: rows.filter(row => row.reference).map(row => row.key),
      referenceValueProfile: 'official-standalone', evaluationAudit: audit,
      question: 'Compare one accepted same-tier purchase per army in a complete paired-color round robin; report fixed-reference and whole-roster baskets separately.',
      openings: { file: OPENINGS_FILE, sha256: OPENINGS_SHA256, policy: BOOK.policy,
        cases: BOOK.openings.slice(batchIndex * 8, batchIndex * 8 + 8).map(({ id, family, label }) => ({ id, family, label })) } } });
}
function expectedGames(study, openings) {
  LEVEL(study);
  if (!OPENING_TARGETS.includes(openings)) throw new Error('Choose 8, 16, 32 or 64 total openings.');
  const count = candidates(study).length;
  return count * (count - 1) * openings;
}
function buildCampaignPlan({ study, jobs = 4 } = {}) {
  const tier = LEVEL(study);
  if (!Number.isInteger(jobs) || jobs < 1 || jobs > 16) throw new Error('Jobs must be 1 through 16.');
  const stages = Array.from({ length: 8 }, (_, batchIndex) => {
    const declaration = getBatchDeclaration(study, batchIndex), schedule = makeSchedule(declaration.config);
    const registry = createDesignRegistry(declaration.config), profile = compileDesignProfile(registry, declaration.config.evaluation);
    if (registry.definitions.length > 20) throw new Error('The tier panel exceeds twenty custom types.');
    const id = `batch-${String(batchIndex + 1).padStart(2, '0')}-n${NODES}`;
    return { id, directory: id, experiment: declaration.experiment, batchIndex, nodes: NODES, games: schedule.length,
      configSha256: sha(JSON.stringify(declaration.config)), scheduleSha256: sha(JSON.stringify(schedule)),
      profileHash: profile.hash, registryHash: registry.hash };
  });
  return freeze({ schemaVersion: 1, format: FORMAT, tier, study, jobs, games: expectedGames(study, 64), nodes: [NODES],
    openingTargets: OPENING_TARGETS, batchSize: 8, roster: candidates(study), references: references(study),
    rosterReceipt: getRosterReceipt(), evaluationAudit: getValueAudit(study),
    book: { file: OPENINGS_FILE, sha256: OPENINGS_SHA256, policy: BOOK.policy,
      openingIds: OPENINGS.map(row => row.id), families: BOOK.families }, stages });
}
function selectedStages(openings, plan) { expectedGames(plan.study, openings); return plan.stages.filter(stage => stage.batchIndex < openings / 8); }

async function checkExperiment(declaration, options = {}) {
  const proof = await require('../version17-balance').checkExperiment(declaration, options);
  const profile = compileDesignProfile(createDesignRegistry(declaration.config), declaration.config.evaluation);
  const probes = require('../../src/v19-revised-capability-probes').revisionProbes(profile);
  const { createMatchRules } = require('../../dist/balance-rules.cjs');
  const rules = await createMatchRules({ profile });
  let engine, directory;
  try {
    if (options.enginePath) {
      directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v19-probes-'));
      const file = path.join(directory, 'profile.ini'); fs.writeFileSync(file, profile.config);
      const { UciEngine } = require('./uci');
      engine = new UciEngine({ path: options.enginePath, variantPath: file, variant: profile.variant,
        options: { skill: 20, threads: 1, hash: 32 } }); await engine.start({ signal: options.signal });
    }
    for (const probe of probes) {
      if (options.signal?.aborted) throw new Error('Panel movement validation cancelled.');
      const board = rules.createBoard(probe.fen);
      try {
        const expected = [...board.moves()].sort();
        if (engine && !isDeepStrictEqual([...(await engine.perft({ fen: probe.fen, signal: options.signal }))].sort(), expected)) throw new Error(`Native rules disagree on ${probe.name}.`);
      } finally { board.dispose(); }
    }
    proof.panelMovementChecks = probes.length;
    proof.sharedBook = { file: OPENINGS_FILE, sha256: OPENINGS_SHA256, ordinaryPrefixes: 64, checkedBatch: declaration.metadata.batchIndex };
    options.onProgress?.(`Validation: ${probes.length} accepted-roster movement probes passed${engine ? ' native/WASM agreement' : ' browser rules'}.`);
    return proof;
  } finally { await engine?.close(); if (directory) fs.rmSync(directory, { recursive: true, force: true }); }
}

const gameScore = record => record.result === '1/2-1/2' ? 0.5 : Number((record.result === '1-0') === (record.aColor === 'w'));
function latestRecords(records) { const latest = new Map(); for (const row of records) if (!latest.has(row.id) || row.attempt > latest.get(row.id).attempt) latest.set(row.id, row); return [...latest.values()]; }
function completePairs(records, metadata) {
  const index = new Map(metadata.comparisons.map(row => [row.id, row])), grouped = new Map();
  for (const record of latestRecords(records)) { const group = grouped.get(record.pairId) || []; group.push(record); grouped.set(record.pairId, group); }
  return [...grouped.values()].filter(group => group.length === 2 && group.every(row => row.status === 'completed') && group[0].aColor !== group[1].aColor)
    .map(records => ({ ...index.get(records[0].comparisonId), openingId: records[0].openingId, records }));
}
function tally(entries) {
  const values = entries.map(({ record, inverted }) => inverted ? 1 - gameScore(record) : gameScore(record));
  return { games: values.length, wins: values.filter(value => value === 1).length, draws: values.filter(value => value === 0.5).length,
    losses: values.filter(value => value === 0).length, score: average(values) };
}
function summarize(row, opponents, pairs, openingIds, salt) {
  const perOpponent = opponents.map(opponent => ({ opponent, pairs: pairs.filter(pair => [pair.aKey, pair.bKey].includes(row.key) && [pair.aKey, pair.bKey].includes(opponent.key)) }));
  const shared = openingIds.filter(id => perOpponent.length && perOpponent.every(group => group.pairs.some(pair => pair.openingId === id)));
  const entries = perOpponent.flatMap(group => group.pairs.filter(pair => shared.includes(pair.openingId)).flatMap(pair => pair.records.map(record => ({ record, inverted: pair.aKey !== row.key }))));
  const cases = shared.map(id => average(perOpponent.map(group => average(group.pairs.filter(pair => pair.openingId === id).flatMap(pair => pair.records.map(record => pair.aKey === row.key ? gameScore(record) : 1 - gameScore(record)))))));
  const physicalColor = ({ record, inverted }) => inverted ? record.aColor === 'w' ? 'b' : 'w' : record.aColor;
  return { ...tally(entries), opponents: opponents.map(({ key, label }) => ({ key, label })),
    physicalColors: ['w', 'b'].map(color => ({ color, ...tally(entries.filter(entry => physicalColor(entry) === color)) })),
    conditionalRange: conditionalRange(cases, salt), openingCoverage: { shared: shared.length, total: openingIds.length, openingIds: shared } };
}
function rowsFor(study, records, declaration, openingIds, salt) {
  const roster = candidates(study), pairs = completePairs(records, declaration.metadata);
  return roster.map(row => ({ key: row.key, id: row.id, label: row.label, reference: row.reference, upgradePoints: row.level,
    allOpponents: summarize(row, roster.filter(other => other.key !== row.key), pairs, openingIds, `${salt}:all:${row.key}`),
    fixedReferences: summarize(row, roster.filter(other => other.reference && other.key !== row.key), pairs, openingIds, `${salt}:refs:${row.key}`),
    cells: roster.map(other => other.key === row.key ? { key: other.key, label: other.label, self: true, score: null, games: 0 }
      : { key: other.key, label: other.label, ...summarize(row, [other], pairs, openingIds, `${salt}:cell:${row.key}:${other.key}`) }) }));
}
function reportStudy(manifest, stages) {
  const study = manifest.study, targetOpenings = manifest.targetOpenings || manifest.initialOpenings || 16;
  expectedGames(study, targetOpenings);
  const seen = new Set();
  for (const stage of stages) {
    const key = `${stage.batchIndex}:${stage.nodes}`, declaration = getBatchDeclaration(study, stage.batchIndex, stage.nodes);
    if (seen.has(key) || stage.batchIndex >= targetOpenings / 8) throw new Error('Panel stages are repeated or outside the requested opening target.');
    seen.add(key);
    const registry = createDesignRegistry(declaration.config), profile = compileDesignProfile(registry, declaration.config.evaluation);
    if (!stage.manifest || !isDeepStrictEqual(stage.manifest.designRegistry, registry) || stage.manifest.designProfile.hash !== profile.hash
      || stage.manifest.designProfile.registryHash !== registry.hash || stage.manifest.designProfile.config !== profile.config
      || !isDeepStrictEqual(stage.manifest.schedule, makeSchedule(declaration.config))) throw new Error('Panel stage changed its archived semantic profile or schedule.');
    createV17Report({ ...declaration, records: stage.records, manifest: stage.manifest });
  }
  const declaration = getBatchDeclaration(study, 0), config = { ...declaration.config, openings: OPENINGS.slice(0, targetOpenings) };
  const records = stages.slice().sort((a, b) => a.batchIndex - b.batchIndex).flatMap(stage => stage.records.map(record => ({ ...record, id: `${stage.batchIndex}:${record.id}`, pairId: `${stage.batchIndex}:${record.pairId}` })));
  const checked = createV17Report({ ...declaration, config, records });
  const openingIds = config.openings.map(row => row.id), rows = rowsFor(study, records, declaration, openingIds, `v19:${study}:${targetOpenings}`);
  const cohorts = Array.from({ length: targetOpenings / 8 }, (_, batchIndex) => {
    const ids = openingIds.slice(batchIndex * 8, batchIndex * 8 + 8);
    return { batchIndex, openingIds: ids, rows: rowsFor(study, records.filter(row => ids.includes(row.openingId)), declaration, ids, `v19:${study}:batch${batchIndex}`) };
  });
  const openingEvaluations = require('./opening-evaluation-report').buildOpeningEvaluationReport(records,
    { engineSha256: manifest.identity?.engineSha256 });
  return { schemaVersion: 1, format: 'levelup-v19-tier-panel-report', runId: manifest.runId || null, study, tier: LEVEL(study), targetOpenings,
    scheduledGames: expectedGames(study, targetOpenings), nodes: NODES, progress: checked.progress, comparisons: checked.comparisons,
    rows, cohorts, openingPolicy: BOOK.policy, evaluationAudit: getValueAudit(study), openingEvaluations,
    sources: stages.map(stage => ({ batchIndex: stage.batchIndex, nodes: stage.nodes, directory: stage.directory || null,
      runId: stage.manifest.runId, profileHash: stage.manifest.designProfile.hash, registryHash: stage.manifest.designProfile.registryHash })) };
}
function renderReport(report) {
  const pct = value => value === null ? 'pending' : `${(100 * value).toFixed(2)}%`;
  const ci = value => value.available ? `${pct(value.lower)}–${pct(value.upper)}` : 'pending';
  const summary = (row, field) => `${pct(row[field].score)} (${row[field].openingCoverage.shared}/${report.targetOpenings})`;
  const lines = [`# Version 19 level ${report.tier} panel`, '',
    `${report.targetOpenings} shared openings; ${report.scheduledGames} scheduled games; ${report.progress.finalizedGames} finalized; ${report.progress.completePairs} scored complete color pairs. Draws count half a point.`, '',
    'Each army buys one upgrade at this tier, including board pawns, queens and finite reserve grants. Whole-roster and fixed-reference baskets are separate equal-opponent means over their own shared completed cases. References exclude themselves. Unpaired results, truncations and errors remain unscored.', '',
    report.openingPolicy, '',
    '| Design | Whole roster (cases) | Fixed references (cases) | Whole-roster W / D / L | White | Black | Conditional 95% range |',
    '| --- | ---: | ---: | :--- | ---: | ---: | --- |',
    ...report.rows.map(row => `| ${row.label}${row.reference ? ' [reference]' : ''} | ${summary(row, 'allOpponents')} | ${summary(row, 'fixedReferences')} | ${row.allOpponents.wins} / ${row.allOpponents.draws} / ${row.allOpponents.losses} | ${pct(row.allOpponents.physicalColors[0].score)} | ${pct(row.allOpponents.physicalColors[1].score)} | ${ci(row.allOpponents.conditionalRange)} |`), '',
    '| Row upgrade / opponent | ' + report.rows.map(row => row.label).join(' | ') + ' |',
    '| --- | ' + report.rows.map(() => '---:').join(' | ') + ' |',
    ...report.rows.map(row => `| ${row.label} | ${row.cells.map(cell => cell.self ? '—' : pct(cell.score)).join(' | ')} |`), '',
    '| A versus B | Paired games | A W / D / L | A score | Truncated attempts | Errors |',
    '| --- | ---: | :--- | ---: | ---: | ---: |',
    ...report.comparisons.map(row => `| ${row.aLabel} / ${row.bLabel} | ${row.pairedGames} | ${row.wins} / ${row.draws} / ${row.losses} | ${pct(row.score)} | ${row.statusCounts.truncated} | ${row.statusCounts.error} |`), '',
    '| Design | ' + report.cohorts.map(cohort => `Cases ${cohort.batchIndex * 8 + 1}–${cohort.batchIndex * 8 + 8}`).join(' | ') + ' |',
    '| --- | ' + report.cohorts.map(() => '---:').join(' | ') + ' |',
    ...report.rows.map(row => `| ${row.label} | ${report.cohorts.map(cohort => { const part = cohort.rows.find(item => item.key === row.key).allOpponents; return `${pct(part.score)} (${part.openingCoverage.shared}/8)`; }).join(' | ')} |`), '',
    require('./opening-evaluation-report').renderOpeningEvaluationReport(report.openingEvaluations),
    '## Frozen search priors', '', report.evaluationAudit.policy, '', '| Design | Movement | Applied MG / EG |', '| --- | --- | ---: |',
    ...report.evaluationAudit.values.map(row => `| ${row.id} | \`${row.movement}\` | ${row.applied.mg} / ${row.applied.eg} |`), '',
    'Conditional ranges resample whole shared opening cases, retaining both colors. Related prefixes, fixed priors and engine limitations remain outside those ranges. Scores measure army outcomes under this protocol, not intrinsic piece Elo or fitted material prices. No old study outcomes are silently pooled.', ''];
  return lines.join('\n');
}
module.exports = { ROOT, FORMAT, STUDIES, OPENING_TARGETS, NODES, HOME, OPENINGS_FILE, OPENINGS_SHA256, BOOK, OPENINGS,
  verifyFrozenInputs, readBook, army, candidates, references, matches, getValueAudit, getBatchDeclaration, expectedGames, buildCampaignPlan,
  selectedStages, checkExperiment, completePairs, summarize, reportStudy, renderReport };
