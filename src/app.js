import { Chess } from 'chess.js';

const game = new Chess();
const board = document.querySelector('#board');
const promotion = document.querySelector('#promotion');
const restart = document.querySelector('#restart');
const symbols = { w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' }, b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' } };
const names = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
let selected = null;
let flipped = false;
let pending = null;
const side = color => color === 'w' ? 'White' : 'Black';

function render(focusSquare) {
  const files = [...'abcdefgh'];
  const ranks = [...'87654321'];
  if (flipped) { files.reverse(); ranks.reverse(); }
  const legal = selected ? game.moves({ square: selected, verbose: true }) : [];
  const history = game.history({ verbose: true });
  const last = history.at(-1);
  board.replaceChildren();
  ranks.forEach((rank, row) => files.forEach((file, col) => {
    const square = file + rank;
    const piece = game.get(square);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'square ' + ((file.charCodeAt(0) - 97 + Number(rank)) % 2 === 0 ? 'dark' : 'light');
    button.dataset.square = square;
    button.setAttribute('aria-label', `${square}${piece ? ` ${side(piece.color)} ${names[piece.type]}` : ' empty'}`);
    button.setAttribute('aria-pressed', String(selected === square));
    if (selected === square) button.classList.add('selected');
    if (last && [last.from, last.to].includes(square)) button.classList.add('last-move');
    if (piece?.type === 'k' && piece.color === game.turn() && game.isCheck()) button.classList.add('check');
    if (piece) {
      const icon = document.createElement('span');
      icon.className = `piece ${piece.color === 'w' ? 'white-piece' : 'black-piece'}`;
      icon.textContent = symbols[piece.color][piece.type];
      button.append(icon);
    }
    if (legal.some(move => move.to === square)) {
      const marker = document.createElement('span');
      marker.className = piece ? 'capture-marker' : 'move-marker';
      button.append(marker);
    }
    for (const [show, value, position] of [[col === 0, rank, 'rank'], [row === 7, file, 'file']]) {
      if (!show) continue;
      const label = document.createElement('span');
      label.className = `coordinate ${position}`;
      label.textContent = value;
      button.append(label);
    }
    button.addEventListener('click', () => selectSquare(square));
    button.addEventListener('keydown', event => {
      const delta = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[event.key];
      if (!delta) return;
      event.preventDefault();
      const target = files[col + delta[1]] + ranks[row + delta[0]];
      board.querySelector(`[data-square="${target}"]`)?.focus();
    });
    board.append(button);
  }));
  let status = `${side(game.turn())} to move`;
  if (game.isCheckmate()) status = `${side(game.turn() === 'w' ? 'b' : 'w')} wins by checkmate`;
  else if (game.isStalemate()) status = 'Draw by stalemate';
  else if (game.isInsufficientMaterial()) status = 'Draw: insufficient material';
  else if (game.isThreefoldRepetition()) status = 'Draw by repetition';
  else if (game.isDraw()) status = 'Draw by fifty-move rule';
  else if (game.isCheck()) status += ' · Check';
  document.querySelector('#status').textContent = status;
  document.querySelector('#hint').textContent = game.isGameOver() ? 'Start a new game or undo a move to keep playing.' : selected ? `${side(game.turn())} ${names[game.get(selected).type]} on ${selected}. Choose a highlighted square.` : 'Select a piece to see its legal moves.';
  document.querySelector('#undo').disabled = history.length === 0;
  document.querySelector('#top-player').textContent = flipped ? 'White pieces' : 'Black pieces';
  document.querySelector('#bottom-player').textContent = flipped ? 'Black pieces' : 'White pieces';
  const avatars = document.querySelectorAll('.avatar');
  avatars[0].classList.toggle('white-avatar', flipped);
  avatars[1].classList.toggle('white-avatar', !flipped);
  avatars[0].textContent = flipped ? '♙' : '♟';
  avatars[1].textContent = flipped ? '♟' : '♙';
  const list = document.querySelector('#history');
  list.replaceChildren();
  for (let i = 0; i < history.length; i += 2) {
    const item = document.createElement('li');
    for (const move of history.slice(i, i + 2)) {
      const text = document.createElement('span');
      text.textContent = move.san;
      item.append(text);
    }
    list.append(item);
  }
  document.querySelector('#empty-history').hidden = history.length > 0;
  list.scrollTop = list.scrollHeight;
  if (focusSquare) board.querySelector(`[data-square="${focusSquare}"]`)?.focus({ preventScroll: true });
}

function selectSquare(square) {
  if (game.isGameOver() || pending) return;
  const moves = selected ? game.moves({ square: selected, verbose: true }).filter(move => move.to === square) : [];
  if (moves.length) {
    if (moves.some(move => move.promotion)) {
      pending = { from: selected, to: square };
      const options = document.querySelector('#promotion-options');
      options.replaceChildren();
      for (const type of ['q', 'r', 'b', 'n']) {
        const button = document.createElement('button');
        button.textContent = symbols[game.turn()][type];
        button.setAttribute('aria-label', `Promote to ${names[type]}`);
        button.onclick = () => { game.move({ ...pending, promotion: type }); pending = null; selected = null; promotion.close(); render(square); };
        options.append(button);
      }
      promotion.showModal();
      return;
    }
    game.move({ from: selected, to: square });
    selected = null;
  } else {
    const piece = game.get(square);
    selected = square !== selected && piece?.color === game.turn() ? square : null;
  }
  render(square);
}

promotion.addEventListener('cancel', () => { pending = null; });
document.querySelector('#undo').onclick = () => { game.undo(); selected = null; render(); };
document.querySelector('#flip').onclick = () => { flipped = !flipped; render(); };
document.querySelector('#new-game').onclick = () => { if (game.history().length) restart.showModal(); else { game.reset(); selected = null; render(); } };
document.querySelector('#cancel-restart').onclick = () => restart.close();
document.querySelector('#confirm-restart').onclick = () => { game.reset(); selected = null; restart.close(); render(); };
render();
