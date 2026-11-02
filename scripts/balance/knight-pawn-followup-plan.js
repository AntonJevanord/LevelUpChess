'use strict';

// This declaration resolves only in an owned research catalog. No old mixed
// games are reused: the control and both revisions share new partners/cases.
const { createHash } = require('node:crypto');
const { normalizeConfig, makeSchedule } = require('./plan');
const { getDesign } = require('../../src/design-catalog');
const { LEVEL1_ROSTER, getReferencePanelRoster } = require('./reference-panel-plan');
const { getLevel2References } = require('./level2-references');
const { getOfficialReferences } = require('./official-references');
const { readSnapshot, getBracketValueReceipt } = require('./v17-bracket-values');
const { createV17Report, renderV17Report } = require('./v17-report');
const { conditionalRange } = require('./level3-panel-report');

function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
const STUDY_KEY = 'knight-pawn';
const OPENINGS = freeze(require('../../experiments/balance/v17-level3-panel-openings.json').slice(32, 48));
const NODES = Object.freeze([20000]);
const BODIES = freeze([
  { key: 'original', id: 'pawn.orange@3', label: 'Forward Knight pawn control', movement: 'fmWfceFifmnDfhN' },
  { key: 'tall-captures', id: 'pawn.knight-tall-capture@1', label: 'Knight pawn: tall captures only', movement: 'ifmnDfmWfceFfsNfceN' },
  { key: 'tall-quiet', id: 'pawn.knight-tall-quiet@1', label: 'Knight pawn: tall quiet only', movement: 'ifmnDfmWfceFfsNfmN' },
]);
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function partners() { getReferencePanelRoster(); return LEVEL1_ROSTER; }
function references() {
  const homes = { rook: 'a1', knight: 'b1', bishop: 'c1', queen: 'd1' };
  return getOfficialReferences().roster.map(reference => ({ ...reference,
    label: reference.key === 'cruisader' ? 'Crusader' : reference.name,
    army: { upgrades: { [homes[reference.family]]: reference.id } } }));
}

function logicalTeams() {
  return BODIES.flatMap(body => partners().map(partner => {
    const key = `${body.key}-plus-${partner.key}`;
    const layouts = [['c2', 'e2'], ['e2', 'c2']].map(([partnerHome, pawnHome], index) => {
      const upgrades = { [pawnHome]: body.id }, reserve = [];
      if (partner.placement === 'replace') upgrades[partnerHome] = partner.id;
      else reserve.push({ id: partner.id, count: 1 });
      return { key: `${key}-${index ? 'e-c' : 'c-e'}`, layout: index ? 'e-c' : 'c-e',
        label: partner.placement === 'replace' ? `L1 ${partnerHome}; L2 ${pawnHome}` : `L1 reserve; L2 ${pawnHome}`,
        slots: { level1: partner.placement === 'replace' ? partnerHome : null, level2: pawnHome }, army: { upgrades, reserve } };
    });
    return { key, label: `${partner.name} + ${body.label}`, bodyKey: body.key, partnerKey: partner.key,
      level1: partner.key, level2: body.key, members: [partner.id, body.id], layouts, budget: 3 };
  }));
}

function loadExperiment(nodes) {
  if (!NODES.includes(nodes)) throw new Error('Knight-pawn follow-up uses 20000 nodes.');
  for (const body of BODIES) if (getDesign(body.id)?.movement !== body.movement) throw new Error('The knight-pawn follow-up requires its isolated research runtime.');
  const selected = getLevel2References().roster.find(reference => reference.id === BODIES[0].id);
  if (!selected || selected.movement !== BODIES[0].movement) throw new Error('The selected Forward Knight pawn changed.');
  const baseline = readSnapshot(), teams = logicalTeams(), refs = references();
  const values = Object.fromEntries([
    ...BODIES.map(body => [body.id, selected.engineValue]),
    ...partners().map(partner => {
      const receipt = baseline.values.find(value => value.id === partner.id);
      if (!receipt) throw new Error(`Missing selected partner value: ${partner.id}.`);
      return [partner.id, receipt.applied];
    }),
    ...refs.map(reference => [reference.id, reference.engineValue]),
  ]);
  const rows = teams.flatMap(team => team.layouts.map(layout => ({ key: layout.key,
    label: `${team.label} (${layout.label})`, teamKey: team.key, bodyKey: team.bodyKey, partnerKey: team.partnerKey,
    layout: layout.layout, slots: layout.slots, army: layout.army })));
  const matches = rows.flatMap(row => refs.map(reference => ({ id: `${row.key}-v-${reference.key}`,
    aKey: row.key, aLabel: row.label, bKey: reference.key, bLabel: reference.label,
    bodyKey: row.bodyKey, partnerKey: row.partnerKey, teamKey: row.teamKey, layout: row.layout,
    armyA: row.army, armyB: reference.army })));
  const config = normalizeConfig({ schemaVersion: 3, name: 'Knight-pawn mixed-partner follow-up (2304 games)',
    seed: 20261105, repetitions: 1, engine: { nodes, threads: 1, hashMb: 32, maxPlies: 400 }, openings: OPENINGS,
    comparisons: matches.map(match => ({ id: match.id, label: `${match.aLabel} versus ${match.bLabel}`,
      armyA: match.armyA, armyB: match.armyB, strengthA: { skill: 20 }, strengthB: { skill: 20 } })),
    evaluation: { pieceValues: values } });
  return { experiment: `knight-pawn-followup-n${nodes}`, file: null, config,
    metadata: { kind: 'knight-pawn-followup', scheduledGames: 2304, symmetric: false, upgradePoints: 3,
      rows: rows.map(({ key, label }) => ({ key, label })), columns: refs.map(({ key, label }) => ({ key, label })),
      comparisons: matches.map(({ id, aKey, aLabel, bKey, bLabel, bodyKey, partnerKey, teamKey, layout }) => ({ id, aKey, aLabel, bKey, bLabel, bodyKey, partnerKey, teamKey, layout })),
      bodies: BODIES, logicalTeams: teams, physicalRows: rows, partners: partners(),
      // These aliases retain the package structure used by the original mixed
      // diagnostics; there are no new grant trials or unrelated L2 reruns.
      mixedTeams: teams, level1: partners(), level2: BODIES.map(body => ({ ...body, name: body.label })), grantTrials: [],
      openingCohorts: [{ id: 'first-eight', openingIds: OPENINGS.slice(0, 8).map(opening => opening.id) },
        { id: 'second-eight', openingIds: OPENINGS.slice(8).map(opening => opening.id) }],
      evaluationAudit: { source: getBracketValueReceipt(), sharedKnightPawnValue: selected.engineValue,
        policy: 'All three Knight-pawn bodies share the original 536/592 applied prior. Selected L1 partners and frozen L3 reference priors remain unchanged; applied values are search priors, not measured material values.' },
      question: 'Does restricting only tall forward Knight-pawn jumps reduce its repeated mixed-partner advantage while preserving usefulness with every selected L1 partner and both c/e placements?',
      interpretation: 'Compare complete matched cases, equally weighting partners, placements, four reference opponents and both colors. Keep old mixed discovery separate; no Rank-pawn or Diagonal-grant redesign is scheduled.' } };
}

function buildPlan(jobs = 4) {
  if (!Number.isInteger(jobs) || jobs < 1 || jobs > 16) throw new Error('Jobs must be 1 through 16.');
  return { schemaVersion: 1, format: 'levelup-knight-pawn-mixed-followup', jobs, games: 2304, bodies: BODIES,
    stages: NODES.map(nodes => {
      const declaration = loadExperiment(nodes), schedule = makeSchedule(declaration.config);
      return { nodes, directory: `n${nodes}`, games: schedule.length, configSha256: sha(declaration.config), scheduleSha256: sha(schedule) };
    }) };
}

const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const gameScore = record => record.result === '1/2-1/2' ? 0.5 : Number((record.result === '1-0') === (record.aColor === 'w'));
const pairKey = (comparison, opening) => JSON.stringify([comparison, opening]);
function pairIndex(records) {
  const latest = new Map(), pairs = new Map(), result = new Map();
  for (const record of records) if (!latest.has(record.id) || record.attempt > latest.get(record.id).attempt) latest.set(record.id, record);
  for (const record of latest.values()) { const group = pairs.get(record.pairId) || []; group.push(record); pairs.set(record.pairId, group); }
  for (const group of pairs.values()) if (group.length === 2 && group.every(record => record.status === 'completed') && group[0].aColor !== group[1].aColor) result.set(pairKey(group[0].comparisonId, group[0].openingId), group);
  return result;
}
function tally(records) {
  const scores = records.map(gameScore);
  return { games: scores.length, wins: scores.filter(value => value === 1).length,
    draws: scores.filter(value => value === 0.5).length, losses: scores.filter(value => value === 0).length, score: mean(scores) };
}
function summarizeGroup(specification, comparisons, openingIds, index) {
  const matches = comparisons.filter(comparison => Object.entries(specification.criteria).every(([key, value]) => comparison[key] === value));
  const shared = openingIds.filter(opening => matches.length && matches.every(match => index.has(pairKey(match.id, opening))));
  const cases = shared.map(openingId => ({ openingId,
    score: mean(matches.map(match => mean(index.get(pairKey(match.id, openingId)).map(gameScore)))) }));
  const records = shared.flatMap(opening => matches.flatMap(match => index.get(pairKey(match.id, opening))));
  return { key: specification.key, label: specification.label, ...tally(records), score: mean(cases.map(row => row.score)), cases,
    conditionalRange: conditionalRange(cases.map(row => row.score), `knight-pawn:${specification.key}:${openingIds.join(',')}`),
    physicalColors: ['w', 'b'].map(color => ({ color, ...tally(records.filter(record => record.aColor === color)) })),
    openingCoverage: { shared: shared.length, total: openingIds.length, openingIds: shared },
    status: !shared.length ? 'pending shared cases' : shared.length === openingIds.length ? 'complete' : 'partial shared cases' };
}
function summaries(declaration, openingIds, index) {
  const comparisons = declaration.metadata.comparisons;
  const bodies = BODIES.map(body => ({ ...summarizeGroup({ key: body.key, label: body.label, criteria: { bodyKey: body.key } }, comparisons, openingIds, index),
    opponents: references().map(reference => summarizeGroup({ key: reference.key, label: reference.label, criteria: { bodyKey: body.key, bKey: reference.key } }, comparisons, openingIds, index)) }));
  const teams = BODIES.flatMap(body => partners().map(partner => ({ bodyKey: body.key, partnerKey: partner.key,
    ...summarizeGroup({ key: `${body.key}-plus-${partner.key}`, label: `${body.label} + ${partner.name}`,
      criteria: { bodyKey: body.key, partnerKey: partner.key } }, comparisons, openingIds, index) })));
  const placements = BODIES.flatMap(body => ['c-e', 'e-c'].map(layout => ({ bodyKey: body.key, layout,
    ...summarizeGroup({ key: `${body.key}-${layout}`, label: `${body.label}: ${layout === 'c-e' ? 'L2 e-file' : 'L2 c-file'}`,
      criteria: { bodyKey: body.key, layout } }, comparisons, openingIds, index) })));
  const control = bodies.find(body => body.key === 'original');
  const gains = bodies.filter(body => body.key !== 'original').map(body => {
    const cases = body.cases.flatMap(row => {
      const previous = control.cases.find(item => item.openingId === row.openingId);
      return previous ? [{ openingId: row.openingId, difference: row.score - previous.score }] : [];
    });
    return { key: body.key, label: body.label, sharedOpenings: cases.length, cases,
      difference: mean(cases.map(row => row.difference)), conditionalRange: conditionalRange(cases.map(row => row.difference), `knight-pawn-gain:${body.key}:${openingIds.join(',')}`) };
  });
  return { bodies, teams, placements, gains };
}
function reportStudy(manifest, stages) {
  if (!Array.isArray(stages) || stages.some(stage => !NODES.includes(stage.nodes)) || new Set(stages.map(stage => stage.nodes)).size !== stages.length) throw new Error('Knight-pawn report requires distinct declared node budgets.');
  const reports = stages.map(stage => {
    const declaration = loadExperiment(stage.nodes);
    // Validate full schedule, profile, strength and attempt context before any
    // projections. Synthetic fixtures do not stand in for collected evidence.
    const report = createV17Report({ ...declaration, manifest: stage.manifest, records: stage.records });
    const index = pairIndex(stage.records), openingIds = OPENINGS.map(opening => opening.id);
    return { nodes: stage.nodes, report, ...summaries(declaration, openingIds, index),
      cohorts: declaration.metadata.openingCohorts.map(cohort => ({ id: cohort.id, ...summaries(declaration, cohort.openingIds, index) })) };
  });
  return { schemaVersion: 1, format: 'levelup-knight-pawn-followup-report', runId: manifest.runId, reports,
    gains: reports.flatMap(row => row.gains.map(gain => ({ nodes: row.nodes, ...gain }))) };
}

const percent = value => value === null ? 'pending' : `${(100 * value).toFixed(2)}%`;
const points = value => value === null ? 'pending' : (100 * value).toFixed(2);
const range = value => value.available ? `${points(value.lower)} to ${points(value.upper)}` : 'pending';
function renderReport(report) {
  const lines = ['# Knight-pawn mixed-partner follow-up', '',
    'The current Forward Knight pawn and both narrower prototypes play fresh under the same 536/592 search prior. Each joins all three selected L1 purchases, on both c/e placements, against the four frozen L3 references. All armies spend three points. The original discovery games remain separate.', '',
    'Scores count draws half. Overall body scores require shared fully completed cases across every partner, placement, reference and both colors. Game counts are not independent opening counts; conditional ranges resample complete opening blocks.', ''];
  for (const stage of report.reports) {
    lines.push(`## ${stage.nodes} nodes: body comparison`, '',
      '| Body | Overall score | Shared openings | W / D / L (games) | White score | Black score |',
      '| --- | ---: | ---: | :--- | ---: | ---: |',
      ...stage.bodies.map(body => `| ${body.label} | ${percent(body.score)} | ${body.openingCoverage.shared}/16 | ${body.wins} / ${body.draws} / ${body.losses} (${body.games}) | ${percent(body.physicalColors[0].score)} | ${percent(body.physicalColors[1].score)} |`), '',
      '| Revision | Gain over current pawn (pp) | Shared matched openings | Conditional 95% range (pp) |', '| --- | ---: | ---: | --- |',
      ...stage.gains.map(gain => `| ${gain.label} | ${points(gain.difference)} | ${gain.sharedOpenings}/16 | ${range(gain.conditionalRange)} |`), '',
      '| Body | Two-step pawn partner | King-step pawn partner | Pawn-grant partner |', '| --- | ---: | ---: | ---: |',
      ...BODIES.map(body => `| ${body.label} | ${partners().map(partner => {
        const team = stage.teams.find(row => row.bodyKey === body.key && row.partnerKey === partner.key);
        return `${percent(team.score)} (${team.openingCoverage.shared}/16)`;
      }).join(' | ')} |`), '',
      'Partner cells equally weight the two real placements, four reference opponents and both colors. Overall body scores weight all three partners equally; a faster or incomplete team cannot gain weight.', '',
      '| Body | Placement | Score | Shared openings |', '| --- | --- | ---: | ---: |',
      ...stage.placements.map(row => `| ${BODIES.find(body => body.key === row.bodyKey).label} | ${row.layout === 'c-e' ? 'L2 e-file' : 'L2 c-file'} | ${percent(row.score)} | ${row.openingCoverage.shared}/16 |`), '',
      '| Body | First fixed eight | Second fixed eight |', '| --- | ---: | ---: |',
      ...BODIES.map(body => `| ${body.label} | ${stage.cohorts.map(cohort => {
        const row = cohort.bodies.find(item => item.key === body.key); return `${percent(row.score)} (${row.openingCoverage.shared}/8)`;
      }).join(' | ')} |`), '',
      renderV17Report(stage.report), '');
  }
  lines.push('Every pawn retains its declared en-passant role, quiet home double advance and standard Q/R/B/N promotion. The Pawn grant is finite, nonroyal, never promotes, deploys on its owner’s half without checking, and captures never refill the reserve.', '',
    'The 2,304-game cap is fixed: three bodies × three partners × two placements × four references × sixteen openings × both colors, at 20k nodes. Rank pawn and Diagonal grant keep their selected definitions; neither is retested here. No material fit or individual-piece Elo is inferred.', '');
  return lines.join('\n');
}

module.exports = { STUDY_KEY, OPENINGS, NODES, BODIES, partners, references, logicalTeams, loadExperiment, buildPlan, reportStudy, renderReport };
