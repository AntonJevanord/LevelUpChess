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
  'bishop.purple@19': 'BDC',
  'king.reserve-pawn@3': 'fW2',
  'king.reserve-pawn@4': 'fmWfceF',
  'pawn.blue@6': 'FfmWifmnD',
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
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-capture-designs-'));
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

test('the four research definitions preserve measured predecessors and stay outside playable libraries', () => {
  for (const [id, movement] of Object.entries(MOVEMENT)) {
    assert.equal(getDesign(id).movement, movement);
    assert.equal(getDesign(id).inheritLegacyProbes, false);
    assert.ok(PLAYABLE_LIBRARIES.every(library => !library.designIds.includes(id)));
    assert.ok(profile.capabilityProbes.some(probe => probe.name.startsWith(id + ':')));
  }
  assert.equal(getDesign('pawn.blue@4').movement, 'mFfmWfceFifmnD');
  assert.equal(getDesign('pawn.blue@5').movement, 'fmW2fceF2');
  assert.equal(getDesign('bishop.purple@17').movement, 'BcWcN');
  assert.equal(getDesign('king.reserve-pawn@2').movement, 'fF');
  assert.deepEqual(profile.roles.royalTypes, ['k']);
  for (const id of ['king.reserve-pawn@3', 'king.reserve-pawn@4']) {
    assert.equal(getDesign(id).roles.pawn, false);
    assert.equal(getDesign(id).roles.enPassant, false);
  }
  assert.ok(!profile.capabilityProbes.some(probe => probe.name.startsWith('pawn.blue@6:') && probe.name.includes('repeatable quiet jump')));
});

test('grid bishop preserves square color and can jump orthogonally and by camel geometry', t => {
  const type = letter('bishop.purple@19');
  both(t, 'colorbound grid bishop quiet movement', fen({ ...kings, d4: type }), (board, square) => {
    const from = square('d4');
    for (const target of targets(board, from)) assert.equal((target.charCodeAt(0) + Number(target[1])) % 2, (from.charCodeAt(0) + Number(from[1])) % 2);
    for (const target of ['b4', 'f4', 'd2', 'd6', 'a3', 'a5', 'g3', 'g5', 'c1', 'c7', 'e1', 'e7', 'f6']) assert.ok(targets(board, from).includes(square(target)), target);
    for (const target of ['d5', 'e4', 'b5', 'f3']) assert.ok(!targets(board, from).includes(square(target)), target);
  });
  both(t, 'grid bishop leaps across orthogonal blockers and captures', fen({ ...kings, d4: type, c4: 'P', e4: 'P', d3: 'P', d5: 'P', b4: 'p', f4: 'p', d2: 'p', d6: 'p', a3: 'p', g5: 'p', c7: 'p', e1: 'p' }), (board, square) => {
    for (const target of ['b4', 'f4', 'd2', 'd6', 'a3', 'g5', 'c7', 'e1']) assert.ok(targets(board, square('d4')).includes(square(target)), target);
  });
  both(t, 'grid bishop diagonal paths remain blocked', fen({ ...kings, d4: type, c3: 'P', e5: 'P', b2: 'p', f6: 'p' }), (board, square) => {
    for (const target of ['b2', 'f6']) assert.ok(!targets(board, square('d4')).includes(square(target)), target);
  });
});

test('the new pawn captures on all four diagonals while forward movement remains quiet', t => {
  const type = letter('pawn.blue@6');
  both(t, 'full diagonal pawn quiet movement', fen({ ...kings, d4: type }), (board, square) => {
    assert.deepEqual(targets(board, square('d4')), ['c3', 'e3', 'c5', 'd5', 'e5'].map(square).sort());
  });
  both(t, 'full diagonal pawn captures', fen({ ...kings, d4: type, c3: 'p', e3: 'p', c5: 'p', e5: 'p', d5: 'p' }), (board, square) => {
    assert.deepEqual(targets(board, square('d4')), ['c3', 'e3', 'c5', 'e5'].map(square).sort());
  });
});

test('the new pawn initial double is forward, clear and limited to home ranks', t => {
  const type = letter('pawn.blue@6');
  for (const blocked of [false, true]) both(t, 'full diagonal initial double ' + blocked,
    fen({ ...kings, d2: type, ...(blocked ? { d3: 'P' } : {}) }), (board, square) => {
      assert.equal(board.moves().includes(square('d2') + square('d4')), !blocked);
      for (const target of ['b2', 'f2']) assert.ok(!board.moves().includes(square('d2') + square(target)));
    });
  both(t, 'full diagonal no midboard double', fen({ ...kings, d3: type }), (board, square) => {
    assert.ok(!board.moves().includes(square('d3') + square('d5')));
  });
});

test('full diagonal pawn uses QRBN promotion and keeps the existing quiet en-passant visit convention', t => {
  const type = letter('pawn.blue@6');
  both(t, 'full diagonal standard promotion', fen({ h1: 'K', h6: 'k', b7: type }), (board, square) => {
    const prefix = square('b7') + square('b8');
    assert.deepEqual(board.moves().filter(move => move.startsWith(prefix)).sort(), ['b', 'n', 'q', 'r'].map(piece => prefix + piece));
    assert.equal(board.push(prefix + 'q'), true);
    assert.equal(pieceMap(board.fen()).get(square('b8')).toLowerCase(), 'q');
  });
  both(t, 'full diagonal quiet EP landing', fen({ ...kings, c5: type, d5: 'p' }, 'w', 'd6'), (board, square) => {
    assert.equal(board.push(square('c5') + square('d6')), true);
    assert.ok(pieceMap(board.fen()).has(square('d5')), 'quiet diagonal does not remove the bypassed pawn');
  });
});

test('straight two-step guard requires a clear forward file for movement and captures', t => {
  const type = letter('king.reserve-pawn@3');
  both(t, 'straight guard quiet movement', fen({ ...kings, d4: type }), (board, square) => {
    assert.deepEqual(targets(board, square('d4')), ['d5', 'd6'].map(square).sort());
  });
  for (const blocker of ['P', 'p']) both(t, 'straight guard blocker ' + blocker, fen({ ...kings, d4: type, d5: blocker, d6: 'p' }), (board, square) => {
    assert.deepEqual(targets(board, square('d4')), (blocker === 'p' ? ['d5'] : []).map(square));
  });
  both(t, 'straight guard range-two capture', fen({ ...kings, d4: type, d6: 'p', c5: 'p', e5: 'p', d3: 'p' }), (board, square) => {
    assert.deepEqual(targets(board, square('d4')), ['d5', 'd6'].map(square).sort());
  });
});

test('pawn-shaped guard moves quietly forward and captures only forward diagonally', t => {
  const type = letter('king.reserve-pawn@4');
  both(t, 'pawn guard quiet movement', fen({ ...kings, d4: type }), (board, square) => {
    assert.deepEqual(targets(board, square('d4')), ['d5'].map(square));
  });
  both(t, 'pawn guard captures', fen({ ...kings, d4: type, d5: 'p', c5: 'p', e5: 'p', c3: 'p', e3: 'p' }), (board, square) => {
    assert.deepEqual(targets(board, square('d4')), ['c5', 'e5'].map(square).sort());
  });
  both(t, 'pawn guard has no initial double', fen({ ...kings, d2: type }), (board, square) => {
    assert.ok(!board.moves().includes(square('d2') + square('d4')));
  });
  both(t, 'pawn guard cannot capture EP', fen({ ...kings, c5: type, d5: 'p' }, 'w', 'd6'), (board, square) => {
    assert.ok(!board.moves().includes(square('c5') + square('d6')));
  });
});

test('new grants remain finite, nonroyal, nonpromoting and limited to nonchecking own-half drops', t => {
  for (const id of ['king.reserve-pawn@3', 'king.reserve-pawn@4']) {
    const type = letter(id);
    both(t, id + ' does not promote', fen({ h1: 'K', h6: 'k', b7: type }), (board, square) => {
      assert.deepEqual(board.moves().filter(move => move.startsWith(square('b7') + square('b8'))), [square('b7') + square('b8')]);
    });
    const enemyKing = id.endsWith('@3') ? 'd6' : 'd5';
    const forbidden = id.endsWith('@3') ? ['d4', 'd5'] : ['c4', 'e4'];
    both(t, id + ' drop restrictions', fen({ h1: 'K', [enemyKing]: 'k', a3: 'P' }, 'w', '-', type.repeat(3)), (board, square, color) => {
      const drops = board.moves().filter(move => move.startsWith(type + '@'));
      assert.ok(drops.length);
      assert.ok(drops.every(move => color === 'w' ? Number(move[3]) <= 4 : Number(move[3]) >= 5));
      for (const target of [...forbidden, 'a3']) assert.ok(!drops.includes(type + '@' + square(target)), target);
      assert.equal(board.push(type + '@' + square('c3')), true);
      assert.equal(pocketLetters(board.fen()).length, 2);
      assert.equal(pieceMap(board.fen()).get(square('h1')).toLowerCase(), 'k');
    });
    both(t, id + ' capture is permanent', fen({ h1: 'K', a8: 'k', d4: type, d8: 'r' }, 'b'), (board, square) => {
      assert.equal(board.push(square('d8') + square('d4')), true);
      assert.equal(pocketLetters(board.fen()), '');
      assert.equal(pieceMap(board.fen()).get(square('d4')).toLowerCase(), 'r');
    });
  }
});

const nativePath = process.env.FAIRY_STOCKFISH_PATH || path.resolve(__dirname, '../node_modules/.cache/levelup-native-values/stockfish');
test('native engine and browser agree on the new capture designs and all movement fixtures', { skip: !fs.existsSync(nativePath), timeout: 60000 }, async t => {
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
