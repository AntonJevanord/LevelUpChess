const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const { initVariantRules, VariantGame } = require('../dist/rules-node.cjs');
const { PLAYABLE_PROFILE, EXPERIMENTAL_VARIANT, DESIGN_OPTIONS } = require('../src/design-options');

const square = (page, name) => page.locator(`[data-square="${name}"]`);
const marker = (page, name) => square(page, name).locator('.move-marker, .capture-marker');
const letter = id => PLAYABLE_PROFILE.registry.allocations.find(item => item.id === id).letter;
const designName = id => DESIGN_OPTIONS.find(item => item.id === id).name;
async function move(page, from, to) { await square(page, from).click(); await square(page, to).click(); }
async function choose(page, family, name, id) {
  await page.selectOption('#experimental-family', family);
  await page.selectOption(`#experimental-upgrade-${name}`, id);
}
async function experimental(page) { await page.selectOption('#game-mode', EXPERIMENTAL_VARIANT); }
async function start(page) {
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  if (await page.locator('#restart').isVisible()) await page.getByRole('button', { name: 'Start new game', exact: true }).click();
  await expect(page.locator('#board')).toHaveClass(/experimental-board/);
}
async function importPgn(page, pgn) {
  await page.getByRole('button', { name: 'Import PGN', exact: true }).click();
  await page.locator('#pgn-text').fill(pgn);
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
  await expect(page.locator('#import-dialog')).not.toBeVisible();
  if (await page.locator('#replace-dialog').isVisible()) await page.getByRole('button', { name: 'Replace game', exact: true }).click();
}
async function downloadPgn(page) {
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PGN', exact: true }).click();
  return fs.readFile(await (await waiting).path(), 'utf8');
}
function fen(pieces, turn = 'w', rights = '-') {
  const rows = Array.from({ length: 8 }, (_, row) => {
    let result = '', empty = 0;
    for (const file of 'abcdefgh') {
      const piece = pieces[file + (8 - row)];
      if (!piece) { empty++; continue; }
      if (empty) result += empty;
      empty = 0;
      result += piece;
    }
    return result + (empty || '');
  });
  return rows.join('/') + ` ${turn} ${rights} - 0 1`;
}
async function importPosition(page, position) {
  const game = new VariantGame(position, EXPERIMENTAL_VARIANT);
  try { await importPgn(page, game.pgn()); }
  finally { game.dispose(); }
}
async function hasDesign(page, name, id) {
  await expect(square(page, name)).toHaveAttribute('data-design-id', id);
  await expect(square(page, name)).toHaveAttribute('aria-label', new RegExp(designName(id)));
}

test.beforeAll(async () => { await initVariantRules(); });
test.beforeEach(async ({ page }) => { await page.goto('http://127.0.0.1:4173'); });

test('named alternatives share per-side costs, preserve the board until New game, and resolve mapped glyphs', async ({ page }) => {
  await experimental(page);
  await expect(page.locator('#experimental-budget')).toHaveAttribute('max', '6');
  await choose(page, 'rook', 'a1', 'rook.purple@2');
  await choose(page, 'rook', 'a8', 'rook.purple@1');
  await choose(page, 'pawn', 'a2', 'pawn.purple@2');
  await expect(page.locator('#experimental-description-a2')).toContainText('Parked after balance screening');
  await choose(page, 'pawn', 'b2', 'pawn.blue@1');
  await expect(page.locator('#experimental-status')).toContainText('White 7/6');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await expect(square(page, 'a1')).toHaveAttribute('aria-label', 'a1 White rook');
  await choose(page, 'pawn', 'b2', '');
  await choose(page, 'bishop', 'c8', 'bishop.blue@1');
  await choose(page, 'queen', 'd8', 'queen.orange@1');
  await expect(page.locator('#experimental-status')).toContainText('White 6/6 · Black 6/6');
  await start(page);
  await hasDesign(page, 'a1', 'rook.purple@2');
  await hasDesign(page, 'a2', 'pawn.purple@2');
  await hasDesign(page, 'a8', 'rook.purple@1');
  await expect(square(page, 'a1').locator('.piece')).toHaveText('♖');
  await expect(square(page, 'a8').locator('.piece')).toHaveText('♜');
  await expect(square(page, 'a2').locator('.piece')).toHaveText('♙');
  await expect(square(page, 'a1').locator('.piece-level.red')).toHaveText('L3');
  await expect(square(page, 'c8').locator('.piece-level.green')).toHaveText('L1');
  await expect(square(page, 'd8').locator('.piece-level.cyan')).toHaveText('L2');
  await square(page, 'a1').click();
  await expect(page.locator('#hint')).toContainText('capture-only knight jumps');
});

test('save, load and portable PGN restore design choices, mapped move labels and continued play', async ({ page }) => {
  await experimental(page);
  await choose(page, 'rook', 'a1', 'rook.purple@2');
  await choose(page, 'pawn', 'a2', 'pawn.purple@2');
  await choose(page, 'rook', 'a8', 'rook.purple@1');
  await start(page);
  await move(page, 'a2', 'a4');
  await move(page, 'a7', 'a6');
  await move(page, 'a1', 'a3');
  await expect(page.locator('#history')).toContainText('R3a3');
  await expect(page.locator('#history')).toContainText('P3a4');
  await expect(page.locator('#history li span').nth(1)).toHaveText('a6');
  await expect(page.locator('#history li span').nth(2)).toHaveAttribute('title', /Knight-capture rook/);
  await expect(page.locator('#history li span').nth(2)).toHaveAttribute('aria-label', /Knight-capture rook/);
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await expect(page.locator('#save-status')).toContainText('Saved 3 half-moves');
  const pgn = await downloadPgn(page);
  expect(pgn).toContain('[LevelUpProfile "');
  await page.reload();
  await page.getByRole('button', { name: 'Load saved', exact: true }).click();
  await hasDesign(page, 'a3', 'rook.purple@2');
  await hasDesign(page, 'a4', 'pawn.purple@2');
  await expect(page.locator('#experimental-upgrade-a1')).toHaveValue('rook.purple@2');
  await expect(page.locator('#experimental-upgrade-a2')).toHaveValue('pawn.purple@2');
  await expect(page.locator('#experimental-upgrade-a8')).toHaveValue('rook.purple@1');
  await expect(page.locator('#experimental-budget')).toHaveValue('6');
  await page.reload();
  await importPgn(page, pgn);
  await expect(page.locator('#game-mode')).toHaveValue(EXPERIMENTAL_VARIANT);
  await hasDesign(page, 'a3', 'rook.purple@2');
  await expect(page.locator('#experimental-upgrade-a2')).toHaveValue('pawn.purple@2');
  await move(page, 'g8', 'f6');
  await expect(page.locator('#status')).toHaveText('White to move');
});

test('revised rook jumps to knight captures across blockers while removed attacks and quiet leaps stay unavailable', async ({ page }) => {
  await importPosition(page, fen({ a1: 'K', h8: 'k', d4: letter('rook.purple@2').toUpperCase(), d5: 'P', e4: 'P', c6: 'b', f6: 'p', f4: 'r' }));
  await square(page, 'd4').click();
  await expect(square(page, 'c6').locator('.capture-marker')).toHaveCount(1);
  for (const name of ['f6', 'f5', 'd6', 'f4']) await expect(marker(page, name)).toHaveCount(0);
  await square(page, 'c6').click();
  await hasDesign(page, 'c6', 'rook.purple@2');
  await expect(page.locator('#history')).toContainText('R3xc6');
  await page.getByRole('button', { name: /Undo move/ }).click();
  await hasDesign(page, 'd4', 'rook.purple@2');
  await expect(square(page, 'c6')).toHaveAttribute('aria-label', 'c6 Black bishop');
});

test('short-slide pawn obeys its quiet range and blockers while retaining long diagonal captures', async ({ page }) => {
  await importPosition(page, fen({ h1: 'K', h8: 'k', d4: letter('pawn.purple@2').toUpperCase(), d5: 'P', f6: 'b' }));
  await square(page, 'd4').click();
  for (const name of ['b4', 'd2']) await expect(square(page, name).locator('.move-marker')).toHaveCount(1);
  for (const name of ['a4', 'd1', 'd6']) await expect(marker(page, name)).toHaveCount(0);
  await expect(square(page, 'f6').locator('.capture-marker')).toHaveCount(1);
  await square(page, 'f6').click();
  await hasDesign(page, 'f6', 'pawn.purple@2');
});

test('a valid over-budget study imports safely while its next-game choices require adjustment', async ({ page }) => {
  await move(page, 'e2', 'e4');
  const type = letter('pawn.purple@2').toUpperCase();
  await importPosition(page, `rnbqkbnr/pppppppp/8/8/8/8/${type.repeat(4)}PPPP/RNBQKBNR w KQkq - 0 1`);
  for (const name of ['a2', 'b2', 'c2', 'd2']) await hasDesign(page, name, 'pawn.purple@2');
  await expect(page.locator('#history li')).toHaveCount(0);
  await expect(page.locator('#status')).toHaveText('White to move');
  await expect(page.locator('#time-control')).toHaveValue('none');
  await expect(page.locator('#experimental-status')).toContainText('White 12/6');
  await expect(page.locator('#import-error')).toHaveText('');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await hasDesign(page, 'd2', 'pawn.purple@2');
  await expect(page.locator('#restart')).not.toBeVisible();
  await move(page, 'a2', 'a4');
  await hasDesign(page, 'a4', 'pawn.purple@2');
});

for (const color of ['w', 'b']) {
  test(`${color === 'w' ? 'White' : 'Black'} revised pawn promotes to a standard piece`, async ({ page }) => {
    const type = letter('pawn.purple@2');
    const start = color === 'w' ? 'b7' : 'b2';
    const destination = color === 'w' ? 'b8' : 'b1';
    const pieces = color === 'w' ? { a1: 'K', h6: 'k', [start]: type.toUpperCase() } : { h3: 'K', a8: 'k', [start]: type };
    await importPosition(page, fen(pieces, color));
    await move(page, start, destination);
    await expect(page.locator('#promotion')).toBeVisible();
    await page.getByRole('button', { name: 'Promote to queen', exact: true }).click();
    await expect(square(page, destination)).toHaveAttribute('aria-label', `${destination} ${color === 'w' ? 'White' : 'Black'} queen`);
    await expect(square(page, destination).locator('.piece-level')).toHaveCount(0);
  });

  test(`${color === 'w' ? 'White' : 'Black'} revised rook castles and restores after undo`, async ({ page }) => {
    const type = letter('rook.purple@2');
    const row = color === 'w' ? '1' : '8';
    const pieces = { e1: 'K', e8: 'k', ['h' + row]: color === 'w' ? type.toUpperCase() : type };
    await importPosition(page, fen(pieces, color, color === 'w' ? 'K' : 'k'));
    await move(page, 'e' + row, 'g' + row);
    await hasDesign(page, 'f' + row, 'rook.purple@2');
    await expect(square(page, 'g' + row)).toHaveAttribute('aria-label', `g${row} ${color === 'w' ? 'White' : 'Black'} king`);
    await expect(page.locator('#history')).toContainText('O-O');
    await page.getByRole('button', { name: /Undo move/ }).click();
    await hasDesign(page, 'h' + row, 'rook.purple@2');
    await square(page, 'e' + row).click();
    await expect(square(page, 'g' + row).locator('.move-marker')).toHaveCount(1);
  });
}

test('timed experimental saves preserve clocks and pause safely through undo', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-21T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-21T12:00:01Z'));
  await page.reload();
  await experimental(page);
  await choose(page, 'rook', 'a1', 'rook.purple@2');
  await page.selectOption('#time-control', 'blitz');
  await start(page);
  await page.getByRole('button', { name: 'Start clock', exact: true }).click();
  await page.clock.fastForward(10_000);
  await move(page, 'e2', 'e4');
  await page.clock.fastForward(7_000);
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Load saved', exact: true }).click();
  await expect(page.locator('#white-clock')).toHaveText('02:52');
  await expect(page.locator('#black-clock')).toHaveText('02:53');
  await expect(page.getByRole('button', { name: 'Resume clock', exact: true })).toBeVisible();
  await hasDesign(page, 'a1', 'rook.purple@2');
  await page.getByRole('button', { name: /Undo move/ }).click();
  await expect(page.locator('#white-clock')).toHaveText('03:00');
  await expect(page.locator('#black-clock')).toHaveText('03:00');
  await expect(square(page, 'e2')).toHaveAttribute('aria-label', 'e2 White pawn');
});

test('experimental engine requests carry the frozen profile identity and apply a legal reply', async ({ page }) => {
  let payload;
  await page.route('**/api/engine/status', route => route.fulfill({ json: { name: 'Test engine' } }));
  await page.route('**/api/engine/move', route => {
    payload = route.request().postDataJSON();
    return route.fulfill({ json: { move: 'g8f6' } });
  });
  await experimental(page);
  await choose(page, 'rook', 'a1', 'rook.purple@2');
  await start(page);
  await page.selectOption('#opponent', 'engine');
  await expect(page.locator('#engine-status')).toContainText('connected');
  await move(page, 'e2', 'e4');
  await expect(square(page, 'f6')).toHaveAttribute('aria-label', 'f6 Black knight');
  await expect(page.locator('#history li span').first()).toHaveText('e4');
  expect(payload.variant).toBe(EXPERIMENTAL_VARIANT);
  expect(payload.profileHash).toBe(PLAYABLE_PROFILE.hash);
  expect(payload.registryHash).toBe(PLAYABLE_PROFILE.registryHash);
  expect(payload).not.toHaveProperty('config');
  expect(payload).not.toHaveProperty('registry');
});

test('native engine plays the experimental board through the browser controls', async ({ page }) => {
  test.skip(!process.env.FAIRY_STOCKFISH_PATH, 'Set FAIRY_STOCKFISH_PATH for native integration.');
  await experimental(page);
  await choose(page, 'rook', 'a1', 'rook.purple@2');
  await choose(page, 'pawn', 'd7', 'pawn.purple@2');
  await start(page);
  await page.selectOption('#opponent', 'engine');
  await expect(page.locator('#engine-status')).toContainText('connected');
  await page.selectOption('#difficulty', 'easy');
  await move(page, 'e2', 'e4');
  await expect(page.locator('#status')).toHaveText('White to move', { timeout: 20000 });
  await expect(page.locator('#history li span')).toHaveCount(2);
  await hasDesign(page, 'a1', 'rook.purple@2');
  await expect(page.locator('#engine-status')).not.toContainText('paused');
});
