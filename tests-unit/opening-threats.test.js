'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createOpeningInspector, inspectPosition } = require('../scripts/balance/opening-threats');
const { placementFromMap } = require('../src/profile-fen');

const reflect = square => square[0] + (9 - Number(square[1]));
const swap = letter => letter === letter.toUpperCase() ? letter.toLowerCase() : letter.toUpperCase();
function fen(pieces, { black = false, turn = 'w', rights = '-', ep = '-' } = {}) {
  const map = new Map(Object.entries(pieces).map(([square, letter]) => black ? [reflect(square), swap(letter)] : [square, letter]));
  return `${placementFromMap(map)} ${black ? turn === 'w' ? 'b' : 'w' : turn} ${rights} ${black && ep !== '-' ? reflect(ep) : ep} 0 1`;
}
function profile(movement = 'NDmK', name = 'opening-threat-test') {
  const pawn = movement === 'fmWfceFifmnD';
  return { variant: name, config: `[${name}:chess]\ncustomPiece1 = a:${movement}\npieceToCharTable = -\n${pawn ? 'pawnTypes = pa\nenPassantTypes = pa\n' : ''}`,
    roles: { royalTypes: ['k'] }, definitionsByLetter: { a: { id: `test.${movement}@1`, movement, family: 'knight' } } };
}
let inspector;
test.before(async () => { inspector = await createOpeningInspector(profile()); });
test.after(() => inspector.close());

test('ordinary and upgraded pieces receive precise actual/hypothetical capture and recapture labels', () => {
  for (const black of [false, true]) {
    const square = black ? reflect('d4') : 'd4';
    const result = inspector.inspect(fen({ a1: 'K', h8: 'k', d4: 'A', g7: 'b' }, { black }));
    assert.equal(result.inCheck, false); assert.equal(result.terminal, null);
    const piece = result.upgradedPieces.find(row => row.square === square);
    assert.equal(piece.designId, 'test.NDmK@1');
    const threat = piece.captureThreats.find(row => row.move === (black ? reflect('g7') + reflect('d4') : 'g7d4'));
    assert.ok(threat); assert.equal(threat.actualTurn, false);
    assert.equal(threat.mode, 'hypothetical-opponent-turn');
    assert.deepEqual(threat.recaptures, []);
    assert.equal(threat.unrecapturedCandidate, true); assert.equal(threat.forcedMaterialLoss, false);
    const actual = inspector.inspect(fen({ a1: 'K', h8: 'k', d4: 'A', g7: 'b' }, { black, turn: 'b' }));
    assert.equal(actual.upgradedPieces.find(row => row.square === square).captureThreats[0].actualTurn, true);
    assert.ok(result.limits.some(note => note.includes('not proof')));
  }
});

test('a legal immediate recapture distinguishes defended targets from exposed candidates', () => {
  const result = inspector.inspect(fen({ a1: 'K', h8: 'k', d4: 'A', g7: 'b', c3: 'P' }));
  const threat = result.captureThreats.find(row => row.move === 'g7d4');
  assert.ok(threat); assert.deepEqual(threat.recaptures, ['c3d4']);
  assert.equal(threat.recaptureStatus, 'legal-immediate-recapture');
  assert.equal(threat.unrecapturedCandidate, false);
  const pinned = inspector.inspect(fen({ c1: 'K', h8: 'k', d4: 'A', d8: 'r', c8: 'r', c3: 'P' }));
  const unrecapturable = pinned.captureThreats.find(row => row.move === 'd8d4');
  assert.ok(unrecapturable); assert.deepEqual(unrecapturable.recaptures, []);
  assert.equal(unrecapturable.unrecapturedCandidate, true);
});

test('royal-shield pins cover both colors without claiming every move is forbidden', () => {
  for (const black of [false, true]) {
    const square = black ? reflect('e2') : 'e2';
    const result = inspector.inspect(fen({ e1: 'K', h8: 'k', e2: 'A', e8: 'r' }, { black }));
    const piece = result.upgradedPieces.find(row => row.square === square);
    assert.deepEqual(piece.royalShieldPin, { status: 'royal-shield-pin', exposesCheck: true });
    assert.ok(result.pins.some(row => row.square === square && row.kind === 'removal-exposes-own-king'));
    assert.ok(result.limits.some(note => note.includes('move along')));
  }
});

test('pinned attackers cannot create spurious legal capture threats', () => {
  const result = inspector.inspect(fen({ a1: 'K', f8: 'k', d4: 'A', f1: 'R', f5: 'n' }));
  assert.ok(result.pins.some(row => row.square === 'f5' && row.designId === null));
  assert.ok(!result.captureThreats.some(row => row.move === 'f5d4'));
});

test('quiet king steps never become attacks, while normal knight captures remain visible', () => {
  const result = inspector.inspect(fen({ a1: 'K', h8: 'k', d4: 'A', d5: 'r', e6: 'r' }));
  assert.ok(!result.captureThreats.some(row => row.move === 'd4d5'));
  const normal = result.captureThreats.find(row => row.move === 'd4e6');
  assert.ok(normal); assert.equal(normal.actualTurn, true);
  assert.equal(normal.victim.isUpgrade, false);
});

test('in-check positions keep actual evasions and skip the illegal opposite-turn question', () => {
  const result = inspector.inspect(fen({ e1: 'K', h8: 'k', d4: 'A', e8: 'r' }));
  assert.equal(result.inCheck, true);
  assert.equal(result.inspections.b.status, 'skipped-actual-side-in-check');
  assert.equal(result.upgradedPieces[0].royalShieldPin.status, 'unclassified-king-in-check');
  assert.ok(result.captureThreats.every(row => row.actualTurn));
});

test('ordinary-piece opening threats are inspected even when no upgraded piece is capturable', () => {
  const result = inspector.inspect('rnbqkbnr/pppp1p1p/6p1/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3');
  assert.deepEqual(result.upgradedPieces, []);
  const capture = result.captureThreats.find(row => row.move === 'f3e5');
  assert.ok(capture); assert.equal(capture.victim.letter, 'p');
  assert.equal(capture.actualTurn, true); assert.equal(capture.forcedMaterialLoss, false);
});

test('en-passant capture locates the removed upgraded pawn rather than the empty landing square', async () => {
  const pawn = await createOpeningInspector(profile('fmWfceFifmnD', 'opening-threat-pawn'));
  try {
    const result = pawn.inspect(fen({ a1: 'K', h8: 'k', e4: 'A', d4: 'p' }, { turn: 'b', ep: 'e3' }));
    const capture = result.captureThreats.find(row => row.move === 'd4e3');
    assert.ok(capture); assert.equal(capture.victim.square, 'e4'); assert.equal(capture.landingSquare, 'e3');
    assert.equal(capture.victim.designId, 'test.fmWfceFifmnD@1');
  } finally { pawn.close(); }
});

test('promotion captures preserve landing and immediate recapture checks', () => {
  const result = inspector.inspect(fen({ a1: 'K', h6: 'k', d8: 'A', c7: 'p' }, { turn: 'b' }));
  // Black's c7 pawn goes toward rank six; it cannot promote or capture d8.
  assert.ok(!result.captureThreats.some(row => row.move.startsWith('c7d8')));
  const white = inspector.inspect(fen({ a1: 'K', h6: 'k', d8: 'a', c7: 'P' }));
  const captures = white.captureThreats.filter(row => row.move.startsWith('c7d8'));
  assert.equal(captures.length, 4);
  assert.ok(captures.every(row => row.victim.designId === 'test.NDmK@1' && row.landingSquare === 'd8'));
});

test('checkmate/stalemate, closed inspectors, invalid profiles and cancellation are explicit', async () => {
  const mate = inspector.inspect('7k/6Q1/5K2/8/8/8/8/8 b - - 0 1');
  assert.equal(mate.inCheck, true); assert.deepEqual(mate.terminal, { reason: 'checkmate', result: '1-0' });
  const stale = inspector.inspect('7k/5Q2/5K2/8/8/8/8/8 b - - 0 1');
  assert.equal(stale.inCheck, false); assert.deepEqual(stale.terminal, { reason: 'stalemate', result: '1/2-1/2' });
  assert.throws(() => inspector.inspect('8/8/8/8/8/8/8/K7 w - - 0 1'), /one ordinary royal/);
  assert.throws(() => inspector.inspect('7k/7Q/8/8/8/8/8/K7 w - - 0 1'), /inactive king|Invalid opening tactic/);
  await assert.rejects(createOpeningInspector({}), /archived dynamic profile/);
  const copy = await createOpeningInspector(profile()); copy.close();
  assert.throws(() => copy.inspect(fen({ a1: 'K', h8: 'k' })), /closed/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(inspectPosition({ profile: profile(), fen: fen({ a1: 'K', h8: 'k' }), signal: controller.signal }), error => error.name === 'AbortError');
});

test('same-label profile contexts do not share movement tables or change an existing inspector', async () => {
  const first = await createOpeningInspector(profile('NDmK', 'opening-threat-same-label'));
  const second = await createOpeningInspector(profile('R', 'opening-threat-same-label'));
  const position = fen({ a1: 'K', h8: 'k', d4: 'A', d5: 'r' });
  try {
    assert.ok(!first.inspect(position).captureThreats.some(row => row.move === 'd4d5'));
    assert.ok(second.inspect(position).captureThreats.some(row => row.move === 'd4d5'));
    assert.ok(!first.inspect(position).captureThreats.some(row => row.move === 'd4d5'));
  } finally { first.close(); second.close(); }
});
