'use strict';

// Names are presentation aliases. These checks do not start engines or games.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { PLAYABLE_LIBRARIES: definitions } = require('../src/playable-library');
const { PLAYABLE_LIBRARIES, getPlayableProfile, getDesignOptions, pieceInfoForProfile, getProfileSnapshot } = require('../src/design-options');
const { getPlayableProfiles } = require('../scripts/playable-profile');
const earlierHashes = require('./fixtures/playable-initial18-sha256.json');
const { getOfficialReferences } = require('../scripts/balance/official-references');

const names = {
  'pawn.queen-sideways@1': 'Herald',
  'pawn.purple@13': 'Ranger',
  'rook.purple@12': 'Cataphract',
  'bishop.vertical-blocked@1': 'Inquisitor',
  'queen.purple@7': 'Wraith',
  'king.grant-wd-level3@1': 'Warden',
  'knight.purple@4': 'Nightrider',
  'bishop.purple@13': 'Crusader',
};
const confirmed = PLAYABLE_LIBRARIES.find(library => library.id === 'v17-roster-confirmed');

test('current workshop names are consistent between setup options and either-color board labels', () => {
  for (const library of PLAYABLE_LIBRARIES.filter(library => library.generation === 17 && !library.superseded)) {
    const profile = getPlayableProfile(library.variant);
    const options = getDesignOptions(profile.variant);
    for (const [id, name] of Object.entries(names)) {
      const option = options.find(option => option.id === id);
      if (!option) continue;
      assert.equal(option.name, name, `${library.id}: ${id}`);
      const letter = profile.registry.allocations.find(allocation => allocation.id === id).letter;
      for (const type of [letter, letter.toUpperCase()]) {
        const info = pieceInfoForProfile(profile, type);
        assert.equal(info.name, `${name}, level ${option.level}`);
        assert.equal(info.designId, id);
        assert.equal(info.description, option.description);
        assert.equal(info.accent, option.accent);
      }
    }
  }
  const options = getDesignOptions(confirmed.variant);
  for (const [id, name] of Object.entries(names)) assert.equal(options.find(option => option.id === id)?.name, name);
});

test('Warden is the working three-point grant and preserves its price and jumping movement', () => {
  const profile = getPlayableProfile(confirmed.variant), options = getDesignOptions(profile.variant);
  const warden = options.find(option => option.id === 'king.grant-wd-level3@1');
  assert.equal(warden.name, 'Warden');
  assert.equal(warden.status, 'accepted');
  assert.equal(warden.level, 3); assert.equal(warden.accent, 'yellow');
  assert.match(warden.description, /jumps exactly two squares orthogonally/i);
  assert.equal(profile.registry.definitions.find(definition => definition.id === warden.id).movement, 'WD');
  assert.equal(options.find(option => option.id === 'king.reserve-rook@1').name, 'Sliding Orthogonal grant (trial)');
  assert.match(warden.description, /ordinary royal king/);
});

test('historical libraries and frozen research declarations retain their original names', () => {
  const previous = PLAYABLE_LIBRARIES.find(library => library.id === 'v17-roster-trials');
  const options = getDesignOptions(previous.variant);
  assert.equal(options.find(option => option.id === 'pawn.queen-sideways@1').name, 'Sideways Queen pawn');
  assert.equal(options.find(option => option.id === 'pawn.purple@13').name, 'Rook pawn');
  assert.equal(options.find(option => option.id === 'rook.purple@12').name, 'Ranged rook');
  assert.equal(options.find(option => option.id === 'bishop.vertical-blocked@1').name, 'Blocked Vertical bishop');
  assert.equal(options.find(option => option.id === 'bishop.purple@13').name, 'Cruisader');
  for (const library of PLAYABLE_LIBRARIES.filter(library => library.generation === 16)) {
    assert.equal(getDesignOptions(library.variant).find(option => option.id === 'bishop.purple@13').name, 'Cruisader');
  }
  assert.equal(getOfficialReferences().roster.find(row => row.id === 'bishop.purple@13').name, 'Cruisader');
});

test('all nineteen stored profiles and portable snapshots retain their exact rule identities', () => {
  const hashes = { ...earlierHashes,
    'src/playable-v17-roster-confirmed-profile.json': '3be2ed4fd607b18ec352e335dd0cc5624ecd15a3948635764cabf6af5e07ff6a',
    'variants/levelup-playable-v17-roster-confirmed.ini': 'ea4a4bd1a5e127c8a53e6b53b547ec60d0756f49da87a574ac6e722feec41572' };
  assert.equal(definitions.length, 19);
  assert.equal(Object.keys(hashes).length, definitions.length * 2);
  for (const [file, expected] of Object.entries(hashes)) {
    const bytes = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, file);
  }
  const compiled = getPlayableProfiles();
  for (const [index, library] of PLAYABLE_LIBRARIES.entries()) {
    const profile = getPlayableProfile(library.variant), snapshot = getProfileSnapshot(library.variant);
    assert.deepEqual(profile, compiled[index]);
    assert.equal(snapshot.hash, profile.hash); assert.equal(snapshot.registryHash, profile.registryHash);
    assert.equal(snapshot.config, profile.config); assert.deepEqual(snapshot.registry, profile.registry);
  }
});
