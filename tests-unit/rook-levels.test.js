const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { initVariantRules, VariantGame, CURRENT_VARIANT } = require('../dist/rules-node.cjs');

test.before(async () => { await initVariantRules(); });

function position(pieces, turn = 'w', rights = '-') {
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
  return `${ranks.join('/')} ${turn} ${rights} - 0 1`;
}

const swapCase = text => text.replace(/[a-z]/gi, letter => letter === letter.toUpperCase() ? letter.toLowerCase() : letter.toUpperCase());
const mirror = square => square[0] + (9 - Number(square[1]));

function opposite(fen) {
  const fields = fen.split(' ');
  fields[0] = swapCase(fields[0].split('/').reverse().join('/'));
  fields[1] = fields[1] === 'w' ? 'b' : 'w';
  fields[2] = swapCase(fields[2]);
  return fields.join(' ');
}

function game(t, fen) {
  const instance = new VariantGame(fen, CURRENT_VARIANT);
  t.after(() => instance.dispose());
  return instance;
}

function bothColors(t, fen, check) {
  check(game(t, fen), square => square, 'w');
  check(game(t, opposite(fen)), mirror, 'b');
}

const destinations = (instance, square) => instance.moves({ square, verbose: true }).map(move => move.to).sort();
const base = { a1: 'K', h8: 'k', d4: 'O' };
const box = [];
for (let file = 1; file <= 5; file++) for (let rank = 2; rank <= 6; rank++) {
  const square = 'abcdefgh'[file] + rank;
  if (square !== 'd4') box.push(square);
}
const neighbors = box.filter(square => Math.abs(square.charCodeAt(0) - 'd'.charCodeAt(0)) <= 1 && Math.abs(Number(square[1]) - 4) <= 1);

test('purple rooks capture on every square of a five-by-five box for both colors', t => {
  assert.equal(box.length, 24);
  for (const target of box) {
    bothColors(t, position({ ...base, [target]: 'p' }), (instance, square, color) => {
      const before = instance.fen();
      const move = instance.move({ from: square('d4'), to: square(target) });
      assert.equal(move.piece, 'o', target);
      assert.equal(move.captured, 'p', target);
      assert.equal(move.flags, 'c', target);
      assert.equal(instance.get(square(target)).type, 'o');
      assert.equal(instance.get(square(target)).color, color);
      assert.equal(instance.get(square('d4')), undefined);
      instance.undo();
      assert.equal(instance.fen(), before);
    });
  }
});

test('purple capture jumps cross blockers and remove only the landing piece', t => {
  for (const target of box.filter(square => !neighbors.includes(square))) {
    for (const blocker of ['P', 'p']) {
      const blockers = Object.fromEntries(neighbors.map(square => [square, blocker]));
      // Keep both kings away from the occupied box and its pawn attacks.
      bothColors(t, position({ ...base, a1: undefined, h1: 'K', ...blockers, [target]: 'p' }), (instance, square) => {
        assert.ok(destinations(instance, square('d4')).includes(square(target)), `${target} over ${blocker}`);
        assert.equal(instance.move({ from: square('d4'), to: square(target) }).captured, 'p');
        for (const blocked of neighbors) assert.equal(instance.get(square(blocked)).type, 'p', blocked);
      });
    }
  }
});

test('purple rooks cannot capture friendly destinations or make quiet leap moves', t => {
  bothColors(t, position({ ...base, ...Object.fromEntries(box.map(square => [square, 'P'])) }), (instance, square) => {
    assert.deepEqual(destinations(instance, square('d4')), []);
  });
  bothColors(t, position(base), (instance, square) => {
    const ordinary = ['a4', 'b4', 'c4', 'e4', 'f4', 'g4', 'h4', 'd1', 'd2', 'd3', 'd5', 'd6', 'd7', 'd8'];
    assert.deepEqual(destinations(instance, square('d4')), ordinary.map(square).sort());
    assert.ok(instance.moves({ square: square('d4'), verbose: true }).every(move => move.flags === 'n'));
  });
  bothColors(t, position({ ...base, c4: 'P', e4: 'P', d3: 'P', d5: 'P' }), (instance, square) => {
    assert.deepEqual(destinations(instance, square('d4')), []);
  });
});

test('purple rooks keep ordinary long rook captures and do not jump along long rays', t => {
  bothColors(t, position({ ...base, d8: 'p', h4: 'p' }), (instance, square) => {
    const captures = instance.moves({ square: square('d4'), verbose: true }).filter(move => move.captured);
    assert.deepEqual(captures.map(move => move.to).sort(), ['d8', 'h4'].map(square).sort());
  });
  bothColors(t, position({ ...base, d5: 'P', e4: 'p', d8: 'p', h4: 'p' }), (instance, square) => {
    const legal = destinations(instance, square('d4'));
    assert.ok(!legal.includes(square('d8')));
    assert.ok(!legal.includes(square('h4')));
    assert.ok(legal.includes(square('e4')));
  });
});

test('capture jumps obey pins and expose their full attack box to royal check rules', t => {
  bothColors(t, 'r6k/8/2p5/8/O7/8/8/K7 w - - 0 1', (instance, square) => {
    assert.ok(!destinations(instance, square('a4')).includes(square('c6')));
    assert.ok(destinations(instance, square('a4')).includes(square('a8')));
    assert.throws(() => instance.move({ from: square('a4'), to: square('c6') }), /not legal/);
  });
  bothColors(t, 'k7/8/5K2/4P3/3o4/8/8/7R w - - 0 1', (instance, square) => {
    assert.equal(instance.isCheck(), true);
    assert.deepEqual(destinations(instance, square('h1')), [], 'a jumping check cannot be blocked');
    assert.ok(!destinations(instance, square('f6')).includes(square('f5')));
    assert.ok(destinations(instance, square('f6')).includes(square('g7')));
  });
  for (const fen of ['8/8/5k2/8/3O4/8/8/K7 w - - 0 1', '8/8/8/4k3/3O4/8/8/K7 w - - 0 1']) {
    assert.throws(() => new VariantGame(fen, CURRENT_VARIANT), /inactive king/);
    assert.throws(() => new VariantGame(opposite(fen), CURRENT_VARIANT), /inactive king/);
  }
});

test('standard and purple rooks castle in either corner combination without changing type', t => {
  for (const left of ['R', 'O']) for (const right of ['R', 'O']) {
    bothColors(t, position({ e1: 'K', e8: 'k', a1: left, h1: right }, 'w', 'KQ'), (instance, square) => {
      const before = instance.fen();
      const kingside = instance.move('O-O');
      assert.equal(kingside.flags, 'k');
      assert.equal(instance.get(square('g1')).type, 'k');
      assert.equal(instance.get(square('f1')).type, right.toLowerCase());
      assert.equal(instance.get(square('h1')), undefined);
      assert.equal(instance.get(square('a1')).type, left.toLowerCase());
      assert.equal(instance.fen().split(' ')[2], '-');
      instance.undo();
      assert.equal(instance.fen(), before);
      const queenside = instance.move('O-O-O');
      assert.equal(queenside.flags, 'q');
      assert.equal(instance.get(square('c1')).type, 'k');
      assert.equal(instance.get(square('d1')).type, left.toLowerCase());
      assert.equal(instance.get(square('a1')), undefined);
      assert.equal(instance.get(square('h1')).type, right.toLowerCase());
      instance.undo();
      assert.equal(instance.fen(), before);
    });
  }
});

test('custom castling still requires empty paths and safe king squares', t => {
  const fixtures = [
    ['4kr2/8/8/8/8/8/8/O3K2O w KQ - 0 1', ['O-O-O']],
    ['4k1r1/8/8/8/8/8/8/O3K2O w KQ - 0 1', ['O-O-O']],
    ['4k3/8/8/8/8/8/4r3/O3K2O w KQ - 0 1', []],
    ['4k3/8/8/8/8/8/8/O3K1NO w KQ - 0 1', ['O-O-O']],
    ['4k3/8/8/8/8/8/8/ON2K2O w KQ - 0 1', ['O-O']],
    ['4k2r/8/8/8/8/8/8/O3K2O w KQ - 0 1', ['O-O', 'O-O-O']],
  ];
  for (const [fen, expected] of fixtures) bothColors(t, fen, instance => {
    assert.deepEqual(instance.moves().filter(san => /^O-O/.test(san)).sort(), [...expected].sort(), fen);
  });
});

test('moving upgraded rooks or the royal king consumes only the correct castling rights', t => {
  for (const [from, to, rights] of [['a1', 'a2', 'K'], ['h1', 'h2', 'Q'], ['e1', 'f1', '-']]) {
    bothColors(t, '4k3/8/8/8/8/8/8/O3K2O w KQ - 0 1', (instance, square, color) => {
      const before = instance.fen();
      instance.move({ from: square(from), to: square(to) });
      assert.equal(instance.fen().split(' ')[2], color === 'w' ? rights : rights.toLowerCase());
      instance.move({ from: square('e8'), to: square('d8') });
      instance.move({ from: square(to), to: square(from) });
      assert.equal(instance.fen().split(' ')[2], color === 'w' ? rights : rights.toLowerCase());
      instance.undo();
      instance.undo();
      instance.undo();
      assert.equal(instance.fen(), before);
    });
  }
});

test('capturing a corner upgrade removes its castling right and undo restores it', t => {
  for (const [bishop, target, remaining] of [['b2', 'a1', 'K'], ['g2', 'h1', 'Q']]) {
    const fen = position({ e1: 'K', e8: 'k', a1: 'O', h1: 'O', [bishop]: 'b' }, 'b', 'KQ');
    bothColors(t, fen, (instance, square, color) => {
      const before = instance.fen();
      const move = instance.move({ from: square(bishop), to: square(target) });
      assert.equal(move.captured, 'o');
      assert.equal(instance.fen().split(' ')[2], color === 'w' ? remaining : remaining.toLowerCase());
      instance.undo();
      assert.equal(instance.fen(), before);
      assert.equal(instance.get(square(target)).type, 'o');
    });
  }
});

test('upgraded-rook PGN round trips preserve the army, castling, move history, and undo', t => {
  bothColors(t, '4k3/8/8/8/8/8/8/R3K2O w KQ - 0 1', (instance, square) => {
    instance.move('O-O');
    instance.move({ from: square('e8'), to: square('d8') });
    const loaded = game(t);
    loaded.loadPgn(instance.pgn());
    assert.equal(loaded.variant, CURRENT_VARIANT);
    assert.equal(loaded.fen(), instance.fen());
    assert.deepEqual(loaded.history(), instance.history());
    assert.equal(loaded.get(square('f1')).type, 'o');
    loaded.undo();
    loaded.undo();
    assert.equal(loaded.get(square('h1')).type, 'o');
    assert.ok(loaded.moves().includes('O-O'));
  });
});

test('pawn promotions remain standard and cannot grant a purple rook or fresh castling rights', t => {
  for (const pawn of ['P', 'A', 'C', 'D']) {
    bothColors(t, position({ a1: 'K', h8: 'k', a7: pawn }), (instance, square) => {
      const moves = instance.moves({ square: square('a7'), verbose: true }).filter(move => move.to === square('a8'));
      assert.deepEqual(moves.map(move => move.promotion).sort(), ['b', 'n', 'q', 'r']);
      assert.throws(() => instance.move({ from: square('a7'), to: square('a8'), promotion: 'o' }), /not legal/);
      instance.move({ from: square('a7'), to: square('a8'), promotion: 'r' });
      assert.equal(instance.get(square('a8')).type, 'r');
      assert.equal(instance.fen().split(' ')[2], '-');
    });
  }
});

test('native and browser rules agree on purple rook jumps, pins, checks, and custom castling', { skip: !process.env.FAIRY_STOCKFISH_PATH }, t => {
  const fixtures = [
    position(base),
    position({ ...base, c4: 'P', b4: 'p', c5: 'P', b6: 'p', e5: 'P', f6: 'p', f5: 'p' }),
    'r6k/8/2p5/8/O7/8/8/K7 w - - 0 1',
    'k7/8/5K2/4P3/3o4/8/8/7R w - - 0 1',
    '4k3/8/8/8/8/5p2/6P1/R3K2O w KQ - 0 1',
    '4kr2/8/8/8/8/8/8/O3K2O w KQ - 0 1',
    '4k3/8/8/8/8/8/4r3/O3K2O w KQ - 0 1',
  ];
  for (const initial of fixtures) for (const fen of [initial, opposite(initial)]) {
    const instance = game(t, fen);
    const input = `setoption name VariantPath value ${path.resolve(__dirname, '../variants/levelup-v5.ini')}\nsetoption name UCI_Variant value levelup-v5\nposition fen ${fen}\ngo perft 1\nquit\n`;
    const result = spawnSync(process.env.FAIRY_STOCKFISH_PATH, [], { input, encoding: 'utf8', timeout: 15000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    const native = [...result.stdout.matchAll(/^([a-h][1-8][a-h][1-8][a-z]*): 1$/gm)].map(match => match[1]).sort();
    const browser = instance.moves({ verbose: true }).map(move => move.from + move.to + (move.promotion || '')).sort();
    assert.deepEqual(native, browser, fen);
  }
});
