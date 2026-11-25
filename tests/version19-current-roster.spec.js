const { test, expect } = require('@playwright/test');
const { inPanel } = require('./ui-panels');
const { PLAYABLE_LIBRARIES, getPlayableProfile } = require('../src/design-options');
const { VariantGame, initVariantRules } = require('../dist/rules-node.cjs');
const { placementFromMap } = require('../src/profile-fen');
const QUEEN = 'queen.level1-wide-forward-knight@1', PAWN = 'pawn.level2-forward-queen-only@1';
const library = level => PLAYABLE_LIBRARIES.find(row => row.id === `v19-level${level}-current`);
const profile = level => getPlayableProfile(library(level).variant);
const type = (value, id) => value.registry.allocations.find(row => row.id === id).letter.toUpperCase();
const square = (page, name) => page.locator(`#board [data-square="${name}"]`);
test.beforeAll(async () => { for (const level of [1, 2]) await initVariantRules(profile(level).variant); });
async function importPosition(page, value, pieces) {
  const game = new VariantGame(`${placementFromMap(new Map(Object.entries(pieces)))} w - - 0 1`, value.variant);
  const pgn = game.pgn(); game.dispose();
  await inPanel(page, 'files', () => page.getByRole('button', { name: 'Import PGN', exact: true }).click());
  await page.locator('#pgn-text').fill(pgn); await page.getByRole('button', { name: 'Import game', exact: true }).click();
  await expect(page.locator('#import-dialog')).not.toBeVisible();
  if (await page.locator('#replace-dialog').isVisible()) await page.getByRole('button', { name: 'Replace game', exact: true }).click();
}

test('current setup offers the blue wide-forward queen and new two-point pawn while retaining reference choices', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173');
  await inPanel(page, 'setup', () => page.selectOption('#game-mode', profile(1).variant));
  await square(page, 'd1').click();
  await expect(page.locator(`#setup-picker [data-upgrade-id="${QUEEN}"]`)).toHaveAttribute('data-accent', 'blue');
  await expect(page.locator(`#setup-picker [data-upgrade-id="${QUEEN}"]`)).toContainText('1 pt');
  await expect(page.locator('#setup-picker [data-upgrade-id="queen.level1-tall-knight@1"]')).toHaveCount(0);
  await page.locator(`#setup-picker [data-upgrade-id="${QUEEN}"]`).click();
  await expect(page.locator('#experimental-status')).toContainText('White 1/6');
  await inPanel(page, 'setup', () => page.selectOption('#game-mode', profile(2).variant));
  await square(page, 'c2').click();
  for (const id of [PAWN, 'pawn.knight-tall-quiet@1', 'pawn.rank-current@1']) await expect(page.locator(`#setup-picker [data-upgrade-id="${id}"]`)).toContainText('2 pt');
  await expect(page.locator(`#setup-picker [data-upgrade-id="${PAWN}"]`)).toHaveAttribute('data-accent', 'yellow');
  await page.locator(`#setup-picker [data-upgrade-id="${PAWN}"]`).click();
  await expect(page.locator('#experimental-status')).toContainText('White 2/6');
});

test('the selected queen makes its wide jump across blockers, saves and undoes without gaining tall knight moves', async ({ page }, testInfo) => {
  const value = profile(1);
  await page.goto('http://127.0.0.1:4173');
  await importPosition(page, value, { a1: 'K', h8: 'k', d4: type(value, QUEEN), c5: 'P', d5: 'P', e5: 'P', b5: 'p' });
  await square(page, 'd4').click();
  await expect(square(page, 'b5').locator('.capture-marker')).toHaveCount(1);
  await expect(square(page, 'f5').locator('.move-marker[data-playable=true]')).toHaveCount(1);
  await expect(square(page, 'c6').locator('.move-marker[data-playable=true]')).toHaveCount(0);
  await page.locator('#board-stage').screenshot({ path: testInfo.outputPath('wide-forward-queen.png') });
  await square(page, 'b5').click(); await expect(square(page, 'b5')).toHaveAttribute('data-design-id', QUEEN);
  await inPanel(page, 'files', () => page.getByRole('button', { name: 'Save game', exact: true }).click());
  await page.reload(); await inPanel(page, 'files', () => page.getByRole('button', { name: 'Load saved', exact: true }).click());
  await expect(page.locator('#game-mode')).toHaveValue(value.variant);
  await expect(square(page, 'b5')).toHaveAttribute('data-design-id', QUEEN);
  await page.getByRole('button', { name: /Undo move/ }).click();
  await expect(square(page, 'd4')).toHaveAttribute('data-design-id', QUEEN);
  await expect(square(page, 'b5')).toHaveAttribute('aria-label', 'b5 Black pawn');
});

test('the selected pawn captures straight forward two squares and never gains backward or sideways destinations', async ({ page }) => {
  const value = profile(2);
  await page.goto('http://127.0.0.1:4173');
  await importPosition(page, value, { a1: 'K', h8: 'k', d4: type(value, PAWN), d6: 'p', e5: 'P', f6: 'p' });
  await square(page, 'd4').click();
  await expect(square(page, 'd6').locator('.capture-marker')).toHaveCount(1);
  await expect(square(page, 'd5').locator('.move-marker[data-playable=true]')).toHaveCount(1);
  for (const name of ['d3', 'c4', 'f6']) await expect(square(page, name).locator('.move-marker[data-playable=true],.capture-marker')).toHaveCount(0);
  await square(page, 'd6').click(); await expect(square(page, 'd6')).toHaveAttribute('data-design-id', PAWN);
  await page.getByRole('button', { name: /Undo move/ }).click();
  await expect(square(page, 'd4')).toHaveAttribute('data-design-id', PAWN);
  await expect(square(page, 'd6')).toHaveAttribute('aria-label', 'd6 Black pawn');
});

for (const [level, id, homes] of [[1, QUEEN, ['d1', 'd8']], [2, PAWN, ['c2', 'c7']]]) {
  test(`the native bridge plays with the current L${level} selection and its frozen values`, async ({ page }) => {
    test.skip(!process.env.FAIRY_STOCKFISH_PATH, 'Set FAIRY_STOCKFISH_PATH for native integration.');
    const value = profile(level); await page.goto('http://127.0.0.1:4173');
    await inPanel(page, 'setup', () => page.selectOption('#game-mode', value.variant));
    for (const name of homes) { await square(page, name).click(); await page.locator(`#setup-picker [data-upgrade-id="${id}"]`).click(); }
    await page.locator('#new-game').click();
    if (await page.locator('#restart').isVisible()) await page.getByRole('button', { name: 'Start new game', exact: true }).click();
    await inPanel(page, 'setup', () => page.selectOption('#opponent', 'engine'));
    await expect(page.locator('#engine-status')).toContainText('connected', { timeout: 20000 });
    await inPanel(page, 'setup', () => page.selectOption('#difficulty', 'easy'));
    const response = page.waitForResponse(value => value.url().endsWith('/api/engine/move'));
    await square(page, 'e2').click(); await square(page, 'e4').click();
    const received = await response, request = received.request().postDataJSON(), answer = await received.json();
    expect(received.status()).toBe(200); expect(request.variant).toBe(value.variant);
    expect(request.profileHash).toBe(value.hash); expect(request.registryHash).toBe(value.registryHash);
    const game = new VariantGame(request.fen, value.variant);
    try { expect(game.moves({ verbose: true }).map(move => move.uci)).toContain(answer.move); }
    finally { game.dispose(); }
    await expect(page.locator('#history li span')).toHaveCount(2);
  });
}
