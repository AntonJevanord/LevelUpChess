const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

const url = 'http://127.0.0.1:4173/prototypes/kings/index.html';
const square = (page, name) => page.locator(`#board .square[data-square="${name}"]`);
const marker = (page, name) => square(page, name).locator('.move-marker, .capture-marker');
const ring = ['b2', 'd2', 'f2', 'b4', 'f4', 'b6', 'd6', 'f6'];
const levels = [
  { value: 'chess', captures: [] },
  { value: 'king-blue', captures: ['b4', 'f4'] },
  { value: 'king-orange', captures: ['b4', 'f4', 'd2', 'd6'] },
  { value: 'king-purple', captures: ring },
];

async function loadFen(page, fen) {
  await page.locator('#fen').fill(fen);
  await page.locator('#load-fen').click();
  await expect(page.locator('#fen')).toHaveValue(fen);
}

async function move(page, from, to) {
  if (await square(page, from).getAttribute('aria-pressed') !== 'true') await square(page, from).click();
  await square(page, to).click();
}

async function chooseLevel(page, value) {
  await page.selectOption('#level', value);
  await expect(page.locator('#board .square')).toHaveCount(64);
  await expect(page.locator('#board')).toHaveAttribute('aria-busy', 'false');
}

test.beforeEach(async ({ page }) => {
  await page.goto(url);
  await expect(page.locator('#board .square')).toHaveCount(64);
  await expect(page.locator('#board')).toHaveAttribute('aria-busy', 'false');
});

for (const level of levels) {
  for (const color of ['White', 'Black']) {
    test(`${level.value} ${color.toLowerCase()} kings make only their defined two-square captures`, async ({ page }) => {
      await chooseLevel(page, level.value);
      const mirror = name => color === 'White' ? name : name[0] + (9 - Number(name[1]));
      const from = mirror('d4');
      const fen = color === 'White'
        ? 'k7/8/1p1p1p2/8/1p1K1p2/8/1p1p1p2/8 w - - 0 1'
        : '8/1P1P1P2/8/1P1k1P2/8/1P1P1P2/8/K7 b - - 0 1';
      const opponent = color === 'White' ? 'Black' : 'White';
      await loadFen(page, fen);
      await expect(square(page, from)).toHaveAttribute('aria-label', `${from} ${color} king`);
      await square(page, from).click();
      for (const target of ring) {
        await expect(square(page, mirror(target)).locator('.capture-marker'))
          .toHaveCount(level.captures.includes(target) ? 1 : 0);
      }
      // An unavailable capture must remain unavailable when the square is clicked.
      for (const target of ring.filter(target => !level.captures.includes(target))) {
        await loadFen(page, fen);
        await move(page, from, mirror(target));
        await expect(square(page, from)).toHaveAttribute('aria-label', `${from} ${color} king`);
        await expect(page.locator('#fen')).toHaveValue(fen);
      }
      for (const target of level.captures) {
        const to = mirror(target);
        await loadFen(page, fen);
        await move(page, from, to);
        await expect(square(page, from)).toHaveAttribute('aria-label', `${from} empty`);
        await expect(square(page, to)).toHaveAttribute('aria-label', `${to} ${color} king`);
        await expect(page.locator('#history')).toContainText('x');
        await page.getByRole('button', { name: 'Undo move', exact: true }).click();
        await expect(page.locator('#fen')).toHaveValue(fen);
        await expect(square(page, to)).toHaveAttribute('aria-label', `${to} ${opponent} pawn`);
      }
    });
  }
}

for (const level of levels.slice(1)) {
  test(`${level.value} keeps ordinary quiet king moves and cannot jump to empty squares`, async ({ page }) => {
    await chooseLevel(page, level.value);
    const fen = 'k7/7p/8/8/3K4/8/P7/8 w - - 0 1';
    await loadFen(page, fen);
    await square(page, 'd4').click();
    for (const target of ['c3', 'd3', 'e3', 'c4', 'e4', 'c5', 'd5', 'e5']) {
      await expect(square(page, target).locator('.move-marker')).toHaveCount(1);
    }
    for (const target of ring) await expect(marker(page, target)).toHaveCount(0);
    await square(page, 'f4').click();
    await expect(page.locator('#fen')).toHaveValue(fen);
    for (const target of ['c3', 'd3', 'e3', 'c4', 'e4', 'c5', 'd5', 'e5']) {
      await loadFen(page, fen);
      await move(page, 'd4', target);
      await expect(square(page, target)).toHaveAttribute('aria-label', `${target} White king`);
      await page.getByRole('button', { name: 'Undo move', exact: true }).click();
      await expect(page.locator('#fen')).toHaveValue(fen);
    }
  });

  test(`${level.value} jumps over either color without removing the intervening piece`, async ({ page }) => {
    await chooseLevel(page, level.value);
    for (const [piece, color] of [['P', 'White'], ['p', 'Black']]) {
      await loadFen(page, `k7/7p/8/8/1P1K${piece}p2/8/P7/8 w - - 0 1`);
      await square(page, 'd4').click();
      await expect(square(page, 'f4').locator('.capture-marker')).toHaveCount(1);
      await expect(marker(page, 'b4')).toHaveCount(0);
      await square(page, 'f4').click();
      await expect(square(page, 'f4')).toHaveAttribute('aria-label', 'f4 White king');
      await expect(square(page, 'e4')).toHaveAttribute('aria-label', `e4 ${color} pawn`);
      await expect(square(page, 'b4')).toHaveAttribute('aria-label', 'b4 White pawn');
    }
  });

  test(`${level.value} cannot jump onto a protected piece, including protection from an upgraded king`, async ({ page }) => {
    await chooseLevel(page, level.value);
    for (const fen of [
      'k4r2/8/8/8/3K1p2/8/P7/8 w - - 0 1',
      '8/7p/8/8/3K1p1k/8/P7/8 w - - 0 1',
    ]) {
      await loadFen(page, fen);
      await square(page, 'd4').click();
      await expect(marker(page, 'f4')).toHaveCount(0);
      await square(page, 'f4').click();
      await expect(page.locator('#fen')).toHaveValue(fen);
      await expect(square(page, 'd4')).toHaveAttribute('aria-label', 'd4 White king');
      await expect(square(page, 'f4')).toHaveAttribute('aria-label', 'f4 Black pawn');
    }
  });

  test(`${level.value} castles on either side and cannot castle through check`, async ({ page }) => {
    await chooseLevel(page, level.value);
    const fen = 'k7/7p/8/8/8/8/P7/R3K2R w KQ - 0 1';
    for (const [to, rookFrom, rookTo] of [['g1', 'h1', 'f1'], ['c1', 'a1', 'd1']]) {
      await loadFen(page, fen);
      await move(page, 'e1', to);
      await expect(square(page, to)).toHaveAttribute('aria-label', `${to} White king`);
      await expect(square(page, rookFrom)).toHaveAttribute('aria-label', `${rookFrom} empty`);
      await expect(square(page, rookTo)).toHaveAttribute('aria-label', `${rookTo} White rook`);
      await page.getByRole('button', { name: 'Undo move', exact: true }).click();
      await expect(page.locator('#fen')).toHaveValue(fen);
    }
    const throughCheck = 'k4r2/7p/8/8/8/8/P7/R3K2R w KQ - 0 1';
    await loadFen(page, throughCheck);
    await square(page, 'e1').click();
    await expect(marker(page, 'g1')).toHaveCount(0);
    await expect(square(page, 'c1').locator('.move-marker')).toHaveCount(1);
    await square(page, 'g1').click();
    await expect(page.locator('#fen')).toHaveValue(throughCheck);
    await expect(square(page, 'e1')).toHaveAttribute('aria-label', 'e1 White king');

    // The same e1g1 coordinates can mean a jump capture, not castling.
    const jumpCapture = '4k3/8/8/8/8/8/8/4KBnR w K - 0 1';
    await loadFen(page, jumpCapture);
    await square(page, 'e1').click();
    await expect(square(page, 'g1').locator('.capture-marker')).toHaveCount(1);
    await square(page, 'g1').click();
    await expect(square(page, 'g1')).toHaveAttribute('aria-label', 'g1 White king');
    await expect(square(page, 'f1')).toHaveAttribute('aria-label', 'f1 White bishop');
    await expect(square(page, 'h1')).toHaveAttribute('aria-label', 'h1 White rook');
    await expect(page.locator('#history li').last()).toContainText('Kxg1');
    await expect(page.locator('#history')).not.toContainText('O-O');
    await page.getByRole('button', { name: 'Undo move', exact: true }).click();
    await expect(page.locator('#fen')).toHaveValue(jumpCapture);
    await expect(square(page, 'g1')).toHaveAttribute('aria-label', 'g1 Black knight');
  });

  test(`${level.value} preserves the ladder mate and allows only supported capture escapes`, async ({ page }) => {
    await chooseLevel(page, level.value);
    await page.selectOption('#position', 'ladder-mate');
    await expect(page.locator('#status')).toContainText(/checkmate/i);
    await square(page, 'h8').click();
    await expect(page.locator('#board .move-marker, #board .capture-marker')).toHaveCount(0);
    await page.selectOption('#position', 'capture-escape');
    if (level.value === 'king-blue') {
      await expect(page.locator('#status')).toContainText(/checkmate/i);
      await move(page, 'h8', 'h6');
      await expect(square(page, 'h8')).toHaveAttribute('aria-label', 'h8 Black king');
    } else {
      await expect(page.locator('#status')).toContainText(/check/i);
      await expect(page.locator('#status')).not.toContainText(/checkmate/i);
      await move(page, 'h8', 'h6');
      await expect(square(page, 'h6')).toHaveAttribute('aria-label', 'h6 Black king');
      await expect(page.locator('#status')).toContainText(/White to move/i);
      await page.getByRole('button', { name: 'Undo move', exact: true }).click();
      await expect(square(page, 'h6')).toHaveAttribute('aria-label', 'h6 White knight');
      await expect(page.locator('#status')).toContainText(/check/i);
    }
  });
}

test('ordinary pawns still offer every standard promotion with upgraded kings', async ({ page }) => {
  await chooseLevel(page, 'king-purple');
  const fen = '7k/P7/8/8/8/8/8/7K w - - 0 1';
  await expect(page.locator('#promotion option')).toHaveCount(4);
  for (const [value, name] of [['q', 'queen'], ['r', 'rook'], ['b', 'bishop'], ['n', 'knight']]) {
    await loadFen(page, fen);
    await page.selectOption('#promotion', value);
    await move(page, 'a7', 'a8');
    await expect(square(page, 'a8')).toHaveAttribute('aria-label', `a8 White ${name}`);
    await page.getByRole('button', { name: 'Undo move', exact: true }).click();
    await expect(page.locator('#fen')).toHaveValue(fen);
    await expect(square(page, 'a7')).toHaveAttribute('aria-label', 'a7 White pawn');
  }
});

for (const level of levels.slice(1)) {
  test(`${level.value} allows knight-assisted mate while bare kings remain drawn`, async ({ page }) => {
    await chooseLevel(page, level.value);
    const bareKings = '7k/8/8/8/8/8/8/K7 w - - 0 1';
    await loadFen(page, bareKings);
    await expect(page.locator('#status')).toContainText(/draw.*insufficient material/i);
    await move(page, 'a1', 'b1');
    await expect(page.locator('#fen')).toHaveValue(bareKings);

    // Extra royal attacks seal h7, so this is mating material for every tier.
    // The engine's ordinary-chess K+N shortcut must not end the game early.
    const premate = '7k/5K2/8/8/5N2/8/8/8 w - - 0 1';
    await loadFen(page, premate);
    await expect(page.locator('#status')).toHaveText('White to move');
    await move(page, 'f4', 'g6');
    await expect(square(page, 'g6')).toHaveAttribute('aria-label', 'g6 White knight');
    await expect(page.locator('#status')).toHaveText('White wins by checkmate');
    await page.getByRole('button', { name: 'Undo move', exact: true }).click();
    await expect(page.locator('#fen')).toHaveValue(premate);
    await expect(page.locator('#status')).toHaveText('White to move');
    await square(page, 'f4').click();
    await expect(square(page, 'g6').locator('.move-marker')).toHaveCount(1);
  });
}

test('the standard king profile retains the ordinary knight-versus-king material draw', async ({ page }) => {
  await chooseLevel(page, 'chess');
  const fen = '7k/5K2/8/8/5N2/8/8/8 w - - 0 1';
  await loadFen(page, fen);
  await expect(page.locator('#status')).toContainText(/draw.*insufficient material/i);
  await move(page, 'f4', 'g6');
  await expect(page.locator('#fen')).toHaveValue(fen);
  await expect(square(page, 'f4')).toHaveAttribute('aria-label', 'f4 White knight');
});

test('the fifty-move draw ends upgraded games at 100 halfmoves and undo restores play', async ({ page }) => {
  await chooseLevel(page, 'king-purple');
  for (const count of [100, 101]) {
    const fen = `k7/7p/8/8/3K4/8/P7/8 w - - ${count} 51`;
    await loadFen(page, fen);
    await expect(page.locator('#status')).toContainText(/draw/i);
    await move(page, 'd4', 'e4');
    await expect(page.locator('#fen')).toHaveValue(fen);
  }
  const beforeDraw = 'k7/7p/8/8/3K4/8/P7/8 w - - 99 51';
  await loadFen(page, beforeDraw);
  await expect(page.locator('#status')).toHaveText('White to move');
  await move(page, 'd4', 'e4');
  await expect(square(page, 'e4')).toHaveAttribute('aria-label', 'e4 White king');
  await expect(page.locator('#status')).toContainText(/draw/i);
  await page.getByRole('button', { name: 'Undo move', exact: true }).click();
  await expect(page.locator('#fen')).toHaveValue(beforeDraw);
  await expect(page.locator('#status')).toHaveText('White to move');
  await square(page, 'd4').click();
  await expect(square(page, 'e4').locator('.move-marker')).toHaveCount(1);
});

test('threefold repetition ends an upgraded game and undo removes the final occurrence', async ({ page }) => {
  await chooseLevel(page, 'king-orange');
  await loadFen(page, 'k7/7p/8/8/3K4/8/P7/8 w - - 0 1');
  for (let cycle = 0; cycle < 2; cycle++) {
    for (const [from, to, color] of [
      ['d4', 'e4', 'White'], ['a8', 'b8', 'Black'],
      ['e4', 'd4', 'White'], ['b8', 'a8', 'Black'],
    ]) {
      await move(page, from, to);
      await expect(square(page, to)).toHaveAttribute('aria-label', `${to} ${color} king`);
    }
    await expect(page.locator('#status')).toContainText(cycle === 0 ? /White to move/ : /draw.*repetition/i);
  }
  await page.getByRole('button', { name: 'Undo move', exact: true }).click();
  await expect(page.locator('#status')).toHaveText('Black to move');
  await expect(square(page, 'b8')).toHaveAttribute('aria-label', 'b8 Black king');
  await move(page, 'b8', 'a8');
  await expect(page.locator('#status')).toContainText(/draw.*repetition/i);
});

test('invalid FEN preserves the playable board and its undo history', async ({ page }) => {
  await move(page, 'e2', 'e4');
  const labels = await page.locator('#board .square').evaluateAll(squares => squares.map(square => square.getAttribute('aria-label')));
  const history = await page.locator('#history').textContent();
  for (const fen of ['not a FEN', '8/8/8/8/8/8/8/8 w - - 0 1']) {
    await page.locator('#fen').fill(fen);
    await page.locator('#load-fen').click();
    await expect(page.locator('#message')).not.toHaveText('');
    expect(await page.locator('#board .square').evaluateAll(squares => squares.map(square => square.getAttribute('aria-label')))).toEqual(labels);
    await expect(page.locator('#history')).toHaveText(history);
  }
  await page.getByRole('button', { name: 'Undo move', exact: true }).click();
  await expect(square(page, 'e2')).toHaveAttribute('aria-label', 'e2 White pawn');
  await expect(square(page, 'e4')).toHaveAttribute('aria-label', 'e4 empty');
});

test('flip, undo, and new game preserve correct square coordinates', async ({ page }) => {
  const first = await page.locator('#board .square').first().getAttribute('data-square');
  await page.getByRole('button', { name: 'Flip board', exact: true }).click();
  await expect(page.locator('#board .square').first()).not.toHaveAttribute('data-square', first);
  await move(page, 'e2', 'e4');
  await expect(square(page, 'e4')).toHaveAttribute('aria-label', 'e4 White pawn');
  await page.getByRole('button', { name: 'Undo move', exact: true }).click();
  await expect(square(page, 'e2')).toHaveAttribute('aria-label', 'e2 White pawn');
  await move(page, 'd2', 'd4');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await expect(square(page, 'd2')).toHaveAttribute('aria-label', 'd2 White pawn');
  await expect(square(page, 'd4')).toHaveAttribute('aria-label', 'd4 empty');
  await expect(page.locator('#level')).toHaveValue('king-blue');
});

test('rapid profile changes leave the last chosen rules active', async ({ page }) => {
  await page.evaluate(() => {
    const select = document.querySelector('#level');
    for (const value of ['king-purple', 'chess', 'king-orange', 'king-blue']) {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await expect(page.locator('#level')).toHaveValue('king-blue');
  await expect(page.locator('#board')).toHaveAttribute('aria-busy', 'false');
  await loadFen(page, 'k7/8/1p1p1p2/8/1p1K1p2/8/1p1p1p2/8 w - - 0 1');
  await square(page, 'd4').click();
  for (const target of ring) {
    await expect(square(page, target).locator('.capture-marker')).toHaveCount(['b4', 'f4'].includes(target) ? 1 : 0);
  }
  await square(page, 'f4').click();
  await expect(square(page, 'f4')).toHaveAttribute('aria-label', 'f4 White king');
});

test('standalone prototype plays and switches profiles without companion requests', async ({ page }) => {
  const requests = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    requests.push(route.request().url());
    return route.abort();
  });
  await page.goto('about:blank');
  await page.setContent(await fs.readFile(path.resolve(__dirname, '../prototypes/kings/index.html'), 'utf8'));
  await expect(page.locator('#board .square')).toHaveCount(64);
  await expect(page.locator('#board')).toHaveCSS('display', 'grid');
  await chooseLevel(page, 'king-purple');
  await loadFen(page, 'k7/8/1p1p1p2/8/1p1K1p2/8/1p1p1p2/8 w - - 0 1');
  await move(page, 'd4', 'f6');
  await expect(square(page, 'f6')).toHaveAttribute('aria-label', 'f6 White king');
  await page.getByRole('button', { name: 'Undo move', exact: true }).click();
  await chooseLevel(page, 'king-blue');
  await loadFen(page, 'k7/8/1p1p1p2/8/1p1K1p2/8/1p1p1p2/8 w - - 0 1');
  await move(page, 'd4', 'f4');
  await expect(square(page, 'f4')).toHaveAttribute('aria-label', 'f4 White king');
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});
