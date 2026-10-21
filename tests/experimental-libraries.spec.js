const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const { PLAYABLE_PROFILES } = require('../src/design-options');

const [workshop, reference] = PLAYABLE_PROFILES;
const square = (page, name) => page.locator(`[data-square="${name}"]`);
async function choose(page, family, name, id) {
  await page.selectOption('#experimental-family', family);
  await page.selectOption(`#experimental-upgrade-${name}`, id);
}
async function move(page, from, to) { await square(page, from).click(); await square(page, to).click(); }
async function start(page) {
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  if (await page.locator('#restart').isVisible()) await page.getByRole('button', { name: 'Start new game', exact: true }).click();
  await expect(page.locator('#board')).toHaveClass(/experimental-board/);
}
async function pgnDownload(page) {
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PGN', exact: true }).click();
  return fs.readFile(await (await waiting).path(), 'utf8');
}
async function importPgn(page, pgn) {
  await page.getByRole('button', { name: 'Import PGN', exact: true }).click();
  await page.locator('#pgn-text').fill(pgn);
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
  await expect(page.locator('#import-dialog')).not.toBeVisible();
  if (await page.locator('#replace-dialog').isVisible()) await page.getByRole('button', { name: 'Replace game', exact: true }).click();
}

test.beforeEach(async ({ page }) => { await page.goto('http://127.0.0.1:4173'); });

test('switching libraries keeps shared choices, clears unavailable choices, and leaves the current board intact', async ({ page }) => {
  await expect(page.locator(`#game-mode option[value="${workshop.variant}"]`)).toHaveText('Experiments · Mobility and pairs');
  await expect(page.locator(`#game-mode option[value="${reference.variant}"]`)).toHaveText('Experiments · First prototypes');
  await page.selectOption('#game-mode', workshop.variant);
  await choose(page, 'pawn', 'a2', 'pawn.purple@5');
  await choose(page, 'queen', 'd1', 'queen.purple@3');
  await start(page);
  await expect(square(page, 'd2')).toHaveAttribute('data-design-id', 'queen.purple@3');
  await page.selectOption('#game-mode', reference.variant);
  await expect(page.locator('#experimental-upgrade-a2')).toHaveValue('pawn.purple@5');
  await expect(page.locator('#experimental-upgrade-d1')).toHaveValue('');
  await expect(page.locator('#experimental-status')).toContainText('White 3/6 · Black 0/6');
  await expect(square(page, 'd2')).toHaveAttribute('data-design-id', 'queen.purple@3');
  await choose(page, 'bishop', 'c1', 'bishop.blue@1');
  await page.selectOption('#game-mode', workshop.variant);
  await expect(page.locator('#experimental-upgrade-c1')).toHaveValue('');
  await expect(page.locator('#experimental-upgrade-a2')).toHaveValue('pawn.purple@5');
  await expect(page.locator('#experimental-status')).toContainText('White 3/6 · Black 0/6');
  await expect(square(page, 'd2')).toHaveAttribute('data-design-id', 'queen.purple@3');
  await start(page);
  await expect(square(page, 'd2')).toHaveAttribute('aria-label', 'd2 White pawn');
  await expect(square(page, 'a2')).toHaveAttribute('data-design-id', 'pawn.purple@5');
});

test('both queen packages place two capturable units, push their pawn, and survive save, PGN and undo', async ({ page }) => {
  test.setTimeout(60000);
  await page.selectOption('#game-mode', workshop.variant);
  await choose(page, 'queen', 'd1', 'queen.purple@2');
  await choose(page, 'queen', 'd8', 'queen.purple@3');
  await expect(page.locator('#experimental-status')).toContainText('White 3/6 · Black 3/6');
  await start(page);
  for (const name of ['d1', 'd2']) await expect(square(page, name)).toHaveAttribute('data-design-id', 'queen.purple@2');
  await expect(square(page, 'd3')).toHaveAttribute('aria-label', 'd3 White pawn');
  await expect(square(page, 'd8')).toHaveAttribute('aria-label', 'd8 Black queen');
  await expect(square(page, 'd7')).toHaveAttribute('data-design-id', 'queen.purple@3');
  await expect(square(page, 'd6')).toHaveAttribute('aria-label', 'd6 Black pawn');
  await expect(square(page, 'e1')).toHaveAttribute('aria-label', 'e1 White king');
  await expect(square(page, 'e8')).toHaveAttribute('aria-label', 'e8 Black king');
  await expect(page.locator('#board .piece')).toHaveCount(34);
  await move(page, 'd2', 'f4');
  await move(page, 'd7', 'e6');
  await expect(page.locator('#history li span')).toHaveCount(2);
  const pgn = await pgnDownload(page);
  expect(pgn).toContain(`[Variant "${workshop.variant}"]`);
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Load saved', exact: true }).click();
  await expect(page.locator('#game-mode')).toHaveValue(workshop.variant);
  await expect(square(page, 'f4')).toHaveAttribute('data-design-id', 'queen.purple@2');
  await expect(square(page, 'e6')).toHaveAttribute('data-design-id', 'queen.purple@3');
  await expect(page.locator('#experimental-upgrade-d1')).toHaveValue('queen.purple@2');
  await expect(page.locator('#experimental-upgrade-d8')).toHaveValue('queen.purple@3');
  await page.reload();
  await importPgn(page, pgn);
  await expect(page.locator('#game-mode')).toHaveValue(workshop.variant);
  await expect(square(page, 'f4')).toHaveAttribute('data-design-id', 'queen.purple@2');
  await expect(square(page, 'e6')).toHaveAttribute('data-design-id', 'queen.purple@3');
  await page.getByRole('button', { name: '↶ Undo move', exact: true }).click();
  await expect(square(page, 'd7')).toHaveAttribute('data-design-id', 'queen.purple@3');
  await expect(square(page, 'e6')).not.toHaveAttribute('data-design-id', 'queen.purple@3');
});

test('loading an original-library save restores that library and its distinct choices', async ({ page }) => {
  test.setTimeout(60000);
  await page.selectOption('#game-mode', reference.variant);
  await choose(page, 'pawn', 'b2', 'pawn.purple@6');
  await choose(page, 'knight', 'b1', 'knight.purple@2');
  await start(page);
  const pgn = await pgnDownload(page);
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await page.reload();
  await page.selectOption('#game-mode', workshop.variant);
  await page.getByRole('button', { name: 'Load saved', exact: true }).click();
  await expect(page.locator('#game-mode')).toHaveValue(reference.variant);
  await expect(page.locator('#experimental-upgrade-b2')).toHaveValue('pawn.purple@6');
  for (const name of ['b3', 'b4']) await expect(square(page, name)).toHaveAttribute('data-design-id', 'pawn.purple@6');
  await page.reload();
  await importPgn(page, pgn);
  await expect(page.locator('#game-mode')).toHaveValue(reference.variant);
  await expect(page.locator('#experimental-upgrade-b2')).toHaveValue('pawn.purple@6');
  await expect(square(page, 'b2')).toHaveAttribute('data-design-id', 'knight.purple@2');
});
