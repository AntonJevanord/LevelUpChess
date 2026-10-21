'use strict';

const compiled = require('./playable-profile.json');
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
const EXPERIMENTAL_VARIANT = PLAYABLE_PROFILE.variant;
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
};

const DESIGN_OPTIONS = freeze(PLAYABLE_PROFILE.registry.definitions.map(definition => {
  const [name, movement] = metadata[definition.id];
  const suffix = definition.family === 'pawn' ? ' Promotes to a standard queen, rook, bishop, or knight.'
    : definition.family === 'rook' ? ' Can castle under the usual rules.' : '';
  return {
    id: definition.id,
    family: definition.family,
    level: definition.level,
    name,
    description: movement + suffix,
    status: definition.id === 'pawn.purple@2' ? 'parked' : definition.revision > 1 ? 'experimental' : 'reference',
  };
}));
const optionsById = Object.fromEntries(DESIGN_OPTIONS.map(option => [option.id, option]));

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

const PROFILE_SNAPSHOT = freeze({
  schemaVersion: 1,
  variant: PLAYABLE_PROFILE.variant,
  hash: PLAYABLE_PROFILE.hash,
  registryHash: PLAYABLE_PROFILE.registryHash,
  registry: PLAYABLE_PROFILE.registry,
  config: PLAYABLE_PROFILE.config,
});

function sameValue(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false;
  if (!Array.isArray(left) && ![Object.prototype, null].includes(Object.getPrototypeOf(left))) return false;
  const keys = Object.keys(right);
  return Object.keys(left).length === keys.length && keys.every(key => Object.hasOwn(left, key) && sameValue(left[key], right[key]));
}

function getProfileSnapshot() { return PROFILE_SNAPSHOT; }

/** Current portable games accept the bundled immutable library, not raw rules. */
function validateProfileSnapshot(snapshot) {
  if (!sameValue(snapshot, PROFILE_SNAPSHOT)) throw new Error('This experimental game needs its original design profile. Use the matching build; modified rules or allocations are not supported.');
  return PROFILE_SNAPSHOT;
}

function encodeProfileSnapshot(snapshot = PROFILE_SNAPSHOT) {
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

module.exports = { PLAYABLE_PROFILE, EXPERIMENTAL_VARIANT, DESIGN_OPTIONS, pieceInfoForProfile, getProfileSnapshot, validateProfileSnapshot, encodeProfileSnapshot, decodeProfileSnapshot };
