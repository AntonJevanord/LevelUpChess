const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { getDesign } = require('../src/design-catalog');
const { PLAYABLE_LIBRARIES, OFFICIAL_REFERENCE_DESIGN_IDS, RESERVE_DESIGN_IDS, V16_CANDIDATES } = require('../src/playable-library');
const { getPlayableProfiles } = require('../scripts/playable-profile');
const { getDesignOptions, pieceInfoForProfile } = require('../src/design-options');

const libraries = PLAYABLE_LIBRARIES.filter(library => library.generation === 16);
const profiles = getPlayableProfiles();
const profileFor = library => profiles[PLAYABLE_LIBRARIES.indexOf(library)];

test('each version-16 workshop fits the engine and shares the four frozen references', () => {
  assert.equal(libraries.length, 6);
  for (const library of libraries) {
    const profile = profileFor(library);
    const ids = new Set(profile.registry.definitions.map(definition => definition.id));
    assert.ok(ids.size <= 20);
    assert.equal(ids.size, library.designIds.length);
    for (const id of [...OFFICIAL_REFERENCE_DESIGN_IDS, ...RESERVE_DESIGN_IDS]) assert.ok(ids.has(id), `${library.id}: ${id}`);
    assert.deepEqual(profile.roles.royalTypes, ['k']);
    assert.equal(profile.roles.reserveTypes.length, 9);
    assert.match(profile.config, /pieceDrops = true/);
    assert.match(profile.config, /dropChecks = false/);
    assert.equal(fs.readFileSync(require.resolve('../' + library.ini), 'utf8'), profile.config);
  }
  assert.deepEqual(OFFICIAL_REFERENCE_DESIGN_IDS.map(id => [id, getDesign(id).movement]), [
    ['rook.purple@10', 'RfB'], ['knight.purple@3', 'NC'],
    ['bishop.purple@13', 'BsR2nsN'], ['queen.purple@1', 'QN'],
  ]);
});

test('reserve costs are numbered 1–9 and never make a second royal king', () => {
  const expected = ['fW', 'F', 'W2', 'K', 'KmN', 'K2', 'NZ', 'KN', 'Q'];
  for (const [index, id] of RESERVE_DESIGN_IDS.entries()) {
    const definition = getDesign(id);
    assert.equal(definition.level, index + 1);
    assert.equal(definition.movement, expected[index]);
    assert.equal(definition.family, 'king');
    assert.equal(definition.placement, 'reserve');
    assert.deepEqual(definition.roles, { pawn: false, castlingRook: false, enPassant: false });
  }
});

test('official display names apply to new libraries while historical labels remain available', () => {
  const names = ['Vanguard', 'Unicorn', 'Cruisader', 'Amazon'];
  for (const library of libraries) {
    const profile = profileFor(library);
    const options = getDesignOptions(profile.variant);
    for (const [index, id] of OFFICIAL_REFERENCE_DESIGN_IDS.entries()) {
      assert.equal(options.find(option => option.id === id).name, names[index]);
      assert.equal(options.find(option => option.id === id).status, 'reference');
      const letter = profile.registry.allocations.find(allocation => allocation.id === id).letter;
      assert.equal(pieceInfoForProfile(profile, letter).name, `${names[index]}, level 3`);
    }
    for (const id of RESERVE_DESIGN_IDS) {
      const option = options.find(candidate => candidate.id === id);
      assert.equal(option.status, 'experimental');
      assert.match(option.description, /nonroyal/);
      assert.match(option.description, /Checking drops are forbidden/);
    }
  }
  assert.equal(getDesignOptions(profiles[0].variant).find(option => option.id === 'knight.purple@3').name, 'Camel knight');
});

test('new candidates preserve the proposed movement, price and single-piece deployment', () => {
  const expected = {
    pawns: ['fmWfeFifmnD', 'fmWfceFifmnDfhN', 'fceF2mR', 'bmWfmW2fceF', 'mWeFifmnD', 'feQ2bmQ2'],
    knights: ['NsmR', 'NsWsD', 'N0', 'NvW', 'NA', 'NK', 'NWH'],
    bishops: ['BgmB', 'BvN', 'BcWcNcDcA', 'BsW', 'BsR', 'BvWvNvZ', 'BN'],
    rooks: ['RgmR0', 'RmFmDmAmHmGmNmCmZ', 'RC', 'RceF', 'RcN', 'RFsNsC'],
    queens: ['QmfhN', 'QmHmCmZmG', 'QsNsC', 'QgB0', 'QZ'],
  };
  for (const [family, ids] of Object.entries(V16_CANDIDATES)) {
    assert.deepEqual(ids.map(id => getDesign(id).movement), expected[family]);
    for (const id of ids) {
      const definition = getDesign(id);
      assert.equal(definition.placement, 'replace');
      assert.ok(definition.level >= 1 && definition.level <= 3);
    }
  }
  assert.equal(getDesign('rook.orange@3').level, 2);
  assert.equal(getDesign('rook.purple@2').level, 3, 'historical knight-capture rook price is retained');
});
