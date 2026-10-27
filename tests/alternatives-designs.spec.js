const { test, expect } = require('@playwright/test');
const { VariantGame, initVariantRules } = require('../dist/rules-node.cjs');
const { PLAYABLE_PROFILES, DESIGN_OPTIONS } = require('../src/design-options');

const [workshop, , alternatives] = PLAYABLE_PROFILES;
const square = (page, name) => page.locator(`[data-square="${name}"]`);
const marker = (page, name) => square(page, name).locator('.move-marker, .capture-marker');
const letter = id => alternatives.registry.allocations.find(item => item.id === id).letter.toUpperCase();
const names = new Map(DESIGN_OPTIONS.map(option => [option.id, option.name]));

async function choose(page, family, slot, id) {
  await page.selectOption('#experimental-family', family);
  await page.selectOption(`#experimental-upgrade-${slot}`, id);
}
async function start(page) {
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  if (await page.locator('#restart').isVisible()) await page.getByRole('button', { name: 'Start new game', exact: true }).click();
  await expect(page.locator('#board')).toHaveClass(/experimental-board/);
}
async function move(page, from, to) { await square(page, from).click(); await square(page, to).click(); }
function position(pieces, turn = 'w') {
  const rows = Array.from({ length: 8 }, (_, row) => {
    let text = '', empty = 0;
    for (const file of 'abcdefgh') {
      const piece = pieces[file + (8 - row)];
      if (!piece) { empty++; continue; }
      if (empty) text += empty;
      empty = 0; text += piece;
    }
    return text + (empty || '');
  });
  return `${rows.join('/')} ${turn} - - 0 1`;
}
async function importPosition(page, pieces, turn = 'w') {
  const game = new VariantGame(position(pieces, turn), alternatives.variant);
  const pgn = game.pgn(); game.dispose();
  await page.getByRole('button', { name: 'Import PGN', exact: true }).click();
  await page.locator('#pgn-text').fill(pgn);
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
  await expect(page.locator('#import-dialog')).not.toBeVisible();
  if (await page.locator('#replace-dialog').isVisible()) await page.getByRole('button', { name: 'Replace game', exact: true }).click();
}

test.beforeAll(() => initVariantRules(alternatives.variant));
test.beforeEach(async ({ page }) => { await page.goto('http://127.0.0.1:4173'); });

test('Design alternatives offers both designs in each pair and can place different revisions against each other', async ({ page }) => {
  await expect(page.locator(`#game-mode option[value="${alternatives.variant}"]`)).toHaveText('Archive · Design alternatives');
  await page.selectOption('#game-mode', alternatives.variant);
  const groups = {
    pawn: ['pawn.purple@7', 'pawn.purple@8', 'pawn.purple@9', 'pawn.purple@10'],
    bishop: ['bishop.purple@3', 'bishop.purple@4', 'bishop.purple@5', 'bishop.purple@6'],
    rook: ['rook.purple@4', 'rook.purple@5'], queen: ['queen.purple@4', 'queen.purple@5'],
  };
  const slots = { pawn: 'd2', bishop: 'c1', rook: 'a1', queen: 'd1' };
  for (const [family, ids] of Object.entries(groups)) {
    await page.selectOption('#experimental-family', family);
    for (const id of ids) {
      await expect(page.locator(`#experimental-upgrade-${slots[family]} option[value="${id}"]`)).toContainText(names.get(id));
    }
  }
  await choose(page, 'bishop', 'c1', 'bishop.purple@3');
  await choose(page, 'bishop', 'c8', 'bishop.purple@5');
  await expect(page.locator('#experimental-status')).toContainText('White 3/6 · Black 3/6');
  await start(page);
  await expect(square(page, 'c1')).toHaveAttribute('data-design-id', 'bishop.purple@3');
  await expect(square(page, 'c8')).toHaveAttribute('data-design-id', 'bishop.purple@5');
});

test('Rank camel pawn jumps three files forward to empty squares and captures across blockers', async ({ page }) => {
  await importPosition(page, { h1: 'K', h7: 'k', d4: letter('pawn.purple@10'), c4: 'P', e4: 'P', g5: 'p' });
  await square(page, 'd4').click();
  for (const target of ['a5', 'b5', 'f5']) await expect(square(page, target).locator('.move-marker')).toHaveCount(1);
  await expect(square(page, 'g5').locator('.capture-marker')).toHaveCount(1);
  for (const target of ['a3', 'g3', 'c7', 'e7']) await expect(marker(page, target)).toHaveCount(0);
  await square(page, 'g5').click();
  await expect(square(page, 'g5')).toHaveAttribute('data-design-id', 'pawn.purple@10');
  await expect(square(page, 'e4')).toHaveAttribute('aria-label', 'e4 White pawn');
});

test('the alternate bishops show tall knight captures and unlimited horizontal captures', async ({ page }) => {
  await importPosition(page, { h1: 'K', h7: 'k', d4: letter('bishop.purple@5'), c4: 'P', d5: 'P', e6: 'p' });
  await square(page, 'd4').click();
  await expect(square(page, 'e6').locator('.capture-marker')).toHaveCount(1);
  await expect(square(page, 'c6').locator('.move-marker')).toHaveCount(1);
  for (const target of ['b5', 'f5', 'b3', 'f3']) await expect(marker(page, target)).toHaveCount(0);
  await square(page, 'e6').click();
  await expect(square(page, 'e6')).toHaveAttribute('data-design-id', 'bishop.purple@5');
  await importPosition(page, { h1: 'K', h7: 'k', d4: letter('bishop.purple@6'), a4: 'p' });
  await square(page, 'd4').click();
  await expect(square(page, 'a4').locator('.capture-marker')).toHaveCount(1);
  await expect(square(page, 'h4').locator('.move-marker')).toHaveCount(1);
  await square(page, 'a4').click();
  await expect(square(page, 'a4')).toHaveAttribute('data-design-id', 'bishop.purple@6');
});

test('Diagonal-blink captures two clear diagonal squares but keeps its quiet jump across blockers', async ({ page }) => {
  await importPosition(page, { h1: 'K', h7: 'k', d4: letter('rook.purple@5'), f6: 'p', c3: 'P', b2: 'p', d5: 'P' });
  await square(page, 'd4').click();
  await expect(square(page, 'f6').locator('.capture-marker')).toHaveCount(1);
  await expect(marker(page, 'b2')).toHaveCount(0);
  await expect(square(page, 'b6').locator('.move-marker')).toHaveCount(1);
  await square(page, 'f6').click();
  await expect(square(page, 'f6')).toHaveAttribute('data-design-id', 'rook.purple@5');
});

test('forward companions can retreat quietly but cannot capture backward for either color', async ({ page }) => {
  await importPosition(page, { a1: 'K', h8: 'k', d4: letter('queen.purple@5'), e5: 'p', e4: 'p', c3: 'p' });
  await square(page, 'd4').click();
  for (const target of ['e5', 'e4']) await expect(square(page, target).locator('.capture-marker')).toHaveCount(1);
  await expect(square(page, 'd3').locator('.move-marker')).toHaveCount(1);
  await expect(marker(page, 'c3')).toHaveCount(0);
  await importPosition(page, { a1: 'K', h8: 'k', d5: letter('queen.purple@5').toLowerCase(), e4: 'P', e5: 'P', c6: 'P' }, 'b');
  await square(page, 'd5').click();
  for (const target of ['e4', 'e5']) await expect(square(page, target).locator('.capture-marker')).toHaveCount(1);
  await expect(square(page, 'd6').locator('.move-marker')).toHaveCount(1);
  await expect(marker(page, 'c6')).toHaveCount(0);
});

test('alternative army choices and companion deployment survive a save and library switch', async ({ page }) => {
  test.setTimeout(60000);
  await page.selectOption('#game-mode', alternatives.variant);
  await choose(page, 'pawn', 'a2', 'pawn.purple@10');
  await choose(page, 'queen', 'd1', 'queen.purple@5');
  await choose(page, 'queen', 'd8', 'queen.purple@4');
  await start(page);
  await expect(square(page, 'd1')).toHaveAttribute('aria-label', 'd1 White queen');
  await expect(square(page, 'd2')).toHaveAttribute('data-design-id', 'queen.purple@5');
  await expect(square(page, 'd3')).toHaveAttribute('aria-label', 'd3 White pawn');
  await move(page, 'd2', 'e3'); await move(page, 'd7', 'e6');
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await page.selectOption('#game-mode', workshop.variant);
  await expect(page.locator('#experimental-upgrade-a2')).toHaveValue('');
  await expect(page.locator('#experimental-upgrade-d1')).toHaveValue('');
  await expect(page.locator('#experimental-upgrade-d8')).toHaveValue('queen.purple@4');
  await expect(square(page, 'e3')).toHaveAttribute('data-design-id', 'queen.purple@5');
  await page.reload();
  await page.getByRole('button', { name: 'Load saved', exact: true }).click();
  await expect(page.locator('#game-mode')).toHaveValue(alternatives.variant);
  await expect(page.locator('#experimental-upgrade-a2')).toHaveValue('pawn.purple@10');
  await expect(page.locator('#experimental-upgrade-d1')).toHaveValue('queen.purple@5');
  await expect(square(page, 'e3')).toHaveAttribute('data-design-id', 'queen.purple@5');
  await expect(square(page, 'e6')).toHaveAttribute('data-design-id', 'queen.purple@4');
  await page.getByRole('button', { name: /Undo move/ }).click();
  await expect(square(page, 'd7')).toHaveAttribute('data-design-id', 'queen.purple@4');
});
