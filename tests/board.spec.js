const { test, expect } = require('@playwright/test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const url = process.env.TEST_FILE_URL ? pathToFileURL(path.resolve(__dirname, '../index.html')).href : 'http://127.0.0.1:4173';
const square = (page, name) => page.locator(`[data-square="${name}"]`);
async function move(page, from, to) { await square(page, from).click(); await square(page, to).click(); }
test.beforeEach(async ({ page }) => { await page.goto(url); });

test('offline opening, illegal moves, undo, flip, and restart', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.locator('.square')).toHaveCount(64);
  await expect(page.locator('.piece')).toHaveCount(32);
  await move(page, 'e2', 'e5');
  await expect(square(page, 'e2')).toHaveAttribute('aria-label', 'e2 White pawn');
  await move(page, 'e2', 'e4');
  await expect(page.locator('#status')).toHaveText('Black to move');
  await expect(page.locator('#history')).toContainText('e4');
  await page.getByRole('button', { name: 'Undo move' }).click();
  await expect(page.locator('#status')).toHaveText('White to move');
  await page.getByRole('button', { name: 'Flip board' }).click();
  await expect(page.locator('.square').first()).toHaveAttribute('data-square', 'h1');
  await move(page, 'd2', 'd4');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByRole('button', { name: 'Keep playing' }).click();
  await expect(page.locator('#history')).toContainText('d4');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByRole('button', { name: 'Start new game', exact: true }).click();
  await expect(page.locator('#history li')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('checkmate stops play and undo reopens it', async ({ page }) => {
  for (const [a,b] of [['f2','f3'],['e7','e5'],['g2','g4'],['d8','h4']]) await move(page,a,b);
  await expect(page.locator('#status')).toHaveText('Black wins by checkmate');
  await move(page,'a2','a3');
  await expect(page.locator('#history li')).toHaveCount(2);
  await page.getByRole('button', { name: 'Undo move' }).click();
  await expect(page.locator('#status')).toHaveText('Black to move');
});

test('castling moves both king and rook', async ({ page }) => {
  for (const [a,b] of [['e2','e4'],['e7','e5'],['g1','f3'],['b8','c6'],['f1','c4'],['g8','f6'],['e1','g1']]) await move(page,a,b);
  await expect(square(page,'f1')).toHaveAttribute('aria-label','f1 White rook');
  await expect(square(page,'g1')).toHaveAttribute('aria-label','g1 White king');
  await expect(page.locator('#history')).toContainText('O-O');
});

test('en passant removes the bypassed pawn', async ({ page }) => {
  for (const [a,b] of [['e2','e4'],['a7','a6'],['e4','e5'],['d7','d5'],['e5','d6']]) await move(page,a,b);
  await expect(square(page,'d5')).toHaveAttribute('aria-label','d5 empty');
  await expect(square(page,'d6')).toHaveAttribute('aria-label','d6 White pawn');
});

test('promotion offers a choice and supports underpromotion', async ({ page }) => {
  for (const [a,b] of [['a2','a4'],['h7','h5'],['a4','a5'],['h5','h4'],['a5','a6'],['h4','h3'],['a6','b7'],['h3','g2'],['b7','a8']]) await move(page,a,b);
  await expect(page.locator('#promotion')).toBeVisible();
  await page.getByRole('button', { name: 'Promote to knight' }).click();
  await expect(square(page,'a8')).toHaveAttribute('aria-label','a8 White knight');
  await expect(page.locator('#status')).toHaveText('Black to move');
});

test('threefold repetition ends the game', async ({ page }) => {
  for (let i=0;i<2;i++) for (const [a,b] of [['g1','f3'],['g8','f6'],['f3','g1'],['f6','g8']]) await move(page,a,b);
  await expect(page.locator('#status')).toHaveText('Draw by repetition');
});

test('keyboard selection and mobile layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await square(page,'e2').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(square(page,'e3')).toHaveAttribute('aria-label','e3 White pawn');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('standalone HTML contains its styling and logic without companion requests', async ({ page }) => {
  const fs = require('node:fs');
  const requests = [];
  await page.route('**/*', route => {
    requests.push(route.request().url());
    return route.abort();
  });
  // A fresh document containing only the exported HTML, with no asset server.
  await page.goto('about:blank');
  await page.setContent(fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8'));
  await expect(page.locator('.square')).toHaveCount(64);
  await expect(page.locator('#board')).toHaveCSS('display', 'grid');
  await move(page, 'e2', 'e4');
  await expect(page.locator('#status')).toHaveText('Black to move');
  expect(requests).toEqual([]);
});
