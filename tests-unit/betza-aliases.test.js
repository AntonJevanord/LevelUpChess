'use strict';

// Movement fixtures only. No search, scored games, catalog edits or rebuilt bundles.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { rulesBuildOptions } = require('../scripts/rules-build');
const { UciEngine } = require('../scripts/balance/uci');
const { getDesign } = require('../src/design-catalog');
const { placementFromMap } = require('../src/profile-fen');

const aliases = ['BsR2nsN', 'BsR2snN', 'BsW2nsN', 'BsW2snN'];
const nativePath = process.env.FAIRY_STOCKFISH_PATH || path.resolve(__dirname, '../node_modules/.cache/levelup-native-values/stockfish');
const variants = aliases.map((movement, i) => ({ movement, variant: `levelup-betza-alias-${i}` }));
const config = variants.map(({ movement, variant }) => `[${variant}:chess]\ncustomPiece1 = a:${movement}\npieceToCharTable = -\n`).join('\n');
const squares = Array.from({ length: 64 }, (_, i) => 'abcdefgh'[i % 8] + (1 + Math.floor(i / 8)));
let directory, rawModule;

function fen(pieces, black = false) {
  const map = new Map(Object.entries(pieces));
  if (!black) return `${placementFromMap(map)} w - - 0 1`;
  const mirror = new Map([...map].map(([square, piece]) => [square[0] + (9 - Number(square[1])),
    piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase()]));
  return `${placementFromMap(mirror)} b - - 0 1`;
}
function moves(variant, position) {
  const board = new rawModule.Board(variant, position, false);
  try { return board.legalMoves().split(' ').filter(Boolean).sort(); }
  finally { board.delete(); }
}
const fixtures = [];
for (const origin of ['d4', 'e5', 'b2', 'g7']) for (const black of [false, true]) {
  const base = { h1: 'K', a8: 'k', [origin]: 'A' };
  fixtures.push({ name: `${origin}, empty, ${black ? 'Black' : 'White'}`, fen: fen(base, black) });
  for (const square of squares.filter(square => !Object.hasOwn(base, square))) for (const blocker of ['N', 'n']) {
    fixtures.push({ name: `${origin}, ${blocker}@${square}, ${black ? 'Black' : 'White'}`,
      fen: fen({ ...base, [square]: blocker }, black) });
  }
}

test.before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-betza-aliases-'));
  const output = path.join(directory, 'raw.cjs');
  await build({ ...rulesBuildOptions(), absWorkingDir: path.resolve(__dirname, '..'),
    stdin: { contents: "import Module from 'ffish-es6'; import bytes from 'variant-wasm'; export async function createRaw(config) { const m = await Module({ wasmBinary: Uint8Array.from(atob(bytes), c => c.charCodeAt(0)) }); m.loadVariantConfig(config); return m; }", resolveDir: path.resolve(__dirname, '..'), loader: 'js' },
    bundle: true, platform: 'node', format: 'cjs', outfile: output, legalComments: 'none' });
  rawModule = await require(output).createRaw(config);
});
test.after(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

test('accepted ten-piece roster retains exact immutable Betza spellings', () => {
  const rows = [
    ['pawn.queen-sideways@1', 'mQ2cfQ2'], ['bishop.vertical-blocked@1', 'BvW2vnN'],
    ['knight.purple@3', 'NC'], ['rook.purple@10', 'RfB'], ['queen.purple@1', 'QN'],
    ['pawn.purple@13', 'mRcfB'], ['bishop.purple@13', 'BsR2nsN'],
    ['knight.purple@4', 'N0'], ['rook.purple@12', 'RC'], ['queen.purple@7', 'QgB0'],
  ];
  for (const [id, movement] of rows) assert.equal(getDesign(id).movement, movement, id);
});

test('WASM Crusader aliases agree across colors, origins and every single-square friendly/enemy blocker', t => {
  for (const fixture of fixtures) {
    const expected = moves(variants[0].variant, fixture.fen);
    for (const row of variants.slice(1)) assert.deepEqual(moves(row.variant, fixture.fen), expected, `${row.movement}: ${fixture.name}`);
  }
  t.diagnostic(`${fixtures.length} positions compared for all four alias spellings.`);
});

test('Crusader sideways slide needs a clear path; lame knight checks the first sideways square only', () => {
  const base = { h1: 'K', a8: 'k', d4: 'A' };
  for (const row of variants) {
    const open = moves(row.variant, fen(base));
    assert.ok(open.includes('d4f4')); assert.ok(open.includes('d4f5'));
    const first = moves(row.variant, fen({ ...base, e4: 'N' }));
    assert.ok(!first.includes('d4f4')); assert.ok(!first.includes('d4f5'));
    const second = moves(row.variant, fen({ ...base, f4: 'N' }));
    assert.ok(!second.includes('d4f4')); assert.ok(second.includes('d4f5'));
  }
});

test('native Crusader aliases match WASM on the same blocker matrix', { skip: !fs.existsSync(nativePath), timeout: 120000 }, async t => {
  const ini = path.join(directory, 'aliases.ini'); fs.writeFileSync(ini, config);
  for (const row of variants) {
    const engine = new UciEngine({ path: nativePath, variantPath: ini, variant: row.variant, options: { threads: 1, hash: 16 } });
    t.after(() => engine.close()); await engine.start();
    for (const fixture of fixtures) assert.deepEqual(await engine.perft({ fen: fixture.fen }),
      moves(row.variant, fixture.fen), `${row.movement}: ${fixture.name}`);
    await engine.close();
  }
  t.diagnostic(`${fixtures.length * variants.length} native/WASM checks; no searches or scored games.`);
});
