const { test, expect } = require('@playwright/test');
const { EXPERIMENTAL_VARIANT } = require('../src/design-options');

const square = (page, name) => page.locator(`[data-square="${name}"]`);
async function choose(page, family, name, id) {
  await page.selectOption('#experimental-family', family);
  await page.selectOption(`#experimental-upgrade-${name}`, id);
}

test.beforeEach(async ({ page }) => { await page.goto('http://127.0.0.1:4173'); });

test('clear one or both experimental armies across hidden families, then reset the board with New game', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#army-reset-settings')).not.toBeVisible();
  await page.selectOption('#game-mode', EXPERIMENTAL_VARIANT);
  await choose(page, 'rook', 'a1', 'rook.purple@2');
  await choose(page, 'pawn', 'b2', 'pawn.purple@4');
  await choose(page, 'knight', 'g8', 'knight.purple@2');
  await choose(page, 'pawn', 'a7', 'pawn.blue@1');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await expect(square(page, 'a1')).toHaveAttribute('data-design-id', 'rook.purple@2');
  await square(page, 'b2').click();
  await square(page, 'b3').click();
  await expect(page.locator('#history li span')).toHaveCount(1);

  await page.getByRole('button', { name: 'Clear White', exact: true }).click();
  await expect(page.locator('#experimental-upgrade-a1')).toHaveValue('');
  await expect(page.locator('#experimental-upgrade-b2')).toHaveValue('');
  await expect(page.locator('#experimental-upgrade-g8')).toHaveValue('knight.purple@2');
  await expect(page.locator('#experimental-upgrade-a7')).toHaveValue('pawn.blue@1');
  await expect(page.locator('#experimental-status')).toContainText('White 0/6 · Black 4/6');
  await expect(square(page, 'a1')).toHaveAttribute('data-design-id', 'rook.purple@2');
  await expect(square(page, 'b3')).toHaveAttribute('data-design-id', 'pawn.purple@4');
  await expect(page.locator('#history li span')).toHaveCount(1);
  await expect(page.locator('#army-reset-status')).toContainText('New game');

  await page.getByRole('button', { name: 'Clear Black', exact: true }).click();
  await expect(page.locator('#experimental-upgrade-g8')).toHaveValue('');
  await expect(page.locator('#experimental-upgrade-a7')).toHaveValue('');
  await choose(page, 'bishop', 'c1', 'bishop.blue@1');
  await choose(page, 'queen', 'd8', 'queen.purple@1');
  await page.getByRole('button', { name: 'Clear both', exact: true }).click();
  const viewportWidth = page.viewportSize().width;
  for (const id of ['#clear-white-army', '#clear-black-army', '#clear-both-armies']) {
    const bounds = await page.locator(id).boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewportWidth);
  }
  await expect(page.locator('#experimental-upgrade-c1')).toHaveValue('');
  await expect(page.locator('#experimental-upgrade-d8')).toHaveValue('');
  await expect(page.locator('#experimental-budget')).toHaveValue('6');
  await expect(page.locator('#experimental-status')).toContainText('White 0/6 · Black 0/6');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByRole('button', { name: 'Start new game', exact: true }).click();
  await expect(square(page, 'a1')).toHaveAttribute('aria-label', 'a1 White rook');
  await expect(square(page, 'b2')).toHaveAttribute('aria-label', 'b2 White pawn');
  await expect(page.locator('#history li span')).toHaveCount(0);
});

for (const variant of ['levelup-v5', 'levelup', 'levelup-knight']) {
  test(`clear controls also reset ${variant} selections and preserve its budget`, async ({ page }) => {
    await page.selectOption('#game-mode', variant);
    const prefix = variant === 'levelup-knight' ? 'upgrade' : 'piece-upgrade';
    const budget = variant === 'levelup-knight' ? '#upgrade-budget' : '#piece-upgrade-budget';
    if (variant !== 'levelup-knight') await page.selectOption('#piece-family', 'knight');
    await page.selectOption(`#${prefix}-b1`, '2');
    await page.selectOption(`#${prefix}-b8`, '1');
    const limit = await page.locator(budget).inputValue();
    await page.getByRole('button', { name: 'Clear White', exact: true }).click();
    await expect(page.locator(`#${prefix}-b1`)).toHaveValue('0');
    await expect(page.locator(`#${prefix}-b8`)).toHaveValue('1');
    await page.getByRole('button', { name: 'Clear both', exact: true }).click();
    await expect(page.locator(`#${prefix}-b8`)).toHaveValue('0');
    await expect(page.locator(budget)).toHaveValue(limit);
    await expect(square(page, 'b1')).toHaveAttribute('aria-label', 'b1 White knight');
  });
}
