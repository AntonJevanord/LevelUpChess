const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const hashes = require('./fixtures/playable-initial15-sha256.json');
const { PLAYABLE_LIBRARIES, V17_CANDIDATES, V17_REVISED_PAWN_CANDIDATES, OFFICIAL_REFERENCE_DESIGN_IDS, V17_RESERVE_DESIGN_IDS } = require('../src/playable-library');
const { getDesign } = require('../src/design-catalog');
const { getPlayableProfiles } = require('../scripts/playable-profile');
const { getDesignOptions, getProfileSnapshot, encodeProfileSnapshot, decodeProfileSnapshot } = require('../src/design-options');
const { defaultDesignChoices, designSetupFromChoices, loadDesignSetup } = require('../src/design-setup');
const { pieceMap, pocketLetters } = require('../src/profile-fen');

const profiles = getPlayableProfiles();
const library = PLAYABLE_LIBRARIES.find(item => item.id === 'v17-pawns-revised');
const profile = profiles[PLAYABLE_LIBRARIES.indexOf(library)];
const bishop = 'pawn.bishop-step-current@1';
const letter = id => profile.registry.allocations.find(item => item.id === id).letter;

test('the revised pawn library preserves all fifteen initial libraries and their canonical bytes', () => {
  assert.equal(PLAYABLE_LIBRARIES.length, 16);
  assert.equal(PLAYABLE_LIBRARIES.indexOf(library), 15);
  assert.deepEqual(PLAYABLE_LIBRARIES.slice(0, 15).flatMap(item => [item.json, item.ini]), Object.keys(hashes));
  for (const [file, expected] of Object.entries(hashes)) {
    // Existing Windows worktrees may retain CRLF after pulling the new LF
    // attribute. Compare committed canonical bytes, not checkout conversion.
    const bytes = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, file);
  }
  for (const [index, old] of PLAYABLE_LIBRARIES.slice(0, 15).entries()) {
    assert.deepEqual(JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', old.json), 'utf8')), profiles[index]);
    assert.equal(fs.readFileSync(path.resolve(__dirname, '..', old.ini), 'utf8'), profiles[index].config);
  }
});

test('the revised pawn workshop keeps exactly two one-point pawns and charges two points for Bishop pawn', () => {
  assert.equal(library.name, 'Pawn workshop');
  assert.equal(library.edition, 2);
  assert.equal(profile.registry.definitions.length, 19);
  assert.deepEqual(library.designIds, [...OFFICIAL_REFERENCE_DESIGN_IDS, ...V17_REVISED_PAWN_CANDIDATES, ...V17_RESERVE_DESIGN_IDS]);
  const options = getDesignOptions(profile.variant).filter(option => option.family === 'pawn');
  assert.deepEqual(options.filter(option => option.level === 1).map(option => option.id), ['pawn.blue@5', 'pawn.blue@7']);
  assert.deepEqual(new Set(options.filter(option => option.level === 2).map(option => option.id)), new Set(['pawn.orange@3', bishop]));
  const selected = options.find(option => option.id === bishop);
  assert.equal(selected.name, 'Bishop pawn');
  assert.equal(selected.level, 2);
  assert.equal(selected.status, 'experimental');
  assert.match(selected.description, /empty en-passant target.*quiet move.*leaves the bypassed pawn/);
  assert.match(selected.description, /Promotes to a standard queen, rook, bishop, or knight/);
  assert.equal(getDesign(bishop).movement, 'fmWfeFifmnD');
  assert.ok(!options.some(option => ['pawn.blue@2', 'pawn.blue@3', 'pawn.orange@4'].includes(option.id)));
});

test('the earlier Bishop and Returning pawns remain selectable under their original profile and prices', () => {
  const oldLibrary = PLAYABLE_LIBRARIES.find(item => item.id === 'v17-pawns');
  const oldProfile = profiles[PLAYABLE_LIBRARIES.indexOf(oldLibrary)];
  assert.equal(oldLibrary.name, 'Pawn workshop (initial)');
  assert.equal(oldLibrary.superseded, true);
  assert.equal(V17_CANDIDATES.pawns.length, 7);
  assert.equal(getDesign('pawn.blue@2').level, 1);
  assert.equal(getDesign('pawn.blue@3').level, 1);
  const oldOptions = getDesignOptions(oldProfile.variant);
  for (const id of ['pawn.blue@2', 'pawn.blue@3']) assert.equal(oldOptions.find(option => option.id === id).level, 1);
  assert.equal(oldProfile.hash, decodeProfileSnapshot(encodeProfileSnapshot(getProfileSnapshot(oldProfile.variant))).hash);
});

test('the revised workshop preserves tier colors and the numbered grant palette', () => {
  const options = getDesignOptions(profile.variant);
  for (const [id, accent] of [['pawn.blue@5', 'green'], ['pawn.blue@7', 'blue'], ['pawn.orange@3', 'yellow'], [bishop, 'orange']]) {
    assert.equal(options.find(option => option.id === id).accent, accent, id);
  }
  assert.deepEqual(V17_RESERVE_DESIGN_IDS.map(id => options.find(option => option.id === id).accent),
    ['blue', 'green', 'yellow', 'orange', 'red', 'purple', 'teal', 'gold', 'silver']);
  assert.deepEqual(V17_RESERVE_DESIGN_IDS.map(id => getDesign(id).level), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (const id of OFFICIAL_REFERENCE_DESIGN_IDS) assert.equal(options.find(option => option.id === id).accent, 'red');
});

test('revised pawn costs, setup and portable profile round-trip without changing the royal kings', () => {
  const choices = { ...defaultDesignChoices(profile), c2: bishop, d2: 'pawn.blue@5', e1: 'king.reserve-pawn@6',
    c7: bishop, d7: 'pawn.blue@7', e8: 'king.reserve-pawn@6' };
  const setup = designSetupFromChoices(choices, 4, profile);
  assert.deepEqual(setup.costs, { w: 4, b: 4 });
  assert.throws(() => designSetupFromChoices(choices, 3, profile), /Budget exceeded/);
  assert.deepEqual(loadDesignSetup(setup.fen, profile), choices);
  const pieces = pieceMap(setup.fen);
  assert.equal(pieces.get('c2'), letter(bishop).toUpperCase());
  assert.equal(pieces.get('c7'), letter(bishop));
  assert.equal(pieces.get('e1'), 'K');
  assert.equal(pieces.get('e8'), 'k');
  assert.equal(pocketLetters(setup.fen), letter('king.reserve-pawn@6').toUpperCase() + letter('king.reserve-pawn@6'));
  assert.equal(decodeProfileSnapshot(encodeProfileSnapshot(getProfileSnapshot(profile.variant))).hash, profile.hash);
});
