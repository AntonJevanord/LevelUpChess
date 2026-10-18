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
    ranks.push(row + (empty || ''));
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
const kings = { h1: 'K', a8: 'k' };

test('blue queens gain all three quiet leap shapes on each home rank for both colors', t => {
  for (const rank of [1, 2]) {
    const from = 'd' + rank;
    const targets = ['e' + (rank + 2), 'e' + (rank + 3), 'f' + (rank + 3)];
    bothColors(t, position({ ...kings, [from]: 'S', ['d' + (rank + 1)]: 'N', ['e' + (rank + 1)]: 'N' }), (instance, square, color) => {
      const before = instance.fen();
      for (const target of targets) {
        const move = instance.move({ from: square(from), to: square(target) });
        assert.equal(move.piece, 's');
        assert.equal(move.flags, 'n');
        assert.equal(move.captured, undefined);
        assert.equal(instance.get(square(target)).color, color);
        assert.equal(instance.get(square('d' + (rank + 1))).type, 'n');
        instance.undo();
        assert.equal(instance.fen(), before);
      }
    });
  }
});

test('blue queen leaps stop outside the home two ranks while ordinary queen moves remain', t => {
  for (const rank of [3, 4]) {
    const from = 'd' + rank;
    bothColors(t, position({ ...kings, [from]: 'S' }), (instance, square) => {
      const legal = destinations(instance, square(from));
      for (const target of ['e' + (rank + 2), 'e' + (rank + 3), 'f' + (rank + 3)]) assert.ok(!legal.includes(square(target)), target);
      assert.ok(legal.includes(square('d' + (rank + 1))));
      assert.ok(legal.includes(square('e' + (rank + 1))));
      assert.ok(legal.includes(square('f' + rank)));
    });
  }
});

test('blue queen leaps cannot capture either color while ordinary queen captures still work', t => {
  for (const target of ['e3', 'e4', 'f4']) for (const blocker of ['N', 'n']) {
    bothColors(t, position({ ...kings, d1: 'S', [target]: blocker }), (instance, square) => {
      assert.ok(!destinations(instance, square('d1')).includes(square(target)), `${target} occupied by ${blocker}`);
      assert.throws(() => instance.move({ from: square('d1'), to: square(target) }), /not legal/);
    });
  }
  bothColors(t, position({ ...kings, d1: 'S', f3: 'p' }), (instance, square) => {
    assert.equal(instance.move({ from: square('d1'), to: square('f3') }).captured, 'p');
  });
});

test('quiet queen leaps do not attack kings, but ordinary queen lines after landing give check', t => {
  bothColors(t, position({ h1: 'K', f4: 'k', d1: 'S' }, 'b'), instance => {
    assert.equal(instance.isCheck(), false, 'a quiet zebra jump is not a capture attack');
  });
  bothColors(t, position({ h1: 'K', g4: 'k', d1: 'S' }, 'b'), (instance, square) => {
    assert.equal(instance.isCheck(), true);
    assert.ok(destinations(instance, square('g4')).includes(square('f4')));
    instance.move({ from: square('g4'), to: square('f4') });
    assert.equal(instance.isCheck(), false);
  });
  bothColors(t, position({ h1: 'K', g5: 'k', d1: 'S' }), (instance, square) => {
    const move = instance.move({ from: square('d1'), to: square('e3') });
    assert.match(move.san, /\+$/);
    assert.equal(instance.isCheck(), true);
  });
});

test('blue rooks can jump two orthogonal squares over either color from either home rank', t => {
  for (const rank of [1, 2]) for (const blocker of ['N', 'n']) {
    const from = 'd' + rank;
    const targets = [['f' + rank, 'e' + rank], ['d' + (rank + 2), 'd' + (rank + 1)]];
    for (const [target, middle] of targets) bothColors(t, position({ ...kings, [from]: 'L', [middle]: blocker }), (instance, square) => {
      const before = instance.fen();
      const move = instance.move({ from: square(from), to: square(target) });
      assert.equal(move.piece, 'l');
      assert.equal(move.flags, 'n');
      assert.equal(instance.get(square(middle)).type, 'n');
      instance.undo();
      assert.equal(instance.fen(), before);
    });
  }
});

test('blue rook jumps are quiet and unavailable beyond the home two ranks', t => {
  for (const rank of [1, 2, 3, 4]) {
    const from = 'd' + rank;
    const middle = 'd' + (rank + 1);
    const target = 'd' + (rank + 2);
    bothColors(t, position({ ...kings, [from]: 'L', [middle]: 'N', [target]: 'p' }), (instance, square) => {
      assert.ok(!destinations(instance, square(from)).includes(square(target)), 'no quiet capture over a screen');
    });
    if (rank > 2) bothColors(t, position({ ...kings, [from]: 'L', [middle]: 'N' }), (instance, square) => {
      assert.ok(!destinations(instance, square(from)).includes(square(target)), 'off-home jumps are unavailable');
      assert.ok(destinations(instance, square(from)).includes(square('e' + rank)), 'ordinary rook movement remains');
    });
  }
});

test('blue rook home jumps reactivate after returning and undo restores the same legal moves', t => {
  bothColors(t, position({ ...kings, d2: 'L', e2: 'N', e4: 'N' }), (instance, square) => {
    const before = instance.fen();
    assert.ok(destinations(instance, square('d2')).includes(square('f2')));
    instance.move({ from: square('d2'), to: square('d4') });
    instance.move({ from: square('a8'), to: square('a7') });
    assert.ok(!destinations(instance, square('d4')).includes(square('f4')));
    instance.move({ from: square('d4'), to: square('d2') });
    instance.move({ from: square('a7'), to: square('a8') });
    assert.ok(destinations(instance, square('d2')).includes(square('f2')));
    for (let move = 0; move < 4; move++) instance.undo();
    assert.equal(instance.fen(), before);
    assert.ok(destinations(instance, square('d2')).includes(square('f2')));
  });
});

test('a blue rook quiet jump cannot attack across its blocker but can give check after landing', t => {
  bothColors(t, position({ h1: 'K', d3: 'k', d1: 'L', d2: 'N' }, 'b'), instance => {
    assert.equal(instance.isCheck(), false);
  });
  bothColors(t, position({ h1: 'K', d8: 'k', d1: 'L', d2: 'N' }), (instance, square) => {
    const move = instance.move({ from: square('d1'), to: square('d3') });
    assert.match(move.san, /\+$/);
    assert.equal(instance.isCheck(), true);
    assert.equal(instance.get(square('d2')).type, 'n');
  });
});

test('orange rooks capture across exactly one screen of either color in all four directions', t => {
  const rays = [['d7', 'd5'], ['d1', 'd3'], ['g4', 'e4'], ['a4', 'c4']];
  for (const [target, screen] of rays) for (const screenPiece of ['N', 'n']) {
    bothColors(t, position({ ...kings, d4: 'M', [screen]: screenPiece, [target]: 'n' }), (instance, square, color) => {
      const before = instance.fen();
      const move = instance.move({ from: square('d4'), to: square(target) });
      assert.equal(move.piece, 'm');
      assert.equal(move.captured, 'n');
      assert.equal(move.flags, 'c');
      assert.equal(instance.get(square(target)).color, color);
      assert.equal(instance.get(square(screen)).type, 'n');
      instance.undo();
      assert.equal(instance.fen(), before);
    });
  }
});

test('orange rooks retain normal first-blocker captures but cannot quietly cross screens or pass two', t => {
  bothColors(t, position({ ...kings, d4: 'M', e4: 'n', g4: 'p' }), (instance, square) => {
    const legal = destinations(instance, square('d4'));
    assert.ok(legal.includes(square('e4')), 'ordinary first blocker capture');
    assert.ok(legal.includes(square('g4')), 'capture over the first blocker');
    assert.ok(!legal.includes(square('f4')), 'no quiet move across a screen');
    assert.ok(!legal.includes(square('h4')), 'no quiet move after a screened capture target');
  });
  bothColors(t, position({ ...kings, d4: 'M', e4: 'N' }), (instance, square) => {
    for (const target of ['f4', 'g4', 'h4']) assert.ok(!destinations(instance, square('d4')).includes(square(target)));
  });
  bothColors(t, position({ ...kings, d4: 'M', e4: 'N', f4: 'n', g4: 'p' }), (instance, square) => {
    assert.ok(destinations(instance, square('d4')).includes(square('f4')));
    assert.ok(!destinations(instance, square('d4')).includes(square('g4')));
  });
  bothColors(t, position({ ...kings, d4: 'M', e4: 'N', g4: 'P' }), (instance, square) => {
    assert.ok(!destinations(instance, square('d4')).includes(square('g4')), 'a friendly landing piece cannot be captured');
  });
});

test('orange screened captures give check, forbid exposed-king captures, and attack royal destinations', t => {
  bothColors(t, position({ h1: 'K', d8: 'k', d4: 'M', d5: 'P' }, 'b'), (instance, square) => {
    assert.equal(instance.isCheck(), true);
    assert.ok(!destinations(instance, square('d8')).includes(square('d7')));
    assert.ok(destinations(instance, square('d8')).includes(square('c7')));
  });
  bothColors(t, position({ h1: 'K', g8: 'k', d4: 'M', e4: 'N', g4: 'p', g5: 'N' }), (instance, square) => {
    const move = instance.move({ from: square('d4'), to: square('g4') });
    assert.equal(move.captured, 'p');
    assert.match(move.san, /\+$/);
    assert.equal(instance.isCheck(), true);
  });
  bothColors(t, 'r6k/8/8/8/MN1p4/8/8/K7 w - - 0 1', (instance, square) => {
    assert.ok(!destinations(instance, square('a4')).includes(square('d4')));
    assert.ok(destinations(instance, square('a4')).includes(square('a8')));
    assert.throws(() => instance.move({ from: square('a4'), to: square('d4') }), /not legal/);
  });
});

test('blue and orange rooks retain their type through either castle and PGN recovery for both colors', t => {
  for (const type of ['L', 'M']) bothColors(t, position({ e1: 'K', e8: 'k', a1: type, h1: type }, 'w', 'KQ'), (instance, square) => {
    const before = instance.fen();
    for (const [san, rookSquare, kingSquare] of [['O-O', 'f1', 'g1'], ['O-O-O', 'd1', 'c1']]) {
      instance.move(san);
      assert.equal(instance.get(square(rookSquare)).type, type.toLowerCase());
      assert.equal(instance.get(square(kingSquare)).type, 'k');
      assert.equal(instance.fen().split(' ')[2], '-');
      const loaded = game(t);
      loaded.loadPgn(instance.pgn());
      assert.equal(loaded.variant, CURRENT_VARIANT);
      assert.equal(loaded.fen(), instance.fen());
      loaded.undo();
      assert.equal(loaded.fen(), before);
      instance.undo();
      assert.equal(instance.fen(), before);
    }
  });
});

test('native and browser rules agree on home leaps, screened captures, checks, pins, and L/M castles', { skip: !process.env.FAIRY_STOCKFISH_PATH }, t => {
  const fixtures = [
    position({ ...kings, d1: 'S', d2: 'N', e2: 'N' }),
    position({ ...kings, d2: 'S', d3: 'N', e3: 'N' }),
    position({ ...kings, d3: 'S' }),
    position({ ...kings, d1: 'L', d2: 'N', e1: 'N' }),
    position({ ...kings, d2: 'L', d3: 'n', e2: 'N' }),
    position({ ...kings, d3: 'L', d4: 'N' }),
    position({ ...kings, d4: 'M', e4: 'N', g4: 'p', d5: 'n', d7: 'p' }),
    position({ ...kings, d4: 'M', e4: 'N', f4: 'n', g4: 'p' }),
    position({ h1: 'K', d8: 'k', d4: 'M', d5: 'P' }, 'b'),
    'r6k/8/8/8/MN1p4/8/8/K7 w - - 0 1',
    position({ e1: 'K', e8: 'k', a1: 'L', h1: 'M' }, 'w', 'KQ'),
  ];
  for (const initial of fixtures) for (const fen of [initial, opposite(initial)]) {
    const instance = game(t, fen);
    const input = `setoption name VariantPath value ${path.resolve(__dirname, '../variants/levelup-v5.ini')}\nsetoption name UCI_Variant value levelup-v5\nposition fen ${fen}\ngo perft 1\nquit\n`;
    const result = spawnSync(process.env.FAIRY_STOCKFISH_PATH, [], { input, encoding: 'utf8', timeout: 15000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    const native = [...result.stdout.matchAll(/^([a-h][1-8][a-h][1-8][a-z]*): 1\r?$/gm)].map(match => match[1]).sort();
    const browser = instance.moves({ verbose: true }).map(move => move.from + move.to + (move.promotion || '')).sort();
    assert.deepEqual(native, browser, fen);
  }
});
