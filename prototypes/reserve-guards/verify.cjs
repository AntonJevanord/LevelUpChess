#!/usr/bin/env node
'use strict';

// Opt-in rules proof. This isolated loader/protocol does not alter the active
// game's move parser, generated bundles, or frozen experiment identities.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { build } = require('esbuild');
const { rulesBuildOptions } = require('../../scripts/rules-build');
const { UciEngine } = require('../../scripts/balance/uci');

const ROOT = path.resolve(__dirname, '../..');
const CONFIG_FILE = path.join(__dirname, 'variants.ini');
const VARIANT = 'reserve-guards';
const NO_CHECK = 'reserve-guards-no-check';
const MOVE = /^(?:[a-h][1-8][a-h][1-8][a-z]?|[A-Z]@[a-h][1-8])$/;
const sha = value => createHash('sha256').update(value).digest('hex');
const sorted = values => [...values].sort();
const movesOf = board => board.legalMoves().split(' ').filter(Boolean);
const pieces = { a: 'fW', c: 'F', d: 'W2', e: 'K', f: 'KmN', g: 'K2' };

function position(piecesOnBoard, pocket = '', turn = 'w', rights = '-', ep = '-', halfmove = 0) {
  const placement = Array.from({ length: 8 }, (_, row) => {
    let rank = '', empty = 0;
    for (const file of 'abcdefgh') {
      const piece = piecesOnBoard[file + (8 - row)];
      if (!piece) { empty++; continue; }
      if (empty) rank += empty;
      empty = 0; rank += piece;
    }
    return rank + (empty || '');
  }).join('/');
  return `${placement}[${pocket}] ${turn} ${rights} ${ep} ${halfmove} 1`;
}
const swapCase = value => value.replace(/[a-z]/gi, piece => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase());
const mirrorSquare = square => square[0] + (9 - Number(square[1]));
function mirrorMove(move) {
  return move.includes('@') ? `${move[0]}@${mirrorSquare(move.slice(2))}`
    : mirrorSquare(move.slice(0, 2)) + mirrorSquare(move.slice(2, 4)) + move.slice(4);
}
function mirrorFen(fen) {
  const fields = fen.split(' '), [placement, hand] = fields[0].split('[');
  fields[0] = swapCase(placement.split('/').reverse().join('/')) + '[' + swapCase(hand);
  fields[1] = fields[1] === 'w' ? 'b' : 'w';
  const rights = swapCase(fields[2]);
  fields[2] = [...'KQkq'].filter(piece => rights.includes(piece)).join('') || '-';
  if (fields[3] !== '-') fields[3] = mirrorSquare(fields[3]);
  return fields.join(' ');
}

function fixtures() {
  const cases = [];
  const add = (name, fen, expected = {}, variant = VARIANT) => cases.push({ name, fen, variant, ...expected });
  const center = { a1: 'K', h8: 'k' };
  const steps = [[-1, 0], [1, 0], [0, -1], [0, 1]], diagonals = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const knight = [[-2, -1], [-2, 1], [2, -1], [2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2]];
  const destinations = vectors => vectors.map(([dx, dy]) => String.fromCharCode('d'.charCodeAt(0) + dx) + (4 + dy));
  const guardVectors = {
    a: [[0, 1]], c: diagonals,
    d: [...steps, ...steps.map(([x, y]) => [2 * x, 2 * y])],
    e: [...steps, ...diagonals], f: [...steps, ...diagonals, ...knight],
    g: [...steps, ...diagonals, ...[...steps, ...diagonals].map(([x, y]) => [2 * x, 2 * y])],
  };
  for (const [type, movement] of Object.entries(pieces)) {
    add(`${type.toUpperCase()}: ${movement} exact empty-board destinations`, position({ ...center, d4: type.toUpperCase() }),
      { pieceFrom: 'd4', pieceMoves: destinations(guardVectors[type]).map(square => 'd4' + square) });
  }
  add('forward step captures forward, never diagonal or backward', position({ ...center, d4: 'A', d5: 'p', c5: 'p', e5: 'p', d3: 'p' }),
    { pieceFrom: 'd4', pieceMoves: ['d4d5'] });
  add('orthogonal two-square slides cannot cross a blocker', position({ ...center, d4: 'D', e4: 'P', d5: 'p' }),
    { required: ['d4d5', 'd4b4', 'd4d2'], forbidden: ['d4e4', 'd4f4', 'd4d6'] });
  add('queen-like two-square slides cannot cross a diagonal blocker', position({ ...center, d4: 'G', e5: 'P', c5: 'p' }),
    { required: ['d4c5', 'd4f4', 'd4d6'], forbidden: ['d4e5', 'd4f6', 'd4b6', 'd4g7'] });
  add('quiet knight jumps cross blockers', position({ ...center, d4: 'F', e4: 'P', d5: 'P' }),
    { required: ['d4f5', 'd4e6'], forbidden: ['d4e4', 'd4d5'] });
  add('quiet knight jumps cannot capture, adjacent king steps can', position({ ...center, d4: 'F', f5: 'p', e6: 'p', e5: 'p' }),
    { required: ['d4e5', 'd4b5'], forbidden: ['d4f5', 'd4e6'] });
  add('commoner may move onto an attacked square', position({ ...center, d4: 'E', e8: 'r' }),
    { required: ['d4e4'], checked: false });
  add('attacked commoner does not check the royal king', position({ ...center, d4: 'E', d8: 'r' }),
    { required: ['d4e4'], checked: false });
  add('only the held type can be dropped; own-half empty targets only', position(center, 'E'),
    { required: ['E@b1', 'E@d4'], forbidden: ['E@a1', 'E@d5', 'E@h8', 'F@d4', 'G@d4'], dropTypes: ['E'] });
  add('drops cannot capture an occupied enemy square', position({ ...center, d4: 'p' }, 'E'),
    { required: ['E@c4'], forbidden: ['E@d4'] });
  add('a nonroyal guard can be dropped onto an attacked square', position({ ...center, d8: 'r' }, 'E'),
    { required: ['E@d4'], checked: false });
  add('ordinary kings retain both castles while a guard is held', position({ e1: 'K', a1: 'R', h1: 'R', e8: 'k' }, 'E', 'w', 'KQ'),
    { required: ['e1g1', 'e1c1'] });
  add('ordinary castling still cannot cross attack', position({ e1: 'K', a1: 'R', h1: 'R', b8: 'k', f8: 'r' }, 'E', 'w', 'KQ'),
    { required: ['e1c1'], forbidden: ['e1g1'] });
  add('a held guard can interpose a sliding check', position({ h1: 'K', f3: 'k', h8: 'r', g8: 'r' }, 'A'),
    { exactMoves: ['A@h2', 'A@h3', 'A@h4'], checked: true, forcedDrop: true });
  add('drops cannot answer two simultaneous checking lines', position({ h1: 'K', a8: 'k', h8: 'r', e4: 'b' }, 'E'),
    { checked: true, dropCount: 0 });
  add('adjacent queen mate remains mate even with a reserve', position({ f6: 'K', g7: 'Q', h8: 'k' }, 'e', 'b'),
    { exactMoves: [], checked: true, result: '1-0' });
  add('checking drop is permitted by the default policy', position({ a1: 'K', h5: 'k' }, 'E'),
    { required: ['E@g4', 'E@c3'] });
  add('no-check policy forbids only checking deployment', position({ a1: 'K', h5: 'k' }, 'E'),
    { required: ['E@c3'], forbidden: ['E@g4'] }, NO_CHECK);
  add('a reserve prevents a premature bare-kings draw', position(center, 'E'),
    { insufficient: false, result: '*' });
  add('empty reserves and bare kings draw', position(center),
    { insufficient: true, result: '1/2-1/2', dropCount: 0 });
  add('ordinary pawn promotion remains QRBN', position({ a1: 'K', h8: 'k', e7: 'P' }, 'E'),
    { required: ['e7e8q', 'e7e8r', 'e7e8b', 'e7e8n'], forbidden: ['e7e8a', 'e7e8e', 'e7e8g'] });
  add('forward-step guard is not automatically a promoting pawn', position({ a1: 'K', h8: 'k', e7: 'A' }),
    { required: ['e7e8'], forbidden: ['e7e8q', 'e7e8r', 'e7e8b', 'e7e8n'] });
  add('ordinary en passant remains legal alongside reserves', position({ e1: 'K', e8: 'k', g5: 'P', h5: 'p' }, 'Ee', 'w', '-', 'h6'),
    { required: ['g5h6'] });
  return cases.flatMap(entry => [entry, {
    ...entry, name: entry.name + ' (Black/White mirrored)', fen: mirrorFen(entry.fen),
    pieceFrom: entry.pieceFrom && mirrorSquare(entry.pieceFrom),
    ...Object.fromEntries(['pieceMoves', 'required', 'forbidden', 'exactMoves'].filter(key => entry[key]).map(key => [key, entry[key].map(mirrorMove)])),
    result: entry.result === '1-0' ? '0-1' : entry.result === '0-1' ? '1-0' : entry.result,
  }]);
}

async function loadRules(directory) {
  const outfile = path.join(directory, 'rules.cjs');
  await build({ ...rulesBuildOptions(), absWorkingDir: ROOT,
    stdin: { contents: "import Module from 'ffish-es6'; import wasm from 'variant-wasm'; export default () => Module({wasmBinary: Uint8Array.from(Buffer.from(wasm, 'base64'))});", resolveDir: ROOT, sourcefile: 'reserve-proof-loader.js' },
    bundle: true, platform: 'node', format: 'cjs', outfile, legalComments: 'eof' });
  const loaded = await require(outfile).default();
  loaded.loadVariantConfig(fs.readFileSync(CONFIG_FILE, 'utf8'));
  return loaded;
}

function checkFixture(module, entry) {
  const board = new module.Board(entry.variant, entry.fen);
  try {
    const moves = movesOf(board), drops = moves.filter(move => move.includes('@'));
    for (const move of entry.required || []) assert.ok(moves.includes(move), `${entry.name}: missing ${move}`);
    for (const move of entry.forbidden || []) assert.ok(!moves.includes(move), `${entry.name}: forbidden ${move}`);
    if (entry.exactMoves) assert.deepEqual(sorted(moves), sorted(entry.exactMoves), entry.name);
    if (entry.pieceFrom) assert.deepEqual(sorted(moves.filter(move => move.startsWith(entry.pieceFrom))), sorted(entry.pieceMoves), entry.name);
    if (entry.checked !== undefined) assert.equal(board.isCheck(), entry.checked, entry.name);
    if (entry.insufficient !== undefined) assert.equal(board.isInsufficientMaterial(), entry.insufficient, entry.name);
    if (entry.result !== undefined) assert.equal(board.result(), entry.result, entry.name);
    if (entry.dropCount !== undefined) assert.equal(drops.length, entry.dropCount, entry.name);
    if (entry.dropTypes) assert.deepEqual(sorted(new Set(drops.map(move => move[0]))), sorted(entry.dropTypes), entry.name);
    const clone = new module.Board(entry.variant, board.fen());
    try { assert.deepEqual(sorted(movesOf(clone)), sorted(moves), `${entry.name}: FEN round trip`); }
    finally { clone.delete(); }
    return moves;
  } finally { board.delete(); }
}

function stateChecks(module) {
  let checks = 0;
  const use = (fen, callback, variant = VARIANT) => {
    const board = fen ? new module.Board(variant, fen) : new module.Board(variant);
    try { callback(board); checks++; } finally { board.delete(); }
  };
  use(null, board => {
    const moves = movesOf(board), normal = moves.filter(move => !move.includes('@')), drops = moves.filter(move => move.includes('@'));
    assert.equal(normal.length, 20); assert.equal(drops.length, 32);
    assert.equal(board.pocket(true).split('').sort().join(''), 'fg');
    assert.equal(board.pocket(false).split('').sort().join(''), 'acde');
    assert.ok(drops.every(move => /^[FG]@[a-h][34]$/.test(move)));
    const before = board.fen(), san = board.sanMove('F@a3');
    assert.ok(san.includes('@')); assert.equal(board.push('F@a3'), true);
    assert.equal(board.pocket(true), 'g'); assert.equal(movesOf(board).filter(move => move.startsWith('F@')).length, 0);
    assert.equal(board.push('a7a6'), true); assert.equal(movesOf(board).some(move => move.startsWith('F@')), false);
    assert.ok(movesOf(board).some(move => move.startsWith('G@')));
    board.pop(); board.pop(); assert.equal(board.fen(), before);
    assert.equal(board.pushSan(san), true); board.pop(); assert.equal(board.fen(), before);
  });
  use(module.startingFen(VARIANT).replace(' w ', ' b '), board => {
    const moves = movesOf(board); assert.equal(moves.filter(move => !move.includes('@')).length, 20);
    const drops = moves.filter(move => move.includes('@')); assert.equal(drops.length, 64);
    assert.ok(drops.every(move => /^[ACDE]@[a-h][56]$/.test(move)));
  });
  for (const mirrored of [false, true]) {
    const mapped = fen => mirrored ? mirrorFen(fen) : fen;
    const move = uci => mirrored ? mirrorMove(uci) : uci;
    const own = !mirrored;
    use(mapped(position({ a1: 'K', h8: 'k', d8: 'r' }, 'E')), board => {
      assert.equal(board.push(move('E@d4')), true); assert.equal(board.pocket(own), '');
      assert.equal(board.push(move('d8d4')), true);
      assert.equal(board.pocket(true), ''); assert.equal(board.pocket(false), '');
      assert.ok(!board.fen().split(' ')[0].replace(/\[.*$/, '').includes(mirrored ? 'e' : 'E'));
      assert.equal(movesOf(board).some(uci => uci.includes('@')), false);
    });
    use(mapped(position({ a1: 'K', h8: 'k', d4: 'R', d6: 'n' }, 'E')), board => {
      assert.equal(board.push(move('d4d6')), true); assert.equal(board.pocket(own), 'e');
      assert.equal(board.pocket(!own), '');
    });
    use(mapped(position({ a1: 'K', h8: 'k' }, 'E', 'w', '-', '-', 99)), board => {
      const before = board.fen(); assert.equal(board.push(move('E@c3')), true);
      assert.equal(board.halfmoveClock(), 0); board.pop(); assert.equal(board.fen(), before);
    });
    use(mapped(position({ e1: 'K', a1: 'R', h1: 'R', e8: 'k' }, 'E', 'w', 'KQ')), board => {
      const before = board.fen(), pocket = board.pocket(own);
      assert.equal(board.push(move('e1g1')), true);
      assert.equal(board.fen().split(' ')[2], '-'); assert.equal(board.pocket(own), pocket);
      board.pop(); assert.equal(board.fen(), before);
    });
    use(mapped(position({ f3: 'K', h1: 'k' }, 'E')), board => {
      assert.equal(board.push(move('E@g2')), true); assert.equal(board.isCheck(), true);
      assert.equal(movesOf(board).length, 0); assert.equal(board.result(), mirrored ? '0-1' : '1-0');
    });
    use(mapped(position({ f3: 'K', h1: 'k' }, 'E')), board => {
      assert.equal(movesOf(board).includes(move('E@g2')), false);
    }, NO_CHECK);
    use(mapped(position({ e1: 'K', e8: 'k', g5: 'P', h5: 'p' }, 'Ee', 'w', '-', 'h6')), board => {
      const pockets = [board.pocket(true), board.pocket(false)];
      assert.equal(board.push(move('g5h6')), true);
      assert.deepEqual([board.pocket(true), board.pocket(false)], pockets);
      assert.ok(!board.fen().split(' ')[0].includes(mirrored ? 'P' : 'p'));
    });
    use(mapped(position({ a1: 'K', h8: 'k', e7: 'A' })), board => {
      assert.equal(board.push(move('e7e8')), true);
      assert.ok(board.fen().split(' ')[0].includes(mirrored ? 'a' : 'A'));
      assert.equal(board.push(move('h8h7')), true);
      const from = mirrored ? 'e1' : 'e8';
      assert.equal(movesOf(board).some(uci => uci.startsWith(from)), false);
    });
  }
  return checks;
}

async function nativeMoves(engine, fen) {
  return engine._run(undefined, () => {
    const moves = []; let ready = false, complete = false;
    return engine._exchange([`position fen ${fen}`, 'go perft 1', 'isready'], (line, done) => {
      const match = line.match(/^([^\s:]+):\s+1$/);
      if (match && MOVE.test(match[1])) moves.push(match[1]);
      if (/^Nodes searched:\s*\d+$/.test(line)) complete = true;
      if (line === 'readyok') ready = true;
      if (ready && complete) done(sorted(moves));
    });
  });
}
async function nativeSearch(engine, fen, moves = []) {
  assert.ok(moves.every(move => MOVE.test(move)));
  return engine._run(undefined, () => engine._exchange([
    `position fen ${fen}${moves.length ? ' moves ' + moves.join(' ') : ''}`, 'go nodes 1000',
  ], (line, done) => {
    if (!line.startsWith('bestmove ')) return;
    const move = line.split(/\s+/)[1];
    assert.ok(MOVE.test(move || ''), `Unexpected native bestmove: ${line}`); done(move);
  }));
}
function selectedEngine() {
  if (process.env.FAIRY_STOCKFISH_PATH) {
    const file = path.resolve(process.env.FAIRY_STOCKFISH_PATH);
    if (!fs.existsSync(file)) throw new Error('FAIRY_STOCKFISH_PATH does not point to an existing engine.');
    return file;
  }
  const file = process.platform === 'win32'
    ? path.join(ROOT, 'stockfish/fairy-stockfish-levelup_x86-64.exe')
    : path.join(ROOT, 'node_modules/.cache/levelup-native-values/stockfish');
  return fs.existsSync(file) ? file : null;
}

async function verify() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--out' || !args[1])) throw new Error('Usage: node prototypes/reserve-guards/verify.cjs [--out NEW-JSON-PATH]');
  const enginePath = selectedEngine();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-reserve-proof-'));
  const report = { schemaVersion: 1, id: 'reserve-guards-functional-001', date: '2026-10-25',
    scope: 'Isolated movement/drop/adjudication checks and up to six bounded native searches; no balance games.',
    rulesSha256: sha(fs.readFileSync(CONFIG_FILE)), verifierSha256: sha(fs.readFileSync(__filename)),
    browserRulesVersion: 'ffish-es6 0.7.10', browserFixtures: 0, stateChecks: 0, nativePositions: 0,
    nativeSearches: 0, completedBalanceGames: 0, failures: 0,
    interpretation: 'Functional evidence only. Ordinary royal kings remain distinct from capturable reserve guards; no material balance or general forced-mate claim follows.' };
  const engines = new Map();
  try {
    const module = await loadRules(directory), cases = fixtures();
    const expected = cases.map(entry => { const moves = checkFixture(module, entry); report.browserFixtures++; return moves; });
    report.stateChecks = stateChecks(module);
    console.log(`Browser rules: ${report.browserFixtures} mirrored fixtures and ${report.stateChecks} state/round-trip checks passed.`);
    if (enginePath) {
      for (const variant of [VARIANT, NO_CHECK]) {
        const engine = new UciEngine({ path: enginePath, variantPath: CONFIG_FILE, variant,
          options: { skill: 20, threads: 1, hash: 16 } });
        engines.set(variant, engine); await engine.start();
      }
      report.nativeEngine = { name: engines.get(VARIANT).metadata.idname,
        file: path.basename(enginePath), platform: process.platform, sha256: sha(fs.readFileSync(enginePath)) };
      for (let index = 0; index < cases.length; index++) {
        const entry = cases[index], moves = await nativeMoves(engines.get(entry.variant), entry.fen);
        assert.deepEqual(moves, sorted(expected[index]), `Native/browser mismatch: ${entry.name}`); report.nativePositions++;
      }
      const initial = new module.Board(VARIANT);
      try {
        for (const fen of [initial.fen(), initial.fen().replace(' w ', ' b ')]) {
          const board = new module.Board(VARIANT, fen);
          try { assert.deepEqual(await nativeMoves(engines.get(VARIANT), fen), sorted(movesOf(board))); report.nativePositions++; }
          finally { board.delete(); }
        }
      } finally { initial.delete(); }
      for (const entry of cases.filter(entry => entry.forcedDrop)) {
        const board = new module.Board(entry.variant, entry.fen), history = [], engine = engines.get(entry.variant);
        try {
          await engine.newGame();
          for (let ply = 0; ply < 3; ply++) {
            const move = await nativeSearch(engine, entry.fen, history); report.nativeSearches++;
            if (!ply) assert.ok(move.includes('@'), 'Forced blocking drop was not selected.');
            assert.ok(movesOf(board).includes(move), `${entry.name}: illegal native ${move}`);
            assert.equal(board.push(move), true); history.push(move);
          }
        } finally { board.delete(); }
      }
      console.log(`Native rules: ${report.nativePositions} exact legal-move comparisons and ${report.nativeSearches} bounded searches passed.`);
    } else {
      report.nativeSkipped = 'No native engine found; set FAIRY_STOCKFISH_PATH to enable native checks.';
      console.log(report.nativeSkipped);
    }
  } finally {
    await Promise.allSettled([...engines.values()].map(engine => engine.close()));
    fs.rmSync(directory, { recursive: true, force: true });
  }
  if (args[1]) {
    const file = path.resolve(args[1]); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    console.log(`Proof saved: ${file}`);
  }
  return report;
}

if (require.main === module) verify().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { fixtures, stateChecks, nativeMoves, nativeSearch, verify };
