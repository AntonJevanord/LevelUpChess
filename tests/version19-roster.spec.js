const { test, expect } = require('@playwright/test');
const { inPanel } = require('./ui-panels');
const { PLAYABLE_LIBRARIES, getPlayableProfile } = require('../src/design-options');
const { VariantGame, initVariantRules } = require('../dist/rules-node.cjs');
const { placementFromMap } = require('../src/profile-fen');
const libraries = PLAYABLE_LIBRARIES.filter(library => library.generation === 19);
const profiles = libraries.map(library => getPlayableProfile(library.variant));
const square = (page, name) => page.locator(`#board [data-square="${name}"]`);
const type = (profile, id) => profile.registry.allocations.find(row => row.id === id).letter.toUpperCase();
test.beforeAll(async () => { for (const profile of profiles) await initVariantRules(profile.variant); });
async function importPosition(page, profile, pieces) {
  const game = new VariantGame(`${placementFromMap(new Map(Object.entries(pieces)))} w - - 0 1`, profile.variant);
  const pgn = game.pgn(); game.dispose();
  await inPanel(page, 'files', () => page.getByRole('button', { name: 'Import PGN', exact: true }).click());
  await page.locator('#pgn-text').fill(pgn);
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
  await expect(page.locator('#import-dialog')).not.toBeVisible();
  if (await page.locator('#replace-dialog').isVisible()) await page.getByRole('button', { name: 'Replace game', exact: true }).click();
}

test('all three accepted tiers offer the selected pieces, costs and colors while historical libraries remain', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173');
  await expect(page.locator('.version')).toHaveText('VERSION 19 / ARMY WORKSHOP');
  for (const library of libraries) await expect(page.locator(`#game-mode option[value="${library.variant}"]`)).toContainText('Version 19');
  await expect(page.locator('#game-mode option').filter({ hasText: 'Version 18' })).toHaveCount(1);
  for (const [index, squareName, id, cost, accent] of [
    [0, 'd1', 'queen.level1-forward-knight@1', 1, 'green'],
    [0, 'd1', 'queen.level1-tall-knight@1', 1, 'blue'],
    [1, 'b1', 'knight.level2-nd-quiet-orthogonal@1', 2, 'orange'],
    [1, 'd1', 'queen.level2-camel-capture@1', 2, 'orange'],
    [2, 'b1', 'knight.level3-nad@1', 3, 'purple'],
    [2, 'd2', 'pawn.queen-sideways@1', 3, 'red'],
    [2, 'd2', 'pawn.purple@13', 3, 'purple'],
  ]) {
    await inPanel(page, 'setup', () => page.selectOption('#game-mode', libraries[index].variant));
    await square(page, squareName).click();
    const choice = page.locator(`#setup-picker [data-upgrade-id="${id}"]`);
    await expect(choice).toContainText(`${cost} pt`);
    await expect(choice).toHaveAttribute('data-accent', accent);
    await choice.click();
    await expect(page.locator('#experimental-status')).toContainText(`White ${cost}/6`);
    await inPanel(page, 'setup', () => page.getByRole('button', { name: 'Clear both', exact: true }).click());
  }
});

test('NAD jumps over blockers, captures, saves and undoes under its new profile', async ({ page }) => {
  const profile = profiles[2], id = 'knight.level3-nad@1';
  await page.goto('http://127.0.0.1:4173');
  await importPosition(page, profile, { a1: 'K', h8: 'k', d4: type(profile, id), e4: 'P', d5: 'P', f6: 'p' });
  await square(page, 'd4').click();
  await expect(square(page, 'f6').locator('.capture-marker')).toHaveCount(1);
  await expect(square(page, 'f2').locator('.move-marker[data-playable=true]')).toHaveCount(1);
  await expect(square(page, 'd5').locator('.capture-marker')).toHaveCount(0);
  await square(page, 'f6').click();
  await expect(square(page, 'f6')).toHaveAttribute('data-design-id', id);
  await inPanel(page, 'files', () => page.getByRole('button', { name: 'Save game', exact: true }).click());
  await page.reload();
  await inPanel(page, 'files', () => page.getByRole('button', { name: 'Load saved', exact: true }).click());
  await expect(page.locator('#game-mode')).toHaveValue(profile.variant);
  await expect(square(page, 'f6')).toHaveAttribute('data-design-id', id);
  await page.getByRole('button', { name: /Undo move/ }).click();
  await expect(square(page, 'd4')).toHaveAttribute('data-design-id', id);
  await expect(square(page, 'f6')).toHaveAttribute('aria-label', 'f6 Black pawn');
});

test('NDmW shows its quiet adjacent step without granting an adjacent capture', async ({ page }) => {
  const profile = profiles[1], id = 'knight.level2-nd-quiet-orthogonal@1';
  await page.goto('http://127.0.0.1:4173');
  await importPosition(page, profile, { a1: 'K', h8: 'k', d4: type(profile, id), e4: 'p', d5: 'p', d6: 'p' });
  await square(page, 'd4').click();
  await expect(square(page, 'c4').locator('.move-marker[data-playable=true]')).toHaveCount(1);
  await expect(square(page, 'e4').locator('.capture-marker')).toHaveCount(0);
  await expect(square(page, 'e4').locator('.move-marker[data-playable=true]')).toHaveCount(0);
  await expect(square(page, 'd6').locator('.capture-marker')).toHaveCount(1);
  await square(page, 'd6').click();
  await expect(square(page, 'd6')).toHaveAttribute('data-design-id', id);
  await expect(square(page, 'd5')).toHaveAttribute('aria-label', 'd5 Black pawn');
});

for (const [index, id] of [[0, 'knight.wazzap@1'], [1, 'knight.level2-nd-quiet-orthogonal@1'], [2, 'knight.level3-nad@1']]) {
  test(`the native bridge accepts the level-${index + 1} profile and its manual values`, async ({ page }) => {
    test.skip(!process.env.FAIRY_STOCKFISH_PATH, 'Set FAIRY_STOCKFISH_PATH for native integration.');
    const profile = profiles[index];
    await page.goto('http://127.0.0.1:4173');
    await inPanel(page, 'setup', () => page.selectOption('#game-mode', profile.variant));
    for (const name of ['b1', 'b8']) {
      await square(page, name).click();
      await page.locator(`#setup-picker [data-upgrade-id="${id}"]`).click();
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
    expect(request.profileHash).toBe(profile.hash);
    expect(request.registryHash).toBe(profile.registryHash);
    const game = new VariantGame(request.fen, profile.variant);
    try { expect(game.moves({ verbose: true }).map(move => move.uci)).toContain(answer.move); }
    finally { game.dispose(); }
    await expect(page.locator('#history li span')).toHaveCount(2);
  });
}
