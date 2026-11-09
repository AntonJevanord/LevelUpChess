const { expect } = require('@playwright/test');

// Follow the same visible navigation as a player before using relocated
// controls. This keeps older gameplay regressions independent of the active
// tab without changing DOM visibility or bypassing the real tab behavior.
async function panel(page, name) {
  const tab = page.locator(`[data-panel-tab="${name}"]`);
  if (await tab.getAttribute('aria-selected') !== 'true') await tab.click();
  await expect(page.locator(`#panel-${name}`)).toBeVisible();
}

async function inPanel(page, name, action) {
  await panel(page, name);
  return action();
}

module.exports = { panel, inPanel };
