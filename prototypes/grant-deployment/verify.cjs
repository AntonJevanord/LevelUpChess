'use strict';

// Isolated rules verification, not a game collector or balance experiment.
// Load a private WASM instance so active playable/research modules are intact.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { UciEngine } = require('../../scripts/balance/uci');
const { pieceMap } = require('../../src/profile-fen');

const ROOT = path.resolve(__dirname, '../..');
const CONFIG = path.join(__dirname, 'variants.ini');
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--engine')) throw new Error('Use node prototypes/grant-deployment/verify.cjs [--engine PATH].');
const enginePath = path.resolve(args[1] || process.env.FAIRY_STOCKFISH_PATH || (process.platform === 'win32'
  ? path.join(ROOT, 'stockfish/fairy-stockfish-levelup_x86-64.exe')
  : path.join(ROOT, 'node_modules/.cache/levelup-native-values/stockfish')));

// Prototype parser keeps complete gate notation, including any gate-square
// suffix. Production move/PGN adapters require a separate gating integration.
class PrototypeEngine extends UciEngine {
  async perft({ fen } = {}) {
    return this._run(undefined, async () => {
      this._requireReady();
      const moves = new Set(); let ready = false, complete = false;
      return this._exchange([`position fen ${fen}`, 'go perft 1', 'isready'], (line, done) => {
        const row = line.match(/^([^\s:]+):\s+1$/);
        if (row) moves.add(row[1]);
        if (/^Nodes searched:\s*\d+$/.test(line)) complete = true;
        if (line === 'readyok') ready = true;
        if (ready && complete) done([...moves].sort());
      });
    });
  }
}

async function main() {
  const file = require.resolve('ffish-es6'), source = fs.readFileSync(file);
  const { default: Module } = await import('data:text/javascript;base64,' + source.toString('base64'));
  const wasm = await Module({ wasmBinary: fs.readFileSync(path.join(path.dirname(file), 'ffish.wasm')) });
  wasm.loadVariantConfig(fs.readFileSync(CONFIG, 'utf8'));
  const variants = wasm.variants().split(' ');
  assert.ok(variants.includes('grant-rank-two')); assert.ok(variants.includes('grant-development-gates'));
  let cases = 0;
  for (const variant of ['grant-rank-two', 'grant-rank-two-mandatory', 'grant-development-gates']) {
    const engine = new PrototypeEngine({ path: enginePath, variantPath: CONFIG, variant, options: { skill: 20, threads: 1, hash: 16 } });
    await engine.start();
    async function parity(board, label) {
      const moves = board.legalMoves().split(' ').filter(Boolean).sort();
      const native = await engine.perft({ fen: board.fen() });
      assert.deepEqual(native, moves, label + ': native/WASM legal-move parity');
      return moves;
    }
    async function position(label, fen, verify) {
      const board = new wasm.Board(variant, fen, false);
      try {
        const moves = await parity(board, label);
        await verify(board, moves); cases++;
        console.log(`${variant}: ${label} passed (${moves.length} legal moves).`);
      } finally { board.delete(); }
    }
    try {
      if (variant === 'grant-rank-two') {
        await position('occupied pawn rank prevents initial deployment', '', async (board, moves) => {
          assert.ok(!moves.some(move => move.includes('@')));
          assert.ok(board.push('e2e4')); assert.ok(board.push('e7e5'));
          await parity(board, 'after opening pawn moves');
          assert.ok(board.legalMoves().split(' ').includes('D@e2'));
          assert.ok(board.push('D@e2')); assert.equal(board.turn(), false);
          assert.equal(pieceMap(board.fen()).get('e2'), 'D'); assert.ok(!board.fen().split(' ')[0].match(/\[[^\]]*D/));
        });
        for (const [side, rank] of [['w', '2'], ['b', '7']]) {
          await position(`${side} can use only its own second rank`, `4k3/8/8/8/8/8/8/4K3[ACDacd] ${side} - - 0 1`, (_board, moves) => {
            const drops = moves.filter(move => move.includes('@'));
            assert.equal(drops.length, 24); assert.ok(drops.every(move => move.endsWith(rank)));
          });
        }
        await position('checking drops are forbidden', '8/8/8/8/8/3k4/8/7K[ACD] w - - 0 1', (_board, moves) => {
          assert.ok(!moves.includes('A@d2')); assert.ok(!moves.includes('C@c2')); assert.ok(!moves.includes('D@d2'));
          assert.ok(moves.includes('D@e2'));
        });
        await position('ordinary castling survives', 'r3k2r/8/8/8/8/8/8/R3K2R[Dd] w KQkq - 0 1', (_board, moves) => {
          assert.ok(moves.includes('e1g1')); assert.ok(moves.includes('e1c1'));
        });
        await position('captured guards disappear instead of refilling pockets', '4k3/8/8/8/8/4r3/4D3/4K3[] b - - 0 1', (board, moves) => {
          assert.ok(moves.includes('e3e2')); assert.ok(board.push('e3e2'));
          assert.ok(!/[dD]/.test(board.fen().split(' ')[0])); assert.match(board.fen(), /\[\]/);
          assert.match(board.fen(), /4K3/); assert.equal(board.isCheck(), true);
        });
      } else if (variant === 'grant-rank-two-mandatory') {
        await position('a legal second-rank vacancy forces a separate deployment turn', '', async (board, moves) => {
          assert.equal(moves.length, 20); assert.ok(!moves.some(move => move.includes('@')));
          assert.ok(board.push('e2e4')); assert.ok(board.push('e7e5'));
          assert.deepEqual(await parity(board, 'after e4 e5'), ['D@e2']);
          assert.ok(!board.legalMoves().split(' ').includes('g1f3'));
          assert.ok(board.push('D@e2')); assert.equal(board.turn(), false);
        });
        await position('check evasion remains possible when no legal drop exists', '4k3/8/8/8/8/8/8/r6K[D] w - - 0 1', (_board, moves) => {
          assert.ok(moves.length > 0); assert.ok(moves.every(move => move.startsWith('h1') && !move.includes('@')));
        });
      } else {
        await position('development can insert a guard in the same turn', '', async (board, moves) => {
          assert.ok(moves.includes('b1c3')); assert.ok(moves.includes('b1c3d'));
          assert.ok(!moves.some(move => move.includes('@')));
          assert.ok(board.push('b1c3d')); assert.equal(board.turn(), false);
          assert.match(board.fen(), /RD/); assert.match(board.fen(), /2N5/);
          assert.ok(!board.fen().split(' ')[0].match(/\[[^\]]*D/));
          await parity(board, 'after same-turn development/gate');
        });
        await position('declining a gate forfeits it permanently', '', async (board) => {
          for (const move of ['b1c3', 'g8f6', 'c3b1', 'f6g8']) assert.ok(board.push(move));
          assert.ok(board.legalMoves().split(' ').includes('b1c3'));
          assert.ok(!board.legalMoves().split(' ').includes('b1c3d'));
          await parity(board, 'after declined gate and return');
        });
        await position('dropChecks=false still permits a checking gate', '8/8/8/8/8/8/8/1N1k3K[D] w B - 0 1', (board, moves) => {
          assert.ok(moves.includes('b1a3d')); assert.ok(board.push('b1a3d')); assert.equal(board.isCheck(), true);
        });
        await position('ordinary and gated castling remain available', 'r3k2r/8/8/8/8/8/8/R3K2R[Dd] w KQkq - 0 1', (_board, moves) => {
          assert.ok(moves.includes('e1g1')); assert.ok(moves.includes('e1c1'));
          assert.ok(moves.some(move => move.startsWith('e1g1d')));
          assert.ok(moves.some(move => move.startsWith('h1e1d')));
        });
      }
    } finally { await engine.close(); }
  }
  console.log(`${cases} native/private-WASM deployment fixtures passed. No games or live profiles changed.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
