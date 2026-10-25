'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getRevisionProtocol, createRevisionPlan, validateRevisionPlan } = require('../scripts/balance/revision-plan');

function fen(pieces, turn = 'w', castling = '-') {
  const placement = Array.from({ length: 8 }, (_, row) => {
    let rank = '', empty = 0;
    for (const file of 'abcdefgh') {
      const piece = pieces[file + (8 - row)];
      if (!piece) { empty++; continue; }
      if (empty) rank += empty;
      empty = 0; rank += piece;
    }
    return rank + (empty || '');
  }).join('/');
  return `${placement} ${turn} ${castling} - 0 1`;
}
let library, rules;
test.before(async () => {
  library = getRevisionProtocol();
  rules = await require('../dist/balance-rules.cjs').createMatchRules({ profile: library.profile });
});
function moves(id, extras = {}, color = 'w') {
  const letter = library.registry.allocations.find(item => item.id === id).letter;
  const from = color === 'w' ? 'd4' : 'd5';
  const board = rules.createBoard(fen({ a1: 'K', h7: 'k', [from]: color === 'w' ? letter.toUpperCase() : letter, ...extras }, color));
  try { return new Set(board.moves().filter(move => move.startsWith(from))); } finally { board.dispose(); }
}

test('short-side bishop keeps wide jumps but has only adjacent horizontal movement', () => {
  const open = moves('bishop.purple@7');
  for (const move of ['d4e4', 'd4c4', 'd4f5', 'd4f3', 'd4b5', 'd4b3']) assert.ok(open.has(move), move);
  for (const move of ['d4f4', 'd4b4']) assert.ok(!open.has(move), move);
  assert.ok(moves('bishop.purple@7', { f5: 'p' }).has('d4f5'));
});

test('quiet-jump bishop cannot capture with its wide knight leap', () => {
  assert.ok(moves('bishop.purple@8').has('d4f5'));
  assert.ok(moves('bishop.purple@8').has('d4f3'));
  assert.ok(!moves('bishop.purple@8', { f5: 'p' }).has('d4f5'));
  assert.ok(!moves('bishop.purple@8', { f3: 'p' }).has('d4f3'));
  assert.ok(moves('bishop.purple@8', { f4: 'p' }).has('d4f4'));
  assert.ok(!moves('bishop.purple@8', { e4: 'P', f4: 'p' }).has('d4f4'));
});

test('forward-jump bishop mirrors its restricted knight captures between colors', () => {
  assert.ok(moves('bishop.purple@9').has('d4f5'));
  assert.ok(!moves('bishop.purple@9').has('d4f3'));
  assert.ok(moves('bishop.purple@9', { f5: 'p' }).has('d4f5'));
  assert.ok(moves('bishop.purple@9', {}, 'b').has('d5f4'));
  assert.ok(!moves('bishop.purple@9', {}, 'b').has('d5f6'));
  assert.ok(moves('bishop.purple@9', { f4: 'P' }, 'b').has('d5f4'));
});

test('diagonal-capture rook gains capture-only adjacent diagonal steps', () => {
  assert.ok(!moves('rook.purple@6').has('d4e5'));
  assert.ok(moves('rook.purple@6', { e5: 'p' }).has('d4e5'));
  assert.ok(!moves('rook.purple@6').has('d4f5'));
  assert.ok(moves('rook.purple@6', { f5: 'p' }).has('d4f5'));
});

test('diagonal-step rook gains quiet and capturing adjacent diagonal steps', () => {
  assert.ok(moves('rook.purple@7').has('d4e5'));
  assert.ok(moves('rook.purple@7', { e5: 'p' }).has('d4e5'));
  assert.ok(!moves('rook.purple@7').has('d4f5'));
  assert.ok(moves('rook.purple@7', { f5: 'p' }).has('d4f5'));
});

test('full-knight rook allows quiet knight jumps as well as knight captures', () => {
  assert.ok(moves('rook.purple@8').has('d4f5'));
  assert.ok(moves('rook.purple@8', { f5: 'p' }).has('d4f5'));
  assert.ok(!moves('rook.purple@8').has('d4e5'));
  assert.ok(!moves('rook.purple@8', { e5: 'p' }).has('d4e5'));
});

test('every new rook preserves castling on either side', () => {
  for (const id of ['rook.purple@6', 'rook.purple@7', 'rook.purple@8']) {
    const letter = library.registry.allocations.find(item => item.id === id).letter.toUpperCase();
    const board = rules.createBoard(fen({ a1: letter, e1: 'K', h1: letter, e8: 'k' }, 'w', 'KQ'));
    try { assert.ok(board.moves().includes('e1g1'), id); assert.ok(board.moves().includes('e1c1'), id); }
    finally { board.dispose(); }
  }
});

let planPromise;
const plan = () => planPromise ||= createRevisionPlan();

test('linked schedule reuses all parent positions and only adds new candidate comparisons', async () => {
  const current = await plan(), parent = library.parentManifest.plan;
  assert.equal(current.totalGames, 4608);
  assert.equal(current.linkedTotalGames, 7296);
  assert.equal(current.units.length, 2304);
  assert.deepEqual(current.openings, parent.openings);
  assert.deepEqual(current.study.checkpoints, [1152, 2304, 4608]);
  assert.equal(current.roster.length, 10);
  assert.equal(current.activeRoster.length, 8);
  assert.equal(current.roster.filter(entry => entry.role === 'candidate').length, 6);
  for (const allocation of parent.registry.allocations) {
    assert.deepEqual(current.registry.allocations.find(entry => entry.id === allocation.id), allocation);
  }
  const inheritedIds = new Set(parent.schedule.map(game => game.id));
  const candidates = new Set(current.roster.filter(entry => entry.role === 'candidate').map(entry => entry.id));
  const references = new Set(current.roster.filter(entry => entry.role === 'reference').map(entry => entry.id));
  for (const opening of current.openings) {
    const games = current.schedule.filter(game => game.openingId === opening.id);
    assert.equal(games.length, 36);
    assert.equal(games.filter(game => game.kind === 'single').length, 12);
    assert.equal(games.filter(game => game.kind === 'head').length, 24);
    for (const game of games) {
      assert.ok(!inheritedIds.has(game.id));
      assert.equal(game.groupId, opening.id);
      assert.ok(candidates.has(game.designA));
      assert.ok(game.kind === 'single' ? game.designB === null : references.has(game.designB));
    }
    const units = current.units.filter(unit => unit.gameIds.some(id => games.some(game => game.id === id)));
    assert.equal(units.length, 18);
    for (const unit of units) {
      const pair = games.filter(game => unit.gameIds.includes(game.id));
      assert.deepEqual(pair.map(game => game.aColor), ['w', 'b']);
      assert.equal(pair[0].whiteDesign, pair[1].blackDesign);
      assert.equal(pair[0].blackDesign, pair[1].whiteDesign);
    }
  }
  assert.equal(validateRevisionPlan(current), current);
  assert.ok(Object.isFrozen(current.schedule[0]));
});

test('linked plan rejects changing inherited grouping, members, or new-game count', async () => {
  const current = await plan();
  for (const change of [
    copy => { copy.openings[0].id = 'revision-001'; },
    copy => { copy.openings[0].members.w.bishop = 'f1'; },
    copy => { copy.schedule.pop(); },
    copy => { copy.schedule[0].groupId = 'new-context'; },
    copy => { copy.schedule[0].designA = 'bishop.purple@4'; },
    copy => { copy.parent.manifestSha256 = '0'.repeat(64); },
  ]) {
    const copy = JSON.parse(JSON.stringify(current)); change(copy);
    assert.throws(() => validateRevisionPlan(copy));
  }
});
