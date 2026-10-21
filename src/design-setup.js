'use strict';

const { PLAYABLE_PROFILE } = require('./design-options');
const { STANDARD_TYPES } = require('./design-catalog');
const { PIECE_SLOTS } = require('./piece-catalog');
const { START_FEN } = require('./knight-setup');

const DEFAULT_DESIGN_CHOICES = Object.freeze(Object.fromEntries(PIECE_SLOTS.map(slot => [slot.square, ''])));
const relative = square => square[0] + (9 - Number(square[1]));
const colored = (type, color) => color === 'w' ? type.toUpperCase() : type;

function pieceMap(fen) {
  if (typeof fen !== 'string') throw new Error('The starting FEN is invalid.');
  const ranks = fen.trim().split(/\s+/)[0].split('/');
  if (ranks.length !== 8) throw new Error('The starting FEN is invalid.');
  const map = new Map();
  ranks.forEach((rank, row) => {
    let file = 0;
    for (const character of rank) {
      if (/^[1-8]$/.test(character)) file += Number(character);
      else if (/^[A-Za-z]$/.test(character) && file < 8) map.set('abcdefgh'[file++] + (8 - row), character);
      else throw new Error('The starting FEN is invalid.');
    }
    if (file !== 8) throw new Error('The starting FEN is invalid.');
  });
  return map;
}

function placement(pieces) {
  return Array.from({ length: 8 }, (_, row) => {
    let rank = '', empty = 0;
    for (const file of 'abcdefgh') {
      const piece = pieces.get(file + (8 - row));
      if (!piece) { empty++; continue; }
      if (empty) rank += empty;
      rank += piece;
      empty = 0;
    }
    return rank + (empty || '');
  }).join('/');
}

function designSetupFromChoices(input, budget, profile = PLAYABLE_PROFILE) {
  if (!Number.isInteger(budget) || budget < 1 || budget > 6) throw new Error('Choose a whole-number upgrade budget from 1 to 6.');
  if (!input || typeof input !== 'object' || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input)) || Object.keys(input).length !== PIECE_SLOTS.length) throw new Error(`Choose a design for each of the ${PIECE_SLOTS.length} upgradeable starting pieces.`);
  const byId = new Map(profile.registry.allocations.map(allocation => [allocation.id, { allocation, definition: profile.definitionsByLetter[allocation.letter] }]));
  const pieces = pieceMap(START_FEN);
  const choices = {};
  const costs = { w: 0, b: 0 };
  for (const slot of PIECE_SLOTS) {
    const id = Object.hasOwn(input, slot.square) ? input[slot.square] : undefined;
    if (typeof id !== 'string') throw new Error(`Choose a registered ${slot.family} design for ${slot.square}.`);
    choices[slot.square] = id;
    if (!id) continue;
    const selected = byId.get(id);
    if (!selected || selected.definition?.family !== slot.family) throw new Error(`Choose a registered ${slot.family} design for ${slot.square}.`);
    const { allocation, definition } = selected;
    costs[slot.color] += definition.level;
    const relativeSquare = slot.color === 'w' ? slot.square : relative(slot.square);
    const relativeTarget = definition.placement === 'extra' ? definition.extraSquare?.[relativeSquare] : relativeSquare;
    if (!relativeTarget) throw new Error(`The extra piece cannot be placed for ${slot.square}.`);
    const target = slot.color === 'w' ? relativeTarget : relative(relativeTarget);
    if (definition.placement === 'extra' && pieces.has(target)) throw new Error(`The extra-piece square ${target} is occupied.`);
    pieces.set(target, colored(allocation.letter, slot.color));
  }
  if (costs.w > budget || costs.b > budget) throw new Error(`Budget exceeded: White ${costs.w}/${budget} · Black ${costs.b}/${budget}.`);
  const rights = [['K', 'h1'], ['Q', 'a1'], ['k', 'h8'], ['q', 'a8']].filter(([, square]) => profile.roles.castlingRooks.includes(pieces.get(square)?.toLowerCase())).map(([right]) => right).join('') || '-';
  return { fen: placement(pieces) + ` w ${rights} - 0 1`, choices, budget, costs, white: costs.w, black: costs.b };
}

/** Recover next-game choices from the game's initial position and its mapping. */
function loadDesignSetup(fen, profile = PLAYABLE_PROFILE) {
  const pieces = pieceMap(fen);
  const result = { ...DEFAULT_DESIGN_CHOICES };
  for (const slot of PIECE_SLOTS) {
    const relativeSquare = slot.color === 'w' ? slot.square : relative(slot.square);
    const source = pieces.get(slot.square);
    const extra = profile.registry.allocations.find(({ id, letter }) => {
      const definition = profile.definitionsByLetter[letter];
      if (definition.family !== slot.family || definition.placement !== 'extra') return false;
      const relativeTarget = definition.extraSquare?.[relativeSquare];
      if (!relativeTarget) return false;
      const target = slot.color === 'w' ? relativeTarget : relative(relativeTarget);
      return source === colored(STANDARD_TYPES[slot.family], slot.color) && pieces.get(target) === colored(letter, slot.color);
    });
    if (extra) result[slot.square] = extra.id;
    else if (source && (source === source.toUpperCase()) === (slot.color === 'w')) {
      const definition = profile.definitionsByLetter[source.toLowerCase()];
      if (definition?.family === slot.family && definition.placement === 'replace') result[slot.square] = definition.id;
    }
  }
  return result;
}

module.exports = { DEFAULT_DESIGN_CHOICES, designSetupFromChoices, loadDesignSetup };
