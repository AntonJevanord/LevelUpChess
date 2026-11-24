const { test, expect } = require('@playwright/test');
const { inPanel } = require('./ui-panels');
const { PLAYABLE_LIBRARIES } = require('../src/design-options');

const cases = [
  { tier: 1, choices: [['c1', 'bishop.level1-dabbaba@1', 'bishop.hopper-full-range@1', 'green']] },
  { tier: 2, choices: [
    ['b1', 'knight.level2-forward-zebra@1', 'knight.level2-nd-quiet-orthogonal@1', 'orange'],
    ['a1', 'rook.level2-no-tall-back-capture-knight@1', 'rook.orange@3', 'orange'],
    ['d1', 'queen.level2-side-knight-side-dabbaba-alfil@1', 'queen.level2-side-knight@1', 'yellow'],
  ] },
  { tier: 3, choices: [['d1', 'queen.level3-side-threeleap-camel-zebra-tripper@1', 'queen.wraith-side-through@1', 'purple']] },
];
const square = (page, name) => page.locator(`[data-square="${name}"]`);
async function chooseExpanded(page, row) {
  const library = PLAYABLE_LIBRARIES.find(item => item.id === `v19-level${row.tier}-expanded`);
  await inPanel(page, 'setup', () => page.selectOption('#game-mode', library.variant));
  await page.locator('#experimental-budget').fill('6');
  for (const [home, id, original, color] of row.choices) {
    await square(page, home).click();
    const picker = page.locator('#setup-picker');
    await expect(picker.locator(`[data-upgrade-id="${original}"]`)).toHaveAttribute('data-accent', color);
    await expect(picker.locator(`[data-upgrade-id="${id}"]`)).toHaveAttribute('data-accent', color);
    await picker.locator(`[data-upgrade-id="${id}"]`).click();
    await expect(square(page, home)).toHaveAttribute('data-design-id', id);
    await expect(square(page, home).locator(`.piece-level.${color}`)).toHaveText(`L${row.tier}`);
  }
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  if (await page.locator('#restart').isVisible()) await page.getByRole('button', { name: 'Start new game', exact: true }).click();
  await expect(page.locator('#board')).not.toHaveClass(/setup-board/);
  return library;
}

test.beforeEach(async ({ page }) => { await page.goto('http://127.0.0.1:4173'); });
for (const row of cases) test(`expanded level ${row.tier} keeps original choices, matching colors and saved alternatives`, async ({ page }) => {
  const library = await chooseExpanded(page, row);
  await inPanel(page, 'files', () => page.getByRole('button', { name: 'Save game', exact: true }).click());
  await expect(page.locator('#save-status')).toContainText('Saved');
  await page.reload();
  await inPanel(page, 'files', () => page.getByRole('button', { name: 'Load saved', exact: true }).click());
  await expect(page.locator('#game-mode')).toHaveValue(library.variant);
  for (const [home, id, , color] of row.choices) {
    await expect(square(page, home)).toHaveAttribute('data-design-id', id);
    await expect(square(page, home).locator(`.piece-level.${color}`)).toHaveText(`L${row.tier}`);
  }
});

test('native Stockfish plays from a board with all three level-two alternatives', async ({ page }) => {
  test.skip(!process.env.FAIRY_STOCKFISH_PATH, 'Set FAIRY_STOCKFISH_PATH for the native bridge.');
  test.setTimeout(60000);
  await chooseExpanded(page, cases[1]);
  await inPanel(page, 'setup', () => page.selectOption('#opponent', 'engine'));
  await expect(page.locator('#engine-status')).toContainText('connected', { timeout: 30000 });
  await page.selectOption('#difficulty', 'easy');
  await square(page, 'e2').click(); await square(page, 'e4').click();
  await expect(page.locator('#history li span')).toHaveCount(2, { timeout: 45000 });
  await expect(page.locator('#status')).toHaveText('White to move');
  await expect(page.locator('#hint')).not.toContainText('Engine paused');
});
