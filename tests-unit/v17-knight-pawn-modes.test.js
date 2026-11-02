'use strict';

// Standalone movement fixtures: no catalog edits, games or engine searches.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { rulesBuildOptions } = require('../scripts/rules-build');
const { UciEngine } = require('../scripts/balance/uci');
const { placementFromMap, pieceMap } = require('../src/profile-fen');
const configFile = path.resolve(__dirname, '../prototypes/pawns/knight-modes.ini');
const config = fs.readFileSync(configFile, 'utf8');
const variants = ['base', 'capture', 'quiet', 'no-ep'].map(key => `levelup-pawn-mode-${key}`);
const native = process.env.FAIRY_STOCKFISH_PATH || path.resolve(__dirname, '../node_modules/.cache/levelup-native-values/stockfish');
let directory, rawModule;
const fixtures = [];
const flip = square => square[0] + (9 - Number(square[1]));
const swap = piece => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase();
function position(pieces, black, ep = '-') {
  const map = new Map(Object.entries(pieces).map(([square, piece]) => black ? [flip(square), swap(piece)] : [square, piece]));
  return `${placementFromMap(map)} ${black ? 'b' : 'w'} - ${ep === '-' ? '-' : black ? flip(ep) : ep} 0 1`;
}
function board(key, pieces, black = false, ep = '-') {
  const variant = `levelup-pawn-mode-${key}`, fen = position(pieces, black, ep);
  fixtures.push({ variant, fen }); return new rawModule.Board(variant, fen, false);
}
const moves = b => b.legalMoves().split(' ').filter(Boolean).sort();
function both(callback) { for (const black of [false, true]) callback(black, black ? flip : square => square); }

test.before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-pawn-modes-'));
  const output = path.join(directory, 'raw.cjs');
  await build({ ...rulesBuildOptions(), absWorkingDir: path.resolve(__dirname, '..'),
    stdin: { contents: "import Module from 'ffish-es6'; import bytes from 'variant-wasm'; export async function createRaw(config) { const m = await Module({ wasmBinary: Uint8Array.from(atob(bytes), c => c.charCodeAt(0)) }); m.loadVariantConfig(config); return m; }", resolveDir: path.resolve(__dirname, '..'), loader: 'js' },
    bundle: true, platform: 'node', format: 'cjs', outfile: output, legalComments: 'none' });
  rawModule = await require(output).createRaw(config);
});
test.after(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

test('fsN keeps wide forward moves while tall jump quiet/capture modes separate', () => {
  both((black, s) => {
    for (const key of ['base', 'capture', 'quiet']) for (const occupied of [false, true]) {
      const pieces = { a1: 'K', h8: 'k', d4: 'A', ...(occupied ? { c6: 'p', e6: 'p', b5: 'p', f5: 'p' } : {}) };
      const b = board(key, pieces, black);
      try {
        const available = moves(b);
        for (const wide of ['b5', 'f5']) assert.ok(available.includes(s('d4') + s(wide)), `${key} wide ${wide}`);
        for (const tall of ['c6', 'e6']) assert.equal(available.includes(s('d4') + s(tall)), key === 'base' || (key === 'capture') === occupied, `${key} tall ${tall}`);
        for (const backward of ['c2', 'e2', 'b3', 'f3']) assert.ok(!available.includes(s('d4') + s(backward)));
      } finally { b.delete(); }
    }
  });
});
test('all forward knight components jump intervening blockers and cannot capture friendly destinations', () => {
  both((black, s) => {
    for (const key of ['capture', 'quiet']) {
      const b = board(key, { a1: 'K', h8: 'k', d4: 'A', d5: 'P', c4: 'P', e4: 'P', c6: key === 'capture' ? 'p' : 'P', b5: 'P', f5: 'p' }, black);
      try { const available = moves(b); assert.ok(available.includes(s('d4') + s('f5'))); assert.ok(!available.includes(s('d4') + s('b5')));
        assert.equal(available.includes(s('d4') + s('c6')), key === 'capture'); } finally { b.delete(); }
    }
  });
});
test('initial double advance stays clear and absent away from configured home ranks', () => {
  both((black, s) => {
    for (const key of ['capture', 'quiet']) {
      for (const blocked of [false, true]) {
        const b = board(key, { a1: 'K', h8: 'k', d2: 'A', ...(blocked ? { d3: 'P' } : {}) }, black);
        try { assert.equal(moves(b).includes(s('d2') + s('d4')), !blocked); } finally { b.delete(); }
      }
      const b = board(key, { a1: 'K', h8: 'k', d3: 'A' }, black);
      try { assert.ok(!moves(b).includes(s('d3') + s('d5'))); } finally { b.delete(); }
    }
  });
});
test('fceF removes the bypassed pawn while the disabled-EP role control cannot capture it', () => {
  both((black, s) => {
    for (const key of ['capture', 'quiet', 'no-ep']) {
      const b = board(key, { a1: 'K', h8: 'k', e5: 'A', d5: 'p' }, black, 'd6');
      try {
        const move = s('e5') + s('d6'); assert.equal(moves(b).includes(move), key !== 'no-ep');
        if (key !== 'no-ep') { assert.ok(b.push(move)); assert.ok(!pieceMap(b.fen()).has(s('d5'))); }
      } finally { b.delete(); }
    }
  });
});
test('fceN allows the tall en-passant capture and removes a checking pawn', () => {
  both((black, s) => {
    for (const key of ['capture', 'quiet', 'no-ep']) {
      const b = board(key, { e4: 'K', h8: 'k', c4: 'A', d5: 'p' }, black, 'd6');
      try {
        const move = s('c4') + s('d6'); assert.equal(moves(b).includes(move), key === 'capture');
        if (key === 'capture') { assert.ok(b.push(move)); assert.ok(!pieceMap(b.fen()).has(s('d5'))); }
      } finally { b.delete(); }
    }
  });
});
test('both prototypes retain mandatory ordinary QRBN promotion', () => {
  both((black, s) => {
    for (const key of ['capture', 'quiet']) {
      const b = board(key, { a1: 'K', h6: 'k', d7: 'A' }, black);
      try { assert.deepEqual(moves(b).filter(move => move.startsWith(s('d7') + s('d8'))).map(move => move.slice(4)), ['b', 'n', 'q', 'r']); } finally { b.delete(); }
    }
  });
});
test('native move sets match every pawn mode and en-passant/royal-safety fixture', { skip: !fs.existsSync(native) }, async t => {
  for (const variant of variants) {
    const engine = new UciEngine({ path: native, variantPath: configFile, variant, options: { threads: 1, hash: 16 } });
    t.after(() => engine.close()); await engine.start();
    for (const fixture of fixtures.filter(row => row.variant === variant)) {
      const b = new rawModule.Board(variant, fixture.fen, false);
      try { assert.deepEqual(await engine.perft({ fen: fixture.fen }), moves(b)); } finally { b.delete(); }
    }
    await engine.close();
  }
  t.diagnostic(`${fixtures.length} native/browser fixtures, no searches or games.`);
});
