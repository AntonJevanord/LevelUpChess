'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { staticEvaluation, verifyInventory, historicalPositions, checkParentCompatibility } = require('../scripts/balance/revision-compatibility');
const { getRevisionProtocol } = require('../scripts/balance/revision-plan');
const copy = value => structuredClone(value);

const FEN = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';
function diagnosticEngine(output, requests = []) {
  return {
    async _run(signal, operation) { assert.equal(signal?.aborted || false, false); return operation(); },
    async _exchange(commands, receive) {
      requests.push(commands);
      return new Promise(resolve => { for (const line of output) receive(line, resolve); });
    },
  };
}

test('static historical diagnostics use eval/isready without a search and retain a deterministic full trace', async () => {
  const commands = [], engine = diagnosticEngine(['Term | White | Black | Total', 'Final evaluation: +0.23 (white side)', 'readyok'], commands);
  const result = await staticEvaluation(engine, FEN);
  assert.equal(result.available, true);
  assert.equal(result.trace, 'Term | White | Black | Total\nFinal evaluation: +0.23 (white side)\n');
  assert.deepEqual(commands, [[`position fen ${FEN}`, 'eval', 'isready']]);
  assert.equal(commands.flat().some(command => /^go\b/.test(command)), false);
});

test('static diagnostics reject incomplete traces, unsafe positions and cancellation before sending commands', async () => {
  await assert.rejects(staticEvaluation(diagnosticEngine(['readyok']), FEN), /no complete static evaluation/);
  await assert.rejects(staticEvaluation(diagnosticEngine(['Unknown command: eval', 'readyok']), FEN), /does not support static eval/);
  const commands = [], engine = diagnosticEngine(['readyok'], commands);
  await assert.rejects(staticEvaluation(engine, FEN + '\neval'), /single six-field FEN/);
  await assert.rejects(staticEvaluation(engine, FEN, { signal: AbortSignal.abort() }), { name: 'AbortError' });
  assert.equal(commands.length, 0);
  const inCheck = await staticEvaluation(diagnosticEngine(['Final evaluation: none (in check)', 'readyok']), FEN);
  assert.equal(inCheck.available, false);
});

function inventory() {
  const library = getRevisionProtocol(), parentManifest = library.parentManifest;
  const oldValues = copy(parentManifest.native.pieceValues), currentValues = copy(oldValues);
  for (const allocation of library.registry.allocations) {
    if (currentValues.pieces[allocation.letter]) continue;
    for (const letter of [allocation.letter, allocation.letter.toUpperCase()]) {
      currentValues.pieces[letter] = { ...currentValues.pieces.R };
    }
  }
  return { library, parentManifest, oldValues, currentValues };
}

test('linked compatibility retains historical movement, allocation and every recorded automatic value', () => {
  const { library, parentManifest, oldValues, currentValues } = inventory();
  const result = verifyInventory(library.profile, parentManifest, currentValues, oldValues);
  assert.equal(result.inventoryMatches, true); assert.equal(result.amazonStrongestUnchanged, true);
  assert.equal(result.comparedPieceTypes, 10); assert.equal(result.comparedValueFields, 120);
  const changed = copy(currentValues); changed.pieces.j.rawEg++;
  assert.throws(() => verifyInventory(library.profile, parentManifest, changed, oldValues), /Historical automatic value changed/);
  const profile = copy(library.profile); profile.registry.definitions.find(item => item.id === 'rook.purple@2').movement = 'RN';
  assert.throws(() => verifyInventory(profile, parentManifest, currentValues, oldValues), /allocation or movement changed/);
});

test('an unused new type stronger than the Amazon refuses historical pooling', () => {
  const { library, parentManifest, oldValues, currentValues } = inventory();
  const candidate = library.registry.allocations.find(item => item.id === 'rook.purple@8');
  currentValues.pieces[candidate.letter.toUpperCase()].rawMg = 4000;
  assert.throws(() => verifyInventory(library.profile, parentManifest, currentValues, oldValues), /no longer the strongest/);
});

test('parent compatibility cancels before creating another engine or replaying historical positions', async () => {
  let engines = 0, boards = 0;
  await assert.rejects(checkParentCompatibility({ signal: AbortSignal.abort(), engineFactory() { engines++; }, rulesFactory() { boards++; } }), { name: 'AbortError' });
  assert.equal(engines, 0); assert.equal(boards, 0);
  await assert.rejects(historicalPositions({}, [], {}, { signal: AbortSignal.abort() }), { name: 'AbortError' });
});
