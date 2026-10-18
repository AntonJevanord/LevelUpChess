const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

const square = (page, name) => page.locator(`[data-square="${name}"]`);
const mixedLevels = { b1: '2', g1: '3', b8: '1', g8: '3' };
async function upgraded(page, name, accent, level, color = 'White') {
  await expect(square(page, name)).toHaveAttribute('aria-label', `${name} ${color} ${accent} knight, level ${level}`);
  await expect(square(page, name).locator(`.piece.upgraded.${accent}`)).toHaveCount(1);
  await expect(square(page, name).locator('.piece-level')).toHaveText(`L${level}`);
}
async function move(page, from, to) {
  await square(page, from).click();
  await square(page, to).click();
}
async function chooseLevels(page, levels = mixedLevels, budget = '5') {
  await page.selectOption('#game-mode', 'levelup-knight');
  await page.selectOption('#upgrade-budget', budget);
  for (const [name, level] of Object.entries(levels)) await page.selectOption(`#upgrade-${name}`, level);
}
async function startMixedGame(page) {
  await chooseLevels(page);
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await upgraded(page, 'b1', 'orange', 2);
}
async function importPgn(page, text) {
  await page.getByRole('button', { name: 'Import PGN', exact: true }).click();
  await page.locator('#pgn-text').fill(text);
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
}
const positionPgn = fen => `[Variant "levelup-knight"]\n[SetUp "1"]\n[FEN "${fen}"]\n\n*`;
async function downloadPgn(page) {
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PGN', exact: true }).click();
  return fs.readFile(await (await waiting).path(), 'utf8');
}
async function expectMixedChoices(page) {
  await expect(page.locator('#game-mode')).toHaveValue('levelup-knight');
  for (const [name, level] of Object.entries(mixedLevels)) await expect(page.locator(`#upgrade-${name}`)).toHaveValue(level);
}

test.beforeEach(async ({ page }) => {
  await page.goto('http://127.0.0.1:4173');
});

test('mixed knight levels use per-side costs and purple adds pieces without replacing knights or pawns', async ({ page }) => {
  await expect(page.locator('#game-mode option[value="levelup-knight"]')).toHaveText('Version 03 knight rules');
  expect(await page.locator('#upgrade-budget option').evaluateAll(options => options.map(option => option.value))).toEqual(['1', '2', '3', '4', '5', '6']);
  await startMixedGame(page);
  await expect(page.locator('#upgrade-status')).toContainText('White 5/5');
  await expect(page.locator('#upgrade-status')).toContainText('Black 4/5');
  await upgraded(page, 'g3', 'purple', 3);
  await upgraded(page, 'b8', 'blue', 1, 'Black');
  await upgraded(page, 'g6', 'purple', 3, 'Black');
  await expect(square(page, 'g1')).toHaveAttribute('aria-label', 'g1 White knight');
  await expect(square(page, 'g8')).toHaveAttribute('aria-label', 'g8 Black knight');
  for (const [name, color] of [['b2', 'White'], ['g2', 'White'], ['b7', 'Black'], ['g7', 'Black']]) {
    await expect(square(page, name)).toHaveAttribute('aria-label', `${name} ${color} pawn`);
  }
  await expect(page.locator('.piece')).toHaveCount(34);

  // A full six points can buy two extra purple pieces for each player.
  await chooseLevels(page, { b1: '3', g1: '3', b8: '3', g8: '3' }, '6');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await expect(page.locator('.piece')).toHaveCount(36);
  for (const [name, color] of [['b3', 'White'], ['g3', 'White'], ['b6', 'Black'], ['g6', 'Black']]) await upgraded(page, name, 'purple', 3, color);
  for (const [name, color] of [['b1', 'White'], ['g1', 'White'], ['b8', 'Black'], ['g8', 'Black']]) await expect(square(page, name)).toHaveAttribute('aria-label', `${name} ${color} knight`);
});

test('either player exceeding the budget prevents a new game and leaves the current board intact', async ({ page }) => {
  await chooseLevels(page, { b1: '2', g1: '3', b8: '1', g8: '0' }, '4');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await expect(page.locator('#upgrade-status')).toContainText('White 5/4');
  await expect(square(page, 'b1')).toHaveAttribute('aria-label', 'b1 White knight');
  await expect(square(page, 'g3')).toHaveAttribute('aria-label', 'g3 empty');
  await page.selectOption('#upgrade-b1', '1');
  await page.selectOption('#upgrade-b8', '2');
  await page.selectOption('#upgrade-g8', '3');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await expect(page.locator('#upgrade-status')).toContainText('Black 5/4');
  await expect(square(page, 'b8')).toHaveAttribute('aria-label', 'b8 Black knight');
  await expect(square(page, 'g6')).toHaveAttribute('aria-label', 'g6 empty');
  await expect(page.locator('.piece')).toHaveCount(32);
  await page.selectOption('#upgrade-b8', '1');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await upgraded(page, 'b1', 'blue', 1);
  await upgraded(page, 'b8', 'blue', 1, 'Black');
  await upgraded(page, 'g3', 'purple', 3);
  await upgraded(page, 'g6', 'purple', 3, 'Black');
});

for (const fixture of [
  { color: 'White', from: 'd4', quiet: 'b4', capture: 'f4', knightCapture: 'c6', blockers: ['c4', 'e4'], forbidden: ['d2', 'd6', 'd5', 'e5'], fen: 'k7/8/2r5/8/2PFPr2/8/8/7K w - - 0 1' },
  { color: 'Black', from: 'd5', quiet: 'b5', capture: 'f5', knightCapture: 'c3', blockers: ['c5', 'e5'], forbidden: ['d3', 'd7', 'd4', 'e4'], fen: '7k/8/8/2pfpR2/8/2R5/8/K7 b - - 0 1' },
]) {
  test(`${fixture.color.toLowerCase()} orange knight keeps knight captures and jumps exactly two squares sideways over blockers`, async ({ page }) => {
    await importPgn(page, positionPgn(fixture.fen));
    await upgraded(page, fixture.from, 'orange', 2, fixture.color);
    await square(page, fixture.from).click();
    await expect(square(page, fixture.quiet).locator('.move-marker')).toHaveCount(1);
    await expect(square(page, fixture.capture).locator('.capture-marker')).toHaveCount(1);
    await expect(square(page, fixture.knightCapture).locator('.capture-marker')).toHaveCount(1);
    for (const name of fixture.forbidden) await expect(square(page, name).locator('.move-marker, .capture-marker')).toHaveCount(0);
    await square(page, fixture.quiet).click();
    await upgraded(page, fixture.quiet, 'orange', 2, fixture.color);
    await page.getByRole('button', { name: /Undo move/ }).click();
    await move(page, fixture.from, fixture.capture);
    await upgraded(page, fixture.capture, 'orange', 2, fixture.color);
    for (const name of fixture.blockers) await expect(square(page, name)).toHaveAttribute('aria-label', `${name} ${fixture.color} pawn`);
    await page.getByRole('button', { name: /Undo move/ }).click();
    await move(page, fixture.from, fixture.knightCapture);
    await upgraded(page, fixture.knightCapture, 'orange', 2, fixture.color);
  });
}

test('purple jumps exactly two squares in all orthogonal directions, captures, and ignores intermediate blockers', async ({ page }) => {
  await importPgn(page, positionPgn('k7/8/8/3P4/1rPGP3/3P4/3r4/7K w - - 0 1'));
  await upgraded(page, 'd4', 'purple', 3);
  await square(page, 'd4').click();
  for (const name of ['d6', 'f4']) await expect(square(page, name).locator('.move-marker')).toHaveCount(1);
  for (const name of ['b4', 'd2']) await expect(square(page, name).locator('.capture-marker')).toHaveCount(1);
  for (const name of ['d3', 'd5', 'c4', 'e4', 'e5', 'f5', 'e6', 'd7']) await expect(square(page, name).locator('.move-marker, .capture-marker')).toHaveCount(0);
  await square(page, 'd2').click();
  await upgraded(page, 'd2', 'purple', 3);
  await expect(square(page, 'd3')).toHaveAttribute('aria-label', 'd3 White pawn');
  await page.getByRole('button', { name: /Undo move/ }).click();
  await upgraded(page, 'd4', 'purple', 3);
  await expect(square(page, 'd2')).toHaveAttribute('aria-label', 'd2 Black rook');
  await move(page, 'd4', 'd6');
  await upgraded(page, 'd6', 'purple', 3);
  await expect(square(page, 'd5')).toHaveAttribute('aria-label', 'd5 White pawn');
});

for (const [type, accent, level] of [['F', 'orange', 2], ['G', 'purple', 3]]) {
  test(`${accent} jumps respect pins and prevent a king from entering an attacked square`, async ({ page }) => {
    await importPgn(page, positionPgn(`k2r4/8/8/8/8/8/3${type}4/3K4 w - - 0 1`));
    await upgraded(page, 'd2', accent, level);
    await square(page, 'd2').click();
    await expect(square(page, 'f2').locator('.move-marker')).toHaveCount(0);
    await square(page, 'f2').click();
    await upgraded(page, 'd2', accent, level);
    await expect(page.locator('#status')).toHaveText('White to move');

    // The f4 pawn does not shield g4 from a jump originating on e4.
    await page.reload();
    await importPgn(page, positionPgn(`8/8/8/8/4${type}P1k/8/8/K7 b - - 0 1`));
    await square(page, 'h4').click();
    await expect(square(page, 'g4').locator('.move-marker')).toHaveCount(0);
    await expect(square(page, 'h5').locator('.move-marker')).toHaveCount(1);
    await square(page, 'g4').click();
    await expect(square(page, 'h4')).toHaveAttribute('aria-label', 'h4 Black king');
    await expect(square(page, 'g4')).toHaveAttribute('aria-label', 'g4 empty');
  });
}

test('mixed-level saves restore all choices, budget, move history, and paused remaining time', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-18T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-18T12:00:01Z'));
  await page.reload();
  await page.selectOption('#time-control', 'five');
  await startMixedGame(page);
  await page.getByRole('button', { name: 'Start clock', exact: true }).click();
  await page.clock.fastForward(10_000);
  await move(page, 'b1', 'c3');
  await page.clock.fastForward(7_000);
  await move(page, 'b8', 'c6');
  await page.clock.fastForward(3_000);
  await move(page, 'g3', 'g5');
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await expect(page.locator('#save-status')).toContainText('Saved 3 half-moves');
  await page.reload();
  await page.getByRole('button', { name: 'Load saved', exact: true }).click();
  await expectMixedChoices(page);
  await expect(page.locator('#upgrade-budget')).toHaveValue('5');
  await expect(page.locator('#time-control')).toHaveValue('five');
  await expect(page.locator('#white-clock')).toHaveText('04:47');
  await expect(page.locator('#black-clock')).toHaveText('04:53');
  await expect(page.getByRole('button', { name: 'Resume clock', exact: true })).toBeVisible();
  await upgraded(page, 'c3', 'orange', 2);
  await upgraded(page, 'c6', 'blue', 1, 'Black');
  await upgraded(page, 'g5', 'purple', 3);
  await upgraded(page, 'g6', 'purple', 3, 'Black');
  await expect(page.locator('#history li span')).toHaveCount(3);
  await page.clock.fastForward(60_000);
  await expect(page.locator('#white-clock')).toHaveText('04:47');
  await expect(page.locator('#black-clock')).toHaveText('04:53');
  await move(page, 'g6', 'e6');
  await upgraded(page, 'g6', 'purple', 3, 'Black');
  await page.getByRole('button', { name: /Undo move/ }).click();
  await upgraded(page, 'g3', 'purple', 3);
  await expect(page.locator('#status')).toHaveText('White to move');
  await expect(page.locator('#white-clock')).toHaveText('04:50');
  await expect(page.locator('#black-clock')).toHaveText('04:53');
});

test('mixed-level PGN restores the original army and moves, with play settings left untimed', async ({ page }) => {
  await startMixedGame(page);
  for (const [from, to] of [['b1', 'c3'], ['b8', 'c6'], ['g3', 'g5']]) await move(page, from, to);
  const pgn = await downloadPgn(page);
  expect(pgn).toContain('[Variant "levelup-knight"]');
  expect(pgn).toMatch(/\[FEN "[^"\n]*F[^"\n]*"\]/);
  expect(pgn).toMatch(/\[FEN "[^"\n]*G[^"\n]*"\]/);
  expect(pgn).toContain('Gg5');
  await page.reload();
  await importPgn(page, pgn);
  await expectMixedChoices(page);
  await upgraded(page, 'c3', 'orange', 2);
  await upgraded(page, 'c6', 'blue', 1, 'Black');
  await upgraded(page, 'g5', 'purple', 3);
  await upgraded(page, 'g6', 'purple', 3, 'Black');
  await expect(square(page, 'g1')).toHaveAttribute('aria-label', 'g1 White knight');
  await expect(square(page, 'g8')).toHaveAttribute('aria-label', 'g8 Black knight');
  await expect(page.locator('.piece')).toHaveCount(34);
  await expect(page.locator('#history li span')).toHaveCount(3);
  await expect(page.locator('#time-control')).toHaveValue('none');
  await page.getByRole('button', { name: /Undo move/ }).click();
  await upgraded(page, 'g3', 'purple', 3);
});

test('engine bridge receives mixed armies and applies a purple jump returned by the engine', async ({ page }) => {
  await startMixedGame(page);
  await page.route('**/api/engine/status', route => route.fulfill({ json: { name: 'Test engine' } }));
  let searches = 0;
  await page.route('**/api/engine/move', route => {
    const data = route.request().postDataJSON();
    expect(data.variant).toBe('levelup-knight');
    const placement = data.fen.split(' ')[0];
    for (const type of ['F', 'G', 'e', 'g']) expect(placement).toContain(type);
    searches++;
    return route.fulfill({ json: { move: searches === 1 ? 'b8c6' : 'g6e6' } });
  });
  await page.selectOption('#opponent', 'engine');
  await expect(page.locator('#engine-status')).toContainText('connected');
  await move(page, 'b1', 'c3');
  await upgraded(page, 'c6', 'blue', 1, 'Black');
  await move(page, 'g3', 'g5');
  await upgraded(page, 'e6', 'purple', 3, 'Black');
  await expect(page.locator('#history li span')).toHaveCount(4);
  expect(searches).toBe(2);
  await page.getByRole('button', { name: /Undo move/ }).click();
  await upgraded(page, 'g3', 'purple', 3);
  await upgraded(page, 'g6', 'purple', 3, 'Black');
  await expect(page.locator('#engine-status')).toContainText('paused after undo');
});

for (const [type, accent, level] of [['f', 'orange', 2], ['g', 'purple', 3]]) {
  test(`native Fairy Stockfish plays a forced ${accent} jump to escape check through the browser`, async ({ page }) => {
    test.skip(!process.env.FAIRY_STOCKFISH_PATH, 'Set FAIRY_STOCKFISH_PATH to run native engine integration.');
    // Kh8 has no escape; d6-f6 is the sole legal way to block Be5's check.
    await importPgn(page, positionPgn(`5K1k/8/3${type}2B1/4B3/8/8/8/8 b - - 0 1`));
    await upgraded(page, 'd6', accent, level, 'Black');
    await expect(page.locator('#status')).toContainText(/check/i);
    await page.selectOption('#opponent', 'engine');
    await upgraded(page, 'f6', accent, level, 'Black');
    await expect(square(page, 'd6')).toHaveAttribute('aria-label', 'd6 empty');
    await expect(page.locator('#status')).toHaveText(type === 'g' ? 'White to move · Check' : 'White to move');
    await expect(page.locator('#history li')).toHaveCount(1);
    await expect(page.locator('#history li span')).toHaveCount(2);
    await expect(page.locator('#history li span').first()).toHaveText('…');
    await expect(page.locator('#history li span').last()).toHaveText(type === 'g' ? 'Gf6+' : 'Ff6');
  });
}

test('standalone HTML plays orange and purple pieces with companion requests blocked', async ({ page }) => {
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
  for (const [from, to] of [['b1', 'c3'], ['a7', 'a6'], ['g3', 'g5']]) await move(page, from, to);
  await upgraded(page, 'c3', 'orange', 2);
  await upgraded(page, 'g5', 'purple', 3);
  await expect(page.locator('#status')).toHaveText('Black to move');
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});
