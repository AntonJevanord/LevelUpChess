'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { PLAYABLE_LIBRARIES, getPlayableProfile } = require('../src/design-options');
const { createMatchRules } = require('../dist/balance-rules.cjs');
const { pieceMap, placementFromMap } = require('../src/profile-fen');
const { UciEngine } = require('../scripts/balance/uci');
const libraries = PLAYABLE_LIBRARIES.filter(row => row.generation === 19);
const profiles = libraries.map(row => getPlayableProfile(row.variant));
const native = process.env.FAIRY_STOCKFISH_PATH || path.resolve(__dirname, '../node_modules/.cache/levelup-native-values/stockfish');
const flip = square => square[0] + (9 - Number(square[1]));
const swap = letter => letter === letter.toUpperCase() ? letter.toLowerCase() : letter.toUpperCase();
const letter = (profile, id) => profile.registry.allocations.find(row => row.id === id).letter.toUpperCase();
function fen(pieces, black = false, ep = '-') {
  return `${placementFromMap(new Map(Object.entries(pieces).map(([square, piece]) => black ? [flip(square), swap(piece)] : [square, piece])))} ${black ? 'b' : 'w'} - ${black && ep !== '-' ? flip(ep) : ep} 0 1`;
}

test('NAD has jumping diagonal/orthogonal captures; NDmW retains quiet-only adjacent steps', async () => {
  for (const [profile, id] of [[profiles[1], 'knight.level2-nd-quiet-orthogonal@1'], [profiles[2], 'knight.level3-nad@1']]) {
    const rules = await createMatchRules({ profile }), type = letter(profile, id);
    for (const black of [false, true]) for (const occupied of [false, true]) {
      const s = black ? flip : value => value;
      const board = rules.createBoard(fen({ a1: 'K', h8: 'k', d4: type,
        ...(occupied ? { d5: 'p', e4: 'p', f4: 'p', f6: 'p' } : {}) }, black));
      try {
        const moves = board.moves(), move = target => s('d4') + s(target);
        assert.ok(moves.includes(move('f4')));
        assert.equal(moves.includes(move('f6')), id === 'knight.level3-nad@1');
        assert.equal(moves.includes(move('d5')), id.includes('level2') && !occupied);
        assert.equal(moves.includes(move('e4')), id.includes('level2') && !occupied);
        assert.ok(moves.includes(move('b5')));
      } finally { board.dispose(); }
    }
  }
});

test('tested Ranger and Herald retain their actual diagonal en-passant victim handling', async () => {
  const profile = profiles[2], rules = await createMatchRules({ profile });
  for (const id of ['pawn.purple@13', 'pawn.queen-sideways@1']) for (const black of [false, true]) {
    const s = black ? flip : value => value;
    const board = rules.createBoard(fen({ h1: 'K', h8: 'k', c5: letter(profile, id), d5: 'p' }, black, 'd6'));
    try { assert.ok(board.push(s('c5') + s('d6'))); assert.equal(pieceMap(board.fen()).has(s('d5')), id === 'pawn.queen-sideways@1', id); }
    finally { board.dispose(); }
  }
});

test('all accepted fixtures and six manual value tables agree in native and browser engines', { skip: !fs.existsSync(native), timeout: 120000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v19-parity-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const [index, profile] of profiles.entries()) {
    const file = path.join(directory, `tier${index + 1}.ini`); fs.writeFileSync(file, profile.config);
    const engine = new UciEngine({ path: native, variantPath: file, variant: profile.variant, options: { threads: 1, hash: 16 } });
    const rules = await createMatchRules({ profile });
    try {
      await engine.start(); const tables = (await engine.pieceValues()).pieces;
      for (const [id, value] of Object.entries(profile.evaluation.pieceValues)) for (const type of [letter(profile, id), letter(profile, id).toLowerCase()]) {
        for (const field of ['rawMg', 'captureMg', 'evalMg']) assert.equal(tables[type][field], value.mg, `${id}: ${field}`);
        for (const field of ['rawEg', 'captureEg', 'evalEg']) assert.equal(tables[type][field], value.eg, `${id}: ${field}`);
      }
      for (const probe of profile.capabilityProbes) {
        const board = rules.createBoard(probe.fen);
        try { assert.deepEqual(await engine.perft({ fen: probe.fen }), board.moves().sort(), probe.name); }
        finally { board.dispose(); }
      }
    } finally { await engine.close(); }
  }
});
