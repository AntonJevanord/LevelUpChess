'use strict';

// Analysis drawings are keyed by squares, independently of piece selection or
// the game state. Nothing in this module can play a move or alter the rules.
const SVG_NS = 'http://www.w3.org/2000/svg';
const SQUARE = /^[a-h][1-8]$/;
const DEFAULT_COLOR = '#edc34b';

function squareCenter(square, flipped = false) {
  if (!SQUARE.test(square)) throw new Error('An annotation needs a board square.');
  const file = square.charCodeAt(0) - 97, rank = Number(square[1]) - 1;
  return flipped ? { x: 7.5 - file, y: rank + 0.5 } : { x: file + 0.5, y: 7.5 - rank };
}

function squareAtPoint(x, y, bounds, flipped = false) {
  if (![x, y, bounds?.left, bounds?.top, bounds?.width, bounds?.height].every(Number.isFinite)
    || bounds.width <= 0 || bounds.height <= 0) return null;
  const file = Math.floor(8 * (x - bounds.left) / bounds.width);
  const row = Math.floor(8 * (y - bounds.top) / bounds.height);
  if (file < 0 || file > 7 || row < 0 || row > 7) return null;
  return 'abcdefgh'[flipped ? 7 - file : file] + String(flipped ? row + 1 : 8 - row);
}

function arrowShape(from, to, flipped = false) {
  const start = squareCenter(from, flipped), tip = squareCenter(to, flipped);
  const dx = tip.x - start.x, dy = tip.y - start.y, length = Math.hypot(dx, dy);
  if (!length) return null;
  const ux = dx / length, uy = dy / length;
  const base = { x: tip.x - ux * 0.32, y: tip.y - uy * 0.32 };
  return { start, end: { x: tip.x - ux * 0.22, y: tip.y - uy * 0.22 },
    head: [tip, { x: base.x - uy * 0.19, y: base.y + ux * 0.19 },
      { x: base.x + uy * 0.19, y: base.y - ux * 0.19 }] };
}

function createAnnotationModel() {
  const entries = new Map();
  return {
    toggle(from, to = from) {
      if (!SQUARE.test(from) || !SQUARE.test(to)) throw new Error('An annotation needs board squares.');
      const kind = from === to ? 'circle' : 'arrow', key = `${from}:${to}`;
      if (entries.has(key)) entries.delete(key);
      else entries.set(key, { kind, from, to });
      return this.snapshot();
    },
    clear() { const changed = entries.size > 0; entries.clear(); return changed; },
    snapshot() { return [...entries.values()].map(entry => ({ ...entry })); },
  };
}

/** Right drag draws; the optional drawing mode gives touch/left drag the same
 * gesture. Pointer capture keeps a drag alive across squares or outside edges.
 * Root controls when position changes clear drawings and when a board is flipped.
 */
function createBoardAnnotations({ stage, board, svg, isFlipped = () => false,
  color = () => DEFAULT_COLOR, onChange = () => {} } = {}) {
  if (!stage || !board || !board.ownerDocument) throw new Error('Annotations need the board and its stage.');
  const document = board.ownerDocument, view = document.defaultView;
  const ownsSvg = !svg;
  if (!svg) {
    svg = document.createElementNS(SVG_NS, 'svg');
    svg.id = 'board-annotations'; stage.append(svg);
  }
  svg.classList.add('board-annotations');
  svg.setAttribute('viewBox', '0 0 8 8');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  Object.assign(svg.style, { position: 'absolute', pointerEvents: 'none', overflow: 'hidden', zIndex: '4' });
  const model = createAnnotationModel(), listeners = [];
  let drawing = false, gesture = null, suppressClick = false, disposed = false;
  const originalTouchAction = board.style.touchAction;

  function bounds() {
    const rect = board.getBoundingClientRect();
    const borderX = board.clientLeft || 0, borderY = board.clientTop || 0;
    return { left: rect.left + borderX, top: rect.top + borderY,
      width: board.clientWidth || Math.max(0, rect.width - 2 * borderX),
      height: board.clientHeight || Math.max(0, rect.height - 2 * borderY) };
  }
  const at = event => squareAtPoint(event.clientX, event.clientY, bounds(), Boolean(isFlipped()));
  const consume = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  function element(name, attributes) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    return node;
  }
  function draw(entry, preview = false) {
    const flipped = Boolean(isFlipped()), tint = /^#[0-9a-f]{6}$/i.test(color()) ? color() : DEFAULT_COLOR;
    const group = element('g', { opacity: preview ? 0.48 : 0.78,
      'data-annotation': entry.kind, 'data-kind': entry.kind, 'data-from': entry.from, 'data-to': entry.to });
    if (entry.kind === 'circle') group.setAttribute('data-square', entry.from);
    if (preview) group.setAttribute('data-preview', 'true');
    if (entry.kind === 'circle') {
      const center = squareCenter(entry.from, flipped);
      group.append(element('circle', { class: 'annotation-circle', cx: center.x, cy: center.y,
        r: 0.43, fill: 'none', stroke: tint, 'stroke-width': 0.065 }));
    } else {
      const shape = arrowShape(entry.from, entry.to, flipped);
      group.append(element('line', { class: 'annotation-arrow', x1: shape.start.x, y1: shape.start.y,
        x2: shape.end.x, y2: shape.end.y, stroke: tint, 'stroke-width': 0.12, 'stroke-linecap': 'round' }),
      element('polygon', { class: 'annotation-arrowhead', points: shape.head.map(point => `${point.x},${point.y}`).join(' '), fill: tint }));
    }
    return group;
  }
  function render() {
    if (disposed) return;
    const area = bounds(), parent = stage.getBoundingClientRect();
    Object.assign(svg.style, { left: `${area.left - parent.left + (stage.scrollLeft || 0) - (stage.clientLeft || 0)}px`,
      top: `${area.top - parent.top + (stage.scrollTop || 0) - (stage.clientTop || 0)}px`,
      width: `${area.width}px`, height: `${area.height}px` });
    const drawings = model.snapshot().map(entry => draw(entry));
    if (gesture?.to) drawings.push(draw({ kind: gesture.from === gesture.to ? 'circle' : 'arrow', from: gesture.from, to: gesture.to }, true));
    svg.replaceChildren(...drawings);
  }
  function release(pointerId) {
    try { board.releasePointerCapture?.(pointerId); } catch { /* Already released by the browser. */ }
  }
  function cancelGesture() {
    const previous = gesture; gesture = null;
    if (previous) release(previous.pointerId);
    render();
  }
  function pointerDown(event) {
    if (gesture) return;
    suppressClick = false;
    if (event.button !== 2 && !(drawing && event.button === 0)) return;
    const from = at(event);
    if (!from) return;
    consume(event);
    suppressClick = event.button === 0;
    gesture = { pointerId: event.pointerId, from, to: from };
    try { board.setPointerCapture?.(event.pointerId); } catch { /* Capture is optional in older browsers. */ }
    render();
  }
  function pointerMove(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    consume(event); gesture.to = at(event); render();
  }
  function pointerUp(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    consume(event);
    const previous = gesture, to = at(event); gesture = null; release(previous.pointerId);
    if (to) { model.toggle(previous.from, to); onChange(model.snapshot()); }
    render();
  }
  function pointerCancel(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    consume(event); cancelGesture();
  }
  function click(event) {
    if (!drawing && !(suppressClick && event.detail !== 0)) return;
    consume(event); suppressClick = false;
    // Keyboard activation has no pointer gesture. Make Space/Enter useful when
    // drawing is enabled without blocking keyboard piece selection otherwise.
    if (drawing && event.detail === 0) {
      const square = event.target?.closest?.('[data-square]')?.dataset.square;
      if (SQUARE.test(square)) { model.toggle(square); onChange(model.snapshot()); render(); }
    }
  }
  function keyDown(event) {
    if (event.key !== 'Escape') return;
    // A drawing can be cleared while an unrelated text field has focus, but
    // do not consume Escape from dialogs or other existing application controls.
    clear();
  }
  function clear() {
    cancelGesture();
    if (model.clear()) { render(); onChange(model.snapshot()); }
  }
  function listen(target, name, handler, options) {
    target.addEventListener(name, handler, options);
    listeners.push(() => target.removeEventListener(name, handler, options));
  }
  listen(board, 'pointerdown', pointerDown, { capture: true });
  listen(board, 'pointermove', pointerMove, { capture: true });
  listen(board, 'pointerup', pointerUp, { capture: true });
  listen(board, 'pointercancel', pointerCancel, { capture: true });
  listen(board, 'lostpointercapture', event => {
    if (gesture && event.pointerId === gesture.pointerId) { gesture = null; render(); }
  });
  listen(board, 'click', click, { capture: true });
  listen(board, 'contextmenu', event => event.preventDefault());
  listen(document, 'keydown', keyDown);
  if (view) listen(view, 'resize', render);
  const Observer = view?.ResizeObserver;
  const observer = Observer ? new Observer(render) : null;
  observer?.observe(board);
  render();

  return {
    setDrawing(value) {
      if (disposed) return;
      drawing = Boolean(value); cancelGesture();
      board.style.touchAction = drawing ? 'none' : originalTouchAction;
      board.classList.toggle('drawing-board', drawing);
    },
    clear,
    render,
    snapshot: () => model.snapshot(),
    dispose() {
      if (disposed) return;
      cancelGesture(); disposed = true;
      for (const remove of listeners) remove();
      observer?.disconnect();
      board.style.touchAction = originalTouchAction;
      board.classList.remove('drawing-board');
      svg.replaceChildren(); if (ownsSvg) svg.remove();
    },
  };
}

module.exports = { DEFAULT_COLOR, squareCenter, squareAtPoint, arrowShape, createAnnotationModel, createBoardAnnotations };
