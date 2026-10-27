const { test, expect } = require('@playwright/test');
const { PLAYABLE_LIBRARIES } = require('../src/design-options');

const kings = PLAYABLE_LIBRARIES.find(library => library.id === 'v16-references');

test('King workshop opens the nine king grants directly', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173');
  await page.selectOption('#game-mode', { label: 'Version 16 · King workshop' });
  await expect(page.locator('#game-mode')).toHaveValue(kings.variant);
  await expect(page.locator('#setup-piece-title')).toHaveText('White king · e1');
  await expect(page.locator('#setup-upgrades [data-upgrade-id^="king.reserve-"]')).toHaveCount(9);
  await page.locator('[data-square="e8"]').click();
  await expect(page.locator('#setup-piece-title')).toHaveText('Black king · e8');
});

test('short desktop viewports can scroll past setup controls to reveal the bottom rank', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('http://127.0.0.1:4173');
  await page.selectOption('#game-mode', kings.variant);
  await page.evaluate(() => window.scrollTo(0, 900));
  const bottomRankFits = () => page.locator('[data-square="a1"]').evaluate(square => {
    const bounds = square.getBoundingClientRect();
    return bounds.top >= 0 && bounds.bottom <= window.innerHeight;
  });
  await expect.poll(bottomRankFits).toBe(true);
  await expect.poll(() => page.locator('#setup-toolbar').evaluate(toolbar => toolbar.getBoundingClientRect().top)).toBeLessThan(0);

  // Resizing and flipping must preserve access to the rank at the bottom.
  await page.setViewportSize({ width: 1366, height: 600 });
  await expect.poll(bottomRankFits).toBe(true);
  await page.locator('#flip').click();
  await page.evaluate(() => window.scrollTo(0, 900));
  await expect.poll(() => page.locator('[data-square="h8"]').evaluate(square => {
    const bounds = square.getBoundingClientRect();
    return bounds.top >= 0 && bounds.bottom <= window.innerHeight;
  })).toBe(true);
});
