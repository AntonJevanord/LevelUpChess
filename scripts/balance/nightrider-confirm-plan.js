'use strict';

// A fixed confirmation cohort. The original eight-case focus remains discovery
// evidence; none of its outcomes are imported or counted in this experiment.
const { createHash } = require('node:crypto');
const { normalizeConfig, makeSchedule } = require('./plan');
const { getDesign } = require('../../src/design-catalog');
const { getOfficialReferences } = require('./official-references');
const { readSnapshot, getBracketValueReceipt } = require('./v17-bracket-values');
const { createV17Report, renderV17Report } = require('./v17-report');
const { summarizeOpeningChanges } = require('../analysis/paired-opening-sensitivity');

const STUDY_KEY = 'nightrider';
const OPENINGS = Object.freeze(require('../../experiments/balance/v17-level3-panel-openings.json').slice(32, 48)
  .map(row => Object.freeze({ ...row, moves: Object.freeze([...row.moves]) })));
const NODES = Object.freeze([40000, 80000]);
const BODIES = Object.freeze([
  { key: 'original', id: 'knight.purple@4', label: 'Nightrider control', movement: 'N0' },
  { key: 'diagonal-captures', id: 'knight.nightrider-diagonal-capture@1', label: 'Nightrider: diagonal captures', movement: 'N0cF' },
].map(Object.freeze));
const sha = value => createHash('sha256').update(value).digest('hex');
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const score = record => record.result === '1/2-1/2' ? 0.5 : Number((record.result === '1-0') === (record.aColor === 'w'));

function loadExperiment(nodes) {
  if (!NODES.includes(nodes)) throw new Error('Nightrider confirmation uses 40000 or 80000 nodes.');
  for (const body of BODIES) if (getDesign(body.id)?.movement !== body.movement) throw new Error('Nightrider confirmation requires its isolated research runtime.');
  const references = getOfficialReferences().roster.map(row => ({ ...row, label: row.key === 'cruisader' ? 'Crusader' : row.name }));
  const homes = { rook: 'a1', knight: 'b1', bishop: 'c1', queen: 'd1' };
  const baseline = readSnapshot().values.find(row => row.id === BODIES[0].id);
  if (!baseline || baseline.applied.mg !== 2326 || baseline.applied.eg !== 2211) throw new Error('Original Nightrider priors changed.');
  const evaluation = { pieceValues: Object.fromEntries([
    ...BODIES.map(body => [body.id, baseline.applied]), ...references.map(row => [row.id, row.engineValue]),
  ]) };
  const matches = BODIES.flatMap(body => references.map(reference => ({ id: `${body.key}-v-${reference.key}`,
    aKey: body.key, aLabel: body.label, bKey: reference.key, bLabel: reference.label,
    armyA: { upgrades: { b1: body.id } }, armyB: { upgrades: { [homes[reference.family]]: reference.id } } })));
  const config = normalizeConfig({ schemaVersion: 3, name: `Nightrider diagonal-capture confirmation (${nodes} nodes)`, seed: 20261107,
    repetitions: 1, engine: { nodes, threads: 1, hashMb: 32, maxPlies: 400 }, openings: OPENINGS,
    comparisons: matches.map(row => ({ id: row.id, label: `${row.aLabel} versus ${row.bLabel}`, armyA: row.armyA,
      armyB: row.armyB, strengthA: { skill: 20 }, strengthB: { skill: 20 } })), evaluation });
  return { experiment: `nightrider-confirm-n${nodes}`, file: null, config,
    metadata: { kind: 'nightrider-confirmation', scheduledGames: 256, symmetric: false,
      rows: BODIES.map(({ key, label }) => ({ key, label })), columns: references.map(({ key, label }) => ({ key, label })),
      comparisons: matches.map(({ id, aKey, aLabel, bKey, bLabel }) => ({ id, aKey, aLabel, bKey, bLabel })),
      evaluationAudit: { source: getBracketValueReceipt(), policy: 'Both bodies share original N0 applied MG/EG 2326/2211 in all six engine tables at both budgets. Frozen reference pairs remain unchanged.',
        sharedNightriderValue: { ...baseline.applied } },
      openingCohort: { masterIndicesOneBased: [33, 48], cases: 16, relation: 'Separate from first 32 panel cases and discovery cases 57–64; reuse across budgets is deliberate matching.' },
      question: 'Does the diagonal-capture Nightrider improve on N0, and does its relative advantage change from 40k to 80k on sixteen new matched openings?' } };
}

function buildPlan(jobs = 4) {
  if (!Number.isInteger(jobs) || jobs < 1 || jobs > 16) throw new Error('Jobs must be 1 through 16.');
  return { schemaVersion: 1, format: 'levelup-nightrider-diagonal-confirmation', jobs, games: 512, bodies: BODIES,
    stages: NODES.map(nodes => {
      const declaration = loadExperiment(nodes), schedule = makeSchedule(declaration.config);
      return { nodes, directory: `n${nodes}`, games: schedule.length, configSha256: sha(JSON.stringify(declaration.config)),
        scheduleSha256: sha(JSON.stringify(schedule)) };
    }) };
}

function contrast(cases) {
  const differences = cases.map(row => row.difference);
  return { sharedOpenings: cases.length, difference: mean(differences), cases,
    sensitivity: differences.length >= 2 ? summarizeOpeningChanges(differences) : null };
}

/** Called only after strict per-stage record/context validation below. */
function matchedCases(stage) {
  const latest = new Map(), pairs = new Map(), values = new Map();
  for (const row of stage.records) if (!latest.has(row.id) || row.attempt > latest.get(row.id).attempt) latest.set(row.id, row);
  for (const row of latest.values()) { const pair = pairs.get(row.pairId) || []; pair.push(row); pairs.set(row.pairId, pair); }
  for (const pair of pairs.values()) if (pair.length === 2 && pair.every(row => row.status === 'completed') && pair[0].aColor !== pair[1].aColor) {
    values.set(`${pair[0].comparisonId}:${pair[0].openingId}`, mean(pair.map(score)));
  }
  const references = loadExperiment(stage.nodes).metadata.columns;
  return OPENINGS.filter(opening => references.every(reference => BODIES.every(body => values.has(`${body.key}-v-${reference.key}:${opening.id}`))))
    .map(opening => ({ openingId: opening.id,
      scores: Object.fromEntries(BODIES.map(body => [body.key, mean(references.map(reference => values.get(`${body.key}-v-${reference.key}:${opening.id}`)))])) }));
}

function reportStudy(manifest, stages) {
  if (!Array.isArray(stages) || new Set(stages.map(stage => stage.nodes)).size !== stages.length) throw new Error('Confirmation report stages must have distinct node budgets.');
  const reports = stages.map(stage => ({ nodes: stage.nodes,
    report: createV17Report({ ...loadExperiment(stage.nodes), records: stage.records, manifest: stage.manifest }) }));
  const byNode = new Map(stages.map(stage => [stage.nodes, matchedCases(stage)]));
  const gains = stages.map(stage => ({ nodes: stage.nodes, ...contrast(byNode.get(stage.nodes).map(row => ({ openingId: row.openingId,
    difference: row.scores['diagonal-captures'] - row.scores.original }))) }));
  const low = new Map((byNode.get(40000) || []).map(row => [row.openingId, row])), high = new Map((byNode.get(80000) || []).map(row => [row.openingId, row]));
  const shared = OPENINGS.filter(row => low.has(row.id) && high.has(row.id));
  const rawChanges = BODIES.map(body => ({ key: body.key, label: body.label, ...contrast(shared.map(opening => ({ openingId: opening.id,
    difference: high.get(opening.id).scores[body.key] - low.get(opening.id).scores[body.key] }))) }));
  const advantageChange = contrast(shared.map(opening => ({ openingId: opening.id,
    difference: (high.get(opening.id).scores['diagonal-captures'] - high.get(opening.id).scores.original)
      - (low.get(opening.id).scores['diagonal-captures'] - low.get(opening.id).scores.original) })));
  return { schemaVersion: 1, format: 'levelup-nightrider-confirmation-report', runId: manifest.runId,
    reports, gains, crossBudget: { fromNodes: 40000, toNodes: 80000, rawChanges, advantageChange },
    interpretation: 'Scores and differences combine both colors and equally weighted four references within each opening before uncertainty. Discovery outcomes are not pooled. Fixed related openings and search priors limit interpretation; no automatic movement-selection decision.' };
}

function renderReport(report) {
  const pp = value => value === null ? 'pending' : (value * 100).toFixed(2);
  const range = (row, field) => row.sensitivity?.[field]?.available ? `${pp(row.sensitivity[field].lower)} to ${pp(row.sensitivity[field].upper)}` : 'pending';
  const line = (label, row) => `| ${label} | ${row.sharedOpenings}/16 | ${pp(row.difference)} | ${range(row, 'conditionalBootstrap')} | ${range(row, 'smallSampleT')} |`;
  const lines = ['# Nightrider diagonal-capture confirmation', '',
    '512 new games: N0 and N0cF, four frozen references, sixteen matched four-ply openings, both colors and separate 40k/80k budgets. The first focus remains discovery evidence; its games are not added to these scores.', '',
    '| Contrast | Shared openings | Score difference (pp) | Conditional bootstrap 95% (pp) | Small-sample t sensitivity 95% (pp) |',
    '| --- | ---: | ---: | --- | --- |',
    ...report.gains.map(row => line(`N0cF minus N0 at ${row.nodes / 1000}k`, row)),
    ...report.crossBudget.rawChanges.map(row => line(`${row.label}: 80k minus 40k`, row)),
    line('Change in N0cF-minus-N0 advantage: 80k minus 40k', report.crossBudget.advantageChange), '',
    'The last row tests a change in relative advantage; it is different from an individual-body budget change or a revision-versus-control gain at one budget. Whole-opening comparisons retain both colors, all four opponents and both budgets together. Both conditional percentile ranges and approximate small-sample sensitivity ranges are descriptive; related fixed openings are not an independent population sample. Missing color partners, truncations and incomplete opponent blocks do not become draws or extra evidence.', '',
    report.interpretation, '', ...report.reports.map(row => renderV17Report(row.report)), ''];
  return lines.join('\n');
}

module.exports = { STUDY_KEY, OPENINGS, NODES, BODIES, loadExperiment, buildPlan, reportStudy, renderReport };
