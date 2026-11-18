const { test, expect } = require('@playwright/test');
const { inPanel } = require('./ui-panels');
const { PLAYABLE_LIBRARIES, getPlayableProfile } = require('../src/design-options');
const { VariantGame, initVariantRules } = require('../dist/rules-node.cjs');
const { placementFromMap } = require('../src/profile-fen');

const id = 'queen.wraith-side-through@1';
const libraries = [2, 3].map(level => PLAYABLE_LIBRARIES.find(library => library.id === `v19-level${level}-revised`));
const profiles = libraries.map(library => getPlayableProfile(library.variant));
const previousPawnLibrary = PLAYABLE_LIBRARIES.find(library => library.id === 'v19-level2');
const square = (page, name) => page.locator(`#board [data-square="${name}"]`);
const type = profile => profile.registry.allocations.find(row => row.id === id).letter.toUpperCase();

test.beforeAll(async () => { for (const profile of profiles) await initVariantRules(profile.variant); });
async function importPosition(page, pieces) {
  const profile = profiles[1];
  const game = new VariantGame(`${placementFromMap(new Map(Object.entries(pieces)))} w - - 0 1`, profile.variant);
  const pgn = game.pgn(); game.dispose();
  await inPanel(page, 'files', () => page.getByRole('button', { name: 'Import PGN', exact: true }).click());
  await page.locator('#pgn-text').fill(pgn);
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
  await expect(page.locator('#import-dialog')).not.toBeVisible();
  if (await page.locator('#replace-dialog').isVisible()) await page.getByRole('button', { name: 'Replace game', exact: true }).click();
}

test('revised L2 keeps its frozen pawn and grant references while the older Bishop pawn remains archived', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173');
  await inPanel(page, 'setup', () => page.selectOption('#game-mode', libraries[0].variant));
  await square(page, 'd2').click();
  await expect(page.locator('#setup-picker [data-upgrade-id="pawn.bishop-diagonal-range@1"]')).toHaveCount(0);
  for (const design of ['pawn.knight-tall-quiet@1', 'pawn.rank-current@1']) {
    await expect(page.locator(`#setup-picker [data-upgrade-id="${design}"]`)).toContainText('2 pt');
  }
  await square(page, 'e1').click();
  await expect(page.locator('#setup-picker [data-upgrade-id="king.reserve-bishop@1"]')).toContainText('2 pt');
  await inPanel(page, 'setup', () => page.selectOption('#game-mode', previousPawnLibrary.variant));
  await square(page, 'd2').click();
  await expect(page.locator('#setup-picker [data-upgrade-id="pawn.bishop-diagonal-range@1"]')).toHaveCount(1);
});

test('revised Wraith separates quiet vertical hops from captures and preserves a through capture across save and undo', async ({ page }, testInfo) => {
  const piece = type(profiles[1]);
  await page.goto('http://127.0.0.1:4173');
  await importPosition(page, { a2: 'K', h7: 'k', d4: piece, e4: 'P', g4: 'p', d5: 'P', d7: 'p', e5: 'P', f6: 'p' });
  await square(page, 'd4').click();
  await expect(square(page, 'g4').locator('.capture-marker')).toHaveCount(1);
  await expect(square(page, 'f6').locator('.capture-marker')).toHaveCount(1);
  await expect(square(page, 'd6').locator('.move-marker[data-playable=true]')).toHaveCount(1);
  await expect(square(page, 'd7').locator('.capture-marker')).toHaveCount(0);
  await expect(square(page, 'd7').locator('.move-marker[data-playable=true]')).toHaveCount(0);
  await page.locator('#board-stage').screenshot({ path: testInfo.outputPath('wraith-markers-desktop.png') });
  await square(page, 'g4').click();
  await expect(square(page, 'g4')).toHaveAttribute('data-design-id', id);
  await expect(square(page, 'e4')).toHaveAttribute('aria-label', 'e4 White pawn');
  await inPanel(page, 'files', () => page.getByRole('button', { name: 'Save game', exact: true }).click());
  await page.reload();
  await inPanel(page, 'files', () => page.getByRole('button', { name: 'Load saved', exact: true }).click());
  await expect(page.locator('#game-mode')).toHaveValue(profiles[1].variant);
  await expect(square(page, 'g4')).toHaveAttribute('data-design-id', id);
  await page.getByRole('button', { name: /Undo move/ }).click();
  await expect(square(page, 'd4')).toHaveAttribute('data-design-id', id);
  await expect(square(page, 'g4')).toHaveAttribute('aria-label', 'g4 Black pawn');
});

test('Wraith movement and capture hints remain visible and playable on a narrow board', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:4173');
  await importPosition(page, { a2: 'K', h7: 'k', d4: type(profiles[1]), e4: 'P', g4: 'p' });
  await square(page, 'd4').click();
  await expect(square(page, 'g4').locator('.capture-marker')).toBeVisible();
  await expect(square(page, 'f4').locator('.move-marker[data-playable=true]')).toBeVisible();
  await page.locator('#board-stage').screenshot({ path: testInfo.outputPath('wraith-markers-mobile.png') });
  await square(page, 'g4').click();
  await expect(square(page, 'g4')).toHaveAttribute('data-design-id', id);
});

test('the native bridge accepts the revised Wraith profile and returns a legal response', async ({ page }) => {
  test.skip(!process.env.FAIRY_STOCKFISH_PATH, 'Set FAIRY_STOCKFISH_PATH for native integration.');
  const profile = profiles[1];
  await page.goto('http://127.0.0.1:4173');
  await inPanel(page, 'setup', () => page.selectOption('#game-mode', profile.variant));
  for (const name of ['d1', 'd8']) {
    await square(page, name).click();
    const choice = page.locator(`#setup-picker [data-upgrade-id="${id}"]`);
    await expect(choice).toContainText('Wraith');
    await expect(choice).toHaveAttribute('data-accent', 'purple');
    await choice.click();
  }
  await page.locator('#new-game').click();
  if (await page.locator('#restart').isVisible()) await page.getByRole('button', { name: 'Start new game', exact: true }).click();
  await inPanel(page, 'setup', () => page.selectOption('#opponent', 'engine'));
  await expect(page.locator('#engine-status')).toContainText('connected', { timeout: 20000 });
  await inPanel(page, 'setup', () => page.selectOption('#difficulty', 'easy'));
  const response = page.waitForResponse(value => value.url().endsWith('/api/engine/move'));
  await square(page, 'e2').click(); await square(page, 'e4').click();
  const received = await response, request = received.request().postDataJSON(), answer = await received.json();
  expect(received.status()).toBe(200);
  expect(request.variant).toBe(profile.variant);
  expect(request.profileHash).toBe(profile.hash); expect(request.registryHash).toBe(profile.registryHash);
  const game = new VariantGame(request.fen, profile.variant);
  try { expect(game.moves({ verbose: true }).map(move => move.uci)).toContain(answer.move); }
  finally { game.dispose(); }
  await expect(page.locator('#history li span')).toHaveCount(2);
});
