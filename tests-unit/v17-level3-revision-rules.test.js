'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { rulesBuildOptions } = require('../scripts/rules-build');
const { getDesign } = require('../src/design-catalog');
const { TRIALS, NEW_DEFINITIONS, REJECTED_DEFINITIONS } = require('../src/balance-designs-v17-revisions');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { pieceMap, pocketLetters } = require('../src/profile-fen');
const { UciEngine } = require('../scripts/balance/uci');

const ids = Object.fromEntries(TRIALS.map(row => [row.key, row.id]));
let directory, profile, rules, unsafeProfile, unsafeRules;
const fixtures = [];
const unsafeFixtures = [];
const reflect = square => square[0] + (9 - Number(square[1]));
const swap = value => value.replace(/[a-z]/gi, p => p === p.toUpperCase() ? p.toLowerCase() : p.toUpperCase());
const type = id => profile.registry.allocations.find(row => row.id === id).letter.toUpperCase();
function fen(pieces, turn = 'w', ep = '-', pocket = '') {
  const rows = [];
  for (let rank = 8; rank >= 1; rank--) {
    let row = '', empty = 0;
    for (const file of 'abcdefgh') {
      const p = pieces[file + rank];
      if (!p) { empty++; continue; }
      if (empty) row += empty;
      empty = 0; row += p;
    }
    rows.push(row + (empty || ''));
  }
  return `${rows.join('/')}[${pocket}] ${turn} - ${ep} 0 1`;
}
function opposite(input) {
  const fields = input.split(' ');
  fields[0] = swap(fields[0].split('[')[0].split('/').reverse().join('/')) + (input.includes('[') ? '[' + swap(pocketLetters(input)) + ']' : '');
  fields[1] = fields[1] === 'w' ? 'b' : 'w';
  if (fields[3] !== '-') fields[3] = fields[3].match(/[a-h][1-8]/g).map(reflect).sort().join('');
  return fields.join(' ');
}
function both(t, name, input, check) {
  for (const black of [false, true]) {
    const position = black ? opposite(input) : input;
    fixtures.push({ name: name + (black ? ': Black' : ': White'), fen: position });
    const board = rules.createBoard(position); t.after(() => board.dispose());
    check(board, black ? reflect : square => square, black);
  }
}
const targets = (board, from) => [...new Set(board.moves().filter(move => move.startsWith(from)).map(move => move.slice(2, 4)))].sort();
const kings = { a1: 'K', h7: 'k' };

test.before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-l3-revision-rules-'));
  const output = path.join(directory, 'rules.cjs');
  await build({ ...rulesBuildOptions(), absWorkingDir: path.resolve(__dirname, '..'), entryPoints: ['src/balance-rules.js'],
    bundle: true, platform: 'node', format: 'cjs', outfile: output, legalComments: 'none' });
  const homes = { pawn: 'c2', bishop: 'c1', queen: 'd1' };
  const comparisons = TRIALS.map(row => ({ armyA: row.placement === 'reserve'
    ? { reserve: [{ id: row.id, count: 1 }] } : { upgrades: { [homes[row.family]]: row.id } }, armyB: {} }));
  profile = compileDesignProfile(createDesignRegistry({ schemaVersion: 3, comparisons }));
  rules = await require(output).createMatchRules({ profile });
  unsafeProfile = compileDesignProfile(createDesignRegistry({ schemaVersion: 3, comparisons: [
    { armyA: { upgrades: { d1: 'queen.xray-omni@1' } }, armyB: {} },
  ] }));
  unsafeRules = await require(output).createMatchRules({ profile: unsafeProfile });
});
test.after(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

test('new identities preserve accepted pieces and earlier grant prices', () => {
  assert.equal(TRIALS.length, 6); assert.equal(NEW_DEFINITIONS.length, 7);
  assert.deepEqual(REJECTED_DEFINITIONS.map(row => row.id), ['queen.xray-omni@1']);
  assert.ok(!TRIALS.some(row => row.id === 'queen.xray-omni@1'));
  for (const row of TRIALS) {
    const design = getDesign(row.id);
    assert.equal(design.movement, row.movement); assert.equal(design.level, 3);
    assert.equal(design.placement, row.placement); assert.equal(design.inheritLegacyProbes, false);
    assert.ok(Object.isFrozen(design));
    assert.ok(profile.capabilityProbes.some(probe => probe.name.startsWith(row.id + ':')));
  }
  assert.equal(getDesign('bishop.purple@18').movement, 'BvWvN');
  assert.equal(getDesign('pawn.purple@13').movement, 'mRcfB');
  assert.equal(getDesign('rook.purple@12').movement, 'RC');
  assert.equal(getDesign('queen.purple@7').movement, 'QgB0');
  assert.equal(getDesign('king.reserve-king@1').level, 4);
  assert.equal(getDesign('king.grant-orthogonal-expanded@1').level, 2);
  assert.deepEqual(profile.roles.royalTypes, ['k']);
  assert.ok(profile.capabilityProbes.some(probe => probe.name.includes('first vertical leg')));
  assert.ok(profile.capabilityProbes.some(probe => probe.name.includes('quiet EP-target visit keeps the bypassed pawn')));
});

test('blocked Vertical bishop has clear two-square vertical slides and first-leg knight blockers', t => {
  const piece = type(ids['vertical-blocked']);
  for (const blocker of [null, 'd5', 'd6']) both(t, 'vertical blockers ' + blocker,
    fen({ ...kings, d4: piece, ...(blocker ? { [blocker]: 'P' } : {}) }), (board, s) => {
      const moves = targets(board, s('d4'));
      assert.equal(moves.includes(s('e6')), blocker !== 'd5');
      assert.equal(moves.includes(s('c6')), blocker !== 'd5');
      assert.equal(moves.includes(s('d6')), blocker === null);
      assert.ok(!moves.includes(s('f5'))); assert.ok(!moves.includes(s('f4')));
    });
  both(t, 'vertical knight captures', fen({ ...kings, d4: piece, e6: 'p', c2: 'p', d6: 'p' }), (board, s) => {
    for (const to of ['e6', 'c2', 'd6']) assert.ok(targets(board, s('d4')).includes(s(to)));
  });
});

test('Queen pawn moves quietly in every queen direction within two clear squares', t => {
  const piece = type(ids['queen-sideways']);
  both(t, 'queen-pawn quiet range', fen({ ...kings, d4: piece }), (board, s) => {
    for (const to of ['b4', 'f4', 'd2', 'b2', 'f2', 'd6', 'b6', 'f6']) assert.ok(targets(board, s('d4')).includes(s(to)), to);
    for (const to of ['a4', 'g4', 'd1', 'd7', 'c6', 'f5']) assert.ok(!targets(board, s('d4')).includes(s(to)), to);
  });
  both(t, 'queen-pawn blockers', fen({ ...kings, d4: piece, e4: 'P', d3: 'P', c5: 'P' }), (board, s) => {
    for (const to of ['f4', 'd2', 'b6']) assert.ok(!targets(board, s('d4')).includes(s(to)), to);
  });
});

test('Queen pawn captures only forward along files and diagonals, without jumping', t => {
  const piece = type(ids['queen-sideways']);
  for (const target of ['d5', 'd6', 'e5', 'f6', 'c5', 'b6', 'e4', 'f4', 'd3', 'd2', 'c3', 'b2']) {
    both(t, 'queen-pawn target ' + target, fen({ ...kings, d4: piece, [target]: 'p' }), (board, s) => {
      assert.equal(targets(board, s('d4')).includes(s(target)), Number(target[1]) > 4, target);
    });
  }
  both(t, 'queen-pawn capture blocker', fen({ ...kings, d4: piece, e5: 'P', f6: 'p' }), (board, s) => {
    assert.ok(!targets(board, s('d4')).includes(s('f6')));
  });
});

test('Queen pawn keeps quiet EP visits and standard quiet/capturing promotions', t => {
  const piece = type(ids['queen-sideways']);
  both(t, 'queen-pawn quiet EP', fen({ h1: 'K', h8: 'k', c5: piece, d5: 'p' }, 'w', 'd6'), (board, s) => {
    assert.ok(board.push(s('c5') + s('d6')));
    assert.equal(pieceMap(board.fen()).get(s('d5')).toLowerCase(), 'p');
    fixtures.push({ name: 'queen-pawn quiet EP resulting position', fen: board.fen() });
  });
  both(t, 'queen-pawn promotions', fen({ h1: 'K', h6: 'k', b7: piece, c8: 'r' }), (board, s) => {
    for (const destination of ['b8', 'c8']) {
      const prefix = s('b7') + s(destination);
      assert.deepEqual(board.moves().filter(move => move.startsWith(prefix)).map(move => move.slice(4)).sort(), ['b', 'n', 'q', 'r']);
    }
  });
});

test('rook-ray queen hops on orthogonal rays while diagonal rays remain blocked', t => {
  const piece = type(ids['xray-rook']);
  both(t, 'xray orthogonal hurdle and second blocker', fen({ ...kings, d4: piece, e4: 'P', g4: 'p', h4: 'p', d5: 'P', d7: 'p', d8: 'p' }), (board, s) => {
    for (const to of ['f4', 'g4', 'd6', 'd7']) assert.ok(targets(board, s('d4')).includes(s(to)), to);
    for (const to of ['h4', 'd8', 'e6', 'f5']) assert.ok(!targets(board, s('d4')).includes(s(to)), to);
  });
  both(t, 'xray cannot cross diagonal hurdle', fen({ ...kings, d4: piece, e5: 'P', g7: 'p', h8: 'p' }), (board, s) => {
    for (const to of ['f6', 'g7', 'h8']) assert.ok(!targets(board, s('d4')).includes(s(to)), to);
  });
  both(t, 'rook-ray queen may hop an enemy hurdle but cannot pass a friendly second blocker', fen({ ...kings, d4: piece, e4: 'p', g4: 'P', e5: 'p', g7: 'P' }), (board, s) => {
    for (const to of ['e4', 'f4', 'e5']) assert.ok(targets(board, s('d4')).includes(s(to)), to);
    for (const to of ['g4', 'h4', 'f6', 'g7', 'h8']) assert.ok(!targets(board, s('d4')).includes(s(to)), to);
  });
});

// Exhaustive three-ply rules traversal, with no engine search or scored games.
function forcedMateInTwo(gameRules, startFen) {
  const initial = gameRules.createBoard(startFen);
  let firstMoves;
  try { firstMoves = initial.moves(); } finally { initial.dispose(); }
  for (const first of firstMoves) {
    const board = gameRules.createBoard(startFen);
    let afterFirst, replies, immediate;
    try { assert.ok(board.push(first)); afterFirst = board.fen(); replies = board.moves(); immediate = board.outcome(); }
    finally { board.dispose(); }
    if (immediate?.reason === 'checkmate') return { first, immediate: true };
    if (!replies.length) continue;
    let forced = true;
    for (const reply of replies) {
      const response = gameRules.createBoard(afterFirst);
      let afterReply, finishes;
      try { assert.ok(response.push(reply)); afterReply = response.fen(); finishes = response.moves(); }
      finally { response.dispose(); }
      let mate = false;
      for (const finish of finishes) {
        const final = gameRules.createBoard(afterReply);
        try { assert.ok(final.push(finish)); mate = final.outcome()?.reason === 'checkmate'; }
        finally { final.dispose(); }
        if (mate) break;
      }
      if (!mate) { forced = false; break; }
    }
    if (forced) return { first, immediate: false };
  }
  return null;
}

test('rejected omnidirectional queen forces the opening mate, while rook-only rays avoid it', t => {
  const unsafeStart = unsafeRules.startingFen({ upgrades: { d1: 'queen.xray-omni@1' } }, {});
  const safeStart = rules.startingFen({ upgrades: { d1: ids['xray-rook'] } }, {});
  for (const black of [false, true]) {
    const s = black ? reflect : square => square;
    const unsafeInitial = black ? opposite(unsafeStart) : unsafeStart;
    const board = unsafeRules.createBoard(unsafeInitial); t.after(() => board.dispose());
    unsafeFixtures.push({ name: 'rejected omni initial position', fen: unsafeInitial });
    assert.equal(board.san(s('d1') + s('h5')).endsWith('+'), true);
    assert.ok(board.push(s('d1') + s('h5')));
    unsafeFixtures.push({ name: 'rejected omni Qh5 check', fen: board.fen() });
    assert.deepEqual(board.moves(), [s('g7') + s('g6')]);
    assert.ok(board.push(s('g7') + s('g6')));
    unsafeFixtures.push({ name: 'rejected omni forced g6 reply', fen: board.fen() });
    assert.ok(board.push(s('h5') + s('e5')));
    unsafeFixtures.push({ name: 'rejected omni Qe5 checkmate', fen: board.fen() });
    assert.deepEqual(board.outcome(), { result: black ? '0-1' : '1-0', reason: 'checkmate' });
    const initial = black ? opposite(safeStart) : safeStart;
    fixtures.push({ name: 'rook-only initial position', fen: initial });
    const safe = rules.createBoard(initial); t.after(() => safe.dispose());
    assert.ok(!safe.moves().includes(s('d1') + s('h5')));
    assert.equal(forcedMateInTwo(rules, initial), null);
  }
});

test('three-point grants use distinct K, clear-path W3 and jumping N movement', t => {
  for (const key of ['grant-king', 'grant-orthogonal-three', 'grant-knight']) {
    const piece = type(ids[key]);
    both(t, key + ' movement', fen({ ...kings, d4: piece, d5: 'P', e6: 'p' }), (board, s) => {
      const moves = targets(board, s('d4'));
      assert.equal(moves.includes(s('e5')), key === 'grant-king');
      assert.equal(moves.includes(s('d7')), false, 'W3 cannot cross d5');
      assert.equal(moves.includes(s('e6')), key === 'grant-knight');
      assert.equal(moves.includes(s('g4')), key === 'grant-orthogonal-three');
      assert.ok(!moves.includes(s('h4')));
    });
  }
});

test('grants deploy once in the home half, cannot give check, and remain capturable nonroyal pieces', t => {
  for (const key of ['grant-king', 'grant-orthogonal-three', 'grant-knight']) {
    const piece = type(ids[key]);
    both(t, key + ' finite home deployment', fen({ a1: 'K', h8: 'k' }, 'w', '-', piece), (board, s) => {
      assert.ok(board.moves().includes(piece + '@' + s('d4')));
      assert.ok(!board.moves().includes(piece + '@' + s('d5')));
      assert.ok(board.push(piece + '@' + s('d4')));
      assert.equal(pocketLetters(board.fen()), '');
      assert.equal(board.turn(), s('a1') === 'a1' ? 'b' : 'w');
    });
    const enemyKing = key === 'grant-king' ? 'e5' : key === 'grant-knight' ? 'e6' : 'd6';
    both(t, key + ' checking drop forbidden', fen({ a1: 'K', [enemyKing]: 'k' }, 'w', '-', piece), (board, s) => {
      assert.ok(!board.moves().includes(piece + '@' + s('d4')));
    });
    both(t, key + ' captured guard disappears', fen({ ...kings, d4: piece, d8: 'r' }, 'b'), (board, s) => {
      assert.ok(board.push(s('d8') + s('d4')));
      assert.equal(pocketLetters(board.fen()), '');
      assert.equal(pieceMap(board.fen()).get(s('d4')).toLowerCase(), 'r');
    });
    both(t, key + ' guard has no pawn promotion', fen({ h1: 'K', h6: 'k', b7: piece }), (board, s) => {
      const from = s('b7');
      assert.ok(board.moves().filter(move => move.startsWith(from)).every(move => move.length === 4));
    });
  }
});

const nativePath = process.env.FAIRY_STOCKFISH_PATH || path.resolve(__dirname, '../node_modules/.cache/levelup-native-values/stockfish');
test('native and browser rules agree on revision movement, captures, EP, promotion and finite reserves', { skip: !fs.existsSync(nativePath), timeout: 120000 }, async t => {
  const ini = path.join(directory, 'revisions.ini'); fs.writeFileSync(ini, profile.config);
  const engine = new UciEngine({ path: nativePath, variantPath: ini, variant: profile.variant, options: { threads: 1, hash: 16 } });
  t.after(() => engine.close()); await engine.start();
  const inputs = new Map([...profile.capabilityProbes, ...fixtures].map(input => [input.fen, input]));
  for (const { fen, name } of inputs.values()) {
    const board = rules.createBoard(fen);
    try { assert.deepEqual(await engine.perft({ fen }), board.moves().sort(), name); }
    finally { board.dispose(); }
  }
  await engine.close();
  const unsafeIni = path.join(directory, 'rejected-omni.ini'); fs.writeFileSync(unsafeIni, unsafeProfile.config);
  const rejectedEngine = new UciEngine({ path: nativePath, variantPath: unsafeIni, variant: unsafeProfile.variant, options: { threads: 1, hash: 16 } });
  t.after(() => rejectedEngine.close()); await rejectedEngine.start();
  for (const { fen, name } of unsafeFixtures) {
    const board = unsafeRules.createBoard(fen);
    try { assert.deepEqual(await rejectedEngine.perft({ fen }), board.moves().sort(), name); }
    finally { board.dispose(); }
  }
  await rejectedEngine.close();
  t.diagnostic(`${inputs.size + unsafeFixtures.length} native/browser fixtures, including rejected opening-mate positions; no search or scored games.`);
});
