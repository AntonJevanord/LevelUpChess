'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { Chess } = require('chess.js');
const { CONFIG_FILE, EXCLUSION_FILE, getStudyProtocol, createStudyPlan } = require('../scripts/balance/material-study-plan');
const { getCollectionProtocol, createCollectionPlan, createPlanForProtocol } = require('../scripts/balance/material-collection-plan');

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const sha256 = value => createHash('sha256').update(value).digest('hex');
let fixturePositions;
function positions() {
  if (fixturePositions) return fixturePositions;
  const queue = [START], result = [], seen = new Set();
  for (let index = 0; index < queue.length && result.length < 600; index++) {
    const fen = queue[index], key = fen.split(' ').slice(0, 4).join(' ');
    if (seen.has(key)) continue;
    seen.add(key); result.push(fen);
    const board = new Chess(fen);
    for (const move of board.moves({ verbose: true })) {
      if (move.captured || move.promotion) continue;
      board.move(move); queue.push(board.fen()); board.undo();
    }
  }
  assert.equal(result.length, 600);
  fixturePositions = result; return result;
}
const book = list => Buffer.from(list.map(fen => `${fen};`).join('\n') + '\n');
function fakeRules() {
  let created = 0, disposed = 0;
  return { factory: async () => ({ createBoard() {
    created++; return { outcome: () => null, dispose() { disposed++; } };
  } }), counts: () => ({ created, disposed }) };
}

test('study freezes 1152 games, four jobs, complete triplet checkpoints and analysis anchors', () => {
  const data = getStudyProtocol(), pilot = getCollectionProtocol();
  assert.equal(data.protocol.id, 'material-collection-v16-confirmation-001');
  assert.deepEqual(data.settings, { seed: 42, nodes: 20000, threads: 1, hashMb: 32,
    maxPlies: 400, skill: 20, bookPositions: 384, totalGames: 1152 });
  assert.deepEqual(data.study, { jobs: 4, checkpoints: [384, 768, 1152],
    analysis: { anchors: { pawn: 1, queen: 9 }, ridge: 0.001, bootstrap: 200, validationFolds: 5 } });
  assert.deepEqual(data.registry, pilot.registry); assert.deepEqual(data.profile, pilot.profile);
  assert.equal(data.profile.evaluation, undefined);
  assert.equal(data.exclusions.count, 32);
  assert.equal(data.exclusions.sourcePlanId, pilot.protocol.id);
  assert.equal(data.exclusions.sourceSha256, sha256(fs.readFileSync(EXCLUSION_FILE, 'utf8').replace(/\r\n/g, '\n')));
  assert.equal(new Set(data.exclusions.positions.map(position => position.positionSha256)).size, 32);
  assert.ok(Object.isFrozen(data.study.analysis.anchors)); assert.ok(Object.isFrozen(data.exclusions.positions[0]));
});

test('fresh selection excludes pilot positions and counter-only duplicates before deterministic sampling', async () => {
  const frozen = getStudyProtocol(), pilotPositions = frozen.exclusions.positions.map(position => position.fen);
  const duplicate = pilotPositions[0].split(' '); duplicate[4] = '7'; duplicate[5] = '99';
  const alternatePlacement = pilotPositions[0].split(' ');
  alternatePlacement[0] = alternatePlacement[0].replace(/[2-8]/g, digit => '1'.repeat(Number(digit)));
  const bytes = book([...pilotPositions, duplicate.join(' '), alternatePlacement.join(' '), ...positions()]), rules = fakeRules();
  const first = await createStudyPlan(bytes, { bookName: 'C:\\research\\chess.epd', rulesFactory: rules.factory });
  const second = await createStudyPlan(bytes, { bookName: 'C:\\research\\chess.epd', rulesFactory: rules.factory });
  assert.deepEqual(first, second);
  assert.equal(first.book.name, 'chess.epd'); assert.equal(first.book.sha256, sha256(bytes));
  assert.equal(first.book.excludedPilotPositionsFound, 32);
  assert.equal(first.book.reasonCounts['excluded-pilot-position'], 32);
  assert.ok(first.book.reasonCounts['duplicate-physical-position'] >= 2);
  assert.equal(first.book.uniqueFullMaterialCandidates - first.book.eligibleAfterExclusions, 32);
  const excluded = new Set(frozen.exclusions.positions.map(position => position.positionSha256));
  assert.equal(first.openings.length, 384); assert.equal(first.schedule.length, 1152); assert.equal(first.units.length, 768);
  assert.ok(first.openings.every(opening => !excluded.has(opening.positionSha256)));
  assert.equal(new Set(first.openings.map(opening => opening.positionSha256)).size, 384);
  assert.ok(first.openings.every(opening => opening.id.startsWith('fresh-')));
  assert.deepEqual(rules.counts(), { created: 2304, disposed: 2304 });
  assert.ok(Object.isFrozen(first.exclusions)); assert.ok(Object.isFrozen(first.study.checkpoints));
});

test('each cumulative checkpoint ends on complete matched positions without repeating ordinary controls', async () => {
  const plan = await createStudyPlan(book(positions()), { rulesFactory: fakeRules().factory });
  const amazon = plan.registry.allocations[0].letter;
  for (const stop of plan.study.checkpoints) {
    const prefix = plan.schedule.slice(0, stop), groups = new Map();
    for (const game of prefix) {
      const group = groups.get(game.openingId) || [];
      group.push(game); groups.set(game.openingId, group);
    }
    assert.equal(groups.size, stop / 3);
    assert.equal(prefix.filter(game => game.kind === 'ordinary').length, stop / 3);
    assert.equal(prefix.filter(game => game.kind === 'amazon').length, 2 * stop / 3);
    for (const [id, members] of groups) {
      assert.equal(members.length, 3); assert.deepEqual(members.map(game => game.initialUpgradeDifference), [0, 1, -1]);
      const original = plan.openings.find(opening => opening.id === id).fen;
      assert.equal(members[0].startFen, original);
      assert.equal(members[1].startFen, original.replace('Q', amazon.toUpperCase()));
      assert.equal(members[2].startFen, original.replace('q', amazon));
      assert.equal(members[1].unitId, members[2].unitId);
    }
  }
});

test('study refuses insufficient fresh positions, undocumented overrides and invalid internal bounds', async () => {
  await assert.rejects(createStudyPlan(book(positions().slice(0, 383)), { rulesFactory: fakeRules().factory }), /only \d+ usable positions.*requires 384/);
  await assert.rejects(createStudyPlan(book(positions()), { count: 100 }), /Unsupported/);
  await assert.rejects(createStudyPlan(book(positions()), { jobs: 2 }), /Unsupported/);
  await assert.rejects(createPlanForProtocol(book(positions()), { settings: { bookPositions: 501, totalGames: 1503 } }), /bounded collection protocol/);
  // The public pilot stays fixed at 32 positions/96 games and cannot receive a
  // new cap through options used by the shared implementation.
  const pilot = await createCollectionPlan(book(positions().slice(0, 40)), { rulesFactory: fakeRules().factory });
  assert.equal(pilot.schedule.length, 96); assert.equal(pilot.study, undefined); assert.equal(pilot.exclusions, undefined);
});

test('study protocol and exclusions tolerate CRLF but reject changed settings or source', t => {
  const original = fs.readFileSync;
  let editConfig = text => text.replace(/\n/g, '\r\n'), editExclusions = text => text.replace(/\n/g, '\r\n');
  t.mock.method(fs, 'readFileSync', (file, ...args) => {
    const result = original(file, ...args);
    if (String(file) === CONFIG_FILE) return editConfig(String(result));
    if (String(file) === EXCLUSION_FILE) return editExclusions(String(result));
    return result;
  });
  assert.equal(getStudyProtocol().protocol.totalGames, 1152);
  editConfig = text => text.replace('1152', '1153');
  assert.throws(getStudyProtocol, /protocol changed/);
  editConfig = text => text;
  editExclusions = text => text.replace('book-001', 'changed-001');
  assert.throws(getStudyProtocol, /exclusion source changed/);
});

test('actual browser rules accept every full study condition while excluding all pilot positions', async () => {
  const plan = await createStudyPlan(book(positions()));
  assert.equal(plan.schedule.length, 1152);
  const excluded = new Set(plan.exclusions.positions.map(position => position.positionSha256));
  assert.ok(plan.openings.every(opening => !excluded.has(opening.positionSha256)));
});
