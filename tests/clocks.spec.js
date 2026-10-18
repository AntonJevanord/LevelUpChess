const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const { Chess } = require('chess.js');

const square = (page, name) => page.locator(`[data-square="${name}"]`);
async function move(page, from, to) {
  await square(page, from).click();
  await square(page, to).click();
}
async function timedGame(page, control = 'blitz') {
  await page.selectOption('#time-control', control);
  await page.getByRole('button', { name: 'New game', exact: true }).click();
}
async function clocks(page, white, black) {
  await expect(page.locator('#white-clock')).toHaveText(white);
  await expect(page.locator('#black-clock')).toHaveText(black);
}

test.beforeEach(async ({ page }) => {
  // Freeze elapsed time before loading the app; only explicit advances consume it.
  await page.clock.install({ time: new Date('2026-10-18T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-18T12:00:01Z'));
  await page.goto('http://127.0.0.1:4173');
});

test('timed play starts explicitly, switches sides, and adds each move increment', async ({ page }) => {
  await expect(page.locator('#time-control')).toHaveValue('none');
  await timedGame(page);
  await clocks(page, '03:00', '03:00');
  await page.clock.fastForward(10_000);
  await move(page, 'e2', 'e4');
  await expect(square(page, 'e2')).toHaveAttribute('aria-label', 'e2 White pawn');
  await clocks(page, '03:00', '03:00');

  await page.getByRole('button', { name: 'Start clock', exact: true }).click();
  await page.clock.fastForward(10_000);
  await move(page, 'e2', 'e4');
  await clocks(page, '02:52', '03:00');
  await page.clock.fastForward(7_000);
  await move(page, 'e7', 'e5');
  await clocks(page, '02:52', '02:55');
  await expect(page.locator('#status')).toHaveText('White to move');
});

test('pause freezes both clocks and blocks moves until resumed', async ({ page }) => {
  await timedGame(page, 'five');
  await page.getByRole('button', { name: 'Start clock', exact: true }).click();
  await page.clock.fastForward(12_000);
  await page.getByRole('button', { name: 'Pause clock', exact: true }).click();
  await clocks(page, '04:48', '05:00');
  await page.clock.fastForward(60_000);
  await move(page, 'e2', 'e4');
  await clocks(page, '04:48', '05:00');
  await expect(square(page, 'e2')).toHaveAttribute('aria-label', 'e2 White pawn');

  await page.getByRole('button', { name: 'Resume clock', exact: true }).click();
  await page.clock.fastForward(3_000);
  await move(page, 'e2', 'e4');
  await clocks(page, '04:45', '05:00');
  await expect(page.locator('#status')).toHaveText('Black to move');
});

test('flag fall ends play and exports a PGN result and time termination', async ({ page }) => {
  await timedGame(page, 'five');
  await page.getByRole('button', { name: 'Start clock', exact: true }).click();
  await page.clock.fastForward(300_000);
  await expect(page.locator('#status')).toHaveText('Black wins on time');
  await clocks(page, '00:00', '05:00');
  await move(page, 'e2', 'e4');
  await expect(page.locator('#history li')).toHaveCount(0);

  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PGN', exact: true }).click();
  const download = await waiting;
  const pgn = await fs.readFile(await download.path(), 'utf8');
  const game = new Chess();
  game.loadPgn(pgn);
  expect(game.getHeaders().Result).toBe('0-1');
  expect(game.getHeaders().Termination).toMatch(/time/i);
});

test('undo restores the previous turn clocks and pauses before replaying', async ({ page }) => {
  await timedGame(page);
  await page.getByRole('button', { name: 'Start clock', exact: true }).click();
  await page.clock.fastForward(10_000);
  await move(page, 'e2', 'e4');
  await page.clock.fastForward(7_000);
  await move(page, 'e7', 'e5');
  await page.clock.fastForward(3_000);
  await page.getByRole('button', { name: 'Undo move' }).click();
  await clocks(page, '02:52', '03:00');
  await expect(page.getByRole('button', { name: 'Resume clock', exact: true })).toBeVisible();
  await expect(square(page, 'e7')).toHaveAttribute('aria-label', 'e7 Black pawn');
  await page.clock.fastForward(10_000);
  await clocks(page, '02:52', '03:00');
  await page.getByRole('button', { name: 'Undo move' }).click();
  await clocks(page, '03:00', '03:00');
  await expect(page.locator('#history li')).toHaveCount(0);
  await page.getByRole('button', { name: 'Resume clock', exact: true }).click();
  await move(page, 'd2', 'd4');
  await clocks(page, '03:02', '03:00');
});

test('saving and reloading keeps remaining time and undo history with clocks paused', async ({ page }) => {
  await timedGame(page);
  await page.getByRole('button', { name: 'Start clock', exact: true }).click();
  await page.clock.fastForward(10_000);
  await move(page, 'e2', 'e4');
  await page.clock.fastForward(7_000);
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await page.clock.fastForward(20_000);
  await page.reload();
  await page.getByRole('button', { name: 'Load saved', exact: true }).click();
  await clocks(page, '02:52', '02:53');
  await expect(page.getByRole('button', { name: 'Resume clock', exact: true })).toBeVisible();
  await page.clock.fastForward(60_000);
  await clocks(page, '02:52', '02:53');
  await move(page, 'e7', 'e5');
  await expect(square(page, 'e7')).toHaveAttribute('aria-label', 'e7 Black pawn');
  await page.getByRole('button', { name: 'Undo move' }).click();
  await clocks(page, '03:00', '03:00');
  await expect(square(page, 'e2')).toHaveAttribute('aria-label', 'e2 White pawn');
});

test('a different time control applies only after confirming a new game', async ({ page }) => {
  await timedGame(page, 'five');
  await page.getByRole('button', { name: 'Start clock', exact: true }).click();
  await page.clock.fastForward(10_000);
  await move(page, 'e2', 'e4');
  await page.selectOption('#time-control', 'blitz');
  await clocks(page, '04:50', '05:00');
  await expect(page.locator('#clock-status')).toContainText(/next game/i);
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByRole('button', { name: 'Keep playing' }).click();
  await expect(square(page, 'e4')).toHaveAttribute('aria-label', 'e4 White pawn');
  await clocks(page, '04:50', '05:00');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByRole('button', { name: 'Start new game', exact: true }).click();
  await clocks(page, '03:00', '03:00');
  await expect(page.getByRole('button', { name: 'Start clock', exact: true })).toBeVisible();
  await expect(page.locator('#history li')).toHaveCount(0);
});

test('flipping retains color clocks and importing PGN starts untimed play', async ({ page }) => {
  await timedGame(page);
  await page.getByRole('button', { name: 'Start clock', exact: true }).click();
  await page.clock.fastForward(10_000);
  await move(page, 'e2', 'e4');
  await page.getByRole('button', { name: 'Flip board' }).click();
  await expect(page.locator('.square').first()).toHaveAttribute('data-square', 'h1');
  await clocks(page, '02:52', '03:00');
  await page.getByRole('button', { name: 'Import PGN', exact: true }).click();
  await page.locator('#pgn-text').fill('1. d4 d5 *');
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
  await page.getByRole('button', { name: 'Replace game', exact: true }).click();
  await expect(page.locator('#time-control')).toHaveValue('none');
  await expect(page.locator('#clock-status')).toContainText(/untimed/i);
  await page.clock.fastForward(600_000);
  await move(page, 'g1', 'f3');
  await expect(page.locator('#status')).toHaveText('Black to move');
  // Imported moves have no clock checkpoints; undo must still leave them playable.
  await page.getByRole('button', { name: 'Undo move' }).click();
  await page.getByRole('button', { name: 'Undo move' }).click();
  await move(page, 'e7', 'e5');
  await expect(square(page, 'e5')).toHaveAttribute('aria-label', 'e5 Black pawn');
  await expect(page.locator('#status')).toHaveText('White to move');
});

test('loading or importing asks before replacing a running game with no moves', async ({ page }) => {
  await timedGame(page, 'five');
  await page.getByRole('button', { name: 'Start clock', exact: true }).click();
  await page.clock.fastForward(10_000);
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await page.clock.fastForward(10_000);
  await page.getByRole('button', { name: 'Load saved', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Replace game', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Keep current game' }).click();
  await clocks(page, '04:40', '05:00');
  await page.getByRole('button', { name: 'Import PGN', exact: true }).click();
  await page.locator('#pgn-text').fill('1. d4 *');
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Replace game', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Keep current game' }).click();
  await clocks(page, '04:40', '05:00');
  await expect(page.getByRole('button', { name: 'Pause clock', exact: true })).toBeVisible();
  await expect(page.locator('#history li')).toHaveCount(0);
});

test('pausing a clock rejects a pending engine reply and resuming searches again', async ({ page }) => {
  let searches = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/engine/status', route => route.fulfill({ json: { name: 'Test engine' } }));
  await page.route('**/api/engine/move', async route => {
    searches++;
    if (searches === 1) await gate;
    await route.fulfill({ json: { move: 'e7e5' } }).catch(() => {});
  });
  await timedGame(page, 'five');
  await page.selectOption('#opponent', 'engine');
  await expect(page.locator('#engine-status')).toContainText('connected');
  await page.getByRole('button', { name: 'Start clock', exact: true }).click();
  await move(page, 'e2', 'e4');
  await expect.poll(() => searches).toBe(1);
  await page.getByRole('button', { name: 'Pause clock', exact: true }).click();
  release();
  await page.clock.fastForward(10_000);
  await clocks(page, '05:00', '05:00');
  await expect(square(page, 'e7')).toHaveAttribute('aria-label', 'e7 Black pawn');
  await page.getByRole('button', { name: 'Resume clock', exact: true }).click();
  await expect(square(page, 'e5')).toHaveAttribute('aria-label', 'e5 Black pawn');
  expect(searches).toBe(2);
});

test('saved timeouts stay finished after reload and an expired engine search cannot move', async ({ page }) => {
  let release;
  let started = false;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/engine/status', route => route.fulfill({ json: { name: 'Test engine' } }));
  await page.route('**/api/engine/move', async route => {
    started = true;
    await gate;
    await route.fulfill({ json: { move: 'e7e5' } }).catch(() => {});
  });
  await timedGame(page, 'five');
  await page.selectOption('#opponent', 'engine');
  await expect(page.locator('#engine-status')).toContainText('connected');
  await page.getByRole('button', { name: 'Start clock', exact: true }).click();
  await move(page, 'e2', 'e4');
  await expect.poll(() => started).toBe(true);
  await page.clock.fastForward(300_000);
  release();
  await expect(page.locator('#status')).toHaveText('White wins on time');
  await expect(square(page, 'e7')).toHaveAttribute('aria-label', 'e7 Black pawn');
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Load saved', exact: true }).click();
  await expect(page.locator('#status')).toHaveText('White wins on time');
  await expect(page.getByRole('button', { name: 'Resume clock', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Undo move' }).click();
  await clocks(page, '05:00', '05:00');
  await expect(page.locator('#status')).toHaveText('White to move');
});

test('saving across the flag deadline keeps the saved clock and result consistent', async ({ page }) => {
  await timedGame(page, 'five');
  await page.getByRole('button', { name: 'Start clock', exact: true }).click();
  const saved = await page.evaluate(() => {
    const start = performance.now();
    const original = Object.getOwnPropertyDescriptor(performance, 'now');
    let reads = 0;
    // The initial snapshot occurs just before flag fall, while the final clock
    // settlement observes the deadline. Both must describe the same saved game.
    Object.defineProperty(performance, 'now', {
      configurable: true,
      value: () => start + (++reads < 3 ? 299999.75 : 300000.25),
    });
    try {
      document.querySelector('#save-game').click();
      return JSON.parse(localStorage.getItem('levelupchess.saved-game.v1'));
    } finally {
      if (original) Object.defineProperty(performance, 'now', original);
      else delete performance.now;
    }
  });
  await expect(page.locator('#save-status')).toContainText('Saved 0 half-moves');
  await expect(page.locator('#status')).toHaveText('Black wins on time');
  expect(saved.clock.expired).toBe('w');
  expect(saved.clock.remaining.w).toBe(0);
  const game = new Chess();
  game.loadPgn(saved.pgn);
  expect(game.getHeaders().Result).toBe('0-1');
  expect(game.getHeaders().Termination).toBe('time forfeit');

  await page.reload();
  await page.getByRole('button', { name: 'Load saved', exact: true }).click();
  await expect(page.locator('#status')).toHaveText('Black wins on time');
  await expect(page.getByRole('button', { name: 'Resume clock', exact: true })).toBeDisabled();
  await move(page, 'e2', 'e4');
  await expect(square(page, 'e2')).toHaveAttribute('aria-label', 'e2 White pawn');
  await expect(page.locator('#history li')).toHaveCount(0);
});

test('old browser saves without clock metadata still load and undo normally', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('levelupchess.saved-game.v1', JSON.stringify({
    version: 1, savedAt: '2026-10-18T12:00:00Z', pgn: '1. e4 e5 *',
    settings: { opponent: 'local', humanSide: 'w', difficulty: 'medium', flipped: false },
  })));
  await page.reload();
  await page.getByRole('button', { name: 'Load saved', exact: true }).click();
  await expect(page.locator('#time-control')).toHaveValue('none');
  await page.getByRole('button', { name: 'Undo move' }).click();
  await move(page, 'c7', 'c5');
  await expect(square(page, 'c5')).toHaveAttribute('aria-label', 'c5 Black pawn');
});

test('damaged saved clocks are rejected before replacing a current game', async ({ page }) => {
  await timedGame(page, 'five');
  await page.getByRole('button', { name: 'Start clock', exact: true }).click();
  await move(page, 'e2', 'e4');
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('levelupchess.saved-game.v1'));
    data.clock.remaining.w = -1;
    localStorage.setItem('levelupchess.saved-game.v1', JSON.stringify(data));
  });
  await page.getByRole('button', { name: 'Load saved', exact: true }).click();
  await expect(page.locator('#save-status')).toContainText('saved clock is damaged');
  await expect(square(page, 'e4')).toHaveAttribute('aria-label', 'e4 White pawn');
  await expect(page.locator('#replace-dialog')).not.toBeVisible();
});

test('checkmate stops a timed game before either clock can expire', async ({ page }) => {
  await timedGame(page, 'five');
  await page.getByRole('button', { name: 'Start clock', exact: true }).click();
  for (const [from, to] of [['f2','f3'], ['e7','e5'], ['g2','g4'], ['d8','h4']]) await move(page, from, to);
  await expect(page.locator('#status')).toHaveText('Black wins by checkmate');
  await page.clock.fastForward(600_000);
  await expect(page.locator('#status')).toHaveText('Black wins by checkmate');
  await clocks(page, '05:00', '05:00');
});
