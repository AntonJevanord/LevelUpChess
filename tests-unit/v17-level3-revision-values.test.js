'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { TRIALS } = require('../src/balance-designs-v17-revisions');
const { getDesign } = require('../src/design-catalog');
const { getOfficialReferences } = require('../scripts/balance/official-references');
const { readSnapshot: baseline, getBracketValueReceipt } = require('../scripts/balance/v17-bracket-values');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const api = require('../scripts/balance/v17-level3-revision-values');
const hash = value => createHash('sha256').update(value).digest('hex');
const copy = () => structuredClone(api.readSnapshot());

test('new revision priors pin ten IDs and retain the exact preexisting calibration receipt', () => {
  const snapshot = api.readSnapshot();
  assert.equal(hash(fs.readFileSync(path.resolve(__dirname, '..', api.FILE))), api.SNAPSHOT_SHA256);
  assert.equal(api.SNAPSHOT_SHA256, '9507dbc13aec08c22562433852ffdb3bc5dea572835dab2ee342cf5729f0358f');
  assert.equal(snapshot.values.length, 10); assert.equal(new Set(snapshot.values.map(row => row.id)).size, 10);
  assert.deepEqual(snapshot.baseline, getBracketValueReceipt());
  assert.equal(snapshot.baseline.sha256, '205709189dcec631970253dbdf826669262e412c325764f47880acbfbd96d2f9');
  assert.equal(snapshot.calibratedDate, '2026-11-02');
  assert.match(snapshot.provenance.diagnostic, /no searches or match games/);
  assert.equal(Object.isFrozen(snapshot.values[0].applied), true);
});

test('movement revisions and three-step grant preserve applied predecessor values independently of automatic estimates', () => {
  const old = new Map(baseline().values.map(row => [row.id, row]));
  const snapshot = api.readSnapshot();
  const inherited = TRIALS.filter(trial => trial.valuePolicy === 'preserve-applied-baseline');
  assert.equal(inherited.length, 4);
  for (const trial of inherited) {
    const row = snapshot.values.find(value => value.id === trial.id);
    assert.equal(row.valueBaseId, trial.valueBaseId);
    assert.deepEqual(row.applied, old.get(trial.valueBaseId).applied);
    assert.deepEqual(row.roles, getDesign(row.id).roles);
  }
  assert.deepEqual(inherited.map(trial => snapshot.values.find(row => row.id === trial.id).applied), [
    { mg: 1742, eg: 1769 }, { mg: 418, eg: 436 }, { mg: 3772, eg: 3470 }, { mg: 563, eg: 635 },
  ]);
  const rookRay = snapshot.values.find(row => row.id === 'queen.xray-rook@1');
  assert.equal(rookRay.movement, 'QgR0');
  assert.deepEqual(rookRay.automatic, { mg: 3772, eg: 3470 });
  assert.deepEqual(rookRay.applied, rookRay.automatic);
  assert.equal(snapshot.values.some(row => row.id === 'queen.xray-omni@1'), false);
  assert.equal(snapshot.provenance.contexts[0].ids.includes('queen.xray-omni@1'), false);
});

test('new nonroyal custom K and N grants use their own raw values, not the ordinary knight table', () => {
  const snapshot = api.readSnapshot(), standardKnight = snapshot.provenance.contexts[0].inventory.pieces.n;
  assert.deepEqual([standardKnight.rawMg, standardKnight.rawEg], [781, 854]);
  for (const id of ['king.grant-king-level3@1', 'king.grant-knight-level3@1']) {
    const row = snapshot.values.find(value => value.id === id);
    assert.equal(row.valuePolicy, 'measured-automatic-raw'); assert.equal(row.valueBaseId, null);
    assert.deepEqual(row.automatic, { mg: 773, eg: 866 }); assert.deepEqual(row.applied, row.automatic);
    assert.equal(row.placement, 'reserve'); assert.equal(row.level, 3);
    assert.deepEqual(row.roles, { pawn: false, castlingRook: false, enPassant: false });
    assert.equal(getDesign(id).inheritLegacyProbes, false);
    assert.notDeepEqual(row.applied, { mg: standardKnight.rawMg, eg: standardKnight.rawEg });
  }
});

test('the automatic diagnostic archives all ten pieces in one reconstructed INI and preserves official applied pairs', () => {
  const snapshot = api.readSnapshot(), registry = api.registryFor(), profile = compileDesignProfile(registry);
  assert.equal(snapshot.provenance.contexts.length, 1);
  const context = snapshot.provenance.contexts[0];
  assert.equal(context.variant, profile.variant); assert.equal(context.profileHash, profile.hash);
  assert.equal(context.registryHash, registry.hash); assert.equal(context.config, profile.config);
  assert.deepEqual(context.ids, api.assignments().map(row => row.id));
  assert.doesNotMatch(context.config, /^pieceValue(?:Mg|Eg)/m);
  assert.equal(context.inventory.version, 1);
  for (const allocation of registry.allocations) {
    const row = snapshot.values.find(value => value.id === allocation.id);
    for (const letter of [allocation.letter, allocation.letter.toUpperCase()]) {
      assert.deepEqual(context.inventory.pieces[letter], row.automaticTables);
      assert.ok(api.FIELDS.every(field => Number.isSafeInteger(row.automaticTables[field])));
    }
  }
  for (const reference of getOfficialReferences().roster) {
    const row = snapshot.values.find(value => value.id === reference.id);
    assert.equal(row.valuePolicy, 'preserve-official-reference');
    assert.deepEqual(row.applied, reference.engineValue);
    assert.deepEqual(row.automatic, reference.engineValue);
  }
});

test('evaluation and audit selectors cover only distinct known IDs and return immutable declared pairs', () => {
  const ids = TRIALS.map(row => row.id), evaluation = api.getEvaluation(ids);
  assert.equal(Object.keys(evaluation.pieceValues).length, 6);
  const audit = api.getValueAudit(ids), receipt = api.getReceipt();
  assert.equal(audit.values.length, 6); assert.equal(audit.provenance.sha256, api.SNAPSHOT_SHA256);
  assert.deepEqual(audit.provenance.baseline, getBracketValueReceipt());
  assert.equal(receipt.file, api.FILE); assert.equal(receipt.sha256, api.SNAPSHOT_SHA256);
  for (const row of audit.values) assert.deepEqual(evaluation.pieceValues[row.id], row.applied);
  assert.equal(Object.isFrozen(evaluation.pieceValues[ids[0]]), true);
  assert.equal(Object.isFrozen(audit.values[0].automaticTables), true);
  for (const invalid of [null, [], [ids[0], ids[0]], ['pawn.orange@3'], ['queen.xray-omni@1']]) {
    assert.throws(() => api.getEvaluation(invalid), /distinct|Missing/);
    assert.throws(() => api.getValueAudit(invalid), /distinct|Missing/);
  }
});

test('changed definitions, prices, baselines, roles and applied value policies are rejected', () => {
  const changes = [
    x => { x.policy += ' changed'; },
    x => { x.calibratedDate = '2026-11-03'; },
    x => { x.baseline.sha256 = 'a'.repeat(64); },
    x => { x.values[0].movement += 'N'; },
    x => { x.values[0].level = 2; },
    x => { x.values[0].roles.pawn = true; },
    x => { x.values.find(row => row.id === 'bishop.vertical-blocked@1').applied = { mg: 1858, eg: 1903 }; },
    x => { x.values.find(row => row.id === 'king.grant-knight-level3@1').applied = { mg: 781, eg: 854 }; },
    x => { x.values.find(row => row.id === 'king.grant-orthogonal-three-level3@1').valueBaseId = 'king.reserve-king@1'; },
    x => { x.values.find(row => row.id === 'king.grant-king-level3@1').valuePolicy = 'preserve-applied-baseline'; },
  ];
  for (const change of changes) { const snapshot = copy(); change(snapshot); assert.throws(() => api.validateSnapshot(snapshot), /changed|policy|baseline/i); }
});

test('missing, repeated or reordered IDs and changed automatic contexts cannot be accepted as the frozen measurement', () => {
  const changes = [
    x => { x.values.pop(); },
    x => { x.values[1] = structuredClone(x.values[0]); },
    x => { x.values.reverse(); },
    x => { x.provenance.engineSha256 = 'invalid'; },
    x => { x.provenance.diagnostic = 'played games'; },
    x => { x.provenance.contexts.push(structuredClone(x.provenance.contexts[0])); },
    x => { x.provenance.contexts[0].profileHash = 'b'.repeat(64); },
    x => { x.provenance.contexts[0].registryHash = 'b'.repeat(64); },
    x => { x.provenance.contexts[0].config += 'pieceValueMg = n:100\n'; },
    x => { x.provenance.contexts[0].ids.reverse(); },
    x => { delete x.provenance.contexts[0].inventory.pieces.N; },
    x => { x.values[0].automatic.mg++; },
    x => { x.values[0].automaticTables.captureEg++; },
    x => { const letter = api.registryFor().allocations[0].letter; x.provenance.contexts[0].inventory.pieces[letter.toUpperCase()].rawEg++; },
  ];
  for (const change of changes) { const snapshot = copy(); change(snapshot); assert.throws(() => api.validateSnapshot(snapshot), /changed|inventory|context|IDs/i); }
});

test('optional native calibration reproduces the one-profile raw inventories without any position searches', {
  skip: !process.env.FAIRY_STOCKFISH_PATH,
}, async () => {
  const actual = api.validateSnapshot(await api.calibrate(path.resolve(process.env.FAIRY_STOCKFISH_PATH)));
  const expected = api.readSnapshot();
  assert.deepEqual(actual.values, expected.values);
  assert.deepEqual(actual.provenance.contexts, expected.provenance.contexts);
  assert.equal(actual.provenance.engineSha256, hash(fs.readFileSync(path.resolve(process.env.FAIRY_STOCKFISH_PATH))));
});
