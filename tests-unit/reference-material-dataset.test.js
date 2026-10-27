'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { extractReferenceMaterial } = require('../scripts/balance/reference-material-dataset');
const { getOfficialReferences } = require('../scripts/balance/official-references');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const ids = ['knight.purple@3', 'queen.purple@1'];
function fixture({ id = 'first', profile = getOfficialReferences().profile, group = 'reference-001' } = {}) {
  const type = name => profile.registry.allocations.find(row => row.id === name).letter;
  const records = ['w', 'b'].map(aColor => {
    const placement = aColor === 'w' ? `7k/8/8/3${type(ids[1])}4/3${type(ids[0]).toUpperCase()}4/8/8/K7`
      : `7k/8/8/3${type(ids[0])}4/3${type(ids[1]).toUpperCase()}4/8/8/K7`;
    const fen = ply => `${placement} ${ply % 2 ? 'b' : 'w'} - - ${ply} ${1 + Math.floor(ply / 2)}`;
    const moves = Array.from({ length: 28 }, (_, index) => `move${index}`);
    return { id: `game-${aColor}`, pairId: 'pair', openingId: group, comparisonId: 'knight-v-queen',
      kind: 'head', designA: ids[0], designB: ids[1], aColor,
      whiteDesign: aColor === 'w' ? ids[0] : ids[1], blackDesign: aColor === 'b' ? ids[0] : ids[1],
      status: 'completed', attempt: 1, result: '1/2-1/2', reason: 'threefold-repetition',
      startFen: fen(0), finalFen: fen(28), moves, sans: moves.map((_, index) => `SAN${index}`),
      openingMoves: [], openingPlies: 0, totalPlies: 28, playedPlies: 28,
      profileHash: profile.hash, registryHash: profile.registryHash, variant: profile.variant,
      royalMode: 'king', evaluationCaveat: null,
      engine: { nodes: 20000, threads: 1, hashMb: 32, maxPlies: 400 },
      whiteStrength: { skill: 20 }, blackStrength: { skill: 20 } };
  });
  const rulesFactory = async () => ({ createBoard(start) {
    const row = records.find(record => record.startFen === start); assert.ok(row);
    let ply = 0;
    return { fen: () => start.replace(/ [wb] - - \d+ \d+$/, ` ${ply % 2 ? 'b' : 'w'} - - ${ply} ${1 + Math.floor(ply / 2)}`),
      outcome: () => ply === 28 ? { result: row.result, reason: row.reason } : null,
      san: move => { assert.equal(move, row.moves[ply]); return row.sans[ply]; },
      push: move => { assert.equal(move, row.moves[ply]); ply++; return true; }, dispose() {} };
  } });
  return { source: { id, profile, identity: { engineSha256: 'frozen', context: id }, records }, rulesFactory };
}

test('reference-only extraction preserves decoded bonuses, weights and original source identities', async () => {
  const data = fixture();
  const { dataset, selection } = await extractReferenceMaterial({ sources: [data.source], rulesFactory: data.rulesFactory });
  assert.equal(dataset.games.length, 2); assert.equal(dataset.featureNames.length, 10);
  assert.equal(dataset.coverage.accepted, 6); assert.equal(dataset.coverage.completePairs, 1);
  assert.equal(dataset.profile, undefined); assert.equal(dataset.identity, undefined);
  assert.equal(selection.selectedGames, 2); assert.equal(selection.excludedOtherRecords, 0);
  assert.deepEqual(dataset.sources[0].identity, data.source.identity);
  for (const row of dataset.samples) {
    assert.equal(row.weight, 1 / 3); assert.equal(row.groupId, 'reference-001');
    assert.equal(row.x[dataset.featureNames.indexOf('bonus:knight.purple@3')], row.gameId.endsWith('-w') ? 1 : -1);
  }
});

test('different historical profiles stay distinct while their features and opening groups align', async () => {
  const first = fixture();
  const profile = compileDesignProfile(createDesignRegistry({ schemaVersion: 2, comparisons: [
    { armyA: { upgrades: { b1: ids[0] } }, armyB: { upgrades: { d1: ids[1] } } },
    { armyA: { upgrades: { c1: 'bishop.purple@7' } }, armyB: {} },
  ] }));
  const second = fixture({ id: 'second', profile });
  const result = await extractReferenceMaterial({ sources: [first.source, second.source],
    rulesFactory: input => (input.sourceId === 'first' ? first : second).rulesFactory() });
  assert.equal(result.dataset.games.length, 4);
  assert.equal(new Set(result.dataset.samples.map(row => row.groupId)).size, 1);
  assert.equal(new Set(result.dataset.games.map(row => row.gameId)).size, 4);
  assert.equal(new Set(result.dataset.games.map(row => row.sourceProfileHash)).size, 2);
  assert.equal(result.dataset.featureNames.includes('bonus:bishop.purple@7'), false);
  assert.deepEqual(result.dataset.samples[0].x, result.dataset.samples[6].x);
});

test('earlier experimental revisions are excluded and a truncated partner does not create a scored pair', async () => {
  const data = fixture();
  data.source.records.push({ ...data.source.records[0], id: 'old-bishop', designA: 'bishop.purple@7' });
  Object.assign(data.source.records[1], { status: 'truncated', result: '*', reason: 'max-plies' });
  const other = fixture({ id: 'usable', group: 'reference-002' });
  const result = await extractReferenceMaterial({ sources: [data.source, other.source], rulesFactory: other.rulesFactory });
  assert.equal(result.selection.excludedOtherRecords, 1);
  assert.equal(result.selection.truncatedRecords, 1);
  assert.equal(result.selection.completedWithoutPartner, 1);
  assert.equal(result.selection.selectedGames, 2);
});

test('copied source records and repeated exact histories do not gain fitting weight', async () => {
  const data = fixture(), copy = structuredClone(data.source); copy.id = 'copy';
  const result = await extractReferenceMaterial({ sources: [data.source, copy], rulesFactory: data.rulesFactory });
  assert.equal(result.dataset.games.length, 2); assert.equal(result.selection.duplicateIdentityRecords, 2);
  const duplicate = structuredClone(data.source);
  duplicate.records.push(...duplicate.records.map(row => ({ ...row, id: row.id + '-repeat', pairId: 'repeat' })));
  const history = await extractReferenceMaterial({ sources: [duplicate], rulesFactory: data.rulesFactory });
  assert.equal(history.dataset.games.length, 2); assert.equal(history.selection.duplicateHistoryRecords, 2);
});

test('partial source copies recover one complete pair before duplicate suppression', async () => {
  const data = fixture(), partial = structuredClone(data.source); partial.records.pop();
  const complete = structuredClone(data.source); complete.id = 'copy';
  const result = await extractReferenceMaterial({ sources: [partial, complete], rulesFactory: data.rulesFactory });
  assert.equal(result.dataset.games.length, 2);
  assert.equal(result.selection.completedWithoutPartner, 0);
  assert.equal(result.selection.duplicateIdentityRecords, 1);
  assert.deepEqual(result.selection.bySource[0].sourceIds, ['first', 'copy']);
});

test('conflicting copies, corrupted reference behavior and invalid pair colors fail visibly', async () => {
  const data = fixture(); const conflict = structuredClone(data.source); conflict.id = 'copy'; conflict.records[0].result = '1-0';
  await assert.rejects(extractReferenceMaterial({ sources: [data.source, conflict], rulesFactory: data.rulesFactory }), /Conflicting copies/);
  const broken = structuredClone(data.source); broken.profile.registry.definitions.find(row => row.id === ids[0]).movement = 'N';
  await assert.rejects(extractReferenceMaterial({ sources: [broken], rulesFactory: data.rulesFactory }), /frozen reference/);
  const colors = structuredClone(data.source); colors.records[1].aColor = 'w';
  await assert.rejects(extractReferenceMaterial({ sources: [colors], rulesFactory: data.rulesFactory }), /color-pair/);
});

test('pre-cancelled extraction leaves saved evidence untouched', async () => {
  const data = fixture(), before = structuredClone(data.source); const control = new AbortController(); control.abort();
  await assert.rejects(extractReferenceMaterial({ sources: [data.source], signal: control.signal, rulesFactory: data.rulesFactory }), /cancelled/);
  assert.deepEqual(data.source, before);
});
