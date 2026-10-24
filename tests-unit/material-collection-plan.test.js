'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { Chess } = require('chess.js');
const { CONFIG_FILE, getCollectionProtocol, createCollectionPlan } = require('../scripts/balance/material-collection-plan');

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
function positions(count = 64) {
  const queue = [START], result = [], seen = new Set();
  for (let index = 0; index < queue.length && result.length < count; index++) {
    const fen = queue[index], key = fen.split(' ').slice(0, 4).join(' ');
    if (seen.has(key)) continue;
    seen.add(key); result.push(fen);
    const board = new Chess(fen);
    for (const move of board.moves({ verbose: true })) {
      if (move.captured || move.promotion) continue;
      board.move(move); queue.push(board.fen()); board.undo();
    }
  }
  assert.equal(result.length, count);
  return result;
}
function fakeRules(onCreate = () => {}) {
  let disposed = 0, created = 0;
  return { factory: async ({ profile }) => ({ createBoard(fen) {
    created++; onCreate(fen, profile);
    return { outcome: () => null, dispose: () => disposed++ };
  } }), counts: () => ({ created, disposed }) };
}
const book = list => Buffer.from(list.map(fen => `${fen};`).join('\n') + '\n');

test('collection protocol fixes one capped Amazon-only pilot and preserves automatic evaluation', () => {
  const data = getCollectionProtocol();
  assert.equal(data.protocol.id, 'material-collection-v16-pilot-001');
  assert.deepEqual(data.settings, { seed: 42, nodes: 20000, threads: 1, hashMb: 32,
    maxPlies: 400, skill: 20, bookPositions: 32, totalGames: 96 });
  assert.deepEqual(data.protocol.sampling, { minPly: 16, stride: 5, stableBefore: 2, stableAfter: 2 });
  assert.deepEqual(data.registry.definitions.map(definition => [definition.id, definition.movement]), [['queen.purple@1', 'QN']]);
  assert.equal(data.profile.evaluation, undefined);
  assert.ok(Object.isFrozen(data.protocol)); assert.ok(Object.isFrozen(data.settings));
});

test('seeded book selection is deterministic and schedules ordinary once plus both upgrade colors', async () => {
  const source = book(positions()), rules = fakeRules();
  const first = await createCollectionPlan(source, { bookName: 'C:\\study\\chess.epd', rulesFactory: rules.factory });
  const second = await createCollectionPlan(source, { bookName: 'C:\\study\\chess.epd', rulesFactory: rules.factory });
  assert.deepEqual(first, second);
  assert.equal(first.book.name, 'chess.epd');
  assert.equal(first.book.sha256, createHash('sha256').update(source).digest('hex'));
  assert.equal(first.openings.length, 32); assert.equal(first.schedule.length, 96); assert.equal(first.units.length, 64);
  assert.equal(new Set(first.schedule.map(game => game.id)).size, 96);
  assert.equal(new Set(first.openings.map(opening => opening.positionSha256)).size, 32);
  const amazon = first.registry.allocations[0].letter;
  for (let index = 0; index < first.openings.length; index++) {
    const opening = first.openings[index], [ordinary, white, black] = first.schedule.slice(index * 3, index * 3 + 3);
    assert.deepEqual([ordinary.initialUpgradeDifference, white.initialUpgradeDifference, black.initialUpgradeDifference], [0, 1, -1]);
    assert.equal(ordinary.startFen, opening.fen); assert.equal(ordinary.aColor, 'w');
    assert.equal(white.aColor, 'w'); assert.equal(black.aColor, 'b');
    assert.equal(white.unitId, black.unitId); assert.notEqual(ordinary.unitId, white.unitId);
    assert.equal(white.startFen, opening.fen.replace('Q', amazon.toUpperCase()));
    assert.equal(black.startFen, opening.fen.replace('q', amazon));
    for (const game of [ordinary, white, black]) {
      assert.equal(game.groupId, opening.id); assert.equal(game.openingId, opening.id);
      assert.equal(game.pairId, game.unitId); assert.deepEqual(game.openingMoves, []);
      assert.deepEqual(game.startFen.split(' ').slice(1), opening.fen.split(' ').slice(1));
    }
  }
  assert.deepEqual(rules.counts(), { created: 192, disposed: 192 });
  assert.ok(Object.isFrozen(first.schedule[0]));
});

test('book filtering records malformed, missing material and counter-only duplicates before selection', async () => {
  const list = positions(40), counterDuplicate = list[0].split(' ');
  counterDuplicate[4] = '3'; counterDuplicate[5] = '50';
  const source = book(['bad fen', list[0].replace('PPPPPPPP', '1PPPPPPP'), list[0], counterDuplicate.join(' '), ...list.slice(1)]);
  const plan = await createCollectionPlan(source, { rulesFactory: fakeRules().factory });
  assert.equal(plan.book.nonemptyLines, 43);
  assert.equal(plan.book.uniqueFullMaterialCandidates, 40);
  assert.deepEqual(plan.book.reasonCounts, { 'invalid-fen': 1, 'material-not-full-standard': 1, 'duplicate-physical-position': 1 });
  assert.equal(plan.book.rejections[2].line, 4);
});

test('queen replacement follows its book square and leaves the other fields unchanged', async () => {
  const board = new Chess();
  for (const move of ['e4', 'e5', 'Qh5']) board.move(move);
  const fen = board.fen(), plan = await createCollectionPlan(book([...positions(31), fen]), { rulesFactory: fakeRules().factory });
  const opening = plan.openings.find(item => item.fen === fen);
  assert.ok(opening);
  const white = plan.schedule.find(game => game.openingId === opening.id && game.kind === 'amazon' && game.aColor === 'w');
  assert.equal(white.startFen.split(' ')[0], fen.split(' ')[0].replace('Q', 'U'));
  assert.deepEqual(white.startFen.split(' ').slice(1), fen.split(' ').slice(1));
  assert.ok(white.startFen.includes('4p2U'));
});

test('a book needs the complete cap and cannot silently schedule a smaller or overridden study', async () => {
  await assert.rejects(createCollectionPlan(book(positions(31)), { rulesFactory: fakeRules().factory }), error => {
    assert.match(error.message, /only 31 usable positions/);
    assert.equal(error.book.selectedPositions, 31);
    return true;
  });
  await assert.rejects(createCollectionPlan(book(positions()), { count: 1 }), /Unsupported/);
  await assert.rejects(createCollectionPlan(Buffer.from([0xc3, 0x28])), /valid UTF-8/);
  await assert.rejects(createCollectionPlan(Buffer.alloc(0)), /1 byte/);
});

test('either Amazon must preserve a quiet start regardless of which side is to move', async () => {
  const ordinary = positions(31);
  const whiteCheck = 'rnbqrbnk/pppppppp/6Q1/8/8/8/PPPPPPPP/RNB1KBNR w - - 0 1';
  const mirror = fen => {
    const fields = fen.split(' ');
    fields[0] = fields[0].split('/').reverse().join('/').replace(/[a-z]/gi, letter => letter === letter.toUpperCase() ? letter.toLowerCase() : letter.toUpperCase());
    return fields.join(' ');
  };
  for (const example of [whiteCheck, mirror(whiteCheck)]) for (const turn of ['w', 'b']) {
    const fields = example.split(' '); fields[1] = turn;
    await assert.rejects(createCollectionPlan(book([...ordinary, fields.join(' ')]), { rulesFactory: fakeRules().factory }), error => {
      assert.equal(error.book.reasonCounts['upgrade-creates-check'], 1);
      assert.equal(error.book.selectedPositions, 31);
      return true;
    });
  }
});

test('ordinary checks and browser-rule failures are audited without leaking boards', async () => {
  const checked = 'rnbqkbnr/ppppp1pp/5p2/7Q/8/8/PPPPPPPP/RNB1KBNR b KQkq - 0 1';
  await assert.rejects(createCollectionPlan(book([...positions(31), checked]), { rulesFactory: fakeRules().factory }), error => {
    assert.equal(error.book.reasonCounts['initial-check'], 1); return true;
  });
  const rules = fakeRules(fen => { if (fen.includes('U')) throw new Error('fixture invalid upgrade'); });
  await assert.rejects(createCollectionPlan(book(positions(32)), { rulesFactory: rules.factory }), error => {
    assert.equal(error.book.reasonCounts['invalid-or-terminal-position'], 32);
    assert.ok(error.book.rejections.every(row => row.condition === 'amazon-white'));
    return true;
  });
  assert.deepEqual(rules.counts(), { created: 64, disposed: 32 });
});

test('protocol accepts Windows line endings but rejects actual search or cap changes', t => {
  const original = fs.readFileSync; let change = text => text.replace(/\n/g, '\r\n');
  t.mock.method(fs, 'readFileSync', (file, ...args) => {
    const result = original(file, ...args);
    return String(file) === CONFIG_FILE ? change(String(result)) : result;
  });
  assert.equal(getCollectionProtocol().settings.nodes, 20000);
  change = text => text.replace('20000', '20001');
  assert.throws(getCollectionProtocol, /protocol changed/);
});

test('actual browser rules accept every planned ordinary and asymmetric Amazon position', async () => {
  const plan = await createCollectionPlan(book(positions(40)));
  const { createMatchRules } = require('../dist/balance-rules.cjs');
  const rules = await createMatchRules({ profile: plan.profile });
  for (const game of plan.schedule) {
    const board = rules.createBoard(game.startFen);
    try { assert.equal(board.outcome(), null, game.id); }
    finally { board.dispose(); }
  }
});
