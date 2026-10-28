const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const { VariantGame, initVariantRules } = require('../dist/rules-node.cjs');
const { PLAYABLE_LIBRARIES, getPlayableProfile } = require('../src/design-options');
const { placementFromMap } = require('../src/profile-fen');

const library = PLAYABLE_LIBRARIES.find(item => item.id === 'v17-pawns');
const archived = PLAYABLE_LIBRARIES.find(item => item.id === 'v16-pawns');
const profile = library && getPlayableProfile(library.variant);
const ids = { twoStep: 'pawn.blue@5', kingStep: 'pawn.blue@7', grant: 'king.reserve-pawn@6' };
const type = id => profile.registry.allocations.find(allocation => allocation.id === id).letter;
const square = (page, name) => page.locator(`#board [data-square="${name}"]`);
const marker = (page, name) => square(page, name).locator('.move-marker, .capture-marker');
const pocket = (page, color) => page.locator(`[data-pocket-color="${color}"][data-pocket-type="${type(ids.grant)}"]`);
async function choose(page, name, id) {
  await square(page, name).click();
  await page.locator(`#setup-picker [data-upgrade-id="${id}"]`).click();
}
async function move(page, from, to) { await square(page, from).click(); await square(page, to).click(); }
async function start(page) {
  await page.locator('#new-game').click();
  if (await page.locator('#restart').isVisible()) await page.getByRole('button', { name: 'Start new game', exact: true }).click();
  await expect(page.locator('#board')).toHaveClass(/experimental-board/);
}
async function importPgn(page, pgn) {
  await page.getByRole('button', { name: 'Import PGN', exact: true }).click();
  await page.locator('#pgn-text').fill(pgn);
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
  await expect(page.locator('#import-dialog')).not.toBeVisible();
  if (await page.locator('#replace-dialog').isVisible()) await page.getByRole('button', { name: 'Replace game', exact: true }).click();
}
async function importPosition(page, pieces, turn = 'w') {
  const map = new Map(Object.entries(pieces)); map.pocket = '';
  const game = new VariantGame(`${placementFromMap(map)} ${turn} - - 0 1`, library.variant);
  try { await importPgn(page, game.pgn()); } finally { game.dispose(); }
}

test.beforeAll(async () => {
  expect(library, 'The current pawn workshop is bundled.').toBeTruthy();
  await initVariantRules(library.variant);
});
test.beforeEach(async ({ page }) => { await page.goto('http://127.0.0.1:4173'); });

test('current pawn setup offers both one-point pawns and the mobile grant, with save/PGN/undo preserving their profile', async ({ page }) => {
  test.setTimeout(60000);
  const entries = await page.locator('#game-mode option').evaluateAll(options => options.map(option => option.textContent));
  expect(entries.indexOf('Version 17 · Pawn workshop')).toBeLessThan(entries.indexOf('Version 16 · Pawn workshop'));
  await page.selectOption('#game-mode', library.variant);
  await page.locator('#experimental-budget').fill('3');
  await square(page, 'c2').click();
  await expect(page.locator(`#setup-picker [data-upgrade-id="${ids.twoStep}"]`)).toContainText('1 pt');
  await expect(page.locator(`#setup-picker [data-upgrade-id="${ids.kingStep}"]`)).toContainText('1 pt');
  await expect(page.locator('#setup-picker [data-upgrade-id="pawn.orange@4"]')).toHaveCount(0);
  await page.locator(`#setup-picker [data-upgrade-id="${ids.twoStep}"]`).click();
  await choose(page, 'd2', ids.kingStep);
  await choose(page, 'e1', ids.grant);
  await expect(page.locator('#experimental-status')).toContainText('White 3/3 · Black 0/3');
  await start(page);
  await expect(square(page, 'c2')).toHaveAttribute('data-design-id', ids.twoStep);
  await expect(square(page, 'd2')).toHaveAttribute('data-design-id', ids.kingStep);
  await expect(square(page, 'c2').locator('.piece-level')).toHaveText('L1');
  await expect(square(page, 'd2').locator('.piece-level')).toHaveText('L1');
  await expect(square(page, 'e1')).toHaveAttribute('aria-label', 'e1 White king');
  await expect(pocket(page, 'w')).toBeVisible();
  await pocket(page, 'w').click();
  await square(page, 'e4').click();
  await move(page, 'a7', 'a6');
  await square(page, 'e4').click();
  await expect(marker(page, 'f5')).toHaveCount(1);
  await square(page, 'f5').click();
  await expect(square(page, 'f5')).toHaveAttribute('data-design-id', ids.grant);

  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PGN', exact: true }).click();
  const pgn = await fs.readFile(await (await waiting).path(), 'utf8');
  expect(pgn).toContain(`[Variant "${library.variant}"]`);
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Load saved', exact: true }).click();
  await expect(page.locator('#game-mode')).toHaveValue(library.variant);
  await expect(square(page, 'f5')).toHaveAttribute('data-design-id', ids.grant);
  for (const [name, id] of [['c2', ids.twoStep], ['d2', ids.kingStep], ['e1', ids.grant]]) {
    await expect(page.locator(`#experimental-upgrade-${name}`)).toHaveValue(id);
  }
  await page.getByRole('button', { name: /Undo move/ }).click();
  await expect(square(page, 'e4')).toHaveAttribute('data-design-id', ids.grant);
  await expect(square(page, 'f5')).toHaveAttribute('aria-label', 'f5 empty');
  await importPgn(page, pgn);
  await expect(square(page, 'f5')).toHaveAttribute('data-design-id', ids.grant);
  await expect(pocket(page, 'w')).toHaveCount(0);
});

test('the current grant has quiet forward diagonals but cannot capture diagonally, mirrored for Black', async ({ page }) => {
  const grant = type(ids.grant);
  await importPosition(page, { h1: 'K', h8: 'k', d4: grant.toUpperCase(), c5: 'p', d5: 'p' });
  await square(page, 'd4').click();
  await expect(marker(page, 'e5')).toHaveCount(1);
  await expect(marker(page, 'd5')).toHaveCount(1);
  await expect(marker(page, 'c5')).toHaveCount(0);
  await square(page, 'e5').click();
  await expect(square(page, 'e5')).toHaveAttribute('data-design-id', ids.grant);
  await expect(square(page, 'c5')).toHaveAttribute('aria-label', 'c5 Black pawn');

  await importPosition(page, { h1: 'K', h8: 'k', d5: grant, c4: 'P', d4: 'P' }, 'b');
  await square(page, 'd5').click();
  await expect(marker(page, 'e4')).toHaveCount(1);
  await expect(marker(page, 'd4')).toHaveCount(1);
  await expect(marker(page, 'c4')).toHaveCount(0);
  await square(page, 'e4').click();
  await expect(square(page, 'e4')).toHaveAttribute('data-design-id', ids.grant);
  await expect(square(page, 'c4')).toHaveAttribute('aria-label', 'c4 White pawn');
});

test('the version-16 pawn workshop remains an explicit historical choice', async ({ page }) => {
  await page.selectOption('#game-mode', archived.variant);
  await square(page, 'd2').click();
  await expect(page.locator('#setup-picker [data-upgrade-id="pawn.orange@4"]')).toContainText('2 pts');
  await expect(page.locator(`#setup-picker [data-upgrade-id="${ids.twoStep}"]`)).toHaveCount(0);
});
