'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { rulesBuildOptions } = require('../scripts/rules-build');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { getDesign } = require('../src/design-catalog');
const { V16_CANDIDATES } = require('../src/playable-library');
const { pieceMap, pocketLetters } = require('../src/profile-fen');
const { UciEngine } = require('../scripts/balance/uci');

const EXPECTED = {
  'pawn.purple@13': 'mRcfB',
  'bishop.purple@17': 'BcWcN',
  'bishop.purple@18': 'BvWvN',
  'rook.purple@14': 'RFsNmsC',
  'pawn.blue@4': 'mFfmWfceFifmnD',
  'pawn.blue@5': 'fmW2fceF2',
  'king.reserve-pawn@2': 'fF',
};
const IDS = [...Object.keys(EXPECTED), 'pawn.purple@7'];
const fixtures = [];
let profile, rules, directory, ini;
const letter = id => profile.registry.allocations.find(allocation => allocation.id === id).letter.toUpperCase();
const reflect = square => square[0] + (9 - Number(square[1]));
const swapCase = text => text.replace(/[a-z]/gi, character => character === character.toUpperCase() ? character.toLowerCase() : character.toUpperCase());
function position(pieces, turn = 'w', ep = '-', pocket = '', rights = '-') {
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
  return `${placement}[${pocket}] ${turn} ${rights} ${ep} 0 1`;
}
function opposite(fen) {
  const fields = fen.split(' '), placement = fields[0].split('[')[0];
  fields[0] = swapCase(placement.split('/').reverse().join('/')) + '[' + swapCase(pocketLetters(fen)) + ']';
  fields[1] = fields[1] === 'w' ? 'b' : 'w';
  const rights = swapCase(fields[2]);
  fields[2] = [...'KQkq'].filter(character => rights.includes(character)).join('') || '-';
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
const base = type => ({ h1: 'K', h7: 'k', d4: type });

test.before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v17-revisions-'));
  const output = path.join(directory, 'rules.cjs');
  await build({ ...rulesBuildOptions(), absWorkingDir: path.resolve(__dirname, '..'),
    entryPoints: ['src/balance-rules.js'], bundle: true, platform: 'node', format: 'cjs', outfile: output, legalComments: 'none' });
  const squareFor = { pawn: 'd2', bishop: 'c1', rook: 'a1' };
  profile = compileDesignProfile(createDesignRegistry({ schemaVersion: 3, comparisons: IDS.map(id => ({
    armyA: getDesign(id).placement === 'reserve' ? { reserve: [{ id, count: 3 }] } : { upgrades: { [squareFor[getDesign(id).family]]: id } },
    armyB: {},
  })) }));
  rules = await require(output).createMatchRules({ profile });
  ini = path.join(directory, 'profile.ini');
  fs.writeFileSync(ini, profile.config);
});
test.after(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

test('new research revisions do not replace historical designs or enter the frozen playable roster', () => {
  for (const [id, movement] of Object.entries(EXPECTED)) {
    assert.equal(getDesign(id).movement, movement, id);
    assert.equal(getDesign(id).inheritLegacyProbes, false, id);
    assert.ok(!Object.values(V16_CANDIDATES).flat().includes(id), id);
    assert.ok(profile.capabilityProbes.some(probe => probe.name.startsWith(id + ':')), id);
  }
  assert.equal(getDesign('pawn.purple@11').movement, 'fceF2mR');
  assert.equal(getDesign('pawn.purple@7').movement, 'mRceB2');
  assert.equal(getDesign('bishop.purple@14').movement, 'BcWcNcDcA');
  assert.equal(getDesign('bishop.purple@15').movement, 'BvWvNvZ');
  assert.equal(getDesign('rook.purple@13').movement, 'RFsNsC');
  assert.equal(getDesign('king.reserve-pawn@1').movement, 'fW');
});

test('rook-pawn alternatives separately add long forward capture or backward two-square capture', t => {
  for (const id of ['pawn.purple@13', 'pawn.purple@7']) {
    both(t, id + ' directional captures', position({ ...base(letter(id)), a7: 'p', g7: 'p', b2: 'p', f2: 'p' }), (instance, square) => {
      const legal = targets(instance, square('d4'));
      for (const target of ['a7', 'g7']) assert.equal(legal.includes(square(target)), id === 'pawn.purple@13', target);
      for (const target of ['b2', 'f2']) assert.equal(legal.includes(square(target)), id === 'pawn.purple@7', target);
      assert.ok(legal.includes(square('d2')), 'quiet retreat remains available');
      assert.ok(!legal.includes(square('e3')), 'diagonal movement requires a capture');
    });
    both(t, id + ' clear sliding paths', position({ ...base(letter(id)), c5: 'P', e5: 'P', c3: 'P', e3: 'P', b6: 'p', f6: 'p', b2: 'p', f2: 'p', d5: 'P' }), (instance, square) => {
      const legal = targets(instance, square('d4'));
      for (const target of ['b6', 'f6', 'b2', 'f2', 'd6']) assert.ok(!legal.includes(square(target)), target);
    });
  }
});

test('returning-diagonal pawn adds quiet retreats while retaining one-square forward captures and a blocked initial double', t => {
  const type = letter('pawn.blue@4');
  both(t, 'returning-diagonal quiet movement', position(base(type)), (instance, square) => {
    assert.deepEqual(targets(instance, square('d4')), ['c3', 'e3', 'c5', 'd5', 'e5'].map(square).sort());
  });
  both(t, 'returning-diagonal capture restrictions', position({ ...base(type), c3: 'p', e3: 'p', c5: 'p', e5: 'p', d5: 'p' }), (instance, square) => {
    assert.deepEqual(targets(instance, square('d4')), ['c5', 'e5'].map(square).sort());
  });
  for (const blocked of [false, true]) both(t, 'returning-diagonal initial double ' + blocked,
    position({ h1: 'K', h7: 'k', d2: type, ...(blocked ? { d3: 'P' } : {}) }), (instance, square) => {
      assert.equal(instance.moves().includes(square('d2') + square('d4')), !blocked);
      assert.ok(!instance.moves().includes(square('d2') + square('d1')));
    });
});

test('two-step pawn advances repeatedly along clear files and captures along clear forward diagonals up to two', t => {
  const type = letter('pawn.blue@5');
  both(t, 'repeatable two-step movement', position(base(type)), (instance, square) => {
    assert.deepEqual(targets(instance, square('d4')), ['d5', 'd6'].map(square).sort());
  });
  both(t, 'two-step capture range', position({ ...base(type), b6: 'p', f6: 'p', b2: 'p', f2: 'p', a7: 'p' }), (instance, square) => {
    const legal = targets(instance, square('d4'));
    for (const target of ['b6', 'f6']) assert.ok(legal.includes(square(target)), target);
    for (const target of ['a7', 'b2', 'f2']) assert.ok(!legal.includes(square(target)), target);
  });
  both(t, 'two-step intermediate blockers', position({ ...base(type), d5: 'P', c5: 'P', e5: 'P', b6: 'p', f6: 'p' }), (instance, square) => {
    assert.deepEqual(targets(instance, square('d4')), []);
  });
});

test('all research pawns retain standard promotion, and overlapping quiet diagonals preserve the documented EP convention', t => {
  for (const id of ['pawn.purple@13', 'pawn.purple@7', 'pawn.blue@4', 'pawn.blue@5']) {
    both(t, id + ' QRBN promotion', position({ h1: 'K', h6: 'k', b7: letter(id) }), (instance, square) => {
      const prefix = square('b7') + square('b8');
      assert.deepEqual(instance.moves().filter(move => move.startsWith(prefix)).sort(), ['b', 'n', 'q', 'r'].map(piece => prefix + piece));
      assert.equal(instance.push(prefix + 'n'), true);
      assert.equal(pieceMap(instance.fen()).get(square('b8')).toLowerCase(), 'n');
    });
    both(t, id + ' en passant', position({ h1: 'K', h8: 'k', c5: letter(id), d5: 'p' }, 'w', 'd6'), (instance, square) => {
      assert.equal(instance.push(square('c5') + square('d6')), true);
      assert.equal(pieceMap(instance.fen()).has(square('d5')), id === 'pawn.blue@4', id);
    });
  }
});

test('reduced mating bishop keeps bishop slides with capture-only king steps and knight leaps', t => {
  const type = letter('bishop.purple@17');
  both(t, 'mating bishop quiet movement', position(base(type)), (instance, square) => {
    const legal = targets(instance, square('d4'));
    assert.ok(legal.includes(square('f6')));
    for (const target of ['d5', 'e4', 'd3', 'c4', 'b5', 'f3', 'd6', 'f4']) assert.ok(!legal.includes(square(target)), target);
  });
  both(t, 'mating bishop capture permissions', position({ ...base(type), c4: 'p', e4: 'p', d3: 'p', d5: 'p', b5: 'p', f3: 'p', c3: 'P', e5: 'P', d6: 'p', f4: 'p', b2: 'p', f6: 'p' }), (instance, square) => {
    const legal = targets(instance, square('d4'));
    for (const target of ['c4', 'e4', 'd3', 'd5', 'b5', 'f3']) assert.ok(legal.includes(square(target)), target);
    for (const target of ['d6', 'f4', 'b2', 'f6']) assert.ok(!legal.includes(square(target)), target);
  });
});

test('reduced vertical bishop retains vertical steps and tall knight jumps while removing zebra jumps', t => {
  const type = letter('bishop.purple@18');
  both(t, 'vertical bishop quiet and capture directions', position({ ...base(type), c2: 'p', e6: 'p', b1: 'p', f7: 'p', b3: 'p', f5: 'p' }), (instance, square) => {
    const legal = targets(instance, square('d4'));
    for (const target of ['d3', 'd5', 'c2', 'e6']) assert.ok(legal.includes(square(target)), target);
    for (const target of ['b1', 'f7', 'b3', 'f5', 'd2', 'd6']) assert.ok(!legal.includes(square(target)), target);
  });
  both(t, 'vertical bishop leaps across blockers', position({ ...base(type), c4: 'P', e4: 'P', d3: 'P', d5: 'P' }), (instance, square) => {
    const legal = targets(instance, square('d4'));
    for (const target of ['c2', 'e2', 'c6', 'e6']) assert.ok(legal.includes(square(target)), target);
    assert.ok(!legal.includes(square('d6')));
  });
});

test('side rook keeps wide knight and diagonal captures but wide camel jumps become quiet only', t => {
  const type = letter('rook.purple@14');
  both(t, 'side rook leap modalities', position({ ...base(type), a3: 'p', g5: 'p', b3: 'p', f5: 'p', c3: 'p', e5: 'p' }), (instance, square) => {
    const legal = targets(instance, square('d4'));
    for (const target of ['b3', 'f5', 'c3', 'e5']) assert.ok(legal.includes(square(target)), target);
    for (const target of ['a3', 'g5']) assert.ok(!legal.includes(square(target)), target);
  });
  both(t, 'side rook quiet jumps over blockers', position({ ...base(type), c4: 'P', e4: 'P', d3: 'P', d5: 'P' }), (instance, square) => {
    const legal = targets(instance, square('d4'));
    for (const target of ['a3', 'a5', 'g3', 'g5']) assert.ok(legal.includes(square(target)), target);
  });
});

test('diagonal pawn grant remains finite, nonroyal and restricted to nonchecking own-half drops', t => {
  const type = letter('king.reserve-pawn@2');
  both(t, 'deployed diagonal grant', position(base(type)), (instance, square) => {
    assert.deepEqual(targets(instance, square('d4')), ['c5', 'e5'].map(square).sort());
  });
  both(t, 'deployed diagonal grant captures', position({ ...base(type), c5: 'p', e5: 'p', d5: 'p', c3: 'p', e3: 'p' }), (instance, square) => {
    assert.deepEqual(targets(instance, square('d4')), ['c5', 'e5'].map(square).sort());
  });
  both(t, 'diagonal grant finite nonchecking drops', position({ h1: 'K', d5: 'k', b3: 'P' }, 'w', '-', type.repeat(3)), (instance, square, color) => {
    const dropPrefix = type + '@';
    const drops = instance.moves().filter(move => move.startsWith(dropPrefix));
    assert.ok(drops.length);
    assert.ok(drops.every(move => color === 'w' ? Number(move[3]) <= 4 : Number(move[3]) >= 5));
    for (const forbidden of ['c4', 'e4', 'b3', 'c5']) assert.ok(!drops.includes(dropPrefix + square(forbidden)), forbidden);
    assert.equal(instance.push(dropPrefix + square('c3')), true);
    assert.equal(pocketLetters(instance.fen()).length, 2);
    assert.equal(pieceMap(instance.fen()).get(square('h1')).toLowerCase(), 'k');
  });
  both(t, 'captured grant disappears', position({ h1: 'K', a8: 'k', d4: type, d8: 'r' }, 'b'), (instance, square) => {
    assert.equal(instance.push(square('d8') + square('d4')), true);
    assert.equal(pieceMap(instance.fen()).get(square('d4')).toLowerCase(), 'r');
    assert.equal(pocketLetters(instance.fen()), '');
  });
});

const nativePath = process.env.FAIRY_STOCKFISH_PATH || path.resolve(__dirname, '../node_modules/.cache/levelup-native-values/stockfish');
test('native engine and browser agree at every research fixture and declared capability probe without playing games', { skip: !fs.existsSync(nativePath), timeout: 60000 }, async t => {
  const engine = new UciEngine({ path: nativePath, variantPath: ini, variant: profile.variant, options: { threads: 1, hashMb: 16 } });
  t.after(() => engine.close());
  await engine.start();
  const unique = new Map([...profile.capabilityProbes, ...fixtures].map(fixture => [fixture.fen, fixture]));
  for (const { name, fen } of unique.values()) {
    const instance = rules.createBoard(fen);
    try { assert.deepEqual(await engine.perft({ fen }), instance.moves().sort(), name + ': ' + fen); }
    finally { instance.dispose(); }
  }
});
