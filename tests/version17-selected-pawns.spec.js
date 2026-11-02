const { test, expect } = require('@playwright/test');
const { PLAYABLE_LIBRARIES, getPlayableProfile } = require('../src/design-options');

const library = PLAYABLE_LIBRARIES.find(item => item.id === 'v17-pawns-selected');
const profile = getPlayableProfile(library.variant);
const ids = { knight: 'pawn.orange@3', rank: 'pawn.rank-current@1', grant: 'king.reserve-bishop@1' };
const square = (page, name) => page.locator(`#board [data-square="${name}"]`);
const type = id => profile.registry.allocations.find(item => item.id === id).letter;
async function choose(page, name, id) {
  await square(page, name).click();
  await page.locator(`#setup-picker [data-upgrade-id="${id}"]`).click();
}
async function start(page) {
  await page.locator('#new-game').click();
  if (await page.locator('#restart').isVisible()) await page.getByRole('button', { name: 'Start new game', exact: true }).click();
}

test('the preferred workshop offers selected level-two pawns and the diagonal grant without hiding earlier workshops', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173');
  const options = page.locator('#game-mode option');
  const entries = await options.evaluateAll(items => items.map(item => ({ value: item.value, label: item.textContent })));
  const selectedIndex = entries.findIndex(item => item.value === library.variant);
  expect(selectedIndex).toBeGreaterThan(-1);
  expect(selectedIndex).toBeLessThan(entries.findIndex(item => item.label === 'Version 17 · Pawn workshop (bishop trial)'));
  expect(selectedIndex).toBeLessThan(entries.findIndex(item => item.label === 'Version 17 · Pawn workshop (initial)'));
  await page.selectOption('#game-mode', library.variant);
  await page.locator('#experimental-budget').fill('6');
  await square(page, 'c2').click();
  const picker = page.locator('#setup-picker');
  for (const [id, accent] of [[ids.knight, 'yellow'], [ids.rank, 'orange']]) {
    const choice = picker.locator(`[data-upgrade-id="${id}"]`);
    await expect(choice).toContainText('2 pt');
    await expect(choice).toHaveAttribute('data-accent', accent);
  }
  await expect(picker.locator('[data-upgrade-id="pawn.bishop-step-current@1"]')).toHaveCount(0);
  await picker.locator(`[data-upgrade-id="${ids.rank}"]`).click();
  await choose(page, 'b2', ids.knight);
  await square(page, 'e1').click();
  await expect(picker.locator(`[data-upgrade-id="${ids.grant}"]`)).toHaveAttribute('data-accent', 'green');
  await picker.locator(`[data-upgrade-id="${ids.grant}"]`).click();
  await expect(page.locator('#experimental-status')).toContainText('White 6/6 · Black 0/6');
  await start(page);
  await expect(square(page, 'c2')).toHaveAttribute('data-design-id', ids.rank);
  await expect(square(page, 'c2').locator('.piece-level.orange')).toHaveText('L2');
  await expect(square(page, 'b2').locator('.piece-level.yellow')).toHaveText('L2');
  await expect(square(page, 'e1')).toHaveAttribute('aria-label', 'e1 White king');
  await expect(page.locator(`[data-pocket-color="w"][data-pocket-type="${type(ids.grant)}"]`)).toBeVisible();
});

test('a Rank pawn advances and slides sideways on the board, and undo restores its previous position', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173');
  await page.selectOption('#game-mode', library.variant);
  await choose(page, 'c2', ids.rank);
  await choose(page, 'c7', ids.rank);
  await start(page);
  for (const [from, to] of [['c2', 'c4'], ['c7', 'c5'], ['c4', 'a4']]) {
    await square(page, from).click();
    await square(page, to).click();
  }
  await expect(square(page, 'a4')).toHaveAttribute('data-design-id', ids.rank);
  await expect(square(page, 'c5')).toHaveAttribute('data-design-id', ids.rank);
  await page.locator('#undo').click();
  await expect(square(page, 'c4')).toHaveAttribute('data-design-id', ids.rank);
  await expect(square(page, 'a4')).not.toHaveAttribute('data-design-id', ids.rank);
});
