'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { getDecisionProtocol, createDecisionPlan, validateDecisionPlan, validateDecisionStage } = require('../scripts/balance/bishop-decision-plan');
const { loadExpectedGames } = require('../scripts/balance/reference-matrix');
const { validateDecisionEvidence } = require('../scripts/balance/bishop-decision-evidence');
const rulesFactory = async () => ({ createBoard: () => ({ outcome: () => null, dispose() {} }) });
let pending;
const getPlan = () => pending ||= createDecisionPlan({ rulesFactory });
function missing() {
  const done = new Set(getDecisionProtocol().restoredRecords.map(row => row.id));
  return loadExpectedGames().schedule.filter(row => !done.has(row.id));
}
function synthetic(game) {
  // Scheduling fixture only; source replay rejects histories that do not
  // actually belong to their declared position before any game can start.
  return { ...structuredClone(getDecisionProtocol().restoredRecords[0]), ...game };
}
function input(t, records) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-decision-plan-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, 'games.jsonl'), records.map(JSON.stringify).join('\n') + '\n');
  return directory;
}
test('decision freezes only the 192 missing games and five new paired comparisons', async () => {
  const plan = await getPlan(); assert.equal(validateDecisionPlan(plan), plan);
  assert.equal(plan.totalGames, 1472); assert.equal(plan.openings.length, 128);
  assert.equal(plan.restoredRecords.length, 320); assert.equal(plan.inheritedBishopRecords.length, 512);
  const [restore, compare] = plan.stages;
  assert.equal(restore.plan.schedule.length, 192); assert.equal(compare.plan.schedule.length, 1280);
  assert.deepEqual(compare.plan.study.checkpoints, [320, 640, 1280]);
  const existing = new Set(plan.restoredRecords.map(row => row.id));
  assert.ok(restore.plan.schedule.every(row => !existing.has(row.id)));
  assert.deepEqual([...new Set(compare.plan.schedule.map(row => row.designA))], ['bishop.purple@12', 'bishop.purple@13']);
  assert.ok(compare.plan.schedule.every(row => !(row.designA === 'bishop.purple@12' && row.designB === 'rook.purple@10')));
  for (const stage of plan.stages) { assert.equal(validateDecisionStage(stage.plan), stage.plan);
    for (const unit of stage.plan.units) assert.deepEqual(unit.gameIds.map(id => stage.plan.schedule.find(row => row.id === id).aColor), ['w', 'b']); }
});
test('allocation and native policy preserve old contexts and add only the lame bishop', async () => {
  const library = getDecisionProtocol(), plan = await getPlan();
  assert.equal(library.registry.definitions.length, 13);
  for (const old of library.old.registry.allocations) assert.deepEqual(library.registry.allocations.find(row => row.id === old.id), old);
  assert.equal(library.profile.definitionsByLetter.m.movement, 'BsR2nsN');
  assert.deepEqual(plan.stages[0].plan.profile, library.revision.profile);
  assert.equal(plan.stages[0].plan.profile.evaluation, undefined);
  assert.deepEqual(plan.stages[1].plan.profile.evaluation, { pieceValues: { 'rook.purple@9': { mg: 2538, eg: 2682 } } });
});
test('recovering all old histories skips restoration instead of replaying them', async t => {
  const revisions = input(t, missing().map(synthetic));
  const plan = await createDecisionPlan({ revisions, rulesFactory });
  assert.equal(plan.totalGames, 1280); assert.equal(plan.restoredRecords.length, 512);
  assert.deepEqual(plan.stages[0].plan.schedule, []); assert.deepEqual(plan.stages[0].plan.study.checkpoints, []);
  validateDecisionPlan(plan);
});
test('a recovered single color removes exactly one game and retains its missing partner', async t => {
  const [game] = missing(), revisions = input(t, [synthetic(game)]);
  const plan = await createDecisionPlan({ revisions, rulesFactory });
  assert.equal(plan.totalGames, 1471); assert.equal(plan.stages[0].plan.schedule.length, 191);
  assert.ok(!plan.stages[0].plan.schedule.some(row => row.id === game.id));
  assert.ok(plan.stages[0].plan.units.some(unit => unit.id === game.unitId && unit.gameIds.length === 1));
  validateDecisionPlan(plan); validateDecisionStage(plan.stages[0].plan);
});
test('historical truncations stay unscored and are not recreated', async t => {
  const [game] = missing(), row = synthetic(game);
  Object.assign(row, { status: 'truncated', result: '*', reason: 'max-plies',
    moves: Array(400).fill('a2a3'), sans: Array(400).fill('a3'), totalPlies: 400, playedPlies: 400 });
  const plan = await createDecisionPlan({ revisions: input(t, [row]), rulesFactory });
  assert.equal(plan.totalGames, 1471);
  assert.ok(!plan.stages[0].plan.schedule.some(item => item.id === game.id));
});
test('changes to schedules, originals and profile policy are rejected', async () => {
  const plan = await getPlan();
  for (const mutate of [p => p.stages[1].plan.settings.nodes++, p => p.stages[0].plan.schedule.reverse(),
    p => p.stages[1].plan.schedule[0].designB = 'rook.purple@2',
    p => p.restoredRecords[0].result = 'bogus', p => p.inheritedBishopRecords.pop(),
    p => p.sourceEvidence[0].sha256 = '0'.repeat(64)]) {
    const changed = structuredClone(plan); mutate(changed); assert.throws(() => validateDecisionPlan(changed));
  }
  const stage = structuredClone(plan.stages[0].plan); stage.schedule[0] = loadExpectedGames().schedule[0];
  assert.throws(() => validateDecisionStage(stage), /missing|changed|distinct/);
});
test('raw evidence and embedded selected histories must agree, including source snapshots', async t => {
  const plan = await getPlan(), directory = input(t, []); fs.mkdirSync(path.join(directory, 'evidence'));
  for (const item of plan.sourceEvidence) fs.copyFileSync(path.resolve(__dirname, '..', item.file), path.join(directory, 'evidence', item.name));
  assert.equal(validateDecisionEvidence(plan, { directory }).restoredGames, 320);
  fs.appendFileSync(path.join(directory, 'evidence', 'bishop.games.jsonl'), ' ');
  assert.throws(() => validateDecisionEvidence(plan, { directory }), /changed/);
});
test('blocked wide-knight movement uses the first sideways leg in both colors', async () => {
  const library = getDecisionProtocol(), rules = await require('../dist/balance-rules.cjs').createMatchRules({ profile: library.profile });
  const mirror = fen => { const f = fen.split(' '); f[0] = f[0].split('/').reverse().join('/').replace(/[a-z]/gi, c => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()); f[1] = 'b'; return f.join(' '); };
  const move = (m, black) => black ? m[0] + (9 - Number(m[1])) + m[2] + (9 - Number(m[3])) : m;
  for (const black of [false, true]) for (const [rank, allowed] of [['3MP3', false], ['3M1P2', true], ['3Mp3', false], ['3M1p2', true]]) {
    const fen = `8/7k/8/5p2/${rank}/8/8/K7 w - - 0 1`;
    const board = rules.createBoard(black ? mirror(fen) : fen);
    try { assert.equal(board.moves().includes(move('d4f5', black)), allowed); } finally { board.dispose(); }
    const originalFen = fen.replace('M', 'J'), original = rules.createBoard(black ? mirror(originalFen) : originalFen);
    try { assert.ok(original.moves().includes(move('d4f5', black))); } finally { original.dispose(); }
  }
});
