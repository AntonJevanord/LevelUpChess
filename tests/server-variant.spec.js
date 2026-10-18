const { test, expect } = require('@playwright/test');
const { Chess } = require('chess.js');

const endpoint = 'http://127.0.0.1:4173/api/engine/move';
const forcedWhite = 'k2rrr2/8/8/8/8/8/4E3/4K3 w - - 0 1';
const forcedBlack = '4k3/4e3/8/8/8/8/8/K2RRR2 b - - 0 1';

test('bridge only accepts its two fixed variant names', async ({ request }) => {
  for (const variant of ['atomic', '../variants/levelup-knight.ini', 'levelup-knight\nquit', null, 3]) {
    const response = await request.post(endpoint, { data: { fen: new Chess().fen(), difficulty: 'easy', variant } });
    expect(response.status()).toBe(400);
  }
});

test('bridge validates upgraded positions with their own rules', async ({ request }) => {
  const invalidGames = [
    { fen: forcedWhite, difficulty: 'easy' },
    { fen: forcedWhite, difficulty: 'easy', variant: 'chess' },
    { fen: '8/8/8/8/3E4/8/8/7K w - - 0 1', difficulty: 'easy', variant: 'levelup-knight' },
    { fen: '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', difficulty: 'easy', variant: 'levelup-knight' },
    { fen: `${forcedWhite}\nquit`, difficulty: 'easy', variant: 'levelup-knight' },
    { fen: forcedWhite, difficulty: 'unknown', variant: 'levelup-knight' },
  ];
  for (const data of invalidGames) {
    const response = await request.post(endpoint, { data });
    expect(response.status()).toBe(400);
  }
});

test('variant requests retain local-origin and JSON restrictions', async ({ request }) => {
  const data = { fen: forcedWhite, difficulty: 'easy', variant: 'levelup-knight' };
  const text = await request.post(endpoint, { data: JSON.stringify(data), headers: { 'Content-Type': 'text/plain' } });
  expect(text.status()).toBe(415);
  for (const headers of [
    { Origin: 'https://unrelated.example' },
    { Host: 'unrelated.example:4173' },
    { 'Sec-Fetch-Site': 'cross-site' },
  ]) {
    const response = await request.post(endpoint, { data, headers });
    expect(response.status()).toBe(403);
  }
});

test('native Fairy Stockfish plays forced quiet blue-knight moves for both colors', async ({ request }) => {
  test.skip(!process.env.FAIRY_STOCKFISH_PATH, 'Set FAIRY_STOCKFISH_PATH to run native engine integration.');
  for (const [fen, move] of [[forcedWhite, 'e2e3'], [forcedBlack, 'e7e6']]) {
    const response = await request.post(endpoint, { data: { fen, difficulty: 'easy', variant: 'levelup-knight' } });
    expect(response.ok()).toBe(true);
    expect((await response.json()).move).toBe(move);
  }
});

test('ordinary chess engine requests still work when variant is omitted or explicit', async ({ request }) => {
  test.skip(!process.env.FAIRY_STOCKFISH_PATH, 'Set FAIRY_STOCKFISH_PATH to run native engine integration.');
  const fen = new Chess().fen();
  for (const variant of [undefined, 'chess']) {
    const response = await request.post(endpoint, { data: { fen, difficulty: 'easy', variant } });
    expect(response.ok()).toBe(true);
    const { move } = await response.json();
    const game = new Chess(fen);
    expect(game.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] })).toBeTruthy();
  }
});
