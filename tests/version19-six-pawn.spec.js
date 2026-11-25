const { test, expect } = require('@playwright/test');
const { inPanel } = require('./ui-panels');
const { PLAYABLE_LIBRARIES, getPlayableProfile } = require('../src/design-options');
const { VariantGame, initVariantRules } = require('../dist/rules-node.cjs');
const { placementFromMap } = require('../src/profile-fen');
const ID = 'pawn.level3-six-knight@1';
const library = PLAYABLE_LIBRARIES.find(row => row.id === 'v19-level3-current');
const profile = getPlayableProfile(library.variant);
const type = profile.registry.allocations.find(row => row.id === ID).letter.toUpperCase();
const square = (page, name) => page.locator(`#board [data-square="${name}"]`);
test.beforeAll(async () => { await initVariantRules(profile.variant); });
async function importPosition(page, pieces) {
  const game = new VariantGame(`${placementFromMap(new Map(Object.entries(pieces)))} w - - 0 1`, profile.variant);
  const pgn = game.pgn(); game.dispose();
  await inPanel(page, 'files', () => page.getByRole('button', { name: 'Import PGN', exact: true }).click());
  await page.locator('#pgn-text').fill(pgn); await page.getByRole('button', { name: 'Import game', exact: true }).click();
  await expect(page.locator('#import-dialog')).not.toBeVisible();
  if (await page.locator('#replace-dialog').isVisible()) await page.getByRole('button', { name: 'Replace game', exact: true }).click();
}

test('current L3 setup offers the red six-jump pawn alongside Herald and Ranger for three points', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173');
  await inPanel(page, 'setup', () => page.selectOption('#game-mode', profile.variant));
  await square(page, 'c2').click();
  for (const id of [ID, 'pawn.queen-sideways@1', 'pawn.purple@13']) await expect(page.locator(`#setup-picker [data-upgrade-id="${id}"]`)).toContainText('3 pt');
  await expect(page.locator(`#setup-picker [data-upgrade-id="${ID}"]`)).toHaveAttribute('data-accent', 'red');
  await page.locator(`#setup-picker [data-upgrade-id="${ID}"]`).click();
  await expect(page.locator('#experimental-status')).toContainText('White 3/6');
});

test('six knight destinations include wide backward jumps but exclude tall backward jumps through save and undo', async ({ page }, testInfo) => {
  await page.goto('http://127.0.0.1:4173');
  await importPosition(page, { a1: 'K', h8: 'k', d4: type, b3: 'p', c5: 'P', d5: 'P', e5: 'P' });
  await square(page, 'd4').click();
  await expect(square(page, 'b3').locator('.capture-marker')).toHaveCount(1);
  for (const name of ['b5', 'c6', 'e6', 'f3', 'f5']) await expect(square(page, name).locator('.move-marker[data-playable=true]')).toHaveCount(1);
  for (const name of ['c2', 'e2']) await expect(square(page, name).locator('.move-marker[data-playable=true],.capture-marker')).toHaveCount(0);
  await page.locator('#board-stage').screenshot({ path: testInfo.outputPath('six-jump-pawn.png') });
  await square(page, 'b3').click(); await expect(square(page, 'b3')).toHaveAttribute('data-design-id', ID);
  await inPanel(page, 'files', () => page.getByRole('button', { name: 'Save game', exact: true }).click());
  await page.reload(); await inPanel(page, 'files', () => page.getByRole('button', { name: 'Load saved', exact: true }).click());
  await expect(page.locator('#game-mode')).toHaveValue(profile.variant);
  await expect(square(page, 'b3')).toHaveAttribute('data-design-id', ID);
  await page.getByRole('button', { name: /Undo move/ }).click();
  await expect(square(page, 'd4')).toHaveAttribute('data-design-id', ID);
  await expect(square(page, 'b3')).toHaveAttribute('aria-label', 'b3 Black pawn');
});

test('the six-jump pawn still uses the ordinary promotion picker', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173');
  await importPosition(page, { a1: 'K', h6: 'k', b7: type, c8: 'r' });
  await square(page, 'b7').click(); await square(page, 'b8').click();
  await expect(page.locator('#promotion')).toBeVisible();
  await expect(page.locator('#promotion-options button')).toHaveCount(4);
  await page.getByRole('button', { name: 'Promote to queen', exact: true }).click();
  await expect(square(page, 'b8')).toHaveAttribute('aria-label', 'b8 White queen');
  await page.getByRole('button', { name: /Undo move/ }).click();
  await expect(square(page, 'b7')).toHaveAttribute('data-design-id', ID);
});

test('the native bridge plays the current L3 profile with six-jump pawns and controlled values', async ({ page }) => {
  test.skip(!process.env.FAIRY_STOCKFISH_PATH, 'Set FAIRY_STOCKFISH_PATH for native integration.');
  await page.goto('http://127.0.0.1:4173');
  await inPanel(page, 'setup', () => page.selectOption('#game-mode', profile.variant));
  for (const name of ['c2', 'c7']) { await square(page, name).click(); await page.locator(`#setup-picker [data-upgrade-id="${ID}"]`).click(); }
  await page.locator('#new-game').click();
  if (await page.locator('#restart').isVisible()) await page.getByRole('button', { name: 'Start new game', exact: true }).click();
  await inPanel(page, 'setup', () => page.selectOption('#opponent', 'engine'));
  await expect(page.locator('#engine-status')).toContainText('connected', { timeout: 20000 });
  await inPanel(page, 'setup', () => page.selectOption('#difficulty', 'easy'));
  const response = page.waitForResponse(value => value.url().endsWith('/api/engine/move'));
  await square(page, 'e2').click(); await square(page, 'e4').click();
  const received = await response, request = received.request().postDataJSON(), answer = await received.json();
  expect(received.status()).toBe(200); expect(request.variant).toBe(profile.variant);
  expect(request.profileHash).toBe(profile.hash); expect(request.registryHash).toBe(profile.registryHash);
  const game = new VariantGame(request.fen, profile.variant);
  try { expect(game.moves({ verbose: true }).map(move => move.uci)).toContain(answer.move); }
  finally { game.dispose(); }
  await expect(page.locator('#history li span')).toHaveCount(2);
});
