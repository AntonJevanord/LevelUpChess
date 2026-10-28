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
  'king.reserve-pawn@5': 'cfWmfF',
  'king.reserve-pawn@6': 'fWmfF',
  'pawn.blue@7': 'mWFifmnD',
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
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-mobility-designs-'));
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

test('three research alternatives keep prior behavior and playable selections fixed', () => {
  for (const [id, movement] of Object.entries(MOVEMENT)) {
    assert.equal(getDesign(id).movement, movement);
    assert.equal(getDesign(id).inheritLegacyProbes, false);
    assert.ok(PLAYABLE_LIBRARIES.every(library => !library.designIds.includes(id)));
    assert.ok(profile.capabilityProbes.some(probe => probe.name.startsWith(id + ':')));
  }
  assert.equal(getDesign('king.reserve-pawn@3').movement, 'fW2');
  assert.equal(getDesign('king.reserve-pawn@4').movement, 'fmWfceF');
  assert.equal(getDesign('pawn.blue@6').movement, 'FfmWifmnD');
  assert.equal(getDesign('bishop.purple@19').movement, 'BDC');
  assert.deepEqual(profile.roles.royalTypes, ['k']);
  for (const id of ['king.reserve-pawn@5', 'king.reserve-pawn@6']) {
    assert.equal(getDesign(id).roles.pawn, false);
    assert.equal(getDesign(id).roles.enPassant, false);
  }
});

test('grant alternatives share one forward capture target but differ on quiet straight movement', t => {
  for (const id of ['king.reserve-pawn@5', 'king.reserve-pawn@6']) {
    const type = letter(id);
    both(t, id + ' quiet forward directions', fen({ ...kings, d4: type }), (board, square) => {
      const expected = ['c5', 'e5', ...(id.endsWith('@6') ? ['d5'] : [])];
      assert.deepEqual(targets(board, square('d4')), expected.map(square).sort());
    });
    both(t, id + ' sole forward capture', fen({ ...kings, d4: type, d5: 'p', c5: 'p', e5: 'p', d3: 'p' }), (board, square) => {
      assert.deepEqual(targets(board, square('d4')), [square('d5')]);
    });
    both(t, id + ' no jumping or two-square range', fen({ ...kings, d4: type, d5: 'P', c5: 'P', e5: 'P', d6: 'p', b6: 'p', f6: 'p' }), (board, square) => {
      assert.deepEqual(targets(board, square('d4')), []);
    });
  }
});

test('mobile diagonal pawn moves like a nonroyal king but captures only diagonally', t => {
  const type = letter('pawn.blue@7');
  both(t, 'mobile pawn quiet eight steps', fen({ ...kings, d4: type }), (board, square) => {
    assert.deepEqual(targets(board, square('d4')), ['c3', 'd3', 'e3', 'c4', 'e4', 'c5', 'd5', 'e5'].map(square).sort());
  });
  both(t, 'mobile pawn four diagonal captures', fen({ ...kings, d4: type, c3: 'p', d3: 'p', e3: 'p', c4: 'p', e4: 'p', c5: 'p', d5: 'p', e5: 'p' }), (board, square) => {
    assert.deepEqual(targets(board, square('d4')), ['c3', 'e3', 'c5', 'e5'].map(square).sort());
  });
  both(t, 'mobile pawn friendly blockers', fen({ ...kings, d4: type, c3: 'P', d3: 'P', e3: 'P', c4: 'P', e4: 'P', c5: 'P', d5: 'P', e5: 'P' }), (board, square) => {
    assert.deepEqual(targets(board, square('d4')), []);
  });
});

test('mobile pawn home double stays clear and forward-only and returns after a retreat', t => {
  const type = letter('pawn.blue@7');
  for (const blocked of [false, true]) both(t, 'mobile pawn home double ' + blocked,
    fen({ ...kings, d2: type, ...(blocked ? { d3: 'P' } : {}) }), (board, square) => {
      assert.equal(board.moves().includes(square('d2') + square('d4')), !blocked);
      for (const target of ['b2', 'f2']) assert.ok(!board.moves().includes(square('d2') + square(target)));
    });
  both(t, 'mobile pawn no middle-board double', fen({ ...kings, d3: type }), (board, square) => {
    assert.ok(!board.moves().includes(square('d3') + square('d5')));
  });
  both(t, 'mobile pawn home return restores clear double', fen({ ...kings, d2: type }), (board, square) => {
    for (const move of ['d2c3', 'h7g7', 'c3d2', 'g7h7']) {
      assert.equal(board.push(square(move.slice(0, 2)) + square(move.slice(2))), true);
    }
    assert.ok(board.moves().includes(square('d2') + square('d4')));
  });
});

test('mobile pawn retains QRBN promotion and the overlapping quiet diagonal EP convention', t => {
  const type = letter('pawn.blue@7');
  both(t, 'mobile pawn standard promotion', fen({ h1: 'K', h6: 'k', b7: type }), (board, square) => {
    const prefix = square('b7') + square('b8');
    assert.deepEqual(board.moves().filter(move => move.startsWith(prefix)).sort(), ['b', 'n', 'q', 'r'].map(piece => prefix + piece));
    assert.equal(board.push(prefix + 'n'), true);
    assert.equal(pieceMap(board.fen()).get(square('b8')).toLowerCase(), 'n');
  });
  both(t, 'mobile pawn quiet EP visit', fen({ ...kings, c5: type, d5: 'p' }, 'w', 'd6'), (board, square) => {
    assert.equal(board.push(square('c5') + square('d6')), true);
    assert.ok(pieceMap(board.fen()).has(square('d5')));
  });
});

test('both grants stay nonpromoting and cannot capture en passant during quiet diagonal visits', t => {
  for (const id of ['king.reserve-pawn@5', 'king.reserve-pawn@6']) {
    const type = letter(id);
    both(t, id + ' quiet final rank without promotion', fen({ h1: 'K', h6: 'k', b7: type }), (board, square) => {
      const prefix = square('b7') + square('c8');
      assert.deepEqual(board.moves().filter(move => move.startsWith(prefix)), [prefix]);
      assert.equal(board.push(prefix), true);
      assert.equal(pieceMap(board.fen()).get(square('c8')).toUpperCase(), type);
    });
    both(t, id + ' quiet EP target visit', fen({ ...kings, c5: type, d5: 'p' }, 'w', 'd6'), (board, square) => {
      assert.equal(board.push(square('c5') + square('d6')), true);
      assert.ok(pieceMap(board.fen()).has(square('d5')));
    });
  }
});

test('grants keep finite own-half nonchecking drops and disappear permanently when captured', t => {
  for (const id of ['king.reserve-pawn@5', 'king.reserve-pawn@6']) {
    const type = letter(id);
    both(t, id + ' finite drops', fen({ h1: 'K', d5: 'k', a3: 'P' }, 'w', '-', type.repeat(3)), (board, square, color) => {
      const drops = board.moves().filter(move => move.startsWith(type + '@'));
      assert.ok(drops.length);
      assert.ok(drops.every(move => color === 'w' ? Number(move[3]) <= 4 : Number(move[3]) >= 5));
      for (const target of ['d4', 'd5', 'a3']) assert.ok(!drops.includes(type + '@' + square(target)), target);
      assert.ok(drops.includes(type + '@' + square('c4')), 'quiet diagonal contact does not itself give check');
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
test('native engine and browser agree on the new mobility designs and all movement fixtures', { skip: !fs.existsSync(nativePath), timeout: 60000 }, async t => {
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
