'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { rulesBuildOptions } = require('../scripts/rules-build');
const { UciEngine } = require('../scripts/balance/uci');
const { placementFromMap } = require('../src/profile-fen');
const { getDesign } = require('../src/design-catalog');
const { TRIALS, NEW_DEFINITIONS, wraithProbes, revisionProbes } = require('../src/balance-designs-v18-wraith');

const ROOT = path.resolve(__dirname, '..');
const nativePath = process.env.FAIRY_STOCKFISH_PATH || path.join(ROOT, 'node_modules/.cache/levelup-native-values/stockfish');
const cases = [
  ...TRIALS.map((row, index) => ({ ...row, variant: `v18-wraith-${index}` })),
  { key: 'queen', variant: 'v18-wraith-ordinary', movement: 'Q' },
  { key: 'quiet', variant: 'v18-wraith-quiet-component', movement: 'QgmQ0' },
  { key: 'backward', variant: 'v18-wraith-backward-diagnostic', movement: 'QgbR' },
  { key: 'forward', variant: 'v18-wraith-forward-diagnostic', movement: 'QgfR' },
  { key: 'backward-component', variant: 'v18-wraith-backward-component', movement: 'gbR' },
  { key: 'forward-component', variant: 'v18-wraith-forward-component', movement: 'gfR' },
  { key: 'rejected', variant: 'v18-wraith-rejected-omni', movement: 'QgQ0' },
];
const trialCases = cases.slice(0, TRIALS.length);
const config = cases.map(row => `[${row.variant}:chess]\ncustomPiece1 = a:${row.movement}\npieceToCharTable = -\n`).join('\n');
const reflect = square => square[0] + (9 - Number(square[1]));
const swap = piece => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase();
const kings = { a2: 'K', h7: 'k' };
const directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const fixtures = new Map(cases.map(row => [row.variant, new Map()]));
let directory, raw, ini;

function fen(pieces, black = false, turn = 'w', rights = '-') {
  const map = new Map(Object.entries(pieces).map(([square, piece]) => black ? [reflect(square), swap(piece)] : [square, piece]));
  return `${placementFromMap(map)} ${black ? turn === 'w' ? 'b' : 'w' : turn} ${rights} - 0 1`;
}
function boardFor(row, position, name) {
  fixtures.get(row.variant).set(position, name);
  return new raw.Board(row.variant, position, false);
}
function allMoves(row, pieces, black = false, name = 'movement') {
  const board = boardFor(row, fen(pieces, black), name);
  try { return board.legalMoves().split(' ').filter(Boolean).sort(); }
  finally { board.delete(); }
}
function canLand(row, pieces, target, black = false, name = 'landing') {
  const s = black ? reflect : square => square;
  return allMoves(row, pieces, black, name).includes(s('d4') + s(target));
}
function offset(dx, dy, distance) {
  const file = 3 + dx * distance, rank = 4 + dy * distance;
  return file >= 0 && file < 8 && rank >= 1 && rank <= 8 ? 'abcdefgh'[file] + rank : null;
}
function hopperCapture(row, dx, dy, after) {
  if (dx === 0) return false;
  if (dy === 0) return row.key !== 'wraith-short-through' || after === 1;
  return row.key === 'wraith-full-diagonal' || after === 1;
}

test.before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v18-wraith-'));
  ini = path.join(directory, 'wraith.ini'); fs.writeFileSync(ini, config);
  const output = path.join(directory, 'raw.cjs');
  await build({ ...rulesBuildOptions(), absWorkingDir: ROOT,
    stdin: { contents: "import Module from 'ffish-es6'; import bytes from 'variant-wasm'; export async function createRaw(config) { const m = await Module({ wasmBinary: Uint8Array.from(atob(bytes), c => c.charCodeAt(0)) }); m.loadVariantConfig(config); return m; }", resolveDir: ROOT, loader: 'js' },
    bundle: true, platform: 'node', format: 'cjs', outfile: output, legalComments: 'none' });
  raw = await require(output).createRaw(config);
});
test.after(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

test('new immutable Wraith identities preserve the playable diagonal-X-ray queen', () => {
  assert.equal(getDesign('queen.purple@7').movement, 'QgB0');
  assert.deepEqual(NEW_DEFINITIONS.map(row => row.movement), ['QgmQ0gcBgcsR0', 'QgmQ0gcsQ', 'QgsQ0gmvR0']);
  for (const row of NEW_DEFINITIONS) {
    assert.ok(Object.isFrozen(row)); assert.ok(Object.isFrozen(row.roles));
    assert.equal(row.level, 3); assert.equal(row.roles.pawn, false);
    assert.equal(wraithProbes(row, 'A', pieces => fen(pieces)).length, 5);
  }
  assert.deepEqual(wraithProbes({ id: 'queen.purple@7' }, 'A', pieces => fen(pieces)), []);
  const allocated = revisionProbes({ definitionsByLetter: { h: NEW_DEFINITIONS[0], z: NEW_DEFINITIONS[1], l: NEW_DEFINITIONS[2], q: getDesign('queen.purple@7') } });
  assert.equal(allocated.length, 30);
  for (const [index, letter] of ['h', 'z', 'l'].entries()) for (const black of [false, true]) {
    const group = allocated.filter(row => row.name.startsWith(NEW_DEFINITIONS[index].id + ': ' + (black ? 'Black' : 'White')));
    assert.equal(group.length, 5);
    for (const row of group) {
      assert.equal(row.fen.split(' ')[1], black ? 'b' : 'w');
      assert.ok(row.fen.split(' ')[0].includes(black ? letter : letter.toUpperCase()));
    }
  }
  assert.deepEqual(revisionProbes({ definitionsByLetter: {} }), []);
});

test('all ordinary queen moves and captures remain unchanged without a hurdle', () => {
  const ordinary = cases.find(row => row.key === 'queen');
  for (const black of [false, true]) {
    const pieces = { ...kings, d4: 'A' };
    const baseline = allMoves(ordinary, pieces, black, 'ordinary clear queen');
    for (const row of trialCases) assert.deepEqual(allMoves(row, pieces, black, 'clear queen'), baseline);
    for (const [dx, dy] of directions) {
      const target = offset(dx, dy, 2), occupied = { ...pieces, [target]: 'p' };
      // The enemy piece is also a possible hurdle: new quiet destinations
      // beyond it are expected, but the ordinary first capture must survive.
      for (const row of trialCases) assert.equal(canLand(row, occupied, target, black, 'ordinary first capture'), true);
    }
  }
});

test('all Wraiths hop quietly across one friendly or enemy hurdle along every queen ray', () => {
  for (const row of trialCases) for (const black of [false, true]) for (const [dx, dy] of directions) {
    for (const hurdleDistance of [1, 2]) for (const after of [1, 2, 3]) {
      const hurdle = offset(dx, dy, hurdleDistance), target = offset(dx, dy, hurdleDistance + after);
      if (!target) continue;
      for (const occupant of ['N', 'p']) {
        const pieces = { ...kings, d4: 'A', [hurdle]: occupant };
        assert.equal(canLand(row, pieces, target, black, 'quiet single hurdle'), true,
          `${row.movement}: ${hurdle} -> ${target}, ${occupant}, ${black}`);
      }
    }
  }
});

test('hopper captures distinguish short or long diagonals and sideways rays, while vertical captures stay excluded', () => {
  for (const row of trialCases) for (const black of [false, true]) for (const [dx, dy] of directions) {
    for (const hurdleDistance of [1, 2]) for (const after of [1, 2, 3]) {
      const hurdle = offset(dx, dy, hurdleDistance), target = offset(dx, dy, hurdleDistance + after);
      if (!target) continue;
      const expected = hopperCapture(row, dx, dy, after);
      for (const occupant of ['N', 'p']) {
        const pieces = { ...kings, d4: 'A', [hurdle]: occupant, [target]: 'p' };
        assert.equal(canLand(row, pieces, target, black, 'hopper capture limits'), expected,
          `${row.movement}: ${hurdle} -> ${target}, ${occupant}, ${black}`);
      }
    }
  }
});

test('a second blocker stops both quiet and capture hops and friendly pieces cannot be captured', () => {
  for (const row of trialCases) for (const black of [false, true]) for (const [dx, dy] of directions) {
    const first = offset(dx, dy, 1), second = offset(dx, dy, 2), target = offset(dx, dy, 3);
    if (!target) continue;
    for (const occupant of ['N', 'p']) for (const targetPiece of [null, 'p']) {
      const pieces = { ...kings, d4: 'A', [first]: 'N', [second]: occupant, ...(targetPiece ? { [target]: targetPiece } : {}) };
      assert.equal(canLand(row, pieces, target, black, 'second blocker stops hopper'), false);
    }
    assert.equal(canLand(row, { ...kings, d4: 'A', [first]: 'N', [second]: 'N' }, second, black, 'friendly landing excluded'), false);
  }
});

test('capture geometry alone gives check; quiet hopper movement never becomes a checking attack', () => {
  for (const row of [...trialCases, cases.find(item => item.key === 'quiet')]) for (const black of [false, true]) {
    for (const [dx, dy] of directions) for (const after of [1, 2, 3]) {
      const hurdle = offset(dx, dy, 1), target = offset(dx, dy, 1 + after);
      if (!target) continue;
      const ownKing = ['a8', 'h8', 'a1', 'h1'].find(square => square !== target && square !== hurdle
        && Math.max(Math.abs(square.charCodeAt(0) - target.charCodeAt(0)), Math.abs(Number(square[1]) - Number(target[1]))) > 1);
      // Knights do not attack the tested king squares; a pawn hurdle would
      // itself attack the immediately following diagonal square.
      const board = boardFor(row, fen({ [ownKing]: 'K', [target]: 'k', d4: 'A', [hurdle]: 'N' }, black, 'b'), 'checking modality');
      try { assert.equal(board.isCheck(), row.key === 'quiet' ? false : hopperCapture(row, dx, dy, after),
        `${row.movement}: king ${target}, hurdle ${hurdle}, ${black}`); }
      finally { board.delete(); }
    }
  }
});

test('diagnostic b/f hopper bug makes queen compounds hop and check both vertical directions', () => {
  for (const key of ['backward', 'forward']) {
    const row = cases.find(item => item.key === key);
    const component = cases.find(item => item.key === key + '-component');
    for (const black of [false, true]) for (const [target, hurdle, forward] of [['d6', 'd5', true], ['d2', 'd3', false]]) {
      assert.equal(canLand(component, { ...kings, d4: 'A', [hurdle]: 'N' }, target, black, 'plain directional component'), key === 'forward' ? forward : !forward);
      assert.equal(canLand(row, { ...kings, d4: 'A', [hurdle]: 'N' }, target, black, 'compound directional mover diagnostic'), true);
      const board = boardFor(row, fen({ a8: 'K', [target]: 'k', d4: 'A', [hurdle]: 'N', h1: 'r' }, black, 'b'), 'directional checking diagnostic');
      try { assert.equal(board.isCheck(), true, 'Pinned engine limitation: both directions are treated as attacks.'); }
      finally { board.delete(); }
    }
  }
});

function mateInTwo(board) {
  for (const first of board.legalMoves().split(' ').filter(Boolean)) {
    assert.ok(board.push(first));
    const replies = board.legalMoves().split(' ').filter(Boolean);
    if (!replies.length && board.isCheck()) { board.pop(); return first; }
    let forced = replies.length > 0;
    for (const reply of replies) {
      assert.ok(board.push(reply));
      let matingReply = false;
      for (const finish of board.legalMoves().split(' ').filter(Boolean)) {
        assert.ok(board.push(finish));
        matingReply = board.isCheck() && board.numberLegalMoves() === 0;
        board.pop(); if (matingReply) break;
      }
      board.pop(); if (!matingReply) { forced = false; break; }
    }
    board.pop(); if (forced) return first;
  }
  return null;
}

test('no Wraith trial restores the rejected opening mate-in-two, with the old omni queen as a positive control', () => {
  const start = { a1: 'R', b1: 'N', c1: 'B', d1: 'A', e1: 'K', f1: 'B', g1: 'N', h1: 'R',
    a8: 'r', b8: 'n', c8: 'b', d8: 'q', e8: 'k', f8: 'b', g8: 'n', h8: 'r' };
  for (const file of 'abcdefgh') { start[file + '2'] = 'P'; start[file + '7'] = 'p'; }
  for (const row of [...trialCases, cases.find(item => item.key === 'rejected')]) for (const black of [false, true]) {
    const board = boardFor(row, fen(start, black, 'w', 'KQkq'), 'opening-mate gate');
    try {
      assert.equal(mateInTwo(board) !== null, row.key === 'rejected', row.movement);
      const s = black ? reflect : square => square;
      assert.ok(board.push(s('d1') + s('h5')));
      fixtures.get(row.variant).set(board.fen(), 'Qh5 checking route');
      assert.equal(board.isCheck(), true);
      assert.deepEqual(board.legalMoves().split(' ').filter(Boolean), [s('g7') + s('g6')]);
      assert.ok(board.push(s('g7') + s('g6')));
      fixtures.get(row.variant).set(board.fen(), 'forced g6 reply');
      assert.ok(board.push(s('h5') + s('e5')));
      fixtures.get(row.variant).set(board.fen(), 'Qe5 opening-mate gate');
      assert.equal(board.isCheck(), row.key === 'rejected', 'No candidate attacks vertically through e7.');
      assert.equal(board.numberLegalMoves() === 0, row.key === 'rejected');
    }
    finally { board.delete(); }
  }
});

test('native and browser engines agree on Wraith movement, capture limits, checks and directional diagnostics',
  { skip: !fs.existsSync(nativePath), timeout: 180000 }, async t => {
    let count = 0;
    for (const row of cases) {
      const engine = new UciEngine({ path: nativePath, variantPath: ini, variant: row.variant, options: { threads: 1, hash: 16 } });
      t.after(() => engine.close()); await engine.start();
      for (const [position, name] of fixtures.get(row.variant)) {
        const board = new raw.Board(row.variant, position, false);
        try { assert.deepEqual(await engine.perft({ fen: position }), board.legalMoves().split(' ').filter(Boolean).sort(), row.movement + ': ' + name); }
        finally { board.delete(); }
        count++;
      }
      await engine.close();
    }
    t.diagnostic(`${count} native/browser position comparisons. No searches or scored games.`);
  });
