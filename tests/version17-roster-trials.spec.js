const { test, expect } = require('@playwright/test');
const { PLAYABLE_LIBRARIES, getPlayableProfile } = require('../src/design-options');
const { VariantGame, initVariantRules } = require('../dist/rules-node.cjs');
const { placementFromMap } = require('../src/profile-fen');

const library = PLAYABLE_LIBRARIES.find(item => item.id === 'v17-roster-trials');
const profile = getPlayableProfile(library.variant);
const ids = { bishop: 'bishop.vertical-blocked@1', pawn: 'pawn.queen-sideways@1', queen: 'queen.xray-rook@1',
  king: 'king.grant-king-level3@1', orthogonal: 'king.grant-orthogonal-three-level3@1', knight: 'king.grant-knight-level3@1' };
const type = id => profile.registry.allocations.find(item => item.id === id).letter;
const square = (page, name) => page.locator(`#board [data-square="${name}"]`);
const marker = (page, name) => square(page, name).locator('.move-marker, .capture-marker');
async function choose(page, name, id) {
  await square(page, name).click();
  await page.locator(`#setup-picker [data-upgrade-id="${id}"]`).click();
}
async function start(page) {
  await page.locator('#new-game').click();
  if (await page.locator('#restart').isVisible()) await page.getByRole('button', { name: 'Start new game', exact: true }).click();
}

test.beforeAll(() => initVariantRules(library.variant));

test('the combined roster appears first and offers accepted pieces plus three distinct three-point grants', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173');
  const entries = await page.locator('#game-mode option').evaluateAll(options => options.map(option => ({ value: option.value, label: option.textContent })));
  expect(entries.findIndex(item => item.value === library.variant)).toBeLessThan(entries.findIndex(item => item.label === 'Version 17 · Pawn workshop'));
  expect(entries.some(item => item.label === 'Version 17 · Pawn workshop (bishop trial)')).toBe(true);
  await page.selectOption('#game-mode', library.variant);
  await page.locator('#experimental-budget').fill('9');
  await square(page, 'e1').click();
  const picker = page.locator('#setup-picker');
  for (const [id, name] of [[ids.king, 'King-step grant'], [ids.orthogonal, 'Three-step Orthogonal grant'], [ids.knight, 'Knight grant']]) {
    const choice = picker.locator(`[data-upgrade-id="${id}"]`);
    await expect(choice).toContainText(name);
    await expect(choice).toContainText('3 pt');
    await expect(choice).toHaveAttribute('data-accent', 'yellow');
  }
  await expect(picker.locator('[data-upgrade-id="king.reserve-king@1"]')).toHaveCount(0);
  await picker.locator(`[data-upgrade-id="${ids.king}"]`).click();
  await choose(page, 'c1', ids.bishop);
  await choose(page, 'b2', ids.pawn);
  await choose(page, 'd8', ids.queen);
  await choose(page, 'h8', 'rook.purple@12');
  await choose(page, 'e8', ids.knight);
  await expect(page.locator('#experimental-status')).toContainText('White 9/9 · Black 9/9');
  await start(page);
  for (const [name, id] of [['c1', ids.bishop], ['b2', ids.pawn], ['d8', ids.queen], ['h8', 'rook.purple@12']]) {
    await expect(square(page, name)).toHaveAttribute('data-design-id', id);
    await expect(square(page, name).locator('.piece-level.purple')).toHaveText('L3');
  }
  for (const [name, color] of [['e1', 'White'], ['e8', 'Black']]) await expect(square(page, name)).toHaveAttribute('aria-label', `${name} ${color} king`);
  await expect(page.locator(`[data-pocket-color="w"][data-pocket-type="${type(ids.king)}"]`)).toHaveAttribute('data-accent', 'yellow');
  await expect(page.locator(`[data-pocket-color="b"][data-pocket-type="${type(ids.knight)}"]`)).toHaveAttribute('data-accent', 'yellow');
});

test('Rook-ray captures cross one hurdle, stop at the next piece and remain portable', async ({ page }) => {
  const fen = `${placementFromMap(new Map(Object.entries({ a1: 'K', h7: 'k', d4: type(ids.queen).toUpperCase(), e4: 'P', g4: 'p', h4: 'p' })))} w - - 0 1`;
  const game = new VariantGame(fen, library.variant);
  const pgn = game.pgn(); game.dispose();
  await page.goto('http://127.0.0.1:4173');
  await page.getByRole('button', { name: 'Import PGN', exact: true }).click();
  await page.locator('#pgn-text').fill(pgn);
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
  if (await page.locator('#replace-dialog').isVisible()) await page.getByRole('button', { name: 'Replace game', exact: true }).click();
  await expect(page.locator('#import-dialog')).not.toBeVisible();
  await square(page, 'd4').click();
  for (const name of ['f4', 'g4']) await expect(marker(page, name)).toHaveCount(1);
  for (const name of ['h4', 'f5', 'e6']) await expect(marker(page, name)).toHaveCount(0);
  await square(page, 'g4').click();
  await expect(square(page, 'g4')).toHaveAttribute('data-design-id', ids.queen);
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Load saved', exact: true }).click();
  await expect(page.locator('#game-mode')).toHaveValue(library.variant);
  await expect(square(page, 'g4')).toHaveAttribute('data-design-id', ids.queen);
  await page.getByRole('button', { name: /Undo move/ }).click();
  await expect(square(page, 'd4')).toHaveAttribute('data-design-id', ids.queen);
  await expect(square(page, 'g4')).toHaveAttribute('aria-label', 'g4 Black pawn');
});

test('the Rook-ray queen cannot start the rejected diagonal-hop opening through its e-pawn', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173');
  await page.selectOption('#game-mode', library.variant);
  await choose(page, 'd1', ids.queen);
  await start(page);
  await square(page, 'd1').click();
  await expect(marker(page, 'h5')).toHaveCount(0);
  await expect(marker(page, 'd3')).toHaveCount(1);
  await expect(square(page, 'e2')).toHaveAttribute('aria-label', 'e2 White pawn');
});
