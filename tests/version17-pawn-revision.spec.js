const { test, expect } = require('@playwright/test');
const { PLAYABLE_LIBRARIES } = require('../src/design-options');

const library = PLAYABLE_LIBRARIES.find(item => item.id === 'v17-pawns-revised');
const initial = PLAYABLE_LIBRARIES.find(item => item.id === 'v17-pawns');
const bishop = 'pawn.bishop-step-current@1';
const square = (page, name) => page.locator(`#board [data-square="${name}"]`);

test('the current pawn workshop prices Bishop pawn at two points and keeps its initial workshop accessible', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173');
  const entries = await page.locator('#game-mode option').evaluateAll(options => options.map(option => option.textContent));
  expect(entries.indexOf('Version 17 · Pawn workshop')).toBeLessThan(entries.indexOf('Version 17 · Pawn workshop (initial)'));
  await page.selectOption('#game-mode', library.variant);
  await page.locator('#experimental-budget').fill('3');
  await square(page, 'c2').click();
  const picker = page.locator('#setup-picker');
  await expect(picker.locator(`[data-upgrade-id="${bishop}"]`)).toContainText('2 pt');
  await expect(picker.locator('[data-upgrade-id="pawn.blue@5"]')).toContainText('1 pt');
  await expect(picker.locator('[data-upgrade-id="pawn.blue@7"]')).toContainText('1 pt');
  await expect(picker.locator('[data-upgrade-id="pawn.blue@2"]')).toHaveCount(0);
  await expect(picker.locator('[data-upgrade-id="pawn.blue@3"]')).toHaveCount(0);
  await picker.locator(`[data-upgrade-id="${bishop}"]`).click();
  await square(page, 'd2').click();
  await picker.locator('[data-upgrade-id="pawn.blue@5"]').click();
  await expect(page.locator('#experimental-status')).toContainText('White 3/3 · Black 0/3');
  await page.locator('#new-game').click();
  if (await page.locator('#restart').isVisible()) await page.getByRole('button', { name: 'Start new game', exact: true }).click();
  await expect(square(page, 'c2')).toHaveAttribute('data-design-id', bishop);
  await expect(square(page, 'c2').locator('.piece-level')).toHaveText('L2');
  await expect(square(page, 'd2').locator('.piece-level')).toHaveText('L1');
  await expect(square(page, 'e1')).toHaveAttribute('aria-label', 'e1 White king');

  await page.selectOption('#game-mode', initial.variant);
  await square(page, 'c2').click();
  await expect(picker.locator('[data-upgrade-id="pawn.blue@2"]')).toContainText('1 pt');
  await expect(picker.locator('[data-upgrade-id="pawn.blue@3"]')).toContainText('1 pt');
});
