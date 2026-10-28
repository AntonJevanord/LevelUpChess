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
const { PLAYABLE_LIBRARIES } = require('../src/playable-library');
const { pieceMap, pocketLetters } = require('../src/profile-fen');
const { UciEngine } = require('../scripts/balance/uci');

const MOVEMENT = {
  'pawn.blue@8': 'fmWfceFifmnDsW',
  'king.reserve-pawn@7': 'fWbmF',
};
let directory, profile, rules, ini;
const fixtures = [];
const reflect = square => square[0] + (9 - Number(square[1]));
const swapCase = value => value.replace(/[a-z]/gi, letter => letter === letter.toUpperCase() ? letter.toLowerCase() : letter.toUpperCase());
const letter = id => profile.registry.allocations.find(item => item.id === id).letter.toUpperCase();
function fen(pieces, turn = 'w', ep = '-', pocket = '') {
  const ranks = Array.from({ length: 8 }, (_, row) => {
    let output = '', empty = 0;
    for (const file of 'abcdefgh') {
      const type = pieces[file + (8 - row)];
      if (!type) { empty++; continue; }
      if (empty) output += empty;
      empty = 0; output += type;
    }
    return output + (empty || '');
  });
  return `${ranks.join('/')}[${pocket}] ${turn} - ${ep} 0 1`;
}
function opposite(input) {
  const fields = input.split(' ');
  fields[0] = swapCase(fields[0].split('[')[0].split('/').reverse().join('/')) + '[' + swapCase(pocketLetters(input)) + ']';
  fields[1] = fields[1] === 'w' ? 'b' : 'w';
  if (fields[3] !== '-') fields[3] = fields[3].match(/[a-h][1-8]/g).map(reflect).sort().join('');
  return fields.join(' ');
}
function both(t, name, input, check) {
  for (const color of ['w', 'b']) {
    const position = color === 'w' ? input : opposite(input);
    fixtures.push({ name: `${name}: ${color}`, fen: position });
    const board = rules.createBoard(position);
    t.after(() => board.dispose());
    check(board, color === 'w' ? square => square : reflect, color);
  }
}
const targets = (board, square) => [...new Set(board.moves().filter(move => move.startsWith(square)).map(move => move.slice(2, 4)))].sort();
const kings = { h1: 'K', h7: 'k' };

test.before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-support-scout-'));
  const output = path.join(directory, 'rules.cjs');
  await build({ ...rulesBuildOptions(), absWorkingDir: path.resolve(__dirname, '..'), entryPoints: ['src/balance-rules.js'],
    bundle: true, platform: 'node', format: 'cjs', outfile: output, legalComments: 'none' });
  const comparisons = Object.keys(MOVEMENT).map(id => ({
    armyA: getDesign(id).placement === 'reserve' ? { reserve: [{ id, count: 3 }] }
      : { upgrades: { [getDesign(id).family === 'pawn' ? 'd2' : 'c1']: id } }, armyB: {},
  }));
  profile = compileDesignProfile(createDesignRegistry({ schemaVersion: 3, comparisons }));
  rules = await require(output).createMatchRules({ profile });
  ini = path.join(directory, 'profile.ini'); fs.writeFileSync(ini, profile.config);
});
test.after(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

test('Support pawn and Scout grant are one-point research additions with immutable predecessors', () => {
  for (const [id, movement] of Object.entries(MOVEMENT)) {
    const design = getDesign(id);
    assert.equal(design.movement, movement);
    assert.equal(design.level, 1);
    assert.equal(design.inheritLegacyProbes, false);
    assert.ok(PLAYABLE_LIBRARIES.every(library => !library.designIds.includes(id)));
    assert.ok(profile.capabilityProbes.some(probe => probe.name.startsWith(id + ':')));
  }
  assert.equal(getDesign('pawn.blue@7').movement, 'mWFifmnD');
  assert.equal(getDesign('king.reserve-pawn@6').movement, 'fWmfF');
  assert.equal(getDesign('pawn.blue@8').placement, 'replace');
  assert.equal(getDesign('king.reserve-pawn@7').placement, 'reserve');
  assert.equal(getDesign('king.reserve-pawn@7').roles.pawn, false);
  assert.equal(getDesign('king.reserve-pawn@7').roles.enPassant, false);
  assert.deepEqual(profile.roles.royalTypes, ['k']);
});

test('Support pawn moves quietly forward or sideways and captures sideways or forward-diagonally', t => {
  const type = letter('pawn.blue@8');
  both(t, 'Support quiet directions', fen({ ...kings, d4: type }), (board, square) => {
    assert.deepEqual(targets(board, square('d4')), ['c4', 'e4', 'd5'].map(square).sort());
  });
  both(t, 'Support capture directions', fen({ ...kings, d4: type,
    c4: 'p', e4: 'p', c5: 'p', e5: 'p', d5: 'p', c3: 'p', d3: 'p', e3: 'p' }), (board, square) => {
    assert.deepEqual(targets(board, square('d4')), ['c4', 'e4', 'c5', 'e5'].map(square).sort());
  });
  both(t, 'Support adjacent blockers and one-square side range', fen({ ...kings, d4: type,
    c4: 'P', e4: 'P', d5: 'P', b4: 'p', f4: 'p', d6: 'p' }), (board, square) => {
    assert.deepEqual(targets(board, square('d4')), []);
  });
});

test('Support home double is forward-only and clear, with no middle-board double', t => {
  const type = letter('pawn.blue@8');
  for (const blocked of [false, true]) both(t, 'Support home double ' + blocked,
    fen({ ...kings, d2: type, ...(blocked ? { d3: 'P' } : {}) }), (board, square) => {
      assert.equal(board.moves().includes(square('d2') + square('d4')), !blocked);
      for (const target of ['b2', 'f2', 'd1']) assert.ok(!board.moves().includes(square('d2') + square(target)));
    });
  both(t, 'Support no middle-board double', fen({ ...kings, d3: type }), (board, square) => {
    assert.ok(!board.moves().includes(square('d3') + square('d5')));
  });
});

test('Support retains QRBN promotions and distinguishes diagonal en passant from quiet sideways visits', t => {
  const type = letter('pawn.blue@8');
  both(t, 'Support standard promotion', fen({ h1: 'K', h6: 'k', b7: type }), (board, square) => {
    const prefix = square('b7') + square('b8');
    assert.deepEqual(board.moves().filter(move => move.startsWith(prefix)).sort(), ['b', 'n', 'q', 'r'].map(piece => prefix + piece));
    assert.equal(board.push(prefix + 'q'), true);
    assert.equal(pieceMap(board.fen()).get(square('b8')).toLowerCase(), 'q');
  });
  both(t, 'Support diagonal en passant capture', fen({ ...kings, c5: type, d5: 'p' }, 'w', 'd6'), (board, square) => {
    assert.equal(board.push(square('c5') + square('d6')), true);
    assert.equal(pieceMap(board.fen()).has(square('d5')), false);
  });
  both(t, 'Support sideways quiet EP-target visit', fen({ ...kings, c6: type, d5: 'p' }, 'w', 'd6'), (board, square) => {
    assert.equal(board.push(square('c6') + square('d6')), true);
    assert.equal(pieceMap(board.fen()).has(square('d5')), true);
  });
});

test('Scout can move or capture forward and retreat only onto empty backward diagonals', t => {
  const type = letter('king.reserve-pawn@7');
  both(t, 'Scout quiet movement', fen({ ...kings, d4: type }), (board, square) => {
    assert.deepEqual(targets(board, square('d4')), ['c3', 'e3', 'd5'].map(square).sort());
  });
  both(t, 'Scout forward-only capture', fen({ ...kings, d4: type,
    d5: 'p', c3: 'p', e3: 'p', c5: 'p', e5: 'p', d3: 'p', c4: 'p', e4: 'p' }), (board, square) => {
    assert.deepEqual(targets(board, square('d4')), [square('d5')]);
  });
  both(t, 'Scout friendly blockers and no jumps', fen({ ...kings, d4: type,
    d5: 'P', c3: 'P', e3: 'P', d6: 'p', b2: 'p', f2: 'p' }), (board, square) => {
    assert.deepEqual(targets(board, square('d4')), []);
  });
});

test('Scout remains nonpromoting and quiet backward EP-target visits cannot take the bypassed pawn', t => {
  const type = letter('king.reserve-pawn@7');
  both(t, 'Scout final rank without promotion', fen({ h1: 'K', h6: 'k', b7: type }), (board, square) => {
    const prefix = square('b7') + square('b8');
    assert.deepEqual(board.moves().filter(move => move.startsWith(prefix)), [prefix]);
    assert.equal(board.push(prefix), true);
    assert.equal(pieceMap(board.fen()).get(square('b8')).toUpperCase(), type);
  });
  both(t, 'Scout backward quiet EP-target visit', fen({ ...kings, c7: type, d5: 'p' }, 'w', 'd6'), (board, square) => {
    assert.equal(board.push(square('c7') + square('d6')), true);
    assert.equal(pieceMap(board.fen()).has(square('d5')), true);
  });
  both(t, 'Scout has no initial double', fen({ ...kings, d2: type }), (board, square) => {
    assert.ok(!board.moves().includes(square('d2') + square('d4')));
  });
});

test('Scout reserves remain finite, nonroyal, nonchecking and restricted to empty own-half squares', t => {
  const type = letter('king.reserve-pawn@7');
  both(t, 'Scout finite drop restrictions', fen({ h1: 'K', d5: 'k', a3: 'P' }, 'w', '-', type.repeat(3)), (board, square, color) => {
    const drops = board.moves().filter(move => move.startsWith(type + '@'));
    assert.ok(drops.length);
    assert.ok(drops.every(move => color === 'w' ? Number(move[3]) <= 4 : Number(move[3]) >= 5));
    for (const target of ['d4', 'd5', 'a3']) assert.ok(!drops.includes(type + '@' + square(target)), target);
    assert.equal(board.push(type + '@' + square('c3')), true);
    assert.equal(pocketLetters(board.fen()).length, 2);
    assert.equal(pieceMap(board.fen()).get(square('h1')).toLowerCase(), 'k');
  });
  both(t, 'Scout capture disappears', fen({ h1: 'K', a8: 'k', d4: type, d8: 'r' }, 'b'), (board, square) => {
    assert.equal(board.push(square('d8') + square('d4')), true);
    assert.equal(pocketLetters(board.fen()), '');
    assert.equal(pieceMap(board.fen()).get(square('d4')).toLowerCase(), 'r');
  });
});

const nativePath = process.env.FAIRY_STOCKFISH_PATH || path.resolve(__dirname, '../node_modules/.cache/levelup-native-values/stockfish');
test('native and browser agree on Support and Scout capability probes and both-color rule fixtures', { skip: !fs.existsSync(nativePath), timeout: 60000 }, async t => {
  const engine = new UciEngine({ path: nativePath, variantPath: ini, variant: profile.variant, options: { threads: 1, hashMb: 16 } });
  t.after(() => engine.close());
  await engine.start();
  const positions = new Map([...profile.capabilityProbes, ...fixtures].map(fixture => [fixture.fen, fixture]));
  for (const { fen: input, name } of positions.values()) {
    const board = rules.createBoard(input);
    try { assert.deepEqual(await engine.perft({ fen: input }), board.moves().sort(), name + ': ' + input); }
    finally { board.dispose(); }
  }
});
