'use strict';

const { PLAYABLE_PROFILE } = require('./design-options');
const { PIECE_SLOTS } = require('./piece-catalog');
const { placementFromMap } = require('./profile-fen');
const { deployDesignArmies, recoverDesignChoices } = require('./design-deployment');

const DEFAULT_DESIGN_CHOICES = Object.freeze(Object.fromEntries(PIECE_SLOTS.map(slot => [slot.square, ''])));
const relative = square => square[0] + (9 - Number(square[1]));

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

function designSetupFromChoices(input, budget, profile = PLAYABLE_PROFILE) {
  if (!Number.isInteger(budget) || budget < 1 || budget > 6) throw new Error('Choose a whole-number upgrade budget from 1 to 6.');
  if (!input || typeof input !== 'object' || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input)) || Object.keys(input).length !== PIECE_SLOTS.length) throw new Error(`Choose a design for each of the ${PIECE_SLOTS.length} upgradeable starting pieces.`);
  const byId = new Map(profile.registry.allocations.map(allocation => [allocation.id, { allocation, definition: profile.definitionsByLetter[allocation.letter] }]));
  const choices = {};
  const costs = { w: 0, b: 0 };
  const armies = { w: { choices: [] }, b: { choices: [] } };
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

module.exports = { DEFAULT_DESIGN_CHOICES, designSetupFromChoices, loadDesignSetup };
