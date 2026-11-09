const { test, expect } = require('@playwright/test');
const { inPanel } = require('./ui-panels');
const { PLAYABLE_LIBRARIES, getPlayableProfile } = require('../src/design-options');
const { VariantGame, initVariantRules } = require('../dist/rules-node.cjs');
const { placementFromMap } = require('../src/profile-fen');

const library = PLAYABLE_LIBRARIES.find(item => item.id === 'v17-roster-confirmed');
const profile = getPlayableProfile(library.variant);
const ids = { bishop: 'bishop.vertical-blocked@1', pawn: 'pawn.queen-sideways@1', queen: 'queen.purple@7',
  slider: 'king.reserve-rook@1', jumper: 'king.grant-wd-level3@1', king: 'king.reserve-king@1' };
const type = id => profile.registry.allocations.find(item => item.id === id).letter;
const square = (page, name) => page.locator(`#board [data-square="${name}"]`);
const marker = (page, name) => square(page, name).locator('.move-marker[data-playable=true], .capture-marker');
async function choose(page, name, id) {
  await square(page, name).click();
  await page.locator(`#setup-picker [data-upgrade-id="${id}"]`).click();
}
async function start(page) {
  await page.locator('#new-game').click();
  if (await page.locator('#restart').isVisible()) await page.getByRole('button', { name: 'Start new game', exact: true }).click();
}
async function importPosition(page, pieces) {
  const game = new VariantGame(`${placementFromMap(new Map(Object.entries(pieces)))} w - - 0 1`, library.variant);
  const pgn = game.pgn(); game.dispose();
  await inPanel(page, 'files', () => page.getByRole('button', { name: 'Import PGN', exact: true }).click());
  await page.locator('#pgn-text').fill(pgn);
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
  await expect(page.locator('#import-dialog')).not.toBeVisible();
  if (await page.locator('#replace-dialog').isVisible()) await page.getByRole('button', { name: 'Replace game', exact: true }).click();
}
test.beforeAll(() => initVariantRules(library.variant));

test('the version-17 confirmed roster stays ahead of its older workshops with accepted names and the unchanged four-point King grant', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173');
  const entries = await page.locator('#game-mode option').evaluateAll(options => options.map(option => ({ value: option.value, label: option.textContent })));
  expect(entries.findIndex(item => item.value === library.variant)).toBeLessThan(entries.findIndex(item => item.label === 'Version 17 · Pawn workshop'));
  expect(entries.some(item => item.label === 'Version 17 · Roster and trials (archive)')).toBe(true);
  await inPanel(page, 'setup', () => page.selectOption('#game-mode', library.variant));
  await inPanel(page, 'setup', () => page.locator('#experimental-budget').fill('9'));
  const picker = page.locator('#setup-picker');
  await square(page, 'c2').click();
  await expect(picker.locator(`[data-upgrade-id="${ids.pawn}"]`)).toContainText('Herald');
  await expect(picker.locator(`[data-upgrade-id="${ids.pawn}"] strong`)).not.toContainText('Sideways');
  await choose(page, 'c1', ids.bishop);
  await expect(page.locator('#experimental-upgrade-c1 option:checked')).toContainText('Inquisitor · accepted');
  await square(page, 'e1').click();
  for (const [id, name] of [[ids.slider, 'Sliding Orthogonal grant (trial)'], [ids.jumper, 'Warden']]) {
    const choice = picker.locator(`[data-upgrade-id="${id}"]`);
    await expect(choice).toContainText(name); await expect(choice).toContainText('3 pt');
    await expect(choice).toHaveAttribute('data-accent', 'yellow');
  }
  await expect(picker.locator(`[data-upgrade-id="${ids.king}"]`)).toContainText('4 pt');
  await expect(picker.locator(`[data-upgrade-id="${ids.king}"]`)).toHaveAttribute('data-accent', 'orange');
  await expect(picker.locator('[data-upgrade-id="king.grant-king-level3@1"]')).toHaveCount(0);
  await picker.locator(`[data-upgrade-id="${ids.king}"]`).click();
  await choose(page, 'd8', ids.queen);
  await choose(page, 'e8', ids.slider);
  await expect(page.locator('#experimental-status')).toContainText('White 7/9 · Black 6/9');
  await start(page);
  await expect(square(page, 'c1')).toHaveAttribute('data-design-id', ids.bishop);
  await expect(square(page, 'c1').locator('.piece-level.purple')).toHaveText('L3');
  await expect(square(page, 'd8')).toHaveAttribute('data-design-id', ids.queen);
  await expect(square(page, 'e1')).toHaveAttribute('aria-label', 'e1 White king');
  await expect(square(page, 'e8')).toHaveAttribute('aria-label', 'e8 Black king');
  await expect(page.locator(`[data-pocket-color="w"][data-pocket-type="${type(ids.king)}"]`)).toHaveAttribute('data-accent', 'orange');
});

test('the jumping grant crosses blockers, remains portable and differs from the sliding grant', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173');
  const pieces = { h1: 'K', h7: 'k', d4: type(ids.jumper).toUpperCase(), c4: 'P', d5: 'P', e4: 'P', d3: 'P', b4: 'p', d6: 'p', f4: 'p', d2: 'p' };
  await importPosition(page, pieces);
  await square(page, 'd4').click();
  for (const name of ['b4', 'd6', 'f4', 'd2']) await expect(marker(page, name)).toHaveCount(1);
  await square(page, 'f4').click();
  await expect(square(page, 'f4')).toHaveAttribute('data-design-id', ids.jumper);
  await inPanel(page, 'files', () => page.getByRole('button', { name: 'Save game', exact: true }).click());
  await page.reload();
  await inPanel(page, 'files', () => page.getByRole('button', { name: 'Load saved', exact: true }).click());
  await expect(page.locator('#game-mode')).toHaveValue(library.variant);
  await expect(square(page, 'f4')).toHaveAttribute('data-design-id', ids.jumper);
  await page.getByRole('button', { name: /Undo move/ }).click();
  await expect(square(page, 'd4')).toHaveAttribute('data-design-id', ids.jumper);
  await expect(square(page, 'f4')).toHaveAttribute('aria-label', 'f4 Black pawn');
  await importPosition(page, { ...pieces, d4: type(ids.slider).toUpperCase() });
  await square(page, 'd4').click();
  for (const name of ['b4', 'd6', 'f4', 'd2']) await expect(marker(page, name)).toHaveCount(0);
});

test('the selected old X-ray queen keeps diagonal hops and has no orthogonal hops', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173');
  await inPanel(page, 'setup', () => page.selectOption('#game-mode', library.variant));
  await square(page, 'd1').click();
  await expect(page.locator(`#setup-picker [data-upgrade-id="${ids.queen}"]`)).toContainText('Wraith');
  await expect(page.locator('#setup-picker [data-upgrade-id="queen.xray-rook@1"]')).toHaveCount(0);
  await importPosition(page, { a1: 'K', h7: 'k', d4: type(ids.queen).toUpperCase(), e5: 'P', g7: 'p', h8: 'p', e4: 'P', g4: 'p' });
  await square(page, 'd4').click();
  for (const name of ['f6', 'g7']) await expect(marker(page, name)).toHaveCount(1);
  for (const name of ['h8', 'f4', 'g4', 'f5', 'e6']) await expect(marker(page, name)).toHaveCount(0);
});
