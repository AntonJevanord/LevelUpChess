const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const { Chess } = require('chess.js');
const square = (page, name) => page.locator(`[data-square="${name}"]`);
async function move(page, from, to) { await square(page, from).click(); await square(page, to).click(); }
async function importPgn(page, text) {
  await page.getByRole('button', { name: 'Import PGN', exact: true }).click();
  await page.locator('#pgn-text').fill(text);
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
}
test.beforeEach(async ({ page }) => { await page.goto('http://127.0.0.1:4173'); });

test('saved moves and board orientation survive reload, and play can continue', async ({ page }) => {
  await move(page, 'e2', 'e4');
  await move(page, 'e7', 'e5');
  await page.getByRole('button', { name: 'Flip board' }).click();
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await expect(page.locator('#save-status')).toContainText('Saved 2 half-moves');
  await page.reload();
  await page.getByRole('button', { name: 'Load saved', exact: true }).click();
  await expect(square(page, 'e4')).toHaveAttribute('aria-label', 'e4 White pawn');
  await expect(square(page, 'e5')).toHaveAttribute('aria-label', 'e5 Black pawn');
  await expect(page.locator('.square').first()).toHaveAttribute('data-square', 'h1');
  await expect(page.locator('#history')).toContainText('e4');
  await move(page, 'g1', 'f3');
  await expect(page.locator('#status')).toHaveText('Black to move');
});

test('loading asks before replacing current moves and cancel preserves them', async ({ page }) => {
  await move(page, 'd2', 'd4');
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await move(page, 'd7', 'd5');
  await page.getByRole('button', { name: 'Load saved', exact: true }).click();
  await page.getByRole('button', { name: 'Keep current game' }).click();
  await expect(square(page, 'd5')).toHaveAttribute('aria-label', 'd5 Black pawn');
  await page.getByRole('button', { name: 'Load saved', exact: true }).click();
  await page.getByRole('button', { name: 'Replace game', exact: true }).click();
  await expect(square(page, 'd7')).toHaveAttribute('aria-label', 'd7 Black pawn');
  await expect(page.locator('#status')).toHaveText('Black to move');
});

test('PGN import restores en passant and complete history', async ({ page }) => {
  await importPgn(page, '1. e4 a6 2. e5 d5 *');
  await move(page, 'e5', 'd6');
  await expect(square(page, 'd5')).toHaveAttribute('aria-label', 'd5 empty');
  await page.getByRole('button', { name: 'Undo move' }).click();
  await expect(square(page, 'd5')).toHaveAttribute('aria-label', 'd5 Black pawn');
  await expect(page.locator('#history li')).toHaveCount(2);
});

test('invalid PGN and nonstandard variants leave the game intact', async ({ page }) => {
  await move(page, 'e2', 'e4');
  await importPgn(page, '1. e4 e5 2. Ke7');
  await expect(page.locator('#import-error')).toContainText('could not be read');
  await page.locator('#pgn-text').fill('[Variant "atomic"]\n\n1. e4 *');
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
  await expect(page.locator('#import-error')).toContainText('Only standard-chess');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(square(page, 'e4')).toHaveAttribute('aria-label', 'e4 White pawn');
  await expect(page.locator('#status')).toHaveText('Black to move');
});

test('PGN download round-trips checkmate and the result', async ({ page }) => {
  await importPgn(page, '1. f3 e5 2. g4 Qh4# 0-1');
  await expect(page.locator('#status')).toHaveText('Black wins by checkmate');
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PGN', exact: true }).click();
  const download = await waiting;
  expect(download.suggestedFilename()).toBe('levelup-chess.pgn');
  const pgn = await fs.readFile(await download.path(), 'utf8');
  const game = new Chess();
  game.loadPgn(pgn);
  expect(game.isCheckmate()).toBe(true);
  expect(game.getHeaders().Result).toBe('0-1');
  expect(game.history()).toEqual(['f3', 'e5', 'g4', 'Qh4#']);
});

test('PGN file import supports black-to-move starting positions and correct move numbering', async ({ page }) => {
  await page.getByRole('button', { name: 'Import PGN', exact: true }).click();
  await page.locator('#pgn-file').setInputFiles({ name: 'position.pgn', mimeType: 'text/plain', buffer: Buffer.from('[SetUp "1"]\n[FEN "r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 17"]\n\n17... O-O *') });
  await expect(page.locator('#pgn-text')).toHaveValue(/17\.\.\. O-O/);
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
  await expect(square(page, 'g8')).toHaveAttribute('aria-label', 'g8 Black king');
  await expect(square(page, 'f8')).toHaveAttribute('aria-label', 'f8 Black rook');
  await expect(page.locator('#history li')).toHaveAttribute('value', '17');
  await expect(page.locator('#history li span').first()).toHaveText('…');
  await move(page, 'e1', 'c1');
  await expect(square(page, 'd1')).toHaveAttribute('aria-label', 'd1 White rook');
});

test('corrupt or blocked browser storage reports an error without breaking gameplay', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('levelupchess.saved-game.v1', '{not json'));
  await page.reload();
  await page.getByRole('button', { name: 'Load saved', exact: true }).click();
  await expect(page.locator('#save-status')).toContainText('damaged');
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('Storage blocked'); }; });
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await expect(page.locator('#save-status')).toContainText('Use PGN export');
  await move(page, 'e2', 'e4');
  await expect(page.locator('#status')).toHaveText('Black to move');
});

test('large PGN files are rejected', async ({ page }) => {
  await page.getByRole('button', { name: 'Import PGN', exact: true }).click();
  await page.locator('#pgn-file').setInputFiles({ name: 'large.pgn', mimeType: 'text/plain', buffer: Buffer.alloc(256 * 1024 + 1, 32) });
  await expect(page.locator('#import-error')).toContainText('up to 256 KB');
  await expect(page.locator('#pgn-text')).toHaveValue('');
});

test('engine settings load paused without a connection or automatic move', async ({ page }) => {
  let searches = 0;
  await page.route('**/api/engine/status', route => route.fulfill({ json: { name: 'Test engine' } }));
  await page.route('**/api/engine/move', route => { searches++; return route.fulfill({ json: { move: 'e7e5' } }); });
  await page.selectOption('#opponent', 'engine');
  await expect(page.locator('#engine-status')).toContainText('connected');
  await page.selectOption('#difficulty', 'easy');
  await page.getByRole('button', { name: 'Pause engine' }).click();
  await move(page, 'e2', 'e4');
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Load saved', exact: true }).click();
  await expect(page.locator('#opponent')).toHaveValue('engine');
  await expect(page.locator('#difficulty')).toHaveValue('easy');
  await expect(page.locator('#engine-status')).toContainText('Engine paused');
  await expect(page.locator('#status')).toHaveText('Black to move');
  expect(searches).toBe(0);
  await page.getByRole('button', { name: 'Connect engine' }).click();
  await expect(square(page, 'e5')).toHaveAttribute('aria-label', 'e5 Black pawn');
});

test('saved games preserve repetition history, not just the final board', async ({ page }) => {
  await importPgn(page, '1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 1/2-1/2');
  await expect(page.locator('#status')).toHaveText('Draw by repetition');
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Load saved', exact: true }).click();
  await expect(page.locator('#status')).toHaveText('Draw by repetition');
  await page.getByRole('button', { name: 'Undo move' }).click();
  await expect(page.locator('#status')).toHaveText('Black to move');
});

test('import cancels the previous engine search before replacing the game', async ({ page }) => {
  let release;
  let started = false;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/engine/status', route => route.fulfill({ json: { name: 'Test engine' } }));
  await page.route('**/api/engine/move', async route => {
    started = true;
    await gate;
    await route.fulfill({ json: { move: 'e7e5' } }).catch(() => {});
  });
  await page.selectOption('#opponent', 'engine');
  await expect(page.locator('#engine-status')).toContainText('connected');
  await move(page, 'e2', 'e4');
  await expect.poll(() => started).toBe(true);
  await importPgn(page, '1. d4 d5 *');
  await page.getByRole('button', { name: 'Replace game', exact: true }).click();
  release();
  await expect(square(page, 'd5')).toHaveAttribute('aria-label', 'd5 Black pawn');
  await expect(square(page, 'e7')).toHaveAttribute('aria-label', 'e7 Black pawn');
  await expect(page.locator('#engine-status')).toContainText('Engine paused');
  await expect(page.locator('#status')).toHaveText('White to move');
});

test('export preserves PGN comments and recorded results until play continues', async ({ page }) => {
  await importPgn(page, '[Event "Friendly match"]\n\n1. e4 {A useful opening} e5 1-0');
  async function downloadPgn() {
    const waiting = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export PGN', exact: true }).click();
    const download = await waiting;
    return fs.readFile(await download.path(), 'utf8');
  }
  let text = await downloadPgn();
  expect(text).toContain('[Event "Friendly match"]');
  expect(text).toContain('A useful opening');
  expect(text).toContain('[Result "1-0"]');
  await move(page, 'g1', 'f3');
  text = await downloadPgn();
  expect(text).toContain('[Result "*"]');
});
