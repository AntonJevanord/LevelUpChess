'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { getDesign } = require('../src/design-catalog');
const { makeSchedule } = require('../scripts/balance/plan');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { getOfficialReferences } = require('../scripts/balance/official-references');
const { loadExperiment } = require('../scripts/balance/v17-plan');
const { FILES } = require('../scripts/balance/v17-bracket-plan');
const { checkExperiment, validatePreflight } = require('../scripts/version17-balance');
const {
  FILE, POLICY, assignments, validateSnapshot, readSnapshot,
  getBracketEvaluation, getBracketValueAudit, getBracketValueReceipt,
} = require('../scripts/balance/v17-bracket-values');

const sha = value => createHash('sha256').update(value).digest('hex');
const fields = ['rawMg', 'rawEg', 'captureMg', 'captureEg', 'evalMg', 'evalEg'];
const table = values => Object.fromEntries(fields.map(field => [field, values[field.endsWith('Mg') ? 'mg' : 'eg']]));

test('Windows checkout keeps raw calibration and initial profile hashes stable', () => {
  const files = [FILE, ...Object.keys(require('./fixtures/playable-initial15-sha256.json')).filter(file => file.endsWith('.json'))];
  const attributes = execFileSync('git', ['check-attr', 'eol', '--', ...files], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
  const lines = attributes.trim().split(/\r?\n/);
  assert.equal(lines.length, files.length);
  assert.ok(lines.every(line => line.endsWith(': eol: lf')), attributes);
  // This new pinned file must be LF immediately; older unchanged profile
  // files can retain their prior checkout conversion until rewritten by Git.
  assert.ok(!fs.readFileSync(path.resolve(__dirname, '..', FILE)).includes(Buffer.from('\r\n')), FILE);
});

// These fixtures exercise context and proof validation only. They are never
// persisted as native evidence and never provide game results.
function context(input) {
  const declaration = typeof input === 'string' ? loadExperiment(input) : input;
  const { config, metadata, experiment } = declaration;
  const registry = createDesignRegistry(config), profile = compileDesignProfile(registry, config.evaluation);
  const standalone = metadata.referenceValueProfile === 'official-standalone';
  const diagnostic = standalone ? getOfficialReferences().profile : profile;
  const referencePieces = {}, manualPieces = {};
  for (const reference of getOfficialReferences().roster) {
    const letter = diagnostic.registry.allocations.find(allocation => allocation.id === reference.id).letter;
    referencePieces[letter] = table(reference.engineValue);
    referencePieces[letter.toUpperCase()] = table(reference.engineValue);
  }
  for (const allocation of registry.allocations) {
    const expected = config.evaluation?.pieceValues[allocation.id];
    if (!expected) continue;
    manualPieces[allocation.letter] = table(expected);
    manualPieces[allocation.letter.toUpperCase()] = table(expected);
  }
  const validation = {
    native: true, games: makeSchedule(config).length, validatedOpenings: makeSchedule(config).length,
    profileHash: profile.hash, registryHash: registry.hash, engineSha256: '3'.repeat(64),
    configSha256: sha(JSON.stringify(config)), referenceValues: { version: 1, pieces: referencePieces },
    ...(standalone ? { referenceValueProfile: { variant: diagnostic.variant, hash: diagnostic.hash, registryHash: diagnostic.registryHash } } : {}),
    ...(metadata.evaluationAudit ? { manualValues: { version: 1, pieces: manualPieces }, bracketValueReceipt: metadata.evaluationAudit } : {}),
  };
  const proof = { schemaVersion: 1, format: 'levelup-v17-native-preflight', experiment,
    profileHash: profile.hash, registryHash: registry.hash, configSha256: validation.configSha256,
    engineSha256: validation.engineSha256, validation };
  return { declaration, registry, profile, diagnostic, validation, proof };
}

test('the native calibration records 72 automatic inventories separately from a common sibling prior', () => {
  const snapshot = readSnapshot();
  assert.equal(snapshot.values.length, 72);
  assert.equal(assignments().length, 72);
  assert.equal(snapshot.policy, POLICY);
  assert.match(snapshot.provenance.engineSha256, /^[a-f0-9]{64}$/);
  assert.match(snapshot.provenance.diagnostic, /no searches or match games/);
  assert.ok(snapshot.values.some(row => row.automatic.mg !== row.applied.mg || row.automatic.eg !== row.applied.eg));
  const groups = new Map();
  for (const row of snapshot.values) {
    assert.equal(row.movement, getDesign(row.id).movement);
    assert.deepEqual(row.automatic, { mg: row.automaticTables.rawMg, eg: row.automaticTables.rawEg });
    const previous = groups.get(row.valueGroup);
    if (previous) assert.deepEqual(row.applied, previous, row.valueGroup);
    groups.set(row.valueGroup, row.applied);
  }
  const diagonal = snapshot.values.filter(row => row.valueGroup === 'grant-diagonal');
  assert.deepEqual(diagonal.map(row => row.movement).sort(), ['F', 'F2', 'F3', 'fF'].sort());
  assert.ok(diagonal.every(row => row.baseId === 'king.reserve-bishop@1'));
  for (const reference of getOfficialReferences().roster) {
    assert.deepEqual(snapshot.values.find(row => row.id === reference.id).applied, reference.engineValue);
  }
});

test('value selection is exact, immutable and carries the calibration byte receipt', () => {
  const snapshot = readSnapshot(), ids = snapshot.values.slice(0, 3).map(row => row.id).reverse();
  const evaluation = getBracketEvaluation(ids), audit = getBracketValueAudit(ids), receipt = getBracketValueReceipt();
  assert.equal(receipt.file, FILE);
  assert.equal(receipt.sha256, sha(fs.readFileSync(path.resolve(__dirname, '..', FILE))));
  assert.equal(receipt.policy, POLICY);
  assert.deepEqual(Object.keys(evaluation.pieceValues), [...ids].sort());
  assert.deepEqual(audit.values.map(row => row.id), [...ids].sort());
  assert.equal(audit.provenance.sha256, receipt.sha256);
  assert.equal(audit.provenance.engineSha256, snapshot.provenance.engineSha256);
  assert.ok(Object.isFrozen(evaluation.pieceValues));
  for (const row of audit.values) assert.deepEqual(evaluation.pieceValues[row.id], row.applied);
  assert.throws(() => getBracketEvaluation([]), /distinct bracket value IDs/);
  assert.throws(() => getBracketEvaluation([ids[0], ids[0]]), /distinct bracket value IDs/);
  assert.throws(() => getBracketEvaluation(['pawn.blue@3']), /Missing bracket calibration/);
});

test('snapshot structure rejects changed prices, behavior, groups, raw tables and applied values', () => {
  const original = readSnapshot();
  for (const change of [
    value => { value.values[0].applied.mg++; },
    value => { value.values[0].movement += 'N'; },
    value => { value.values[0].level++; },
    value => { value.values[0].placement = 'reserve'; },
    value => { value.values[0].valueGroup += '-changed'; },
    value => { value.values[0].automatic.mg++; },
    value => { delete value.values[0].automaticTables.captureEg; },
    value => { value.values[0].automaticTables.evalMg = -1; },
    value => { value.values[0].context = 999; },
    value => { value.values[0].baseId = 'pawn.blue@3'; },
    value => { value.provenance.engineSha256 = 'not-a-hash'; },
    value => { value.values[1] = structuredClone(value.values[0]); },
  ]) {
    const changed = structuredClone(original); change(changed);
    assert.throws(() => validateSnapshot(changed), /calibration/);
  }
});

test('reading the frozen calibration rejects even a structurally valid byte replacement', t => {
  const file = path.resolve(__dirname, '..', FILE), originalRead = fs.readFileSync;
  const changed = Buffer.concat([originalRead(file), Buffer.from('\n')]);
  t.mock.method(fs, 'readFileSync', (input, ...args) => {
    if (String(input) === file) return args[0] === 'utf8' ? changed.toString('utf8') : changed;
    return originalRead(input, ...args);
  });
  assert.throws(() => readSnapshot(), /pin|frozen|changed|SHA|digest/i);
});

test('all five bracket proofs bind the actual match inventory and the frozen reference diagnostic independently', () => {
  for (const experiment of Object.keys(FILES)) {
    const value = context(experiment);
    assert.strictEqual(validatePreflight(value.proof, value.declaration), value.proof);
    assert.deepEqual(value.validation.bracketValueReceipt, getBracketValueReceipt());
    if (experiment !== 'level3-confirmation') {
      assert.notEqual(value.profile.hash, value.diagnostic.hash);
      assert.ok(value.registry.definitions.every(definition => !getOfficialReferences().roster.some(reference => reference.id === definition.id)));
    }
    assert.equal(value.validation.manualValues.version, 1);
  }
});

test('applied proof checks every selected design in both colors and all six material tables', () => {
  for (const experiment of Object.keys(FILES)) {
    const value = context(experiment);
    for (const allocation of value.registry.allocations) for (const letter of [allocation.letter, allocation.letter.toUpperCase()]) {
      for (const field of fields) {
        const proof = structuredClone(value.proof);
        proof.validation.manualValues.pieces[letter][field]++;
        assert.throws(() => validatePreflight(proof, value.declaration), /changed an applied bracket value/, `${experiment} ${allocation.id} ${letter} ${field}`);
      }
    }
  }
});

test('missing or relabelled bracket receipts and incomplete actual-value inventories cannot become proofs', () => {
  const value = context('reference-pawns');
  for (const change of [
    validation => { delete validation.bracketValueReceipt; },
    validation => { validation.bracketValueReceipt.sha256 = '4'.repeat(64); },
    validation => { validation.bracketValueReceipt.file += '.other'; },
    validation => { validation.bracketValueReceipt.policy += ' changed'; },
    validation => { delete validation.manualValues; },
    validation => { validation.manualValues.version++; },
    validation => { validation.manualValues.pieces = {}; },
    validation => { delete validation.manualValues.pieces[value.registry.allocations[0].letter.toUpperCase()]; },
    validation => { delete validation.manualValues.pieces[value.registry.allocations[0].letter].captureMg; },
  ]) {
    const proof = structuredClone(value.proof); change(proof.validation);
    assert.throws(() => validatePreflight(proof, value.declaration), /bracket valuation receipt|applied bracket values|changed an applied bracket value/);
  }
  const incomplete = structuredClone(value.declaration);
  delete incomplete.config.evaluation.pieceValues[value.registry.allocations[0].id];
  const missing = context(incomplete);
  assert.throws(() => validatePreflight(missing.proof, missing.declaration), /does not cover every selected design/);
});

test('old version-17 experiments retain their original proof contract', () => {
  for (const experiment of ['level3', 'panel-gap', 'panel-level1']) {
    const old = context(experiment);
    assert.equal(old.declaration.metadata.evaluationAudit, undefined);
    assert.equal(old.validation.manualValues, undefined);
    assert.equal(old.validation.bracketValueReceipt, undefined);
    assert.strictEqual(validatePreflight(old.proof, old.declaration), old.proof);
    for (const field of ['manualValues', 'bracketValueReceipt']) {
      const changed = structuredClone(old.proof); changed.validation[field] = field === 'manualValues' ? { version: 1, pieces: {} } : getBracketValueReceipt();
      assert.throws(() => validatePreflight(changed, old.declaration), /older experiment cannot acquire an undeclared bracket/);
    }
  }
});

test('check mode requests actual-value retention only for the newly declared bracket experiments', async () => {
  for (const experiment of ['reference-pawns', 'acceptance-majors', 'level3-confirmation', 'level3', 'panel-gap']) {
    const declaration = loadExperiment(experiment), expected = declaration.metadata.evaluationAudit !== undefined;
    let calls = 0;
    const result = await checkExperiment(declaration, {
      validate: async (config, options) => {
        calls++;
        assert.deepEqual(config, declaration.config);
        assert.equal(options.includeValueInventory === true, expected);
        assert.equal(options.standardOpeningSources, true);
        return { native: false };
      },
    });
    assert.equal(calls, 1);
    assert.deepEqual(result.bracketValueReceipt, expected ? declaration.metadata.evaluationAudit : undefined);
  }
});
