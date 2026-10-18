const { test, expect } = require('@playwright/test');
const { Chess } = require('chess.js');
const square = (page, name) => page.locator(`[data-square="${name}"]`);
async function move(page, from, to) { await square(page, from).click(); await square(page, to).click(); }
async function mockConnection(page) {
  await page.route('**/api/engine/status', route => route.fulfill({ json: { name: 'Test engine' } }));
}
async function selectEngine(page) { await page.selectOption('#opponent', 'engine'); }
test.beforeEach(async ({ page }) => { await page.goto('http://127.0.0.1:4173'); });

test('engine replies legally, locks its pieces, and undo returns to the human turn', async ({ page }) => {
  await mockConnection(page);
  await page.route('**/api/engine/move', async route => {
    const data = route.request().postDataJSON();
    expect(new Chess(data.fen).turn()).toBe('b');
    expect(data.difficulty).toBe('medium');
    await route.fulfill({ json: { move: 'e7e5' } });
  });
  await selectEngine(page);
  await expect(page.locator('#engine-status')).toContainText('connected');
  await move(page, 'e2', 'e4');
  await expect(square(page, 'e5')).toHaveAttribute('aria-label', 'e5 Black pawn');
  await expect(page.locator('#status')).toHaveText('White to move');
  await page.getByRole('button', { name: 'Undo move' }).click();
  await expect(square(page, 'e2')).toHaveAttribute('aria-label', 'e2 White pawn');
  await expect(square(page, 'e7')).toHaveAttribute('aria-label', 'e7 Black pawn');
  await expect(page.locator('#engine-status')).toContainText('paused after undo');
});

test('playing black lets engine open and flips the board', async ({ page }) => {
  await mockConnection(page);
  await page.route('**/api/engine/move', route => route.fulfill({ json: { move: 'e2e4' } }));
  await selectEngine(page);
  await expect(page.locator('#engine-status')).toContainText('connected');
  await page.selectOption('#human-side', 'b');
  await expect(square(page, 'e4')).toHaveAttribute('aria-label', 'e4 White pawn');
  await expect(page.locator('.square').first()).toHaveAttribute('data-square', 'h1');
  await expect(page.locator('#bottom-player')).toHaveText('You · Black');
});

test('pause rejects an in-flight response and resume starts a fresh search', async ({ page }) => {
  await mockConnection(page);
  let searches = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/engine/move', async route => {
    searches++;
    if (searches === 1) await gate;
    await route.fulfill({ json: { move: 'e7e5' } }).catch(() => {});
  });
  await selectEngine(page);
  await expect(page.locator('#engine-status')).toContainText('connected');
  await move(page, 'e2', 'e4');
  await expect.poll(() => searches).toBe(1);
  await move(page, 'e7', 'e5');
  await expect(square(page, 'e7')).toHaveAttribute('aria-label', 'e7 Black pawn');
  await page.getByRole('button', { name: 'Pause engine' }).click();
  release();
  await expect(page.locator('#engine-status')).toContainText('Engine paused');
  await expect(square(page, 'e7')).toHaveAttribute('aria-label', 'e7 Black pawn');
  await page.getByRole('button', { name: 'Resume engine' }).click();
  await expect(square(page, 'e5')).toHaveAttribute('aria-label', 'e5 Black pawn');
  expect(searches).toBe(2);
});

test('new game cannot receive a response from the previous position', async ({ page }) => {
  await mockConnection(page);
  let release;
  let started = false;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/engine/move', async route => {
    started = true;
    await gate;
    await route.fulfill({ json: { move: 'e7e5' } }).catch(() => {});
  });
  await selectEngine(page);
  await expect(page.locator('#engine-status')).toContainText('connected');
  await move(page, 'e2', 'e4');
  await expect.poll(() => started).toBe(true);
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByRole('button', { name: 'Start new game', exact: true }).click();
  release();
  await expect(square(page, 'e2')).toHaveAttribute('aria-label', 'e2 White pawn');
  await expect(page.locator('#history li')).toHaveCount(0);
  await expect(page.locator('#status')).toHaveText('White to move');
});

test('connection errors are recoverable and local play remains available', async ({ page }) => {
  await page.route('**/api/engine/status', route => route.fulfill({ status: 503, json: { error: 'Cannot launch Fairy Stockfish.' } }));
  await selectEngine(page);
  await expect(page.locator('#engine-status')).toHaveText('Cannot launch Fairy Stockfish.');
  await page.unroute('**/api/engine/status');
  await mockConnection(page);
  await page.getByRole('button', { name: 'Connect engine' }).click();
  await expect(page.locator('#engine-status')).toContainText('connected');
  await page.selectOption('#opponent', 'local');
  await move(page, 'e2', 'e4');
  await move(page, 'e7', 'e5');
  await expect(page.locator('#status')).toHaveText('White to move');
});

test('an illegal engine response leaves the board intact', async ({ page }) => {
  await mockConnection(page);
  await page.route('**/api/engine/move', route => route.fulfill({ json: { move: 'e7e4' } }));
  await selectEngine(page);
  await expect(page.locator('#engine-status')).toContainText('connected');
  await move(page, 'e2', 'e4');
  await expect(page.locator('#engine-status')).toContainText('Engine paused');
  await expect(square(page, 'e7')).toHaveAttribute('aria-label', 'e7 Black pawn');
});

test('standalone HTML explains how to enable the engine', async ({ page }) => {
  const fs = require('node:fs');
  const path = require('node:path');
  await page.goto('about:blank');
  await page.setContent(fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8'));
  await selectEngine(page);
  await expect(page.locator('#engine-status')).toContainText('npm.cmd start');
  await page.selectOption('#opponent', 'local');
  await move(page, 'e2', 'e4');
  await expect(page.locator('#status')).toHaveText('Black to move');
});

test('bridge rejects command injection, unknown difficulty, and cross-site requests', async ({ request }) => {
  const fen = new Chess().fen();
  for (const data of [{ fen: fen + '\nquit', difficulty: 'easy' }, { fen, difficulty: 'unknown' }, { fen: 'invalid', difficulty: 'easy' }]) {
    const response = await request.post('http://127.0.0.1:4173/api/engine/move', { data });
    expect(response.status()).toBe(400);
  }
  const blocked = await request.get('http://127.0.0.1:4173/api/engine/status', { headers: { Origin: 'https://unrelated.example' } });
  expect(blocked.status()).toBe(403);
  const host = await request.get('http://127.0.0.1:4173/api/engine/status', { headers: { Host: 'unrelated.example:4173' } });
  expect(host.status()).toBe(403);
});

test('real Fairy Stockfish responds through the bridge and browser', async ({ page, request }) => {
  test.skip(!process.env.FAIRY_STOCKFISH_PATH, 'Set FAIRY_STOCKFISH_PATH to run native engine integration.');
  const status = await request.get('http://127.0.0.1:4173/api/engine/status');
  expect(status.ok()).toBe(true);
  expect((await status.json()).name).toContain('Fairy-Stockfish');
  await selectEngine(page);
  await expect(page.locator('#engine-status')).toContainText('connected');
  await page.selectOption('#difficulty', 'easy');
  await move(page, 'e2', 'e4');
  await expect(page.locator('#status')).toHaveText('White to move');
  await expect(page.locator('#history li span')).toHaveCount(2);
  await page.selectOption('#difficulty', 'hard');
  await move(page, 'g1', 'f3');
  await expect(page.locator('#engine-status')).toContainText('thinking');
  await page.getByRole('button', { name: 'Pause engine' }).click();
  await expect(page.locator('#engine-status')).toContainText('Engine paused');
  await page.getByRole('button', { name: 'Resume engine' }).click();
  await expect(page.locator('#status')).toHaveText('White to move');
});
