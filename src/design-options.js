'use strict';

const compiled = require('./playable-profile.json');
const reference = require('./playable-reference-profile.json');
const alternatives = require('./playable-alternatives-profile.json');
const closeoutProfiles = [
  require('./playable-v16-references-profile.json'),
  require('./playable-v16-pawns-profile.json'),
  require('./playable-v16-knights-profile.json'),
  require('./playable-v16-bishops-profile.json'),
  require('./playable-v16-rooks-profile.json'),
  require('./playable-v16-queens-profile.json'),
];
const currentProfiles = [
  require('./playable-v17-references-profile.json'),
  require('./playable-v17-pawns-profile.json'),
  require('./playable-v17-knights-profile.json'),
  require('./playable-v17-bishops-profile.json'),
  require('./playable-v17-rooks-profile.json'),
  require('./playable-v17-queens-profile.json'),
];
const { PLAYABLE_LIBRARIES: libraries, OFFICIAL_REFERENCE_DESIGN_IDS, V16_CANDIDATES, RESERVE_DESIGN_IDS, V17_CANDIDATES, V17_RESERVE_DESIGN_IDS } = require('./playable-library');
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
const PLAYABLE_PROFILES = freeze([PLAYABLE_PROFILE, reference, alternatives, ...closeoutProfiles, ...currentProfiles]);
const EXPERIMENTAL_VARIANT = PLAYABLE_PROFILE.variant;
const EXPERIMENTAL_VARIANTS = freeze(PLAYABLE_PROFILES.map(profile => profile.variant));
const PLAYABLE_LIBRARIES = freeze(libraries.map((library, index) => ({ id: library.id, name: library.name, variant: PLAYABLE_PROFILES[index].variant, ...(library.generation ? { generation: library.generation } : {}), ...(library.focusFamily ? { focusFamily: library.focusFamily } : {}) })));
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
  'pawn.purple@10': ['Rank camel pawn', 'Move or capture along clear horizontal lines. Move one square forward, capture one square diagonally forward, or jump two or three files sideways and one rank forward, including captures. The initial two-step needs a clear path.'],
  'bishop.purple@5': ['Tall-jump vertical bishop', 'Normal bishop moves plus full vertical rook moves and captures. Also jump one file sideways and two ranks forward or backward, including captures.'],
  'bishop.purple@6': ['Long-sideways bishop', 'Normal bishop moves plus horizontal moves and captures of any clear distance. Also jump two files sideways and one rank forward or backward, including captures.'],
  'rook.purple@5': ['Diagonal-blink rook', 'Normal rook moves and captures, plus diagonal captures one or two clear squares away. Without capturing, also jump to any empty square within three squares horizontally and vertically, crossing intervening pieces.'],
  'queen.purple@5': ['Queen and forward companion', 'Keep your ordinary queen and add a capturable companion on your second rank, pushing your own pawn stack forward within your half. The companion moves one square in any direction and captures forward or sideways, including forward diagonals. It cannot capture backward. It is not royal; only the ordinary king must avoid check.'],
  'rook.purple@10': ['Vanguard', 'Normal rook moves, plus clear diagonal moves and captures forward.'],
  'bishop.purple@13': ['Cruisader', 'Normal bishop moves, plus clear horizontal moves up to two squares. Also move or capture two files sideways and one rank forward or backward if the first sideways square is empty.'],
  'pawn.blue@2': ['Bishop pawn', 'Move one square forward, or move or capture one square diagonally forward. A clear initial two-step is available from your home two ranks. Visiting an empty en-passant target diagonally is a quiet move and leaves the bypassed pawn.'],
  'pawn.orange@3': ['Knight pawn', 'Normal pawn moves and captures, plus forward knight jumps: one or two files sideways and two or one ranks forward, including captures.'],
  'pawn.purple@11': ['Rook pawn', 'Move any clear distance orthogonally without capturing. Capture one or two clear squares diagonally forward.'],
  'pawn.blue@3': ['Returning pawn', 'Move one clear square backward, or one or two clear squares forward without capturing. Capture one square diagonally forward.'],
  'pawn.orange@4': ['King pawn', 'Move one square in any direction, or capture one square diagonally in any direction. A clear initial two-step forward is available. Visiting an empty en-passant target diagonally is a quiet move and leaves the bypassed pawn.'],
  'pawn.blue@5': ['Two-step pawn', 'Move one or two clear squares forward without capturing. Capture one or two clear squares diagonally forward. These moves cannot jump over a piece.'],
  'pawn.blue@7': ['King-step pawn', 'Move one square in any direction without capturing, or capture one square diagonally in any direction. A clear two-square forward move is available from your home two ranks. Visiting an empty en-passant target diagonally is a quiet move and leaves the bypassed pawn.'],
  'pawn.purple@12': ['Queen pawn', 'Move or capture up to two clear squares straight or diagonally forward. Move up to two clear squares straight or diagonally backward without capturing. No sideways moves. Visiting an empty en-passant target is a quiet move and leaves the bypassed pawn.'],
  'knight.blue@2': ['Positional knight', 'Normal knight jumps, plus any clear horizontal move without capturing.'],
  'knight.orange@3': ['Dabada knight', 'Normal knight jumps, plus one-square sideways steps and two-square sideways jumps, including captures.'],
  'knight.purple@4': ['Nightrider', 'Repeat knight jumps in the same direction, stopping at an occupied landing square. Intervening squares between knight landings do not block it.'],
  'knight.blue@3': ['Climbing knight', 'Normal knight jumps, plus a one-square forward or backward step, including captures.'],
  'knight.orange@4': ['Long-range knight', 'Normal knight jumps, plus two-square diagonal jumps, including captures.'],
  'knight.purple@5': ['Princess knight', 'Normal knight jumps, plus one-square steps in any direction, including captures.'],
  'knight.purple@6': ['Grid knight', 'Normal knight jumps, plus one-square orthogonal steps and three-square orthogonal jumps, including captures.'],
  'bishop.blue@2': ['Hopping bishop', 'Normal bishop moves. Also hop diagonally over exactly one piece to the empty square immediately beyond it, without capturing.'],
  'bishop.orange@2': ['Tall-knight bishop', 'Normal bishop moves, plus knight jumps two ranks forward or backward and one file sideways, including captures.'],
  'bishop.purple@14': ['Mating bishop', 'Normal bishop moves. Also capture with one-square orthogonal steps, knight jumps, two-square orthogonal jumps, or two-square diagonal jumps. These extra moves require a capture.'],
  'bishop.blue@3': ['Wazzap bishop', 'Normal bishop moves, plus one-square sideways steps, including captures.'],
  'bishop.orange@3': ['Free Boar bishop', 'Normal bishop moves, plus horizontal rook moves and captures.'],
  'bishop.purple@15': ['Vertical bishop', 'Normal bishop moves, plus vertical one-square steps, tall knight jumps and tall zebra jumps (three ranks and two files), including captures.'],
  'bishop.purple@16': ['Archbishop', 'Normal bishop moves and knight jumps, including captures.'],
  'rook.blue@2': ['Ghost rook', 'Normal rook moves. Also hop along a rank or file over exactly one piece and land on any empty square beyond it before the next blocker, without capturing.'],
  'rook.orange@2': ['Blink rook', 'Normal rook moves and captures. Also jump to any empty square within three files and three ranks, without capturing.'],
  'rook.purple@12': ['Ranged rook', 'Normal rook moves and camel jumps (three squares in one direction and one at right angles), including captures.'],
  'rook.blue@3': ['Pawn rook', 'Normal rook moves, plus one-square forward diagonal captures.'],
  'rook.orange@3': ['Knight-capture rook', 'Normal rook moves, plus capture-only knight jumps.'],
  'rook.purple@13': ['Side rook', 'Normal rook moves, plus one-square diagonal steps, wide knight jumps and wide camel jumps, including captures. Wide jumps travel two or three files sideways and one rank forward or backward.'],
  'queen.blue@2': ['Advancing queen', 'Normal queen moves, plus quiet forward knight jumps.'],
  'queen.orange@2': ['Box queen', 'Normal queen moves, plus quiet jumps to squares three files or three ranks away within a three-square box.'],
  'queen.purple@6': ['Sideways queen', 'Normal queen moves, plus wide knight and camel jumps (two or three files sideways and one rank forward or backward), including captures.'],
  'queen.purple@7': ['X-ray queen', 'Normal queen moves. Also hop diagonally over exactly one piece and land anywhere beyond it before the next blocker, including capturing that next blocker.'],
  'queen.purple@8': ['Zebra queen', 'Normal queen moves and zebra jumps (three squares in one direction and two at right angles), including captures.'],
  'king.reserve-pawn@1': ['Pawn grant', 'Add a nonroyal guard that moves or captures one square straight forward.'],
  'king.reserve-pawn@6': ['Pawn grant', 'Add a nonroyal guard that moves or captures one square straight forward, or moves one square diagonally forward without capturing.'],
  'king.reserve-bishop@1': ['Bishop grant', 'Add a nonroyal guard that moves or captures one square diagonally.'],
  'king.reserve-rook@1': ['Rook grant', 'Add a nonroyal guard that moves or captures one or two clear squares orthogonally.'],
  'king.reserve-king@1': ['King grant', 'Add a nonroyal guard that moves or captures one square in any direction.'],
  'king.reserve-knight@1': ['Knight grant', 'Add a nonroyal guard with normal king steps and quiet knight jumps.'],
  'king.reserve-queen@1': ['Queen grant', 'Add a nonroyal guard that moves or captures up to two clear squares in any queen direction.'],
  'king.reserve-okapi@1': ['Okapi grant', 'Add a nonroyal guard with knight and zebra jumps, including captures.'],
  'king.reserve-princess@1': ['Princess grant', 'Add a nonroyal guard with king steps and knight jumps, including captures.'],
  'king.reserve-true-queen@1': ['True queen grant', 'Add a nonroyal guard with normal queen moves and captures.'],
};

const definitions = [...new Map(PLAYABLE_PROFILES.flatMap(profile => profile.registry.definitions).map(definition => [definition.id, definition])).values()];
const DESIGN_OPTIONS = freeze(definitions.map(definition => {
  const [name, movement] = metadata[definition.id];
  const suffix = definition.placement === 'reserve' ? ' It starts in reserve; drop it on an empty square in your own four ranks as a turn. Checking drops are forbidden. Your ordinary royal king keeps its normal moves and castling.'
    : definition.family === 'pawn' ? ' Promotes to a standard queen, rook, bishop, or knight.'
    : definition.family === 'rook' ? ' Can castle under the usual rules.' : '';
  return {
    id: definition.id,
    family: definition.family,
    level: definition.level,
    name,
    description: movement + suffix,
    status: definition.id === 'rook.purple@1' ? 'retired' : definition.id === 'pawn.purple@2' ? 'parked' : definition.revision > 1 || definition.placement === 'reserve' ? 'experimental' : 'reference',
  };
}));
const optionsById = Object.fromEntries(DESIGN_OPTIONS.map(option => [option.id, option]));
const officialNames = { 'rook.purple@10': 'Vanguard', 'knight.purple@3': 'Unicorn', 'bishop.purple@13': 'Cruisader', 'queen.purple@1': 'Amazon' };
const historicalAccents = ['', 'green', 'cyan', 'red', 'violet', 'orange', 'pink', 'teal', 'gold', 'silver'];
const variantAccents = { 1: ['green', 'blue'], 2: ['yellow', 'orange'], 3: ['red', 'purple'] };
const kingGrantAccents = ['blue', 'green', 'yellow', 'orange', 'red', 'purple', 'teal', 'gold', 'silver'];
// Colors follow declared designs, not allocated letters or profile sorting.
// References occupy the first level-three option in their own piece family.
function workshopAccentsFor(candidates, reserves) {
  const accents = {};
  const coloredGroups = new Set();
  for (const id of new Set([...OFFICIAL_REFERENCE_DESIGN_IDS, ...Object.values(candidates).flat()])) {
    const option = optionsById[id];
    const group = `${option.family}:${option.level}`;
    const pair = variantAccents[option.level];
    accents[id] = pair ? pair[coloredGroups.has(group) ? 1 : 0] : historicalAccents[option.level];
    coloredGroups.add(group);
  }
  // Grant costs remain 1–9; paired colors are a separate display sequence.
  reserves.forEach((id, index) => { accents[id] = kingGrantAccents[index]; });
  return Object.freeze(accents);
}
const workshopAccents = workshopAccentsFor(V16_CANDIDATES, RESERVE_DESIGN_IDS);
const currentWorkshopAccents = workshopAccentsFor(V17_CANDIDATES, V17_RESERVE_DESIGN_IDS);
function optionInProfile(option, profile) {
  if (!option) return option;
  const accents = currentProfiles.some(candidate => candidate.variant === profile.variant) ? currentWorkshopAccents
    : closeoutProfiles.some(candidate => candidate.variant === profile.variant) ? workshopAccents : null;
  if (!accents) return option;
  return { ...option, accent: accents[option.id], ...(officialNames[option.id] ? { name: officialNames[option.id], status: 'reference' } : {}) };
}
function getDesignOptions(variant = EXPERIMENTAL_VARIANT) {
  const profile = getPlayableProfile(variant);
  if (!profile) return [];
  return profile.registry.definitions.map(definition => optionInProfile(optionsById[definition.id], profile)).filter(option => option.status !== 'retired');
}

/** Resolve glyphs and labels through the actual profile, never legacy letters. */
function pieceInfoForProfile(profile, type) {
  if (typeof type !== 'string') return undefined;
  type = type.toLowerCase();
  if (!profile) return pieceInfo(type);
  const definition = profile?.definitionsByLetter?.[type];
  if (!definition) return Object.values(STANDARD_TYPES).includes(type) ? pieceInfo(type) : undefined;
  const option = optionInProfile(optionsById[definition.id], profile);
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
    accent: option.accent || historicalAccents[definition.level],
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
