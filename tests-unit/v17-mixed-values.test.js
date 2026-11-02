'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { getDesign } = require('../src/design-catalog');
const { getOfficialReferences } = require('../scripts/balance/official-references');
const { LEVEL1_ROSTER } = require('../scripts/balance/reference-panel-plan');
const { getLevel2References } = require('../scripts/balance/level2-references');
const { readSnapshot: baseline, getBracketEvaluation, getBracketValueReceipt } = require('../scripts/balance/v17-bracket-values');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const api = require('../scripts/balance/v17-mixed-values');
const hash = value => createHash('sha256').update(value).digest('hex');
const copy = () => structuredClone(api.readSnapshot());

test('mixed search priors pin twelve IDs and preserve the original calibration receipt', () => {
  const snapshot = api.readSnapshot();
  assert.equal(hash(fs.readFileSync(path.resolve(__dirname, '..', api.FILE))), api.SNAPSHOT_SHA256);
  assert.equal(snapshot.values.length, 12);
  assert.equal(new Set(snapshot.values.map(row => row.id)).size, 12);
  assert.deepEqual(snapshot.baseline, getBracketValueReceipt());
  assert.equal(snapshot.baseline.sha256, '205709189dcec631970253dbdf826669262e412c325764f47880acbfbd96d2f9');
  assert.equal(snapshot.calibratedDate, '2026-11-02');
  assert.match(snapshot.provenance.diagnostic, /no searches or match games/);
  assert.equal(Object.isFrozen(snapshot.values[0].applied), true);
});

test('all ten existing L1, L2 and official reference priors remain exact regardless of observed outcomes', () => {
  const ids = [...LEVEL1_ROSTER, ...getLevel2References().roster, ...getOfficialReferences().roster].map(row => row.id);
  const expected = getBracketEvaluation(ids).pieceValues;
  const snapshot = api.readSnapshot();
  assert.equal(ids.length, 10);
  for (const id of ids) {
    const row = snapshot.values.find(value => value.id === id);
    assert.deepEqual(row.applied, expected[id]);
    assert.deepEqual(row.roles, getDesign(id).roles);
    assert.equal(row.valueBaseId, id);
  }
  for (const reference of getOfficialReferences().roster) {
    const row = snapshot.values.find(value => value.id === reference.id);
    assert.equal(row.valuePolicy, 'preserve-official-reference');
    assert.deepEqual(row.applied, reference.engineValue);
  }
});

test('W2 and WD grants share a controlled W2 prior while retaining distinct jump behavior and historical costs', () => {
  const snapshot = api.readSnapshot();
  const rows = api.GRANT_IDS.map(id => snapshot.values.find(row => row.id === id));
  assert.deepEqual(rows.map(row => row.movement), ['W2', 'WD']);
  for (const row of rows) {
    assert.equal(row.valuePolicy, 'shared-W2-prior');
    assert.equal(row.valueBaseId, 'king.grant-orthogonal-current@1');
    assert.deepEqual(row.applied, { mg: 563, eg: 635 });
    assert.equal(row.level, 3); assert.equal(row.placement, 'reserve');
    assert.deepEqual(row.roles, { pawn: false, castlingRook: false, enPassant: false });
    assert.equal(getDesign(row.id).inheritLegacyProbes, false);
  }
  assert.equal(getDesign('king.grant-orthogonal-current@1').level, 2);
  assert.deepEqual(baseline().values.find(row => row.id === api.GRANT_BASE_ID).applied, rows[0].applied);
});

test('one native diagnostic context records both cases of all twelve custom types before manual overrides', () => {
  const snapshot = api.readSnapshot(), registry = api.registryFor(), profile = compileDesignProfile(registry);
  const context = snapshot.provenance.contexts[0];
  assert.equal(snapshot.provenance.contexts.length, 1);
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
});

test('evaluation/audit selectors are immutable, default to all twelve and reject foreign or repeated IDs', () => {
  const evaluation = api.getEvaluation(), audit = api.getValueAudit(), receipt = api.getReceipt();
  assert.equal(Object.keys(evaluation.pieceValues).length, 12);
  assert.equal(audit.values.length, 12);
  assert.equal(audit.provenance.sha256, api.SNAPSHOT_SHA256);
  assert.deepEqual(audit.provenance.baseline, getBracketValueReceipt());
  assert.equal(receipt.file, api.FILE); assert.equal(receipt.sha256, api.SNAPSHOT_SHA256);
  for (const row of audit.values) assert.deepEqual(evaluation.pieceValues[row.id], row.applied);
  assert.equal(Object.isFrozen(evaluation.pieceValues[api.GRANT_IDS[0]]), true);
  assert.equal(Object.isFrozen(audit.values[0].automaticTables), true);
  assert.equal(api.getValueAudit(api.GRANT_IDS).values.length, 2);
  for (const invalid of [null, [], [api.GRANT_IDS[0], api.GRANT_IDS[0]], ['queen.xray-omni@1']]) {
    assert.throws(() => api.getEvaluation(invalid), /distinct|Missing/);
    assert.throws(() => api.getValueAudit(invalid), /distinct|Missing/);
  }
});

test('changed movements, prices, applied values, source policies and baseline receipts are rejected', () => {
  const changes = [
    x => { x.policy += ' changed'; },
    x => { x.calibratedDate = '2026-11-03'; },
    x => { x.baseline.sha256 = 'a'.repeat(64); },
    x => { x.values[0].movement += 'N'; },
    x => { x.values[0].level = 2; },
    x => { x.values[0].roles.pawn = true; },
    x => { x.values.find(row => row.id === 'pawn.rank-current@1').applied.mg++; },
    x => { x.values.find(row => row.id === 'king.grant-wd-level3@1').applied = { mg: 773, eg: 866 }; },
    x => { x.values.find(row => row.id === 'king.reserve-rook@1').valueBaseId = 'king.grant-orthogonal-expanded@1'; },
    x => { x.values.find(row => row.id === 'king.grant-wd-level3@1').valuePolicy = 'preserve-applied-baseline'; },
  ];
  for (const change of changes) { const snapshot = copy(); change(snapshot); assert.throws(() => api.validateSnapshot(snapshot), /changed|policy|baseline/i); }
});

test('missing/reordered IDs and changed automatic inventory or diagnostic context cannot become the frozen receipt', () => {
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

test('optional native calibration reproduces the automatic values without position searches or match games', {
  skip: !process.env.FAIRY_STOCKFISH_PATH,
}, async () => {
  const actual = api.validateSnapshot(await api.calibrate(path.resolve(process.env.FAIRY_STOCKFISH_PATH)));
  const expected = api.readSnapshot();
  assert.deepEqual(actual.values, expected.values);
  assert.deepEqual(actual.provenance.contexts, expected.provenance.contexts);
  assert.equal(actual.provenance.engineSha256, hash(fs.readFileSync(path.resolve(process.env.FAIRY_STOCKFISH_PATH))));
});
