const { test, expect } = require('@playwright/test');
const { inPanel } = require('./ui-panels');
const { PLAYABLE_LIBRARIES, getPlayableProfile } = require('../src/design-options');
const { VariantGame, initVariantRules } = require('../dist/rules-node.cjs');
const { placementFromMap } = require('../src/profile-fen');

const library = PLAYABLE_LIBRARIES.find(row => row.id === 'v18-roster-confirmed');
const previous = PLAYABLE_LIBRARIES.find(row => row.id === 'v17-roster-confirmed');
const profile = getPlayableProfile(library.variant);
const ids = { pawn: 'pawn.knight-tall-quiet@1', rook: 'rook.cataphract-no-tall-back@1' };
const type = id => profile.registry.allocations.find(row => row.id === id).letter.toUpperCase();
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

test('version 18 is the first workshop and offers the selected revisions while version 17 remains available', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173');
  await expect(page.locator('.version')).toHaveText('VERSION 18 / ARMY WORKSHOP');
  const entries = await page.locator('#game-mode option').evaluateAll(options => options.map(option => ({ value: option.value, label: option.textContent })));
  expect(entries.find(row => row.label.startsWith('Version ')).value).toBe(library.variant);
  expect(entries.find(row => row.value === previous.variant).label).toContain('Version 17');
  await inPanel(page, 'setup', () => page.selectOption('#game-mode', library.variant));
  await square(page, 'd2').click();
  const pawn = page.locator(`#setup-picker [data-upgrade-id="${ids.pawn}"]`);
  await expect(pawn).toContainText('Knight pawn'); await expect(pawn).toContainText('2 pt');
  await expect(pawn).toHaveAttribute('data-accent', 'yellow');
  await expect(page.locator('#setup-picker [data-upgrade-id="pawn.orange@3"]')).toHaveCount(0);
  await pawn.click();
  await square(page, 'a1').click();
  const rook = page.locator(`#setup-picker [data-upgrade-id="${ids.rook}"]`);
  await expect(rook).toContainText('Cataphract'); await expect(rook).toContainText('3 pt');
  await expect(rook).toHaveAttribute('data-accent', 'purple');
  await expect(page.locator('#setup-picker [data-upgrade-id="rook.purple@12"]')).toHaveCount(0);
  await rook.click();
  await expect(page.locator('#experimental-status')).toContainText('White 5/6');
  await start(page);
  await expect(square(page, 'd2')).toHaveAttribute('data-design-id', ids.pawn);
  await expect(square(page, 'a1')).toHaveAttribute('data-design-id', ids.rook);
  await inPanel(page, 'setup', () => page.selectOption('#game-mode', previous.variant));
  await square(page, 'd2').click();
  await expect(page.locator('#setup-picker [data-upgrade-id="pawn.orange@3"]')).toHaveCount(1);
  await expect(page.locator(`#setup-picker [data-upgrade-id="${ids.pawn}"]`)).toHaveCount(0);
  await square(page, 'a1').click();
  await expect(page.locator('#setup-picker [data-upgrade-id="rook.purple@12"]')).toHaveCount(1);
});

test('quiet tall jumps, capturing wide jumps and revised Cataphract markers survive save/load and undo', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173');
  await importPosition(page, { a1: 'K', h8: 'k', d4: type(ids.pawn), d5: 'P', b5: 'p', e6: 'p' });
  await square(page, 'd4').click();
  await expect(square(page, 'c6').locator('.move-marker[data-playable=true]')).toHaveCount(1);
  await expect(square(page, 'b5').locator('.capture-marker')).toHaveCount(1);
  await expect(marker(page, 'e6')).toHaveCount(0);
  await square(page, 'c6').click();
  await expect(square(page, 'c6')).toHaveAttribute('data-design-id', ids.pawn);
  await inPanel(page, 'files', () => page.getByRole('button', { name: 'Save game', exact: true }).click());
  await page.reload();
  await inPanel(page, 'files', () => page.getByRole('button', { name: 'Load saved', exact: true }).click());
  await expect(page.locator('#game-mode')).toHaveValue(library.variant);
  await expect(square(page, 'c6')).toHaveAttribute('data-design-id', ids.pawn);
  await page.getByRole('button', { name: /Undo move/ }).click();
  await expect(square(page, 'd4')).toHaveAttribute('data-design-id', ids.pawn);
  await expect(square(page, 'e6')).toHaveAttribute('aria-label', 'e6 Black pawn');
  await importPosition(page, { h1: 'K', h8: 'k', d4: type(ids.rook), d5: 'P', d3: 'P', c4: 'P', e4: 'P', c7: 'p', g3: 'p' });
  await square(page, 'd4').click();
  for (const to of ['a3', 'a5', 'g5', 'e7']) await expect(square(page, to).locator('.move-marker[data-playable=true]')).toHaveCount(1);
  for (const to of ['c7', 'g3']) await expect(square(page, to).locator('.capture-marker')).toHaveCount(1);
  for (const to of ['c1', 'e1', 'd6']) await expect(marker(page, to)).toHaveCount(0);
  await square(page, 'g3').click();
  await expect(square(page, 'g3')).toHaveAttribute('data-design-id', ids.rook);
  await page.getByRole('button', { name: /Undo move/ }).click();
  await expect(square(page, 'd4')).toHaveAttribute('data-design-id', ids.rook);
  await expect(square(page, 'g3')).toHaveAttribute('aria-label', 'g3 Black pawn');
});

test('the native bridge accepts the version-18 profile and returns a legal reply with both revisions present', async ({ page }) => {
  test.skip(!process.env.FAIRY_STOCKFISH_PATH, 'Set FAIRY_STOCKFISH_PATH for native integration.');
  await page.goto('http://127.0.0.1:4173');
  await inPanel(page, 'setup', () => page.selectOption('#game-mode', library.variant));
  for (const square of ['d2', 'd7']) await choose(page, square, ids.pawn);
  for (const square of ['a1', 'a8']) await choose(page, square, ids.rook);
  await start(page);
  await inPanel(page, 'setup', () => page.selectOption('#opponent', 'engine'));
  await expect(page.locator('#engine-status')).toContainText('connected', { timeout: 20000 });
  await inPanel(page, 'setup', () => page.selectOption('#difficulty', 'easy'));
  const response = page.waitForResponse(value => value.url().endsWith('/api/engine/move'));
  await square(page, 'e2').click(); await square(page, 'e4').click();
  const received = await response, request = received.request().postDataJSON(), answer = await received.json();
  expect(received.status()).toBe(200);
  expect(request.variant).toBe(library.variant);
  expect(request.profileHash).toBe(profile.hash); expect(request.registryHash).toBe(profile.registryHash);
  const game = new VariantGame(request.fen, library.variant);
  try { expect(game.moves({ verbose: true }).map(move => move.uci)).toContain(answer.move); }
  finally { game.dispose(); }
  await expect(page.locator('#history li span')).toHaveCount(2);
  await expect(page.locator('#engine-status')).not.toContainText('paused');
  await expect(square(page, 'a1')).toHaveAttribute('data-design-id', ids.rook);
});
