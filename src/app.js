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
const opponent = document.querySelector('#opponent');
const humanSide = document.querySelector('#human-side');
const difficulty = document.querySelector('#difficulty');
let connected = false;
let engineBusy = false;
let enginePaused = false;
let engineController = null;
let generation = 0;
let engineName = 'Fairy Stockfish';

function engineMessage(message) {
  document.querySelector('#engine-status').textContent = message;
  document.querySelector('#engine-retry').disabled = engineBusy;
  document.querySelector('#engine-retry').textContent = connected ? 'Resume engine' : 'Connect engine';
  document.querySelector('#engine-cancel').disabled = !engineBusy && (enginePaused || !connected);
}

function cancelEngine() {
  generation++;
  engineController?.abort();
  engineController = null;
  engineBusy = false;
  enginePaused = true;
}

async function engineFetch(route, options = {}) {
  if (location.protocol === 'file:' || !/^https?:$/.test(location.protocol)) throw new Error('Engine play needs npm.cmd start. Open the address printed in your terminal.');
  const response = await fetch(route, { ...options, signal: engineController.signal });
  const data = await response.json().catch(() => { throw new Error('Engine bridge unavailable. Open the address printed by npm.cmd start.'); });
  if (!response.ok) throw new Error(data.error || 'Engine bridge unavailable.');
  return data;
}

async function connectEngine() {
  cancelEngine();
  connected = false;
  enginePaused = false;
  engineBusy = true;
  engineController = new AbortController();
  const request = generation;
  engineMessage('Connecting to Fairy Stockfish…');
  try {
    const data = await engineFetch('/api/engine/status');
    if (request !== generation) return;
    engineName = data.name;
    connected = true;
    engineBusy = false;
    engineMessage(`${engineName} connected.`);
    render();
  } catch (error) {
    if (request !== generation) return;
    engineBusy = false;
    enginePaused = true;
    engineMessage(error.message === 'Failed to fetch' ? 'Cannot reach the engine bridge. Run npm.cmd start and open its printed address.' : error.message);
  }
}

async function maybeEngineMove() {
  if (opponent.value !== 'engine' || !connected || engineBusy || enginePaused || pending || game.isGameOver() || game.turn() === humanSide.value) return;
  engineBusy = true;
  engineController = new AbortController();
  const request = generation;
  const fen = game.fen();
  engineMessage(`${engineName} is thinking…`);
  try {
    const data = await engineFetch('/api/engine/move', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fen, difficulty: difficulty.value }),
    });
    if (request !== generation || game.fen() !== fen) return;
    if (typeof data.move !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(data.move)) throw new Error('Engine returned an invalid move.');
    game.move({ from: data.move.slice(0, 2), to: data.move.slice(2, 4), promotion: data.move[4] });
    engineBusy = false;
    engineMessage(`${engineName} connected. Your move.`);
    render();
  } catch (error) {
    if (request !== generation) return;
    engineBusy = false;
    enginePaused = true;
    engineMessage(`Engine paused: ${error.message}`);
  }
}


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
  if (opponent.value === 'engine') {
    const topColor = flipped ? 'w' : 'b';
    const bottomColor = flipped ? 'b' : 'w';
    document.querySelector('#top-player').textContent = topColor === humanSide.value ? `You · ${side(topColor)}` : `Fairy Stockfish · ${side(topColor)}`;
    document.querySelector('#bottom-player').textContent = bottomColor === humanSide.value ? `You · ${side(bottomColor)}` : `Fairy Stockfish · ${side(bottomColor)}`;
  }
  void maybeEngineMove();
}

function selectSquare(square) {
  if (game.isGameOver() || pending || (opponent.value === 'engine' && game.turn() !== humanSide.value)) return;
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
document.querySelector('#undo').onclick = () => {
  cancelEngine();
  game.undo();
  if (opponent.value === 'engine' && game.turn() !== humanSide.value && game.history().length) game.undo();
  selected = null;
  if (opponent.value === 'engine') engineMessage('Engine paused after undo. Resume when ready.');
  render();
};
document.querySelector('#flip').onclick = () => { flipped = !flipped; render(); };
function newGame() {
  cancelEngine();
  enginePaused = false;
  game.reset();
  selected = null;
  pending = null;
  promotion.close();
  restart.close();
  if (opponent.value === 'engine') engineMessage(connected ? `${engineName} connected.` : 'Connect the engine to begin.');
  render();
}
document.querySelector('#new-game').onclick = () => { if (game.history().length || engineBusy) restart.showModal(); else newGame(); };
document.querySelector('#cancel-restart').onclick = () => restart.close();
document.querySelector('#confirm-restart').onclick = newGame;
opponent.onchange = () => {
  cancelEngine();
  selected = null;
  document.querySelector('#engine-settings').hidden = opponent.value !== 'engine';
  if (opponent.value === 'engine') { flipped = humanSide.value === 'b'; void connectEngine(); }
  render();
};
humanSide.onchange = () => {
  cancelEngine();
  enginePaused = false;
  selected = null;
  flipped = humanSide.value === 'b';
  if (!connected) void connectEngine();
  else engineMessage(`${engineName} connected.`);
  render();
};
difficulty.onchange = () => {
  cancelEngine();
  enginePaused = false;
  engineMessage(connected ? `${engineName} connected.` : 'Connect the engine to begin.');
  render();
};
document.querySelector('#engine-retry').onclick = () => {
  if (!connected) void connectEngine();
  else { enginePaused = false; engineMessage(`${engineName} connected.`); render(); }
};
document.querySelector('#engine-cancel').onclick = () => {
  cancelEngine();
  engineMessage('Engine paused. Resume when ready.');
};
render();
