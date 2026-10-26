'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { verifySimpleInventory, simpleHistoricalPositions, checkBishopCompatibility } = require('../scripts/balance/bishop-compatibility');
const { getBishopProtocol } = require('../scripts/balance/bishop-plan');
const copy = value => structuredClone(value);
const fields = ['rawMg', 'rawEg', 'captureMg', 'captureEg', 'evalMg', 'evalEg'];

function inventory() {
  const library = getBishopProtocol(), simpleManifest = library.sourceManifest;
  const simpleValues = copy(library.parentManifest.native.pieceValues);
  for (const allocation of simpleManifest.plan.registry.allocations) {
    if (simpleValues.pieces[allocation.letter]) continue;
    const policy = simpleManifest.plan.profile.evaluation?.pieceValues?.[allocation.id];
    for (const letter of [allocation.letter, allocation.letter.toUpperCase()]) {
      simpleValues.pieces[letter] = policy
        ? Object.fromEntries(fields.map(field => [field, policy[field.endsWith('Mg') ? 'mg' : 'eg']]))
        : { ...simpleValues.pieces.R };
    }
  }
  const currentValues = copy(simpleValues);
  for (const allocation of library.registry.allocations) for (const letter of [allocation.letter, allocation.letter.toUpperCase()]) {
    currentValues.pieces[letter] ||= { ...simpleValues.pieces.R };
  }
  return { library, simpleManifest, simpleValues, currentValues };
}

function fakeRules() {
  return { createBoard(fen) {
    let ply = 0;
    return { outcome() { return null; }, push() { ply++; return true; },
      fen() { const parts = fen.split(' '); parts[5] = String(ply + 1); return parts.join(' '); },
      moves() { return ['a1a2']; }, dispose() {} };
  } };
}
function fakeEngine(values, requests = [], hooks = {}) {
  return {
    path: 'test-engine',
    async start() { hooks.started?.(); }, async close() { hooks.closed?.(); },
    async pieceValues() { return values; }, async perft() { return ['a1a2']; },
    async _run(signal, operation) { assert.equal(signal?.aborted || false, false); return operation(); },
    async _exchange(commands, receive) {
      requests.push(commands);
      return new Promise(resolve => {
        receive('Term | White | Black | Total', resolve);
        receive('Final evaluation: +0.23 (white side)', resolve);
        receive('readyok', resolve);
      });
    },
  };
}

test('bishop reuse compares all eight simple types, both colors and six value fields without historical attestation', () => {
  const { library, simpleManifest, simpleValues, currentValues } = inventory();
  const result = verifySimpleInventory(library.profile, simpleManifest, currentValues, simpleValues);
  assert.equal(result.oldAllocationsPreserved, true);
  assert.equal(result.comparedPieceTypes, 14);
  assert.equal(result.comparedColorEntries, 28);
  assert.equal(result.comparedValueFields, 168);
  assert.equal(result.amazonStrongestUnchanged, true);
  assert.equal(result.historicalCollectionManifestSupplied, false);
  assert.equal(result.historicalNativeInventoryVerified, false);
});

test('bishop compatibility rejects inherited movement, allocation and declared policy changes', () => {
  const { library, simpleManifest, simpleValues, currentValues } = inventory();
  for (const change of [
    profile => { profile.registry.definitions.find(item => item.id === 'rook.purple@10').movement = 'RB'; },
    profile => { profile.registry.allocations.find(item => item.id === 'rook.purple@10').slot++; },
    profile => { profile.evaluation.pieceValues['rook.purple@9'].eg++; },
  ]) {
    const profile = copy(library.profile); change(profile);
    assert.throws(() => verifySimpleInventory(profile, simpleManifest, currentValues, simpleValues), /allocation or movement changed|evaluation policy changed/);
  }
});

test('bishop compatibility checks black capture/evaluation tables and rejects missing inventories', () => {
  const { library, simpleManifest, simpleValues, currentValues } = inventory();
  for (const [piece, field] of [['x', 'captureEg'], ['Y', 'evalMg'], ['w', 'rawEg']]) {
    const changed = copy(currentValues); changed.pieces[piece][field]++;
    assert.throws(() => verifySimpleInventory(library.profile, simpleManifest, changed, simpleValues), /Reconstructed simple native value changed/);
  }
  const missing = copy(simpleValues); delete missing.pieces.x;
  assert.throws(() => verifySimpleInventory(library.profile, simpleManifest, currentValues, missing), /Reconstructed simple native value changed/);
  assert.throws(() => verifySimpleInventory(library.profile, simpleManifest, currentValues, { version: 2 }), /native value inventories/);
});

test('two equally incorrect RB inventories cannot override its declared ordinary-queen prior', () => {
  const { library, simpleManifest, simpleValues, currentValues } = inventory();
  simpleValues.pieces.W.evalEg++; currentValues.pieces.W.evalEg++;
  assert.throws(() => verifySimpleInventory(library.profile, simpleManifest, currentValues, simpleValues), /Declared simple native prior changed/);
});

test('new unused bishops cannot silently replace Amazon as the strongest active piece', () => {
  const { library, simpleManifest, simpleValues, currentValues } = inventory();
  const changed = copy(currentValues); changed.pieces.z.captureEg = 5000;
  assert.throws(() => verifySimpleInventory(library.profile, simpleManifest, changed, simpleValues), /no longer the strongest/);
});

test('simple compatibility samples both linked sources and covers all eight retained upgrade identities', async () => {
  const p = getBishopProtocol();
  const samples = await simpleHistoricalPositions(p.sourceManifest, p.sourceRecords, p.parentManifest, p.parentRecords, fakeRules());
  assert.ok(samples.length >= 48);
  const chosen = samples.slice(0, 48);
  assert.deepEqual(new Set(chosen.map(sample => sample.sourceContext)), new Set(['original', 'simple']));
  assert.deepEqual(new Set(chosen.map(sample => sample.kind)), new Set(['ordinary', 'single', 'head']));
  const placements = chosen.map(sample => sample.fen.split(' ')[0].toLowerCase()).join('');
  for (const { letter } of p.sourceManifest.plan.registry.allocations) assert.ok(placements.includes(letter), `missing ${letter}`);
});

test('bishop compatibility cancels before native work and requires explicit provenance gaps', async () => {
  let engines = 0;
  await assert.rejects(checkBishopCompatibility({ signal: AbortSignal.abort(), engineFactory() { engines++; } }), { name: 'AbortError' });
  await assert.rejects(simpleHistoricalPositions({}, [], {}, [], {}, { signal: AbortSignal.abort() }), { name: 'AbortError' });
  assert.equal(engines, 0);
  const p = getBishopProtocol(), source = copy(p.sourceManifest);
  source.provenance.originalManifestSupplied = true;
  await assert.rejects(checkBishopCompatibility({ engine: {}, newProfile: p.profile, parentManifest: p.parentManifest,
    parentRecords: p.parentRecords, simpleManifest: source, simpleRecords: p.sourceRecords }), /explicitly derived simple replay source/);
});

test('full bounded bishop diagnostics preserve original checks, close both engines and never search', async () => {
  const { library: p, simpleValues, currentValues } = inventory();
  let engines = 0, closed = 0;
  const requests = [], engine = fakeEngine(currentValues, requests);
  const result = await checkBishopCompatibility({ engine, newProfile: p.profile,
    parentManifest: p.parentManifest, parentRecords: p.parentRecords,
    simpleManifest: p.sourceManifest, simpleRecords: p.sourceRecords,
    pieceValues: currentValues, rulesFactory: async () => fakeRules(),
    engineFactory(options) {
      engines++;
      const values = options.variant === p.parentManifest.plan.profile.variant ? p.parentManifest.native.pieceValues : simpleValues;
      return fakeEngine(values, requests, { closed() { closed++; } });
    },
  });
  assert.equal(result.passed, true); assert.equal(engines, 2); assert.equal(closed, 2);
  assert.equal(result.parentCompatibility.passed, true);
  assert.equal(result.simpleCompatibility.staticEvaluation.positions, 48);
  assert.equal(result.searchesStarted, 0);
  assert.equal(result.historicalCollectionManifestSupplied, false);
  assert.equal(result.historicalNativeInventoryVerified, false);
  assert.equal(requests.flat().some(command => /^go\b/.test(command)), false);
});

test('a reconstructed simple-profile value mismatch fails and closes its historical engine', async () => {
  const { library: p, simpleValues, currentValues } = inventory();
  let engines = 0, closed = 0;
  const changed = copy(simpleValues); changed.pieces.x.captureMg++;
  await assert.rejects(checkBishopCompatibility({ engine: fakeEngine(currentValues), newProfile: p.profile,
    parentManifest: p.parentManifest, parentRecords: p.parentRecords,
    simpleManifest: p.sourceManifest, simpleRecords: p.sourceRecords,
    pieceValues: currentValues, rulesFactory: async () => fakeRules(),
    engineFactory(options) {
      engines++;
      return fakeEngine(options.variant === p.parentManifest.plan.profile.variant ? p.parentManifest.native.pieceValues : changed,
        [], { closed() { closed++; } });
    },
  }), /Reconstructed simple native value changed/);
  assert.equal(engines, 2); assert.equal(closed, 2);
});
