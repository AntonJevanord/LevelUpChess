const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { rulesBuildOptions } = require('../scripts/rules-build');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { getDesign } = require('../src/design-catalog');
const { pieceMap } = require('../src/profile-fen');

const IDS = { rank: 'pawn.purple@10', vertical: 'bishop.purple@5', sideways: 'bishop.purple@6',
  blink: 'rook.purple@5', companion: 'queen.purple@5' };
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
  directory = mkdtempSync(path.join(os.tmpdir(), 'levelup-alternatives-candidates-'));
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

test('Camel-rank pawn adds only wide forward camel jumps as full moves and captures', t => {
  const type = letter(IDS.rank);
  both(t, 'Rank camel quiet reach', position(base(type)), (instance, square) => {
    assert.deepEqual(targets(instance, square('d4')), ['a4', 'b4', 'c4', 'd5', 'e4', 'f4', 'g4', 'h4', 'a5', 'b5', 'f5', 'g5'].map(square).sort());
    push(instance, square('d4') + square('g5'), 'wide forward camel quiet leap');
  });
  both(t, 'Rank six forward capture contacts', position({ ...base(type), c4: 'P', e4: 'P', d5: 'P', a5: 'p', b5: 'p', c5: 'p', e5: 'p', f5: 'p', g5: 'p' }), (instance, square) => {
    assert.deepEqual(targets(instance, square('d4')), ['a5', 'b5', 'c5', 'e5', 'f5', 'g5'].map(square).sort());
    push(instance, square('d4') + square('a5'), 'wide forward camel capture crosses adjacent blocker');
    assert.equal(pieceMap(instance.fen()).has(square('c4')), true);
  });
  both(t, 'Rank rejects tall and backward camel captures', position({ ...base(type), a3: 'p', g3: 'p', c7: 'p', e7: 'p', c1: 'p', e1: 'p', a5: 'P', g5: 'P' }), (instance, square) => {
    const legal = targets(instance, square('d4'));
    for (const forbidden of ['a3', 'g3', 'c7', 'e7', 'c1', 'e1', 'a5', 'g5', 'd3']) assert.ok(!legal.includes(square(forbidden)), forbidden);
  });
});

test('Camel-rank preserves initial path clearance, standard promotion, en passant and quiet EP visits', t => {
  const type = letter(IDS.rank);
  both(t, 'Rank initial double', position({ h1: 'K', h7: 'k', d2: type }), (instance, square, color) => {
    push(instance, square('d2') + square('d4'), 'Rank initial clear double');
    assert.equal(instance.fen().split(' ')[3], color === 'w' ? 'd3d4' : 'd5d6');
  });
  both(t, 'Rank blocked initial double', position({ h1: 'K', h7: 'k', d2: type, d3: 'P' }), (instance, square) => {
    assert.ok(!instance.moves().includes(square('d2') + square('d4')));
  });
  for (const capture of [false, true]) both(t, `Rank camel ${capture ? 'capture' : 'quiet'} promotion`, position({ h1: 'K', h6: 'k', d7: type, ...(capture ? { g8: 'r' } : {}) }), (instance, square) => {
    const move = square('d7') + square('g8');
    assert.deepEqual(instance.moves().filter(candidate => candidate.startsWith(move)).sort(), ['b', 'n', 'q', 'r'].map(type => move + type));
    push(instance, move + 'n', 'Rank camel standard promotion');
    assert.equal(pieceMap(instance.fen()).get(square('g8')).toLowerCase(), 'n');
  });
  both(t, 'Rank ordinary EP', position({ h1: 'K', h7: 'k', c5: type, d5: 'p' }, 'w', '-', 'd6'), (instance, square) => {
    push(instance, square('c5') + square('d6'), 'Rank ordinary diagonal EP');
    assert.equal(pieceMap(instance.fen()).has(square('d5')), false);
  });
  both(t, 'Rank camel quiet EP visit', position({ h1: 'K', h7: 'k', a5: type, d5: 'p' }, 'w', '-', 'd6'), (instance, square) => {
    push(instance, square('a5') + square('d6'), 'Rank camel visit to empty EP square');
    assert.equal(pieceMap(instance.fen()).has(square('d5')), true, 'quiet camel leap leaves bypassed pawn');
    assert.equal(board(t, instance.fen()).fen(), instance.fen());
  });
  for (const [destination, capture, halfmove] of [['g5', false, 0], ['h4', false, 38], ['g5', true, 0]]) {
    both(t, `Rank clock ${destination} ${capture}`, position({ ...base(type), ...(capture ? { [destination]: 'p' } : {}) }, 'w', '-', '-', 37), (instance, square) => {
      push(instance, square('d4') + square(destination), 'Rank camel/rank halfmove rule');
      assert.equal(Number(instance.fen().split(' ')[4]), halfmove);
    });
  }
});

test('Tall-jump vertical bishop has four full tall knight leaps and no wide knight leaps', t => {
  const type = letter(IDS.vertical);
  both(t, 'Vertical tall knight shape', position({ h1: 'K', h7: 'k', d4: type, c4: 'P', e4: 'P', d3: 'P', d5: 'P', c2: 'p', e6: 'p', c6: 'P', b3: 'p', f5: 'p' }), (instance, square) => {
    const legal = targets(instance, square('d4'));
    for (const allowed of ['c2', 'e2', 'e6']) assert.ok(legal.includes(square(allowed)), allowed);
    for (const forbidden of ['c6', 'b3', 'b5', 'f3', 'f5', 'c4', 'd6']) assert.ok(!legal.includes(square(forbidden)), forbidden);
    push(instance, square('d4') + square('c2'), 'Vertical backward tall capture crosses blockers');
  });
  both(t, 'Vertical forward tall capture', position({ ...base(type), d5: 'P', e6: 'p' }), (instance, square) => {
    push(instance, square('d4') + square('e6'), 'Vertical forward tall capture');
  });
  both(t, 'Vertical long file retained', position({ ...base(type), d8: 'p' }), (instance, square) => {
    push(instance, square('d4') + square('d8'), 'Vertical full file capture');
  });
});

test('Long-sideways bishop slides any clear horizontal distance while keeping wide knight captures', t => {
  const type = letter(IDS.sideways);
  both(t, 'Sideways unlimited quiet range', position(base(type)), (instance, square) => {
    const legal = targets(instance, square('d4'));
    for (const allowed of ['a4', 'h4', 'b3', 'b5', 'f3', 'f5', 'a7', 'g1']) assert.ok(legal.includes(square(allowed)), allowed);
    for (const forbidden of ['d5', 'd3', 'c6', 'e2']) assert.ok(!legal.includes(square(forbidden)), forbidden);
    push(instance, square('d4') + square('h4'), 'Sideways long quiet slide');
  });
  both(t, 'Sideways far capture', position({ ...base(type), a4: 'p', h4: 'p', b5: 'p', f3: 'p' }), (instance, square) => {
    const legal = targets(instance, square('d4'));
    for (const allowed of ['a4', 'h4', 'b5', 'f3']) assert.ok(legal.includes(square(allowed)), allowed);
    push(instance, square('d4') + square('h4'), 'Sideways far horizontal capture');
  });
  both(t, 'Sideways blocked rays and jumping captures', position({ ...base(type), e4: 'P', c4: 'p', a4: 'p', h4: 'p', f5: 'p' }), (instance, square) => {
    const legal = targets(instance, square('d4'));
    for (const allowed of ['c4', 'f5']) assert.ok(legal.includes(square(allowed)), allowed);
    for (const forbidden of ['e4', 'a4', 'h4']) assert.ok(!legal.includes(square(forbidden)), forbidden);
    push(instance, square('d4') + square('f5'), 'Sideways knight capture jumps blocker');
  });
});

test('Diagonal-blink rook captures one or two clear diagonal squares and keeps longer jumps quiet', t => {
  const type = letter(IDS.blink);
  for (const destination of ['b2', 'b6', 'f2', 'f6']) {
    both(t, `Blink two-square diagonal ${destination}`, position({ ...base(type), [destination]: 'p', c4: 'P', e4: 'P', d3: 'P', d5: 'P' }), (instance, square) => {
      push(instance, square('d4') + square(destination), 'Blink two-square clear diagonal capture');
    });
  }
  both(t, 'Blink no diagonal capture through friendly blocker', position({ ...base(type), e5: 'P', f6: 'p', g7: 'p', c5: 'p', b6: 'p' }), (instance, square) => {
    const legal = targets(instance, square('d4'));
    assert.ok(legal.includes(square('c5')));
    for (const forbidden of ['f6', 'g7', 'b6']) assert.ok(!legal.includes(square(forbidden)), forbidden);
  });
  both(t, 'Blink quiet leap crosses diagonal blocker', position({ ...base(type), e5: 'P', g7: 'p', a5: 'p' }), (instance, square) => {
    const legal = targets(instance, square('d4'));
    assert.ok(legal.includes(square('f6')));
    assert.ok(!legal.includes(square('g7')));
    assert.ok(!legal.includes(square('a5')), 'other blink jumps cannot capture');
    push(instance, square('d4') + square('f6'), 'Blink quiet two-square diagonal jump crosses blocker');
  });
});

test('Diagonal-blink retains rook castling; new diagonal attacks obey blockers and forbid attacked castling paths', t => {
  const type = letter(IDS.blink), enemy = type.toLowerCase();
  both(t, 'Blink both castles', position({ e1: 'K', a1: type, h1: type, e8: 'k' }, 'w', 'KQ'), (instance, square) => {
    assert.ok(instance.moves().includes(square('e1') + square('c1')));
    push(instance, square('e1') + square('g1'), 'Blink normal rook castling');
    assert.equal(pieceMap(instance.fen()).get(square('f1')).toLowerCase(), type.toLowerCase());
  });
  both(t, 'Blink two-square diagonal forbids castle', position({ e1: 'K', h1: 'R', e8: 'k', d3: enemy }, 'w', 'K'), (instance, square) => {
    assert.ok(!instance.moves().includes(square('e1') + square('f1')), 'f1 is a two-square diagonal capture target');
    assert.ok(!instance.moves().includes(square('e1') + square('g1')), 'king cannot cross attacked f1');
  });
  both(t, 'Blink blocked diagonal permits castle', position({ e1: 'K', h1: 'R', e8: 'k', d3: enemy, e2: 'P' }, 'w', 'K'), (instance, square) => {
    assert.ok(instance.moves().includes(square('e1') + square('g1')), 'diagonal captures cannot jump the e2 blocker');
  });
});

test('Forward companion steps quietly in every king direction but captures only forward or sideways', t => {
  const type = letter(IDS.companion);
  both(t, 'Companion all quiet steps', position(base(type)), (instance, square) => {
    assert.deepEqual(targets(instance, square('d4')), ['c3', 'c4', 'c5', 'd3', 'd5', 'e3', 'e4', 'e5'].map(square).sort());
    push(instance, square('d4') + square('d3'), 'Companion quiet backward step');
  });
  both(t, 'Companion five capture directions', position({ ...base(type), c3: 'p', c4: 'p', c5: 'p', d3: 'p', d5: 'p', e3: 'p', e4: 'p', e5: 'p' }), (instance, square) => {
    assert.deepEqual(targets(instance, square('d4')), ['c4', 'c5', 'd5', 'e4', 'e5'].map(square).sort());
    push(instance, square('d4') + square('d5'), 'Companion forward orthogonal capture');
  });
  both(t, 'Companion friendly blockers', position({ ...base(type), c4: 'P', d5: 'P', e5: 'P' }), (instance, square) => {
    const legal = targets(instance, square('d4'));
    for (const forbidden of ['c4', 'd5', 'e5']) assert.ok(!legal.includes(square(forbidden)), forbidden);
  });
  const army = { upgrades: { d1: IDS.companion } };
  const pieces = pieceMap(rules.startingFen(army, army));
  for (const [square, expected] of [['d1', 'Q'], ['d2', type], ['d3', 'P'], ['d8', 'q'], ['d7', type.toLowerCase()], ['d6', 'p']]) assert.equal(pieces.get(square), expected);
  assert.deepEqual(profile.roles.royalTypes, ['k']);
});

test('Forward companion is nonroyal and its quiet backward directions do not attack the king', t => {
  const type = letter(IDS.companion);
  both(t, 'Companion enters attacked square', position({ ...base(type), e8: 'r' }), (instance, square) => {
    push(instance, square('d4') + square('e4'), 'Nonroyal companion may enter rook attack');
  });
  both(t, 'Companion capture does not end game', position({ ...base(type), d8: 'r' }, 'b'), (instance, square) => {
    push(instance, square('d8') + square('d4'), 'Companion is capturable');
    assert.equal(instance.outcome(), null);
  });
  both(t, 'Companion directional king safety', position({ e5: 'K', h8: 'k', d4: type.toLowerCase() }), (instance, square) => {
    assert.ok(instance.moves().includes(square('e5') + square('d5')), 'backward quiet direction does not attack');
    assert.ok(!instance.moves().includes(square('e5') + square('e4')), 'sideways capture direction attacks');
  });
});

test('Alternatives obey royal pins and all registered native capability positions remain playable', t => {
  for (const id of Object.values(IDS)) both(t, `${id} pinned`, position({ c4: 'K', h7: 'k', d4: letter(id), h4: 'r' }), (instance, square) => {
    assert.ok(!targets(instance, square('d4')).includes(square('d5')), id);
  });
  for (const probe of profile.capabilityProbes) {
    let instance;
    try { instance = board(t, probe.fen); }
    catch (error) { error.message = `${probe.name}: ${error.message}`; throw error; }
    assert.ok(instance.moves().length, probe.name);
    fixtures.push(probe);
  }
});

test('Native engine agrees with both-color alternative positions and capability fixtures', {
  skip: !process.env.FAIRY_STOCKFISH_PATH, timeout: 60000,
}, t => {
  const unique = [...new Map(fixtures.map(fixture => [fixture.fen, fixture])).values()];
  assert.ok(unique.length >= 60);
  const child = spawnSync(process.env.FAIRY_STOCKFISH_PATH, [], {
    input: `setoption name VariantPath value ${ini}\nsetoption name UCI_Variant value ${profile.variant}\n`
      + unique.map(fixture => `position fen ${fixture.fen}\ngo perft 1\n`).join('') + 'quit\n',
    encoding: 'utf8', timeout: 45000, maxBuffer: 8 * 1024 * 1024,
  });
  assert.ifError(child.error); assert.equal(child.status, 0, child.stderr);
  const outputs = child.stdout.split(/^Nodes searched:.*$/m);
  assert.equal(outputs.length, unique.length + 1);
  unique.forEach((fixture, index) => {
    const moves = [...outputs[index].matchAll(/^([a-h][1-8][a-h][1-8][qrbn]?): 1\r?$/gm)].map(match => match[1]).sort();
    assert.deepEqual(moves, board(t, fixture.fen).moves().sort(), fixture.name);
  });
  t.diagnostic(`${unique.length} exact native/WASM legal-move comparisons`);
});

test('Native resulting FENs agree for alternate captures, jumps, promotion, en passant, clocks and castling', {
  skip: !process.env.FAIRY_STOCKFISH_PATH, timeout: 45000,
}, t => {
  assert.ok(consequences.length >= 40);
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
