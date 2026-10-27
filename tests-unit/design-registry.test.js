'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { DESIGNS, STANDARD_TYPES, LEGACY_DESIGN_IDS, getDesign } = require('../src/design-catalog');
const { PLAYABLE_DESIGN_IDS, PLAYABLE_LIBRARIES } = require('../src/playable-library');
const { createDesignRegistry, restoreDesignRegistry, allocateDesigns } = require('../scripts/balance/design-registry');

const designIds = Object.keys(DESIGNS);
const originalDesignIds = [
  'knight.blue@1', 'knight.orange@1', 'knight.purple@1',
  'bishop.blue@1', 'bishop.orange@1', 'bishop.purple@1',
  'queen.blue@1', 'queen.orange@1', 'queen.purple@1',
  'pawn.blue@1', 'pawn.orange@1', 'pawn.purple@1', 'pawn.purple@2',
  'rook.blue@1', 'rook.orange@1', 'rook.purple@1', 'rook.purple@2',
];
function experiment(upgradesA = {}, upgradesB = {}) {
  return { schemaVersion: 2, comparisons: [{ id: 'test', armyA: { upgrades: upgradesA }, armyB: { upgrades: upgradesB } }] };
}
function registry(ids) {
  return createDesignRegistry(experiment(Object.fromEntries(ids.map((id, index) => [`selection${index}`, id]))));
}
const clone = value => JSON.parse(JSON.stringify(value));
function rehash(snapshot) {
  const { schemaVersion, definitions, allocations } = snapshot;
  snapshot.hash = createHash('sha256').update(JSON.stringify({ schemaVersion, definitions, allocations })).digest('hex');
}

test('the catalog preserves all 15 legacy definitions and retains explicit placement roles', () => {
  const config = fs.readFileSync(path.join(__dirname, '../variants/levelup-v5.ini'), 'utf8');
  const legacy = [...config.matchAll(/^customPiece(\d+) = ([a-z]):([^\r\n]+)$/gm)];
  assert.equal(legacy.length, 15);
  assert.equal(Object.keys(LEGACY_DESIGN_IDS).length, 15);
  for (const [, slot, type, movement] of legacy) {
    const design = DESIGNS[LEGACY_DESIGN_IDS[type]];
    assert.equal(design.movement, movement);
    assert.equal(design.legacyType, type);
    assert.equal(design.legacySlot, Number(slot));
    assert.equal(design.revision, 1);
  }
  assert.equal(getDesign('pawn.purple@1').movement, 'mRceB');
  assert.equal(getDesign('pawn.purple@2').movement, 'mR2ceB');
  assert.equal(getDesign('rook.purple@1').movement, 'RcFcAcNcD');
  assert.equal(getDesign('rook.purple@2').movement, 'RcN');
  assert.equal(getDesign('knight.orange@2').level, 2, 'the historical price remains immutable');
  assert.equal(getDesign('knight.orange@2').movement, 'NC');
  assert.equal(getDesign('knight.purple@3').level, 3);
  assert.equal(getDesign('knight.purple@3').movement, 'NC', 'repricing adds no diagonal moves');
  assert.deepEqual(getDesign('pawn.purple@2').roles, { pawn: true, castlingRook: false, enPassant: true });
  assert.deepEqual(getDesign('rook.purple@2').roles, { pawn: false, castlingRook: true, enPassant: false });
  assert.equal(getDesign('knight.purple@1').placement, 'extra');
  assert.deepEqual(getDesign('knight.purple@1').extraSquare, { b1: 'b3', g1: 'g3' });
  assert.throws(() => { DESIGNS['pawn.purple@1'].movement = 'Q'; }, TypeError);
  assert.throws(() => { DESIGNS['knight.purple@1'].extraSquare.b1 = 'b4'; }, TypeError);
  assert.throws(() => { DESIGNS['pawn.purple@1'].roles.pawn = false; }, TypeError);
  assert.equal(getDesign('__proto__'), undefined);
  assert.equal(getDesign('pawn.purple@999'), undefined);
});

test('the union across both armies and comparisons is independent of ordering and duplicate selections', () => {
  const first = experiment({ a2: 'pawn.blue@1', b1: 'knight.purple@1' }, { a2: 'pawn.blue@1', a1: 'rook.purple@2' });
  first.comparisons.push({ armyA: { upgrades: { c1: 'bishop.blue@1' } }, armyB: { upgrades: { a2: 'pawn.blue@1' } } });
  const second = {
    schemaVersion: 2,
    comparisons: [...first.comparisons].reverse().map(comparison => ({ armyA: comparison.armyB, armyB: comparison.armyA })),
  };
  const snapshot = createDesignRegistry(first);
  assert.deepEqual(snapshot, createDesignRegistry(second));
  assert.equal(snapshot.definitions.length, 4);
  assert.equal(snapshot.allocations.filter(allocation => allocation.id === 'pawn.blue@1').length, 1, 'opposite colors share one engine movement type');
  assert.deepEqual(snapshot.definitions.map(definition => definition.id), ['bishop.blue@1', 'knight.purple@1', 'pawn.blue@1', 'rook.purple@2']);
  assert.match(snapshot.hash, /^[a-f0-9]{64}$/);
});

test('unchanged legacy letters and slots survive allocation; revisions coexist with separate identities', () => {
  const current = registry(Object.values(LEGACY_DESIGN_IDS));
  for (const allocation of current.allocations) {
    const design = DESIGNS[allocation.id];
    assert.deepEqual(allocation, { id: design.id, letter: design.legacyType, slot: design.legacySlot });
  }
  const all = registry(originalDesignIds);
  for (const previous of current.allocations) assert.deepEqual(all.allocations.find(allocation => allocation.id === previous.id), previous);
  const newPawn = all.allocations.find(allocation => allocation.id === 'pawn.purple@2');
  assert.notEqual(newPawn.letter, DESIGNS['pawn.purple@2'].legacyType);
  assert.notEqual(newPawn.slot, DESIGNS['pawn.purple@2'].legacySlot);
  const alone = registry(['pawn.purple@2']).allocations[0];
  assert.deepEqual(alone, { id: 'pawn.purple@2', letter: 'd', slot: 11 });
  assert.notEqual(alone.letter, newPawn.letter, 'a design has no global engine letter');
  assert.notEqual(all.hash, current.hash);
});

test('a curated 20-design library fits while the complete catalog exceeds letter capacity', () => {
  const allocated = allocateDesigns(PLAYABLE_DESIGN_IDS);
  const reserved = new Set(Object.values(STANDARD_TYPES));
  assert.equal(allocated.length, 20);
  assert.equal(new Set(allocated.map(allocation => allocation.letter)).size, 20);
  assert.equal(new Set(allocated.map(allocation => allocation.slot)).size, 20);
  for (const allocation of allocated) {
    assert.ok(!reserved.has(allocation.letter));
    assert.ok(allocation.slot >= 1 && allocation.slot <= 25);
  }
  assert.deepEqual(restoreDesignRegistry(clone(registry(PLAYABLE_DESIGN_IDS))), registry(PLAYABLE_DESIGN_IDS));
  assert.ok(Object.isFrozen(PLAYABLE_DESIGN_IDS));
  assert.ok(!PLAYABLE_DESIGN_IDS.includes('pawn.purple@2'));
  assert.ok(!PLAYABLE_DESIGN_IDS.includes('knight.purple@1'));
  assert.ok(!PLAYABLE_DESIGN_IDS.includes('knight.orange@2'));
  assert.ok(PLAYABLE_DESIGN_IDS.includes('knight.purple@3'));
  for (const id of ['pawn.purple@7', 'pawn.purple@8', 'pawn.purple@9', 'pawn.purple@5', 'pawn.orange@2', 'knight.purple@2', 'bishop.purple@3', 'bishop.purple@4', 'rook.purple@4', 'queen.purple@4']) assert.ok(PLAYABLE_DESIGN_IDS.includes(id));
  for (const id of ['rook.purple@1', 'queen.purple@2', 'pawn.purple@1', 'pawn.purple@3', 'pawn.purple@4']) assert.ok(!PLAYABLE_DESIGN_IDS.includes(id));
  for (const library of PLAYABLE_LIBRARIES) {
    assert.equal(allocateDesigns(library.designIds).length, library.designIds.length);
    assert.ok(library.designIds.length <= 20);
    assert.deepEqual(restoreDesignRegistry(clone(registry(library.designIds))), registry(library.designIds));
  }
  const capacityError = new RegExp(`need ${designIds.length} custom letters; only 20 are available`);
  assert.throws(() => allocateDesigns(designIds), capacityError);
  assert.throws(() => registry(designIds), capacityError);
});

test('standard promotion types remain reserved alongside additional helper letters', () => {
  const helperReserved = allocateDesigns(['pawn.blue@1'], { reservedLetters: ['A', 'V'] });
  assert.notEqual(helperReserved[0].letter, 'a');
  assert.notEqual(helperReserved[0].letter, 'v');
  assert.equal(helperReserved[0].slot, 9, 'letter renaming need not change the engine slot');
  assert.throws(() => allocateDesigns(originalDesignIds, { reservedLetters: 'vwxy' }), /only 16 are available/);
  assert.throws(() => allocateDesigns(['pawn.blue@1'], { reservedLetters: 'abcdefghijklmnopqrstuvwxyz' }), /only 0 are available/);
  assert.throws(() => allocateDesigns(['pawn.blue@1'], { reservedLetters: ['aa'] }), /ASCII letters/);
  assert.throws(() => allocateDesigns(['pawn.blue@1'], { reservedLetters: null }), /Reserved letters/);
});

test('registry snapshots are JSON-safe, immutable, and reconstructed from verified bundled definitions', () => {
  const input = experiment({ d2: 'pawn.purple@1', b1: 'knight.purple@1' }, { d2: 'pawn.purple@2', a1: 'rook.purple@2' });
  const before = clone(input);
  const snapshot = createDesignRegistry(input);
  assert.deepEqual(input, before);
  const parsed = clone(snapshot);
  const restored = restoreDesignRegistry(parsed);
  assert.deepEqual(restored, snapshot);
  parsed.definitions[0].movement = 'Q';
  assert.deepEqual(restored, snapshot);
  assert.throws(() => { restored.allocations[0].letter = 'z'; }, TypeError);
  assert.throws(() => { restored.definitions.push({}); }, TypeError);
  const reordered = clone(snapshot);
  reordered.definitions.reverse();
  reordered.allocations.reverse();
  assert.deepEqual(restoreDesignRegistry(reordered), snapshot, 'serialization order does not replace canonical ASCII ordering');
  const empty = createDesignRegistry(experiment());
  assert.deepEqual(empty.allocations, []);
  assert.deepEqual(restoreDesignRegistry(clone(empty)), empty);
});

test('snapshot checks reject edited behavior or roles even after an attacker recomputes the hash', () => {
  const original = registry(['pawn.purple@2', 'rook.purple@2']);
  for (const edit of [
    snapshot => { snapshot.definitions[0].movement = 'mRceB'; },
    snapshot => { snapshot.definitions[0].roles.pawn = false; },
    snapshot => { snapshot.definitions[0].roles.enPassant = false; },
    snapshot => { snapshot.definitions[1].placement = 'extra'; },
    snapshot => { snapshot.definitions[1].roles.castlingRook = false; },
  ]) {
    const changed = clone(original);
    edit(changed);
    rehash(changed);
    assert.throws(() => restoreDesignRegistry(changed), /does not match the bundled catalog/);
  }
  // Movement spelling alone never authorizes a role change or an arbitrary ID.
  const untrusted = clone(original);
  untrusted.definitions[0].id = 'guard.purple@1';
  untrusted.allocations[0].id = 'guard.purple@1';
  rehash(untrusted);
  assert.throws(() => restoreDesignRegistry(untrusted), /bundled catalog/);
});

test('snapshot checks reject hash tampering, standard letters, collisions, and noncanonical reallocations', () => {
  const original = registry(['pawn.purple@1', 'pawn.purple@2']);
  const edits = [
    snapshot => { snapshot.hash = '0'.repeat(64); },
    snapshot => { snapshot.schemaVersion = 2; },
    snapshot => { snapshot.unknown = true; },
    snapshot => { snapshot.definitions.push(clone(snapshot.definitions[0])); },
    snapshot => { snapshot.allocations[0].letter = 'q'; },
    snapshot => { snapshot.allocations[0].letter = 'D'; },
    snapshot => { snapshot.allocations[0].slot = 26; },
    snapshot => { snapshot.allocations[0].slot = 1.5; },
    snapshot => { snapshot.allocations[0].letter = snapshot.allocations[1].letter; },
    snapshot => { snapshot.allocations[0].slot = snapshot.allocations[1].slot; },
    snapshot => { snapshot.allocations.pop(); },
    snapshot => { snapshot.allocations[0].id = 'rook.purple@2'; },
    snapshot => { snapshot.allocations[0].letter = 'z'; rehash(snapshot); },
  ];
  for (const edit of edits) {
    const changed = clone(original);
    edit(changed);
    assert.throws(() => restoreDesignRegistry(changed));
  }
  const oversized = clone(original);
  oversized.allocations = Array(21).fill(oversized.allocations[0]);
  assert.throws(() => restoreDesignRegistry(oversized), /available custom letters or slots/);
});

test('numeric legacy setups and arbitrary definitions cannot enter a schema2 registry', () => {
  for (const config of [
    { ...experiment(), schemaVersion: 1 },
    experiment({ a2: 1 }),
    experiment({ a2: { id: 'pawn.blue@1', movement: 'Q' } }),
    experiment({ a2: 'pawn.blue@99' }),
    { schemaVersion: 2, comparisons: [] },
    { schemaVersion: 2, comparisons: [{ armyA: {}, armyB: null }] },
  ]) assert.throws(() => createDesignRegistry(config));
  assert.throws(() => allocateDesigns(['guard.purple@1']), /Unknown design ID/);
  assert.throws(() => restoreDesignRegistry(null), /must be an object/);
});
