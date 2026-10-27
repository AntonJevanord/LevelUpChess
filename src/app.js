import { Chess } from 'chess.js';
import { VariantGame, VARIANT, PIECE_VARIANT, CURRENT_VARIANT, isPieceVariant, SUPPORTED_VARIANTS, initVariantRules } from './variant-game';
import { pieceInfo, KNIGHT_LEVELS, KNIGHT_SLOTS, PIECE_LEVELS, PIECE_SLOTS, DEFAULT_PIECE_LEVELS, MAX_PIECE_BUDGET } from './piece-catalog';
import { setupFromLevels, loadInitialSetup } from './knight-setup';
import { pieceSetupFromLevels, loadPieceSetup } from './piece-setup';
import { PLAYABLE_LIBRARIES, DESIGN_OPTIONS, getDesignOptions, getPlayableProfile, isExperimentalVariant, pieceInfoForProfile } from './design-options';
import { designSetupFromChoices, loadDesignSetup, designSlots, designBudgetLimit } from './design-setup';
import { ChessClock, CLOCK_CONTROLS, formatClock } from './clock';
import { SAVE_KEY, MAX_PGN_SIZE, parsePgn, exportPgn, makeSave, parseSave } from './saved-games';

let game = new Chess();
const board = document.querySelector('#board');
const promotion = document.querySelector('#promotion');
const restart = document.querySelector('#restart');
let selected = null;
let flipped = false;
let pending = null;
let editingSetup = false;
let setupSquare = null;
let selectedDrop = null;
const ALL_DESIGN_SLOTS = [...PIECE_SLOTS, { square: 'e1', color: 'w', family: 'king' }, { square: 'e8', color: 'b', family: 'king' }];
const side = color => color === 'w' ? 'White' : 'Black';
const opponent = document.querySelector('#opponent');
const humanSide = document.querySelector('#human-side');
const difficulty = document.querySelector('#difficulty');
const gameMode = document.querySelector('#game-mode');
const upgradeBudget = document.querySelector('#upgrade-budget');
const upgradeStatus = document.querySelector('#upgrade-status');
const upgradeSquares = KNIGHT_SLOTS.map(slot => slot.square);
const pieceBudget = document.querySelector('#piece-upgrade-budget');
const pieceStatus = document.querySelector('#piece-upgrade-status');
const pieceFamily = document.querySelector('#piece-family');
const experimentalBudget = document.querySelector('#experimental-budget');
const experimentalStatus = document.querySelector('#experimental-status');
const experimentalFamily = document.querySelector('#experimental-family');
const armyResetSettings = document.querySelector('#army-reset-settings');
const armyResetStatus = document.querySelector('#army-reset-status');
const experimentalOption = gameMode.querySelector('option[value=levelup-experimental]');
experimentalOption.replaceWith(...[...PLAYABLE_LIBRARIES].sort((a, b) => Number(b.id.startsWith('v16-')) - Number(a.id.startsWith('v16-'))).map(library => {
  const option = document.createElement('option');
  option.value = library.variant;
  option.textContent = `${library.id.startsWith('v16-') ? 'Version 16' : 'Archive'} · ${library.name}`;
  return option;
}));
const designOptions = new Map(DESIGN_OPTIONS.map(option => [option.id, option]));
const currentDesignOption = id => getDesignOptions(game.variant).find(option => option.id === id) || designOptions.get(id);
const isExperimental = isExperimentalVariant;
const infoFor = type => game.profile ? pieceInfoForProfile(game.profile, type) : pieceInfo(type);
const designFor = type => game.profile?.definitionsByLetter[type];
const setupProfile = () => getPlayableProfile(gameMode.value);
const usesBoardSetup = () => Boolean(setupProfile()?.roles.reserveTypes?.length);
function designCosts(choices) {
  const spent = color => designSlots(setupProfile()).filter(slot => slot.color === color).reduce((total, slot) => total + (designOptions.get(choices[slot.square])?.level || 0), 0);
  return { white: spent('w'), black: spent('b') };
}
function displaySan(san) {
  if (!game.profile || !/^[A-Z]/.test(san) || /^O-O/.test(san)) return san;
  const definition = designFor(san[0]?.toLowerCase());
  if (!definition) return san;
  return `${({ pawn: 'P', knight: 'N', bishop: 'B', rook: 'R', queen: 'Q', king: 'G' })[definition.family]}${definition.level}${san.slice(1)}`;
}
for (const family of [...Object.keys(PIECE_LEVELS), 'king']) {
  const group = document.createElement('div');
  group.className = 'experimental-choices';
  group.dataset.family = family;
  for (const slot of ALL_DESIGN_SLOTS.filter(slot => slot.family === family)) {
    const field = document.createElement('div');
    const label = document.createElement('label');
    const select = document.createElement('select');
    const description = document.createElement('p');
    select.id = `experimental-upgrade-${slot.square}`;
    label.htmlFor = select.id;
    label.textContent = `${side(slot.color)} ${slot.square} ${family}`;
    description.id = `experimental-description-${slot.square}`;
    description.className = 'design-description';
    select.setAttribute('aria-describedby', description.id);
    const standard = document.createElement('option');
    standard.value = '';
    standard.textContent = '0 · Standard';
    select.append(standard);
    for (const design of DESIGN_OPTIONS.filter(option => option.family === family && option.status !== 'retired')) {
      const option = document.createElement('option');
      option.value = design.id;
      const status = design.status === 'parked' ? 'parked reference' : design.status;
      option.textContent = `L${design.level} · ${design.name} · ${status}`;
      select.append(option);
    }
    select.onchange = updateSetup;
    field.append(label, select, description);
    group.append(field);
  }
  document.querySelector('#experimental-choices').append(group);
}
let selectedLibrary;
function refreshExperimentalOptions() {
  if (!isExperimental(gameMode.value) || selectedLibrary === gameMode.value) return;
  selectedLibrary = gameMode.value;
  const options = getDesignOptions(selectedLibrary);
  for (const slot of ALL_DESIGN_SLOTS) {
    const select = document.querySelector(`#experimental-upgrade-${slot.square}`);
    const previous = select.value;
    const standard = document.createElement('option');
    standard.value = '';
    standard.textContent = '0 · Standard';
    const candidates = options.filter(option => option.family === slot.family).map(design => {
      const option = document.createElement('option');
      option.value = design.id;
      option.textContent = `L${design.level} · ${design.name} · ${design.status === 'parked' ? 'parked reference' : design.status}`;
      return option;
    });
    select.replaceChildren(standard, ...candidates);
    select.value = candidates.some(option => option.value === previous) ? previous : '';
  }
}
function updateExperimentalFamily() {
  for (const group of document.querySelectorAll('.experimental-choices')) group.hidden = group.dataset.family !== experimentalFamily.value;
  for (const slot of ALL_DESIGN_SLOTS) {
    const design = designOptions.get(document.querySelector(`#experimental-upgrade-${slot.square}`).value);
    const description = document.querySelector(`#experimental-description-${slot.square}`);
    description.textContent = design ? `${design.description}${design.status === 'parked' ? ' Parked after balance screening; available as a playtest reference.' : ''}` : `Ordinary ${slot.family} movement.`;
    description.classList.toggle('parked-design', design?.status === 'parked');
  }
}
const familyRules = {
  pawn: ['Blue: jump 1 or 2 forward, or 3 from the initial region; capture one diagonal forward.', 'Orange: move or capture one forward or diagonally forward; initial two-step needs a clear path.', 'Purple: move along any clear rook line; capture along any clear bishop line. All pawn levels promote to Q/R/B/N on the last rank.'],
  knight: ['Blue: knight moves plus one empty orthogonal step.', 'Orange: knight moves plus a two-square sideways jump.', 'Purple: keep the knight and add a piece that moves or captures 1 or 2 orthogonally. Two-square moves jump. Extras start on b3/g3 or b6/g6.'],
  bishop: ['Blue: bishop moves plus one empty orthogonal step.', 'Orange: bishop moves plus capture-only knight jumps two squares forward and one sideways.', 'Purple: bishop moves plus vertical rook moves. Replaces the starting bishop.'],
  queen: ['Blue: normal queen moves plus quiet knight (1,2), camel (1,3), and zebra (2,3) jumps while on your home two ranks.', 'Orange: queen moves plus knight-shaped jumps into empty squares. Captures and attacks still follow queen lines.', 'Purple: queen moves plus knight jumps, including captures.'],
  rook: ['Blue: normal rook moves plus quiet two-square orthogonal jumps while on your home two ranks.', 'Orange: normal rook moves plus captures across exactly one intervening piece, in any rook direction.', 'Purple: normal rook moves plus jump-captures anywhere within two squares, including diagonals. These extra jumps require an enemy on the destination.', 'Upgraded rooks can castle with their royal king under the usual rules.'],
};
for (const family of Object.keys(PIECE_LEVELS)) {
  const group = document.createElement('div');
  group.className = 'settings-row piece-choices';
  group.dataset.family = family;
  for (const slot of PIECE_SLOTS.filter(slot => slot.family === family)) {
    const field = document.createElement('div');
    const label = document.createElement('label');
    const select = document.createElement('select');
    select.id = `piece-upgrade-${slot.square}`;
    label.htmlFor = select.id;
    label.textContent = `${side(slot.color)} ${slot.square} ${family}`;
    PIECE_LEVELS[family].forEach((type, level) => {
      if (!type) return;
      const option = document.createElement('option');
      option.value = String(level);
      option.textContent = `${level} · ${['Standard', 'Blue', 'Orange', 'Purple'][level]}`;
      option.selected = level === DEFAULT_PIECE_LEVELS[slot.square];
      select.append(option);
    });
    select.onchange = updateSetup;
    field.append(label, select);
    group.append(field);
  }
  document.querySelector('#piece-upgrade-choices').append(group);
}
function updateFamily() {
  for (const group of document.querySelectorAll('.piece-choices')) group.hidden = group.dataset.family !== pieceFamily.value;
  const list = document.querySelector('#piece-upgrade-rules');
  list.replaceChildren(...familyRules[pieceFamily.value].map(text => {
    const item = document.createElement('li');
    item.textContent = text;
    return item;
  }));
}
let replacementGeneration = 0;
let buildingGame = false;
let activeBudget = 2;
function setupChoice() {
  if (isExperimental(gameMode.value)) {
    const choices = Object.fromEntries(designSlots(setupProfile()).map(slot => [slot.square, document.querySelector(`#experimental-upgrade-${slot.square}`).value]));
    return { choices, levels: choices, ...designCosts(choices), budget: Number(experimentalBudget.value) };
  }
  const current = isPieceVariant(gameMode.value);
  const slots = current ? PIECE_SLOTS : KNIGHT_SLOTS;
  const prefix = current ? 'piece-upgrade' : 'upgrade';
  const levels = Object.fromEntries(slots.map(slot => [slot.square, Number(document.querySelector(`#${prefix}-${slot.square}`).value)]));
  const cost = slot => pieceInfo((current ? PIECE_LEVELS[slot.family] : KNIGHT_LEVELS)[levels[slot.square]])?.cost || 0;
  const white = slots.filter(slot => slot.color === 'w').reduce((total, slot) => total + cost(slot), 0);
  const black = slots.filter(slot => slot.color === 'b').reduce((total, slot) => total + cost(slot), 0);
  return { levels, white, black, budget: Number((current ? pieceBudget : upgradeBudget).value) };
}
function updateSetup() {
  refreshExperimentalOptions();
  document.querySelector('#upgrade-settings').hidden = gameMode.value !== VARIANT;
  document.querySelector('#piece-upgrade-settings').hidden = !isPieceVariant(gameMode.value);
  document.querySelector('#experimental-settings').hidden = !isExperimental(gameMode.value);
  const boardSetup = usesBoardSetup();
  if (!boardSetup) {
    editingSetup = false;
    setupSquare = null;
  }
  document.querySelector('#setup-toolbar').hidden = !boardSetup;
  document.querySelector('#legacy-design-controls').hidden = boardSetup;
  document.querySelector('#king-grant-costs').hidden = !boardSetup;
  document.querySelector('#workshop-palette').hidden = !boardSetup;
  document.querySelector('#workshop-palette-help').hidden = !boardSetup;
  document.querySelector('#archive-palette').hidden = boardSetup;
  document.querySelector('#experimental-library-help').textContent = boardSetup ? 'Each workshop shares Vanguard, Unicorn, Cruisader and Amazon, plus king grants. Other designs and prices are provisional.' : 'Choose named alternatives for the next game. Shared selections carry between libraries; unavailable choices reset.';
  const experimentalLimit = designBudgetLimit(setupProfile());
  experimentalBudget.max = String(experimentalLimit);
  document.querySelector('label[for=experimental-budget]').textContent = `Budget per side (1–${experimentalLimit})`;
  document.querySelector('#experimental-help').textContent = boardSetup
    ? 'Click a piece, choose an upgrade, then Start game. King purchases grant a nonroyal reserve piece; the royal king stays. Drop on an empty square in your own half, without giving check. Captures do not refill reserves.'
    : 'Choices across all families apply to your next new game. Pair purchases cost their level once. Added pieces push your pawns forward within your half. Kings remain ordinary and royal.';
  armyResetSettings.hidden = !SUPPORTED_VARIANTS.includes(gameMode.value);
  armyResetStatus.textContent = '';
  const oldRules = gameMode.value === PIECE_VARIANT;
  const maxBudget = oldRules ? 39 : MAX_PIECE_BUDGET;
  pieceBudget.max = String(maxBudget);
  document.querySelector('label[for=piece-upgrade-budget]').textContent = `Budget per side (1–${maxBudget})`;
  for (const slot of PIECE_SLOTS) {
    const select = document.querySelector(`#piece-upgrade-${slot.square}`);
    select.disabled = oldRules && slot.family === 'rook';
    for (const option of select.options) option.disabled = oldRules && slot.family === 'queen' && option.value === '1';
    if (select.disabled || select.selectedOptions[0]?.disabled) select.value = '0';
  }
  pieceFamily.querySelector('option[value=rook]').disabled = oldRules;
  if (oldRules && pieceFamily.value === 'rook') pieceFamily.value = 'bishop';
  updateFamily();
  updateExperimentalFamily();
  const { white, black, budget } = setupChoice();
  const status = isExperimental(gameMode.value) ? experimentalStatus : isPieceVariant(gameMode.value) ? pieceStatus : upgradeStatus;
  const budgetLimit = isExperimental(gameMode.value) ? experimentalLimit : isPieceVariant(gameMode.value) ? maxBudget : 6;
  const validBudget = Number.isInteger(budget) && budget >= 1 && budget <= budgetLimit;
  const valid = validBudget && white <= budget && black <= budget;
  status.classList.toggle('error', !valid);
  status.textContent = !validBudget ? `Choose a whole-number budget from 1 to ${budgetLimit}.` : valid ? `White ${white}/${budget} · Black ${black}/${budget} upgrade points.` : `Budget exceeded: White ${white}/${budget} · Black ${black}/${budget}. Reduce upgrades before starting a new game.`;
  if (editingSetup) render();
  return !SUPPORTED_VARIANTS.includes(gameMode.value) || valid;
}

function clearArmySelections(color) {
  if (!SUPPORTED_VARIANTS.includes(gameMode.value)) return;
  const experimental = isExperimental(gameMode.value);
  const current = isPieceVariant(gameMode.value);
  const slots = experimental ? designSlots(setupProfile()) : current ? PIECE_SLOTS : KNIGHT_SLOTS;
  const prefix = experimental ? 'experimental-upgrade' : current ? 'piece-upgrade' : 'upgrade';
  for (const slot of slots.filter(slot => !color || slot.color === color)) {
    document.querySelector(`#${prefix}-${slot.square}`).value = experimental ? '' : '0';
  }
  updateSetup();
  armyResetStatus.textContent = `${color ? side(color) + ' upgrades' : 'Both armies’ upgrades'} cleared. Choose your army, then start a New game to reset the board.`;
}
document.querySelector('#clear-white-army').onclick = () => clearArmySelections('w');
document.querySelector('#clear-black-army').onclick = () => clearArmySelections('b');
document.querySelector('#clear-both-armies').onclick = () => clearArmySelections();

function setSetupEditing(value) {
  editingSetup = value && usesBoardSetup();
  setupSquare = null;
  selected = null;
  selectedDrop = null;
  if (editingSetup) {
    pauseClocks('Army setup. The current game is paused.');
    cancelEngine();
    if (opponent.value === 'engine') engineMessage('Engine paused during army setup. Resume when ready.');
  }
  render();
}
document.querySelector('#setup-mode').onclick = () => setSetupEditing(!editingSetup);

// A tall setup panel must scroll far enough to expose the board's bottom rank.
// Measure the entire column so toolbars, clocks and wrapping reserves count too.
const boardArea = document.querySelector('.board-area');
function updateBoardStickyOffset() {
  boardArea.style.setProperty('--board-sticky-top', `${Math.min(18, window.innerHeight - boardArea.offsetHeight - 18)}px`);
}
new ResizeObserver(updateBoardStickyOffset).observe(boardArea);
window.addEventListener('resize', updateBoardStickyOffset);
updateBoardStickyOffset();

function renderSetupPicker() {
  const panel = document.querySelector('#setup-picker');
  panel.hidden = !editingSetup;
  const toolbar = document.querySelector('#setup-mode');
  toolbar.setAttribute('aria-pressed', String(editingSetup));
  toolbar.textContent = editingSetup ? 'Return to game' : 'Edit armies';
  document.querySelector('#setup-instructions').textContent = editingSetup ? 'Click a starting piece. Changes apply when you start a game.' : 'Edit your selections for the next game.';
  document.querySelector('#new-game').textContent = editingSetup ? 'Start game' : 'New game';
  document.querySelector('#board').classList.toggle('setup-board', editingSetup);
  document.querySelector('#save-game').disabled = editingSetup;
  if (!editingSetup) return;
  const slot = designSlots(setupProfile()).find(slot => slot.square === setupSquare);
  document.querySelector('#setup-piece-title').textContent = slot ? `${side(slot.color)} ${slot.family} · ${slot.square}` : 'Choose a piece';
  document.querySelector('#setup-picker-hint').textContent = slot?.family === 'king'
    ? 'Your royal king stays and keeps castling. The guard starts in reserve: drop on an empty square in your half, without giving check.'
    : slot ? 'Choose an upgrade or return this piece to standard.' : 'Click a starting piece on the board to see its upgrades.';
  const list = document.querySelector('#setup-upgrades');
  list.replaceChildren();
  if (!slot) return;
  const select = document.querySelector(`#experimental-upgrade-${slot.square}`);
  const primaryAccent = option => ['green', 'yellow', 'red'].includes(option.accent) ? 0 : 1;
  const choices = [{ id: '', level: 0, name: slot.family === 'king' ? 'No reserve grant' : `Standard ${slot.family}`, description: slot.family === 'king' ? 'Keep your ordinary royal king, without a reserve purchase.' : `Ordinary ${slot.family} movement.` }, ...getDesignOptions(gameMode.value).filter(option => option.family === slot.family).sort((a, b) => a.level - b.level || primaryAccent(a) - primaryAccent(b) || a.name.localeCompare(b.name))];
  for (const choice of choices) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.upgradeId = choice.id;
    if (choice.accent) button.dataset.accent = choice.accent;
    button.className = 'upgrade-choice';
    button.setAttribute('aria-pressed', String(choice.id === select.value));
    const title = document.createElement('strong');
    title.textContent = `${choice.level ? `${choice.level} pt${choice.level === 1 ? '' : 's'} · ` : ''}${choice.name}`;
    const description = document.createElement('span');
    description.textContent = slot.family === 'king' ? choice.description.split(' It starts in reserve;')[0] : choice.description;
    button.append(title, description);
    button.onclick = () => {
      select.value = choice.id;
      updateSetup();
      document.querySelector('#setup-upgrades').querySelector(`[data-upgrade-id="${choice.id}"]`)?.focus({ preventScroll: true });
    };
    list.append(button);
  }
}

function setupPieceAt(square) {
  const slot = ALL_DESIGN_SLOTS.find(slot => slot.square === square);
  if (!slot) return undefined;
  const profile = setupProfile();
  const id = document.querySelector(`#experimental-upgrade-${square}`).value;
  const allocation = profile.registry.allocations.find(item => item.id === id);
  const type = allocation?.letter || ({ pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' })[slot.family];
  return { color: slot.color, type };
}

function renderPockets() {
  const pockets = game.pockets?.();
  for (const [id, color] of [['pocket-top', flipped ? 'w' : 'b'], ['pocket-bottom', flipped ? 'b' : 'w']]) {
    const container = document.querySelector(`#${id}`);
    container.replaceChildren();
    container.hidden = editingSetup || !game.profile?.roles.reserveTypes?.length;
    container.setAttribute('aria-label', `${side(color)} reserves`);
    if (container.hidden) continue;
    const label = document.createElement('span');
    label.textContent = `${side(color)} reserve`;
    label.className = 'pocket-label';
    container.append(label);
    const entries = pockets?.[color] || [];
    if (!entries.length) {
      const empty = document.createElement('span');
      empty.textContent = 'Empty';
      empty.className = 'pocket-empty';
      container.append(empty);
    }
    for (const entry of entries) {
      const info = infoFor(entry.type);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pocket-piece';
      button.dataset.pocketColor = color;
      button.dataset.pocketType = entry.type;
      button.dataset.accent = info.accent;
      button.setAttribute('aria-label', `${side(color)} ${info.name}, ${entry.count} in reserve`);
      button.setAttribute('aria-pressed', String(selectedDrop === entry.type && color === game.turn()));
      button.title = info.description;
      button.textContent = `${info.symbols[color]} ${info.name}${entry.count > 1 ? ` ×${entry.count}` : ''}`;
      button.disabled = color !== game.turn() || buildingGame || isFinished() || !canPlay() || engineBusy || Boolean(pending) || (opponent.value === 'engine' && game.turn() !== humanSide.value);
      button.onclick = () => {
        if (button.disabled) return;
        selected = null;
        selectedDrop = selectedDrop === entry.type ? null : entry.type;
        render();
      };
      container.append(button);
    }
  }
}

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
  const canMate = game.board().flat().some(piece => piece?.color === winner && piece.type !== 'k') || Boolean(game.pockets?.()[winner]?.length);
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
  clockToggle.disabled = editingSetup || !isTimed() || isFinished();
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
  selectedDrop = null;
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
  if (editingSetup || opponent.value !== 'engine' || !connected || engineBusy || enginePaused || pending || isFinished() || !canPlay() || game.turn() === humanSide.value) return;
  engineBusy = true;
  engineController = new AbortController();
  const request = generation;
  const fen = game.fen();
  engineMessage(`${engineName} is thinking…`);
  try {
    const data = await engineFetch('/api/engine/move', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fen, difficulty: difficulty.value, variant: game.variant || 'chess', ...(game.profile ? { profileHash: game.profile.hash, registryHash: game.profile.registryHash } : {}) }),
    });
    if (request !== generation || game.fen() !== fen) return;
    if (typeof data.move !== 'string' || !/^(?:[a-h][1-8][a-h][1-8][qrbn]?|[A-Za-z]@[a-h][1-8])$/.test(data.move)) throw new Error('Engine returned an invalid move.');
    const move = data.move[1] === '@' ? { drop: data.move[0].toLowerCase(), to: data.move.slice(2) } : { from: data.move.slice(0, 2), to: data.move.slice(2, 4), promotion: data.move[4] };
    if (!playMove(move)) return;
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
  renderSetupPicker();
  renderPockets();
  const files = [...'abcdefgh'];
  const ranks = [...'87654321'];
  if (flipped) { files.reverse(); ranks.reverse(); }
  const legal = editingSetup ? [] : selectedDrop ? game.moves({ drop: selectedDrop, verbose: true }) : selected ? game.moves({ square: selected, verbose: true }) : [];
  const history = game.history({ verbose: true });
  const last = history.at(-1);
  const displayProfile = editingSetup ? setupProfile() : game.profile;
  const displayInfo = type => displayProfile ? pieceInfoForProfile(displayProfile, type) : pieceInfo(type);
  board.classList.toggle('experimental-board', Boolean(displayProfile));
  document.querySelector('.history-panel .panel-heading > span').textContent = game.profile ? 'PIECE · LEVEL' : 'SAN';
  board.replaceChildren();
  ranks.forEach((rank, row) => files.forEach((file, col) => {
    const square = file + rank;
    const piece = editingSetup ? setupPieceAt(square) : game.get(square);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'square ' + ((file.charCodeAt(0) - 97 + Number(rank)) % 2 === 0 ? 'dark' : 'light');
    button.dataset.square = square;
    button.setAttribute('aria-label', `${square}${piece ? ` ${side(piece.color)} ${displayInfo(piece.type).name}` : ' empty'}`);
    button.setAttribute('aria-pressed', String((editingSetup ? setupSquare : selected) === square));
    if ((editingSetup ? setupSquare : selected) === square) button.classList.add('selected');
    if (!editingSetup && last && [last.from, last.to].includes(square)) button.classList.add('last-move');
    if (!editingSetup && piece?.type === 'k' && piece.color === game.turn() && game.isCheck()) button.classList.add('check');
    if (piece) {
      const icon = document.createElement('span');
      const info = displayInfo(piece.type);
      const definition = displayProfile?.definitionsByLetter[piece.type];
      if (definition) {
        button.dataset.designId = definition.id;
        button.title = `${info.name}. ${info.description || ''}`;
      }
      icon.className = `piece ${piece.color === 'w' ? 'white-piece' : 'black-piece'}${info.level ? ` upgraded ${info.accent}` : ''}`;
      icon.textContent = info.symbols[piece.color];
      button.append(icon);
      if (info.level) {
        const badge = document.createElement('span');
        badge.className = `piece-level ${info.accent}`;
        badge.textContent = `L${info.level}`;
        button.append(badge);
      }
    }
    if (legal.some(move => move.to === square)) {
      const marker = document.createElement('span');
      marker.className = legal.some(move => move.to === square && move.captured) ? 'capture-marker' : 'move-marker';
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
  if (editingSetup) status = 'Build your army';
  document.querySelector('#status').textContent = status;
  const selectedPiece = selected ? game.get(selected) : null;
  const selectedDesign = selectedPiece ? designFor(selectedPiece.type) : null;
  const description = selectedDesign ? ` ${currentDesignOption(selectedDesign.id)?.description || ''}` : '';
  document.querySelector('#hint').textContent = editingSetup ? 'Click a starting piece to choose an upgrade. Start game when both armies are ready.' : isFinished() ? 'Start a new game or undo a move to keep playing.' : !canPlay() ? 'Start or resume the clock to continue playing.' : selectedDrop ? `Drop your ${infoFor(selectedDrop).name} on a highlighted empty square in your half. The drop cannot give check.` : selected ? `${side(game.turn())} ${infoFor(selectedPiece.type).name} on ${selected}. Choose a highlighted square.${description}` : game.profile?.roles.reserveTypes?.length ? 'Select a piece or a reserve guard to see its legal moves.' : 'Select a piece to see its legal moves.';
  document.querySelector('#undo').disabled = editingSetup || history.length === 0;
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
    text.textContent = displaySan(move.san);
    if (game.profile) {
      const info = infoFor(move.piece);
      const description = move.drop ? `${side(move.color)} drops ${info.name} on ${move.to}` : `${side(move.color)} ${info.name} from ${move.from} ${move.captured ? 'captures on' : 'to'} ${move.to}`;
      text.title = description;
      text.setAttribute('aria-label', description);
    }
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
  document.querySelectorAll('.player .level').forEach((label, index) => {
    const color = index === 0 ? (flipped ? 'w' : 'b') : (flipped ? 'b' : 'w');
    const counts = new Map();
    for (const piece of editingSetup ? ALL_DESIGN_SLOTS.map(slot => setupPieceAt(slot.square)) : game.board().flat()) {
      if (piece?.color !== color) continue;
      const info = displayInfo(piece.type);
      if (info.level) counts.set(info.level, (counts.get(info.level) || 0) + 1);
    }
    const levels = counts.size ? [...counts].sort(([a], [b]) => a - b).map(([level, count]) => `L${level} ×${count}`).join(' · ') : 'LEVEL 0';
    label.textContent = game.profile && counts.size ? `Units · ${levels}` : levels;
    label.title = game.profile ? 'Upgraded units remaining on the board. Purchase costs are shown in the setup budget.' : '';
  });
  updateClocks();
  void maybeEngineMove();
}

function selectSquare(square) {
  if (editingSetup) {
    if (designSlots(setupProfile()).some(slot => slot.square === square)) {
      setupSquare = square;
      render(square);
    }
    return;
  }
  settleClock();
  if (buildingGame || isFinished() || !canPlay() || pending || (opponent.value === 'engine' && game.turn() !== humanSide.value)) return;
  const moves = (selectedDrop ? game.moves({ drop: selectedDrop, verbose: true }) : selected ? game.moves({ square: selected, verbose: true }) : []).filter(move => move.to === square);
  if (moves.length) {
    if (moves.some(move => move.promotion)) {
      pending = { from: selected, to: square };
      const options = document.querySelector('#promotion-options');
      options.replaceChildren();
      for (const type of ['q', 'r', 'b', 'n']) {
        const button = document.createElement('button');
        button.textContent = pieceInfo(type).symbols[game.turn()];
        button.setAttribute('aria-label', `Promote to ${pieceInfo(type).name}`);
        button.onclick = () => { playMove({ ...pending, promotion: type }); pending = null; selected = null; promotion.close(); render(square); };
        options.append(button);
      }
      promotion.showModal();
      return;
    }
    playMove(selectedDrop ? { drop: selectedDrop, to: square } : { from: selected, to: square });
    selected = null;
    selectedDrop = null;
  } else {
    const piece = game.get(square);
    selected = square !== selected && piece?.color === game.turn() ? square : null;
    selectedDrop = null;
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
async function newGame() {
  if (buildingGame || !updateSetup()) return;
  const request = ++replacementGeneration;
  const selectedMode = gameMode.value;
  const selectedTime = timeControl.value;
  const { levels, budget } = setupChoice();
  let next;
  buildingGame = true;
  document.querySelector('#new-game').disabled = true;
  try {
    if (SUPPORTED_VARIANTS.includes(selectedMode)) {
      const status = isExperimental(selectedMode) ? experimentalStatus : isPieceVariant(selectedMode) ? pieceStatus : upgradeStatus;
      status.textContent = 'Loading piece-upgrade rules…';
      await initVariantRules(selectedMode);
      const setup = isExperimental(selectedMode) ? designSetupFromChoices : isPieceVariant(selectedMode) ? pieceSetupFromLevels : setupFromLevels;
      next = new VariantGame(setup(levels, budget, isExperimental(selectedMode) ? getPlayableProfile(selectedMode) : undefined).fen, selectedMode);
    } else next = new Chess();
    if (request !== replacementGeneration) { next.dispose?.(); return; }
    cancelEngine();
    enginePaused = false;
    game.dispose?.();
    game = next;
    editingSetup = false;
    setupSquare = null;
    selectedDrop = null;
    activeBudget = budget;
    clock.reset(selectedTime, game.turn());
    clockNotice = '';
    handledFlag = null;
    selected = null;
    pending = null;
    promotion.close();
    restart.close();
    updateSetup();
    if (opponent.value === 'engine') engineMessage(connected ? `${engineName} connected.` : 'Connect the engine to begin.');
    render();
  } catch (error) {
    if (next !== game) next?.dispose?.();
    const status = isExperimental(selectedMode) ? experimentalStatus : isPieceVariant(selectedMode) ? pieceStatus : upgradeStatus;
    status.textContent = `Could not start the upgrade game: ${error.message}`;
    status.classList.add('error');
    restart.close();
  } finally {
    buildingGame = false;
    document.querySelector('#new-game').disabled = false;
    render();
  }
}
document.querySelector('#new-game').onclick = () => {
  if (!updateSetup()) return;
  if (game.history().length || engineBusy || clock.started) restart.showModal(); else void newGame();
};
document.querySelector('#cancel-restart').onclick = () => { replacementGeneration++; restart.close(); updateSetup(); };
restart.addEventListener('cancel', () => { replacementGeneration++; updateSetup(); });
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
  replacementGeneration++;
  game.dispose?.();
  game = candidate.game;
  editingSetup = false;
  setupSquare = null;
  selectedDrop = null;
  gameMode.value = game.variant || 'chess';
  activeBudget = candidate.settings?.upgradeBudget || (isPieceVariant(game.variant) || isExperimental(game.variant) ? 6 : 2);
  if (isExperimental(game.variant)) {
    refreshExperimentalOptions();
    const choices = loadDesignSetup(game.getHeaders().FEN, game.profile);
    for (const slot of designSlots(game.profile)) document.querySelector(`#experimental-upgrade-${slot.square}`).value = choices[slot.square];
    if (!candidate.settings?.upgradeBudget) {
      // Study positions may exceed setup budgets. Keep them playable; the
      // pending next-game choices report their cost without rejecting import.
      const costs = designCosts(choices);
      activeBudget = Math.max(1, Math.min(designBudgetLimit(game.profile), Math.max(costs.white, costs.black)));
    }
    experimentalBudget.value = String(activeBudget);
  } else if (game.variant === VARIANT) {
    const levels = loadInitialSetup(game.getHeaders().FEN);
    for (const square of upgradeSquares) document.querySelector(`#upgrade-${square}`).value = String(levels[square]);
    if (!candidate.settings?.upgradeBudget) {
      const setup = setupFromLevels(levels, 6);
      activeBudget = Math.max(2, setup.white, setup.black);
    }
    upgradeBudget.value = String(activeBudget);
  } else if (isPieceVariant(game.variant)) {
    const levels = loadPieceSetup(game.getHeaders().FEN);
    for (const slot of PIECE_SLOTS) document.querySelector(`#piece-upgrade-${slot.square}`).value = String(levels[slot.square]);
    if (!candidate.settings?.upgradeBudget) {
      const setup = pieceSetupFromLevels(levels, MAX_PIECE_BUDGET);
      activeBudget = Math.max(6, setup.white, setup.black);
    }
    pieceBudget.value = String(activeBudget);
  }
  updateSetup();
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
    let clockState = clock.snapshot();
    settleClock();
    if (clock.expired && !clockState.expired) clockState = clock.snapshot();
    const save = makeSave(game, { opponent: opponent.value, humanSide: humanSide.value, difficulty: difficulty.value, flipped, ...(SUPPORTED_VARIANTS.includes(game.variant) ? { upgradeBudget: activeBudget } : {}) }, clockState);
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    saveStatus.textContent = `Saved ${game.history().length} half-moves in this browser. Export PGN for a portable backup.`;
    refreshSaveAvailability();
  } catch { saveStatus.textContent = 'Could not save in this browser. Use PGN export instead.'; }
};
document.querySelector('#load-game').onclick = async () => {
  try {
    const text = localStorage.getItem(SAVE_KEY);
    if (!text) throw new Error('No saved game was found in this browser.');
    const request = ++replacementGeneration;
    const candidate = await parseSave(text);
    if (request !== replacementGeneration) { candidate.game.dispose?.(); return; }
    proposeGame(candidate);
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
document.querySelector('#confirm-import').onclick = async () => {
  try {
    const request = ++fileGeneration;
    const boardRequest = ++replacementGeneration;
    const candidate = { game: await parsePgn(pgnText.value) };
    if (request !== fileGeneration || boardRequest !== replacementGeneration) { candidate.game.dispose?.(); return; }
    proposeGame(candidate);
  } catch (error) { importError.textContent = error.message; }
};
document.querySelector('#cancel-replace').onclick = () => { replacement?.game.dispose?.(); replacement = null; replaceDialog.close(); };
replaceDialog.addEventListener('cancel', () => { replacement?.game.dispose?.(); replacement = null; });
document.querySelector('#confirm-replace').onclick = () => {
  if (!replacement) return;
  const candidate = replacement;
  replaceDialog.close();
  applyGame(candidate);
};
timeControl.onchange = updateClocks;
clockToggle.onclick = () => {
  settleClock();
  if (editingSetup || isFinished() || !isTimed()) return;
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
gameMode.onchange = () => {
  updateSetup();
  setSetupEditing(usesBoardSetup());
  const library = PLAYABLE_LIBRARIES.find(library => library.variant === gameMode.value);
  if (editingSetup && library?.focusFamily === 'king') {
    setupSquare = 'e1';
    render();
  }
};
upgradeBudget.onchange = updateSetup;
pieceBudget.oninput = updateSetup;
pieceFamily.onchange = updateFamily;
experimentalBudget.oninput = updateSetup;
experimentalFamily.onchange = updateExperimentalFamily;
for (const square of upgradeSquares) document.querySelector(`#upgrade-${square}`).onchange = updateSetup;
updateFamily();
updateSetup();
refreshSaveAvailability();
render();
