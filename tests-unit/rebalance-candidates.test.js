const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { build } = require('esbuild');
const { rulesBuildOptions } = require('../scripts/rules-build');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { getDesign } = require('../src/design-catalog');
const { pieceMap } = require('../src/profile-fen');

const IDS = { ranging: 'pawn.purple@7', courier: 'pawn.purple@8', rank: 'pawn.purple@9',
  vertical: 'bishop.purple@3', sideways: 'bishop.purple@4', blink: 'rook.purple@4', companion: 'queen.purple@4' };
const fixtures = [], consequences = [];
let profile, rules, directory, ini;
const letter = id => profile.registry.allocations.find(allocation => allocation.id === id).letter.toUpperCase();
const reflect = square => square[0] + (9 - Number(square[1]));
const swapCase = text => text.replace(/[a-z]/gi, c => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase());
function position(pieces, turn = 'w', rights = '-', ep = '-', halfmove = 0) {
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
  return `${placement} ${turn} ${rights} ${ep} ${halfmove} 1`;
}
function opposite(fen) {
  const fields = fen.split(' ');
  fields[0] = swapCase(fields[0].split('/').reverse().join('/'));
  fields[1] = fields[1] === 'w' ? 'b' : 'w';
  const rights = swapCase(fields[2]);
  fields[2] = [...'KQkq'].filter(c => rights.includes(c)).join('') || '-';
  if (fields[3] !== '-') fields[3] = fields[3].match(/[a-h][1-8]/g).map(reflect).sort().join('');
  return fields.join(' ');
}
function board(t, fen) {
  const instance = rules.createBoard(fen);
  t.after(() => instance.dispose());
  return instance;
}
function both(t, name, fen, check) {
  for (const color of ['w', 'b']) {
    const input = color === 'w' ? fen : opposite(fen);
    fixtures.push({ name: `${name}: ${color}`, fen: input });
    check(board(t, input), color === 'w' ? square => square : reflect, color);
  }
}
const targets = (instance, from) => [...new Set(instance.moves().filter(move => move.startsWith(from)).map(move => move.slice(2, 4)))].sort();
function push(instance, move, name) {
  const fen = instance.fen();
  assert.equal(instance.push(move), true, name);
  consequences.push({ name, fen, move, expected: instance.fen() });
}
const base = type => ({ h1: 'K', h7: 'k', d4: type });

test.before(async () => {
  directory = mkdtempSync(path.join(os.tmpdir(), 'levelup-rebalance-candidates-'));
  const output = path.join(directory, 'rules.cjs');
  await build({ ...rulesBuildOptions(), absWorkingDir: path.resolve(__dirname, '..'),
    entryPoints: ['src/balance-rules.js'], bundle: true, platform: 'node', format: 'cjs', outfile: output, legalComments: 'none' });
  const squareFor = { pawn: 'd2', bishop: 'c1', rook: 'a1', queen: 'd1' };
  profile = compileDesignProfile(createDesignRegistry({ schemaVersion: 2, comparisons: Object.values(IDS).map(id => ({
    armyA: { upgrades: { [squareFor[getDesign(id).family]]: id } }, armyB: {},
  })) }));
  rules = await require(output).createMatchRules({ profile });
  ini = path.join(directory, 'profile.ini'); writeFileSync(ini, profile.config);
});
test.after(() => { if (directory) rmSync(directory, { recursive: true, force: true }); });

test('Ranging keeps quiet rook range but captures at most two clear diagonal squares', t => {
  const type = letter(IDS.ranging);
  both(t, 'Ranging quiet mobility', position(base(type)), (instance, square) => {
    assert.deepEqual(targets(instance, square('d4')), ['a4', 'b4', 'c4', 'd1', 'd2', 'd3', 'd5', 'd6', 'd7', 'd8', 'e4', 'f4', 'g4', 'h4'].map(square).sort());
  });
  both(t, 'Ranging bounded captures', position({ ...base(type), b6: 'p', g7: 'p', b2: 'p', g1: 'p', c4: 'P', d5: 'P' }), (instance, square) => {
    const legal = targets(instance, square('d4'));
    for (const target of ['b6', 'b2']) assert.ok(legal.includes(square(target)), target);
    for (const target of ['g7', 'g1', 'c4', 'd6', 'c3', 'e5']) assert.ok(!legal.includes(square(target)), target);
    push(instance, square('d4') + square('b6'), 'Ranging two-square capture');
  });
});

test('Courier captures unlimited forward diagonals while blocked rays and all backward moves remain forbidden', t => {
  const type = letter(IDS.courier);
  both(t, 'Courier long captures', position({ ...base(type), a7: 'p', g7: 'p', b2: 'p', f2: 'p', d2: 'p', a4: 'p' }), (instance, square) => {
    const legal = targets(instance, square('d4'));
    for (const target of ['a7', 'g7', 'd8', 'h4']) assert.ok(legal.includes(square(target)), target);
    for (const target of ['b2', 'f2', 'd2', 'a4', 'e5']) assert.ok(!legal.includes(square(target)), target);
    push(instance, square('d4') + square('g7'), 'Courier long forward capture');
  });
  both(t, 'Courier blocked forward diagonal', position({ ...base(type), c5: 'P', a7: 'p', e5: 'p', g7: 'p' }), (instance, square) => {
    const legal = targets(instance, square('d4'));
    assert.ok(legal.includes(square('e5')));
    for (const target of ['c5', 'a7', 'g7']) assert.ok(!legal.includes(square(target)), target);
  });
});

test('Rank adds only wide forward knight jumps and combines them with rank control and ordinary pawn captures', t => {
  const type = letter(IDS.rank);
  both(t, 'Rank empty jumps', position(base(type)), (instance, square) => {
    assert.deepEqual(targets(instance, square('d4')), ['a4', 'b4', 'c4', 'd5', 'e4', 'f4', 'g4', 'h4', 'b5', 'f5'].map(square).sort());
  });
  both(t, 'Rank blocked jumps and four next-rank captures', position({ ...base(type), c4: 'P', e4: 'P', d5: 'P', b5: 'p', c5: 'p', e5: 'p', f5: 'p' }), (instance, square) => {
    assert.deepEqual(targets(instance, square('d4')), ['b5', 'c5', 'e5', 'f5'].map(square).sort());
    push(instance, square('d4') + square('b5'), 'Rank wide capture crosses adjacent blocker');
    assert.equal(pieceMap(instance.fen()).has(square('c4')), true);
  });
  both(t, 'Rank initial clear double', position({ h1: 'K', h7: 'k', d2: type }), (instance, square, color) => {
    push(instance, square('d2') + square('d4'), 'Rank initial double');
    assert.equal(instance.fen().split(' ')[3], color === 'w' ? 'd3d4' : 'd5d6');
    assert.equal(board(t, instance.fen()).fen(), instance.fen());
  });
  both(t, 'Rank blocked initial double', position({ h1: 'K', h7: 'k', d2: type, d3: 'P' }), (instance, square) => {
    assert.ok(!instance.moves().includes(square('d2') + square('d4')));
  });
});

test('Every new pawn has mandatory standard promotions, ordinary diagonal EP and precise quiet EP visits', t => {
  for (const id of [IDS.ranging, IDS.courier, IDS.rank]) {
    both(t, `${id} promotions`, position({ h1: 'K', h6: 'k', b7: letter(id) }), (instance, square) => {
      const move = square('b7') + square('b8');
      assert.deepEqual(instance.moves().filter(value => value.startsWith(move)).sort(), ['b', 'n', 'q', 'r'].map(type => move + type));
      push(instance, move + 'n', `${id} standard promotion`);
      assert.equal(pieceMap(instance.fen()).get(square('b8')).toLowerCase(), 'n');
    });
    both(t, `${id} ordinary en passant`, position({ h1: 'K', h7: 'k', c5: letter(id), d5: 'p' }, 'w', '-', 'd6'), (instance, square) => {
      push(instance, square('c5') + square('d6'), `${id} en passant capture`);
      assert.equal(pieceMap(instance.fen()).has(square('d5')), false);
    });
  }
  for (const [id, from] of [[IDS.ranging, 'a6'], [IDS.courier, 'a6'], [IDS.rank, 'b5']]) {
    both(t, `${id} quiet en passant visit`, position({ h1: 'K', h7: 'k', [from]: letter(id), d5: 'p' }, 'w', '-', 'd6'), (instance, square) => {
      push(instance, square(from) + square('d6'), `${id} quiet visit to EP target`);
      assert.equal(pieceMap(instance.fen()).has(square('d5')), true, 'a quiet move leaves the bypassed pawn');
      assert.equal(board(t, instance.fen()).fen(), instance.fen());
    });
  }
});

test('Pawn halfmove counters distinguish reversible quiet rank movement, forward progress and captures', t => {
  for (const id of [IDS.ranging, IDS.courier, IDS.rank]) {
    for (const [target, expected] of [['f4', 38], ['d5', id === IDS.ranging ? 38 : 0]]) {
      both(t, `${id} halfmove ${target}`, position(base(letter(id)), 'w', '-', '-', 37), (instance, square) => {
        push(instance, square('d4') + square(target), `${id} quiet clock ${target}`);
        assert.equal(Number(instance.fen().split(' ')[4]), expected);
      });
    }
    both(t, `${id} capture clock`, position({ ...base(letter(id)), e5: 'p' }, 'w', '-', '-', 37), (instance, square) => {
      push(instance, square('d4') + square('e5'), `${id} capture clock`);
      assert.equal(Number(instance.fen().split(' ')[4]), 0);
    });
  }
  both(t, 'Rank forward leap clock', position(base(letter(IDS.rank)), 'w', '-', '-', 37), (instance, square) => {
    push(instance, square('d4') + square('f5'), 'Rank forward leap clock');
    assert.equal(Number(instance.fen().split(' ')[4]), 0);
  });
});

test('New pawn capture paths and wide jumps also require a standard promotion on landing', t => {
  for (const [id, from, to] of [[IDS.ranging, 'd6', 'f8'], [IDS.courier, 'd4', 'h8'], [IDS.rank, 'd7', 'f8']]) {
    both(t, `${id} capture-path promotion`, position({ h1: 'K', h6: 'k', [from]: letter(id), [to]: 'r' }), (instance, square) => {
      const move = square(from) + square(to);
      assert.deepEqual(instance.moves().filter(candidate => candidate.startsWith(move)).sort(), ['b', 'n', 'q', 'r'].map(type => move + type));
      push(instance, move + 'q', `${id} capture-path standard promotion`);
      assert.equal(pieceMap(instance.fen()).get(square(to)).toLowerCase(), 'q');
    });
  }
});

test('Vertical bishop jumps to empty knight squares without gaining knight captures', t => {
  const type = letter(IDS.vertical);
  both(t, 'Vertical quiet jumps', position({ h1: 'K', h7: 'k', d4: type, c4: 'P', e4: 'P', d3: 'P', d5: 'P', b3: 'p', f5: 'p', c2: 'P' }), (instance, square) => {
    const legal = targets(instance, square('d4'));
    for (const target of ['b5', 'c6', 'e6', 'f3', 'e2']) assert.ok(legal.includes(square(target)), target);
    for (const target of ['b3', 'f5', 'c2', 'c4', 'd6']) assert.ok(!legal.includes(square(target)), target);
    push(instance, square('d4') + square('c6'), 'Vertical quiet jump over blockers');
  });
  both(t, 'Vertical long file capture', position({ h1: 'K', h7: 'k', d4: type, d8: 'p' }), (instance, square) => {
    push(instance, square('d4') + square('d8'), 'Vertical unlimited rook-file capture');
  });
});

test('Sideways bishop gains only clear horizontal captures up to two squares while retaining wide jumps', t => {
  const type = letter(IDS.sideways);
  both(t, 'Sideways bounded captures', position({ h1: 'K', h7: 'k', d4: type, b4: 'p', f4: 'p', a4: 'p', g4: 'p', b5: 'p', f5: 'p' }), (instance, square) => {
    const legal = targets(instance, square('d4'));
    for (const target of ['b4', 'f4', 'b5', 'f5']) assert.ok(legal.includes(square(target)), target);
    for (const target of ['a4', 'g4', 'd5', 'c6']) assert.ok(!legal.includes(square(target)), target);
    push(instance, square('d4') + square('f4'), 'Sideways two-square horizontal capture');
  });
  both(t, 'Sideways blocked horizontal', position({ h1: 'K', h7: 'k', d4: type, e4: 'P', f4: 'p', c4: 'p', b4: 'p' }), (instance, square) => {
    const legal = targets(instance, square('d4'));
    assert.ok(legal.includes(square('c4')));
    for (const target of ['e4', 'f4', 'b4']) assert.ok(!legal.includes(square(target)), target);
  });
});

test('Blink captures adjacent diagonals, keeps longer jumps quiet and still castles as a rook', t => {
  const type = letter(IDS.blink);
  both(t, 'Blink capture distinctions', position({ h1: 'K', h7: 'k', d4: type, c4: 'P', e4: 'P', d3: 'P', d5: 'P', c3: 'p', e5: 'p', b2: 'p', f6: 'p', g7: 'p' }), (instance, square) => {
    const legal = targets(instance, square('d4'));
    for (const target of ['c3', 'e5', 'a7', 'g1']) assert.ok(legal.includes(square(target)), target);
    for (const target of ['b2', 'f6', 'g7']) assert.ok(!legal.includes(square(target)), target);
    push(instance, square('d4') + square('e5'), 'Blink adjacent diagonal capture');
  });
  both(t, 'Blink castling', position({ e1: 'K', a1: type, h1: type, e8: 'k' }, 'w', 'KQ'), (instance, square) => {
    assert.ok(instance.moves().includes(square('e1') + square('c1')));
    push(instance, square('e1') + square('g1'), 'Blink king-side castling');
    assert.equal(pieceMap(instance.fen()).get(square('f1')).toLowerCase(), type.toLowerCase());
  });
});

test('Blink adjacent diagonals give check, while quiet long jumps do not forbid ordinary king steps or castling', t => {
  const enemy = letter(IDS.blink).toLowerCase();
  both(t, 'Blink adjacent diagonal check', position({ e1: 'K', e8: 'k', a1: 'N', h1: 'R', d2: enemy }, 'w', 'K'), (instance, square) => {
    assert.deepEqual(targets(instance, square('a1')), [], 'the knight cannot ignore the new diagonal check');
    assert.ok(!instance.moves().includes(square('e1') + square('g1')), 'a king in diagonal check cannot castle');
    assert.ok(!instance.moves().includes(square('e1') + square('e2')), 'a king cannot step into an adjacent diagonal capture');
    assert.ok(!instance.moves().includes(square('e1') + square('d1')), 'ordinary rook capture lines still attack');
  });
  both(t, 'Blink quiet castling destinations', position({ e1: 'K', h1: 'R', e8: 'k', d3: enemy }, 'w', 'K'), (instance, square) => {
    assert.ok(instance.moves().includes(square('e1') + square('f1')));
    assert.ok(instance.moves().includes(square('e1') + square('g1')));
  });
});

test('Companion keeps all quiet king steps, captures only diagonally and remains a capturable nonroyal extra', t => {
  const type = letter(IDS.companion);
  both(t, 'Companion quiet steps', position({ h1: 'K', h7: 'k', d4: type }), (instance, square) => {
    assert.deepEqual(targets(instance, square('d4')), ['c3', 'c4', 'c5', 'd3', 'd5', 'e3', 'e4', 'e5'].map(square).sort());
  });
  both(t, 'Companion capture restrictions', position({ h1: 'K', h7: 'k', d4: type, c3: 'p', e5: 'p', c4: 'p', d5: 'p' }), (instance, square) => {
    const legal = targets(instance, square('d4'));
    for (const target of ['c3', 'e5']) assert.ok(legal.includes(square(target)), target);
    for (const target of ['c4', 'd5']) assert.ok(!legal.includes(square(target)), target);
    push(instance, square('d4') + square('e5'), 'Companion diagonal capture');
  });
  both(t, 'Companion nonroyal capture', position({ h1: 'K', h7: 'k', d4: type, d8: 'r' }, 'b'), (instance, square) => {
    push(instance, square('d8') + square('d4'), 'Companion can be captured');
    assert.equal(instance.outcome(), null);
  });
  const army = { upgrades: { d1: IDS.companion } };
  const pieces = pieceMap(rules.startingFen(army, army));
  for (const [square, expected] of [['d1', 'Q'], ['d2', type], ['d3', 'P'], ['d8', 'q'], ['d7', type.toLowerCase()], ['d6', 'p']]) assert.equal(pieces.get(square), expected);
  assert.deepEqual(profile.roles.royalTypes, ['k']);
});

test('New revisions retain ordinary royal safety and predecessor profiles keep exact capability identities', t => {
  for (const id of Object.values(IDS)) both(t, `${id} pinned`, position({ c4: 'K', h7: 'k', d4: letter(id), h4: 'r' }), (instance, square) => {
    assert.ok(!targets(instance, square('d4')).includes(square('d5')), id);
  });
  for (const probe of profile.capabilityProbes) {
    const instance = board(t, probe.fen);
    assert.ok(instance.moves().length, probe.name);
    fixtures.push(probe);
  }
  const previousIds = ['bishop.blue@1', 'bishop.orange@1', 'bishop.purple@1', 'knight.blue@1', 'knight.orange@1', 'knight.purple@1', 'pawn.blue@1', 'pawn.orange@1', 'pawn.purple@1', 'pawn.purple@2', 'queen.blue@1', 'queen.orange@1', 'queen.purple@1', 'rook.blue@1', 'rook.orange@1', 'rook.purple@1', 'rook.purple@2'];
  const previous = compileDesignProfile(createDesignRegistry({ schemaVersion: 2, comparisons: previousIds.map(id => ({ armyA: { upgrades: { a2: id } }, armyB: {} })) }));
  assert.equal(previous.hash, '4a00861f3419f976b90f36b44c0fcdcb3b6d075e3dbb6226395aae50ba593114');
  assert.equal(createHash('sha256').update(JSON.stringify(previous.capabilityProbes)).digest('hex'), '90cb4efb668c939caee586ace237446198e4238fe43880de798aa6af40e75bc8');
});

test('Native engine agrees with all both-color rebalance positions and capability fixtures', {
  skip: !process.env.FAIRY_STOCKFISH_PATH, timeout: 60000,
}, t => {
  const unique = [...new Map(fixtures.map(fixture => [fixture.fen, fixture])).values()];
  assert.ok(unique.length >= 70);
  // Each position supplies the complete FEN. One fixed-profile engine can
  // check them in order without paying process startup for every fixture.
  const child = spawnSync(process.env.FAIRY_STOCKFISH_PATH, [], {
    input: `setoption name VariantPath value ${ini}\nsetoption name UCI_Variant value ${profile.variant}\n`
      + unique.map(fixture => `position fen ${fixture.fen}\ngo perft 1\n`).join('') + 'quit\n',
    encoding: 'utf8', timeout: 45000, maxBuffer: 8 * 1024 * 1024,
  });
  assert.ifError(child.error); assert.equal(child.status, 0, child.stderr);
  const outputs = child.stdout.split(/^Nodes searched:.*$/m);
  assert.equal(outputs.length, unique.length + 1, 'every supplied FEN returns one complete perft result');
  unique.forEach((fixture, index) => {
    const moves = [...outputs[index].matchAll(/^([a-h][1-8][a-h][1-8][qrbn]?): 1\r?$/gm)].map(match => match[1]).sort();
    assert.deepEqual(moves, board(t, fixture.fen).moves().sort(), fixture.name);
  });
  t.diagnostic(`${unique.length} exact native/WASM legal-move comparisons`);
});

test('Native resulting FENs agree for EP, promotion, clocks, quiet jumps, captures, companion and castling', {
  skip: !process.env.FAIRY_STOCKFISH_PATH, timeout: 45000,
}, t => {
  assert.ok(consequences.length >= 45);
  const child = spawnSync(process.env.FAIRY_STOCKFISH_PATH, [], {
    input: `setoption name VariantPath value ${ini}\nsetoption name UCI_Variant value ${profile.variant}\n`
      + consequences.map(item => `position fen ${item.fen} moves ${item.move}\nd\n`).join('') + 'quit\n',
    encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
  });
  assert.ifError(child.error); assert.equal(child.status, 0, child.stderr);
  const resulting = [...child.stdout.matchAll(/^Fen: (.+)\r?$/gm)].map(match => match[1]);
  assert.equal(resulting.length, consequences.length);
  consequences.forEach((item, index) => assert.equal(resulting[index], item.expected, item.name));
  t.diagnostic(`${consequences.length} exact native/WASM resulting-FEN comparisons`);
});
