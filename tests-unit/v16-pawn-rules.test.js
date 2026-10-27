const test = require('node:test');
const assert = require('node:assert/strict');
const { getPlayableProfiles } = require('../scripts/playable-profile');
const { PLAYABLE_LIBRARIES, V16_CANDIDATES } = require('../src/playable-library');
const { createMatchRules } = require('../dist/balance-rules.cjs');

const profile = getPlayableProfiles()[PLAYABLE_LIBRARIES.findIndex(library => library.id === 'v16-pawns')];
const letter = (id, color) => {
  const value = profile.registry.allocations.find(allocation => allocation.id === id).letter;
  return color === 'w' ? value.toUpperCase() : value;
};
function fen(pieces, turn = 'w', ep = '-') {
  const ranks = Array.from({ length: 8 }, (_, row) => {
    let rank = '', empty = 0;
    for (const file of 'abcdefgh') {
      const type = pieces[file + (8 - row)];
      if (!type) { empty++; continue; }
      if (empty) rank += empty;
      empty = 0;
      rank += type;
    }
    return rank + (empty || '');
  }).join('/');
  return `${ranks} ${turn} - ${ep} 0 1`;
}
let rules;
test.before(async () => { rules = await createMatchRules({ profile }); });
function board(t, pieces, turn = 'w', ep = '-') {
  const result = rules.createBoard(fen(pieces, turn, ep));
  t.after(() => result.dispose());
  return result;
}

test('every new pawn promotes only to ordinary QRBN for both colors', t => {
  for (const id of V16_CANDIDATES.pawns) for (const color of ['w', 'b']) {
    const from = color === 'w' ? 'b7' : 'b2';
    const to = color === 'w' ? 'b8' : 'b1';
    const instance = board(t, { h1: 'K', h8: 'k', [from]: letter(id, color) }, color);
    assert.deepEqual(instance.moves().filter(move => move.startsWith(from + to)).sort(), ['b', 'n', 'q', 'r'].map(type => from + to + type), id + color);
    assert.equal(instance.push(from + to + 'q'), true);
  }
});

test('capture-only diagonals take en passant while quiet diagonals leave the bypassed pawn', t => {
  const quietDiagonals = new Set(['pawn.blue@2', 'pawn.orange@4', 'pawn.purple@12']);
  for (const id of V16_CANDIDATES.pawns) for (const color of ['w', 'b']) {
    const from = color === 'w' ? 'c5' : 'c4';
    const target = color === 'w' ? 'd6' : 'd3';
    const bypassed = color === 'w' ? 'd5' : 'd4';
    const instance = board(t, { h1: 'K', h8: 'k', [from]: letter(id, color), [bypassed]: color === 'w' ? 'p' : 'P' }, color, target);
    assert.ok(instance.moves().includes(from + target), id + color);
    assert.equal(instance.push(from + target), true);
    const retained = instance.fen().split(' ')[0].includes(color === 'w' ? 'p' : 'P');
    assert.equal(retained, quietDiagonals.has(id), id + ': quiet diagonal visits retain the bypassed pawn');
  }
});

test('king pawn initial double step remains forward-only and needs a clear path', t => {
  const id = 'pawn.orange@4';
  for (const color of ['w', 'b']) {
    const from = color === 'w' ? 'd2' : 'd7';
    const middle = color === 'w' ? 'd3' : 'd6';
    const target = color === 'w' ? 'd4' : 'd5';
    const empty = board(t, { h1: 'K', h8: 'k', [from]: letter(id, color) }, color);
    assert.ok(empty.moves().includes(from + target));
    assert.ok(!empty.moves().includes(from + 'b' + from[1]));
    assert.ok(!empty.moves().includes(from + 'f' + from[1]));
    const blocked = board(t, { h1: 'K', h8: 'k', [from]: letter(id, color), [middle]: color === 'w' ? 'P' : 'p' }, color);
    assert.ok(!blocked.moves().includes(from + target));
  }
});

test('rook pawn keeps quiet rook mobility and only forward diagonal captures', t => {
  const instance = board(t, { h1: 'K', h8: 'k', d4: letter('pawn.purple@11', 'w'), b6: 'p', g7: 'p', b2: 'p', g4: 'p' });
  assert.ok(instance.moves().includes('d4b6'));
  assert.ok(instance.moves().includes('d4d7'));
  assert.ok(instance.moves().includes('d4d2'));
  assert.ok(!instance.moves().includes('d4g7'));
  assert.ok(!instance.moves().includes('d4b2'));
  assert.ok(!instance.moves().includes('d4g4'));
});
