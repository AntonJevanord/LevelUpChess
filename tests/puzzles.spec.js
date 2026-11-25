const { test, expect } = require('@playwright/test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const examples = require('../src/puzzle-examples.json');
const { pieceLabel } = require('../src/puzzle-data');
const { inPanel } = require('./ui-panels');
const url = process.env.TEST_FILE_URL ? pathToFileURL(path.resolve(__dirname, '../index.html')).href : process.env.TEST_BASE_URL || 'http://127.0.0.1:4173';
const square = (page, name) => page.locator(`[data-square="${name}"]`);
async function openLibrary(page) {
  await page.locator('#open-menu').click();
  await page.locator('#menu-puzzles').click();
  await expect(page.locator('#puzzle-library')).toBeVisible();
}
async function selectPiece(page, category, id) {
  const details = page.locator(`#puzzle-filter-${category}`).locator('..');
  if (!await details.evaluate(element => element.open)) await details.locator('summary').click();
  await page.locator(`#puzzle-filter-${category} label`).filter({ has: page.getByText(pieceLabel(id), { exact: true }) }).locator('input').check();
}
test.beforeEach(async ({ page }) => { await page.goto(url); });

test('main menu and puzzle browsing retain the current game and work on a narrow screen', async ({ page }) => {
  await square(page, 'e2').click(); await square(page, 'e4').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await openLibrary(page);
  await expect(page.locator('.puzzle-card')).toHaveCount(examples.puzzles.length);
  await page.locator('#puzzle-min-moves').fill('2');
  await page.locator('#puzzle-max-moves').fill('1');
  await expect(page.locator('#puzzle-filter-error')).toContainText('minimum');
  await page.locator('#puzzle-clear-filters').click();
  await expect(page.locator('.puzzle-card')).toHaveCount(examples.puzzles.length);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#puzzle-library')).not.toBeVisible();
  await expect(square(page, 'e4')).toHaveAttribute('aria-label', 'e4 White pawn');
  await expect(page.locator('#status')).toHaveText('Black to move');
});

test('piece filters distinguish stationary involvement from movement in the solution', async ({ page }) => {
  const sample = examples.puzzles.find(puzzle => puzzle.pieces.stationary.length);
  expect(sample).toBeTruthy();
  const id = sample.pieces.stationary[0];
  await openLibrary(page);
  await selectPiece(page, 'involved', id);
  await expect(page.locator('.puzzle-card')).toHaveCount(examples.puzzles.filter(puzzle => puzzle.pieces.involved.includes(id)).length);
  await expect(page.locator(`.puzzle-card[data-puzzle-id="${sample.id}"]`)).toBeVisible();
  await selectPiece(page, 'moved', id);
  const expected = examples.puzzles.filter(puzzle => puzzle.pieces.involved.includes(id) && puzzle.pieces.moved.includes(id));
  await expect(page.locator('.puzzle-card')).toHaveCount(expected.length);
  await expect(page.locator(`.puzzle-card[data-puzzle-id="${sample.id}"]`)).toHaveCount(0);
});

test('a puzzle supports hints, legal wrong answers, solve, retry and return to the parked game', async ({ page }) => {
  await square(page, 'e2').click(); await square(page, 'e4').click();
  await openLibrary(page);
  await page.locator('.puzzle-card[data-puzzle-id="authored-queen-net"] button').click();
  await expect(page.locator('#puzzle-toolbar')).toBeVisible();
  await expect(page.locator('#puzzle-library')).not.toBeVisible();
  await page.locator('#puzzle-hint').click();
  await expect(page.locator('#puzzle-feedback')).toContainText(/hint/i);
  await square(page, 'g6').click(); await square(page, 'g5').click();
  await expect(square(page, 'g6')).toHaveAttribute('aria-label', 'g6 White queen');
  await square(page, 'g6').click(); await square(page, 'g7').click();
  await expect(page.locator('#puzzle-toolbar')).toHaveAttribute('data-status', 'solved');
  await page.locator('#puzzle-retry').click();
  await expect(page.locator('#puzzle-toolbar')).toHaveAttribute('data-status', 'playing');
  await expect(square(page, 'g6')).toHaveAttribute('aria-label', 'g6 White queen');
  await page.locator('#puzzle-reveal').click();
  await expect(page.locator('#puzzle-toolbar')).toHaveAttribute('data-status', 'revealed');
  await expect(page.locator('#puzzle-feedback')).toContainText('Qg7');
  await page.locator('#puzzle-leave').click();
  await expect(page.locator('#puzzle-toolbar')).not.toBeVisible();
  await expect(square(page, 'e4')).toHaveAttribute('aria-label', 'e4 White pawn');
  await expect(page.locator('#status')).toHaveText('Black to move');
});

test('a malformed pack import is contained and cannot replace the game or puzzle library', async ({ page }) => {
  await openLibrary(page);
  await page.locator('#puzzle-pack-file').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await expect(page.locator('#puzzle-import-status')).toContainText('Could not load');
  await expect(page.locator('.puzzle-card')).toHaveCount(examples.puzzles.length);
  await page.locator('#puzzle-library-close').click();
  await expect(page.locator('#board > .square > .piece')).toHaveCount(32);
});

test('time spent in puzzles does not consume the parked game clock', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-25T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-25T12:00:01Z'));
  await page.goto(url);
  await inPanel(page, 'setup', () => page.selectOption('#time-control', 'five'));
  await page.locator('#new-game').click();
  await page.locator('#clock-toggle').click();
  await page.clock.fastForward(12000);
  await square(page, 'e2').click(); await square(page, 'e4').click();
  await expect(page.locator('#white-clock')).toHaveText('04:48');
  await openLibrary(page);
  await page.locator('.puzzle-card[data-puzzle-id="authored-queen-net"] button').click();
  await expect(page.locator('#puzzle-toolbar')).toBeVisible();
  await page.clock.fastForward(60000);
  await page.locator('#puzzle-leave').click();
  await expect(page.locator('#white-clock')).toHaveText('04:48');
  await expect(page.locator('#black-clock')).toHaveText('05:00');
  await expect(page.locator('#clock-toggle')).toHaveText('Resume clock');
  await page.clock.fastForward(60000);
  await expect(page.locator('#black-clock')).toHaveText('05:00');
  await expect(square(page, 'e4')).toHaveAttribute('aria-label', 'e4 White pawn');
});

test('a valid imported pack adds a playable puzzle without replacing the original board', async ({ page }) => {
  const pack = JSON.parse(JSON.stringify(examples));
  pack.puzzles = [{ ...pack.puzzles[0], id: 'synthetic-import-example', title: 'Imported practice fixture' }];
  await openLibrary(page);
  await page.locator('#puzzle-pack-file').setInputFiles({ name: 'practice.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pack)) });
  await expect(page.locator('#puzzle-import-status')).toContainText('loaded');
  await expect(page.locator('.puzzle-card')).toHaveCount(examples.puzzles.length + 1);
  await page.locator('.puzzle-card[data-puzzle-id="synthetic-import-example"] button').click();
  await expect(page.locator('#puzzle-title')).toHaveText('Imported practice fixture');
  await square(page, 'g6').click(); await square(page, 'g7').click();
  await expect(page.locator('#puzzle-toolbar')).toHaveAttribute('data-status', 'solved');
  await page.locator('#puzzle-leave').click();
  await expect(page.locator('#board > .square > .piece')).toHaveCount(32);
});
