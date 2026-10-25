'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { CONFIG_FILE, getReferenceProtocol, createReferencePlan, validateReferencePlan } = require('../scripts/balance/reference-plan');
const { makePositions, makeBook, getPlan } = require('./reference-fixture');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const clone = object => JSON.parse(JSON.stringify(object));
function fakeRules(reject) {
  let created = 0, disposed = 0;
  return { factory: async () => ({ createBoard(fen) {
    created++; return { outcome: () => reject?.(fen) ? { result: '1/2-1/2', reason: 'test-terminal' } : null,
      dispose() { disposed++; } };
  } }), counts: () => ({ created, disposed }) };
}

test('reference protocol freezes all four revisions, roles, 2688 games and prior exclusions', () => {
  const library = getReferenceProtocol();
  assert.equal(library.protocol.id, 'reference-panel-v16-001');
  assert.deepEqual(library.settings, { seed: 42, nodes: 20000, threads: 1, hashMb: 32, maxPlies: 400,
    skill: 20, bookPositions: 128, totalGames: 2688 });
  assert.deepEqual(library.study, { jobs: 4, checkpoints: [672, 1344, 2688], analysis: {
    anchors: { pawn: 1, queen: 9 }, ridge: 0.001, bootstrap: 200, validationFolds: 5, agreementMargin: 0.5 } });
  assert.deepEqual(library.roster.map(entry => entry.id), ['bishop.purple@4', 'rook.purple@2', 'knight.purple@3', 'queen.purple@1']);
  assert.deepEqual(library.registry.definitions.map(definition => definition.movement).sort(), ['BsR2sN', 'NC', 'QN', 'RcN']);
  assert.equal(library.registry.allocations.length, 4); assert.equal(library.profile.evaluation, undefined);
  assert.deepEqual(library.profile.roles.royalTypes, ['k']);
  assert.deepEqual(library.profile.roles.pawnTypes, ['p']);
  assert.equal(library.exclusions.count, 416); assert.equal(new Set(library.exclusions.hashes).size, 416);
  assert.equal(library.exclusions.sources[0].count, 32); assert.equal(library.exclusions.sources[1].count, 384);
  assert.ok(Object.isFrozen(library.protocol.analysis.anchors)); assert.ok(Object.isFrozen(library.roster[0]));
});

test('reference plan is deterministic, excludes both studies and all counter-only physical duplicates', async () => {
  const prior = JSON.parse(fs.readFileSync(require('node:path').resolve(__dirname, '../experiments/balance/results/material-study-001.collection.json'))).plan.openings.map(opening => opening.fen);
  const bytes = Buffer.from([...prior, prior[0].replace(/ \d+ \d+$/, ' 8 99'), ...makePositions()].join('\n') + '\n');
  const fake = fakeRules();
  const first = await createReferencePlan(bytes, { bookName: 'C:\\books\\chess.epd', rulesFactory: fake.factory });
  const second = await createReferencePlan(bytes, { bookName: 'C:\\books\\chess.epd', rulesFactory: fake.factory });
  assert.deepEqual(first, second); assert.equal(first.book.name, 'chess.epd');
  assert.equal(first.book.sha256, sha(bytes)); assert.ok(first.book.reasonCounts['excluded-completed-position'] >= 384);
  assert.ok(first.book.reasonCounts['duplicate-physical-position'] >= 1);
  const excluded = new Set(first.exclusions.hashes);
  assert.ok(first.openings.every(opening => !excluded.has(opening.positionSha256)));
  assert.equal(new Set(first.openings.map(opening => opening.positionSha256)).size, 128);
  assert.deepEqual(fake.counts(), { created: 5376, disposed: 5376 });
  assert.ok(Object.isFrozen(first.schedule[0])); assert.ok(Object.isFrozen(first.openings[0].members.w));
  assert.strictEqual(validateReferencePlan(first), first);
});

test('each position and checkpoint contain complete single-upgrade and six head-to-head pairs', async () => {
  const plan = await getPlan();
  assert.equal(plan.schedule.length, 2688); assert.equal(plan.units.length, 1408);
  assert.equal(plan.schedule.filter(game => game.kind === 'ordinary').length, 128);
  assert.equal(plan.schedule.filter(game => game.kind === 'single').length, 1024);
  assert.equal(plan.schedule.filter(game => game.kind === 'head').length, 1536);
  for (const count of plan.study.checkpoints) {
    const prefix = plan.schedule.slice(0, count), groups = new Set(prefix.map(game => game.openingId));
    assert.equal(groups.size, count / 21);
    assert.ok(plan.schedule.slice(count).every(game => !groups.has(game.openingId)));
    assert.equal(prefix.filter(game => game.kind === 'ordinary').length, count / 21);
  }
  for (const opening of plan.openings) {
    const games = plan.schedule.filter(game => game.openingId === opening.id);
    assert.equal(games.length, 21);
    assert.equal(games[0].startFen, opening.fen);
    assert.equal(new Set(games.map(game => game.unitId)).size, 11);
    const heads = games.filter(game => game.kind === 'head');
    assert.equal(new Set(heads.map(game => game.comparisonId)).size, 6);
    for (const unitId of new Set(heads.map(game => game.unitId))) {
      const pair = heads.filter(game => game.unitId === unitId);
      assert.deepEqual(pair.map(game => game.aColor), ['w', 'b']);
      assert.equal(pair[0].whiteDesign, pair[1].blackDesign);
      assert.equal(pair[0].blackDesign, pair[1].whiteDesign);
    }
    assert.ok(games.every(game => game.startFen.split(' ').slice(1).join(' ') === opening.fen.split(' ').slice(1).join(' ')));
  }
});

test('member parity balances bishop color complexes and preserves actual substitution squares', async () => {
  const plan = await getPlan();
  const color = square => (square.charCodeAt(0) - 97 + Number(square[1]) - 1) % 2;
  for (const side of ['w', 'b']) {
    assert.equal(plan.openings.filter(opening => color(opening.members[side].bishop) === 0).length, 64);
    assert.equal(plan.openings.filter(opening => color(opening.members[side].bishop) === 1).length, 64);
  }
  const rules = await require('../dist/balance-rules.cjs').createMatchRules({ profile: plan.profile });
  for (const game of plan.schedule) {
    const board = rules.createBoard(game.startFen);
    try { assert.equal(board.outcome(), null); } finally { board.dispose(); }
  }
  assert.strictEqual(validateReferencePlan(plan), plan);
});

test('strict validation rejects changed definitions, schedule, members, bounds and physical openings', async () => {
  const frozen = await getPlan();
  for (const edit of [
    plan => plan.study.analysis.bootstrap++, plan => plan.settings.nodes++,
    plan => plan.openings[0].members.w.knight = 'a1', plan => plan.schedule[0].startFen = plan.schedule[1].startFen,
    plan => plan.schedule[10].designA = 'queen.purple@1', plan => plan.units[1].gameIds.reverse(),
    plan => plan.openings[1] = clone(plan.openings[0]), plan => plan.roster.reverse(),
  ]) {
    const changed = clone(frozen); edit(changed); assert.throws(() => validateReferencePlan(changed));
  }
  await assert.rejects(createReferencePlan(makeBook(), { jobs: 2 }), /Unsupported/);
  await assert.rejects(createReferencePlan('bad'), /only 0 usable positions/);
  await assert.rejects(createReferencePlan(Buffer.from([255])), /valid UTF-8/);
  const terminal = fakeRules(() => true);
  await assert.rejects(createReferencePlan(makeBook(), { rulesFactory: terminal.factory }), /only 0 usable positions/);
  assert.equal(terminal.counts().created, terminal.counts().disposed);
});

test('quiet selection rejects new attacks from every reference before any condition is accepted', async () => {
  const { Chess } = require('chess.js');
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  // Each normal army is quiet, but its selected reference gains an attack.
  for (const [from, to, king] of [['b1', 'b1', 'c4'], ['c1', 'c3', 'e4'], ['a1', 'a3', 'b5'], ['d1', 'd3', 'f4']]) {
    const board = new Chess(start), piece = board.remove(from);
    board.put(piece, to); board.remove('e8'); board.put({ type: 'k', color: 'b' }, king);
    const fields = board.fen().split(' '); fields[2] = '-';
    assert.equal(new Chess(fields.join(' ')).isAttacked(king, 'w'), false);
    const fake = fakeRules();
    await assert.rejects(createReferencePlan(fields.join(' ') + '\n', { rulesFactory: fake.factory }), error => {
      assert.equal(error.book.reasonCounts['upgrade-creates-check'], 1); return true;
    });
    assert.deepEqual(fake.counts(), { created: 0, disposed: 0 });
  }
});

test('reference settings and exclusion hashes tolerate CRLF but reject changed frozen evidence', t => {
  const read = fs.readFileSync; let edit = 'none';
  t.mock.method(fs, 'readFileSync', (file, ...args) => {
    let result = read(file, ...args);
    if (typeof result === 'string' && [CONFIG_FILE, ...getFiles()].includes(String(file))) result = result.replace(/\n/g, '\r\n');
    if (edit === 'protocol' && String(file) === CONFIG_FILE) result = String(result).replace('2688', '2689');
    if (edit === 'exclusion' && String(file).endsWith('material-study-preflight-001.json')) result = String(result).replace('128', '129');
    return result;
  });
  function getFiles() { return [require('node:path').resolve(__dirname, '../experiments/balance/results/material-collection-preflight-001.json'),
    require('node:path').resolve(__dirname, '../experiments/balance/results/material-study-preflight-001.json')]; }
  assert.equal(getReferenceProtocol().protocol.totalGames, 2688);
  edit = 'protocol'; assert.throws(getReferenceProtocol, /protocol changed/);
  edit = 'exclusion'; assert.throws(getReferenceProtocol, /exclusion source changed/);
});
