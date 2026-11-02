'use strict';

// Resolve these declarations inside the owned research overlay. The normal
// catalog deliberately does not acquire new IDs while a frozen panel runs.
const { createHash } = require('node:crypto');
const { normalizeConfig, makeSchedule } = require('./plan');
const { getDesign } = require('../../src/design-catalog');
const { getOfficialReferences } = require('./official-references');
const { readSnapshot, getBracketValueReceipt } = require('./v17-bracket-values');
const { createV17Report } = require('./v17-report');
const { conditionalRange } = require('./level3-panel-report');
// These eight cases are outside the current panel's requested first32 and
// were not used to select the weak Nightrider. Keep the old eight as discovery.
const OPENINGS = require('../../experiments/balance/v17-level3-panel-openings.json').slice(56, 64);
const NODES = Object.freeze([20000, 40000, 80000]);
const BODIES = Object.freeze([
  { key: 'original', id: 'knight.purple@4', label: 'Nightrider control', movement: 'N0' },
  { key: 'diagonal-captures', id: 'knight.nightrider-diagonal-capture@1', label: 'Nightrider: diagonal captures', movement: 'N0cF' },
  { key: 'orthogonal-captures', id: 'knight.nightrider-orthogonal-capture@1', label: 'Nightrider: orthogonal captures', movement: 'N0cW' },
].map(Object.freeze));
const sha = value => createHash('sha256').update(value).digest('hex');
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const score = record => record.result === '1/2-1/2' ? 0.5 : Number((record.result === '1-0') === (record.aColor === 'w'));

function loadExperiment(nodes) {
  if (!NODES.includes(nodes)) throw new Error('Select 20000, 40000 or 80000 nodes.');
  for (const body of BODIES) if (getDesign(body.id)?.movement !== body.movement) throw new Error('The focused study requires its isolated research runtime.');
  const references = getOfficialReferences().roster.map(row => ({ ...row, label: row.key === 'cruisader' ? 'Crusader' : row.name }));
  const homes = { rook: 'a1', knight: 'b1', bishop: 'c1', queen: 'd1' };
  const baseline = readSnapshot().values.find(row => row.id === BODIES[0].id);
  const evaluation = { pieceValues: Object.fromEntries([
    ...BODIES.map(body => [body.id, baseline.applied]), ...references.map(row => [row.id, row.engineValue]),
  ]) };
  const matches = BODIES.flatMap(body => references.map(reference => ({ id: `${body.key}-v-${reference.key}`,
    aKey: body.key, aLabel: body.label, bKey: reference.key, bLabel: reference.label,
    armyA: { upgrades: { b1: body.id } }, armyB: { upgrades: { [homes[reference.family]]: reference.id } } })));
  const config = normalizeConfig({ schemaVersion: 3, name: `Nightrider capture-step focus (${nodes} nodes)`, seed: 20261104,
    repetitions: 1, engine: { nodes, threads: 1, hashMb: 32, maxPlies: 400 }, openings: OPENINGS,
    comparisons: matches.map(row => ({ id: row.id, label: `${row.aLabel} versus ${row.bLabel}`, armyA: row.armyA,
      armyB: row.armyB, strengthA: { skill: 20 }, strengthB: { skill: 20 } })), evaluation });
  return { experiment: `nightrider-focus-n${nodes}`, file: null, config,
    metadata: { kind: 'nightrider-focus', scheduledGames: 192, symmetric: false,
      rows: BODIES.map(({ key, label }) => ({ key, label })), columns: references.map(({ key, label }) => ({ key, label })),
      comparisons: matches.map(({ id, aKey, aLabel, bKey, bLabel }) => ({ id, aKey, aLabel, bKey, bLabel })),
      evaluationAudit: { source: getBracketValueReceipt(), policy: 'All three bodies share the original N0 applied MG/EG pair in every engine table. The four frozen reference pairs remain unchanged.',
        sharedNightriderValue: baseline.applied },
      question: 'Do capture-only adjacent steps improve Nightrider play against the four frozen references at a fixed search prior?' } };
}
function buildPlan(jobs = 4) {
  if (!Number.isInteger(jobs) || jobs < 1 || jobs > 16) throw new Error('Jobs must be 1 through 16.');
  return { schemaVersion: 1, format: 'levelup-nightrider-capture-focus', jobs, games: 576, bodies: BODIES,
    stages: NODES.map(nodes => {
      const declaration = loadExperiment(nodes), schedule = makeSchedule(declaration.config);
      return { nodes, directory: `n${nodes}`, games: schedule.length, configSha256: sha(JSON.stringify(declaration.config)),
        scheduleSha256: sha(JSON.stringify(schedule)) };
    }) };
}
function reportStudy(manifest, stages) {
  if (!Array.isArray(stages) || new Set(stages.map(stage => stage.nodes)).size !== stages.length) throw new Error('Focused report stages must have distinct node budgets.');
  const reports = stages.map(stage => ({ nodes: stage.nodes,
    report: createV17Report({ ...loadExperiment(stage.nodes), records: stage.records, manifest: stage.manifest }) }));
  const gains = reports.flatMap(({ nodes, report }) => {
    const source = stages.find(stage => stage.nodes === nodes), latest = new Map();
    for (const row of source.records) if (!latest.has(row.id) || row.attempt > latest.get(row.id).attempt) latest.set(row.id, row);
    const pairs = new Map();
    for (const row of latest.values()) { const pair = pairs.get(row.pairId) || []; pair.push(row); pairs.set(row.pairId, pair); }
    const values = new Map();
    for (const pair of pairs.values()) if (pair.length === 2 && pair.every(row => row.status === 'completed') && pair[0].aColor !== pair[1].aColor) {
      values.set(`${pair[0].comparisonId}:${pair[0].openingId}`, mean(pair.map(score)));
    }
    const references = loadExperiment(nodes).metadata.columns;
    return BODIES.slice(1).map(body => {
      const common = OPENINGS.filter(opening => references.every(reference => ['original', body.key].every(key => values.has(`${key}-v-${reference.key}:${opening.id}`))));
      const differences = common.map(opening => mean(references.map(reference => values.get(`${body.key}-v-${reference.key}:${opening.id}`) - values.get(`original-v-${reference.key}:${opening.id}`))));
      return { nodes, key: body.key, label: body.label, sharedOpenings: common.length,
        difference: mean(differences), conditionalRange: conditionalRange(differences, `focus:${nodes}:${body.key}`) };
    });
  });
  return { schemaVersion: 1, format: 'levelup-nightrider-focus-report', runId: manifest.runId, reports, gains };
}
function renderReport(report) {
  const { renderV17Report } = require('./v17-report');
  const pp = value => value === null ? 'pending' : (value * 100).toFixed(2);
  const lines = ['# Nightrider capture-step focus', '',
    'Original N0 and both revisions run fresh under one controlled profile. Each body faces the four frozen references on the same eight cases at each node budget; no historical panel games are counted again.', '',
    '| Budget | Revision | Matched cases | Score gain over N0 (pp) | Conditional 95% range (pp) |',
    '| ---: | --- | ---: | ---: | --- |', ...report.gains.map(row => `| ${row.nodes} | ${row.label} | ${row.sharedOpenings}/8 | ${pp(row.difference)} | ${row.conditionalRange.available ? `${pp(row.conditionalRange.lower)} to ${pp(row.conditionalRange.upper)}` : 'pending'} |`), '',
    'Gains equally weight both colors and all four opponents on cases completed for the control and revision. Ranges resample eight fixed opening blocks and remain conditional. Truncations are unscored. Shared search priors are not fitted material values.', '',
    ...report.reports.map(row => renderV17Report(row.report)), ''];
  return lines.join('\n');
}
module.exports = { OPENINGS, NODES, BODIES, loadExperiment, buildPlan, reportStudy, renderReport };
