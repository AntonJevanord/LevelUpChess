const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');

const square = (page, name) => page.locator(`[data-square="${name}"]`);
const marker = (page, name) => square(page, name).locator('.move-marker, .capture-marker');
async function pawn(page, name, accent, level, color = 'White') {
  await expect(square(page, name)).toHaveAttribute('aria-label', `${name} ${color} ${accent} pawn, level ${level}`);
  await expect(square(page, name).locator(`.piece.upgraded.${accent}`)).toHaveCount(1);
  await expect(square(page, name).locator('.piece-level')).toHaveText(`L${level}`);
}
async function move(page, from, to) {
  await square(page, from).click();
  await square(page, to).click();
}
async function importPosition(page, fen) {
  await importPgn(page, `[Variant "levelup"]\n[SetUp "1"]\n[FEN "${fen}"]\n\n*`);
}
async function importPgn(page, text) {
  await page.getByRole('button', { name: 'Import PGN', exact: true }).click();
  await page.locator('#pgn-text').fill(text);
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
}
async function downloadPgn(page) {
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PGN', exact: true }).click();
  return fs.readFile(await (await waiting).path(), 'utf8');
}
async function expectPromotionChoices(page) {
  await expect(page.locator('#promotion')).toBeVisible();
  await expect(page.locator('#promotion-options button')).toHaveCount(4);
  for (const name of ['queen', 'rook', 'bishop', 'knight']) {
    await expect(page.getByRole('button', { name: `Promote to ${name}`, exact: true })).toBeVisible();
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('http://127.0.0.1:4173');
});

test('all sixteen starting pawns can be upgraded within the shared army budget and restored from a save', async ({ page }) => {
  await page.selectOption('#game-mode', 'levelup');
  await page.selectOption('#piece-family', 'pawn');
  await expect(page.locator('.piece-choices[data-family="pawn"] select')).toHaveCount(16);
  for (const rank of ['2', '7']) {
    for (const file of 'abcdefgh') await expect(page.locator(`#piece-upgrade-${file}${rank}`)).toBeVisible();
  }
  const choices = { a2: '1', b2: '2', c2: '3', a7: '1', b7: '2', c7: '3' };
  for (const [name, level] of Object.entries(choices)) await page.selectOption(`#piece-upgrade-${name}`, level);
  // Each side also has its default one-point blue knight.
  await expect(page.locator('#piece-upgrade-status')).toContainText('White 7/6');
  await expect(page.locator('#piece-upgrade-status')).toContainText('Black 7/6');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await expect(square(page, 'a2')).toHaveAttribute('aria-label', 'a2 White pawn');
  await page.locator('#piece-upgrade-budget').fill('7');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  for (const [rank, color] of [['2', 'White'], ['7', 'Black']]) {
    await pawn(page, `a${rank}`, 'blue', 1, color);
    await pawn(page, `b${rank}`, 'orange', 2, color);
    await pawn(page, `c${rank}`, 'purple', 3, color);
  }
  await expect(page.locator('.piece')).toHaveCount(32);
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Load saved', exact: true }).click();
  await pawn(page, 'a2', 'blue', 1);
  await pawn(page, 'c7', 'purple', 3, 'Black');
  await expect(page.locator('#piece-upgrade-budget')).toHaveValue('7');
  for (const [name, level] of Object.entries(choices)) await expect(page.locator(`#piece-upgrade-${name}`)).toHaveValue(level);
});

for (const fixture of [
  { color: 'White', from: 'd4', blueFen: 'k7/8/8/2rP4/3A4/4r3/8/7K w - - 0 1', jump: 'd6', blocked: 'd5', blueCapture: 'c5', backward: 'e3', backwardQuiet: 'd3', third: 'd7', orangeFen: 'k7/8/8/2rr4/3C4/2r1r3/8/7K w - - 0 1', forward: 'd5', diagonalQuiet: 'e5', diagonalCapture: 'c5' },
  { color: 'Black', from: 'd5', blueFen: '7k/8/4R3/3a4/2Rp4/8/8/K7 b - - 0 1', jump: 'd3', blocked: 'd4', blueCapture: 'c4', backward: 'e6', backwardQuiet: 'd6', third: 'd2', orangeFen: '7k/8/2R1R3/3c4/2RR4/8/8/K7 b - - 0 1', forward: 'd4', diagonalQuiet: 'e4', diagonalCapture: 'c4' },
]) {
  test(`${fixture.color.toLowerCase()} blue and orange pawns advance and capture only toward the opposing back rank`, async ({ page }) => {
    await importPosition(page, fixture.blueFen);
    await pawn(page, fixture.from, 'blue', 1, fixture.color);
    await square(page, fixture.from).click();
    await expect(square(page, fixture.jump).locator('.move-marker')).toHaveCount(1);
    await expect(square(page, fixture.blueCapture).locator('.capture-marker')).toHaveCount(1);
    for (const name of [fixture.blocked, fixture.backward, fixture.backwardQuiet, fixture.third]) await expect(marker(page, name)).toHaveCount(0);
    await square(page, fixture.jump).click();
    await pawn(page, fixture.jump, 'blue', 1, fixture.color);
    await expect(square(page, fixture.blocked)).toHaveAttribute('aria-label', `${fixture.blocked} ${fixture.color} pawn`);
    await page.getByRole('button', { name: /Undo move/ }).click();
    await move(page, fixture.from, fixture.blueCapture);
    await pawn(page, fixture.blueCapture, 'blue', 1, fixture.color);

    await page.reload();
    await importPosition(page, fixture.orangeFen);
    await pawn(page, fixture.from, 'orange', 2, fixture.color);
    await square(page, fixture.from).click();
    for (const name of [fixture.forward, fixture.diagonalCapture]) await expect(square(page, name).locator('.capture-marker')).toHaveCount(1);
    await expect(square(page, fixture.diagonalQuiet).locator('.move-marker')).toHaveCount(1);
    for (const name of [fixture.backward, fixture.backwardQuiet]) await expect(marker(page, name)).toHaveCount(0);
    await square(page, fixture.forward).click();
    await pawn(page, fixture.forward, 'orange', 2, fixture.color);
  });
}

test('purple pawns move quietly along clear rook lines and capture along bishop lines in either direction', async ({ page }) => {
  await importPosition(page, 'k7/8/5r2/3P4/2PD1r2/8/1r1r1r2/7K w - - 0 1');
  await pawn(page, 'd4', 'purple', 3);
  await square(page, 'd4').click();
  for (const name of ['e4', 'd3']) await expect(square(page, name).locator('.move-marker')).toHaveCount(1);
  for (const name of ['b2', 'f2', 'f6']) await expect(square(page, name).locator('.capture-marker')).toHaveCount(1);
  for (const name of ['c4', 'd5', 'd6', 'f4', 'g4', 'd2', 'd1', 'e3', 'c5', 'g1']) await expect(marker(page, name)).toHaveCount(0);
  await square(page, 'f2').click();
  await pawn(page, 'f2', 'purple', 3);
  await page.getByRole('button', { name: /Undo move/ }).click();
  await pawn(page, 'd4', 'purple', 3);
  await expect(square(page, 'f2')).toHaveAttribute('aria-label', 'f2 Black rook');
  await move(page, 'd4', 'e4');
  await pawn(page, 'e4', 'purple', 3);
});

test('blue and orange promotions offer Q/R/B/N and preserve underpromotion through undo and PGN', async ({ page }) => {
  for (const fixture of [
    { fen: '7k/A7/8/8/8/8/8/7K w - - 0 1', from: 'a7', to: 'a8', accent: 'blue', level: 1, color: 'White', choice: 'knight', letter: 'N' },
    { fen: '7k/8/8/8/8/8/1c6/7K b - - 0 1', from: 'b2', to: 'c1', accent: 'orange', level: 2, color: 'Black', choice: 'rook', letter: 'R' },
  ]) {
    await page.reload();
    await importPosition(page, fixture.fen);
    await pawn(page, fixture.from, fixture.accent, fixture.level, fixture.color);
    await move(page, fixture.from, fixture.to);
    await expectPromotionChoices(page);
    await page.getByRole('button', { name: `Promote to ${fixture.choice}`, exact: true }).click();
    await expect(square(page, fixture.to)).toHaveAttribute('aria-label', `${fixture.to} ${fixture.color} ${fixture.choice}`);
    const pgn = await downloadPgn(page);
    expect(pgn).toContain(`=${fixture.letter}`);
    await page.getByRole('button', { name: /Undo move/ }).click();
    await pawn(page, fixture.from, fixture.accent, fixture.level, fixture.color);
    await page.reload();
    await importPgn(page, pgn);
    await expect(square(page, fixture.to)).toHaveAttribute('aria-label', `${fixture.to} ${fixture.color} ${fixture.choice}`);
    await page.getByRole('button', { name: /Undo move/ }).click();
    await pawn(page, fixture.from, fixture.accent, fixture.level, fixture.color);
  }
});

test('an initial blue three-square jump can be captured en passant at either passed square and undone after PGN import', async ({ page }) => {
  for (const fixture of [
    { fen: '7k/8/8/4p3/8/8/3A4/K7 w - - 0 1', from: 'e5', to: 'd4' },
    { fen: '7k/8/8/8/4p3/8/3A4/K7 w - - 0 1', from: 'e4', to: 'd3' },
  ]) {
    await page.reload();
    await importPosition(page, fixture.fen);
    await pawn(page, 'd2', 'blue', 1);
    await move(page, 'd2', 'd5');
    await pawn(page, 'd5', 'blue', 1);
    await square(page, fixture.from).click();
    await expect(square(page, fixture.to).locator('.capture-marker')).toHaveCount(1);
    await square(page, fixture.to).click();
    await expect(square(page, 'd5')).toHaveAttribute('aria-label', 'd5 empty');
    await expect(square(page, fixture.to)).toHaveAttribute('aria-label', `${fixture.to} Black pawn`);
    const pgn = await downloadPgn(page);
    await page.reload();
    await importPgn(page, pgn);
    await expect(square(page, 'd5')).toHaveAttribute('aria-label', 'd5 empty');
    await expect(square(page, fixture.to)).toHaveAttribute('aria-label', `${fixture.to} Black pawn`);
    await page.getByRole('button', { name: /Undo move/ }).click();
    await pawn(page, 'd5', 'blue', 1);
    await expect(square(page, fixture.from)).toHaveAttribute('aria-label', `${fixture.from} Black pawn`);
    await expect(square(page, fixture.to)).toHaveAttribute('aria-label', `${fixture.to} empty`);
  }
});

test('an orange pawn can move quietly to an en passant target without removing the bypassed pawn', async ({ page }) => {
  await importPosition(page, '7k/8/8/4c3/8/8/3A4/K7 w - - 0 1');
  await pawn(page, 'd2', 'blue', 1);
  await move(page, 'd2', 'd5');
  await square(page, 'e5').click();
  await expect(square(page, 'd4').locator('.move-marker')).toHaveCount(1);
  await expect(square(page, 'd4').locator('.capture-marker')).toHaveCount(0);
  await square(page, 'd4').click();
  await pawn(page, 'd4', 'orange', 2, 'Black');
  await pawn(page, 'd5', 'blue', 1);
  await page.getByRole('button', { name: /Undo move/ }).click();
  await pawn(page, 'e5', 'orange', 2, 'Black');
  await pawn(page, 'd5', 'blue', 1);
});

test('purple pawns can retreat to their own back rank and promote only on the opposing last rank', async ({ page }) => {
  await importPosition(page, '8/7k/8/8/8/8/D7/7K w - - 0 1');
  await pawn(page, 'a2', 'purple', 3);
  await move(page, 'a2', 'a1');
  await pawn(page, 'a1', 'purple', 3);
  await expect(page.locator('#promotion')).not.toBeVisible();
  await move(page, 'h7', 'h6');
  await move(page, 'a1', 'a8');
  await expectPromotionChoices(page);
  await page.getByRole('button', { name: 'Promote to bishop', exact: true }).click();
  await expect(square(page, 'a8')).toHaveAttribute('aria-label', 'a8 White bishop');
  const pgn = await downloadPgn(page);
  expect(pgn).toContain('=B');
  await page.reload();
  await importPgn(page, pgn);
  await expect(square(page, 'a8')).toHaveAttribute('aria-label', 'a8 White bishop');
  await page.getByRole('button', { name: /Undo move/ }).click();
  await pawn(page, 'a1', 'purple', 3);
});
