'use strict';

// A new grant-free, standard-army comparison context. It only reads the
// accepted roster and never changes a playable library or starts a game.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const roster = require('../../src/designs-v19-expanded');
const shared = require('./v19-panel-expanded-plan');
const { normalizeConfig, makeSchedule } = require('./plan');
const { createDesignRegistry } = require('./design-registry');
const { compileDesignProfile } = require('./design-profile');

const ROOT = path.resolve(__dirname, '../..');
const FORMAT = 'levelup-v19-cross-level-002';
const STUDY = 'cross-level';
const STUDIES = Object.freeze([STUDY]);
const NODES = 40000;
const OPENING_TARGETS = Object.freeze([8, 16, 32, 64]);
const HOME = Object.freeze({ pawn: 'c2', knight: 'b1', bishop: 'c1', rook: 'a1', queen: 'd1' });
const HOMES = Object.freeze({ pawn: Object.freeze(['c2', 'e2']), knight: Object.freeze(['b1', 'g1']),
  bishop: Object.freeze(['c1', 'f1']), rook: Object.freeze(['a1', 'h1']) });
const SELECTION_FILE = 'experiments/designs/v19-cross-level-002.json';
const SELECTION_SHA256 = '981fdd86a1b387e7a424f0a7c19377f72b73c71cb0bb627e01b717a3d46e08eb';
const SELECTION = freeze(require('../../experiments/designs/v19-cross-level-002.json'));
const { BOOK, OPENINGS, OPENINGS_FILE, OPENINGS_SHA256 } = shared;
const sha = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function checkStudy(study) { if (study !== STUDY) throw new Error('This declaration belongs to the cross-level panel.'); }
function checkBatch(batchIndex) { if (!Number.isInteger(batchIndex) || batchIndex < 0 || batchIndex > 7) throw new Error('Choose one of the eight cross-level opening batches.'); }
function singleArmy(body) { return { upgrades: { [HOME[body.family]]: body.id } }; }

function verifyFrozenInputs(read = file => fs.readFileSync(path.join(ROOT, file))) {
  shared.verifyFrozenInputs(read);
  if (sha(read(SELECTION_FILE).toString('utf8').replace(/\r\n/g, '\n')) !== SELECTION_SHA256
    || !isDeepStrictEqual(SELECTION.roster, roster.getRosterReceipt())
    || !isDeepStrictEqual(SELECTION.values, roster.getValueReceipt())
    || !isDeepStrictEqual(SELECTION.protocol.singleHomes, HOME)
    || !isDeepStrictEqual(SELECTION.protocol.duplicateHomes, HOMES)
    || !isDeepStrictEqual(SELECTION.protocol.openingTargets, OPENING_TARGETS)
    || SELECTION.protocol.nodes !== NODES || SELECTION.protocol.skill !== 20
    || SELECTION.protocol.threads !== 1 || SELECTION.protocol.hashMb !== 32
    || SELECTION.protocol.maxPlies !== 400) throw new Error('The frozen cross-level selection changed.');
  for (const source of SELECTION.additionalSources) if (sha(read(source.file).toString('utf8').replace(/\r\n/g, '\n')) !== source.sha256) throw new Error(`The frozen Hippogriff source changed: ${source.file}.`);
  if (sha(read(SELECTION.previousSelection.file).toString('utf8').replace(/\r\n/g, '\n')) !== SELECTION.previousSelection.sha256) throw new Error('The preceding cross-level declaration changed.');
  const canonical = require('../../src/balance-designs-v18-prepanel-level3').NEW_DEFINITIONS.find(row => row.id === 'knight.level3-nz@1');
  const body = SELECTION.additionalBodies.find(row => row.id === canonical?.id);
  const anchor = require('./official-references').getOfficialReferences().roster.find(row => row.id === body?.anchorId);
  if (!canonical || !body || !anchor || !isDeepStrictEqual(body.prior, anchor.engineValue)
    || ['family', 'level', 'movement', 'placement', 'roles'].some(key => !isDeepStrictEqual(body[key], canonical[key]))) throw new Error('The Hippogriff semantics or historical Unicorn search prior changed.');
}
function getSelectionReceipt() { return { file: SELECTION_FILE, sha256: SELECTION_SHA256, id: SELECTION.id }; }
verifyFrozenInputs();
const CANDIDATES = freeze(Object.fromEntries([1, 2, 3].map(level => [level,
  SELECTION.included.find(row => row.level === level).ids.map(id => roster.getTierRoster(level).find(body => body.id === id)
    || SELECTION.additionalBodies.find(body => body.id === id))
    .map(body => ({ ...body, researchLabel: body.researchLabel || body.label, label: SELECTION.aliases[body.id] || body.label,
      army: singleArmy(body), count: 1, upgradePoints: level }))])));
if ([1, 2, 3].some(level => CANDIDATES[level].length !== { 1: 10, 2: 11, 3: 11 }[level]
  || CANDIDATES[level].some(body => body.family === 'king' || body.placement !== 'replace'))) throw new Error('The selected cross-level roster dimensions or placement changed.');
function candidates(level) {
  if (![1, 2, 3].includes(Number(level))) throw new Error('Choose cross-level roster tier 1, 2 or 3.');
  return CANDIDATES[Number(level)];
}
function references(level) { return candidates(level).filter(body => body.reference); }

const GROUPS = [], UNAVAILABLE = [];
for (const [oneIndex, l1] of candidates(1).entries()) for (const [twoIndex, l2] of candidates(2).entries()) {
  const id = `g${String(oneIndex * candidates(2).length + twoIndex + 1).padStart(3, '0')}`;
  const base = { id, l1, l2, sameFamily: l1.family === l2.family, cohort: 'standard', upgradePoints: 3 };
  if (l1.family === 'queen' && l2.family === 'queen') {
    UNAVAILABLE.push({ ...base, reason: 'A standard starting army has only one queen; upgrades do not stack and no extra queens are introduced.',
      opponents: candidates(3).map(body => ({ id: body.id, key: body.key, label: body.label })) });
    continue;
  }
  GROUPS.push({ ...base, slots: base.sameFamily ? HOMES[l1.family] : [HOME[l1.family], HOME[l2.family]],
    label: `${l1.label} + ${l2.label}` });
}
freeze(GROUPS); freeze(UNAVAILABLE);
if (GROUPS.length !== 106 || UNAVAILABLE.length !== 4) throw new Error('The pinned cross-level roster dimensions changed.');
const groupMap = new Map(GROUPS.map(group => [group.id, group]));
function groups() { return GROUPS; }
function unavailable() { return UNAVAILABLE; }
function getGroup(id) {
  const group = groupMap.get(id); if (!group) throw new Error(`Unknown or unavailable cross-level group: ${String(id)}.`); return group;
}
function teamArmy(group, placement) {
  if (![0, 1].includes(placement) || placement === 1 && !group.sameFamily) throw new Error('This cross-level group has no such placement arm.');
  const slots = placement === 1 ? [...group.slots].reverse() : group.slots;
  return { upgrades: { [slots[0]]: group.l1.id, [slots[1]]: group.l2.id } };
}
function cell(group, l3) {
  const id = 'c' + sha([group.l1.id, group.l2.id, l3.id]).slice(0, 20);
  return { id, cellId: id, groupId: group.id,
    designL1: group.l1.id, designL2: group.l2.id, designL3: l3.id,
    l1Key: group.l1.key, l2Key: group.l2.key, l3Key: l3.key,
    aKey: group.id, aLabel: group.label, bKey: l3.key, bLabel: l3.label,
    cohort: 'standard', kind: 'cross', sameFamily: group.sameFamily };
}
const CELLS = freeze(GROUPS.flatMap(group => candidates(3).map(l3 => cell(group, l3))));
if (CELLS.length !== 1166 || new Set(CELLS.map(row => row.id)).size !== CELLS.length) throw new Error('Cross-level cell identities changed or collide.');
function matches() { return CELLS; }
function getValueAudit(groupId) {
  const group = getGroup(groupId), selected = [group.l1, group.l2, ...candidates(3)];
  return freeze({ sources: [roster.getRosterReceipt(), roster.getValueReceipt(), getSelectionReceipt(), ...SELECTION.additionalSources],
    policy: 'Retain selected roster-005 designs and their declared MG/EG search priors. Hippogriff uses the existing three-point NZ identity and its historical Unicorn anchor 1663/1877. All six native value tables and both colors use these priors. Purchase costs, team scores and fitted material values remain distinct. This panel collects new L1+L2 versus L3 armies; no previous outcome is imported.',
    values: selected.map(body => ({ id: body.id, movement: body.movement, applied: body.prior,
      anchorId: body.anchorId, source: body.priorSource })) });
}
const declarationCache = new Map(), profileCache = new Map(), descriptorCache = new Map();
function stageIdentity(groupId, batchIndex, placement) { return `b${String(batchIndex + 1).padStart(2, '0')}-${groupId}-p${placement}`; }
function getBatchDeclaration(groupId, batchIndex, placement = 0) {
  checkBatch(batchIndex);
  const group = getGroup(groupId), armyA = teamArmy(group, placement), id = stageIdentity(groupId, batchIndex, placement);
  if (declarationCache.has(id)) return declarationCache.get(id);
  const cells = candidates(3).map(l3 => cell(group, l3));
  const openingRows = BOOK.openings.map((opening, index) => ({ ...opening, index }))
    .slice(batchIndex * 8, batchIndex * 8 + 8)
    .filter(row => !group.sameFamily || (row.index + batchIndex) % 2 === placement);
  const audit = getValueAudit(groupId);
  const config = normalizeConfig({ schemaVersion: 3,
    name: `Version 19 cross-level ${groupId}, batch ${batchIndex + 1}, placement ${placement}`,
    seed: 20261126 + batchIndex * 1000 + Number(groupId.slice(1)) * 2 + placement,
    repetitions: 1, engine: { nodes: NODES, threads: 1, hashMb: 32, maxPlies: 400 },
    openings: openingRows.map(({ id, moves }) => ({ id, moves })),
    comparisons: cells.map((comparison, index) => ({ id: comparison.id,
      label: `${comparison.aLabel} versus ${comparison.bLabel}`,
      armyA, armyB: singleArmy(candidates(3)[index]), strengthA: { skill: 20 }, strengthB: { skill: 20 } })),
    evaluation: { pieceValues: Object.fromEntries(audit.values.map(row => [row.id, row.applied])) } });
  const declaration = freeze({ experiment: `v19-cross-${id}-n${NODES}`, file: null, config,
    metadata: { kind: 'v19-cross-level-l1-l2-versus-l3', study: STUDY, nodes: NODES, batchIndex,
      stageId: id, groupId, group, placement, cohort: 'standard', scheduledGames: cells.length * openingRows.length * 2,
      symmetric: false, rows: [{ key: group.id, label: group.label }],
      columns: candidates(3).map(({ key, label }) => ({ key, label })),
      comparisons: cells, referenceKeys: references(3).map(body => body.key),
      referenceValueProfile: 'official-standalone', evaluationAudit: audit,
      question: 'Compare every legal standard-army pair of one L1 and one L2 board upgrade with each L3 board upgrade, retaining both physical colors and shared opening cases.',
      selection: getSelectionReceipt(), exclusions: SELECTION.exclusions,
      homes: { l1: Object.keys(armyA.upgrades).find(square => armyA.upgrades[square] === group.l1.id),
        l2: Object.keys(armyA.upgrades).find(square => armyA.upgrades[square] === group.l2.id), l3: HOME },
      placementPolicy: 'Same-family L1/L2 purchases alternate the two ordinary home squares by (global opening index + eight-case batch index) modulo two. Every physical-color pair uses the same relative placement. Each opening family changes placement in the next batch.',
      openings: { file: OPENINGS_FILE, sha256: OPENINGS_SHA256, policy: BOOK.policy,
        cases: openingRows.map(({ id, family, label }) => ({ id, family, label })) } } });
  declarationCache.set(id, declaration); return declaration;
}
function getStageDeclaration(input) {
  const id = typeof input === 'object' && input ? input.id : input;
  const match = typeof id === 'string' && id.match(/^b(0[1-8])-(g\d{3})-p([01])$/);
  if (!match) throw new Error('Invalid cross-level stage identity.');
  return getBatchDeclaration(match[2], Number(match[1]) - 1, Number(match[3]));
}
function getStageDescriptors(batchIndex) {
  checkBatch(batchIndex); if (descriptorCache.has(batchIndex)) return descriptorCache.get(batchIndex);
  const stages = GROUPS.flatMap(group => (group.sameFamily ? [0, 1] : [0]).map(placement => {
    const declaration = getBatchDeclaration(group.id, batchIndex, placement);
    let identity = profileCache.get(group.id);
    if (!identity) {
      const registry = createDesignRegistry(declaration.config), profile = compileDesignProfile(registry, declaration.config.evaluation);
      if (registry.definitions.length !== 13 || registry.definitions.some(body => body.family === 'king' || body.placement === 'reserve')
        || profile.roles.reserveTypes?.length) throw new Error('A cross-level group changed its thirteen-type, grant-free profile.');
      identity = { registryHash: registry.hash, profileHash: profile.hash }; profileCache.set(group.id, identity);
    }
    const id = declaration.metadata.stageId;
    return { id, directory: id, experiment: declaration.experiment, batchIndex, groupId: group.id, placement,
      nodes: NODES, games: declaration.metadata.scheduledGames, openingIds: declaration.config.openings.map(row => row.id),
      configSha256: sha(declaration.config), scheduleSha256: sha(makeSchedule(declaration.config)), ...identity };
  }));
  freeze(stages); descriptorCache.set(batchIndex, stages); return stages;
}
function expectedGames(study, openings) {
  checkStudy(study); if (!OPENING_TARGETS.includes(openings)) throw new Error('Choose 8, 16, 32 or 64 total cross-level openings.');
  return CELLS.length * openings * 2;
}
function buildCampaignPlan({ study = STUDY, jobs = 4 } = {}) {
  checkStudy(study); if (!Number.isInteger(jobs) || jobs < 1 || jobs > 16) throw new Error('Jobs must be 1 through 16.');
  return freeze({ schemaVersion: 1, format: FORMAT, study, jobs, nodes: [NODES], games: expectedGames(study, 64),
    openingTargets: OPENING_TARGETS, batchSize: 8, roster: [1, 2, 3].map(level => ({ level, bodies: candidates(level) })),
    references: references(3), groups: GROUPS, unavailable: UNAVAILABLE,
    unavailableCells: UNAVAILABLE.length * candidates(3).length, scheduledCells: CELLS.length,
    rosterReceipt: roster.getRosterReceipt(), valueReceipt: roster.getValueReceipt(), selectionReceipt: getSelectionReceipt(),
    book: { file: OPENINGS_FILE, sha256: OPENINGS_SHA256, policy: BOOK.policy,
      openingIds: OPENINGS.map(row => row.id), families: BOOK.families },
    policy: { grants: 'excluded', queenPairs: 'unavailable-standard-army', priorPolicy: 'roster-005-frozen', exclusions: SELECTION.exclusions,
      teamBudget: 3, opponentBudget: 3, sameFamilyPlacement: 'global-index-plus-batch-parity', newCollection: true },
    stages: Array.from({ length: 8 }, (_, batchIndex) => getStageDescriptors(batchIndex)).flat() });
}
function selectedStages(openings, plan) {
  expectedGames(plan.study, openings); return plan.stages.filter(stage => stage.batchIndex < openings / 8);
}
async function checkExperiment(declaration, options = {}) {
  const proof = await require('../version17-balance').checkExperiment(declaration, options);
  const registry = createDesignRegistry(declaration.config), profile = compileDesignProfile(registry, declaration.config.evaluation);
  const probes = [...new Map([
    ...require('../../src/v19-expanded-capability-probes').revisionProbes(profile),
    ...require('../../src/balance-designs-v18-prepanel-level3').revisionProbes(profile),
  ].map(probe => [probe.fen, probe])).values()];
  const rules = await require('../../dist/balance-rules.cjs').createMatchRules({ profile });
  let engine, directory;
  try {
    if (options.enginePath) {
      directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-cross-probes-'));
      const variantPath = path.join(directory, 'profile.ini'); fs.writeFileSync(variantPath, profile.config);
      const { UciEngine } = require('./uci');
      engine = new UciEngine({ path: options.enginePath, variantPath, variant: profile.variant,
        options: { skill: 20, threads: 1, hash: 32 } }); await engine.start({ signal: options.signal });
    }
    for (const probe of probes) {
      if (options.signal?.aborted) throw new Error('Cross-level movement validation cancelled.');
      const board = rules.createBoard(probe.fen);
      try {
        if (engine && !isDeepStrictEqual([...board.moves()].sort(), [...await engine.perft({ fen: probe.fen, signal: options.signal })].sort())) throw new Error(`Native cross-level movement differs: ${probe.name}.`);
      } finally { board.dispose(); }
    }
    proof.panelMovementChecks = probes.length;
    proof.crossLevelStage = { groupId: declaration.metadata.groupId, placement: declaration.metadata.placement, batchIndex: declaration.metadata.batchIndex };
    proof.sharedBook = { file: OPENINGS_FILE, sha256: OPENINGS_SHA256, ordinaryPrefixes: 64, checkedBatch: declaration.metadata.batchIndex };
    options.onProgress?.(`Cross-level validation: ${probes.length} expanded-roster movement probes passed${engine ? ' native/WASM agreement' : ' browser rules'}.`);
    return proof;
  } finally {
    await engine?.close(); if (directory) fs.rmSync(directory, { recursive: true, force: true });
  }
}
function reportStudy(manifest, stages) {
  return require('./v19-cross-level-report').createCrossLevelReport({ manifest, stages, planTools: module.exports });
}
function renderReport(report) { return require('./v19-cross-level-report').renderCrossLevelReport(report); }

module.exports = { ROOT, FORMAT, STUDY, STUDIES, NODES, OPENING_TARGETS, HOME, HOMES, BOOK, OPENINGS,
  OPENINGS_FILE, OPENINGS_SHA256, SELECTION, SELECTION_FILE, SELECTION_SHA256, getSelectionReceipt,
  verifyFrozenInputs, candidates, references, groups, unavailable, getGroup,
  teamArmy, matches, getValueAudit, getBatchDeclaration, getStageDeclaration, getStageDescriptors,
  expectedGames, buildCampaignPlan, selectedStages, checkExperiment, reportStudy, renderReport };
