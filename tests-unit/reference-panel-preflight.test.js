const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { loadExperiment } = require('../scripts/balance/v17-plan');
const { makeSchedule } = require('../scripts/balance/plan');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { getOfficialReferences } = require('../scripts/balance/official-references');
const { checkExperiment, validatePreflight, writePreflight, main } = require('../scripts/version17-balance');

const sha = value => createHash('sha256').update(value).digest('hex');
const experiments = ['panel-gap', 'panel-level1', 'panel-level1-pairs'];

// Synthetic proof fixtures exercise storage and context validation. They are not
// saved as engine evidence or used to supply match results.
function context(experiment) {
  const declaration = loadExperiment(experiment), { config } = declaration;
  const registry = createDesignRegistry(config), profile = compileDesignProfile(registry, config.evaluation);
  const standalone = declaration.metadata.referenceValueProfile === 'official-standalone';
  const diagnostic = standalone ? getOfficialReferences().profile : profile;
  const pieces = {};
  for (const reference of getOfficialReferences().roster) {
    const letter = diagnostic.registry.allocations.find(item => item.id === reference.id).letter;
    const values = Object.fromEntries(['rawMg', 'rawEg', 'captureMg', 'captureEg', 'evalMg', 'evalEg']
      .map(field => [field, reference.engineValue[field.endsWith('Mg') ? 'mg' : 'eg']]));
    pieces[letter] = values; pieces[letter.toUpperCase()] = { ...values };
  }
  const validation = { games: makeSchedule(config).length, validatedOpenings: makeSchedule(config).length,
    native: true, profileHash: profile.hash, registryHash: registry.hash,
    engineSha256: '3'.repeat(64), configSha256: sha(JSON.stringify(config)),
    referenceValues: { version: 1, pieces },
    ...(standalone ? { referenceValueProfile: {
      variant: diagnostic.variant, hash: diagnostic.hash, registryHash: diagnostic.registryHash,
    } } : {}),
  };
  const proof = { schemaVersion: 1, format: 'levelup-v17-native-preflight', experiment,
    profileHash: profile.hash, registryHash: registry.hash, engineSha256: validation.engineSha256,
    configSha256: validation.configSha256, validation };
  return { declaration, registry, profile, diagnostic, validation, proof };
}

test('all three level-one stages retain their own profiles and a separate frozen-reference diagnostic receipt', () => {
  for (const experiment of experiments) {
    const value = context(experiment);
    assert.ok(value.registry.definitions.every(definition => definition.level === 1));
    assert.ok(value.registry.definitions.every(definition => !getOfficialReferences().roster.some(reference => reference.id === definition.id)));
    assert.notEqual(value.profile.hash, value.diagnostic.hash);
    assert.equal(value.proof.profileHash, value.profile.hash);
    assert.equal(value.validation.referenceValueProfile.hash, value.diagnostic.hash);
    assert.strictEqual(validatePreflight(value.proof, value.declaration), value.proof);
  }
});

test('standalone value checks cannot be relabelled as the match profile or lose a frozen value', () => {
  const value = context('panel-level1');
  for (const change of [
    validation => { delete validation.referenceValueProfile; },
    validation => { validation.referenceValueProfile.hash = value.profile.hash; },
    validation => { validation.referenceValueProfile.registryHash = value.registry.hash; },
    validation => { validation.referenceValueProfile.variant = value.profile.variant; },
    validation => { validation.referenceValues.pieces[Object.keys(validation.referenceValues.pieces)[0]].evalMg++; },
  ]) {
    const proof = structuredClone(value.proof); change(proof.validation);
    assert.throws(() => validatePreflight(proof, value.declaration), /reference value profile|frozen reference value/);
  }
  const proof = structuredClone(value.proof); proof.validation.games--;
  assert.throws(() => validatePreflight(proof, value.declaration), /does not match this experiment/);
});

test('existing experiments retain their in-profile value proof and cannot silently opt into the new receipt', () => {
  const old = context('level3');
  assert.equal(old.validation.referenceValueProfile, undefined);
  assert.strictEqual(validatePreflight(old.proof, old.declaration), old.proof);
  const changed = structuredClone(old.proof);
  const diagnostic = getOfficialReferences().profile;
  changed.validation.referenceValueProfile = { variant: diagnostic.variant, hash: diagnostic.hash, registryHash: diagnostic.registryHash };
  assert.throws(() => validatePreflight(changed, old.declaration), /reference value profile/);

  const current = context('panel-gap');
  const unscoped = { ...current.declaration, metadata: { ...current.declaration.metadata } };
  delete unscoped.metadata.referenceValueProfile;
  const proof = structuredClone(current.proof); delete proof.validation.referenceValueProfile;
  assert.throws(() => validatePreflight(proof, unscoped), /missing a frozen reference definition/);
});

test('durable level-one preflight files preserve the initial diagnostic context and reject replacement', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-panel-preflight-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const value = context('panel-gap');
  writePreflight(directory, value.declaration, value.validation);
  const file = path.join(directory, 'v17-preflight.json'), before = fs.readFileSync(file);
  writePreflight(directory, value.declaration, value.validation);
  assert.deepEqual(fs.readFileSync(file), before);
  assert.deepEqual(JSON.parse(before).validation.referenceValueProfile, value.validation.referenceValueProfile);
  const changed = structuredClone(value.validation); changed.referenceValueProfile.hash = value.profile.hash;
  assert.throws(() => writePreflight(directory, value.declaration, changed), /preflight proof|reference value profile/);
  assert.deepEqual(fs.readFileSync(file), before);
});

test('new stage checks describe their own budgets and never schedule level-three opponents', async () => {
  for (const [experiment, upgradePoints] of [['panel-gap', 3], ['panel-level1', 1], ['panel-level1-pairs', 2]]) {
    const messages = [];
    let checks = 0;
    await main(['--experiment', experiment, '--check', '--rules-only'], {
      check: async (declaration, options) => {
        checks++; assert.equal(declaration.metadata.upgradePoints, upgradePoints);
        assert.equal(options.enginePath, undefined);
        assert.ok(createDesignRegistry(declaration.config).definitions.every(definition => definition.level === 1));
        return { native: false };
      },
      run: () => assert.fail('a check must not start games'), persist: () => assert.fail('a check must not write results'),
      log: message => messages.push(message),
    });
    assert.equal(checks, 1);
    assert.ok(messages.some(message => message.includes(`level-1 armies only, ${upgradePoints} upgrade points per side`)));
    assert.ok(!messages.some(message => message.endsWith('four frozen references.')));
  }
});

const nativePath = process.env.FAIRY_STOCKFISH_PATH || path.resolve(__dirname, '../node_modules/.cache/levelup-native-values/stockfish');
test('the native table diagnostic uses the standalone profile while movement validation receives the real level-one armies', {
  skip: !fs.existsSync(nativePath), timeout: 60000,
}, async () => {
  const value = context('panel-gap');
  let calls = 0;
  const validation = await checkExperiment(value.declaration, { enginePath: nativePath,
    onProgress: () => {}, validate: async (config, options) => {
      calls++;
      assert.deepEqual(config, value.declaration.config);
      assert.equal(options.enginePath, nativePath);
      assert.equal(options.standardOpeningSources, true);
      assert.ok(createDesignRegistry(config).definitions.every(definition => definition.level === 1));
      return { ...value.validation, referenceValues: undefined, referenceValueProfile: undefined };
    } });
  assert.equal(calls, 1);
  assert.deepEqual(validation.referenceValueProfile, value.validation.referenceValueProfile);
  assert.deepEqual(validation.referenceValues.version, 1);
  assert.equal(validation.engineSha256, sha(fs.readFileSync(nativePath)));
  const proof = { ...value.proof, engineSha256: validation.engineSha256, validation };
  assert.strictEqual(validatePreflight(proof, value.declaration), proof);
});
