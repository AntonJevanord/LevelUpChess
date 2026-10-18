import { Chess } from 'chess.js';
import { SAVE_KEY, MAX_PGN_SIZE, parsePgn, exportPgn, makeSave, parseSave } from './saved-games';

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

function playMove(move) {
  const result = game.move(move);
  game.setHeader('Result', '*');
  return result;
}

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
    playMove({ from: data.move.slice(0, 2), to: data.move.slice(2, 4), promotion: data.move[4] });
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
  let item;
  for (const move of history) {
    if (move.color === 'w' || !item) {
      item = document.createElement('li');
      item.value = Number(move.before.split(' ')[5]);
      if (move.color === 'b') {
        const placeholder = document.createElement('span');
        placeholder.textContent = '…';
        item.append(placeholder);
      }
      list.append(item);
    }
    const text = document.createElement('span');
    text.textContent = move.san;
    item.append(text);
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
        button.onclick = () => { playMove({ ...pending, promotion: type }); pending = null; selected = null; promotion.close(); render(square); };
        options.append(button);
      }
      promotion.showModal();
      return;
    }
    playMove({ from: selected, to: square });
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
  game.setHeader('Result', '*');
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

const saveStatus = document.querySelector('#save-status');
const importDialog = document.querySelector('#import-dialog');
const replaceDialog = document.querySelector('#replace-dialog');
const pgnText = document.querySelector('#pgn-text');
const pgnFile = document.querySelector('#pgn-file');
const importError = document.querySelector('#import-error');
let replacement = null;
let fileGeneration = 0;

function refreshSaveAvailability() {
  try { document.querySelector('#load-game').disabled = !localStorage.getItem(SAVE_KEY); }
  catch { saveStatus.textContent = 'Browser storage is unavailable. Use PGN export for a backup.'; }
}
function applyGame(candidate) {
  cancelEngine();
  // Validation happens in a separate Chess instance before this mutates the board.
  game.loadPgn(candidate.game.pgn());
  selected = null;
  pending = null;
  promotion.close();
  restart.close();
  if (candidate.settings) {
    opponent.value = candidate.settings.opponent;
    humanSide.value = candidate.settings.humanSide;
    difficulty.value = candidate.settings.difficulty;
    flipped = candidate.settings.flipped;
  }
  document.querySelector('#engine-settings').hidden = opponent.value !== 'engine';
  if (opponent.value === 'engine') engineMessage('Game loaded. Engine paused; connect or resume when ready.');
  importDialog.close();
  replacement = null;
  saveStatus.textContent = 'Game loaded. The browser save slot has not changed.';
  render();
}
function proposeGame(candidate) {
  if (game.history().length || engineBusy || pending || game.fen() !== new Chess().fen()) {
    replacement = candidate;
    importDialog.close();
    replaceDialog.showModal();
  } else applyGame(candidate);
}
document.querySelector('#save-game').onclick = () => {
  try {
    const save = makeSave(game, { opponent: opponent.value, humanSide: humanSide.value, difficulty: difficulty.value, flipped });
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    saveStatus.textContent = `Saved ${game.history().length} half-moves in this browser. Export PGN for a portable backup.`;
    refreshSaveAvailability();
  } catch { saveStatus.textContent = 'Could not save in this browser. Use PGN export instead.'; }
};
document.querySelector('#load-game').onclick = () => {
  try {
    const text = localStorage.getItem(SAVE_KEY);
    if (!text) throw new Error('No saved game was found in this browser.');
    proposeGame(parseSave(text));
  } catch (error) { saveStatus.textContent = error.message; }
};
document.querySelector('#export-pgn').onclick = () => {
  const url = URL.createObjectURL(new Blob([exportPgn(game)], { type: 'application/x-chess-pgn;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'levelup-chess.pgn';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  saveStatus.textContent = 'PGN download requested. It includes the board and move history, not play settings.';
};
document.querySelector('#open-import').onclick = () => {
  fileGeneration++;
  pgnText.value = '';
  pgnFile.value = '';
  importError.textContent = '';
  importDialog.showModal();
};
document.querySelector('#cancel-import').onclick = () => { fileGeneration++; importDialog.close(); };
importDialog.addEventListener('cancel', () => { fileGeneration++; });
pgnFile.onchange = async () => {
  const request = ++fileGeneration;
  const file = pgnFile.files[0];
  if (!file) return;
  pgnText.value = '';
  if (file.size > MAX_PGN_SIZE) { importError.textContent = 'Choose a PGN file up to 256 KB.'; return; }
  try {
    const text = await file.text();
    if (request !== fileGeneration) return;
    pgnText.value = text;
    importError.textContent = '';
  } catch { if (request === fileGeneration) importError.textContent = 'The file could not be read. Try pasting its PGN instead.'; }
};
pgnText.addEventListener('input', () => { fileGeneration++; importError.textContent = ''; });
document.querySelector('#confirm-import').onclick = () => {
  try {
    const candidate = { game: parsePgn(pgnText.value) };
    fileGeneration++;
    proposeGame(candidate);
  } catch (error) { importError.textContent = error.message; }
};
document.querySelector('#cancel-replace').onclick = () => { replacement = null; replaceDialog.close(); };
replaceDialog.addEventListener('cancel', () => { replacement = null; });
document.querySelector('#confirm-replace').onclick = () => {
  if (!replacement) return;
  const candidate = replacement;
  replaceDialog.close();
  applyGame(candidate);
};
refreshSaveAvailability();
render();
