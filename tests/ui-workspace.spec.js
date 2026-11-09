const { test, expect } = require('@playwright/test');
const { Chess } = require('chess.js');
const { PLAYABLE_LIBRARIES } = require('../src/design-options');
const { panel, inPanel } = require('./ui-panels');

const roster = PLAYABLE_LIBRARIES.find(row => row.id === 'v18-roster-confirmed');
const square = (page, name) => page.locator(`#board [data-square="${name}"]`);
const annotation = (page, kind) => page.locator(`#board-annotations [data-kind="${kind}"]:not([data-preview])`);

async function importFen(page, fen) {
  const game = new Chess(fen);
  await inPanel(page, 'files', () => page.locator('#open-import').click());
  await page.locator('#pgn-text').fill(game.pgn());
  await page.locator('#confirm-import').click();
  if (await page.locator('#replace-dialog').isVisible()) await page.locator('#confirm-replace').click();
  await expect(page.locator('#import-dialog')).not.toBeVisible();
}
async function drag(page, from, to, button = 'right') {
  await square(page, from).scrollIntoViewIfNeeded();
  await square(page, to).scrollIntoViewIfNeeded();
  const a = await square(page, from).boundingBox(), b = await square(page, to).boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down({ button });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
  await page.mouse.up({ button });
}

test.beforeEach(async ({ page }) => { await page.goto('http://127.0.0.1:4173'); });

test('one accessible side panel supports keyboard tabs while status and core controls stay visible', async ({ page }) => {
  await expect(page.locator('[role="tablist"] [role="tab"]')).toHaveCount(4);
  await expect(page.locator('#panel-tab-game')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#panel-game')).toBeVisible();
  await expect(page.locator('#panel-setup')).not.toBeVisible();
  await page.locator('#panel-tab-game').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#panel-tab-setup')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#panel-setup')).toBeVisible();
  await page.keyboard.press('End');
  await expect(page.locator('#panel-tab-files')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#panel-files')).toBeVisible();
  for (const selector of ['#status', '#hint', '#undo', '#flip', '#new-game']) await expect(page.locator(selector)).toBeVisible();
  await page.keyboard.press('Home');
  await expect(page.locator('#panel-tab-game')).toHaveAttribute('aria-selected', 'true');
  await page.setViewportSize({ width: 390, height: 844 });
  await panel(page, 'design');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const board = await page.locator('#board').boundingBox();
  expect(board.x).toBeGreaterThanOrEqual(0); expect(board.x + board.width).toBeLessThanOrEqual(391);
});

test('asynchronous piece inspection preserves board keyboard focus and square navigation', async ({ page }) => {
  await square(page, 'e2').focus();
  await page.keyboard.press('Enter');
  await expect(square(page, 'e3')).toHaveAttribute('data-quiet', 'true');
  await expect(square(page, 'e2')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(square(page, 'f2')).toBeFocused();
});

test('entering army setup releases drawing mode so home pieces remain clickable', async ({ page }) => {
  await page.locator('#drawing-mode').click();
  await expect(page.locator('#drawing-mode')).toHaveAttribute('aria-pressed', 'true');
  await inPanel(page, 'setup', () => page.selectOption('#game-mode', roster.variant));
  await expect(page.locator('#drawing-mode')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#drawing-mode')).toBeDisabled();
  await square(page, 'd2').click();
  await expect(page.locator('#setup-picker')).toBeVisible();
  await expect(page.locator('#setup-piece-title')).toContainText('White pawn');
  await expect(annotation(page, 'circle')).toHaveCount(0);
});

test('setup cards occupy the central ranks and leave both starting armies usable', async ({ page }) => {
  await inPanel(page, 'setup', () => page.selectOption('#game-mode', roster.variant));
  const whiteBudget = page.locator('.player .level[aria-label^="White draft army:"]');
  const blackBudget = page.locator('.player .level[aria-label^="Black draft army:"]');
  await expect(whiteBudget).toBeVisible();
  await expect(whiteBudget).toHaveText('0/6 POINTS');
  await expect(blackBudget).toBeVisible();
  await expect(blackBudget).toHaveText('0/6 POINTS');
  await square(page, 'd2').click();
  const picker = page.locator('#setup-picker');
  await expect(picker).toBeVisible();
  const bounds = await picker.boundingBox(), upper = await square(page, 'a6').boundingBox(), lower = await square(page, 'a3').boundingBox();
  expect(bounds.y).toBeGreaterThanOrEqual(upper.y - 2);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(lower.y + lower.height + 2);
  await picker.locator('[data-upgrade-id="pawn.knight-tall-quiet@1"]').click();
  await expect(page.locator('#experimental-status')).toContainText('White 2/6');
  await expect(whiteBudget).toHaveText('2/6 POINTS');
  await square(page, 'd7').click();
  await expect(page.locator('#setup-piece-title')).toContainText('Black pawn');
  await square(page, 'a1').click();
  await picker.locator('[data-upgrade-id="rook.cataphract-no-tall-back@1"]').click();
  await expect(page.locator('#experimental-status')).toContainText('White 5/6');
  await expect(whiteBudget).toHaveText('5/6 POINTS');
  await expect(blackBudget).toHaveText('0/6 POINTS');
  await page.locator('#setup-picker-close').click();
  await expect(picker).not.toBeVisible();
  await page.locator('#new-game').click();
  await expect(square(page, 'd2')).toHaveAttribute('data-design-id', 'pawn.knight-tall-quiet@1');
  await expect(square(page, 'a1')).toHaveAttribute('data-design-id', 'rook.cataphract-no-tall-back@1');
});

test('right-click circles and right-drag arrows survive flips, toggle individually and clear on moves', async ({ page }) => {
  await square(page, 'd4').click({ button: 'right' });
  await expect(annotation(page, 'circle')).toHaveCount(1);
  await expect(annotation(page, 'circle')).toHaveAttribute('data-square', 'd4');
  await drag(page, 'e2', 'e4');
  await expect(annotation(page, 'arrow')).toHaveCount(1);
  await expect(annotation(page, 'arrow')).toHaveAttribute('data-from', 'e2');
  await expect(annotation(page, 'arrow')).toHaveAttribute('data-to', 'e4');
  const before = await annotation(page, 'circle').boundingBox(), boardBefore = await page.locator('#board').boundingBox();
  await page.locator('#flip').click();
  await expect(annotation(page, 'circle')).toHaveCount(1);
  const after = await annotation(page, 'circle').boundingBox(), boardAfter = await page.locator('#board').boundingBox();
  const normalized = (circle, board) => (circle.x + circle.width / 2 - board.x) / board.width;
  expect(normalized(before, boardBefore) + normalized(after, boardAfter)).toBeCloseTo(1, 1);
  await square(page, 'd4').click({ button: 'right' });
  await expect(annotation(page, 'circle')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(annotation(page, 'arrow')).toHaveCount(0);
  await square(page, 'd4').click({ button: 'right' });
  await square(page, 'e2').click(); await square(page, 'e4').click();
  await expect(annotation(page, 'circle')).toHaveCount(0);
  await expect(page.locator('#status')).toHaveText('Black to move');
});

test('explicit drawing mode consumes board clicks instead of moving pieces', async ({ page }) => {
  await page.locator('#drawing-mode').click();
  await expect(page.locator('#drawing-mode')).toHaveAttribute('aria-pressed', 'true');
  await square(page, 'e2').click();
  await drag(page, 'e2', 'e4', 'left');
  await expect(annotation(page, 'circle')).toHaveCount(1);
  await expect(annotation(page, 'arrow')).toHaveCount(1);
  await expect(square(page, 'e2')).toHaveAttribute('aria-label', 'e2 White pawn');
  await expect(page.locator('#history li')).toHaveCount(0);
  await page.locator('#clear-annotations').click();
  await expect(annotation(page, 'circle')).toHaveCount(0);
  await expect(annotation(page, 'arrow')).toHaveCount(0);
  await page.locator('#drawing-mode').click();
  await square(page, 'e2').click(); await square(page, 'e4').click();
  await expect(page.locator('#status')).toHaveText('Black to move');
});

test.describe('touch annotations', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('Draw mode lets a touch player mark a square without moving its piece', async ({ page }) => {
    await page.locator('#drawing-mode').tap();
    await square(page, 'e2').tap();
    await expect(annotation(page, 'circle')).toHaveCount(1);
    await expect(annotation(page, 'circle')).toHaveAttribute('data-square', 'e2');
    await expect(square(page, 'e2')).toHaveAttribute('aria-label', 'e2 White pawn');
    await expect(page.locator('#history li')).toHaveCount(0);
    await page.locator('#clear-annotations').tap();
    await expect(annotation(page, 'circle')).toHaveCount(0);
  });
});

test('all piece styles and board/annotation preferences persist independently of the game', async ({ page }) => {
  await panel(page, 'design');
  for (const style of ['flat', 'outline', 'medallion', 'glow']) {
    await page.selectOption('#piece-style', style);
    await expect(page.locator('body')).toHaveAttribute('data-piece-style', style);
    const icon = square(page, 'e1').locator('.piece');
    await expect(icon).toHaveAttribute('data-piece-style', style);
    await expect(icon.locator('.piece-svg')).toHaveCount(style === 'glow' ? 0 : 1);
  }
  await page.selectOption('#piece-style', 'outline');
  await page.selectOption('#board-theme', 'blue');
  await page.locator('#annotation-color').evaluate(input => { input.value = '#69bcdf'; input.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.reload();
  await panel(page, 'design');
  await expect(page.locator('#piece-style')).toHaveValue('outline');
  await expect(page.locator('#board-theme')).toHaveValue('blue');
  await expect(page.locator('#annotation-color')).toHaveValue('#69bcdf');
  await expect(page.locator('#history li')).toHaveCount(0);
  await square(page, 'h4').click({ button: 'right' });
  await expect(annotation(page, 'circle').locator('circle')).toHaveAttribute('stroke', '#69bcdf');
  await inPanel(page, 'setup', () => page.selectOption('#game-mode', roster.variant));
  await square(page, 'a1').click();
  await page.locator('#setup-picker [data-upgrade-id="rook.cataphract-no-tall-back@1"]').click();
  await expect(square(page, 'a1').locator('.piece')).toHaveClass(/purple/);
  await expect(square(page, 'a1').locator('.piece-level')).toHaveText('L3');
});

test('ability guides distinguish quiet and capture moves on empty squares without allowing illegal moves', async ({ page }) => {
  await square(page, 'e2').click();
  await expect(square(page, 'e3')).toHaveAttribute('data-quiet', 'true');
  await expect(square(page, 'e3')).toHaveAttribute('data-capture', 'false');
  await expect(square(page, 'd3')).toHaveAttribute('data-quiet', 'false');
  await expect(square(page, 'd3')).toHaveAttribute('data-capture', 'true');
  await expect(square(page, 'd3')).toHaveAttribute('data-legal', 'false');
  await square(page, 'd3').click();
  await expect(square(page, 'e2')).toHaveAttribute('aria-label', 'e2 White pawn');
  await expect(page.locator('#history li')).toHaveCount(0);
  await square(page, 'b1').click();
  await expect(square(page, 'c3')).toHaveAttribute('data-quiet', 'true');
  await expect(square(page, 'c3')).toHaveAttribute('data-capture', 'true');
  await expect(square(page, 'c3')).toHaveAttribute('data-legal', 'true');
  await expect(square(page, 'c3').locator('.move-marker')).toHaveCount(1);
  await expect(square(page, 'c3').locator('.ability-capture-marker')).toHaveCount(1);
  await page.locator('#inspect-mode').click();
  await square(page, 'g8').click();
  await expect(square(page, 'f6')).toHaveAttribute('data-quiet', 'true');
  await expect(square(page, 'f6')).toHaveAttribute('data-capture', 'true');
  await expect(square(page, 'f6')).toHaveAttribute('data-legal', 'false');
  await square(page, 'f6').click();
  await expect(square(page, 'g8')).toHaveAttribute('aria-label', 'g8 Black knight');
  await expect(page.locator('#history li')).toHaveCount(0);
});

test('a pinned piece can be inspected without turning its ability guide into a legal move', async ({ page }) => {
  await importFen(page, '4r2k/8/8/8/8/8/4R3/4K3 w - - 0 1');
  await square(page, 'e2').click();
  await expect(square(page, 'f2')).toHaveAttribute('data-quiet', 'true');
  await expect(square(page, 'f2')).toHaveAttribute('data-legal', 'false');
  await square(page, 'f2').click();
  await expect(square(page, 'e2')).toHaveAttribute('aria-label', 'e2 White rook');
  await expect(page.locator('#status')).toHaveText('White to move');
});

test('self-play starts explicitly, runs serial requests and single-steps exactly one move while paused', async ({ page }) => {
  let requests = 0, active = 0, maximumActive = 0;
  await page.route('**/api/engine/status', route => route.fulfill({ json: { name: 'Self-play test engine' } }));
  await page.route('**/api/engine/move', async route => {
    requests++; active++; maximumActive = Math.max(maximumActive, active);
    const game = new Chess(route.request().postDataJSON().fen);
    const move = game.moves({ verbose: true })[0];
    await new Promise(resolve => setTimeout(resolve, 40));
    active--;
    await route.fulfill({ json: { move: move.from + move.to + (move.promotion || '') } }).catch(() => {});
  });
  await inPanel(page, 'setup', () => page.selectOption('#opponent', 'selfplay'));
  await expect(page.locator('#engine-status')).toContainText(/ready|connected/i);
  expect(requests).toBe(0);
  await page.locator('#engine-step').click();
  await expect(page.locator('#history li span')).toHaveCount(1);
  await expect(page.locator('#engine-step')).toBeEnabled();
  await page.waitForTimeout(160);
  expect(requests).toBe(1);
  await page.locator('#engine-retry').click();
  await expect.poll(() => requests).toBeGreaterThan(2);
  await page.locator('#engine-cancel').click();
  await expect(page.locator('#engine-step')).toBeEnabled();
  const stopped = requests;
  await page.waitForTimeout(180);
  expect(requests).toBe(stopped); expect(maximumActive).toBe(1);
  await inPanel(page, 'files', () => page.locator('#save-game').click());
  await page.reload();
  await inPanel(page, 'files', () => page.locator('#load-game').click());
  await expect(page.locator('#opponent')).toHaveValue('selfplay');
  await expect(page.locator('#engine-step')).toBeEnabled();
  const restored = requests;
  await page.waitForTimeout(160);
  expect(requests).toBe(restored);
});

test('pausing self-play rejects a stale in-flight reply and inspection does not start another search', async ({ page }) => {
  let requests = 0, release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/engine/status', route => route.fulfill({ json: { name: 'Held self-play engine' } }));
  await page.route('**/api/engine/move', async route => {
    requests++;
    await pending;
    await route.fulfill({ json: { move: 'e2e4' } }).catch(() => {});
  });
  await inPanel(page, 'setup', () => page.selectOption('#opponent', 'selfplay'));
  await expect(page.locator('#engine-status')).toContainText(/ready|connected/i);
  await page.locator('#engine-retry').click();
  await expect.poll(() => requests).toBe(1);
  await panel(page, 'game');
  await page.locator('#inspect-mode').click();
  await square(page, 'g8').click();
  await expect(square(page, 'f6')).toHaveAttribute('data-capture', 'true');
  expect(requests).toBe(1);
  await page.locator('#engine-cancel').click();
  release();
  await page.waitForTimeout(120);
  await expect(square(page, 'e2')).toHaveAttribute('aria-label', 'e2 White pawn');
  await expect(page.locator('#history li')).toHaveCount(0);
  await expect(page.locator('#engine-step')).toBeEnabled();
  expect(requests).toBe(1);
});

test('timed self-play steps each color once with increment and cancels an in-flight step without another clock move', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-09T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-09T12:00:01Z'));
  let requests = 0, release, completeReply;
  const pending = new Promise(resolve => { release = resolve; });
  const replied = new Promise(resolve => { completeReply = resolve; });
  await page.route('**/api/engine/status', route => route.fulfill({ json: { name: 'Timed self-play engine' } }));
  await page.route('**/api/engine/move', async route => {
    const request = ++requests;
    const game = new Chess(route.request().postDataJSON().fen);
    const move = game.moves({ verbose: true })[0];
    if (request === 3) await pending;
    await route.fulfill({ json: { move: move.from + move.to + (move.promotion || '') } }).catch(() => {});
    if (request === 3) completeReply();
  });
  await page.reload();
  await inPanel(page, 'setup', () => page.selectOption('#time-control', 'blitz'));
  await page.locator('#new-game').click();
  await inPanel(page, 'setup', () => page.selectOption('#opponent', 'selfplay'));
  await expect(page.locator('#engine-status')).toContainText(/ready|connected/i);
  expect(requests).toBe(0);

  const savedClock = async () => {
    await inPanel(page, 'files', () => page.locator('#save-game').click());
    return page.evaluate(() => JSON.parse(localStorage.getItem('levelupchess.saved-game.v1')).clock);
  };
  await page.locator('#engine-step').click();
  await expect(page.locator('#history li span')).toHaveCount(1);
  await expect(page.locator('#clock-toggle')).toHaveText('Resume clock');
  await expect(page.locator('#clock-status')).toContainText(/paused/i);
  expect((await savedClock()).remaining).toEqual({ w: 182000, b: 180000 });
  await page.locator('#engine-step').click();
  await expect(page.locator('#history li span')).toHaveCount(2);
  await expect(page.locator('#clock-toggle')).toHaveText('Resume clock');
  expect((await savedClock()).remaining).toEqual({ w: 182000, b: 182000 });
  expect(requests).toBe(2);

  await page.locator('#engine-step').click();
  await expect.poll(() => requests).toBe(3);
  await page.locator('#engine-cancel').click();
  release();
  await replied;
  await page.clock.fastForward(10000);
  await expect(page.locator('#history li span')).toHaveCount(2);
  await expect(page.locator('#engine-step')).toBeEnabled();
  await expect(page.locator('#clock-toggle')).toHaveText('Resume clock');
  expect((await savedClock()).remaining).toEqual({ w: 182000, b: 182000 });
  expect(requests).toBe(3);
});
