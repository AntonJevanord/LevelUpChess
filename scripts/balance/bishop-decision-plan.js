'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { getBishopProtocol } = require('./bishop-plan');
const { getRevisionProtocol } = require('./revision-plan');
const { createDesignRegistry } = require('./design-registry');
const { compileDesignProfile } = require('./design-profile');
const { loadExpectedGames, readJournalSnapshot, recoverRevisionRecords } = require('./reference-matrix');
const ROOT = path.resolve(__dirname, '../..');
const CONFIG_FILE = path.join(ROOT, 'experiments/balance/bishop-decision.json');
const EXPECTED = {
  "schemaVersion": 1,
  "id": "bishop-decision-v16-001",
  "seed": 42,
  "jobs": 4,
  "positions": 128,
  "maxNewGames": 1472,
  "comparisonGames": 1280,
  "comparisonCheckpoints": [
    320,
    640,
    1280
  ],
  "engine": {
    "nodes": 20000,
    "threads": 1,
    "hashMb": 32,
    "maxPlies": 400
  },
  "strength": {
    "skill": 20
  },
  "analysis": {
    "bootstrap": 200,
    "confidence": 0.95
  },
  "candidates": [
    "bishop.purple@7",
    "bishop.purple@12",
    "bishop.purple@13"
  ],
  "references": [
    "rook.purple@10",
    "knight.purple@3",
    "queen.purple@1"
  ],
  "newMovement": "BsR2nsN",
  "selection": "Restore only absent short-side bishop/Camel/Amazon cells, then compare the long quiet-hop and lame wide-knight bishops with fixed references. Reuse both existing bishop/rook matchups; close this bishop decision at the cap."
};
const SOURCE_FILES = [
  ['bishop.games.jsonl', 'experiments/balance/results/bishop-reference-001.games.jsonl', 'a54f1b4bf55e7ad5259aa465285605d23f8a999a4f3f045a18d3cc6a58b910da'],
  ['bishop-report.json', 'experiments/balance/results/bishop-reference-001.uploaded-report.json', '64b54f3a83f7fe74609fc8f96571edebcacf0006a71d824a648bcbfd20b5f1a5'],
  ['bishop-audit.json', 'experiments/balance/results/bishop-reference-001.audit.json', '4c0783cf60c7654a161879d0c667aa2195f89e3ea9461616b776db76a9589b93'],
  ['recovered-revisions.games.jsonl', 'experiments/balance/results/short-side-revision-recovery-001.games.jsonl', 'c5e3d9c38b14f354c4febda2fa35dfce1fc35b7cb76140191274ccb3e5dee7c0'],
  ['expected-revisions.json', 'experiments/balance/results/reference-matrix.expected-games.json', '44f7d047c3d43aac01aa22e602fbf92ca380fef5241bd5a17fb9defc1042f8ad'],
];
const sha = value => createHash('sha256').update(value).digest('hex');
const fail = message => { throw new Error(message); };
const clone = value => JSON.parse(JSON.stringify(value));
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
let cached;
function getDecisionProtocol() {
  const configBytes = fs.readFileSync(CONFIG_FILE), config = configBytes.toString('utf8').replace(/\r\n/g, '\n');
  if (!isDeepStrictEqual(JSON.parse(config), EXPECTED)) fail('The frozen bishop decision declaration changed.');
  const bytes = {};
  for (const [name, file, digest] of SOURCE_FILES) {
    bytes[name] = fs.readFileSync(path.join(ROOT, file));
    if (sha(bytes[name]) !== digest) fail(`Pinned decision evidence changed: ${name}.`);
  }
  if (cached) return cached;
  const old = getBishopProtocol(), revision = getRevisionProtocol();
  const roster = [...old.roster, { key: 'lame-side-bishop', label: 'Bishop: blocked wide knight', id: 'bishop.purple@13', family: 'bishop', movement: 'BsR2nsN', role: 'candidate' }];
  const homes = { bishop: 'c1', rook: 'a1', knight: 'b1', queen: 'd1' };
  const registry = createDesignRegistry({ schemaVersion: 2, comparisons: roster.map(item => ({ armyA: { upgrades: { [homes[item.family]]: item.id } }, armyB: {} })) });
  for (const allocation of old.registry.allocations) if (!isDeepStrictEqual(allocation, registry.allocations.find(item => item.id === allocation.id))) fail('A retained decision allocation changed.');
  const profile = compileDesignProfile(registry, old.profile.evaluation);
  const bishopRecords = bytes['bishop.games.jsonl'].toString('utf8').trim().split('\n').map(JSON.parse);
  const report = JSON.parse(bytes['bishop-report.json']), audit = JSON.parse(bytes['bishop-audit.json']);
  if (bishopRecords.length !== 1280 || new Set(bishopRecords.map(row => row.id)).size !== 1280
    || bishopRecords.some(row => row.status !== 'completed' || row.attempt !== 1 || row.profileHash !== old.profile.hash)
    || report.coveredGames !== 1280 || report.profileHash !== old.profile.hash || report.registryHash !== old.registry.hash
    || report.inputs.selectedJournalSha256 !== SOURCE_FILES[0][2] || !audit.checks.allMovesSanFinalOutcomesReplay) fail('The completed bishop source is inconsistent.');
  const recovered = recoverRevisionRecords([{ file: SOURCE_FILES[3][1], records: bytes['recovered-revisions.games.jsonl'].toString('utf8').trim().split('\n').map(JSON.parse) }]);
  const evidence = SOURCE_FILES.map(([name, file, sha256]) => ({ name, file, sha256 }));
  evidence.push({ name: 'declaration.json', file: path.relative(ROOT, CONFIG_FILE).split(path.sep).join('/'), sha256: sha(configBytes) });
  return cached = freeze({ protocol: EXPECTED, roster, registry, profile, old, revision,
    openings: old.parentManifest.plan.openings, bishopRecords,
    inheritedBishopRecords: bishopRecords.filter(row => ['bishop.purple@7', 'bishop.purple@12'].includes(row.designA)),
    restoredRecords: recovered.records, sourceEvidence: evidence, configSha256: sha(config),
    configFiles: [CONFIG_FILE, ...SOURCE_FILES.map(([, file]) => path.join(ROOT, file))] });
}
function pieces(fen) {
  const board = new Map();
  fen.split(' ')[0].split('/').forEach((rank, row) => { let file = 0; for (const c of rank) {
    if (/[1-8]/.test(c)) file += Number(c); else board.set('abcdefgh'[file++] + (8 - row), c);
  } });
  return board;
}
function upgradedFen(opening, white, black, library) {
  const board = pieces(opening.fen), fields = opening.fen.split(' ');
  for (const [color, id] of [['w', white], ['b', black]]) {
    const family = library.roster.find(row => row.id === id).family;
    const letter = library.registry.allocations.find(row => row.id === id).letter;
    board.set(opening.members[color][family], color === 'w' ? letter.toUpperCase() : letter);
  }
  fields[0] = Array.from({ length: 8 }, (_, row) => { let text = '', empty = 0;
    for (const file of 'abcdefgh') { const c = board.get(file + (8 - row)); if (c) { if (empty) text += empty; text += c; empty = 0; } else empty++; }
    return text + (empty || '');
  }).join('/');
  return fields.join(' ');
}
function unitsFor(schedule) {
  const units = new Map(); for (const game of schedule) { const row = units.get(game.unitId) || { id: game.unitId, kind: 'head', gameIds: [] }; row.gameIds.push(game.id); units.set(game.unitId, row); }
  return [...units.values()];
}
function comparisonSchedule(library) {
  const pairs = [['bishop.purple@12', 'knight.purple@3'], ['bishop.purple@12', 'queen.purple@1'],
    ['bishop.purple@13', 'rook.purple@10'], ['bishop.purple@13', 'knight.purple@3'], ['bishop.purple@13', 'queen.purple@1']];
  return library.openings.flatMap(opening => pairs.flatMap(([designA, designB]) => {
    const keyA = library.roster.find(row => row.id === designA).key, keyB = library.roster.find(row => row.id === designB).key;
    const comparisonId = `${keyA}-v-${keyB}`, unitId = `${opening.id.replace('reference-', 'decision-')}-${comparisonId}`;
    return ['w', 'b'].map(aColor => { const whiteDesign = aColor === 'w' ? designA : designB, blackDesign = aColor === 'w' ? designB : designA;
      return { id: `${unitId}-${aColor}`, unitId, pairId: unitId, kind: 'head', aColor, openingId: opening.id,
        groupId: opening.id, comparisonId, startFen: upgradedFen(opening, whiteDesign, blackDesign, library),
        openingMoves: [], designA, designB, whiteDesign, blackDesign };
    });
  }));
}
function stagePlan(key, schedule, library) {
  const historical = key === 'restore', profile = historical ? library.revision.profile : library.profile;
  const registry = historical ? library.revision.registry : library.registry;
  return { schemaVersion: 1, id: `bishop-decision-${key}-v16-001`, key,
    settings: { seed: 42, ...EXPECTED.engine, skill: 20 }, profile, registry,
    roster: historical ? library.revision.roster : library.roster, openings: clone(library.openings),
    schedule, units: unitsFor(schedule), totalGames: schedule.length,
    study: { jobs: 4, checkpoints: historical ? schedule.length ? [schedule.length] : [] : [320, 640, 1280] },
    evidence: [library.sourceEvidence.find(item => item.name === 'declaration.json')],
    interpretation: historical ? 'Recreated absent historical cells under the original ten-type automatic profile; new process identity is retained.'
      : 'New candidates under the expanded profile; old bishop/rook games are reused, never repeated.' };
}
function assemble(restoredRecords, sourceEvidence, library) {
  for (const row of restoredRecords) {
    if (row.moves.length > EXPECTED.engine.maxPlies || row.status === 'truncated'
      && (row.moves.length !== EXPECTED.engine.maxPlies || row.reason !== 'max-plies')) fail('A recovered history contradicts its declared ply cap.');
  }
  const expected = loadExpectedGames(), final = new Map(restoredRecords.filter(row => ['completed', 'truncated'].includes(row.status)).map(row => [row.id, row]));
  const restore = expected.schedule.filter(game => !final.has(game.id));
  if (restore.length > 192) fail('Restoration exceeds 192 absent games.');
  // If one color was recovered, play only its missing partner. The report
  // joins both source contexts into the original complete color pair.
  return { schemaVersion: 1, id: EXPECTED.id, protocol: EXPECTED, openings: clone(library.openings),
    configSha256: library.configSha256, restoredRecords: restoredRecords.filter(row => ['completed', 'truncated'].includes(row.status)),
    inheritedBishopRecords: clone(library.inheritedBishopRecords), sourceEvidence,
    sources: { bishopRunId: JSON.parse(fs.readFileSync(path.join(ROOT, SOURCE_FILES[1][1]))).runId,
      bishopHistoricalManifestSupplied: false, revisionHistoricalManifestSupplied: false,
      interpretation: 'Inherited histories replayed under their canonical profiles; historical process manifests were not supplied. New processes have separate manifests and native diagnostics.' },
    stages: [{ key: 'restore', plan: stagePlan('restore', restore, library) }, { key: 'compare', plan: stagePlan('compare', comparisonSchedule(library), library) }],
    totalGames: restore.length + 1280, maxNewGames: 1472,
    stopRule: 'Close at this schedule; choose among short-side, long quiet-hop and blocked-wide-knight bishops rather than automatically starting another redesign batch.' };
}
async function createDecisionPlan({ revisions, rulesFactory = require('../../dist/balance-rules.cjs').createMatchRules } = {}) {
  const library = getDecisionProtocol(), sources = [{ file: SOURCE_FILES[3][1], records: library.restoredRecords }], evidence = clone(library.sourceEvidence);
  const retained = path.join(ROOT, 'balance-results/reference-revisions/games.jsonl');
  if (revisions === undefined && fs.existsSync(retained)) revisions = retained;
  if (revisions) { const file = path.resolve(revisions), input = fs.statSync(file).isDirectory() ? path.join(file, 'games.jsonl') : file;
    const snapshot = readJournalSnapshot(input); if (snapshot.ignoredTornTailBytes) fail('Use a stopped revision journal with a complete final line.'); sources.push(snapshot);
    evidence.push({ name: 'retained-revisions.games.jsonl', file: input, sha256: snapshot.sha256 });
  }
  const recovered = recoverRevisionRecords(sources), plan = assemble(recovered.records, evidence, library);
  for (const stage of plan.stages) {
    if (!stage.plan.schedule.length) continue;
    const rules = await rulesFactory({ profile: stage.plan.profile });
    for (const game of stage.plan.schedule) { const board = rules.createBoard(game.startFen); try { if (board.outcome()) fail(`Terminal decision start: ${game.id}.`); } finally { board.dispose(); } }
  }
  return freeze(plan);
}
function validateDecisionPlan(plan) {
  const library = getDecisionProtocol();
  if (!plan || plan.schemaVersion !== 1 || plan.id !== EXPECTED.id || !Array.isArray(plan.restoredRecords)
    || !Array.isArray(plan.sourceEvidence)) fail('An intact bishop decision plan is required.');
  const recovered = recoverRevisionRecords([{ file: 'saved-plan', records: plan.restoredRecords }]);
  for (const original of library.restoredRecords) if (!isDeepStrictEqual(recovered.latest.get(original.id), original)) fail('A recovered historical game changed or disappeared.');
  const expectedEvidence = library.sourceEvidence;
  if (!isDeepStrictEqual(plan.sourceEvidence.slice(0, expectedEvidence.length), expectedEvidence)
    || plan.sourceEvidence.length > expectedEvidence.length + 1) fail('Decision source evidence changed.');
  const extra = plan.sourceEvidence[expectedEvidence.length];
  if (extra && (extra.name !== 'retained-revisions.games.jsonl' || typeof extra.file !== 'string' || !/^[a-f0-9]{64}$/.test(extra.sha256))) fail('Invalid retained revision evidence.');
  if (!isDeepStrictEqual(plan, assemble(recovered.records, plan.sourceEvidence, library))) fail('The frozen decision schedule, sources or settings changed.');
  return plan;
}
function validateDecisionStage(plan) {
  const library = getDecisionProtocol();
  if (!plan || !['restore', 'compare'].includes(plan.key)) fail('A declared decision stage is required.');
  let schedule;
  if (plan.key === 'compare') schedule = comparisonSchedule(library);
  else { const byId = new Map(loadExpectedGames().schedule.map(game => [game.id, game]));
    schedule = plan.schedule.map(game => { const expected = byId.get(game.id); if (!isDeepStrictEqual(game, expected)) fail('A restoration cell changed.'); return expected; });
    if (schedule.length > 192) fail('Restoration exceeds its declared cap.');
    const fixed = new Set(library.restoredRecords.filter(row => ['completed', 'truncated'].includes(row.status)).map(row => row.id));
    const ids = new Set(schedule.map(game => game.id));
    if (ids.size !== schedule.length || schedule.some(game => fixed.has(game.id))
      || !isDeepStrictEqual(schedule, loadExpectedGames().schedule.filter(game => ids.has(game.id)))) fail('Restoration must contain distinct missing cells in their original order.');
  }
  if (!isDeepStrictEqual(plan, stagePlan(plan.key, schedule, library))) fail('The decision stage changed.');
  return plan;
}
module.exports = { CONFIG_FILE, getDecisionProtocol, createDecisionPlan, validateDecisionPlan, validateDecisionStage };
