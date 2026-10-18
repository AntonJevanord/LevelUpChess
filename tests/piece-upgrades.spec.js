const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

const square = (page, name) => page.locator(`[data-square="${name}"]`);
const marker = (page, name) => square(page, name).locator('.move-marker, .capture-marker');
const mixedLevels = { b1: '3', b8: '2', c1: '3', f8: '1', d1: '2', d8: '3' };
const familyFor = name => ['b1', 'g1', 'b8', 'g8'].includes(name) ? 'knight'
  : ['c1', 'f1', 'c8', 'f8'].includes(name) ? 'bishop' : 'queen';

async function upgraded(page, name, accent, level, family, color = 'White') {
  await expect(square(page, name)).toHaveAttribute('aria-label', `${name} ${color} ${accent} ${family}, level ${level}`);
  await expect(square(page, name).locator(`.piece.upgraded.${accent}`)).toHaveCount(1);
  await expect(square(page, name).locator('.piece-level')).toHaveText(`L${level}`);
}
async function move(page, from, to) {
  await square(page, from).click();
  await square(page, to).click();
}
async function chooseLevels(page, levels = mixedLevels, budget = '8') {
  await page.selectOption('#game-mode', 'levelup');
  await page.locator('#piece-upgrade-budget').fill(budget);
  for (const [name, level] of Object.entries(levels)) {
    await page.selectOption('#piece-family', familyFor(name));
    await page.selectOption(`#piece-upgrade-${name}`, level);
  }
}
async function startMixedGame(page, budget = '8') {
  await chooseLevels(page, mixedLevels, budget);
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await upgraded(page, 'b3', 'purple', 3, 'knight');
}
async function importPgn(page, text) {
  await page.getByRole('button', { name: 'Import PGN', exact: true }).click();
  await page.locator('#pgn-text').fill(text);
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
}
const positionPgn = (fen, variant = 'levelup') => `[Variant "${variant}"]\n[SetUp "1"]\n[FEN "${fen}"]\n\n*`;
async function downloadPgn(page) {
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PGN', exact: true }).click();
  return fs.readFile(await (await waiting).path(), 'utf8');
}
async function expectMixedChoices(page, budget = '8') {
  await expect(page.locator('#game-mode')).toHaveValue('levelup');
  await expect(page.locator('#piece-upgrade-budget')).toHaveValue(budget);
  for (const [name, level] of Object.entries(mixedLevels)) await expect(page.locator(`#piece-upgrade-${name}`)).toHaveValue(level);
}

test.beforeEach(async ({ page }) => {
  await page.goto('http://127.0.0.1:4173');
});

test('mixed piece upgrades share per-side budgets and purple bishops replace their starting pieces', async ({ page }) => {
  await expect(page.locator('#game-mode option[value="levelup"]')).toHaveText('Version 04 piece rules');
  await page.selectOption('#game-mode', 'levelup');
  await expect(page.locator('#piece-upgrade-budget')).toHaveValue('6');
  await expect(page.locator('#piece-upgrade-budget')).toHaveAttribute('min', '1');
  await expect(page.locator('#piece-upgrade-budget')).toHaveAttribute('max', '39');
  await startMixedGame(page);
  await expect(page.locator('#piece-upgrade-status')).toContainText('White 8/8');
  await expect(page.locator('#piece-upgrade-status')).toContainText('Black 6/8');
  await upgraded(page, 'c1', 'purple', 3, 'bishop');
  await upgraded(page, 'd1', 'orange', 2, 'queen');
  await upgraded(page, 'b8', 'orange', 2, 'knight', 'Black');
  await upgraded(page, 'f8', 'blue', 1, 'bishop', 'Black');
  await upgraded(page, 'd8', 'purple', 3, 'queen', 'Black');
  await expect(square(page, 'b1')).toHaveAttribute('aria-label', 'b1 White knight');
  await expect(square(page, 'c3')).toHaveAttribute('aria-label', 'c3 empty');
  await expect(page.locator('.piece')).toHaveCount(33);
  for (const [name, color, piece] of [
    ['a1', 'White', 'rook'], ['h1', 'White', 'rook'], ['e1', 'White', 'king'],
    ['a8', 'Black', 'rook'], ['h8', 'Black', 'rook'], ['e8', 'Black', 'king'],
  ]) await expect(square(page, name)).toHaveAttribute('aria-label', `${name} ${color} ${piece}`);
});

test('an over-budget mixed army leaves the playable current board unchanged', async ({ page }) => {
  await chooseLevels(page, mixedLevels, '7');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await expect(page.locator('#piece-upgrade-status')).toContainText('White 8/7');
  await expect(square(page, 'b1')).toHaveAttribute('aria-label', 'b1 White knight');
  await expect(square(page, 'c1')).toHaveAttribute('aria-label', 'c1 White bishop');
  await expect(square(page, 'b3')).toHaveAttribute('aria-label', 'b3 empty');
  await page.locator('#piece-upgrade-budget').fill('8');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await upgraded(page, 'c1', 'purple', 3, 'bishop');
});

test('purple knights take one orthogonal step or jump two squares over friendly and enemy blockers', async ({ page }) => {
  await importPgn(page, positionPgn('k7/8/8/3P4/1rPGr3/8/3r4/7K w - - 0 1'));
  await upgraded(page, 'd4', 'purple', 3, 'knight');
  await square(page, 'd4').click();
  for (const name of ['d3', 'd6', 'f4']) await expect(square(page, name).locator('.move-marker')).toHaveCount(1);
  for (const name of ['e4', 'b4', 'd2']) await expect(square(page, name).locator('.capture-marker')).toHaveCount(1);
  for (const name of ['c4', 'd5', 'e5', 'f5', 'e6', 'd7']) await expect(marker(page, name)).toHaveCount(0);
  await square(page, 'd3').click();
  await upgraded(page, 'd3', 'purple', 3, 'knight');
  await page.getByRole('button', { name: /Undo move/ }).click();
  await move(page, 'd4', 'd6');
  await upgraded(page, 'd6', 'purple', 3, 'knight');
  await expect(square(page, 'd5')).toHaveAttribute('aria-label', 'd5 White pawn');
  await page.getByRole('button', { name: /Undo move/ }).click();
  await move(page, 'd4', 'e4');
  await upgraded(page, 'e4', 'purple', 3, 'knight');
  await page.getByRole('button', { name: /Undo move/ }).click();
  await move(page, 'd4', 'b4');
  await upgraded(page, 'b4', 'purple', 3, 'knight');
  await expect(square(page, 'c4')).toHaveAttribute('aria-label', 'c4 White pawn');
});

test('purple knight steps and jumps obey pins and protect squares from the opposing king', async ({ page }) => {
  await importPgn(page, positionPgn('k2r4/8/8/8/8/8/3G4/3K4 w - - 0 1'));
  await upgraded(page, 'd2', 'purple', 3, 'knight');
  await square(page, 'd2').click();
  for (const name of ['e2', 'f2']) await expect(marker(page, name)).toHaveCount(0);
  for (const name of ['d3', 'd4']) await expect(square(page, name).locator('.move-marker')).toHaveCount(1);
  await page.reload();
  await importPgn(page, positionPgn('8/8/8/5k2/4G3/8/8/K7 b - - 0 1'));
  await square(page, 'f5').click();
  for (const name of ['f4', 'e5', 'g4']) await expect(marker(page, name)).toHaveCount(0);
  await expect(square(page, 'g5').locator('.move-marker')).toHaveCount(1);
});

test('blue bishops add quiet orthogonal steps while retaining ordinary diagonal captures', async ({ page }) => {
  await importPgn(page, positionPgn('k7/8/5r2/3r4/3H4/8/8/7K w - - 0 1'));
  await upgraded(page, 'd4', 'blue', 1, 'bishop');
  await square(page, 'd4').click();
  for (const name of ['e4', 'd3', 'c4']) await expect(square(page, name).locator('.move-marker')).toHaveCount(1);
  await expect(square(page, 'd5').locator('.capture-marker')).toHaveCount(0);
  await expect(square(page, 'f6').locator('.capture-marker')).toHaveCount(1);
  await square(page, 'e4').click();
  await upgraded(page, 'e4', 'blue', 1, 'bishop');
  await page.getByRole('button', { name: /Undo move/ }).click();
  await move(page, 'd4', 'f6');
  await upgraded(page, 'f6', 'blue', 1, 'bishop');
  // A move-only step must not count as an attack on a royal king.
  await page.reload();
  await importPgn(page, positionPgn('8/p7/8/8/3H1k2/8/8/K7 b - - 0 1'));
  await square(page, 'f4').click();
  await expect(square(page, 'e4').locator('.move-marker')).toHaveCount(1);
  await square(page, 'e4').click();
  await expect(square(page, 'e4')).toHaveAttribute('aria-label', 'e4 Black king');
});

for (const fixture of [
  { color: 'White', from: 'd4', capture: 'c6', quiet: 'e6', backward: 'c2', fen: 'k7/8/2r5/8/3I4/8/2r5/7K w - - 0 1' },
  { color: 'Black', from: 'd5', capture: 'c3', quiet: 'e3', backward: 'c7', fen: '7k/2R5/8/3i4/8/2R5/8/K7 b - - 0 1' },
]) {
  test(`${fixture.color.toLowerCase()} orange bishops add capture-only long forward knight jumps`, async ({ page }) => {
    await importPgn(page, positionPgn(fixture.fen));
    await upgraded(page, fixture.from, 'orange', 2, 'bishop', fixture.color);
    await square(page, fixture.from).click();
    await expect(square(page, fixture.capture).locator('.capture-marker')).toHaveCount(1);
    await expect(marker(page, fixture.quiet)).toHaveCount(0);
    await expect(marker(page, fixture.backward)).toHaveCount(0);
    await square(page, fixture.capture).click();
    await upgraded(page, fixture.capture, 'orange', 2, 'bishop', fixture.color);
  });
}

test('an orange bishop cannot use a capture jump to expose its royal king', async ({ page }) => {
  await importPgn(page, positionPgn('k2r4/8/8/8/2r1r3/8/3I4/3K4 w - - 0 1'));
  await upgraded(page, 'd2', 'orange', 2, 'bishop');
  await square(page, 'd2').click();
  for (const name of ['c4', 'e4']) await expect(marker(page, name)).toHaveCount(0);
  await square(page, 'c4').click();
  await upgraded(page, 'd2', 'orange', 2, 'bishop');
  await expect(page.locator('#history li')).toHaveCount(0);
});

test('purple bishops combine diagonals and vertical rook rays without passing blockers or sliding sideways', async ({ page }) => {
  await importPgn(page, positionPgn('k7/8/3p4/8/3J1r2/3P4/8/7K w - - 0 1'));
  await upgraded(page, 'd4', 'purple', 3, 'bishop');
  await square(page, 'd4').click();
  for (const name of ['d5', 'e5', 'b6']) await expect(square(page, name).locator('.move-marker')).toHaveCount(1);
  await expect(square(page, 'd6').locator('.capture-marker')).toHaveCount(1);
  for (const name of ['d7', 'd3', 'd2', 'c4', 'f4']) await expect(marker(page, name)).toHaveCount(0);
  await square(page, 'd6').click();
  await upgraded(page, 'd6', 'purple', 3, 'bishop');
  await expect(square(page, 'd3')).toHaveAttribute('aria-label', 'd3 White pawn');
});

test('orange queens jump quietly like knights and capture only along ordinary queen rays', async ({ page }) => {
  await importPgn(page, positionPgn('k7/3r4/2r5/8/2PTP3/8/8/7K w - - 0 1'));
  await upgraded(page, 'd4', 'orange', 2, 'queen');
  await square(page, 'd4').click();
  for (const name of ['e6', 'f5']) await expect(square(page, name).locator('.move-marker')).toHaveCount(1);
  await expect(marker(page, 'c6')).toHaveCount(0);
  await expect(square(page, 'd7').locator('.capture-marker')).toHaveCount(1);
  await expect(marker(page, 'f4')).toHaveCount(0);
  await square(page, 'e6').click();
  await upgraded(page, 'e6', 'orange', 2, 'queen');
  await page.getByRole('button', { name: /Undo move/ }).click();
  await move(page, 'd4', 'd7');
  await upgraded(page, 'd7', 'orange', 2, 'queen');
  await page.reload();
  await importPgn(page, positionPgn('8/5k2/8/8/3T4/8/8/K7 b - - 0 1'));
  await square(page, 'f7').click();
  await expect(square(page, 'e6').locator('.move-marker')).toHaveCount(1);
});

test('purple queens add capturing knight jumps that can give check', async ({ page }) => {
  await importPgn(page, positionPgn('k7/8/2r5/8/2PUP3/8/8/7K w - - 0 1'));
  await upgraded(page, 'd4', 'purple', 3, 'queen');
  await square(page, 'd4').click();
  await expect(square(page, 'e6').locator('.move-marker')).toHaveCount(1);
  await expect(square(page, 'c6').locator('.capture-marker')).toHaveCount(1);
  await square(page, 'c6').click();
  await upgraded(page, 'c6', 'purple', 3, 'queen');
  await expect(page.locator('#status')).toHaveText('White wins by checkmate');
  await expect(square(page, 'c4')).toHaveAttribute('aria-label', 'c4 White pawn');
  await expect(square(page, 'e4')).toHaveAttribute('aria-label', 'e4 White pawn');
});

test('ordinary royal kings and rooks still castle in both directions under the new rules', async ({ page }) => {
  await importPgn(page, positionPgn('r3k2r/8/8/8/8/3H4/8/R3K2R w KQkq - 0 1'));
  await upgraded(page, 'd3', 'blue', 1, 'bishop');
  await move(page, 'e1', 'g1');
  await expect(square(page, 'g1')).toHaveAttribute('aria-label', 'g1 White king');
  await expect(square(page, 'f1')).toHaveAttribute('aria-label', 'f1 White rook');
  await move(page, 'e8', 'c8');
  await expect(square(page, 'c8')).toHaveAttribute('aria-label', 'c8 Black king');
  await expect(square(page, 'd8')).toHaveAttribute('aria-label', 'd8 Black rook');
  await expect(page.locator('#history li span')).toHaveText(['O-O', 'O-O-O']);
  await page.getByRole('button', { name: /Undo move/ }).click();
  await expect(square(page, 'e8')).toHaveAttribute('aria-label', 'e8 Black king');
  await expect(square(page, 'a8')).toHaveAttribute('aria-label', 'a8 Black rook');
  await page.reload();
  await importPgn(page, positionPgn('4k3/8/8/8/8/8/7h/R3K2R w KQ - 0 1'));
  await square(page, 'e1').click();
  await expect(marker(page, 'g1')).toHaveCount(0);
  await expect(square(page, 'c1').locator('.move-marker')).toHaveCount(1);
});

test('mixed-army saves retain the maximum budget and PGN restores setup, variant, history and undo', async ({ page }) => {
  await startMixedGame(page, '39');
  for (const [from, to] of [['b3', 'b4'], ['b8', 'c6'], ['b4', 'd4'], ['d8', 'e6']]) await move(page, from, to);
  await upgraded(page, 'd4', 'purple', 3, 'knight');
  await upgraded(page, 'e6', 'purple', 3, 'queen', 'Black');
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await expect(page.locator('#save-status')).toContainText('Saved 4 half-moves');
  const pgn = await downloadPgn(page);
  expect(pgn).toContain('[Variant "levelup"]');
  expect(pgn).toContain('Gb4');
  expect(pgn).toContain('Gd4');
  expect(pgn).toContain('Ue6');
  await page.reload();
  await page.getByRole('button', { name: 'Load saved', exact: true }).click();
  await expectMixedChoices(page, '39');
  await upgraded(page, 'd4', 'purple', 3, 'knight');
  await upgraded(page, 'c6', 'orange', 2, 'knight', 'Black');
  await upgraded(page, 'e6', 'purple', 3, 'queen', 'Black');
  await expect(page.locator('#history li span')).toHaveCount(4);
  await page.reload();
  await importPgn(page, pgn);
  await expectMixedChoices(page);
  await upgraded(page, 'd4', 'purple', 3, 'knight');
  await upgraded(page, 'e6', 'purple', 3, 'queen', 'Black');
  await expect(page.locator('#history li span')).toHaveCount(4);
  await page.getByRole('button', { name: /Undo move/ }).click();
  await upgraded(page, 'd8', 'purple', 3, 'queen', 'Black');
  await expect(page.locator('#status')).toHaveText('Black to move');
});

test('legacy knight PGN and saves retain the original two-square-only purple movement', async ({ page }) => {
  await importPgn(page, positionPgn('k7/p7/8/8/3G4/8/8/7K w - - 0 1', 'levelup-knight'));
  await upgraded(page, 'd4', 'purple', 3, 'knight');
  await expect(page.locator('#game-mode')).toHaveValue('levelup-knight');
  await square(page, 'd4').click();
  await expect(marker(page, 'd5')).toHaveCount(0);
  await expect(square(page, 'd6').locator('.move-marker')).toHaveCount(1);
  await square(page, 'd6').click();
  await upgraded(page, 'd6', 'purple', 3, 'knight');
  const pgn = await downloadPgn(page);
  expect(pgn).toContain('[Variant "levelup-knight"]');
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Load saved', exact: true }).click();
  await upgraded(page, 'd6', 'purple', 3, 'knight');
  await expect(page.locator('#game-mode')).toHaveValue('levelup-knight');
  await page.getByRole('button', { name: /Undo move/ }).click();
  await square(page, 'd4').click();
  await expect(marker(page, 'd5')).toHaveCount(0);
  await expect(square(page, 'd6').locator('.move-marker')).toHaveCount(1);
});

test('legacy saves accept the six-point budget and reject larger budgets without replacing the current game', async ({ page }) => {
  await page.selectOption('#game-mode', 'levelup-knight');
  await page.selectOption('#upgrade-budget', '6');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await upgraded(page, 'b1', 'blue', 1, 'knight');
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Load saved', exact: true }).click();
  await upgraded(page, 'b1', 'blue', 1, 'knight');
  await expect(page.locator('#upgrade-budget')).toHaveValue('6');
  await page.evaluate(() => {
    const key = 'levelupchess.saved-game.v1';
    const save = JSON.parse(localStorage.getItem(key));
    save.settings.upgradeBudget = 7;
    localStorage.setItem(key, JSON.stringify(save));
  });
  await page.reload();
  await move(page, 'e2', 'e4');
  await page.getByRole('button', { name: 'Load saved', exact: true }).click();
  await expect(page.locator('#save-status')).toContainText('damaged');
  await expect(page.locator('#replace-dialog')).not.toBeVisible();
  await expect(square(page, 'e4')).toHaveAttribute('aria-label', 'e4 White pawn');
  await expect(square(page, 'b1')).toHaveAttribute('aria-label', 'b1 White knight');
  await expect(page.locator('#game-mode')).toHaveValue('chess');
});

test('engine requests use the shared mixed-piece variant and apply an upgraded queen jump', async ({ page }) => {
  await startMixedGame(page);
  await page.route('**/api/engine/status', route => route.fulfill({ json: { name: 'Test engine' } }));
  const searches = [];
  await page.route('**/api/engine/move', route => {
    const data = route.request().postDataJSON();
    searches.push(data);
    return route.fulfill({ json: { move: 'd8e6' } });
  });
  await page.selectOption('#opponent', 'engine');
  await expect(page.locator('#engine-status')).toContainText('connected');
  await move(page, 'b3', 'b4');
  await upgraded(page, 'e6', 'purple', 3, 'queen', 'Black');
  expect(searches).toHaveLength(1);
  expect(searches[0].variant).toBe('levelup');
  for (const type of ['G', 'J', 'T', 'f', 'h', 'u']) expect(searches[0].fen.split(' ')[0]).toContain(type);
  await expect(page.locator('#history li span')).toHaveCount(2);
});

test('native Fairy Stockfish escapes check with a purple knight jump using the new rules', async ({ page }) => {
  test.skip(!process.env.FAIRY_STOCKFISH_PATH, 'Set FAIRY_STOCKFISH_PATH to run native engine integration.');
  // Kh8 has no escape; d6-f6 is the only move that blocks the bishop on e5.
  await importPgn(page, positionPgn('5K1k/8/3g2B1/4B3/8/8/8/8 b - - 0 1'));
  await upgraded(page, 'd6', 'purple', 3, 'knight', 'Black');
  await expect(page.locator('#status')).toContainText('Check');
  await page.selectOption('#opponent', 'engine');
  await upgraded(page, 'f6', 'purple', 3, 'knight', 'Black');
  await expect(square(page, 'd6')).toHaveAttribute('aria-label', 'd6 empty');
  await expect(page.locator('#status')).toHaveText('White to move · Check');
  await expect(page.locator('#history li span').last()).toHaveText('Gf6+');
});

test('standalone HTML runs mixed piece upgrades with companion requests blocked', async ({ page }) => {
  const requests = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    requests.push(route.request().url());
    return route.abort();
  });
  await page.goto('about:blank');
  await page.setContent(await fs.readFile(path.resolve(__dirname, '../index.html'), 'utf8'));
  await startMixedGame(page);
  await move(page, 'b3', 'b4');
  await move(page, 'd8', 'e6');
  await upgraded(page, 'b4', 'purple', 3, 'knight');
  await upgraded(page, 'e6', 'purple', 3, 'queen', 'Black');
  await expect(page.locator('#status')).toHaveText('White to move');
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});
