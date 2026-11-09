'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_COLOR, squareCenter, squareAtPoint, arrowShape, createAnnotationModel,
  createBoardAnnotations } = require('../src/board-annotations');

class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, handler, options) {
    const entries = this.listeners.get(type) || [];
    entries.push({ handler, options }); this.listeners.set(type, entries);
  }
  removeEventListener(type, handler) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter(entry => entry.handler !== handler));
  }
  fire(type, fields = {}) {
    const event = { type, defaultPrevented: false, stopped: false, target: this,
      preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...fields };
    const capture = entry => Boolean(entry.options === true || entry.options?.capture);
    for (const { handler } of [...this.listeners.get(type) || []].sort((a, b) => Number(capture(b)) - Number(capture(a)))) {
      handler(event); if (event.stopped) break;
    }
    return event;
  }
}
class Element extends Target {
  constructor(document, tag = 'div') {
    super(); this.ownerDocument = document; this.tagName = tag; this.children = []; this.attributes = {};
    this.style = { touchAction: 'pan-y' }; this.dataset = {}; this.rect = { left: 90, top: 190, width: 812, height: 812 };
    const classes = new Set();
    this.classList = { add: value => classes.add(value), remove: value => classes.delete(value),
      contains: value => classes.has(value), toggle(value, enabled) { if (enabled) classes.add(value); else classes.delete(value); } };
  }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key]; }
  getBoundingClientRect() { return this.rect; }
}
function fixture({ suppliedSvg = false } = {}) {
  const document = new Target(), view = new Target(), observers = [];
  document.defaultView = view;
  view.ResizeObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(target) { this.target = target; }
    disconnect() { this.disconnected = true; }
  };
  document.createElementNS = (namespace, tag) => new Element(document, tag);
  const stage = new Element(document), board = new Element(document);
  Object.assign(board, { rect: { left: 100, top: 200, width: 812, height: 812 }, clientLeft: 6, clientTop: 6,
    clientWidth: 800, clientHeight: 800 });
  stage.append(board);
  const captures = new Set();
  board.setPointerCapture = id => captures.add(id);
  board.releasePointerCapture = id => { if (captures.delete(id)) board.fire('lostpointercapture', { pointerId: id }); };
  const svg = suppliedSvg ? new Element(document, 'svg') : undefined;
  if (svg) stage.append(svg);
  let flipped = false, tint = DEFAULT_COLOR;
  const changes = [];
  const api = createBoardAnnotations({ stage, board, svg, isFlipped: () => flipped, color: () => tint,
    onChange: entries => changes.push(entries) });
  const actualSvg = svg || stage.children.find(child => child.tagName === 'svg');
  function point(square) {
    const center = squareCenter(square, flipped);
    return { clientX: board.rect.left + board.clientLeft + center.x * board.clientWidth / 8,
      clientY: board.rect.top + board.clientTop + center.y * board.clientHeight / 8 };
  }
  function draw(from, to = from, { button = 2, pointerId = 1, pointerType = 'mouse' } = {}) {
    const down = board.fire('pointerdown', { ...point(from), button, pointerId, pointerType });
    board.fire('pointermove', { ...point(to), pointerId, pointerType });
    const up = board.fire('pointerup', { ...point(to), button, pointerId, pointerType });
    return { down, up };
  }
  return { document, view, board, stage, api, svg: actualSvg, captures, observers, changes, point, draw,
    flip() { flipped = !flipped; api.render(); }, recolor(color) { tint = color; api.render(); } };
}

test('algebraic coordinates map to the same squares after flips, respecting exact board bounds', () => {
  const bounds = { left: 20, top: 40, width: 800, height: 400 };
  assert.deepEqual(squareCenter('a8'), { x: 0.5, y: 0.5 });
  assert.deepEqual(squareCenter('h1', true), { x: 0.5, y: 0.5 });
  for (const flipped of [false, true]) for (const file of 'abcdefgh') for (const rank of '12345678') {
    const square = file + rank, center = squareCenter(square, flipped);
    assert.equal(squareAtPoint(bounds.left + center.x * 100, bounds.top + center.y * 50, bounds, flipped), square);
  }
  for (const [x, y] of [[19, 40], [20, 39], [820, 40], [20, 440]]) assert.equal(squareAtPoint(x, y, bounds), null);
  assert.equal(squareAtPoint(20, 40, bounds), 'a8');
  assert.equal(squareAtPoint(20, 40, { ...bounds, width: 0 }), null);
  assert.equal(squareAtPoint(NaN, 40, bounds), null);
  assert.throws(() => squareCenter('i4'), /board square/);
});

test('annotation toggles are directed, bounded to squares and detached from callers', () => {
  const model = createAnnotationModel();
  model.toggle('e4'); model.toggle('a1', 'h8'); model.toggle('h8', 'a1');
  const copy = model.snapshot(); copy[0].from = 'a1'; copy.pop();
  assert.equal(model.snapshot().length, 3); assert.equal(model.snapshot()[0].from, 'e4');
  model.toggle('a1', 'h8'); assert.equal(model.snapshot().length, 2);
  model.toggle('e4'); assert.deepEqual(model.snapshot(), [{ kind: 'arrow', from: 'h8', to: 'a1' }]);
  assert.throws(() => model.toggle('e9'), /board squares/);
  assert.equal(model.clear(), true); assert.equal(model.clear(), false);
});

test('arrows keep their tip at the target and their shaft behind the arrow head in either orientation', () => {
  for (const flipped of [false, true]) for (const to of ['d8', 'h4', 'g7', 'b5']) {
    const shape = arrowShape('d4', to, flipped), start = squareCenter('d4', flipped), tip = squareCenter(to, flipped);
    assert.deepEqual(shape.start, start); assert.deepEqual(shape.head[0], tip);
    assert.ok(Math.abs(Math.hypot(shape.end.x - tip.x, shape.end.y - tip.y) - 0.22) < 1e-12);
    assert.ok(Math.hypot(shape.end.x - start.x, shape.end.y - start.y) < Math.hypot(tip.x - start.x, tip.y - start.y));
  }
  assert.equal(arrowShape('d4', 'd4'), null);
});

test('right clicks and drags draw without consuming normal left play, and overlay geometry excludes the border', () => {
  const f = fixture(); let plays = 0; f.board.addEventListener('click', () => plays++);
  const left = f.board.fire('pointerdown', { ...f.point('e4'), pointerId: 4, button: 0 });
  assert.equal(left.defaultPrevented, false);
  f.board.fire('click', { detail: 1 }); assert.equal(plays, 1);
  assert.equal(f.draw('e4').down.defaultPrevented, true);
  f.draw('d2', 'd4');
  assert.deepEqual(f.api.snapshot(), [{ kind: 'circle', from: 'e4', to: 'e4' }, { kind: 'arrow', from: 'd2', to: 'd4' }]);
  assert.equal(f.svg.style.left, '16px'); assert.equal(f.svg.style.top, '16px');
  assert.equal(f.svg.style.width, '800px'); assert.equal(f.svg.style.pointerEvents, 'none');
  assert.equal(f.svg.getAttribute('aria-hidden'), 'true');
  assert.equal(f.board.fire('contextmenu').defaultPrevented, true);
  f.draw('e4'); assert.equal(f.api.snapshot().length, 1);
  assert.equal(f.changes.length, 3); assert.equal(f.captures.size, 0);
});

test('touch drawing blocks the generated gameplay click even if drawing is disabled before it arrives', () => {
  const f = fixture(); let plays = 0; f.board.addEventListener('click', () => plays++);
  f.api.setDrawing(true); assert.equal(f.board.style.touchAction, 'none');
  f.draw('a1', 'h8', { button: 0, pointerType: 'touch' });
  f.api.setDrawing(false); assert.equal(f.board.style.touchAction, 'pan-y');
  assert.equal(f.board.fire('click', { detail: 1 }).defaultPrevented, true); assert.equal(plays, 0);
  f.board.fire('pointerdown', { ...f.point('b2'), pointerId: 2, button: 0 });
  assert.equal(f.board.fire('click', { detail: 1 }).defaultPrevented, false); assert.equal(plays, 1);
  f.api.setDrawing(true);
  const square = { closest: () => ({ dataset: { square: 'b2' } }) };
  f.board.fire('click', { detail: 0, target: square });
  assert.ok(f.api.snapshot().some(entry => entry.from === 'b2' && entry.kind === 'circle'));
});

test('cancelled, lost-capture and outside drags never commit, and a second pointer cannot steal a drawing', () => {
  const f = fixture();
  f.board.fire('pointerdown', { ...f.point('a1'), pointerId: 1, button: 2 });
  f.board.fire('pointerup', { ...f.point('h8'), pointerId: 2, button: 2 });
  assert.equal(f.api.snapshot().length, 0);
  f.board.fire('pointercancel', { pointerId: 1 }); assert.equal(f.svg.children.length, 0);
  f.board.fire('pointerdown', { ...f.point('a1'), pointerId: 3, button: 2 });
  f.board.fire('pointerup', { clientX: 1, clientY: 1, pointerId: 3, button: 2 });
  assert.equal(f.api.snapshot().length, 0);
  f.board.fire('pointerdown', { ...f.point('a1'), pointerId: 4, button: 2 });
  f.board.fire('lostpointercapture', { pointerId: 4 });
  f.board.fire('pointerup', { ...f.point('h8'), pointerId: 4, button: 2 });
  assert.equal(f.api.snapshot().length, 0); assert.equal(f.changes.length, 0);
});

test('flip, resize and recolor update presentation without changing square identities', () => {
  const f = fixture(); f.draw('e4'); f.draw('a1', 'h8');
  const before = f.api.snapshot(), old = f.svg.children[0].children[0];
  assert.equal(old.getAttribute('cx'), '4.5'); assert.equal(old.getAttribute('r'), '0.43');
  f.flip();
  assert.equal(f.svg.children[0].children[0].getAttribute('cx'), '3.5');
  assert.deepEqual(f.api.snapshot(), before);
  f.recolor('#123456'); assert.equal(f.svg.children[0].children[0].getAttribute('stroke'), '#123456');
  f.recolor('url(untrusted)'); assert.equal(f.svg.children[0].children[0].getAttribute('stroke'), DEFAULT_COLOR);
  f.board.clientWidth = 400; f.view.fire('resize'); assert.equal(f.svg.style.width, '400px');
  assert.deepEqual(f.api.snapshot(), before);
});

test('Escape clears drawings and cancels a preview without consuming another control’s Escape', () => {
  const f = fixture(); f.draw('d4');
  f.board.fire('pointerdown', { ...f.point('a1'), pointerId: 1, button: 2 });
  const key = f.document.fire('keydown', { key: 'Escape' });
  assert.equal(key.defaultPrevented, false); assert.deepEqual(f.api.snapshot(), []); assert.equal(f.svg.children.length, 0);
  f.board.fire('pointerup', { ...f.point('h8'), pointerId: 1, button: 2 });
  assert.deepEqual(f.api.snapshot(), []);
});

test('dispose removes event handlers, capture state, generated markup and touch overrides', () => {
  const f = fixture(); f.api.setDrawing(true); f.draw('d4');
  f.api.dispose(); f.api.dispose();
  assert.equal(f.stage.children.includes(f.svg), false); assert.equal(f.board.style.touchAction, 'pan-y');
  assert.equal(f.observers[0].disconnected, true);
  f.draw('a1', 'h8'); assert.equal(f.board.fire('contextmenu').defaultPrevented, false);
  assert.equal(f.api.snapshot().length, 1, 'Disposal does not make later pointer events mutate the stored drawing.');
  const provided = fixture({ suppliedSvg: true }); provided.api.dispose();
  assert.equal(provided.stage.children.includes(provided.svg), true); assert.equal(provided.svg.children.length, 0);
});
