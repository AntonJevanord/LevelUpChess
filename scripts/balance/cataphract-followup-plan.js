'use strict';

// Only the owned research catalog resolves these IDs. This declaration never
// replaces the current RC body, its value receipt, or an ongoing panel's rules.
const { createHash } = require('node:crypto');
const { normalizeConfig, makeSchedule } = require('./plan');
const { getDesign } = require('../../src/design-catalog');
const { getOfficialReferences } = require('./official-references');
const { readSnapshot, getBracketValueReceipt } = require('./v17-bracket-values');
const { createV17Report, renderV17Report } = require('./v17-report');
const { conditionalRange } = require('./level3-panel-report');

const STUDY_KEY = 'cataphract';
const OPENINGS = require('../../experiments/balance/v17-level3-panel-openings.json').slice(32, 48);
const NODES = Object.freeze([40000, 80000]);
const BODIES = Object.freeze([
  { key: 'no-tall-back', id: 'rook.cataphract-no-tall-back@1', label: 'Cataphract: no tall backward camel', movement: 'RsCfC', automatic: { mg: 1987, eg: 2126 } },
  { key: 'forward-half', id: 'rook.cataphract-forward-half@1', label: 'Cataphract: forward camel half', movement: 'RfhC', automatic: { mg: 1742, eg: 1850 } },
].map(row => Object.freeze({ ...row, automatic: Object.freeze(row.automatic) })));
const sha = value => createHash('sha256').update(value).digest('hex');
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const score = record => record.result === '1/2-1/2' ? 0.5 : Number((record.result === '1-0') === (record.aColor === 'w'));

function loadExperiment(nodes) {
  if (!NODES.includes(nodes)) throw new Error('Select 40000 or 80000 nodes.');
  for (const body of BODIES) if (getDesign(body.id)?.movement !== body.movement) throw new Error('The Cataphract follow-up requires its isolated research runtime.');
  const references = getOfficialReferences().roster.map(row => ({ ...row, label: row.key === 'cruisader' ? 'Crusader' : row.name }));
  const homes = { rook: 'a1', knight: 'b1', bishop: 'c1', queen: 'd1' };
  const original = readSnapshot().values.find(row => row.id === 'rook.purple@12');
  if (original.movement !== 'RC') throw new Error('Original Cataphract value receipt changed.');
  const evaluation = { pieceValues: Object.fromEntries([
    ...BODIES.map(body => [body.id, original.applied]), ...references.map(row => [row.id, row.engineValue]),
  ]) };
  const matches = BODIES.flatMap(body => references.map(reference => ({ id: `${body.key}-v-${reference.key}`,
    aKey: body.key, aLabel: body.label, bKey: reference.key, bLabel: reference.label,
    armyA: { upgrades: { a1: body.id } }, armyB: { upgrades: { [homes[reference.family]]: reference.id } } })));
  const config = normalizeConfig({ schemaVersion: 3, name: `Cataphract camel restrictions (${nodes} nodes)`, seed: 20261106,
    repetitions: 1, engine: { nodes, threads: 1, hashMb: 32, maxPlies: 400 }, openings: OPENINGS,
    comparisons: matches.map(row => ({ id: row.id, label: `${row.aLabel} versus ${row.bLabel}`, armyA: row.armyA,
      armyB: row.armyB, strengthA: { skill: 20 }, strengthB: { skill: 20 } })), evaluation });
  return { experiment: `cataphract-followup-n${nodes}`, file: null, config,
    metadata: { kind: 'cataphract-followup', scheduledGames: 256, symmetric: false,
      rows: BODIES.map(({ key, label }) => ({ key, label })), columns: references.map(({ key, label }) => ({ key, label })),
      comparisons: matches.map(({ id, aKey, aLabel, bKey, bLabel }) => ({ id, aKey, aLabel, bKey, bLabel })),
      evaluationAudit: { source: getBracketValueReceipt(), sharedCataphractValue: original.applied,
        automaticCandidateValues: Object.fromEntries(BODIES.map(body => [body.id, body.automatic])),
        policy: 'Both restricted bodies share the existing RC applied MG/EG pair in all six engine tables. Native automatic candidate values are diagnostic only. Frozen references retain their exact pairs.' },
      question: 'Which directional camel restriction is closer to an even reference score at 40k and 80k? Original RC remains a separate ongoing-panel benchmark, not a fresh control or merged historical result.' } };
}

function buildPlan(jobs = 4) {
  if (!Number.isInteger(jobs) || jobs < 1 || jobs > 16) throw new Error('Jobs must be 1 through 16.');
  return { schemaVersion: 1, format: 'levelup-cataphract-camel-followup', jobs, games: 512, bodies: BODIES,
    stages: NODES.map(nodes => {
      const declaration = loadExperiment(nodes), schedule = makeSchedule(declaration.config);
      return { nodes, directory: `n${nodes}`, games: schedule.length, configSha256: sha(JSON.stringify(declaration.config)),
        scheduleSha256: sha(JSON.stringify(schedule)) };
    }) };
}

function reportStudy(manifest, stages) {
  if (!Array.isArray(stages) || new Set(stages.map(stage => stage.nodes)).size !== stages.length) throw new Error('Cataphract report stages must have distinct node budgets.');
  const reports = stages.map(stage => ({ nodes: stage.nodes,
    report: createV17Report({ ...loadExperiment(stage.nodes), records: stage.records, manifest: stage.manifest }) }));
  const contrasts = stages.map(stage => {
    const latest = new Map();
    for (const row of stage.records) if (!latest.has(row.id) || row.attempt > latest.get(row.id).attempt) latest.set(row.id, row);
    const pairs = new Map();
    for (const row of latest.values()) { const pair = pairs.get(row.pairId) || []; pair.push(row); pairs.set(row.pairId, pair); }
    const values = new Map();
    for (const pair of pairs.values()) if (pair.length === 2 && pair.every(row => row.status === 'completed') && pair[0].aColor !== pair[1].aColor) {
      values.set(`${pair[0].comparisonId}:${pair[0].openingId}`, mean(pair.map(score)));
    }
    const references = loadExperiment(stage.nodes).metadata.columns;
    const common = OPENINGS.filter(opening => references.every(reference => BODIES.every(body => values.has(`${body.key}-v-${reference.key}:${opening.id}`))));
    const differences = common.map(opening => mean(references.map(reference => values.get(`forward-half-v-${reference.key}:${opening.id}`) - values.get(`no-tall-back-v-${reference.key}:${opening.id}`))));
    return { nodes: stage.nodes, sharedOpenings: common.length, difference: mean(differences),
      conditionalRange: conditionalRange(differences, `cataphract:${stage.nodes}:forward-minus-six`) };
  });
  return { schemaVersion: 1, format: 'levelup-cataphract-followup-report', runId: manifest.runId, reports, contrasts };
}

function renderReport(report) {
  const pp = value => value === null ? 'pending' : (value * 100).toFixed(2);
  return ['# Cataphract camel restrictions', '',
    'Two new candidates face the four frozen references on sixteen fresh matched openings, both colors, at 40k and 80k. Scores count draws as half a point. The original RC stays a separate benchmark in the ongoing panel; this 512-game study does not rerun it or merge historical evidence.', '',
    '`RsCfC` keeps six camel jumps: four wide sideways jumps (including the backward pair), plus the two tall forward jumps. `RfhC` keeps only the four forward camel jumps. Both retain all ordinary rook moves, captures and castling.', '',
    '| Budget | Matched cases | RfhC minus RsCfC score (pp) | Conditional 95% range (pp) |',
    '| ---: | ---: | ---: | --- |', ...report.contrasts.map(row => `| ${row.nodes} | ${row.sharedOpenings}/16 | ${pp(row.difference)} | ${row.conditionalRange.available ? `${pp(row.conditionalRange.lower)} to ${pp(row.conditionalRange.upper)}` : 'pending'} |`), '',
    'Contrasts keep whole opening blocks, both colors and all four equally weighted opponents together. These fixed-case ranges are conditional, not universal piece-value intervals. Truncations are unscored. Both candidates use the original RC search prior, not their lower automatic values or a fitted material estimate.', '',
    ...report.reports.map(row => renderV17Report(row.report)), ''].join('\n');
}

module.exports = { STUDY_KEY, OPENINGS, NODES, BODIES, loadExperiment, buildPlan, reportStudy, renderReport };
