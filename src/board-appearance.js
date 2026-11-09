'use strict';

// Cosmetic preferences are deliberately separate from game saves and rules.
const APPEARANCE_KEY = 'levelupchess.appearance.v1';
const PIECE_STYLES = Object.freeze(['glow', 'flat', 'outline', 'medallion']);
const BOARD_THEMES = Object.freeze(['sage', 'blue', 'walnut', 'slate']);
const DEFAULT_APPEARANCE = Object.freeze({ pieceStyle: 'glow', boardTheme: 'sage', annotationColor: '#edc34b' });
const FAMILIES = Object.freeze({ p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' });
const SYMBOLS = Object.freeze({ pawn: ['♙', '♟'], knight: ['♘', '♞'], bishop: ['♗', '♝'], rook: ['♖', '♜'], queen: ['♕', '♛'], king: ['♔', '♚'] });

// Original inline vector silhouettes. No remote images or font downloads.
const SHAPES = Object.freeze({
  pawn: '<circle cx="22.5" cy="11" r="5.5"/><path d="M19 17h7l-1 5 4 10H16l4-10z"/><path d="M14 32h17l3 6H11z"/>',
  knight: '<path d="M11 32l5-12-5 3-4-5L20 8l9-3 1 10 7 16v5H11z"/><path class="piece-detail" d="M20 11l-5 5m12-1 3 12"/><circle class="piece-eye" cx="24" cy="12" r="1.3"/><path d="M10 36h28v4H9z"/>',
  bishop: '<path d="M22.5 5c-4 4-9 8-9 13 0 4 3 7 7 8l-5 8h15l-5-8c4-1 7-4 7-8 0-5-5-9-10-13z"/><path class="piece-detail" d="M26 10l-7 9"/><path d="M13 34h19l3 5H10z"/>',
  rook: '<path d="M9 6h7v6h4V6h5v6h4V6h7v11l-4 3 1 13H12l1-13-4-3z"/><path class="piece-detail" d="M13 20h19M13 28h19"/><path d="M11 33h23l2 6H9z"/>',
  queen: '<path d="M10 12l8 8 4.5-12L27 20l8-8-5 21H15z"/><circle cx="9" cy="9" r="3"/><circle cx="22.5" cy="6" r="3"/><circle cx="36" cy="9" r="3"/><path class="piece-detail" d="M15 28h15"/><path d="M13 33h19l3 6H10z"/>',
  king: '<path d="M20 4h5v5h5v5h-5v7h-5v-7h-5V9h5z"/><path d="M14 20c-3 0-6 3-5 6l5 8h17l5-8c1-3-2-6-5-6-3 0-6 2-8.5 5-2.5-3-5.5-5-8.5-5z"/><path d="M13 34h19l3 6H10z"/>',
});

function normalizeAppearance(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.freeze({
    pieceStyle: PIECE_STYLES.includes(input.pieceStyle) ? input.pieceStyle : DEFAULT_APPEARANCE.pieceStyle,
    boardTheme: BOARD_THEMES.includes(input.boardTheme) ? input.boardTheme : DEFAULT_APPEARANCE.boardTheme,
    annotationColor: typeof input.annotationColor === 'string' && /^#[\da-f]{6}$/i.test(input.annotationColor)
      ? input.annotationColor.toLowerCase() : DEFAULT_APPEARANCE.annotationColor,
  });
}

function readAppearance(storage) {
  try {
    const saved = JSON.parse(storage?.getItem(APPEARANCE_KEY) || 'null');
    return normalizeAppearance(saved?.version === 1 ? saved : null);
  } catch { return DEFAULT_APPEARANCE; }
}

/** Attach only the three appearance controls; no game state is read or saved. */
function createAppearancePreferences({ document: doc = globalThis.document, storage, onChange = () => {} } = {}) {
  if (!doc?.body) throw new Error('Appearance preferences need a document body.');
  let selectedStorage = storage;
  if (selectedStorage === undefined) {
    try { selectedStorage = doc.defaultView?.localStorage; } catch { selectedStorage = null; }
  }
  let current = readAppearance(selectedStorage), disposed = false;
  const controls = { pieceStyle: doc.querySelector('#piece-style'), boardTheme: doc.querySelector('#board-theme'), annotationColor: doc.querySelector('#annotation-color') };
  const listeners = [];
  function apply() {
    doc.body.dataset.pieceStyle = current.pieceStyle;
    doc.body.dataset.boardTheme = current.boardTheme;
    doc.body.style.setProperty('--annotation-color', current.annotationColor);
    for (const [key, element] of Object.entries(controls)) if (element) element.value = current[key];
    return current;
  }
  function set(values) {
    if (disposed) return current;
    const next = normalizeAppearance({ ...current, ...(values && typeof values === 'object' && !Array.isArray(values) ? values : {}) });
    const changed = Object.keys(next).some(key => next[key] !== current[key]);
    current = next;
    apply();
    if (changed) {
      try { selectedStorage?.setItem(APPEARANCE_KEY, JSON.stringify({ version: 1, ...current })); } catch { /* Private/file browsing can deny storage. */ }
      onChange(current);
    }
    return current;
  }
  for (const [key, element] of Object.entries(controls)) if (element) {
    const handler = () => set({ [key]: element.value });
    element.addEventListener('change', handler);
    listeners.push(() => element.removeEventListener('change', handler));
  }
  apply();
  return {
    get settings() { return current; },
    set, apply,
    setPieceStyle(value) { return set({ pieceStyle: value }); },
    setBoardTheme(value) { return set({ boardTheme: value }); },
    setAnnotationColor(value) { return set({ annotationColor: value }); },
    reset() { return set(DEFAULT_APPEARANCE); },
    dispose() { disposed = true; for (const remove of listeners) remove(); },
  };
}

function pieceSvgMarkup({ family, type, color = 'w', style = 'flat', level = 0 } = {}) {
  const selectedFamily = Object.hasOwn(SHAPES, family) ? family : FAMILIES[String(type || '').toLowerCase()] || 'pawn';
  const selectedStyle = PIECE_STYLES.includes(style) && style !== 'glow' ? style : 'flat';
  const side = color === 'b' ? 'black' : 'white';
  const coin = selectedStyle === 'medallion' ? '<circle class="piece-coin" cx="22.5" cy="22.5" r="20"/><circle class="piece-coin-rim" cx="22.5" cy="22.5" r="17.5"/>' : '';
  const transform = selectedStyle === 'medallion' ? ' transform="translate(5.85 5.85) scale(.74)"' : '';
  const accent = Number.isInteger(level) && level > 0 ? '<path class="piece-accent" d="M12 41.8h21"/>' : '';
  return `<svg class="piece-svg ${selectedStyle}-piece ${side}-svg" viewBox="0 0 45 45" aria-hidden="true" focusable="false">${coin}<g class="piece-shape"${transform}>${SHAPES[selectedFamily]}</g>${accent}</svg>`;
}

/** The caller retains its piece/level classes and square's accessible label. */
function renderPieceIcon(element, { family, type, color = 'w', symbol, level = 0, style } = {}) {
  if (!element) return;
  const preferred = style || element.ownerDocument?.body?.dataset.pieceStyle || 'glow';
  const selected = PIECE_STYLES.includes(preferred) ? preferred : 'glow';
  const selectedFamily = Object.hasOwn(SYMBOLS, family) ? family : FAMILIES[String(type || '').toLowerCase()] || 'pawn';
  element.dataset.pieceStyle = selected;
  element.setAttribute('aria-hidden', 'true');
  if (selected === 'glow') element.textContent = typeof symbol === 'string' ? symbol : SYMBOLS[selectedFamily][color === 'b' ? 1 : 0];
  else element.innerHTML = pieceSvgMarkup({ family: selectedFamily, color, style: selected, level });
}

module.exports = { APPEARANCE_KEY, PIECE_STYLES, BOARD_THEMES, DEFAULT_APPEARANCE,
  normalizeAppearance, readAppearance, createAppearancePreferences, pieceSvgMarkup, renderPieceIcon };
