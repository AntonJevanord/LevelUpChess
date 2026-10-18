/*! ffish-es6 0.7.10 is GPL-3.0. Corresponding source and license are included in this repository. */
import Module from 'ffish-es6';
import wasmBase64 from 'variant-wasm';
import variantConfig from './variants.ini';

const PROFILES = {
  chess: { variant: 'chess', cost: 0, label: 'Standard', description: 'Ordinary king moves and captures. Use this as the comparison for each experiment.' },
  'king-blue': { variant: 'king-blue', cost: 1, label: 'Blue', description: 'Ordinary king moves, plus capture-only jumps exactly two squares sideways.' },
  'king-orange': { variant: 'king-orange', cost: 2, label: 'Orange', description: 'Ordinary king moves, plus capture-only jumps exactly two squares horizontally or vertically.' },
  'king-purple': { variant: 'king-purple', cost: 3, label: 'Purple', description: 'Ordinary king moves, plus capture-only jumps exactly two squares horizontally, vertically, or diagonally.' },
};

const EXAMPLES = {
  start: { fen: null, note: 'All other pieces use standard chess rules. Play either side locally.' },
  'capture-white': { fen: 'k7/8/1p1p1p2/8/1p1K1p2/8/1p1p1p2/8 w - - 0 1', note: 'Select the white king on d4. Blue adds sideways captures; orange adds vertical captures; purple also adds diagonal captures.' },
  'capture-black': { fen: '8/2P1P1P1/8/2P1k1P1/8/2P1P1P1/8/7K b - - 0 1', note: 'Select the black king on e5. The same capture directions apply to both colors.' },
  'ladder-mate': { fen: 'R6k/R7/8/8/3Q4/8/8/K7 b - - 0 1', note: 'Black is checkmated at every level. The empty h6 square cannot be reached by a capture-only jump.' },
  'capture-escape': { fen: 'R6k/R7/7N/8/3Q4/8/8/K7 b - - 0 1', note: 'An unprotected white knight on h6 gives orange and purple a capture escape. Standard and blue remain checkmated.' },
  'knight-mate': { fen: '7k/5K2/8/8/5N2/8/8/8 w - - 0 1', note: 'At upgraded levels, Nf4–g6 is checkmate: the white king on f7 covers h7 with its added sideways attack. Standard mode draws this material.' },
  castle: { fen: '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1', note: 'Select the white king on e1. Standard castling rules still apply: no castling out of, through, or into check.' },
};

const SYMBOLS = { k: ['♔', '♚'], q: ['♕', '♛'], r: ['♖', '♜'], b: ['♗', '♝'], n: ['♘', '♞'], p: ['♙', '♟'] };
const PIECE_NAMES = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
const $ = selector => document.querySelector(selector);
const boardElement = $('#board');
const modules = new Map();
const state = { board: null, rules: null, profile: 'king-blue', position: 'start', selected: null, records: [], positionKeys: [], flipped: false, loading: true, generation: 0 };
const side = color => color === 'w' ? 'White' : 'Black';
const turn = () => state.board.fen().split(' ')[1];
const profile = () => PROFILES[state.profile];
const legalMoves = () => state.board.legalMoves().split(' ').filter(Boolean);

function sectionFor(variant) {
  // King movement tables are shared inside a module. Never load another
  // profile's king definition into the same instance, including the baseline.
  const sections = variantConfig.split(/(?=^\[)/m);
  const section = sections.find(text => text.startsWith(`[${variant}:`));
  if (!section) throw new Error('The selected king rules are missing.');
  return section.trimEnd() + '\n\n';
}

function rulesFor(id) {
  if (!modules.has(id)) {
    const promise = Module({ wasmBinary: Uint8Array.from(atob(wasmBase64), character => character.charCodeAt(0)) })
      .then(rules => {
        const { variant } = PROFILES[id];
        // Even the baseline needs this call: the module's variant registry is
        // initialized lazily by loadVariantConfig, not by Module itself.
        rules.loadVariantConfig(variant === 'chess' ? '' : sectionFor(variant));
        if (!rules.variants().split(' ').includes(variant)) throw new Error('The selected king rules could not be loaded.');
        return rules;
      }).catch(error => { modules.delete(id); throw error; });
    modules.set(id, promise);
  }
  return modules.get(id);
}

function piecesFor(fen) {
  const pieces = new Map();
  fen.split(' ')[0].split('/').forEach((rank, row) => {
    let file = 0;
    for (const token of rank) {
      if (/^[1-8]$/.test(token)) { file += Number(token); continue; }
      pieces.set('abcdefgh'[file++] + (8 - row), { type: token.toLowerCase(), color: token === token.toUpperCase() ? 'w' : 'b' });
    }
  });
  return pieces;
}

function positionKey(board) {
  const fields = board.fen().split(' ').slice(0, 4);
  if (fields[3] !== '-') {
    const pieces = piecesFor(board.fen());
    // An en passant marker distinguishes repetitions only if it changes the
    // legal moves. Pinned pawns and inert markers must not split one position.
    const capturable = board.legalMoves().split(' ').filter(Boolean).some(uci => {
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      return to === fields[3] && from[0] !== to[0] && !pieces.has(to)
        && pieces.get(from)?.type === 'p' && board.isCapture(uci);
    });
    if (!capturable) fields[3] = '-';
  }
  return fields.join(' ');
}

function checkedBoard(rules, variant, input) {
  const fen = input.trim().split(/\s+/).join(' ');
  if (!fen || rules.validateFen(fen, variant) !== 1) throw new Error('Invalid FEN. Include a legal position, active color, castling rights, en passant square, and move counters.');
  // An inactive king already in check means the supplied position could not
  // have followed a legal move. The engine validator does not catch every case.
  const fields = fen.split(' ');
  fields[1] = fields[1] === 'w' ? 'b' : 'w';
  fields[3] = '-';
  const inactive = new rules.Board(variant, fields.join(' '));
  try {
    if (inactive.isCheck()) throw new Error('Invalid FEN: the side that just moved has left its king in check.');
  } finally { inactive.delete(); }
  return new rules.Board(variant, fen);
}

function message(text = '', error = false) {
  $('#message').textContent = text;
  $('#message').classList.toggle('error', error);
}

function renderProfile(id) {
  document.body.dataset.level = id === 'chess' ? 'standard' : id.replace('king-', '');
  const selected = PROFILES[id];
  $('#level-badge').textContent = `${selected.label.toUpperCase()} · +${selected.cost}`;
  $('#rule-description').textContent = selected.description;
}

function updateDisabled() {
  const unavailable = state.loading || !state.board;
  boardElement.setAttribute('aria-busy', String(state.loading));
  for (const id of ['flip', 'new-game', 'promotion', 'fen', 'load-fen']) $(`#${id}`).disabled = unavailable;
  $('#undo').disabled = unavailable || !state.records.length;
  boardElement.querySelectorAll('button').forEach(button => { button.disabled = unavailable; });
}

async function loadExample() {
  const request = ++state.generation;
  const id = $('#level').value;
  const exampleId = $('#position').value;
  state.loading = true;
  renderProfile(id);
  updateDisabled();
  $('#status').textContent = 'Loading king rules…';
  message();
  try {
    const rules = await rulesFor(id);
    if (request !== state.generation) return;
    const variant = PROFILES[id].variant;
    const next = checkedBoard(rules, variant, EXAMPLES[exampleId].fen || rules.startingFen(variant));
    const positionKeys = [positionKey(next)];
    state.board?.delete();
    Object.assign(state, { board: next, rules, profile: id, position: exampleId, selected: null, records: [], positionKeys });
    $('#position-note').textContent = EXAMPLES[exampleId].note;
  } catch (error) {
    if (request !== state.generation) return;
    $('#level').value = state.profile;
    $('#position').value = state.position;
    renderProfile(state.profile);
    message(`Unable to load the king rules. ${error.message}`, true);
  } finally {
    if (request === state.generation) {
      state.loading = false;
      if (state.board) render();
      else $('#status').textContent = 'Rules unavailable';
      updateDisabled();
    }
  }
}

function isAddedKingCapture(uci, pieces) {
  if (!profile().cost || pieces.get(uci.slice(0, 2))?.type !== 'k' || !state.board.isCapture(uci)) return false;
  const files = Math.abs(uci.charCodeAt(0) - uci.charCodeAt(2));
  const ranks = Math.abs(Number(uci[1]) - Number(uci[3]));
  return Math.max(files, ranks) === 2 && (files === 0 || ranks === 0 || files === ranks);
}

function outcome() {
  const active = turn();
  if (state.board.numberLegalMoves() === 0) return {
    finished: true,
    status: state.board.isCheck() ? `${side(active === 'w' ? 'b' : 'w')} wins by checkmate` : 'Draw by stalemate',
  };
  // The library's ordinary-chess material heuristic does not account for
  // upgraded royal attacks: even king + knight can now deliver checkmate.
  // Use only the certain bare-kings draw for experimental profiles.
  const insufficient = profile().cost === 0 ? state.board.isInsufficientMaterial()
    : [...piecesFor(state.board.fen()).values()].every(piece => piece.type === 'k');
  if (insufficient) return { finished: true, status: 'Draw: insufficient material' };
  const current = state.positionKeys.at(-1);
  if (state.positionKeys.filter(key => key === current).length >= 3) return { finished: true, status: 'Draw by threefold repetition' };
  if (state.board.halfmoveClock() >= 100) return { finished: true, status: 'Draw by fifty-move rule' };
  return { finished: false, status: `${side(active)} to move${state.board.isCheck() ? ' · Check' : ''}` };
}

function finished() { return outcome().finished; }

function render(focusSquare) {
  const pieces = piecesFor(state.board.fen());
  const files = [...'abcdefgh'];
  const ranks = [...'87654321'];
  if (state.flipped) { files.reverse(); ranks.reverse(); }
  const moves = state.selected && !finished() ? legalMoves().filter(uci => uci.slice(0, 2) === state.selected) : [];
  const last = state.records.at(-1)?.uci;
  boardElement.replaceChildren();
  ranks.forEach((rank, row) => files.forEach((file, column) => {
    const square = file + rank;
    const piece = pieces.get(square);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `square ${(file.charCodeAt(0) - 97 + Number(rank)) % 2 === 0 ? 'dark' : 'light'}`;
    button.dataset.square = square;
    button.setAttribute('aria-label', `${square} ${piece ? `${side(piece.color)} ${PIECE_NAMES[piece.type]}` : 'empty'}`);
    button.setAttribute('aria-pressed', String(state.selected === square));
    if (state.selected === square) button.classList.add('selected');
    if (last && [last.slice(0, 2), last.slice(2, 4)].includes(square)) button.classList.add('last-move');
    if (piece?.type === 'k' && piece.color === turn() && state.board.isCheck()) button.classList.add('check');
    if (piece) {
      const icon = document.createElement('span');
      icon.className = `piece ${piece.color === 'w' ? 'white-piece' : 'black-piece'}${piece.type === 'k' && profile().cost ? ' upgraded' : ''}`;
      icon.textContent = SYMBOLS[piece.type]?.[piece.color === 'w' ? 0 : 1] || '?';
      icon.setAttribute('aria-hidden', 'true');
      button.append(icon);
      if (piece.type === 'k' && profile().cost) {
        const badge = document.createElement('span');
        badge.className = 'king-level';
        badge.textContent = `L${profile().cost}`;
        badge.setAttribute('aria-hidden', 'true');
        button.append(badge);
      }
    }
    const legal = moves.find(uci => uci.slice(2, 4) === square);
    if (legal) {
      const capture = state.board.isCapture(legal);
      const added = isAddedKingCapture(legal, pieces);
      const marker = document.createElement('span');
      marker.className = `${capture ? 'capture-marker' : 'move-marker'}${added ? ' extra-capture' : ''}`;
      marker.setAttribute('aria-hidden', 'true');
      button.dataset.move = added ? 'added-capture' : capture ? 'capture' : 'quiet';
      button.setAttribute('aria-label', `${button.getAttribute('aria-label')}, ${added ? 'added king capture' : capture ? 'legal capture' : 'legal move'}`);
      button.append(marker);
    }
    for (const [show, text, position] of [[column === 0, rank, 'rank'], [row === 7, file, 'file']]) {
      if (!show) continue;
      const label = document.createElement('span');
      label.className = `coordinate ${position}`;
      label.textContent = text;
      label.setAttribute('aria-hidden', 'true');
      button.append(label);
    }
    button.addEventListener('click', () => selectSquare(square));
    button.addEventListener('keydown', event => {
      const delta = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[event.key];
      if (!delta) return;
      event.preventDefault();
      const targetFile = files[column + delta[1]];
      const targetRank = ranks[row + delta[0]];
      if (targetFile && targetRank) boardElement.querySelector(`[data-square="${targetFile}${targetRank}"]`)?.focus();
    });
    boardElement.append(button);
  }));
  $('#status').textContent = outcome().status;
  $('#hint').textContent = finished() ? 'Choose another example, start a new game, or undo a move to keep exploring.' : state.selected ? `${side(turn())} ${PIECE_NAMES[pieces.get(state.selected).type]} on ${state.selected}. Choose a highlighted square.` : 'Select a piece to see its legal moves. Dashed purple rings mark added king captures.';
  $('#fen').value = state.board.fen();
  $('#history-empty').hidden = state.records.length > 0;
  $('#history').replaceChildren(...state.records.map(record => {
    const item = document.createElement('li');
    const number = document.createElement('span');
    number.className = 'move-number';
    number.textContent = `${record.number}${record.color === 'w' ? '.' : '…'}`;
    const san = document.createElement('span');
    san.textContent = record.san;
    item.append(number, san);
    return item;
  }));
  updateDisabled();
  if (focusSquare) boardElement.querySelector(`[data-square="${focusSquare}"]`)?.focus();
}

function selectSquare(square) {
  if (state.loading || !state.board || finished()) return;
  const pieces = piecesFor(state.board.fen());
  if (state.selected === square) { state.selected = null; render(square); return; }
  if (state.selected) {
    const candidates = legalMoves().filter(uci => uci.slice(0, 2) === state.selected && uci.slice(2, 4) === square);
    const uci = candidates.find(move => !move[4] || move[4] === $('#promotion').value);
    if (uci) {
      const fields = state.board.fen().split(' ');
      const record = { uci, san: state.board.sanMove(uci), color: fields[1], number: fields[5] };
      if (!state.board.push(uci)) { message('The rules rejected that move. Select another square.', true); return; }
      state.records.push(record);
      state.positionKeys.push(positionKey(state.board));
      state.selected = null;
      message();
      render(square);
      return;
    }
  }
  state.selected = pieces.get(square)?.color === turn() ? square : null;
  render(square);
}

$('#level').addEventListener('change', loadExample);
$('#position').addEventListener('change', loadExample);
$('#undo').addEventListener('click', () => {
  if (state.loading || !state.records.length) return;
  state.board.pop();
  state.records.pop();
  state.positionKeys.pop();
  state.selected = null;
  message();
  render();
});
$('#flip').addEventListener('click', () => { state.flipped = !state.flipped; render(); });
$('#new-game').addEventListener('click', () => { $('#position').value = 'start'; loadExample(); });
$('#load-fen').addEventListener('click', () => {
  if (state.loading || !state.board) return;
  try {
    const next = checkedBoard(state.rules, profile().variant, $('#fen').value);
    const positionKeys = [positionKey(next)];
    state.board.delete();
    state.board = next;
    state.records = [];
    state.positionKeys = positionKeys;
    state.selected = null;
    message('Position loaded. Move history has been cleared.');
    $('#position-note').textContent = 'Custom FEN loaded. Changing the level or example restarts the selected example.';
    render();
  } catch (error) { message(error.message, true); }
});

loadExample();
