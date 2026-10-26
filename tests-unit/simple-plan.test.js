'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getSimpleProtocol, createSimplePlan, validateSimplePlan } = require('../scripts/balance/simple-plan');

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
  library = getSimpleProtocol();
  rules = await require('../dist/balance-rules.cjs').createMatchRules({ profile: library.profile });
});
function moves(id, extras = {}, color = 'w') {
  const letter = library.registry.allocations.find(item => item.id === id).letter;
  const from = color === 'w' ? 'd4' : 'd5';
  const board = rules.createBoard(fen({ a1: 'K', h7: 'k', [from]: color === 'w' ? letter.toUpperCase() : letter, ...extras }, color));
  try { return new Set(board.moves().filter(move => move.startsWith(from))); } finally { board.dispose(); }
}

test('rank bishop has full bishop and horizontal lines, with no vertical slides or knight jumps', () => {
  for (const color of ['w', 'b']) {
    const from = color === 'w' ? 'd4' : 'd5', rank = from[1];
    const open = moves('bishop.purple@10', {}, color);
    for (const file of 'abcefgh') assert.ok(open.has(from + file + rank), `${color}: ${file}`);
    for (const move of color === 'w' ? ['d4f6', 'd4b6', 'd4f2', 'd4b2'] : ['d5f7', 'd5b7', 'd5f3', 'd5b3']) assert.ok(open.has(move), move);
    for (const move of color === 'w' ? ['d4d6', 'd4d2', 'd4f5', 'd4b3'] : ['d5d7', 'd5d3', 'd5f6', 'd5b4']) assert.ok(!open.has(move), move);
  }
  assert.ok(moves('bishop.purple@10', { f4: 'p' }).has('d4f4'));
  assert.ok(!moves('bishop.purple@10', { e4: 'P', f4: 'p' }).has('d4f4'));
  assert.ok(!moves('bishop.purple@10', { e5: 'P', f6: 'p' }).has('d4f6'));
});

test('RB is exactly ordinary queen movement for both colors, including blockers and captures', () => {
  for (const color of ['w', 'b']) for (const blocked of [false, true]) {
    const from = color === 'w' ? 'd4' : 'd5';
    const extras = blocked ? { e4: 'P', d6: 'p', b5: 'N', f3: 'b' } : {};
    const ordinary = rules.createBoard(fen({ a1: 'K', h7: 'k', [from]: color === 'w' ? 'Q' : 'q', ...extras }, color));
    try {
      assert.deepEqual([...moves('rook.purple@9', extras, color)].sort(), ordinary.moves().filter(move => move.startsWith(from)).sort());
    } finally { ordinary.dispose(); }
  }
});

test('forward-bishop rook mirrors forward-only diagonal movement and captures', () => {
  for (const move of ['d4d8', 'd4a4', 'd4f6', 'd4b6']) assert.ok(moves('rook.purple@10').has(move), move);
  for (const move of ['d4f2', 'd4b2']) assert.ok(!moves('rook.purple@10').has(move), move);
  assert.ok(moves('rook.purple@10', { f6: 'p' }).has('d4f6'));
  assert.ok(!moves('rook.purple@10', { e5: 'P', f6: 'p' }).has('d4f6'));
  for (const move of ['d5d1', 'd5a5', 'd5f3', 'd5b3']) assert.ok(moves('rook.purple@10', {}, 'b').has(move), move);
  for (const move of ['d5f7', 'd5b7']) assert.ok(!moves('rook.purple@10', {}, 'b').has(move), move);
  assert.ok(moves('rook.purple@10', { f3: 'P' }, 'b').has('d5f3'));
  assert.ok(!moves('rook.purple@10', { e4: 'p', f3: 'P' }, 'b').has('d5f3'));
});

test('RB2 limits diagonal lines to two clear squares and retains full rook movement', () => {
  for (const color of ['w', 'b']) {
    const open = moves('rook.purple@11', {}, color);
    const required = color === 'w' ? ['d4e5', 'd4f6', 'd4c3', 'd4b2', 'd4d8', 'd4h4'] : ['d5e4', 'd5f3', 'd5c6', 'd5b7', 'd5d1', 'd5h5'];
    for (const move of required) assert.ok(open.has(move), move);
    for (const move of color === 'w' ? ['d4g7', 'd4a7', 'd4g1'] : ['d5g2', 'd5a2', 'd5g8']) assert.ok(!open.has(move), move);
  }
  assert.ok(moves('rook.purple@11', { f6: 'p' }).has('d4f6'));
  assert.ok(!moves('rook.purple@11', { e5: 'P', f6: 'p' }).has('d4f6'));
  assert.ok(moves('rook.purple@11', { f3: 'P' }, 'b').has('d5f3'));
  assert.ok(!moves('rook.purple@11', { e4: 'p', f3: 'P' }, 'b').has('d5f3'));
});

test('all new rooks castle on both sides for both colors and retain royal path safety', () => {
  for (const id of ['rook.purple@9', 'rook.purple@10', 'rook.purple@11']) for (const color of ['w', 'b']) {
    const rank = color === 'w' ? '1' : '8', opposite = color === 'w' ? '8' : '1';
    const letter = library.registry.allocations.find(item => item.id === id).letter;
    const rook = color === 'w' ? letter.toUpperCase() : letter;
    const home = { ['a' + rank]: rook, ['e' + rank]: color === 'w' ? 'K' : 'k', ['h' + rank]: rook, ['b' + opposite]: color === 'w' ? 'k' : 'K' };
    const rights = color === 'w' ? 'KQ' : 'kq';
    const open = rules.createBoard(fen(home, color, rights));
    try { assert.ok(open.moves().includes(`e${rank}g${rank}`), `${id}/${color}`); assert.ok(open.moves().includes(`e${rank}c${rank}`), `${id}/${color}`); }
    finally { open.dispose(); }
    const attacked = rules.createBoard(fen({ ...home, ['f' + opposite]: color === 'w' ? 'r' : 'R' }, color, rights));
    try { assert.ok(!attacked.moves().includes(`e${rank}g${rank}`), `${id}/${color}`); assert.ok(attacked.moves().includes(`e${rank}c${rank}`), `${id}/${color}`); }
    finally { attacked.dispose(); }
  }
});

test('only queen-moving rook receives the canonical ordinary-queen prior', () => {
  assert.deepEqual(library.protocol.evaluation, { pieceValues: { 'rook.purple@9': { mg: 2538, eg: 2682 } } });
  assert.deepEqual(library.profile.evaluation, library.protocol.evaluation);
  const letter = library.registry.allocations.find(entry => entry.id === 'rook.purple@9').letter;
  assert.ok(library.profile.config.includes(`pieceValueMg = ${letter}:2538\n`));
  assert.ok(library.profile.config.includes(`pieceValueEg = ${letter}:2682\n`));
  assert.equal(library.registry.definitions.length, 8);
  assert.equal(library.roster.filter(entry => entry.role === 'candidate').length, 4);
});

let planPromise;
const plan = () => planPromise ||= createSimplePlan();

test('linked schedule adds exactly four candidates against ordinary, NC and QN on inherited positions', async () => {
  const current = await plan(), parent = library.parentManifest.plan;
  assert.equal(current.totalGames, 3072); assert.equal(current.linkedTotalGames, 5760); assert.equal(current.units.length, 1536);
  assert.deepEqual(current.openings, parent.openings); assert.deepEqual(current.study.checkpoints, [768, 1536, 3072]);
  assert.equal(current.roster.length, 8); assert.equal(current.activeRoster.length, 6);
  for (const allocation of parent.registry.allocations) assert.deepEqual(current.registry.allocations.find(entry => entry.id === allocation.id), allocation);
  const inheritedIds = new Set(parent.schedule.map(game => game.id));
  const candidates = new Set(current.roster.filter(entry => entry.role === 'candidate').map(entry => entry.id));
  const references = new Set(current.roster.filter(entry => entry.role === 'reference').map(entry => entry.id));
  for (const opening of current.openings) {
    const games = current.schedule.filter(game => game.openingId === opening.id);
    assert.equal(games.length, 24); assert.equal(games.filter(game => game.kind === 'single').length, 8); assert.equal(games.filter(game => game.kind === 'head').length, 16);
    for (const game of games) {
      assert.ok(!inheritedIds.has(game.id)); assert.equal(game.groupId, opening.id); assert.ok(candidates.has(game.designA));
      assert.ok(game.kind === 'single' ? game.designB === null : references.has(game.designB));
    }
    for (const entry of current.units.filter(unit => unit.gameIds.some(id => games.some(game => game.id === id)))) {
      const pair = games.filter(game => entry.gameIds.includes(game.id)); assert.deepEqual(pair.map(game => game.aColor), ['w', 'b']);
      assert.equal(pair[0].whiteDesign, pair[1].blackDesign); assert.equal(pair[0].blackDesign, pair[1].whiteDesign);
    }
  }
  assert.equal(validateSimplePlan(current), current); assert.ok(Object.isFrozen(current.schedule[0]));
});

test('frozen simple plan rejects altered evaluations, assignments, grouping and counts', async () => {
  const current = await plan();
  for (const change of [
    copy => { copy.openings[0].id = 'simple-001'; },
    copy => { copy.openings[0].members.w.bishop = 'f1'; },
    copy => { copy.schedule.pop(); },
    copy => { copy.schedule[0].groupId = 'new-context'; },
    copy => { copy.schedule[0].designA = 'bishop.purple@4'; },
    copy => { copy.parent.manifestSha256 = '0'.repeat(64); },
    copy => { copy.profile.evaluation.pieceValues['rook.purple@9'].eg++; },
    copy => { copy.protocol.evaluation.pieceValues['rook.purple@10'] = { mg: 1904, eg: 1932 }; },
  ]) {
    const copy = structuredClone(current); change(copy); assert.throws(() => validateSimplePlan(copy));
  }
});
