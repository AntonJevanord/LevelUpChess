const { test, expect } = require('@playwright/test');
const { VariantGame, initVariantRules } = require('../dist/rules-node.cjs');
const { PLAYABLE_PROFILE, PLAYABLE_PROFILES, DESIGN_OPTIONS } = require('../src/design-options');

const VARIANT = PLAYABLE_PROFILE.variant;
const square = (page, name) => page.locator(`[data-square="${name}"]`);
const marker = (page, name) => square(page, name).locator('.move-marker, .capture-marker');
const letter = id => PLAYABLE_PROFILE.registry.allocations.find(item => item.id === id).letter.toUpperCase();
const names = new Map(DESIGN_OPTIONS.map(option => [option.id, option.name]));
const revisions = {
  pawn: ['pawn.purple@7', 'pawn.purple@8', 'pawn.purple@9'],
  bishop: ['bishop.purple@3', 'bishop.purple@4'],
  rook: ['rook.purple@4'],
  queen: ['queen.purple@4'],
};

async function choose(page, family, slot, id) {
  await page.selectOption('#experimental-family', family);
  await page.selectOption(`#experimental-upgrade-${slot}`, id);
}
async function start(page) {
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  if (await page.locator('#restart').isVisible()) await page.getByRole('button', { name: 'Start new game', exact: true }).click();
  await expect(page.locator('#board')).toHaveClass(/experimental-board/);
}
async function move(page, from, to) {
  await square(page, from).click();
  await square(page, to).click();
}
function position(pieces, turn = 'w', rights = '-') {
  const rows = Array.from({ length: 8 }, (_, row) => {
    let text = '', empty = 0;
    for (const file of 'abcdefgh') {
      const piece = pieces[file + (8 - row)];
      if (!piece) { empty++; continue; }
      if (empty) text += empty;
      empty = 0;
      text += piece;
    }
    return text + (empty || '');
  });
  return `${rows.join('/')} ${turn} ${rights} - 0 1`;
}
async function importPgn(page, pgn) {
  await page.getByRole('button', { name: 'Import PGN', exact: true }).click();
  await page.locator('#pgn-text').fill(pgn);
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
  await expect(page.locator('#import-dialog')).not.toBeVisible();
  if (await page.locator('#replace-dialog').isVisible()) await page.getByRole('button', { name: 'Replace game', exact: true }).click();
}
async function importPosition(page, pieces, turn, rights) {
  const game = new VariantGame(position(pieces, turn, rights), VARIANT);
  try { await importPgn(page, game.pgn()); }
  finally { game.dispose(); }
}
async function hasDesign(page, slot, id) {
  await expect(square(page, slot)).toHaveAttribute('data-design-id', id);
  await expect(square(page, slot)).toHaveAttribute('aria-label', new RegExp(names.get(id)));
}

test.beforeAll(() => initVariantRules(VARIANT));
test.beforeEach(async ({ page }) => { await page.goto('http://127.0.0.1:4173'); });

test('the rebalance workshop offers all seven revisions and retires the box rook and level-three short queens', async ({ page }) => {
  await expect(page.locator('.version')).toHaveText('VERSION 16 / THE REFERENCE ROSTER');
  await page.selectOption('#game-mode', VARIANT);
  const slots = { pawn: 'd2', bishop: 'c1', rook: 'a1', queen: 'd1' };
  for (const [family, ids] of Object.entries(revisions)) {
    for (const id of ids) {
      await choose(page, family, slots[family], id);
      await expect(page.locator(`#experimental-description-${slots[family]}`)).not.toBeEmpty();
      await expect(page.locator(`#experimental-description-${slots[family]}`)).not.toContainText('undefined');
      await page.getByRole('button', { name: 'Clear both', exact: true }).click();
    }
  }
  for (const profile of PLAYABLE_PROFILES) {
    await page.selectOption('#game-mode', profile.variant);
    await expect(page.locator('#experimental-upgrade-a1 option[value="rook.purple@1"]')).toHaveCount(0);
  }
  await page.selectOption('#game-mode', VARIANT);
  await page.selectOption('#experimental-family', 'queen');
  await expect(page.locator('#experimental-upgrade-d1 option[value="queen.purple@2"]')).toHaveCount(0);
  await expect(page.locator('#experimental-upgrade-d1 option[value="queen.purple@1"]')).toHaveCount(1);
});

test('Rank pawn shows both new wide forward jumps and performs a jump capture', async ({ page }) => {
  await importPosition(page, { a1: 'K', h8: 'k', d4: letter('pawn.purple@9'), e4: 'P', f5: 'p' });
  await square(page, 'd4').click();
  await expect(square(page, 'b5').locator('.move-marker')).toHaveCount(1);
  await expect(square(page, 'f5').locator('.capture-marker')).toHaveCount(1);
  await expect(marker(page, 'b3')).toHaveCount(0);
  await square(page, 'f5').click();
  await hasDesign(page, 'f5', 'pawn.purple@9');
  await expect(square(page, 'e4')).toHaveAttribute('aria-label', 'e4 White pawn');
  await expect(page.locator('#history')).toContainText('P3xf5');
});

test('revised bishops distinguish quiet knight jumps from short horizontal captures', async ({ page }) => {
  await importPosition(page, { a1: 'K', h8: 'k', d4: letter('bishop.purple@3'), d6: 'p', e6: 'p', e5: 'p' });
  await square(page, 'd4').click();
  await expect(square(page, 'c6').locator('.move-marker')).toHaveCount(1);
  await expect(marker(page, 'e6')).toHaveCount(0);
  for (const target of ['d6', 'e5']) await expect(square(page, target).locator('.capture-marker')).toHaveCount(1);
  await importPosition(page, { a1: 'K', h7: 'k', d4: letter('bishop.purple@4'), f4: 'p', g4: 'p', f3: 'p' });
  await square(page, 'd4').click();
  for (const target of ['f4', 'f3']) await expect(square(page, target).locator('.capture-marker')).toHaveCount(1);
  await expect(marker(page, 'g4')).toHaveCount(0);
  await square(page, 'f4').click();
  await hasDesign(page, 'f4', 'bishop.purple@4');
});

test('Blink captures adjacent diagonals, keeps longer jumps quiet, and castles as a rook', async ({ page }) => {
  await importPosition(page, { h1: 'K', h8: 'k', d4: letter('rook.purple@4'), e5: 'p', b2: 'p', d5: 'P' });
  await square(page, 'd4').click();
  await expect(square(page, 'e5').locator('.capture-marker')).toHaveCount(1);
  await expect(square(page, 'b6').locator('.move-marker')).toHaveCount(1);
  await expect(marker(page, 'b2')).toHaveCount(0);
  await square(page, 'e5').click();
  await hasDesign(page, 'e5', 'rook.purple@4');
  await importPosition(page, { e1: 'K', h1: letter('rook.purple@4'), e8: 'k' }, 'w', 'K');
  await move(page, 'e1', 'g1');
  await expect(square(page, 'g1')).toHaveAttribute('aria-label', 'g1 White king');
  await hasDesign(page, 'f1', 'rook.purple@4');
  await expect(page.locator('#history')).toContainText('O-O');
});

test('Ranging limits diagonal captures while Courier can capture on a long forward diagonal', async ({ page }) => {
  await importPosition(page, { a1: 'K', h8: 'k', d4: letter('pawn.purple@7'), b6: 'p', g7: 'p' });
  await square(page, 'd4').click();
  await expect(square(page, 'b6').locator('.capture-marker')).toHaveCount(1);
  await expect(marker(page, 'g7')).toHaveCount(0);
  await expect(square(page, 'd1').locator('.move-marker')).toHaveCount(1);
  await importPosition(page, { a1: 'K', h8: 'k', d4: letter('pawn.purple@8'), g7: 'p', c3: 'p' });
  await square(page, 'd4').click();
  await expect(square(page, 'g7').locator('.capture-marker')).toHaveCount(1);
  await expect(marker(page, 'c3')).toHaveCount(0);
  await square(page, 'g7').click();
  await hasDesign(page, 'g7', 'pawn.purple@8');
});

test('the companion can move orthogonally into attack but captures only diagonally and is not royal', async ({ page }) => {
  await importPosition(page, { a1: 'K', h8: 'k', d4: letter('queen.purple@4'), e4: 'p', e5: 'p', d8: 'r' });
  await square(page, 'd4').click();
  await expect(marker(page, 'e4')).toHaveCount(0);
  await expect(square(page, 'e5').locator('.capture-marker')).toHaveCount(1);
  await expect(square(page, 'd5').locator('.move-marker')).toHaveCount(1);
  await square(page, 'd5').click();
  await hasDesign(page, 'd5', 'queen.purple@4');
  await move(page, 'd8', 'd5');
  await expect(square(page, 'd5')).toHaveAttribute('aria-label', 'd5 Black rook');
  await expect(page.locator('#status')).toHaveText('White to move');
});

test('both companion purchases retain their queens and recover deployment, moves, save, PGN and undo', async ({ page }) => {
  test.setTimeout(60000);
  await page.selectOption('#game-mode', VARIANT);
  await choose(page, 'queen', 'd1', 'queen.purple@4');
  await choose(page, 'queen', 'd8', 'queen.purple@4');
  await start(page);
  for (const [slot, label] of [['d1', 'd1 White queen'], ['d8', 'd8 Black queen'], ['d3', 'd3 White pawn'], ['d6', 'd6 Black pawn']]) {
    await expect(square(page, slot)).toHaveAttribute('aria-label', label);
  }
  await hasDesign(page, 'd2', 'queen.purple@4');
  await hasDesign(page, 'd7', 'queen.purple@4');
  await expect(page.locator('#board .piece')).toHaveCount(34);
  await move(page, 'd2', 'e3');
  await move(page, 'd7', 'e6');
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PGN', exact: true }).click();
  const fs = require('node:fs/promises');
  const pgn = await fs.readFile(await (await waiting).path(), 'utf8');
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Load saved', exact: true }).click();
  await hasDesign(page, 'e3', 'queen.purple@4');
  await hasDesign(page, 'e6', 'queen.purple@4');
  for (const slot of ['d1', 'd8']) await expect(page.locator(`#experimental-upgrade-${slot}`)).toHaveValue('queen.purple@4');
  await page.reload();
  await importPgn(page, pgn);
  await hasDesign(page, 'e3', 'queen.purple@4');
  await hasDesign(page, 'e6', 'queen.purple@4');
  await page.getByRole('button', { name: /Undo move/ }).click();
  await hasDesign(page, 'd7', 'queen.purple@4');
  await expect(page.locator('#status')).toHaveText('Black to move');
});
