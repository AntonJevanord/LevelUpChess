const { test, expect } = require('@playwright/test');
const { initVariantRules, VariantGame, CURRENT_VARIANT } = require('../dist/rules-node.cjs');

test('native bridge plays the current mixed army and continues after a blue queen home jump', async ({ request }) => {
  test.skip(!process.env.FAIRY_STOCKFISH_PATH, 'Set FAIRY_STOCKFISH_PATH to run native engine integration.');
  await initVariantRules();
  const games = [
    new VariantGame('onbqkbnr/pppppppp/8/8/8/8/APPPPPPP/LNBSKBNM w KQkq - 0 1', CURRENT_VARIANT),
    new VariantGame('7k/8/8/8/8/8/8/3S3K w - - 0 1', CURRENT_VARIANT),
  ];
  try {
    games[1].move({ from: 'd1', to: 'f4' });
    // Native initial jumps can retain an inert occupied FEN target. The bridge
    // must accept this real game state without inventing en passant captures.
    expect(games[1].fen().split(' ')[3]).toBe('f4');
    for (const game of games) {
      const response = await request.post('http://127.0.0.1:4173/api/engine/move', {
        data: { fen: game.fen(), variant: CURRENT_VARIANT, difficulty: 'easy' },
      });
      const result = await response.json();
      expect(response.ok(), result.error).toBe(true);
      const legal = game.moves({ verbose: true }).map(move => move.from + move.to + (move.promotion || ''));
      expect(legal).toContain(result.move);
      game.move({ from: result.move.slice(0, 2), to: result.move.slice(2, 4), promotion: result.move[4] });
    }
  } finally {
    for (const game of games) game.dispose();
  }
});

const reportedArmies = [
  {
    name: 'blue queens',
    placement: 'rnbskbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBSKBNR',
  },
  {
    name: 'blue pawns',
    placement: 'rnbqkbnr/appppppp/8/8/8/8/APPPPPPP/RNBQKBNR',
  },
  {
    name: 'blue rooks',
    placement: 'lnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/LNBQKBNR',
  },
];

for (const { name, placement } of reportedArmies) for (const turn of ['w', 'b']) {
  test(`native bridge plays ${name} without unrelated upgrades, ${turn === 'w' ? 'White' : 'Black'} to move`, async ({ request }) => {
    test.skip(!process.env.FAIRY_STOCKFISH_PATH, 'Set FAIRY_STOCKFISH_PATH to run native engine integration.');
    await initVariantRules();
    const game = new VariantGame(`${placement} ${turn} KQkq - 0 1`, CURRENT_VARIANT);
    try {
      const response = await request.post('http://127.0.0.1:4173/api/engine/move', {
        data: { fen: game.fen(), variant: CURRENT_VARIANT, difficulty: 'easy' },
      });
      const result = await response.json();
      expect(response.ok(), result.error).toBe(true);
      const legal = game.moves({ verbose: true }).map(move => move.from + move.to + (move.promotion || ''));
      expect(legal).toContain(result.move);
      game.move({ from: result.move.slice(0, 2), to: result.move.slice(2, 4), promotion: result.move[4] });
      expect(game.turn()).toBe(turn === 'w' ? 'b' : 'w');
    } finally { game.dispose(); }
  });
}
