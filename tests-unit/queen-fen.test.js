const test = require('node:test');
const assert = require('node:assert/strict');
const { initVariantRules, VariantGame, CURRENT_VARIANT, PIECE_VARIANT } = require('../dist/rules-node.cjs');

test.before(async () => { await initVariantRules(); });

function position(pieces, turn = 'w', target = '-') {
  const ranks = [];
  for (let rank = 8; rank >= 1; rank--) {
    let row = '';
    let empty = 0;
    for (const file of 'abcdefgh') {
      const piece = pieces[file + rank];
      if (!piece) { empty++; continue; }
      if (empty) { row += empty; empty = 0; }
      row += piece;
    }
    ranks.push(row + (empty || ''));
  }
  return `${ranks.join('/')} ${turn} - ${target} 0 1`;
}

function opposite(fen) {
  const fields = fen.split(' ');
  fields[0] = fields[0].split('/').reverse().join('/').replace(/[a-z]/gi, piece => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase());
  fields[1] = fields[1] === 'w' ? 'b' : 'w';
  if (fields[3] !== '-') fields[3] = mirror(fields[3]);
  return fields.join(' ');
}

const mirror = square => square[0] + (9 - Number(square[1]));
const legalMoves = instance => instance.moves({ verbose: true }).map(move => `${move.from}${move.to}${move.promotion || ''}`).sort();

function game(t, fen) {
  const instance = new VariantGame(fen, CURRENT_VARIANT);
  t.after(() => instance.dispose());
  return instance;
}

for (const homeRank of [1, 2]) {
  for (const [shape, deltaFile, deltaRank] of [['knight', 1, 2], ['camel', 1, 3], ['zebra', 2, 3]]) {
    test(`blue queen ${shape} jumps from home rank ${homeRank} retain native FEN for both colors`, t => {
      const from = `d${homeRank}`;
      const to = 'abcdefgh'[3 + deltaFile] + (homeRank + deltaRank);
      const initial = position({ h1: 'K', h8: 'k', [from]: 'S' });
      for (const black of [false, true]) {
        const square = black ? mirror : value => value;
        const instance = game(t, black ? opposite(initial) : initial);
        const before = instance.fen();
        instance.move({ from: square(from), to: square(to) });
        const fen = instance.fen();
        assert.equal(fen.split(' ')[3], square(to), 'native jump marker is the occupied landing square');

        const restored = game(t, fen);
        assert.equal(restored.fen(), fen);
        assert.deepEqual(legalMoves(restored), legalMoves(instance));
        assert.ok(restored.moves({ verbose: true }).every(move => move.flags !== 'e'), 'occupied jump markers cannot enable en passant');

        const replayed = game(t);
        replayed.loadPgn(instance.pgn());
        assert.equal(replayed.fen(), fen);
        assert.deepEqual(legalMoves(replayed), legalMoves(instance));
        replayed.undo();
        assert.equal(replayed.fen(), before);
        instance.undo();
        assert.equal(instance.fen(), before);

        const fromMarker = game(t);
        fromMarker.loadPgn(restored.pgn());
        assert.equal(fromMarker.fen(), fen, 'a PGN starting at the native marker also reloads');
      }
    });
  }
}

test('occupied jump markers reject other pieces, the wrong color, and impossible home origins', () => {
  const base = { h1: 'K', h8: 'k' };
  for (const fen of [
    position({ ...base, f4: 'R' }, 'b', 'f4'),
    position({ ...base, f4: 'Q' }, 'b', 'f4'),
    position({ ...base, f4: 's' }, 'b', 'f4'),
    position({ ...base, d6: 'S' }, 'b', 'd6'),
  ]) {
    for (const candidate of [fen, opposite(fen)]) assert.throws(() => new VariantGame(candidate, CURRENT_VARIANT), /starting position/);
  }
  const nativeMarker = position({ ...base, f4: 'S' }, 'b', 'f4');
  assert.throws(() => new VariantGame(nativeMarker, PIECE_VARIANT), /starting position/);
});

test('a pawn capturing a blue queen on its marker makes an ordinary capture for both colors', t => {
  const initial = position({ h1: 'K', h8: 'k', d1: 'S', g5: 'a' });
  for (const black of [false, true]) {
    const square = black ? mirror : value => value;
    const instance = game(t, black ? opposite(initial) : initial);
    instance.move({ from: square('d1'), to: square('f4') });
    const restored = game(t, instance.fen());
    const move = restored.move({ from: square('g5'), to: square('f4') });
    assert.equal(move.flags, 'c');
    assert.equal(move.captured, 's');
    assert.equal(restored.get(square('f4')).type, 'a');
    assert.equal(restored.get(square('g5')), undefined);
  }
});
