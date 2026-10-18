const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { initVariantRules, VariantGame, PIECE_VARIANT, CURRENT_VARIANT } = require('../dist/rules-node.cjs');

test.before(async () => { await initVariantRules(); });

function position(pieces, turn = 'w', halfmove = 0) {
  const ranks = [];
  for (let rank = 8; rank >= 1; rank--) {
    let row = '';
    let empty = 0;
    for (const file of 'abcdefgh') {
      const piece = pieces[file + rank];
      if (piece) {
        if (empty) row += empty;
        empty = 0;
        row += piece;
      } else empty++;
    }
    if (empty) row += empty;
    ranks.push(row);
  }
  return `${ranks.join('/')} ${turn} - - ${halfmove} 1`;
}

function opposite(fen) {
  const fields = fen.split(' ');
  fields[0] = fields[0].split('/').reverse().join('/').replace(/[a-z]/gi, piece => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase());
  fields[1] = fields[1] === 'w' ? 'b' : 'w';
  if (fields[3] !== '-') fields[3] = fields[3].match(/[a-h][1-8]/g).map(square => square[0] + (9 - Number(square[1]))).sort().join('');
  return fields.join(' ');
}

function game(t, fen) {
  const instance = new VariantGame(fen, PIECE_VARIANT);
  t.after(() => instance.dispose());
  return instance;
}

function bothColors(t, fen, check) {
  check(game(t, fen), square => square, 'w');
  check(game(t, opposite(fen)), square => square[0] + (9 - Number(square[1])), 'b');
}

const destinations = (instance, square) => instance.moves({ square, verbose: true }).map(move => move.to).sort();
const base = { h7: 'k', a1: 'K' };

test('blue pawns move only forward, with one/two-square jumps and an initial three-square jump', t => {
  bothColors(t, position({ ...base, d2: 'A' }), (instance, square) => {
    assert.deepEqual(destinations(instance, square('d2')), ['d3', 'd4', 'd5'].map(square).sort());
    instance.move({ from: square('d2'), to: square('d3') });
    instance.move({ from: square('h7'), to: square('h6') });
    assert.deepEqual(destinations(instance, square('d3')), ['d4', 'd5'].map(square).sort());
  });
  bothColors(t, position({ ...base, d2: 'A', d3: 'P' }), (instance, square) => {
    assert.deepEqual(destinations(instance, square('d2')), ['d4', 'd5'].map(square).sort());
    instance.move({ from: square('d2'), to: square('d5') });
    assert.equal(instance.get(square('d3')).type, 'p');
  });
});

test('blue pawns capture diagonally without treating forward jumps as attacks', t => {
  bothColors(t, position({ ...base, d4: 'A', c5: 'p', d5: 'p', e5: 'p' }), (instance, square) => {
    assert.deepEqual(destinations(instance, square('d4')), ['c5', 'd6', 'e5'].map(square).sort());
    const before = instance.fen();
    const captured = instance.move({ from: square('d4'), to: square('c5') });
    assert.equal(captured.flags, 'c');
    assert.equal(captured.captured, 'p');
    instance.undo();
    assert.equal(instance.fen(), before);
  });
});

test('orange pawns move or capture one square forward or forward-diagonally', t => {
  for (const targets of [{}, { c5: 'p', d5: 'p', e5: 'p' }]) {
    bothColors(t, position({ ...base, d4: 'C', ...targets }), (instance, square) => {
      const moves = instance.moves({ square: square('d4'), verbose: true });
      assert.deepEqual(moves.map(move => move.to).sort(), ['c5', 'd5', 'e5'].map(square).sort());
      assert.ok(moves.every(move => Object.keys(targets).length ? move.flags === 'c' : move.flags === 'n'));
    });
  }
});

test('orange initial doubles are forward, quiet, and blocked by an intermediate piece', t => {
  bothColors(t, position({ ...base, d2: 'C' }), (instance, square) => {
    assert.deepEqual(destinations(instance, square('d2')), ['c3', 'd3', 'd4', 'e3'].map(square).sort());
  });
  for (const blockers of [{ d3: 'P' }, { d3: 'p' }, { d4: 'p' }]) {
    bothColors(t, position({ ...base, d2: 'C', ...blockers }), (instance, square) => {
      assert.ok(!destinations(instance, square('d2')).includes(square('d4')));
    });
  }
});

test('purple pawns move like rooks without capturing and capture like bishops in every direction', t => {
  bothColors(t, position({ h7: 'k', h1: 'K', d4: 'D', b2: 'p', f2: 'p', b6: 'p', f6: 'p', d6: 'p', e4: 'P' }), (instance, square) => {
    const moves = instance.moves({ square: square('d4'), verbose: true });
    assert.deepEqual(moves.filter(move => move.captured).map(move => move.to).sort(), ['b2', 'b6', 'f2', 'f6'].map(square).sort());
    assert.deepEqual(moves.filter(move => !move.captured).map(move => move.to).sort(), ['a4', 'b4', 'c4', 'd1', 'd2', 'd3', 'd5'].map(square).sort());
    assert.ok(!moves.some(move => move.to === square('d6') || move.to === square('d7')));
    instance.move({ from: square('d4'), to: square('b2') });
    assert.equal(instance.get(square('b2')).type, 'd');
  });
});

test('checks and king safety follow pawn capture directions rather than quiet movement', t => {
  for (const [piece, king, checked] of [['A', 'd5', false], ['A', 'e5', true], ['C', 'd5', true], ['C', 'e5', true], ['D', 'd5', false], ['D', 'e5', true]]) {
    bothColors(t, position({ h1: 'K', d4: piece, [king]: 'k' }, 'b'), instance => assert.equal(instance.isCheck(), checked, piece + king));
  }
  for (const piece of ['A', 'C', 'D']) {
    bothColors(t, position({ h1: 'K', d4: piece, e6: 'k' }, 'b'), (instance, square) => {
      assert.ok(!destinations(instance, square('e6')).includes(square('e5')));
    });
  }
});

test('pinned upgraded pawns cannot expose their own king and kings remain uncapturable', t => {
  for (const piece of ['A', 'C', 'D']) {
    bothColors(t, position({ d1: 'K', h7: 'k', d4: piece, d8: 'r', e5: 'p' }), (instance, square) => {
      assert.ok(!destinations(instance, square('d4')).includes(square('e5')));
      assert.throws(() => instance.move({ from: square('d4'), to: square('e5') }), /not legal/);
    });
    const impossible = position({ h1: 'K', d4: piece, e5: 'k' });
    assert.throws(() => new VariantGame(impossible, PIECE_VARIANT), /inactive king/);
    assert.throws(() => new VariantGame(opposite(impossible), PIECE_VARIANT), /inactive king/);
  }
});

test('every pawn level promotes only to standard queen, rook, bishop, or knight', t => {
  for (const piece of ['P', 'A', 'C', 'D']) {
    bothColors(t, position({ h1: 'K', h7: 'k', d7: piece }), (instance, square) => {
      const promotions = instance.moves({ square: square('d7'), verbose: true }).filter(move => move.to === square('d8'));
      assert.deepEqual(promotions.map(move => move.promotion).sort(), ['b', 'n', 'q', 'r']);
      assert.throws(() => instance.move({ from: square('d7'), to: square('d8') }), /not legal/);
      assert.throws(() => instance.move({ from: square('d7'), to: square('d8'), promotion: 'g' }), /not legal/);
      const before = instance.fen();
      const move = instance.move({ from: square('d7'), to: square('d8'), promotion: 'q' });
      assert.equal(move.flags, 'p');
      assert.equal(instance.get(square('d8')).type, 'q');
      instance.undo();
      assert.equal(instance.fen(), before);
    });
  }
  bothColors(t, position({ ...base, d6: 'A', d7: 'P' }), (instance, square) => {
    assert.deepEqual(instance.moves({ square: square('d6'), verbose: true }).filter(move => move.to === square('d8')).map(move => move.promotion).sort(), ['b', 'n', 'q', 'r']);
  });
});

test('irreversible pawn moves reset the fifty-move counter while purple quiet rook moves count toward it', t => {
  for (const piece of ['A', 'C', 'D']) {
    bothColors(t, position({ ...base, d4: piece }, 'w', piece === 'D' ? 23 : 99), (instance, square) => {
      const before = instance.fen();
      instance.move({ from: square('d4'), to: square('d5') });
      assert.equal(instance.fen().split(' ')[4], piece === 'D' ? '24' : '0');
      assert.equal(instance.isDraw(), false);
      instance.undo();
      assert.equal(instance.fen(), before);
    });
  }
  bothColors(t, position({ h1: 'K', h7: 'k', d4: 'D', e5: 'p' }, 'w', 99), (instance, square) => {
    instance.move({ from: square('d4'), to: square('e5') });
    assert.equal(instance.fen().split(' ')[4], '0');
  });
});

test('blue captures standard en passant while orange moving onto the same target leaves the pawn', t => {
  for (const piece of ['A', 'C']) {
    bothColors(t, position({ ...base, e5: piece, d7: 'p' }, 'b'), (instance, square) => {
      instance.move({ from: square('d7'), to: square('d5') });
      const before = instance.fen();
      const legalBefore = instance.moves({ square: square('e5'), verbose: true });
      assert.equal(instance.fen(), before, 'reading en passant moves must not mutate the board');
      const capture = legalBefore.find(move => move.to === square('d6'));
      assert.equal(capture.flags, piece === 'A' ? 'e' : 'n');
      assert.equal(capture.captured, piece === 'A' ? 'p' : undefined);
      instance.move({ from: square('e5'), to: square('d6') });
      assert.equal(instance.get(square('d5'))?.type, piece === 'A' ? undefined : 'p');
      instance.undo();
      assert.equal(instance.fen(), before);
    });
  }
});

test('initial blue triples and orange doubles expose their actual piece type to en passant', t => {
  for (const [piece, to, capturer, target] of [['A', 'd5', 'e5', 'd4'], ['A', 'd5', 'e4', 'd3'], ['C', 'd4', 'e4', 'd3']]) {
    bothColors(t, position({ ...base, d2: piece, [capturer]: 'p' }), (instance, square) => {
      instance.move({ from: square('d2'), to: square(to) });
      const before = instance.fen();
      assert.ok(before.split(' ')[3].includes(square(target)));
      const capture = instance.move({ from: square(capturer), to: square(target) });
      assert.equal(capture.flags, 'e');
      assert.equal(capture.captured, piece.toLowerCase());
      assert.equal(instance.get(square(to)), undefined);
      instance.undo();
      assert.equal(instance.fen(), before);
      assert.equal(instance.get(square(to)).type, piece.toLowerCase());
    });
  }
  bothColors(t, position({ ...base, d2: 'A', e4: 'p' }), (instance, square) => {
    instance.move({ from: square('d2'), to: square('d4') });
    assert.equal(instance.fen().split(' ')[3], '-');
    assert.ok(!destinations(instance, square('e4')).includes(square('d3')));
  });
});

function repeatKnights(instance, square) {
  for (const [from, to] of [['g8', 'f6'], ['g1', 'f3'], ['f6', 'g8'], ['f3', 'g1']]) instance.move({ from: square(from), to: square(to) });
}

test('legal multi-target en passant rights distinguish repetitions and survive PGN round trips', t => {
  bothColors(t, position({ a1: 'K', h7: 'k', d2: 'A', e5: 'p', g1: 'N', g8: 'n' }), (instance, square) => {
    instance.move({ from: square('d2'), to: square('d5') });
    assert.equal(instance.fen().split(' ')[3].length, 6);
    const restored = game(t);
    restored.loadPgn(instance.pgn());
    assert.equal(restored.fen(), instance.fen());
    assert.ok(restored.moves({ square: square('e5'), verbose: true }).some(move => move.to === square('d4') && move.flags === 'e'));
    for (let repeat = 0; repeat < 2; repeat++) {
      repeatKnights(instance, square);
      assert.equal(instance.isThreefoldRepetition(), false, 'the initial occurrence still had a legal en passant capture');
    }
    repeatKnights(instance, square);
    assert.equal(instance.isThreefoldRepetition(), true);
    for (let move = 0; move < 4; move++) instance.undo();
    assert.equal(instance.isThreefoldRepetition(), false);
  });
});

test('custom multi-target FEN accepts native rights while rejecting forged shapes and victim pieces', t => {
  const source = game(t, position({ ...base, d2: 'A', e5: 'p' }));
  source.move({ from: 'd2', to: 'd5' });
  const fen = source.fen();
  assert.equal(game(t, fen).fen(), fen);
  for (const targets of ['d3d3d5', 'd3e4d5', 'd2d3d4', 'd4d3d5', 'd3d4', 'd3d4d5d6']) {
    const invalid = fen.split(' ');
    invalid[3] = targets;
    assert.throws(() => new VariantGame(invalid.join(' '), PIECE_VARIANT), /starting position/);
  }
  assert.throws(() => new VariantGame(fen.replace('A', 'P'), PIECE_VARIANT), /starting position/);
});

test('single en passant targets require a real pawn advance and cannot capture kings or other pieces', t => {
  for (const victim of ['k', 'r', 'n']) {
    const impossible = position({ a1: 'K', ...(victim === 'k' ? {} : { h7: 'k' }), d5: victim, e5: 'A' });
    const fields = impossible.split(' ');
    fields[3] = 'd6';
    assert.throws(() => new VariantGame(fields.join(' '), PIECE_VARIANT), /starting position/);
    assert.throws(() => new VariantGame(opposite(fields.join(' ')), PIECE_VARIANT), /starting position/);
  }
  bothColors(t, position({ ...base, d2: 'A', e5: 'p' }), (instance, square) => {
    instance.move({ from: square('d2'), to: square('d5') });
    const fields = instance.fen().split(' ');
    fields[3] = square('d4');
    const subset = game(t, fields.join(' '));
    assert.equal(subset.move({ from: square('e5'), to: square('d4') }).captured, 'a');
  });
  bothColors(t, position({ ...base, d2: 'A', d4: 'R', e4: 'p' }), (instance, square) => {
    instance.move({ from: square('d2'), to: square('d5') });
    const before = instance.fen();
    assert.equal(game(t, before).fen(), before, 'a full triple-leap path may retain an occupied intermediate square');
    const capture = instance.move({ from: square('e4'), to: square('d3') });
    assert.equal(capture.captured, 'a');
    assert.equal(instance.get(square('d4')).type, 'r');
    const forgedSubset = before.split(' ');
    forgedSubset[3] = square('d3');
    assert.throws(() => new VariantGame(forgedSubset.join(' '), PIECE_VARIANT), /starting position/);
  });
});

test('starting FEN whitespace is normalized before validating both kings and en passant', t => {
  const fen = position({ ...base, d2: 'A', e5: 'p' });
  assert.equal(game(t, `\n  ${fen.replace(/ /g, ' \t ')}  \n`).fen(), fen);
});

test('orange quiet moves on an en passant target do not distinguish repetitions', t => {
  bothColors(t, position({ a1: 'K', h7: 'k', e4: 'c', d2: 'P', g1: 'N', g8: 'n' }), (instance, square) => {
    instance.move({ from: square('d2'), to: square('d4') });
    assert.equal(instance.fen().split(' ')[3], square('d3'));
    const quiet = instance.moves({ square: square('e4'), verbose: true }).find(move => move.to === square('d3'));
    assert.equal(quiet.flags, 'n');
    for (let repeat = 0; repeat < 2; repeat++) {
      repeatKnights(instance, square);
      assert.equal(instance.isThreefoldRepetition(), repeat === 1);
    }
  });
});

test('native and browser rules agree on upgraded pawn movement, checks, promotions, pins, and en passant', { skip: !process.env.FAIRY_STOCKFISH_PATH }, t => {
  const fixtures = [
    position({ ...base, d2: 'A', d3: 'P' }),
    position({ ...base, d4: 'A', c5: 'p', d5: 'p', e5: 'p' }),
    position({ ...base, d2: 'C', d3: 'P' }),
    position({ ...base, d4: 'C', c5: 'p', d5: 'p', e5: 'p' }),
    position({ h1: 'K', h7: 'k', d4: 'D', b2: 'p', f2: 'p', b6: 'p', f6: 'p' }),
    ...['A', 'C', 'D'].map(piece => position({ h1: 'K', h7: 'k', d7: piece })),
    ...['A', 'C', 'D'].map(piece => position({ d1: 'K', h7: 'k', d4: piece, d8: 'r', e5: 'p' })),
    ...['A', 'C', 'D'].map(piece => position({ h1: 'K', e5: 'k', d4: piece }, 'b')),
  ];
  for (const [initial, moves] of [
    [position({ ...base, d2: 'A', e4: 'p', e5: 'p' }), ['d2d5']],
    [position({ ...base, d2: 'C', e4: 'p' }), ['d2d4']],
    [position({ ...base, e5: 'C', d7: 'p' }, 'b'), ['d7d5']],
    [position({ ...base, e5: 'A', d7: 'p' }, 'b'), ['d7d5']],
  ]) {
    const prepared = game(t, initial);
    for (const move of moves) prepared.move({ from: move.slice(0, 2), to: move.slice(2, 4) });
    fixtures.push(prepared.fen());
  }
  for (const initial of fixtures) for (const fen of [initial, opposite(initial)]) {
    const instance = game(t, fen);
    const input = `setoption name VariantPath value ${path.resolve(__dirname, '../variants/levelup.ini')}\nsetoption name UCI_Variant value levelup\nposition fen ${fen}\ngo perft 1\nquit\n`;
    const result = spawnSync(process.env.FAIRY_STOCKFISH_PATH, [], { input, encoding: 'utf8', timeout: 15000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    const native = [...result.stdout.matchAll(/^([a-h][1-8][a-h][1-8][a-z]*): 1\r?$/gm)].map(match => match[1]).sort();
    const browser = instance.moves({ verbose: true }).map(move => move.from + move.to + (move.promotion || '')).sort();
    assert.deepEqual(native, browser, fen);
  }
});

test('home-two-rank pawn advances retain en passant through undo and PGN without changing older rules', t => {
  for (const [piece, to, capturer, target] of [['A', 'd4', 'e4', 'd3'], ['A', 'd4', 'e3', 'd2'], ['C', 'd3', 'e3', 'd2'], ['P', 'd3', 'e3', 'd2']]) {
    const initial = position({ a8: 'k', h1: 'K', d1: piece, [capturer]: 'p' });
    for (const black of [false, true]) {
      const fen = black ? opposite(initial) : initial;
      const square = value => black ? value[0] + (9 - Number(value[1])) : value;
      const current = new VariantGame(fen, CURRENT_VARIANT);
      const old = new VariantGame(fen, PIECE_VARIANT);
      t.after(() => { current.dispose(); old.dispose(); });
      assert.throws(() => old.move({ from: square('d1'), to: square(to) }), /not legal/);
      current.move({ from: square('d1'), to: square(to) });
      const before = current.fen();
      const loaded = new VariantGame(before, CURRENT_VARIANT);
      t.after(() => loaded.dispose());
      const capture = loaded.move({ from: square(capturer), to: square(target) });
      assert.equal(capture.flags, 'e');
      assert.equal(capture.captured, piece.toLowerCase());
      assert.equal(loaded.get(square(to)), undefined);
      loaded.undo();
      assert.equal(loaded.fen(), before);
      loaded.loadPgn(current.pgn());
      assert.equal(loaded.fen(), before);
      assert.equal(loaded.variant, CURRENT_VARIANT);
    }
  }
});
