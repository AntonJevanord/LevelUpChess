const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const { VariantGame, initVariantRules } = require('../dist/rules-node.cjs');
const { PLAYABLE_LIBRARIES, getPlayableProfile } = require('../src/design-options');

const library = PLAYABLE_LIBRARIES.find(item => item.id === 'v16-references');
const profile = library && getPlayableProfile(library.variant);
const square = (page, name) => page.locator(`#board [data-square="${name}"]`);
const type = id => profile.registry.allocations.find(item => item.id === id).letter;
const pocket = (page, color, piece) => page.locator(`[data-pocket-color="${color}"][data-pocket-type="${piece}"]`);
const marker = (page, name) => square(page, name).locator('.move-marker, .capture-marker');
const kingGrant = 'king.reserve-king@1';
const trueQueenGrant = 'king.reserve-true-queen@1';
const bishopGrant = 'king.reserve-bishop@1';

function position(pieces, reserves = '', turn = 'w', rights = '-') {
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
  return `${rows.join('/')}[${reserves}] ${turn} ${rights} - 0 1`;
}

async function importPgn(page, pgn) {
  await page.getByRole('button', { name: 'Import PGN', exact: true }).click();
  await page.locator('#pgn-text').fill(pgn);
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
  await expect(page.locator('#import-dialog')).not.toBeVisible();
  if (await page.locator('#replace-dialog').isVisible()) {
    await page.getByRole('button', { name: 'Replace game', exact: true }).click();
  }
}

async function importPosition(page, pieces, reserves, turn = 'w', rights = '-') {
  const game = new VariantGame(position(pieces, reserves, turn, rights), library.variant);
  try { await importPgn(page, game.pgn()); }
  finally { game.dispose(); }
}

async function start(page) {
  await page.locator('#new-game').click();
  if (await page.locator('#restart').isVisible()) {
    await page.getByRole('button', { name: 'Start new game', exact: true }).click();
  }
  await expect(page.locator('#board')).toHaveClass(/experimental-board/);
}

async function move(page, from, to) {
  await square(page, from).click();
  await square(page, to).click();
}

test.beforeAll(async () => {
  expect(library, 'The version 16 reference library is bundled.').toBeTruthy();
  await initVariantRules(library.variant);
});
test.beforeEach(async ({ page }) => { await page.goto('http://127.0.0.1:4173'); });

test('clicking starting pieces selects upgrades, and the ninth king purchase becomes a finite reserve', async ({ page }) => {
  await page.selectOption('#game-mode', library.variant);
  await page.locator('#experimental-budget').fill('9');
  await square(page, 'e1').click();
  await expect(page.locator('#setup-piece-title')).toContainText('e1');
  await page.locator(`#setup-picker [data-upgrade-id="${trueQueenGrant}"]`).click();
  await expect(page.locator('#experimental-status')).toContainText('White 9/9 · Black 0/9');
  await start(page);
  await expect(square(page, 'e1')).toHaveAttribute('aria-label', 'e1 White king');
  await expect(square(page, 'e8')).toHaveAttribute('aria-label', 'e8 Black king');
  await expect(page.locator('#board .piece')).toHaveCount(32);
  await expect(pocket(page, 'w', type(trueQueenGrant))).toBeVisible();
  await pocket(page, 'w', type(trueQueenGrant)).click();
  await expect(marker(page, 'e4')).toHaveCount(1);
  await expect(marker(page, 'e5')).toHaveCount(0);
  await square(page, 'e4').click();
  await expect(square(page, 'e4')).toHaveAttribute('data-design-id', trueQueenGrant);
  await expect(pocket(page, 'w', type(trueQueenGrant))).toHaveCount(0);
  await expect(page.locator('#board .piece')).toHaveCount(33);
});

test('the official replacement roster is selectable directly on the board and reset clears the reserve purchase', async ({ page }) => {
  await page.selectOption('#game-mode', library.variant);
  for (const [name, id] of [['a1', 'rook.purple@10'], ['b8', 'knight.purple@3']]) {
    await square(page, name).click();
    await page.locator(`#setup-picker [data-upgrade-id="${id}"]`).click();
  }
  await square(page, 'e1').click();
  await page.locator(`#setup-picker [data-upgrade-id="${kingGrant}"]`).click();
  await expect(page.locator('#experimental-status')).toContainText('White 7/6');
  await page.locator('#clear-white-army').click();
  await expect(page.locator('#experimental-status')).toContainText('White 0/6 · Black 3/6');
  await start(page);
  await expect(square(page, 'a1')).toHaveAttribute('aria-label', 'a1 White rook');
  await expect(square(page, 'b8')).toHaveAttribute('data-design-id', 'knight.purple@3');
  await expect(page.locator('[data-pocket-color="w"]')).toHaveCount(0);
});

test('leaving board setup for ordinary chess closes the picker and keeps the current game playable', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.selectOption('#game-mode', library.variant);
  await square(page, 'e1').click();
  await page.locator(`#setup-picker [data-upgrade-id="${bishopGrant}"]`).click();
  await page.selectOption('#game-mode', 'chess');
  await expect(page.locator('#setup-picker')).not.toBeVisible();
  await expect(page.locator('#setup-toolbar')).not.toBeVisible();
  await move(page, 'e2', 'e4');
  await expect(square(page, 'e4')).toHaveAttribute('aria-label', 'e4 White pawn');
  expect(errors).toEqual([]);
});

test('reserve drops use the chess clock, setup pauses it, and saved undo restores the purchase and time', async ({ page }) => {
  test.setTimeout(60000);
  await page.clock.install({ time: new Date('2026-10-27T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-27T12:00:01Z'));
  await page.reload();
  await page.selectOption('#game-mode', library.variant);
  await square(page, 'e1').click();
  await page.locator(`#setup-picker [data-upgrade-id="${bishopGrant}"]`).click();
  await page.selectOption('#time-control', 'blitz');
  await start(page);
  await page.getByRole('button', { name: 'Start clock', exact: true }).click();
  await page.clock.fastForward(10_000);
  await page.locator('#setup-mode').click();
  await expect(page.locator('#clock-toggle')).toBeDisabled();
  await page.clock.fastForward(20_000);
  await expect(page.locator('#white-clock')).toHaveText('02:50');
  await page.locator('#setup-mode').click();
  await page.getByRole('button', { name: 'Resume clock', exact: true }).click();
  await pocket(page, 'w', type(bishopGrant)).click();
  await square(page, 'e4').click();
  await expect(page.locator('#white-clock')).toHaveText('02:52');
  await page.clock.fastForward(7_000);
  await move(page, 'e7', 'e5');
  await expect(page.locator('#black-clock')).toHaveText('02:55');
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Load saved', exact: true }).click();
  await expect(square(page, 'e4')).toHaveAttribute('data-design-id', bishopGrant);
  await expect(page.locator('#white-clock')).toHaveText('02:52');
  await expect(page.locator('#black-clock')).toHaveText('02:55');
  await page.getByRole('button', { name: /Undo move/ }).click();
  await page.getByRole('button', { name: /Undo move/ }).click();
  await expect(square(page, 'e4')).toHaveAttribute('aria-label', 'e4 empty');
  await expect(pocket(page, 'w', type(bishopGrant))).toBeVisible();
  await expect(page.locator('#white-clock')).toHaveText('03:00');
  await expect(page.locator('#black-clock')).toHaveText('03:00');
  await expect(page.getByRole('button', { name: 'Resume clock', exact: true })).toBeVisible();
});

test('reserve drops respect the own-half region, prohibit checks, and mirror the restriction for Black', async ({ page }) => {
  const grant = type(trueQueenGrant);
  await importPosition(page, { a1: 'K', h8: 'k' }, grant.toUpperCase());
  await pocket(page, 'w', grant).click();
  await expect(marker(page, 'e4')).toHaveCount(1);
  await expect(marker(page, 'd4')).toHaveCount(0); // d4 would check the king on h8.
  await expect(marker(page, 'e5')).toHaveCount(0);
  await expect(marker(page, 'a1')).toHaveCount(0);
  await square(page, 'e4').click();
  await expect(square(page, 'e4')).toHaveAttribute('data-design-id', trueQueenGrant);
  await expect(page.locator('#status')).toHaveText('Black to move');

  await importPosition(page, { h1: 'K', a8: 'k' }, grant, 'b');
  await pocket(page, 'b', grant).click();
  await expect(marker(page, 'e5')).toHaveCount(1);
  await expect(marker(page, 'd5')).toHaveCount(0); // d5 would check the king on h1.
  await expect(marker(page, 'e4')).toHaveCount(0);
  await square(page, 'e5').click();
  await expect(square(page, 'e5')).toHaveAttribute('data-design-id', trueQueenGrant);
  await expect(page.locator('#status')).toHaveText('White to move');
});

test('a grant leaves the ordinary royal king able to castle', async ({ page }) => {
  const grant = type(bishopGrant);
  await importPosition(page, { e1: 'K', h1: 'R', a8: 'k' }, grant.toUpperCase(), 'w', 'K');
  await square(page, 'e1').click();
  await expect(marker(page, 'g1')).toHaveCount(1);
  await square(page, 'g1').click();
  await expect(square(page, 'g1')).toHaveAttribute('aria-label', 'g1 White king');
  await expect(square(page, 'f1')).toHaveAttribute('aria-label', 'f1 White rook');
  await expect(pocket(page, 'w', grant)).toBeVisible();
});

test('an engine drop reply is played with the same profile and finite pocket as a human drop', async ({ page }) => {
  const grant = type(bishopGrant);
  let request;
  await page.route('**/api/engine/status', route => route.fulfill({ json: { name: 'Reserve test engine' } }));
  await page.route('**/api/engine/move', route => {
    request = route.request().postDataJSON();
    return route.fulfill({ json: { move: `${grant.toUpperCase()}@e4` } });
  });
  await importPosition(page, { a1: 'K', h8: 'k' }, grant.toUpperCase());
  await page.selectOption('#opponent', 'engine');
  await page.selectOption('#human-side', 'b');
  await expect(square(page, 'e4')).toHaveAttribute('data-design-id', bishopGrant);
  await expect(pocket(page, 'w', grant)).toHaveCount(0);
  await expect(page.locator('#status')).toHaveText('Black to move');
  await expect(page.locator('#engine-status')).toContainText('Your move');
  expect(request.variant).toBe(library.variant);
  expect(request.profileHash).toBe(profile.hash);
  expect(request.fen.split(' ')[0]).toContain(`[${grant.toUpperCase()}]`);
});

test('editing armies cancels an engine search and leaves Resume engine available on return', async ({ page }) => {
  let searches = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/engine/status', route => route.fulfill({ json: { name: 'Setup test engine' } }));
  await page.route('**/api/engine/move', async route => {
    searches++;
    if (searches === 1) await gate;
    await route.fulfill({ json: { move: 'e7e5' } }).catch(() => {});
  });
  await page.selectOption('#game-mode', library.variant);
  await start(page);
  await page.selectOption('#opponent', 'engine');
  await expect(page.locator('#engine-status')).toContainText('connected');
  await move(page, 'e2', 'e4');
  await expect.poll(() => searches).toBe(1);
  await page.locator('#setup-mode').click();
  release();
  await expect(page.locator('#engine-retry')).toBeEnabled();
  await page.locator('#setup-mode').click();
  await expect(square(page, 'e7')).toHaveAttribute('aria-label', 'e7 Black pawn');
  await page.locator('#engine-retry').click();
  await expect(square(page, 'e5')).toHaveAttribute('aria-label', 'e5 Black pawn');
  expect(searches).toBe(2);
});

test('the real native bridge answers a forced reserve interposition', async ({ page }) => {
  test.skip(!process.env.FAIRY_STOCKFISH_PATH, 'Set FAIRY_STOCKFISH_PATH for the native reserve bridge check.');
  const grant = type(bishopGrant);
  // The checked king cannot escape: the a-file rook covers a2, the bishop
  // covers b1, and the black king covers b2. Only an a-file reserve drop works.
  await importPosition(page, { a1: 'K', c3: 'k', c2: 'b', a8: 'r' }, grant.toUpperCase());
  await page.selectOption('#opponent', 'engine');
  await expect(page.locator('#engine-status')).toContainText('connected', { timeout: 20000 });
  await page.selectOption('#human-side', 'b');
  await expect(page.locator('#history li span')).toHaveCount(1, { timeout: 20000 });
  await expect(page.locator('#history li span')).toHaveText(/@a[234]/);
  await expect(pocket(page, 'w', grant)).toHaveCount(0);
  await expect(page.locator('#status')).toHaveText('Black to move');
  await expect(page.locator('#engine-status')).toContainText('Your move');
});

test('a drop survives save and PGN, captured guards never recycle, and undo restores the finite reserve', async ({ page }) => {
  test.setTimeout(60000);
  const grant = type(bishopGrant);
  await importPosition(page, { a1: 'K', h8: 'k', e8: 'r' }, grant.toUpperCase());
  await pocket(page, 'w', grant).click();
  await square(page, 'e4').click();
  await expect(square(page, 'e4')).toHaveAttribute('data-design-id', bishopGrant);
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PGN', exact: true }).click();
  const pgn = await fs.readFile(await (await waiting).path(), 'utf8');
  expect(pgn).toContain('@e4');
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Load saved', exact: true }).click();
  await expect(square(page, 'e4')).toHaveAttribute('data-design-id', bishopGrant);
  await expect(pocket(page, 'w', grant)).toHaveCount(0);
  await move(page, 'e8', 'e4');
  await expect(square(page, 'e4')).toHaveAttribute('aria-label', 'e4 Black rook');
  await expect(page.locator('[data-pocket-color]')).toHaveCount(0);
  await page.getByRole('button', { name: /Undo move/ }).click();
  await expect(square(page, 'e4')).toHaveAttribute('data-design-id', bishopGrant);
  await page.getByRole('button', { name: /Undo move/ }).click();
  await expect(square(page, 'e4')).toHaveAttribute('aria-label', 'e4 empty');
  await expect(pocket(page, 'w', grant)).toBeVisible();
  await importPgn(page, pgn);
  await expect(square(page, 'e4')).toHaveAttribute('data-design-id', bishopGrant);
  await expect(pocket(page, 'w', grant)).toHaveCount(0);
});
