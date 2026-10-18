const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');

const square = (page, name) => page.locator(`[data-square="${name}"]`);
const marker = (page, name) => square(page, name).locator('.move-marker, .capture-marker');

async function upgraded(page, name, accent, level, family, color = 'White') {
  await expect(square(page, name)).toHaveAttribute('aria-label', `${name} ${color} ${accent} ${family}, level ${level}`);
  await expect(square(page, name).locator(`.piece.upgraded.${accent}`)).toHaveCount(1);
  await expect(square(page, name).locator('.piece-level')).toHaveText(`L${level}`);
}
async function move(page, from, to) {
  await square(page, from).click();
  await square(page, to).click();
}
async function importPgn(page, text) {
  await page.getByRole('button', { name: 'Import PGN', exact: true }).click();
  await page.locator('#pgn-text').fill(text);
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
}
async function importPosition(page, fen, variant = 'levelup-v5') {
  await importPgn(page, `[Variant "${variant}"]\n[SetUp "1"]\n[FEN "${fen}"]\n\n*`);
}
async function downloadPgn(page) {
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PGN', exact: true }).click();
  return fs.readFile(await (await waiting).path(), 'utf8');
}
async function chooseHomeArmy(page) {
  await page.selectOption('#game-mode', 'levelup-v5');
  await page.selectOption('#piece-family', 'queen');
  for (const name of ['d1', 'd8']) await page.selectOption(`#piece-upgrade-${name}`, '1');
  await page.selectOption('#piece-family', 'rook');
  for (const name of ['a1', 'a8']) await page.selectOption(`#piece-upgrade-${name}`, '1');
  for (const name of ['h1', 'h8']) await page.selectOption(`#piece-upgrade-${name}`, '2');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await upgraded(page, 'd1', 'blue', 1, 'queen');
}

test.beforeEach(async ({ page }) => {
  await page.goto('http://127.0.0.1:4173');
});

test('current setup offers blue queens and every rook level within the shared army budget', async ({ page }) => {
  await page.selectOption('#game-mode', 'levelup-v5');
  await page.selectOption('#piece-family', 'queen');
  for (const name of ['d1', 'd8']) {
    const select = page.locator(`#piece-upgrade-${name}`);
    await expect(select).toBeVisible();
    expect(await select.locator('option').evaluateAll(options => options.map(option => [option.value, option.disabled]))).toEqual([
      ['0', false], ['1', false], ['2', false], ['3', false],
    ]);
  }
  await expect(page.locator('#piece-upgrade-rules')).toContainText('home two ranks');
  await chooseHomeArmy(page);
  await expect(page.locator('#piece-upgrade-status')).toContainText('White 5/6');
  await expect(page.locator('#piece-upgrade-status')).toContainText('Black 5/6');
  for (const [rank, color] of [['1', 'White'], ['8', 'Black']]) {
    await upgraded(page, 'd' + rank, 'blue', 1, 'queen', color);
    await upgraded(page, 'a' + rank, 'blue', 1, 'rook', color);
    await upgraded(page, 'h' + rank, 'orange', 2, 'rook', color);
  }
  await expect(page.locator('#piece-upgrade-choices select')).toHaveCount(30);
  await expect(page.locator('#piece-upgrade-budget')).toHaveAttribute('max', '45');
  await expect(page.locator('.piece')).toHaveCount(32);
});

for (const fixture of [
  { color: 'White', from: 'd1', to: 'e3', jumps: ['e3', 'e4', 'f4'], after: ['f5', 'f6', 'g6'], fen: 'k7/8/8/8/8/8/3NN3/3S3K w - - 0 1', next: ['a8', 'b8'] },
  { color: 'Black', from: 'd8', to: 'e6', jumps: ['e6', 'e5', 'f5'], after: ['f4', 'f3', 'g3'], fen: '3s3k/3nn3/8/8/8/8/8/K7 b - - 0 1', next: ['a1', 'b1'] },
]) {
  test(`${fixture.color.toLowerCase()} blue queens jump over blockers from home and lose their quiet leaps after leaving`, async ({ page }) => {
    await importPosition(page, fixture.fen);
    await upgraded(page, fixture.from, 'blue', 1, 'queen', fixture.color);
    await square(page, fixture.from).click();
    for (const name of fixture.jumps) await expect(square(page, name).locator('.move-marker')).toHaveCount(1);
    await square(page, fixture.to).click();
    await upgraded(page, fixture.to, 'blue', 1, 'queen', fixture.color);
    await move(page, ...fixture.next);
    await square(page, fixture.to).click();
    for (const name of fixture.after) await expect(marker(page, name)).toHaveCount(0);
    await page.getByRole('button', { name: /Undo move/ }).click();
    await page.getByRole('button', { name: /Undo move/ }).click();
    await upgraded(page, fixture.from, 'blue', 1, 'queen', fixture.color);
    await square(page, fixture.from).click();
    for (const name of fixture.jumps) await expect(square(page, name).locator('.move-marker')).toHaveCount(1);
  });
}

test('blue rook jumps work from the second home rank and reactivate after a return for either color', async ({ page }) => {
  for (const fixture of [
    { color: 'White', from: 'd2', to: 'd4', homeJump: 'f2', outsideJump: 'f4', other: ['a8', 'a7'], fen: 'k7/8/8/8/4N3/8/3LN3/7K w - - 0 1' },
    { color: 'Black', from: 'd7', to: 'd5', homeJump: 'f7', outsideJump: 'f5', other: ['a1', 'a2'], fen: '7k/3ln3/8/4n3/8/8/8/K7 b - - 0 1' },
  ]) {
    await page.reload();
    await importPosition(page, fixture.fen);
    await upgraded(page, fixture.from, 'blue', 1, 'rook', fixture.color);
    await square(page, fixture.from).click();
    await expect(square(page, fixture.homeJump).locator('.move-marker')).toHaveCount(1);
    await square(page, fixture.to).click();
    await move(page, ...fixture.other);
    await square(page, fixture.to).click();
    await expect(marker(page, fixture.outsideJump)).toHaveCount(0);
    await square(page, fixture.from).click();
    await move(page, fixture.other[1], fixture.other[0]);
    await square(page, fixture.from).click();
    await expect(square(page, fixture.homeJump).locator('.move-marker')).toHaveCount(1);
    await square(page, fixture.homeJump).click();
    await upgraded(page, fixture.homeJump, 'blue', 1, 'rook', fixture.color);
  }
});

test('orange rooks capture across one screen, leave it intact, and cannot cross screens quietly', async ({ page }) => {
  for (const fixture of [
    { color: 'White', from: 'd4', screen: 'e4', target: 'g4', empty: 'f4', fen: 'k7/8/8/8/3MN1p1/8/8/7K w - - 0 1' },
    { color: 'Black', from: 'd5', screen: 'e5', target: 'g5', empty: 'f5', fen: '7k/8/8/3mn1P1/8/8/8/K7 b - - 0 1' },
  ]) {
    await page.reload();
    await importPosition(page, fixture.fen);
    await upgraded(page, fixture.from, 'orange', 2, 'rook', fixture.color);
    await square(page, fixture.from).click();
    await expect(square(page, fixture.target).locator('.capture-marker')).toHaveCount(1);
    await expect(marker(page, fixture.empty)).toHaveCount(0);
    await expect(marker(page, fixture.screen)).toHaveCount(0);
    await square(page, fixture.target).click();
    await upgraded(page, fixture.target, 'orange', 2, 'rook', fixture.color);
    await expect(square(page, fixture.screen)).toHaveAttribute('aria-label', `${fixture.screen} ${fixture.color} knight`);
    await page.getByRole('button', { name: /Undo move/ }).click();
    await upgraded(page, fixture.from, 'orange', 2, 'rook', fixture.color);
  }
});

test('blue queens and blue/orange rooks retain rules, starting choices, history, and undo through saves and PGN', async ({ page }) => {
  await chooseHomeArmy(page);
  for (const [from, to] of [['d1', 'e4'], ['d8', 'e5'], ['a1', 'a3'], ['a8', 'a6']]) await move(page, from, to);
  await upgraded(page, 'e4', 'blue', 1, 'queen');
  await upgraded(page, 'e5', 'blue', 1, 'queen', 'Black');
  await upgraded(page, 'a3', 'blue', 1, 'rook');
  await upgraded(page, 'a6', 'blue', 1, 'rook', 'Black');
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await expect(page.locator('#save-status')).toContainText('Saved 4 half-moves');
  const pgn = await downloadPgn(page);
  expect(pgn).toContain('[Variant "levelup-v5"]');
  expect(pgn).toContain('Se4');
  expect(pgn).toContain('La3');
  for (const recovery of ['save', 'pgn']) {
    await page.reload();
    if (recovery === 'save') await page.getByRole('button', { name: 'Load saved', exact: true }).click();
    else await importPgn(page, pgn);
    await expect(page.locator('#game-mode')).toHaveValue('levelup-v5');
    await expect(page.locator('#piece-upgrade-budget')).toHaveValue('6');
    for (const name of ['d1', 'd8', 'a1', 'a8']) await expect(page.locator(`#piece-upgrade-${name}`)).toHaveValue('1');
    for (const name of ['h1', 'h8']) await expect(page.locator(`#piece-upgrade-${name}`)).toHaveValue('2');
    await expect(page.locator('#history li span')).toHaveCount(4);
    await upgraded(page, 'h1', 'orange', 2, 'rook');
    await upgraded(page, 'h8', 'orange', 2, 'rook', 'Black');
    await page.getByRole('button', { name: /Undo move/ }).click();
    await upgraded(page, 'a8', 'blue', 1, 'rook', 'Black');
    await upgraded(page, 'a3', 'blue', 1, 'rook');
    await expect(page.locator('#status')).toHaveText('Black to move');
  }
});

test('version 04 disables new upgrades and imported old games keep their original profile', async ({ page }) => {
  await page.selectOption('#game-mode', 'levelup-v5');
  await page.selectOption('#piece-family', 'queen');
  await page.selectOption('#piece-upgrade-d1', '1');
  await page.selectOption('#piece-family', 'rook');
  await page.selectOption('#piece-upgrade-a1', '1');
  await page.selectOption('#game-mode', 'levelup');
  await expect(page.locator('#piece-upgrade-budget')).toHaveAttribute('max', '39');
  await expect(page.locator('#piece-family option[value="rook"]')).toBeDisabled();
  for (const name of ['a1', 'h1', 'a8', 'h8']) {
    await expect(page.locator(`#piece-upgrade-${name}`)).toBeDisabled();
    await expect(page.locator(`#piece-upgrade-${name}`)).toHaveValue('0');
  }
  await page.selectOption('#piece-family', 'queen');
  await expect(page.locator('#piece-upgrade-d1 option[value="1"]')).toBeDisabled();
  await expect(page.locator('#piece-upgrade-d1')).toHaveValue('0');
  await importPosition(page, 'k7/8/8/8/3T4/8/8/7K w - - 0 1', 'levelup');
  await upgraded(page, 'd4', 'orange', 2, 'queen');
  await move(page, 'd4', 'e6');
  await upgraded(page, 'e6', 'orange', 2, 'queen');
  const pgn = await downloadPgn(page);
  expect(pgn).toContain('[Variant "levelup"]');
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Load saved', exact: true }).click();
  await upgraded(page, 'e6', 'orange', 2, 'queen');
  await expect(page.locator('#game-mode')).toHaveValue('levelup');
  await page.getByRole('button', { name: /Undo move/ }).click();
  await upgraded(page, 'd4', 'orange', 2, 'queen');
});
