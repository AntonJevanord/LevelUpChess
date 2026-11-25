import puzzleData from './puzzle-data';

const { filterPuzzles, pieceLabel, MAX_PACK_BYTES } = puzzleData;
const CATEGORIES = ['involved', 'moved', 'present'];
const side = color => color === 'b' ? 'Black' : 'White';
const number = value => value === '' ? undefined : Number(value);

/** Presentation only: the app owns the parked game, validated packs and
 * puzzle session. Opening a menu pauses its context; browsing never replaces
 * the board. All imported text is validated by the app before setLibrary. */
export function createPuzzleMenu({ root = document, onPause = () => {}, onResume = () => {},
  onImport = async () => {}, onStart = async () => {}, onRetry = () => {},
  onHint = () => {}, onReveal = () => {}, onLeave = () => {} } = {}) {
  const find = selector => root.querySelector(selector);
  const main = find('#main-menu'), library = find('#puzzle-library');
  const toolbar = find('#puzzle-toolbar'), list = find('#puzzle-list'), empty = find('#puzzle-empty');
  const count = find('#puzzle-result-count'), error = find('#puzzle-filter-error');
  const importStatus = find('#puzzle-import-status'), fileInput = find('#puzzle-pack-file');
  let pack = { puzzles: [] }, session = null, opening = false, importing = false;
  let menuActive = false;

  function close({ resume = true, force = false } = {}) {
    if (opening && !force) return;
    main.close(); library.close();
    const wasActive = menuActive;
    menuActive = false;
    if (resume && wasActive) onResume();
  }
  function open(dialog) {
    if (!menuActive) { onPause(); menuActive = true; }
    if (main.open && dialog !== main) main.close();
    if (library.open && dialog !== library) library.close();
    if (!dialog.open) dialog.showModal();
  }
  function showMain() {
    find('#menu-play strong').textContent = session ? 'Return to game' : 'Play chess';
    open(main);
  }
  function showLibrary() { renderResults(); open(library); }
  function filters() {
    return { minMoves: number(find('#puzzle-min-moves').value), maxMoves: number(find('#puzzle-max-moves').value),
      ...Object.fromEntries(CATEGORIES.map(category => [category,
        [...find(`#puzzle-filter-${category}`).querySelectorAll('input:checked')].map(input => input.value)])) };
  }
  function filtersError(value) {
    for (const key of ['minMoves', 'maxMoves']) if (value[key] !== undefined
      && (!Number.isSafeInteger(value[key]) || value[key] < 1 || value[key] > 50)) return 'Choose a whole number from 1 to 50 for the solution length.';
    return value.minMoves !== undefined && value.maxMoves !== undefined && value.minMoves > value.maxMoves
      ? 'The minimum length must be no greater than the maximum.' : '';
  }
  function pieceName(id) { return pieceLabel(id); }
  function renderPieceFilters() {
    const previous = filters();
    const ids = [...new Set(pack.puzzles.flatMap(puzzle => CATEGORIES.flatMap(category => puzzle.pieces?.[category] || [])))];
    ids.sort((a, b) => pieceName(a).localeCompare(pieceName(b)) || a.localeCompare(b));
    for (const category of CATEGORIES) {
      const container = find(`#puzzle-filter-${category}`);
      container.replaceChildren();
      for (const [index, id] of ids.entries()) {
        const label = root.createElement('label'), input = root.createElement('input');
        input.type = 'checkbox'; input.value = id; input.id = `puzzle-${category}-piece-${index}`;
        input.checked = previous[category].includes(id);
        const text = root.createElement('span'); text.textContent = pieceName(id);
        label.append(input, text); container.append(label);
      }
      if (!ids.length) {
        const note = root.createElement('p'); note.textContent = 'Available after loading puzzles.'; container.append(note);
      }
    }
  }
  function card(puzzle) {
    const article = root.createElement('article'); article.className = 'puzzle-card'; article.dataset.puzzleId = puzzle.id;
    const heading = root.createElement('div'); heading.className = 'puzzle-card-heading';
    const title = root.createElement('h3'); title.textContent = puzzle.title || 'Find the winning move';
    const badge = root.createElement('span'); badge.className = 'puzzle-length-badge'; badge.textContent = `Mate in ${puzzle.goal.moves}`;
    heading.append(title, badge);
    const turn = root.createElement('p'); turn.textContent = `${side(puzzle.solverColor)} to move${puzzle.provenance?.kind === 'authored' ? ' · Practice example' : ''}`;
    const pieces = root.createElement('p'); pieces.className = 'puzzle-pieces-summary';
    pieces.textContent = (puzzle.pieces?.involved || []).map(pieceName).join(' · ') || 'Find the tactic on the board.';
    const button = root.createElement('button'); button.type = 'button'; button.className = 'primary'; button.textContent = 'Start puzzle';
    button.setAttribute('aria-label', `Start puzzle: ${title.textContent}`); button.disabled = opening;
    button.addEventListener('click', async () => {
      if (opening) return;
      opening = true; error.textContent = ''; renderResults();
      count.textContent = 'Opening puzzle…';
      try { await onStart(puzzle); close({ resume: false, force: true }); }
      catch (reason) { error.textContent = `This puzzle could not be opened. ${reason.message || reason}`; }
      finally { opening = false; renderResults(); }
    });
    article.append(heading, turn, pieces, button); return article;
  }
  function renderResults() {
    find('#puzzle-library-close').disabled = opening;
    fileInput.disabled = importing || opening;
    const value = filters(), invalid = filtersError(value);
    // Keep an actionable import/start error until the user changes filters.
    if (invalid) error.textContent = invalid;
    for (const category of CATEGORIES) find(`#puzzle-${category}-count`).textContent = value[category].length ? `(${value[category].length})` : '';
    const matches = invalid ? [] : filterPuzzles(pack.puzzles, value);
    list.replaceChildren(...matches.map(card));
    count.textContent = pack.puzzles.length ? `${matches.length} of ${pack.puzzles.length} puzzles` : 'No puzzles loaded.';
    empty.hidden = Boolean(matches.length);
    if (pack.puzzles.length) {
      empty.querySelector('h3').textContent = 'No puzzles match these filters.';
      empty.querySelector('p').textContent = 'Try a wider solution length or clear a piece filter.';
    } else {
      empty.querySelector('h3').textContent = 'Your next tactic is on its way.';
      empty.querySelector('p').textContent = 'Import a puzzle pack after generating puzzles from your completed games.';
    }
  }
  function setLibrary(value) {
    if (!value || !Array.isArray(value.puzzles)) throw new Error('A puzzle library requires validated puzzles.');
    pack = value; error.textContent = ''; renderPieceFilters(); renderResults();
  }
  function renderSession(value) {
    session = value;
    toolbar.hidden = !value;
    if (!value) return;
    toolbar.dataset.status = value.status;
    find('#puzzle-title').textContent = value.title || 'Find the winning move';
    find('#puzzle-goal').textContent = `${side(value.solverColor)} to move · Mate in ${value.goal.moves} · ${value.solverMovesPlayed || 0}/${value.solverMovesTotal || value.goal.moves} moves`;
    const base = value.status === 'solved' ? 'Puzzle solved. Nicely found.'
      : value.status === 'revealed' ? 'Solution revealed. Retry to solve it yourself.' : 'Find the move that keeps the forced mate.';
    const hint = typeof value.hint === 'string' && value.hint ? `Hint: ${value.hint}` : '';
    const solution = value.status === 'revealed' && Array.isArray(value.solution) ? `Solution: ${value.solution.join(' ')}` : '';
    find('#puzzle-feedback').textContent = value.message || value.feedback || [base, hint, solution].filter(Boolean).join(' ');
    find('#puzzle-hint').disabled = value.status !== 'playing';
    find('#puzzle-reveal').disabled = value.status === 'revealed';
    const notes = find('#puzzle-piece-notes'); notes.replaceChildren();
    const moved = new Set(value.pieces?.moved || []), stationary = new Set(value.pieces?.stationary || []);
    for (const id of value.pieces?.involved || []) {
      const item = root.createElement('li');
      item.textContent = `${pieceName(id)}${stationary.has(id) ? ' — involved without moving' : moved.has(id) ? ' — moves in the solution' : ' — takes part in the tactic'}`;
      notes.append(item);
    }
    find('#puzzle-piece-details').hidden = !notes.children.length;
  }

  find('#open-menu').addEventListener('click', showMain);
  find('#main-menu-close').addEventListener('click', () => close());
  find('#puzzle-library-close').addEventListener('click', () => close());
  find('#menu-puzzles').addEventListener('click', showLibrary);
  find('#menu-play').addEventListener('click', () => {
    if (session) { onLeave(); close({ resume: false }); }
    else close();
  });
  for (const dialog of [main, library]) dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  find('#puzzle-library-back').addEventListener('click', showLibrary);
  find('#puzzle-retry').addEventListener('click', () => onRetry());
  find('#puzzle-hint').addEventListener('click', () => onHint());
  find('#puzzle-reveal').addEventListener('click', () => onReveal());
  find('#puzzle-leave').addEventListener('click', () => onLeave());
  find('#puzzle-filters').addEventListener('submit', event => event.preventDefault());
  for (const name of ['input', 'change']) find('#puzzle-filters').addEventListener(name, event => {
    if (event.target === fileInput) return;
    error.textContent = ''; renderResults();
  });
  find('#puzzle-clear-filters').addEventListener('click', () => {
    find('#puzzle-min-moves').value = ''; find('#puzzle-max-moves').value = '';
    for (const input of find('#puzzle-filters').querySelectorAll('input[type=checkbox]')) input.checked = false;
    error.textContent = ''; renderResults();
  });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file || importing) return;
    importing = true; fileInput.disabled = true; importStatus.classList.remove('error'); importStatus.textContent = `Loading ${file.name}…`;
    try {
      if (file.size > MAX_PACK_BYTES) throw new Error(`Choose a pack no larger than ${MAX_PACK_BYTES / 1024 / 1024} MB.`);
      const loaded = await onImport(await file.text(), { name: file.name });
      if (loaded) setLibrary(loaded);
      importStatus.textContent = `${file.name} loaded. ${pack.puzzles.length} puzzles available.`;
    } catch (reason) {
      importStatus.classList.add('error'); importStatus.textContent = `Could not load this puzzle pack. ${reason.message || reason}`;
    } finally { importing = false; fileInput.disabled = false; fileInput.value = ''; }
  });
  renderPieceFilters(); renderResults();
  return { setLibrary, showMain, showLibrary, close, renderSession,
    get isOpen() { return menuActive; }, get activePuzzle() { return session?.id || null; } };
}
