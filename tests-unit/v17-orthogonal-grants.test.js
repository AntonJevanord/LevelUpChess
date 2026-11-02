'use strict';

// Movement/recovery fixtures only: no search or scientific balance games.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { rulesBuildOptions } = require('../scripts/rules-build');
const { getDesign } = require('../src/design-catalog');
const { NEW_DEFINITIONS } = require('../src/balance-designs-v17-mixed');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { pieceMap, placementFromMap, pocketLetters } = require('../src/profile-fen');
const { UciEngine } = require('../scripts/balance/uci');

const IDS = ['king.reserve-rook@1', 'king.grant-wd-level3@1'];
const nativePath = process.env.FAIRY_STOCKFISH_PATH || path.resolve(__dirname, '../node_modules/.cache/levelup-native-values/stockfish');
const reflect = square => square[0] + (9 - Number(square[1]));
const swap = text => text.replace(/[a-z]/gi, value => value === value.toUpperCase() ? value.toLowerCase() : value.toUpperCase());
let directory, profile, rules, rawModule;
const fixtures = [];
const type = id => profile.registry.allocations.find(row => row.id === id).letter.toUpperCase();
const kings = { a1: 'K', h7: 'k' };
function position(pieces, turn = 'w', ep = '-', pocket = '') {
  const map = new Map(Object.entries(pieces)); map.pocket = pocket;
  return `${placementFromMap(map)} ${turn} - ${ep} 0 1`;
}
function opposite(input) {
  const fields = input.split(' ');
  fields[0] = swap(fields[0].split('[')[0].split('/').reverse().join('/')) + '[' + swap(pocketLetters(input)) + ']';
  fields[1] = fields[1] === 'w' ? 'b' : 'w';
  if (fields[3] !== '-') fields[3] = fields[3].match(/[a-h][1-8]/g).map(reflect).sort().join('');
  return fields.join(' ');
}
function both(t, name, fen, check) {
  for (const black of [false, true]) {
    const input = black ? opposite(fen) : fen;
    fixtures.push({ name: name + (black ? ': Black' : ': White'), fen: input });
    const board = rules.createBoard(input); t.after(() => board.dispose());
    check(board, black ? reflect : square => square, black);
  }
}
const destinations = (board, square) => board.moves().filter(move => move.startsWith(square)).map(move => move.slice(2, 4)).sort();

test.before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-orthogonal-grants-'));
  const output = path.join(directory, 'rules.cjs');
  await build({ ...rulesBuildOptions(), absWorkingDir: path.resolve(__dirname, '..'),
    stdin: { contents: "export { createMatchRules } from './src/balance-rules.js'; import Module from 'ffish-es6'; import bytes from 'variant-wasm'; export async function createRaw(config) { const m = await Module({ wasmBinary: Uint8Array.from(atob(bytes), c => c.charCodeAt(0)) }); m.loadVariantConfig(config); return m; }", resolveDir: path.resolve(__dirname, '..'), loader: 'js' },
    bundle: true, platform: 'node', format: 'cjs', outfile: output, legalComments: 'none' });
  profile = compileDesignProfile(createDesignRegistry({ schemaVersion: 3,
    comparisons: IDS.map(id => ({ armyA: { reserve: [{ id, count: 1 }] }, armyB: {} })) }));
  const api = require(output);
  rules = await api.createMatchRules({ profile });
  rawModule = await api.createRaw(profile.config);
});
test.after(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

test('WD is a new three-point finite nonroyal grant, preserving W2 and earlier knight identities', () => {
  assert.equal(NEW_DEFINITIONS.length, 1);
  const wd = getDesign(IDS[1]), w2 = getDesign(IDS[0]);
  assert.equal(wd.movement, 'WD'); assert.equal(wd.level, 3); assert.equal(wd.placement, 'reserve');
  assert.deepEqual(wd.roles, { pawn: false, castlingRook: false, enPassant: false });
  assert.equal(wd.inheritLegacyProbes, false); assert.ok(Object.isFrozen(wd));
  assert.equal(w2.movement, 'W2'); assert.equal(w2.level, 3); assert.equal(w2.placement, 'reserve');
  assert.equal(getDesign('knight.purple@1').movement, 'WD');
  assert.equal(getDesign('knight.purple@1').placement, 'extra');
  assert.equal(getDesign('knight.purple@2').placement, 'insert');
  assert.deepEqual(profile.roles.royalTypes, ['k']);
  assert.ok(profile.capabilityProbes.some(probe => probe.name.includes(IDS[1] + ':')));
});

test('W2 and WD have exactly the same eight empty-board orthogonal destinations', t => {
  const expected = ['d5', 'd6', 'e4', 'f4', 'd3', 'd2', 'c4', 'b4'];
  for (const id of IDS) both(t, id + ' empty range', position({ ...kings, d4: type(id) }), (board, s) => {
    assert.deepEqual(destinations(board, s('d4')), expected.map(s).sort());
  });
});

test('only WD jumps across friendly or enemy intermediate squares', t => {
  for (const id of IDS) for (const blocker of ['P', 'p']) {
    both(t, id + ' intervening ' + blocker, position({ ...kings, d4: type(id), d5: blocker, e4: blocker, d3: blocker, c4: blocker }), (board, s) => {
      const moves = destinations(board, s('d4'));
      for (const target of ['d6', 'f4', 'd2', 'b4']) assert.equal(moves.includes(s(target)), id === IDS[1], target);
      for (const target of ['d5', 'e4', 'd3', 'c4']) assert.equal(moves.includes(s(target)), blocker === 'p', target);
      for (const target of ['d7', 'g4', 'd1', 'a4', 'e5', 'f6']) assert.ok(!moves.includes(s(target)), target);
    });
  }
});

test('both guards capture at the destination and cannot land on a friendly target', t => {
  for (const id of IDS) for (const target of ['P', 'p']) both(t, id + ' two-square landing ' + target,
    position({ ...kings, d4: type(id), d6: target, f4: target, d2: target, b4: target }), (board, s) => {
      const moves = destinations(board, s('d4'));
      for (const square of ['d6', 'f4', 'd2', 'b4']) assert.equal(moves.includes(s(square)), target === 'p', square);
      if (target === 'p') {
        assert.ok(board.push(s('d4') + s('d6')));
        assert.equal(pieceMap(board.fen()).get(s('d6')).toUpperCase(), type(id));
        fixtures.push({ name: id + ' capture result', fen: board.fen() });
      }
    });
});

test('finite deployment consumes a turn, uses empty home-half squares and removes one pocket piece', t => {
  for (const id of IDS) {
    const piece = type(id);
    both(t, id + ' finite deployment', position({ a1: 'K', h8: 'k', c4: 'P' }, 'w', '-', piece.repeat(2)), (board, s, black) => {
      assert.ok(board.moves().includes(piece + '@' + s('d4')));
      assert.ok(!board.moves().includes(piece + '@' + s('d5')));
      assert.ok(!board.moves().includes(piece + '@' + s('c4')));
      assert.ok(board.push(piece + '@' + s('d4')));
      assert.equal(board.turn(), black ? 'w' : 'b');
      assert.equal(pocketLetters(board.fen()).length, 1);
      assert.equal(pieceMap(board.fen()).get(s('a1')).toUpperCase(), 'K');
      fixtures.push({ name: id + ' deployed position', fen: board.fen() });
    });
  }
});

test('jumping checks prohibit WD drops even where an intervening piece makes the W2 drop legal', t => {
  for (const id of IDS) both(t, id + ' checking drop distinction',
    position({ a1: 'K', d6: 'k', d5: 'P' }, 'w', '-', type(id)), (board, s) => {
      assert.equal(board.moves().includes(type(id) + '@' + s('d4')), id === IDS[0]);
    });
  for (const id of IDS) both(t, id + ' unblocked checking drop', position({ a1: 'K', d6: 'k' }, 'w', '-', type(id)), (board, s) => {
    assert.ok(!board.moves().includes(type(id) + '@' + s('d4')));
  });
});

test('ordinary royal safety still governs interposition and a knight check cannot be blocked by a drop', t => {
  const piece = type(IDS[1]);
  both(t, 'rook check interposition', position({ e1: 'K', h8: 'k', e8: 'r' }, 'w', '-', piece), (board, s) => {
    assert.ok(board.moves().includes(piece + '@' + s('e3')));
    assert.ok(!board.moves().includes(piece + '@' + s('d3')));
  });
  both(t, 'knight check cannot be interposed', position({ e1: 'K', h8: 'k', f3: 'n' }, 'w', '-', piece), board => {
    assert.ok(!board.moves().some(move => move.includes('@')));
  });
});

test('WD stays nonroyal, non-pawn, capturable and never returns captured material to reserve', t => {
  const piece = type(IDS[1]);
  both(t, 'nonroyal may remain attacked', position({ ...kings, d4: piece, d8: 'r' }), (board, s) => {
    assert.ok(board.moves().includes(s('d4') + s('d5')));
  });
  both(t, 'captured guard disappears', position({ ...kings, d4: piece, d8: 'r' }, 'b'), (board, s) => {
    assert.ok(board.push(s('d8') + s('d4')));
    assert.equal(pieceMap(board.fen()).get(s('d4')).toLowerCase(), 'r');
    assert.equal(pocketLetters(board.fen()), '');
    fixtures.push({ name: 'capture disappearance result', fen: board.fen() });
  });
  both(t, 'WD quiet jump to EP target does not capture bypassed pawn', position({ h1: 'K', h8: 'k', d4: piece, d5: 'p' }, 'w', 'd6'), (board, s) => {
    assert.ok(board.push(s('d4') + s('d6')));
    assert.equal(pieceMap(board.fen()).get(s('d5')).toLowerCase(), 'p');
    fixtures.push({ name: 'non-pawn EP visit result', fen: board.fen() });
  });
  both(t, 'WD never promotes', position({ h1: 'K', h6: 'k', b7: piece }), (board, s) => {
    const prefix = s('b7') + s('b8');
    assert.deepEqual(board.moves().filter(move => move.startsWith(prefix)), [prefix]);
    assert.ok(board.push(prefix));
    assert.equal(pieceMap(board.fen()).get(s('b8')).toUpperCase(), piece);
  });
});

test('undo restores each position and finite pocket after deployment, enemy reply and a jumping capture', () => {
  const piece = type(IDS[1]);
  const start = position({ a1: 'K', h8: 'k', d5: 'P', d6: 'p' }, 'w', '-', piece);
  for (const black of [false, true]) {
    const board = new rawModule.Board(profile.variant, black ? opposite(start) : start);
    const s = black ? reflect : square => square;
    try {
      const positions = [board.fen()];
      for (const move of [piece + '@' + s('d4'), s('h8') + s('h7'), s('d4') + s('d6')]) {
        assert.ok(board.push(move)); positions.push(board.fen());
      }
      assert.equal(pocketLetters(board.fen()), '');
      for (let index = positions.length - 2; index >= 0; index--) {
        board.pop(); assert.equal(board.fen(), positions[index]);
      }
      assert.equal(pocketLetters(board.fen()).length, 1);
    } finally { board.delete(); }
  }
});

test('native and browser legal moves match all both-color grant fixtures without searches', { skip: !fs.existsSync(nativePath), timeout: 120000 }, async t => {
  const ini = path.join(directory, 'orthogonal-grants.ini'); fs.writeFileSync(ini, profile.config);
  const engine = new UciEngine({ path: nativePath, variantPath: ini, variant: profile.variant, options: { threads: 1, hash: 16 } });
  t.after(() => engine.close()); await engine.start();
  const inputs = new Map([...profile.capabilityProbes, ...fixtures].map(input => [input.fen, input]));
  for (const input of inputs.values()) {
    const board = rules.createBoard(input.fen);
    try { assert.deepEqual(await engine.perft({ fen: input.fen }), board.moves().sort(), input.name); }
    finally { board.dispose(); }
  }
  await engine.close();
  t.diagnostic(`${inputs.size} distinct native/browser fixtures; no search or scored games.`);
});
