'use strict';

const { PLAYABLE_PROFILE } = require('./design-options');
const { PIECE_SLOTS } = require('./piece-catalog');
const { placementFromMap, pieceMap } = require('./profile-fen');
const { deployDesignArmies, recoverDesignChoices } = require('./design-deployment');

const DEFAULT_DESIGN_CHOICES = Object.freeze(Object.fromEntries(PIECE_SLOTS.map(slot => [slot.square, ''])));
const relative = square => square[0] + (9 - Number(square[1]));
const KING_SLOTS = Object.freeze([{ square: 'e1', color: 'w', family: 'king' }, { square: 'e8', color: 'b', family: 'king' }].map(Object.freeze));
const designSlots = (profile = PLAYABLE_PROFILE) => profile.roles.reserveTypes ? [...PIECE_SLOTS, ...KING_SLOTS] : PIECE_SLOTS;
const defaultDesignChoices = (profile = PLAYABLE_PROFILE) => Object.fromEntries(designSlots(profile).map(slot => [slot.square, '']));
const designBudgetLimit = (profile = PLAYABLE_PROFILE) => profile.roles.reserveTypes ? 9 : 6;

function designSetupFromChoices(input, budget, profile = PLAYABLE_PROFILE) {
  const slots = designSlots(profile);
  const limit = designBudgetLimit(profile);
  if (!Number.isInteger(budget) || budget < 1 || budget > limit) throw new Error(`Choose a whole-number upgrade budget from 1 to ${limit}.`);
  if (!input || typeof input !== 'object' || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input)) || Object.keys(input).length !== slots.length) throw new Error(`Choose a design for each of the ${slots.length} upgradeable starting pieces.`);
  const byId = new Map(profile.registry.allocations.map(allocation => [allocation.id, { allocation, definition: profile.definitionsByLetter[allocation.letter] }]));
  const choices = {};
  const costs = { w: 0, b: 0 };
  const armies = { w: { choices: [] }, b: { choices: [] } };
  for (const slot of slots) {
    const id = Object.hasOwn(input, slot.square) ? input[slot.square] : undefined;
    if (typeof id !== 'string') throw new Error(`Choose a registered ${slot.family} design for ${slot.square}.`);
    choices[slot.square] = id;
    if (!id) continue;
    const selected = byId.get(id);
    if (!selected || selected.definition?.family !== slot.family) throw new Error(`Choose a registered ${slot.family} design for ${slot.square}.`);
    const { allocation, definition } = selected;
    costs[slot.color] += definition.level;
    const relativeSquare = slot.color === 'w' ? slot.square : relative(slot.square);
    armies[slot.color].choices.push({ square: relativeSquare, definition, letter: allocation.letter });
  }
  if (costs.w > budget || costs.b > budget) throw new Error(`Budget exceeded: White ${costs.w}/${budget} · Black ${costs.b}/${budget}.`);
  const pieces = deployDesignArmies(profile, armies.w, armies.b);
  const rights = [['K', 'h1'], ['Q', 'a1'], ['k', 'h8'], ['q', 'a8']].filter(([, square]) => profile.roles.castlingRooks.includes(pieces.get(square)?.toLowerCase())).map(([right]) => right).join('') || '-';
  return { fen: placementFromMap(pieces) + ` w ${rights} - 0 1`, choices, budget, costs, white: costs.w, black: costs.b };
}

/** Recover next-game choices from the game's initial position and its mapping. */
function loadDesignSetup(fen, profile = PLAYABLE_PROFILE) {
  return recoverDesignChoices(pieceMap(fen), profile);
}

module.exports = { DEFAULT_DESIGN_CHOICES, designSlots, defaultDesignChoices, designBudgetLimit, designSetupFromChoices, loadDesignSetup };
