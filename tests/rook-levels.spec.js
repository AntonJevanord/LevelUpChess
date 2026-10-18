const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');

const square = (page, name) => page.locator(`[data-square="${name}"]`);
const marker = (page, name) => square(page, name).locator('.move-marker, .capture-marker');
const slots = {
  pawn: [...'abcdefgh'].flatMap(file => [file + '2', file + '7']),
  knight: ['b1', 'g1', 'b8', 'g8'],
  bishop: ['c1', 'f1', 'c8', 'f8'],
  queen: ['d1', 'd8'],
  rook: ['a1', 'h1', 'a8', 'h8'],
};

async function purple(page, name, color = 'White') {
  await expect(square(page, name)).toHaveAttribute('aria-label', `${name} ${color} purple rook, level 3`);
  await expect(square(page, name).locator('.piece.upgraded.purple')).toHaveCount(1);
  await expect(square(page, name).locator('.piece-level')).toHaveText('L3');
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
async function importPosition(page, fen) {
  await importPgn(page, `[Variant "levelup-v5"]\n[SetUp "1"]\n[FEN "${fen}"]\n\n*`);
}
async function downloadPgn(page) {
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PGN', exact: true }).click();
  return fs.readFile(await (await waiting).path(), 'utf8');
}
async function clocks(page, white, black) {
  await expect(page.locator('#white-clock')).toHaveText(white);
  await expect(page.locator('#black-clock')).toHaveText(black);
}

test.beforeEach(async ({ page }) => {
  await page.goto('http://127.0.0.1:4173');
});

test('rook setup offers every rook level and all thirty slots fit the maximum 45-point army', async ({ page }) => {
  await page.selectOption('#game-mode', 'levelup-v5');
  await page.selectOption('#piece-family', 'rook');
  await expect(page.locator('.piece-choices[data-family="rook"] select')).toHaveCount(4);
  await expect(page.locator('#piece-upgrade-choices select')).toHaveCount(30);
  await expect(page.locator('#piece-upgrade-budget')).toHaveAttribute('max', '45');
  for (const name of slots.rook) {
    const select = page.locator(`#piece-upgrade-${name}`);
    await expect(select).toBeVisible();
    expect(await select.locator('option').evaluateAll(options => options.map(option => option.value))).toEqual(['0', '1', '2', '3']);
  }
  await page.locator('#piece-upgrade-budget').fill('45');
  for (const [family, names] of Object.entries(slots)) {
    await page.selectOption('#piece-family', family);
    for (const name of names) await page.selectOption(`#piece-upgrade-${name}`, '3');
  }
  await expect(page.locator('#piece-upgrade-status')).toContainText('White 45/45');
  await expect(page.locator('#piece-upgrade-status')).toContainText('Black 45/45');
  await expect(square(page, 'a1')).toHaveAttribute('aria-label', 'a1 White rook');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  for (const [name, color] of [['a1', 'White'], ['h1', 'White'], ['a8', 'Black'], ['h8', 'Black']]) await purple(page, name, color);
  await expect(page.locator('.piece')).toHaveCount(36);
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Load saved', exact: true }).click();
  await purple(page, 'a1');
  await purple(page, 'h8', 'Black');
  await expect(page.locator('#piece-upgrade-budget')).toHaveValue('45');
  for (const names of Object.values(slots)) {
    for (const name of names) await expect(page.locator(`#piece-upgrade-${name}`)).toHaveValue('3');
  }
});

test('rook costs use the same per-side budget as other upgrades and invalid choices leave the board intact', async ({ page }) => {
  await page.selectOption('#game-mode', 'levelup-v5');
  await page.selectOption('#piece-family', 'rook');
  await page.selectOption('#piece-upgrade-a1', '3');
  await page.selectOption('#piece-upgrade-h1', '3');
  await expect(page.locator('#piece-upgrade-status')).toContainText('White 7/6');
  await expect(page.locator('#piece-upgrade-status')).toContainText('Black 1/6');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  for (const name of ['a1', 'h1']) await expect(square(page, name)).toHaveAttribute('aria-label', `${name} White rook`);
  await page.locator('#piece-upgrade-budget').fill('7');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await purple(page, 'a1');
  await purple(page, 'h1');
  for (const name of ['a8', 'h8']) await expect(square(page, name)).toHaveAttribute('aria-label', `${name} Black rook`);
  await expect(page.locator('.piece')).toHaveCount(32);
});

for (const fixture of [
  { color: 'White', from: 'd4', fen: 'k7/8/2rr1r2/2rPP3/1rPOP3/3P4/8/7K w - - 0 1', captures: ['c5', 'c6', 'f6', 'd6', 'b4'], quietJumps: ['e6', 'f5', 'b6', 'c3', 'e3', 'd2', 'f4'], blocker: 'e5' },
  { color: 'Black', from: 'd5', fen: '7k/8/3p4/1Rpop3/2Rpp3/2RR1R2/8/K7 b - - 0 1', captures: ['c4', 'c3', 'f3', 'd3', 'b5'], quietJumps: ['e3', 'f4', 'b3', 'c6', 'e6', 'd7', 'f5'], blocker: 'e4' },
]) {
  test(`${fixture.color.toLowerCase()} purple rooks capture throughout a 5 by 5 area and jump over blockers without quiet leaps`, async ({ page }) => {
    await importPosition(page, fixture.fen);
    await purple(page, fixture.from, fixture.color);
    await square(page, fixture.from).click();
    for (const name of fixture.captures) await expect(square(page, name).locator('.capture-marker')).toHaveCount(1);
    for (const name of fixture.quietJumps) await expect(marker(page, name)).toHaveCount(0);
    await square(page, fixture.from).click();
    for (const name of fixture.captures) {
      await move(page, fixture.from, name);
      await purple(page, name, fixture.color);
      await expect(square(page, fixture.blocker)).toHaveAttribute('aria-label', `${fixture.blocker} ${fixture.color} pawn`);
      await page.getByRole('button', { name: /Undo move/ }).click();
      await purple(page, fixture.from, fixture.color);
    }
  });
}

test('purple rooks retain ordinary quiet rook movement and cannot move quietly on diagonals or knight paths', async ({ page }) => {
  await importPosition(page, 'k7/8/8/8/3O4/8/8/7K w - - 0 1');
  await purple(page, 'd4');
  await square(page, 'd4').click();
  for (const name of ['d6', 'd7', 'd8', 'a4', 'h4', 'd1']) await expect(square(page, name).locator('.move-marker')).toHaveCount(1);
  for (const name of ['e5', 'f6', 'c6', 'e2']) await expect(marker(page, name)).toHaveCount(0);
  await square(page, 'd7').click();
  await purple(page, 'd7');
});

for (const fixture of [
  { color: 'White', fen: '4k3/8/8/8/8/8/8/R3K2O w KQ - 0 1', king: 'e1', to: 'g1', corner: 'h1', rookTo: 'f1', standardTo: 'c1', standardRookTo: 'd1', san: 'O-O' },
  { color: 'White', fen: '4k3/8/8/8/8/8/8/O3K2R w KQ - 0 1', king: 'e1', to: 'c1', corner: 'a1', rookTo: 'd1', standardTo: 'g1', standardRookTo: 'f1', san: 'O-O-O' },
  { color: 'Black', fen: 'r3k2o/8/8/8/8/8/8/4K3 b kq - 0 1', king: 'e8', to: 'g8', corner: 'h8', rookTo: 'f8', standardTo: 'c8', standardRookTo: 'd8', san: 'O-O' },
  { color: 'Black', fen: 'o3k2r/8/8/8/8/8/8/4K3 b kq - 0 1', king: 'e8', to: 'c8', corner: 'a8', rookTo: 'd8', standardTo: 'g8', standardRookTo: 'f8', san: 'O-O-O' },
]) {
  test(`${fixture.color.toLowerCase()} ${fixture.san} moves a purple rook and undo leaves the opposite standard castle available`, async ({ page }) => {
    await importPosition(page, fixture.fen);
    await purple(page, fixture.corner, fixture.color);
    await square(page, fixture.king).click();
    await expect(square(page, fixture.to).locator('.move-marker')).toHaveCount(1);
    await expect(square(page, fixture.standardTo).locator('.move-marker')).toHaveCount(1);
    await square(page, fixture.to).click();
    await expect(square(page, fixture.to)).toHaveAttribute('aria-label', `${fixture.to} ${fixture.color} king`);
    await purple(page, fixture.rookTo, fixture.color);
    await expect(square(page, fixture.corner)).toHaveAttribute('aria-label', `${fixture.corner} empty`);
    await expect(page.locator('#history li span').last()).toHaveText(fixture.san);
    await page.getByRole('button', { name: /Undo move/ }).click();
    await purple(page, fixture.corner, fixture.color);
    await expect(square(page, fixture.king)).toHaveAttribute('aria-label', `${fixture.king} ${fixture.color} king`);
    await move(page, fixture.king, fixture.standardTo);
    await expect(square(page, fixture.standardTo)).toHaveAttribute('aria-label', `${fixture.standardTo} ${fixture.color} king`);
    await expect(square(page, fixture.standardRookTo)).toHaveAttribute('aria-label', `${fixture.standardRookTo} ${fixture.color} rook`);
    await purple(page, fixture.corner, fixture.color);
  });
}

test('purple capture jumps attack the castling path even when an intervening pawn blocks the diagonal', async ({ page }) => {
  for (const fixture of [
    { fen: '4k3/8/8/8/8/7o/6P1/R3K2O w KQ - 0 1', king: 'e1', forbidden: 'g1', allowed: 'c1', attacker: 'h3', color: 'Black' },
    { fen: 'r3k2o/6p1/7O/8/8/8/8/4K3 b kq - 0 1', king: 'e8', forbidden: 'g8', allowed: 'c8', attacker: 'h6', color: 'White' },
  ]) {
    await page.reload();
    await importPosition(page, fixture.fen);
    await purple(page, fixture.attacker, fixture.color);
    await square(page, fixture.king).click();
    await expect(marker(page, fixture.forbidden)).toHaveCount(0);
    await expect(square(page, fixture.allowed).locator('.move-marker')).toHaveCount(1);
  }
});

test('a purple rook that returns to its starting corner has lost its castling right after PGN recovery', async ({ page }) => {
  await importPosition(page, '4k3/8/8/8/8/8/8/R3K2O w KQ - 0 1');
  await purple(page, 'h1');
  for (const [from, to] of [['h1', 'h2'], ['e8', 'd8'], ['h2', 'h1'], ['d8', 'e8']]) await move(page, from, to);
  const pgn = await downloadPgn(page);
  await page.reload();
  await importPgn(page, pgn);
  await purple(page, 'h1');
  await expect(page.locator('#history li span')).toHaveCount(4);
  await square(page, 'e1').click();
  await expect(marker(page, 'g1')).toHaveCount(0);
  await expect(square(page, 'c1').locator('.move-marker')).toHaveCount(1);
});

test('capturing a corner purple rook removes its right even when another purple rook replaces it', async ({ page }) => {
  await importPosition(page, '4k3/8/8/8/8/7O/6bP/R3K2O b KQ - 0 1');
  await purple(page, 'h1');
  await move(page, 'g2', 'h1');
  await expect(square(page, 'h1')).toHaveAttribute('aria-label', 'h1 Black bishop');
  await move(page, 'h3', 'h1');
  await purple(page, 'h1');
  await expect(square(page, 'h2')).toHaveAttribute('aria-label', 'h2 White pawn');
  await move(page, 'e8', 'd8');
  const pgn = await downloadPgn(page);
  await page.reload();
  await importPgn(page, pgn);
  await purple(page, 'h1');
  await square(page, 'e1').click();
  await expect(marker(page, 'g1')).toHaveCount(0);
  await expect(square(page, 'c1').locator('.move-marker')).toHaveCount(1);
});

test('timed custom castling survives saves and PGN and undo restores the purple rook and previous clocks', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-18T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-18T12:00:01Z'));
  await page.reload();
  await page.selectOption('#game-mode', 'levelup-v5');
  await page.selectOption('#piece-family', 'rook');
  await page.selectOption('#piece-upgrade-h1', '3');
  await page.selectOption('#piece-upgrade-h8', '3');
  await page.selectOption('#time-control', 'five');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await purple(page, 'h1');
  await purple(page, 'h8', 'Black');
  await page.getByRole('button', { name: 'Start clock', exact: true }).click();
  for (const [from, to] of [['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3'], ['g8', 'f6'], ['f1', 'c4'], ['f8', 'c5'], ['e1', 'g1'], ['e8', 'g8']]) {
    await page.clock.fastForward(1_000);
    await move(page, from, to);
  }
  await purple(page, 'f1');
  await purple(page, 'f8', 'Black');
  await clocks(page, '04:56', '04:56');
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await expect(page.locator('#save-status')).toContainText('Saved 8 half-moves');
  const pgn = await downloadPgn(page);
  expect(pgn).toContain('[Variant "levelup-v5"]');
  expect(pgn.match(/O-O/g)).toHaveLength(2);
  await page.reload();
  await page.getByRole('button', { name: 'Load saved', exact: true }).click();
  await purple(page, 'f1');
  await purple(page, 'f8', 'Black');
  await clocks(page, '04:56', '04:56');
  await expect(page.getByRole('button', { name: 'Resume clock', exact: true })).toBeVisible();
  for (const name of ['h1', 'h8']) await expect(page.locator(`#piece-upgrade-${name}`)).toHaveValue('3');
  await page.getByRole('button', { name: /Undo move/ }).click();
  await purple(page, 'h8', 'Black');
  await expect(square(page, 'e8')).toHaveAttribute('aria-label', 'e8 Black king');
  await purple(page, 'f1');
  await clocks(page, '04:56', '04:57');
  await page.reload();
  await importPgn(page, pgn);
  await purple(page, 'f1');
  await purple(page, 'f8', 'Black');
  await expect(page.locator('#time-control')).toHaveValue('none');
  await page.getByRole('button', { name: /Undo move/ }).click();
  await purple(page, 'h8', 'Black');
  await expect(square(page, 'e8')).toHaveAttribute('aria-label', 'e8 Black king');
});

test('the engine bridge receives the purple rook variant and applies ordinary king UCI castling', async ({ page }) => {
  await importPosition(page, '4k3/8/8/8/8/8/8/R3K2O w KQ - 0 1');
  await purple(page, 'h1');
  await page.route('**/api/engine/status', route => route.fulfill({ json: { name: 'Test engine' } }));
  const searches = [];
  await page.route('**/api/engine/move', route => {
    const data = route.request().postDataJSON();
    searches.push(data);
    return route.fulfill({ json: { move: 'e1g1' } });
  });
  await page.selectOption('#opponent', 'engine');
  await expect(page.locator('#engine-status')).toContainText('connected');
  await page.selectOption('#human-side', 'b');
  await purple(page, 'f1');
  await expect(square(page, 'g1')).toHaveAttribute('aria-label', 'g1 White king');
  await expect(page.locator('#history li span')).toHaveText(['O-O']);
  expect(searches).toHaveLength(1);
  expect(searches[0].variant).toBe('levelup-v5');
  expect(searches[0].fen).toContain('R3K2O w KQ');
});
