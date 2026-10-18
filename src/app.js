import { Chess } from 'chess.js';
import { ChessClock, CLOCK_CONTROLS, formatClock } from './clock';
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
const clock = new ChessClock();
const timeControl = document.querySelector('#time-control');
const clockTop = document.querySelector('#black-clock');
const clockBottom = document.querySelector('#white-clock');
const clockToggle = document.querySelector('#clock-toggle');
let clockNotice = '';
let handledFlag = null;

const isTimed = () => clock.control !== 'none';
const isFinished = () => game.isGameOver() || Boolean(clock.expired);
const canPlay = () => !isTimed() || clock.running;

function timeoutResult() {
  if (!clock.expired) return null;
  const winner = clock.expired === 'w' ? 'b' : 'w';
  const canMate = game.board().flat().some(piece => piece?.color === winner && piece.type !== 'k');
  return canMate ? { result: winner === 'w' ? '1-0' : '0-1', status: `${side(winner)} wins on time` } : { result: '1/2-1/2', status: 'Draw on time: opponent has only a king' };
}
function updateClocks() {
  for (const [element, color] of [[clockTop, flipped ? 'w' : 'b'], [clockBottom, flipped ? 'b' : 'w']]) {
    element.id = `${color === 'w' ? 'white' : 'black'}-clock`;
    element.hidden = !isTimed();
    element.textContent = formatClock(clock.remaining[color]);
    element.setAttribute('aria-label', `${side(color)} clock`);
    element.classList.toggle('active', clock.running && clock.active === color);
    element.classList.toggle('flagged', clock.expired === color);
  }
  clockToggle.disabled = !isTimed() || isFinished();
  clockToggle.textContent = clock.running ? 'Pause clock' : clock.started ? 'Resume clock' : 'Start clock';
  const message = !isTimed() ? 'Untimed. No time limit.' : clock.expired ? 'Clock finished.' : game.isGameOver() ? 'Game finished. Clocks stopped.' : clock.running ? `${side(clock.active)} clock running (${CLOCK_CONTROLS[clock.control].label}).` : clockNotice || (clock.started ? 'Clocks paused. Resume clock to continue.' : 'Ready. Start clock to begin.');
  const status = document.querySelector('#clock-status');
  const text = message + (timeControl.value !== clock.control ? ' New selection applies to the next game.' : '');
  if (status.textContent !== text) status.textContent = text;
}
function settleClock() {
  clock.tick();
  if (!clock.expired) handledFlag = null;
  if (clock.expired && handledFlag !== clock.expired) {
    handledFlag = clock.expired;
    cancelEngine();
    selected = null;
    pending = null;
    promotion.close();
    const outcome = timeoutResult();
    game.setHeader('Result', outcome.result);
    game.setHeader('Termination', 'time forfeit');
    if (opponent.value === 'engine') engineMessage('Game finished on time.');
    render();
  }
  updateClocks();
  return !clock.expired;
}
function pauseClocks(message = '') {
  settleClock();
  clock.pause();
  clockNotice = message;
  updateClocks();
}


function playMove(move) {
  if (!settleClock() || !canPlay()) return null;
  const color = game.turn();
  const result = game.move(move);
  if (!clock.completeMove(color, game.turn(), game.isGameOver())) {
    game.undo();
    // completeMove can detect a flag between validating and committing the move.
    cancelEngine();
    selected = null;
    pending = null;
    promotion.close();
    const outcome = timeoutResult();
    handledFlag = clock.expired;
    if (outcome) { game.setHeader('Result', outcome.result); game.setHeader('Termination', 'time forfeit'); }
    render();
    return null;
  }
  game.setHeader('Result', '*');
  game.removeHeader('Termination');
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
    pauseClocks('Engine connection failed. Clocks paused.');
    engineMessage(error.message === 'Failed to fetch' ? 'Cannot reach the engine bridge. Run npm.cmd start and open its printed address.' : error.message);
  }
}

async function maybeEngineMove() {
  if (opponent.value !== 'engine' || !connected || engineBusy || enginePaused || pending || isFinished() || !canPlay() || game.turn() === humanSide.value) return;
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
    if (!playMove({ from: data.move.slice(0, 2), to: data.move.slice(2, 4), promotion: data.move[4] })) return;
    engineBusy = false;
    engineMessage(`${engineName} connected. Your move.`);
    render();
  } catch (error) {
    if (request !== generation) return;
    engineBusy = false;
    enginePaused = true;
    pauseClocks('Engine error. Clocks paused.');
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
  if (clock.expired) status = timeoutResult().status;
  document.querySelector('#status').textContent = status;
  document.querySelector('#hint').textContent = isFinished() ? 'Start a new game or undo a move to keep playing.' : !canPlay() ? 'Start or resume the clock to continue playing.' : selected ? `${side(game.turn())} ${names[game.get(selected).type]} on ${selected}. Choose a highlighted square.` : 'Select a piece to see its legal moves.';
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
  updateClocks();
  void maybeEngineMove();
}

function selectSquare(square) {
  settleClock();
  if (isFinished() || !canPlay() || pending || (opponent.value === 'engine' && game.turn() !== humanSide.value)) return;
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
  pauseClocks();
  game.undo();
  if (!clock.undo()) clock.reset('none', game.turn());
  game.setHeader('Result', '*');
  if (opponent.value === 'engine' && game.turn() !== humanSide.value && game.history().length) { game.undo(); if (!clock.undo()) clock.reset('none', game.turn()); }
  game.removeHeader('Termination');
  clockNotice = 'Clocks paused after undo. Resume clock when ready.';
  selected = null;
  if (opponent.value === 'engine') engineMessage('Engine paused after undo. Resume when ready.');
  render();
};
document.querySelector('#flip').onclick = () => { flipped = !flipped; render(); };
function newGame() {
  cancelEngine();
  enginePaused = false;
  game.reset();
  clock.reset(timeControl.value, game.turn());
  clockNotice = '';
  handledFlag = null;
  selected = null;
  pending = null;
  promotion.close();
  restart.close();
  if (opponent.value === 'engine') engineMessage(connected ? `${engineName} connected.` : 'Connect the engine to begin.');
  render();
}
document.querySelector('#new-game').onclick = () => { if (game.history().length || engineBusy || clock.started) restart.showModal(); else newGame(); };
document.querySelector('#cancel-restart').onclick = () => restart.close();
document.querySelector('#confirm-restart').onclick = newGame;
opponent.onchange = () => {
  pauseClocks();
  cancelEngine();
  selected = null;
  document.querySelector('#engine-settings').hidden = opponent.value !== 'engine';
  if (opponent.value === 'engine') { flipped = humanSide.value === 'b'; void connectEngine(); }
  render();
};
humanSide.onchange = () => {
  pauseClocks();
  cancelEngine();
  enginePaused = false;
  selected = null;
  flipped = humanSide.value === 'b';
  if (!connected) void connectEngine();
  else engineMessage(`${engineName} connected.`);
  render();
};
difficulty.onchange = () => {
  pauseClocks();
  cancelEngine();
  enginePaused = false;
  engineMessage(connected ? `${engineName} connected.` : 'Connect the engine to begin.');
  render();
};
document.querySelector('#engine-retry').onclick = () => {
  if (!connected) void connectEngine();
  else { enginePaused = false; engineMessage(isTimed() && !clock.running ? 'Engine ready. Start or resume clock to continue.' : `${engineName} connected.`); render(); }
};
document.querySelector('#engine-cancel').onclick = () => {
  pauseClocks('Engine paused. Resume clock when ready.');
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
  if (candidate.clock) clock.restore(candidate.clock, game.history().length);
  else clock.reset('none', game.turn());
  handledFlag = null;
  if (clock.expired) {
    const outcome = timeoutResult();
    game.setHeader('Result', outcome.result);
    game.setHeader('Termination', 'time forfeit');
    handledFlag = clock.expired;
  }
  timeControl.value = clock.control;
  clockNotice = 'Game loaded. Start or resume clock when ready.';
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
  if (game.history().length || engineBusy || clock.started || pending || game.fen() !== new Chess().fen()) {
    replacement = candidate;
    importDialog.close();
    replaceDialog.showModal();
  } else applyGame(candidate);
}
document.querySelector('#save-game').onclick = () => {
  try {
    settleClock();
    const clockState = clock.snapshot();
    settleClock();
    const save = makeSave(game, { opponent: opponent.value, humanSide: humanSide.value, difficulty: difficulty.value, flipped }, clockState);
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
  settleClock();
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
timeControl.onchange = updateClocks;
clockToggle.onclick = () => {
  settleClock();
  if (isFinished() || !isTimed()) return;
  if (clock.running) {
    pauseClocks();
    cancelEngine();
    if (opponent.value === 'engine') engineMessage('Engine paused with the clock.');
  } else {
    if (opponent.value === 'engine' && !connected) {
      clockNotice = 'Connect the engine before starting the clock.';
      updateClocks();
      return;
    }
    clockNotice = '';
    clock.start(game.turn());
    enginePaused = false;
  }
  selected = null;
  render();
};
setInterval(settleClock, 100);
refreshSaveAvailability();
render();
