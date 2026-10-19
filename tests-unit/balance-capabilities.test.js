const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checkCapabilities } = require('../scripts/balance/capabilities');
const { capabilityProbes } = require('../scripts/engine-capabilities');

const START = 'k7/8/8/8/8/8/ACDLMOS1/7K w - - 0 1';
const expected = ['a1a2', 'a1b1'];

function fixture({ royalMode = 'king', nativeMoves = expected } = {}) {
  const boards = [], requests = [];
  const rules = {
    variant: 'test-profile', royalMode,
    createBoard(fen) {
      const board = { fen, disposed: false, moves: () => [...expected], dispose() { this.disposed = true; } };
      boards.push(board);
      return board;
    },
  };
  const engine = { async perft(request) { requests.push(request); return [...nativeMoves]; } };
  return { rules, engine, boards, requests };
}

test('unions only relevant family probes, deduplicates starts, and checks full move sets', async () => {
  const fake = fixture({ nativeMoves: [...expected].reverse() });
  const result = await checkCapabilities({ ...fake, startFens: [START, START], whiteKing: 0, blackKing: 0 });
  const count = new Set(capabilityProbes(START, 'levelup-v5').map(probe => probe.fen)).size + 4;
  assert.equal(result.probes, count);
  assert.equal(fake.requests.length, count);
  assert.equal(new Set(fake.requests.map(request => request.fen)).size, count);
  assert.ok(fake.boards.every(board => board.disposed));
  assert.ok(fake.requests.some(request => request.fen.includes(' KQkq ')), 'ordinary king castling rights stay intact');
});

test('adapts only king placement for asymmetric pseudo-royal profiles', async () => {
  const fake = fixture({ royalMode: 'pseudo-royal' });
  const result = await checkCapabilities({ ...fake, startFens: [START], whiteKing: 1, blackKing: 3 });
  assert.ok(result.probes > 4);
  for (const { fen } of fake.requests) {
    const placement = fen.split(' ')[0];
    assert.ok(placement.includes('W') && placement.includes('y'), fen);
    assert.doesNotMatch(placement, /[Kk]/);
  }
  assert.ok(fake.requests.some(request => request.fen.includes(' KQkq ')));
});

for (const nativeMoves of [['a1a2'], [...expected, 'a1h1']]) {
  test(`rejects ${nativeMoves.length < expected.length ? 'missing' : 'extra'} native alternatives and disposes the board`, async () => {
    const fake = fixture({ nativeMoves });
    await assert.rejects(checkCapabilities({ ...fake, startFens: [START], whiteKing: 0, blackKing: 0 }), /Capability preflight failed.*disagree/);
    assert.equal(fake.requests.length, 1);
    assert.ok(fake.boards.every(board => board.disposed));
  });
}

test('cancellation preserves AbortError and skips a pre-cancelled check', async () => {
  const fake = fixture();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(checkCapabilities({ ...fake, startFens: [START], whiteKing: 0, blackKing: 0, signal: controller.signal }), { name: 'AbortError', code: 'ABORT_ERR' });
  assert.equal(fake.boards.length, 0);
  assert.equal(fake.requests.length, 0);
});

test('invalid fixtures fail visibly rather than silently losing coverage', async () => {
  const fake = fixture();
  fake.rules.createBoard = () => { throw new Error('Invalid fixture'); };
  await assert.rejects(checkCapabilities({ ...fake, startFens: [START], whiteKing: 0, blackKing: 0 }), /preflight failed.*Invalid fixture/);
  assert.equal(fake.requests.length, 0);
});

test('native perft errors preserve context and release the WASM board', async () => {
  const fake = fixture();
  fake.engine.perft = async () => { throw new Error('Engine exited'); };
  await assert.rejects(checkCapabilities({ ...fake, startFens: [START], whiteKing: 0, blackKing: 0 }), /preflight failed.*Engine exited/);
  assert.ok(fake.boards.every(board => board.disposed));
});

test('all fixtures agree with the native engine for ordinary, upgraded, and asymmetric royals', {
  skip: !process.env.FAIRY_STOCKFISH_PATH, timeout: 30000,
}, async t => {
  const { createMatchRules } = require('../dist/balance-rules.cjs');
  const { UciEngine } = require('../scripts/balance/uci');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-balance-capabilities-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const [whiteKing, blackKing] of [[0, 0], [1, 1], [2, 2], [3, 3], [1, 3], [3, 1]]) {
    const rules = await createMatchRules({ whiteKing, blackKing });
    const variantPath = path.join(directory, `${rules.variant}.ini`);
    fs.writeFileSync(variantPath, rules.config);
    const engine = new UciEngine({ path: process.env.FAIRY_STOCKFISH_PATH, variantPath, variant: rules.variant });
    try {
      await engine.start();
      const result = await checkCapabilities({ engine, rules, startFens: [START], whiteKing, blackKing });
      assert.ok(result.probes > 4);
    } finally { await engine.close(); }
  }
});
