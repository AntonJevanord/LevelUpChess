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

const IDS = {
  camel: 'knight.orange@2', bishop: 'bishop.purple@2', rook: 'rook.purple@3',
  shortQueen: 'queen.purple@2', guard: 'queen.purple@3', twins: 'pawn.orange@2',
};
const fixtures = [], consequences = [];
let profile, rules, directory, ini;
const letter = id => profile.registry.allocations.find(allocation => allocation.id === id).letter.toUpperCase();
const reflectSquare = square => square[0] + (9 - Number(square[1]));
function position(pieces, turn = 'w', castling = '-') {
  const placement = Array.from({ length: 8 }, (_, row) => {
    let rank = '', empty = 0;
    for (const file of 'abcdefgh') {
      const piece = pieces[file + (8 - row)];
      if (!piece) { empty++; continue; }
      if (empty) rank += empty;
      empty = 0;
      rank += piece;
    }
    return rank + (empty || '');
  }).join('/');
  return `${placement} ${turn} ${castling} - 0 1`;
}
function opposite(fen) {
  const fields = fen.split(' ');
  const oppositeCase = value => value.replace(/[a-z]/gi, character => character === character.toUpperCase() ? character.toLowerCase() : character.toUpperCase());
  fields[0] = oppositeCase(fields[0].split('/').reverse().join('/'));
  fields[1] = fields[1] === 'w' ? 'b' : 'w';
  const rights = oppositeCase(fields[2]);
  fields[2] = [...'KQkq'].filter(character => rights.includes(character)).join('') || '-';
  return fields.join(' ');
}
function board(t, fen) {
  const instance = rules.createBoard(fen);
  t.after(() => instance.dispose());
  return instance;
}
function bothColors(t, name, fen, check) {
  for (const color of ['w', 'b']) {
    const input = color === 'w' ? fen : opposite(fen);
    fixtures.push({ name: `${name}, ${color}`, fen: input });
    check(board(t, input), color === 'w' ? square => square : reflectSquare, color);
  }
}
const targets = (instance, from) => instance.moves().filter(move => move.startsWith(from)).map(move => move.slice(2, 4)).sort();
function push(instance, move, name) {
  const fen = instance.fen();
  assert.equal(instance.push(move), true, name);
  consequences.push({ name, fen, move, expected: instance.fen() });
}
const base = type => ({ h1: 'K', h7: 'k', d4: type });
function offsets(deltas) {
  return deltas.map(([file, rank]) => 'abcdefgh'[3 + file] + (4 + rank)).sort();
}
const knightOffsets = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const camelOffsets = [[1, 3], [3, 1], [-1, 3], [-3, 1], [1, -3], [3, -1], [-1, -3], [-3, -1]];

test.before(async () => {
  directory = mkdtempSync(path.join(os.tmpdir(), 'levelup-mobility-candidates-'));
  const output = path.join(directory, 'rules.cjs');
  await build({
    ...rulesBuildOptions(), absWorkingDir: path.resolve(__dirname, '..'), entryPoints: ['src/balance-rules.js'],
    bundle: true, platform: 'node', format: 'cjs', outfile: output, legalComments: 'none',
  });
  const squareFor = { pawn: 'a2', knight: 'b1', bishop: 'c1', rook: 'a1', queen: 'd1' };
  profile = compileDesignProfile(createDesignRegistry({ schemaVersion: 2, comparisons: Object.values(IDS).map(id => ({
    armyA: { upgrades: { [squareFor[getDesign(id).family]]: id } }, armyB: {},
  })) }));
  rules = await require(output).createMatchRules({ profile });
  ini = path.join(directory, 'profile.ini');
  writeFileSync(ini, profile.config);
});
test.after(() => { if (directory) rmSync(directory, { recursive: true, force: true }); });

test('Camel knight has all sixteen knight/camel jumps, with captures and no blocked intermediate squares', t => {
  const type = letter(IDS.camel);
  bothColors(t, 'camel open', position(base(type)), (instance, square) => {
    assert.deepEqual(targets(instance, square('d4')), offsets([...knightOffsets, ...camelOffsets]).map(square).sort());
  });
  bothColors(t, 'camel blockers and captures', position({ ...base(type), c4: 'P', e4: 'P', d3: 'P', d5: 'P', b3: 'p', c1: 'p', g3: 'p', f3: 'P' }), (instance, square) => {
    assert.deepEqual(targets(instance, square('d4')), offsets([...knightOffsets, ...camelOffsets]).filter(target => target !== 'f3').map(square).sort());
    push(instance, square('d4') + square('c1'), 'camel jump captures over a blocker');
    assert.equal(pieceMap(instance.fen()).has(square('d3')), true, 'intervening pawn survives');
  });
});

test('Sideways bishop slides quietly up to two files and jumps/captures on four wide knight squares', t => {
  const type = letter(IDS.bishop);
  const diagonal = ['a1', 'b2', 'c3', 'e5', 'f6', 'g7', 'h8', 'b6', 'a7', 'c5', 'e3', 'f2', 'g1'];
  bothColors(t, 'sideways bishop open', position(base(type)), (instance, square) => {
    assert.deepEqual(targets(instance, square('d4')), [...diagonal, 'b4', 'c4', 'e4', 'f4', 'b3', 'b5', 'f3', 'f5'].map(square).sort());
  });
  bothColors(t, 'sideways bishop quiet ray and leap captures', position({ ...base(type), c4: 'P', e4: 'p', b3: 'p', b5: 'p', f3: 'p', f5: 'P' }), (instance, square) => {
    const legal = targets(instance, square('d4'));
    for (const forbidden of ['b4', 'c4', 'e4', 'f4', 'f5', 'c2', 'e2']) assert.ok(!legal.includes(square(forbidden)), forbidden);
    for (const allowed of ['b3', 'b5', 'f3']) assert.ok(legal.includes(square(allowed)), allowed);
    push(instance, square('d4') + square('f3'), 'sideways knight capture crosses blocked horizontal ray');
    assert.equal(pieceMap(instance.fen()).has(square('e4')), true);
  });
});

test('Mobile rook quietly jumps to every empty square within three, plus its ordinary clear rook rays', t => {
  const type = letter(IDS.rook);
  const nearby = [];
  for (const file of 'abcdefg') for (let rank = 1; rank <= 7; rank++) {
    if (file + rank !== 'd4') nearby.push(file + rank);
  }
  assert.equal(nearby.length, 48);
  bothColors(t, 'mobile rook empty neighborhood', position(base(type)), (instance, square) => {
    assert.deepEqual(targets(instance, square('d4')), [...nearby, 'd8', 'h4'].map(square).sort());
  });
  bothColors(t, 'mobile rook blocked quiet jumps', position({ ...base(type), c4: 'P', e4: 'P', d3: 'P', d5: 'P', c3: 'P', e5: 'p', f6: 'p', g7: 'p', d7: 'p', h4: 'p' }), (instance, square) => {
    const legal = targets(instance, square('d4'));
    for (const allowed of ['a1', 'b2', 'd6', 'f4', 'g4']) assert.ok(legal.includes(square(allowed)), allowed);
    for (const forbidden of ['e5', 'f6', 'g7', 'd7', 'h4']) assert.ok(!legal.includes(square(forbidden)), forbidden);
    push(instance, square('d4') + square('a1'), 'quiet three-square diagonal jump crosses pieces');
    assert.equal(pieceMap(instance.fen()).has(square('c3')), true);
    assert.equal(pieceMap(instance.fen()).has(square('c4')), true);
  });
  bothColors(t, 'mobile rook ordinary capture', position({ ...base(type), d7: 'p' }), (instance, square) => {
    assert.ok(targets(instance, square('d4')).includes(square('d7')));
    push(instance, square('d4') + square('d7'), 'mobile rook captures on a clear rook line');
  });
});

test('Mobile rook quiet leaps do not attack the king or castling path; ordinary rook attacks still do', t => {
  const type = letter(IDS.rook).toLowerCase();
  bothColors(t, 'quiet leaps do not attack castling', position({ e1: 'K', h1: 'R', e8: 'k', d3: type }, 'w', 'K'), (instance, square) => {
    assert.ok(instance.moves().includes(square('e1') + square('g1')));
    assert.ok(instance.moves().includes(square('e1') + square('f1')));
    push(instance, square('e1') + square('g1'), 'king castles through quiet-only leap destinations');
  });
  bothColors(t, 'rook file attacks prevent castling', position({ e1: 'K', h1: 'R', e8: 'k', f3: type }, 'w', 'K'), (instance, square) => {
    assert.ok(!instance.moves().includes(square('e1') + square('g1')));
    assert.ok(!instance.moves().includes(square('e1') + square('f1')));
  });
});

test('Upgraded mobile rooks castle as rooks and arrive on f1/f8', t => {
  const type = letter(IDS.rook);
  bothColors(t, 'mobile rook castles', position({ e1: 'K', h1: type, e8: 'k' }, 'w', 'K'), (instance, square, color) => {
    push(instance, square('e1') + square('g1'), 'castling with custom mobile rook');
    const pieces = pieceMap(instance.fen());
    assert.equal(pieces.get(square('g1')), color === 'w' ? 'K' : 'k');
    assert.equal(pieces.get(square('f1')), color === 'w' ? type : type.toLowerCase());
    assert.equal(pieces.has(square('h1')), false);
  });
});

test('Short queens move/capture on clear queen lines up to two squares without jumping', t => {
  const type = letter(IDS.shortQueen);
  bothColors(t, 'short queen open', position(base(type)), (instance, square) => {
    assert.deepEqual(targets(instance, square('d4')), ['b2', 'b4', 'b6', 'c3', 'c4', 'c5', 'd2', 'd3', 'd5', 'd6', 'e3', 'e4', 'e5', 'f2', 'f4', 'f6'].map(square).sort());
  });
  bothColors(t, 'short queen clear and blocked captures', position({ ...base(type), e5: 'P', f6: 'p', d6: 'p', g7: 'p' }), (instance, square) => {
    const legal = targets(instance, square('d4'));
    assert.ok(!legal.includes(square('f6')));
    assert.ok(!legal.includes(square('g7')));
    assert.ok(legal.includes(square('d6')));
    push(instance, square('d4') + square('d6'), 'short queen two-square capture');
  });
});

test('Both extra-queen designs are capturable nonroyal pieces, including the king-moving guard', t => {
  for (const id of [IDS.shortQueen, IDS.guard]) {
    const type = letter(id);
    assert.ok(!profile.roles.royalTypes.includes(type.toLowerCase()));
    bothColors(t, `${id} can be captured`, position({ ...base(type), d8: 'r' }, 'b'), (instance, square) => {
      push(instance, square('d8') + square('d4'), `${id} capture does not end the game`);
      const pieces = pieceMap(instance.fen());
      assert.equal(pieces.get(square('d4')).toLowerCase(), 'r');
      assert.equal(pieces.get(square('h1')).toLowerCase(), 'k');
      assert.equal(instance.outcome(), null);
    });
  }
  const type = letter(IDS.guard);
  bothColors(t, 'guard has eight king steps', position(base(type)), (instance, square) => {
    assert.deepEqual(targets(instance, square('d4')), ['c3', 'c4', 'c5', 'd3', 'd5', 'e3', 'e4', 'e5'].map(square).sort());
  });
  bothColors(t, 'guard may enter an attacked square', position({ ...base(type), e8: 'r' }), (instance, square) => {
    push(instance, square('d4') + square('e5'), 'nonroyal guard may enter a rook attack');
    push(instance, square('e8') + square('e5'), 'opponent captures exposed nonroyal guard');
    assert.equal(instance.outcome(), null);
  });
});

test('All alternatives preserve ordinary royal safety under a rook pin', t => {
  for (const id of [IDS.camel, IDS.bishop, IDS.rook, IDS.shortQueen, IDS.guard]) {
    bothColors(t, `${id} king safety`, position({ c4: 'K', h7: 'k', d4: letter(id), h4: 'r' }), (instance, square) => {
      const legal = targets(instance, square('d4'));
      assert.ok(!legal.includes(square('d5')));
      assert.ok(!legal.includes(square('e5')));
      if (id === IDS.rook) assert.ok(legal.includes(square('h4')));
    });
  }
});

test('The lower-cost Twin package keeps its repeatable forward jump and ordinary diagonal capture', t => {
  const type = letter(IDS.twins);
  assert.equal(getDesign(IDS.twins).level, 2);
  assert.equal(getDesign(IDS.twins).placement, 'pair');
  bothColors(t, 'lower-cost Twin jump', position({ ...base(type), d5: 'P', c5: 'p', e5: 'p', c3: 'p', e3: 'p' }), (instance, square) => {
    assert.deepEqual(targets(instance, square('d4')), ['c5', 'd6', 'e5'].map(square).sort());
    push(instance, square('d4') + square('d6'), 'Twin jumps over friendly pawn');
  });
});

test('Native engine exactly matches both-color mobility, capture, blockers, nonroyal guards and castling', {
  skip: !process.env.FAIRY_STOCKFISH_PATH, timeout: 180000,
}, t => {
  const unique = [...new Map([...fixtures, ...profile.capabilityProbes].map(fixture => [fixture.fen, fixture])).values()];
  assert.ok(unique.length >= 35);
  for (const fixture of unique) {
    let instance;
    assert.doesNotThrow(() => { instance = rules.createBoard(fixture.fen); }, fixture.name + ': ' + fixture.fen);
    instance.dispose();
  }
  for (const fixture of unique) {
    const instance = board(t, fixture.fen);
    const child = spawnSync(process.env.FAIRY_STOCKFISH_PATH, [], {
      input: `setoption name VariantPath value ${ini}\nsetoption name UCI_Variant value ${profile.variant}\nposition fen ${fixture.fen}\ngo perft 1\nquit\n`,
      encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
    });
    assert.equal(child.error, undefined, fixture.name + ': ' + (child.error?.message || ''));
    assert.equal(child.status, 0, fixture.name + ': ' + child.stderr);
    assert.match(child.stdout, /Nodes searched:/, fixture.name);
    const moves = [...child.stdout.matchAll(/^([a-h][1-8][a-h][1-8][qrbn]?): 1\r?$/gm)].map(match => match[1]).sort();
    assert.deepEqual(moves, instance.moves().sort(), fixture.name);
  }
  t.diagnostic(`${unique.length} isolated native/WASM legal-move comparisons`);
});

test('Native resulting positions match quiet leaps, captures, nonroyal guards and castling', {
  skip: !process.env.FAIRY_STOCKFISH_PATH, timeout: 45000,
}, t => {
  assert.ok(consequences.length >= 20);
  const child = spawnSync(process.env.FAIRY_STOCKFISH_PATH, [], {
    input: `setoption name VariantPath value ${ini}\nsetoption name UCI_Variant value ${profile.variant}\n`
      + consequences.map(item => `position fen ${item.fen} moves ${item.move}\nd\n`).join('') + 'quit\n',
    encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
  });
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr);
  const resulting = [...child.stdout.matchAll(/^Fen: (.+)\r?$/gm)].map(match => match[1]);
  assert.equal(resulting.length, consequences.length);
  consequences.forEach((item, index) => assert.equal(resulting[index], item.expected, item.name));
  t.diagnostic(`${consequences.length} native/WASM resulting-FEN comparisons`);
});
