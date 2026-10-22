'use strict';

const compiled = require('./playable-profile.json');
const reference = require('./playable-reference-profile.json');
const { PLAYABLE_LIBRARIES: libraries } = require('./playable-library');
const { STANDARD_TYPES } = require('./design-catalog');
const { pieceInfo } = require('./piece-catalog');

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

const PLAYABLE_PROFILE = freeze(compiled);
const PLAYABLE_PROFILES = freeze([PLAYABLE_PROFILE, reference]);
const EXPERIMENTAL_VARIANT = PLAYABLE_PROFILE.variant;
const EXPERIMENTAL_VARIANTS = freeze(PLAYABLE_PROFILES.map(profile => profile.variant));
const PLAYABLE_LIBRARIES = freeze(libraries.map((library, index) => ({ id: library.id, name: library.name, variant: PLAYABLE_PROFILES[index].variant })));
function getPlayableProfile(variant = EXPERIMENTAL_VARIANT) { return PLAYABLE_PROFILES.find(profile => profile.variant === variant); }
function isExperimentalVariant(variant) { return EXPERIMENTAL_VARIANTS.includes(variant); }
const metadata = {
  'pawn.blue@1': ['Leaping pawn', 'Jump one or two squares forward, or three from the home ranks. Capture one square diagonally forward.'],
  'pawn.orange@1': ['Forward pawn', 'Move or capture one square forward or diagonally forward. The initial two-step needs a clear path.'],
  'pawn.purple@1': ['Ranging pawn', 'Move along clear rook lines in any direction. Capture along clear bishop lines.'],
  'pawn.purple@2': ['Short-slide pawn', 'Move one or two clear squares orthogonally in any direction. Capture along clear bishop lines.'],
  'pawn.purple@3': ['Courier pawn', 'Move any clear distance forward or sideways without capturing. Capture one or two clear squares diagonally forward.'],
  'pawn.purple@4': ['Rank pawn', 'Move or capture along clear horizontal lines. Move one square forward and capture one square diagonally forward; an initial two-step needs a clear path.'],
  'pawn.purple@5': ['Returning pawn', 'Move or capture one or two clear squares straight or diagonally forward. Move one or two clear squares straight or diagonally backward without capturing. No sideways moves. Moving diagonally to an empty en-passant target is quiet and leaves the bypassed pawn. Quiet moves count toward the fifty-move rule.'],
  'pawn.purple@6': ['Twin pawns', 'Replace one pawn with two pawns on its file for one three-point purchase. Each moves one square forward or jumps two forward, and captures one square diagonally forward.'],
  'knight.blue@1': ['Step knight', 'Normal knight moves plus one orthogonal step into an empty square.'],
  'knight.orange@1': ['Side-jump knight', 'Normal knight moves plus a two-square sideways jump, including captures.'],
  'knight.purple@1': ['Knight and guard', 'Keep the ordinary knight and add a guard on b3/g3 or b6/g6. It moves or captures one or two squares orthogonally; two-square moves jump.'],
  'knight.purple@2': ['Knight and guard', 'Keep the ordinary knight and add a guard on b2/g2 or b7/g7, pushing your pawns on that file forward within your half. The guard moves or captures one or two squares orthogonally; two-square moves jump.'],
  'bishop.blue@1': ['Step bishop', 'Normal bishop moves plus one orthogonal step into an empty square.'],
  'bishop.orange@1': ['Forward-capture bishop', 'Normal bishop moves plus capture-only knight jumps two squares forward and one sideways.'],
  'bishop.purple@1': ['Vertical bishop', 'Normal bishop moves plus full vertical rook moves and captures.'],
  'rook.blue@1': ['Home-jump rook', 'Normal rook moves plus quiet two-square orthogonal jumps while on your home two ranks.'],
  'rook.orange@1': ['Screen rook', 'Normal rook moves and captures, plus captures across exactly one intervening piece.'],
  'rook.purple@1': ['Capture-box rook', 'Normal rook moves plus jump-captures anywhere within two squares, including diagonals.'],
  'rook.purple@2': ['Knight-capture rook', 'Normal rook moves and captures, plus capture-only knight jumps.'],
  'queen.blue@1': ['Home-jump queen', 'Normal queen moves plus quiet knight, camel (1,3), and zebra (2,3) jumps while on your home two ranks.'],
  'queen.orange@1': ['Quiet-jump queen', 'Normal queen moves plus knight jumps into empty squares.'],
  'queen.purple@1': ['Amazon', 'Normal queen moves plus knight jumps, including captures.'],
  'pawn.orange@2': ['Twin pawns', 'Replace one pawn with two pawns on its file for one two-point purchase. Each moves one square forward or jumps two forward, and captures one square diagonally forward.'],
  'knight.orange@2': ['Camel knight', 'Normal knight jumps plus camel jumps: three squares in one direction and one at right angles. All jumps can capture.'],
  'knight.purple@3': ['Camel knight', 'Normal knight jumps plus camel jumps: three squares in one direction and one at right angles. All jumps can capture.'],
  'bishop.purple@2': ['Sideways bishop', 'Normal bishop moves plus quiet horizontal slides of one or two clear squares, and knight jumps two files sideways and one rank forward or backward, including captures.'],
  'rook.purple@3': ['Blink rook', 'Normal rook moves and captures. Without capturing, also jump to any empty square within three squares horizontally and vertically, crossing intervening pieces.'],
  'queen.purple@2': ['Twin short queens', 'Replace your queen with two short queens for one three-point purchase. Each moves or captures up to two clear squares in any queen direction. The second starts on your second rank, pushing your own pawn stack forward within your half.'],
  'queen.purple@3': ['Queen and companion', 'Keep your ordinary queen and add a capturable companion on your second rank, pushing your own pawn stack forward within your half. The companion moves or captures one square in any direction. It is not royal; only the ordinary king must avoid check.'],
  'pawn.purple@7': ['Ranging pawn', 'Move along clear rook lines in any direction without capturing. Capture one or two clear squares diagonally in any direction.'],
  'pawn.purple@8': ['Courier pawn', 'Move any clear distance forward or sideways without capturing. Capture any clear distance diagonally forward. No backward moves.'],
  'pawn.purple@9': ['Rank pawn', 'Move or capture along clear horizontal lines. Move one square forward, capture one square diagonally forward, or jump two files sideways and one rank forward, including captures. The initial two-step needs a clear path.'],
  'bishop.purple@3': ['Vertical bishop', 'Normal bishop moves plus full vertical rook moves and captures. Also jump like a knight to empty squares, crossing intervening pieces.'],
  'bishop.purple@4': ['Sideways bishop', 'Normal bishop moves plus horizontal moves and captures of one or two clear squares. Also jump two files sideways and one rank forward or backward, including captures.'],
  'rook.purple@4': ['Blink rook', 'Normal rook moves and captures, plus one-square diagonal captures. Without capturing, also jump to any empty square within three squares horizontally and vertically, crossing intervening pieces.'],
  'queen.purple@4': ['Queen and companion', 'Keep your ordinary queen and add a capturable companion on your second rank, pushing your own pawn stack forward within your half. The companion moves one square in any direction but captures only diagonally. It is not royal; only the ordinary king must avoid check.'],
};

const definitions = [...new Map(PLAYABLE_PROFILES.flatMap(profile => profile.registry.definitions).map(definition => [definition.id, definition])).values()];
const DESIGN_OPTIONS = freeze(definitions.map(definition => {
  const [name, movement] = metadata[definition.id];
  const suffix = definition.family === 'pawn' ? ' Promotes to a standard queen, rook, bishop, or knight.'
    : definition.family === 'rook' ? ' Can castle under the usual rules.' : '';
  return {
    id: definition.id,
    family: definition.family,
    level: definition.level,
    name,
    description: movement + suffix,
    status: definition.id === 'rook.purple@1' ? 'retired' : definition.id === 'pawn.purple@2' ? 'parked' : definition.revision > 1 ? 'experimental' : 'reference',
  };
}));
const optionsById = Object.fromEntries(DESIGN_OPTIONS.map(option => [option.id, option]));
function getDesignOptions(variant = EXPERIMENTAL_VARIANT) {
  const profile = getPlayableProfile(variant);
  if (!profile) return [];
  return profile.registry.definitions.map(definition => optionsById[definition.id]).filter(option => option.status !== 'retired');
}

/** Resolve glyphs and labels through the actual profile, never legacy letters. */
function pieceInfoForProfile(profile, type) {
  if (typeof type !== 'string') return undefined;
  type = type.toLowerCase();
  if (!profile) return pieceInfo(type);
  const definition = profile?.definitionsByLetter?.[type];
  if (!definition) return Object.values(STANDARD_TYPES).includes(type) ? pieceInfo(type) : undefined;
  const option = optionsById[definition.id];
  const standard = pieceInfo(STANDARD_TYPES[definition.family]);
  if (!option || !standard) return undefined;
  return {
    type,
    designId: definition.id,
    revision: definition.revision,
    name: `${option.name}, level ${definition.level}`,
    family: definition.family,
    level: definition.level,
    cost: definition.level,
    accent: ['', 'green', 'cyan', 'red'][definition.level],
    symbols: standard.symbols,
    description: option.description,
    status: option.status,
  };
}

const PROFILE_SNAPSHOTS = freeze(PLAYABLE_PROFILES.map(profile => ({
  schemaVersion: 1,
  variant: profile.variant,
  hash: profile.hash,
  registryHash: profile.registryHash,
  registry: profile.registry,
  config: profile.config,
})));

function sameValue(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false;
  if (!Array.isArray(left) && ![Object.prototype, null].includes(Object.getPrototypeOf(left))) return false;
  const keys = Object.keys(right);
  return Object.keys(left).length === keys.length && keys.every(key => Object.hasOwn(left, key) && sameValue(left[key], right[key]));
}

function getProfileSnapshot(variant = EXPERIMENTAL_VARIANT) { return PROFILE_SNAPSHOTS.find(snapshot => snapshot.variant === variant); }

/** Current portable games accept the bundled immutable library, not raw rules. */
function validateProfileSnapshot(snapshot, variant = snapshot?.variant) {
  const expected = getProfileSnapshot(variant);
  if (!expected || !sameValue(snapshot, expected)) throw new Error('This experimental game needs its original design profile. Use the matching build; modified rules or allocations are not supported.');
  return expected;
}

function encodeProfileSnapshot(snapshot = getProfileSnapshot()) {
  const bytes = new TextEncoder().encode(JSON.stringify(validateProfileSnapshot(snapshot)));
  return btoa(Array.from(bytes, value => String.fromCharCode(value)).join(''));
}

function decodeProfileSnapshot(encoded) {
  try {
    if (typeof encoded !== 'string' || !encoded.length || encoded.length > 32768 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new Error();
    const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
    const snapshot = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return validateProfileSnapshot(snapshot);
  } catch { throw new Error('The experimental game profile is damaged or does not match this build.'); }
}

module.exports = { PLAYABLE_PROFILE, PLAYABLE_PROFILES, PLAYABLE_LIBRARIES, EXPERIMENTAL_VARIANT, EXPERIMENTAL_VARIANTS, DESIGN_OPTIONS, getPlayableProfile, getDesignOptions, isExperimentalVariant, pieceInfoForProfile, getProfileSnapshot, validateProfileSnapshot, encodeProfileSnapshot, decodeProfileSnapshot };
