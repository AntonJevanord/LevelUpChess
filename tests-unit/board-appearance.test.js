'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { APPEARANCE_KEY, DEFAULT_APPEARANCE, normalizeAppearance, readAppearance,
  createAppearancePreferences, pieceSvgMarkup, renderPieceIcon } = require('../src/board-appearance');

function fixture(saved) {
  const entries = new Map([['levelupchess.saved-game.v1', '{"game":"untouched"}']]);
  if (saved !== undefined) entries.set(APPEARANCE_KEY, saved);
  const storage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
  const controls = Object.fromEntries(['piece-style', 'board-theme', 'annotation-color'].map(id => [id, Object.assign(new EventTarget(), { value: '' })]));
  const properties = new Map();
  const doc = { body: { dataset: {}, style: { setProperty: (key, value) => properties.set(key, value) } },
    querySelector: selector => controls[selector.slice(1)] || null, defaultView: { localStorage: storage } };
  return { doc, controls, storage, entries, properties };
}

test('corrupt, future or unsupported cosmetic preferences fall back without leaking arbitrary values', () => {
  for (const saved of ['{', 'null', '[]', '{"version":2,"pieceStyle":"outline"}']) {
    assert.deepEqual(readAppearance(fixture(saved).storage), DEFAULT_APPEARANCE);
  }
  assert.deepEqual(normalizeAppearance({ pieceStyle: '<svg>', boardTheme: 'unknown', annotationColor: 'url(https://example.invalid)' }), DEFAULT_APPEARANCE);
  assert.deepEqual(normalizeAppearance({ pieceStyle: 'outline', boardTheme: 'slate', annotationColor: '#AABBCC', injected: true }),
    { pieceStyle: 'outline', boardTheme: 'slate', annotationColor: '#aabbcc' });
});

test('control changes persist appearance independently of saves and are restored on a fresh document', () => {
  const f = fixture(), changed = [];
  const preferences = createAppearancePreferences({ document: f.doc, storage: f.storage, onChange: value => changed.push(value) });
  assert.deepEqual(f.doc.body.dataset, { pieceStyle: 'glow', boardTheme: 'sage' });
  f.controls['piece-style'].value = 'medallion'; f.controls['piece-style'].dispatchEvent(new Event('change'));
  f.controls['board-theme'].value = 'walnut'; f.controls['board-theme'].dispatchEvent(new Event('change'));
  f.controls['annotation-color'].value = '#AACC33'; f.controls['annotation-color'].dispatchEvent(new Event('change'));
  assert.deepEqual(preferences.settings, { pieceStyle: 'medallion', boardTheme: 'walnut', annotationColor: '#aacc33' });
  assert.equal(f.properties.get('--annotation-color'), '#aacc33');
  assert.equal(f.entries.get('levelupchess.saved-game.v1'), '{"game":"untouched"}');
  assert.equal(changed.length, 3);
  assert.ok(Object.isFrozen(preferences.settings));
  const fresh = fixture(f.entries.get(APPEARANCE_KEY));
  const restored = createAppearancePreferences({ document: fresh.doc, storage: fresh.storage });
  assert.deepEqual(restored.settings, preferences.settings);
  assert.equal(fresh.controls['piece-style'].value, 'medallion');
  assert.equal(fresh.controls['annotation-color'].value, '#aacc33');
});

test('denied browser storage and missing controls do not prevent customization or offline rendering', () => {
  const f = fixture();
  const denied = { getItem() { throw new Error('Denied'); }, setItem() { throw new Error('Denied'); } };
  f.doc.querySelector = () => null;
  Object.defineProperty(f.doc.defaultView, 'localStorage', { get() { throw new Error('Denied'); } });
  const explicit = createAppearancePreferences({ document: f.doc, storage: denied });
  explicit.set({ pieceStyle: 'flat', boardTheme: 'blue' });
  assert.equal(f.doc.body.dataset.pieceStyle, 'flat');
  assert.equal(f.doc.body.dataset.boardTheme, 'blue');
  assert.doesNotThrow(() => createAppearancePreferences({ document: f.doc }));
});

test('reset restores defaults and disposing controls prevents subsequent preference changes', () => {
  const f = fixture(), changed = [];
  const preferences = createAppearancePreferences({ document: f.doc, storage: f.storage, onChange: value => changed.push(value) });
  preferences.setPieceStyle('outline'); preferences.setBoardTheme('slate'); preferences.setAnnotationColor('#123456');
  preferences.reset(); assert.deepEqual(preferences.settings, DEFAULT_APPEARANCE);
  const count = changed.length;
  preferences.dispose();
  f.controls['piece-style'].value = 'medallion'; f.controls['piece-style'].dispatchEvent(new Event('change'));
  preferences.setPieceStyle('flat');
  assert.deepEqual(preferences.settings, DEFAULT_APPEARANCE);
  assert.equal(changed.length, count);
});

test('each non-glow style embeds distinct safe vector shapes for every ordinary and upgraded family', () => {
  for (const family of ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']) {
    const flat = pieceSvgMarkup({ family, style: 'flat', color: 'w' });
    const outline = pieceSvgMarkup({ family, style: 'outline', color: 'b', level: 2 });
    const medallion = pieceSvgMarkup({ family, style: 'medallion', color: 'w', level: 3 });
    assert.match(flat, /white-svg/); assert.match(outline, /black-svg/);
    assert.match(outline, /piece-accent/); assert.doesNotMatch(flat, /class="piece-accent"/);
    assert.match(medallion, /piece-coin/); assert.doesNotMatch(flat, /piece-coin/);
    for (const markup of [flat, outline, medallion]) assert.doesNotMatch(markup, /(?:<script|<image|href=|https?:|onload=|style=)/i);
  }
  const hostile = pieceSvgMarkup({ family: '"><script>bad</script>', style: 'flat" onclick="bad', color: '" onload="bad' });
  assert.doesNotMatch(hostile, /bad|onclick|onload|<script/);
});

test('piece rendering follows the selected style without changing its family, color or upgrade metadata', () => {
  const f = fixture(), attributes = {};
  const element = { ownerDocument: f.doc, dataset: {}, className: 'piece upgraded purple',
    setAttribute: (key, value) => { attributes[key] = value; } };
  f.doc.body.dataset.pieceStyle = 'outline';
  renderPieceIcon(element, { family: 'rook', type: 'a', color: 'b', level: 3, symbol: '♜' });
  assert.match(element.innerHTML, /outline-piece black-svg/);
  assert.equal(element.className, 'piece upgraded purple');
  assert.equal(attributes['aria-hidden'], 'true');
  f.doc.body.dataset.pieceStyle = 'glow';
  renderPieceIcon(element, { family: 'rook', color: 'b', symbol: '♜' });
  assert.equal(element.textContent, '♜');
  assert.equal(element.dataset.pieceStyle, 'glow');
});
