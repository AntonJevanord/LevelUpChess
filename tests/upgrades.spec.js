const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

const square = (page, name) => page.locator(`[data-square="${name}"]`);
const blue = (page, name, color = 'White') => expect(square(page, name)).toHaveAttribute('aria-label', `${name} ${color} blue knight, level 1`);
async function move(page, from, to) {
  await square(page, from).click();
  await square(page, to).click();
}
async function startUpgradeGame(page) {
  await page.selectOption('#game-mode', 'levelup-knight');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await blue(page, 'b1');
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

test.beforeEach(async ({ page }) => {
  await page.goto('http://127.0.0.1:4173');
});

test('classic chess stays the default and staged upgrades require a confirmed new game', async ({ page }) => {
  await expect(page.locator('#game-mode')).toHaveValue('chess');
  await expect(page.locator('#upgrade-settings')).not.toBeVisible();
  await expect(square(page, 'b1')).toHaveAttribute('aria-label', 'b1 White knight');
  await move(page, 'e2', 'e4');
  await page.selectOption('#game-mode', 'levelup-knight');
  await expect(page.locator('#upgrade-settings')).toBeVisible();
  await expect(page.locator('#upgrade-budget')).toHaveValue('2');
  await expect(page.locator('#upgrade-b1')).toHaveValue('1');
  await expect(page.locator('#upgrade-g1')).toHaveValue('0');
  await expect(square(page, 'b1')).toHaveAttribute('aria-label', 'b1 White knight');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByRole('button', { name: 'Keep playing', exact: true }).click();
  await expect(square(page, 'e4')).toHaveAttribute('aria-label', 'e4 White pawn');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByRole('button', { name: 'Start new game', exact: true }).click();
  await blue(page, 'b1');
  await blue(page, 'b8', 'Black');
  await expect(square(page, 'g1')).toHaveAttribute('aria-label', 'g1 White knight');
  await expect(page.locator('#history li')).toHaveCount(0);

  // Selecting standard chess also waits for New game before changing the board.
  await page.selectOption('#game-mode', 'chess');
  await blue(page, 'b1');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await expect(square(page, 'b1')).toHaveAttribute('aria-label', 'b1 White knight');
});

test('each side has an independent upgrade budget and invalid setup leaves the game intact', async ({ page }) => {
  await page.selectOption('#game-mode', 'levelup-knight');
  await page.selectOption('#upgrade-budget', '1');
  await page.selectOption('#upgrade-g1', '1');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await expect(page.locator('#upgrade-status')).toContainText(/budget|exceed|point/i);
  await expect(square(page, 'b1')).toHaveAttribute('aria-label', 'b1 White knight');

  await page.selectOption('#upgrade-g1', '0');
  await page.selectOption('#upgrade-g8', '1');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await expect(page.locator('#upgrade-status')).toContainText(/budget|exceed|point/i);
  await expect(square(page, 'b8')).toHaveAttribute('aria-label', 'b8 Black knight');

  await page.selectOption('#upgrade-g8', '0');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await blue(page, 'b1');
  await blue(page, 'b8', 'Black');
  await expect(page.locator('.piece')).toHaveCount(32);
});

test('a blue knight keeps knight moves, adds quiet orthogonal moves, and undoes correctly', async ({ page }) => {
  await startUpgradeGame(page);
  await move(page, 'b1', 'c3');
  await move(page, 'a7', 'a6');
  await square(page, 'c3').click();
  await expect(square(page, 'd3').locator('.move-marker')).toHaveCount(1);
  await square(page, 'd3').click();
  await blue(page, 'd3');
  await expect(square(page, 'c3')).toHaveAttribute('aria-label', 'c3 empty');
  await expect(page.locator('#status')).toHaveText('Black to move');
  await expect(page.locator('#history li span')).toHaveCount(3);
  await page.getByRole('button', { name: /Undo move/ }).click();
  await blue(page, 'c3');
  await expect(square(page, 'd3')).toHaveAttribute('aria-label', 'd3 empty');
  await expect(page.locator('#status')).toHaveText('White to move');
});

test('orthogonal additions cannot capture while normal knight captures remain legal', async ({ page }) => {
  await importPgn(page, '[Variant "levelup-knight"]\n[SetUp "1"]\n[FEN "k7/8/2r5/3r4/3E4/3P4/8/7K w - - 0 1"]\n\n*');
  await blue(page, 'd4');
  await square(page, 'd4').click();
  await expect(square(page, 'd5').locator('.capture-marker')).toHaveCount(0);
  await expect(square(page, 'c6').locator('.capture-marker')).toHaveCount(1);
  await square(page, 'd5').click();
  await blue(page, 'd4');
  await expect(square(page, 'd5')).toHaveAttribute('aria-label', 'd5 Black rook');
  await expect(page.locator('#history li')).toHaveCount(0);
  await move(page, 'd4', 'c6');
  await blue(page, 'c6');
  await expect(square(page, 'd4')).toHaveAttribute('aria-label', 'd4 empty');
  await expect(page.locator('#status')).toHaveText('Black to move');
});

test('PGN export and import preserve upgraded starting pieces and quiet move history', async ({ page }) => {
  await startUpgradeGame(page);
  for (const [from, to] of [['b1', 'c3'], ['a7', 'a6'], ['c3', 'd3']]) await move(page, from, to);
  const pgn = await downloadPgn(page);
  expect(pgn).toContain('[Variant "levelup-knight"]');
  expect(pgn).toContain('[SetUp "1"]');
  expect(pgn).toMatch(/\[FEN "[^"\n]*E[^"\n]*"\]/);

  await page.reload();
  await importPgn(page, pgn);
  await blue(page, 'd3');
  await expect(page.locator('#game-mode')).toHaveValue('levelup-knight');
  await expect(page.locator('#history li span')).toHaveCount(3);
  await expect(page.locator('#time-control')).toHaveValue('none');
  await page.getByRole('button', { name: /Undo move/ }).click();
  await blue(page, 'c3');
  await expect(page.locator('#status')).toHaveText('White to move');
});

test('browser saves restore upgrade choices, moves, and paused engine and clocks', async ({ page }) => {
  await page.selectOption('#game-mode', 'levelup-knight');
  await page.selectOption('#upgrade-budget', '1');
  await page.selectOption('#upgrade-b1', '0');
  await page.selectOption('#upgrade-g1', '1');
  await page.selectOption('#time-control', 'five');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await blue(page, 'g1');
  await page.route('**/api/engine/status', route => route.fulfill({ json: { name: 'Test engine' } }));
  let searches = 0;
  await page.route('**/api/engine/move', route => {
    searches++;
    return route.fulfill({ json: { move: 'a7a6' } });
  });
  await page.selectOption('#opponent', 'engine');
  await expect(page.locator('#engine-status')).toContainText('connected');
  await page.getByRole('button', { name: 'Start clock', exact: true }).click();
  await move(page, 'g1', 'f3');
  await expect(square(page, 'a6')).toHaveAttribute('aria-label', 'a6 Black pawn');
  await page.getByRole('button', { name: 'Pause clock', exact: true }).click();
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await expect(page.locator('#save-status')).toContainText('Saved 2 half-moves');
  await page.reload();
  await page.getByRole('button', { name: 'Load saved', exact: true }).click();
  await blue(page, 'f3');
  await expect(square(page, 'b1')).toHaveAttribute('aria-label', 'b1 White knight');
  await expect(page.locator('#game-mode')).toHaveValue('levelup-knight');
  await expect(page.locator('#upgrade-budget')).toHaveValue('1');
  await expect(page.locator('#upgrade-b1')).toHaveValue('0');
  await expect(page.locator('#upgrade-g1')).toHaveValue('1');
  await expect(page.locator('#time-control')).toHaveValue('five');
  await expect(page.getByRole('button', { name: 'Resume clock', exact: true })).toBeVisible();
  await expect(page.locator('#engine-status')).toContainText('Engine paused');
  await move(page, 'f3', 'e3');
  await blue(page, 'f3');
  expect(searches).toBe(1);
  await page.getByRole('button', { name: /Undo move/ }).click();
  await blue(page, 'g1');
  await expect(square(page, 'a7')).toHaveAttribute('aria-label', 'a7 Black pawn');
});

test('invalid variant PGN is rejected before replacing a playable current position', async ({ page }) => {
  await move(page, 'e2', 'e4');
  await importPgn(page, '[Variant "levelup-knight"]\n[SetUp "1"]\n[FEN "k7/8/2r5/3r4/3E4/3P4/8/7K w - - 0 1"]\n\n1. Ed5 *');
  await expect(page.locator('#import-error')).not.toHaveText('');
  await expect(page.locator('#replace-dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(square(page, 'e4')).toHaveAttribute('aria-label', 'e4 White pawn');
  await expect(square(page, 'b1')).toHaveAttribute('aria-label', 'b1 White knight');
  await expect(page.locator('#game-mode')).toHaveValue('chess');
  await move(page, 'e7', 'e5');
  await expect(page.locator('#status')).toHaveText('White to move');
});

test('engine searches receive the fixed variant name and upgraded FEN, and imported play stays paused', async ({ page }) => {
  await startUpgradeGame(page);
  await page.route('**/api/engine/status', route => route.fulfill({ json: { name: 'Test engine' } }));
  let searches = 0;
  await page.route('**/api/engine/move', route => {
    const data = route.request().postDataJSON();
    expect(data.variant).toBe('levelup-knight');
    expect(data.fen).toContain('E');
    expect(data.fen).toContain('e');
    searches++;
    return route.fulfill({ json: { move: searches === 1 ? 'a7a6' : 'a6a5' } });
  });
  await page.selectOption('#opponent', 'engine');
  await expect(page.locator('#engine-status')).toContainText('connected');
  await move(page, 'b1', 'c3');
  await expect(square(page, 'a6')).toHaveAttribute('aria-label', 'a6 Black pawn');
  await move(page, 'c3', 'd3');
  await expect(square(page, 'a5')).toHaveAttribute('aria-label', 'a5 Black pawn');
  const pgn = await downloadPgn(page);
  await importPgn(page, pgn);
  await page.getByRole('button', { name: 'Replace game', exact: true }).click();
  await blue(page, 'd3');
  await expect(page.locator('#engine-status')).toContainText('Engine paused');
  expect(searches).toBe(2);
});

test('standalone HTML runs upgraded rules with every companion request blocked', async ({ page }) => {
  const requests = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    requests.push(route.request().url());
    return route.abort();
  });
  await page.goto('about:blank');
  await page.setContent(await fs.readFile(path.resolve(__dirname, '../index.html'), 'utf8'));
  await expect(page.locator('.square')).toHaveCount(64);
  await startUpgradeGame(page);
  for (const [from, to] of [['b1', 'c3'], ['a7', 'a6'], ['c3', 'd3']]) await move(page, from, to);
  await blue(page, 'd3');
  await expect(page.locator('#status')).toHaveText('Black to move');
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

test('native Fairy Stockfish plays an upgraded game through the browser bridge', async ({ page }) => {
  test.skip(!process.env.FAIRY_STOCKFISH_PATH, 'Set FAIRY_STOCKFISH_PATH to run native engine integration.');
  await startUpgradeGame(page);
  await page.selectOption('#opponent', 'engine');
  await expect(page.locator('#engine-status')).toContainText('connected');
  await page.selectOption('#difficulty', 'easy');
  await move(page, 'b1', 'c3');
  await expect(page.locator('#status')).toHaveText('White to move');
  await expect(page.locator('#history li span')).toHaveCount(2);
  await blue(page, 'c3');
  await page.getByRole('button', { name: /Undo move/ }).click();
  await blue(page, 'b1');
  await expect(page.locator('#engine-status')).toContainText('paused after undo');
});

test('cancelling a new game during rule loading preserves the current board', async ({ page }) => {
  await page.evaluate(() => {
    const instantiate = WebAssembly.instantiate;
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    window.releaseRulesForTest = release;
    WebAssembly.instantiate = async (...args) => { await gate; return instantiate(...args); };
  });
  await move(page, 'e2', 'e4');
  await page.selectOption('#game-mode', 'levelup-knight');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByRole('button', { name: 'Start new game', exact: true }).click();
  await expect(page.locator('#upgrade-status')).toContainText('Loading');
  await page.getByRole('button', { name: 'Keep playing', exact: true }).click();
  await page.evaluate(() => window.releaseRulesForTest());
  await expect(page.getByRole('button', { name: 'New game', exact: true })).toBeEnabled();
  await expect(square(page, 'e4')).toHaveAttribute('aria-label', 'e4 White pawn');
  await expect(square(page, 'b1')).toHaveAttribute('aria-label', 'b1 White knight');
  await move(page, 'e7', 'e5');
  await expect(page.locator('#status')).toHaveText('White to move');
});
