'use strict';

const { STANDARD_TYPES } = require('./design-catalog');
const { PIECE_SLOTS } = require('./piece-catalog');
const { START_FEN } = require('./knight-setup');
const { pieceMap } = require('./profile-fen');

const relativeSquare = (square, color) => color === 'w' ? square : square[0] + (9 - Number(square[1]));
const colored = (type, color) => color === 'w' ? type.toUpperCase() : type;
const own = (piece, color) => typeof piece === 'string' && piece === colored(piece.toLowerCase(), color);
const relativeSlots = new Map([...PIECE_SLOTS.filter(slot => slot.color === 'w'), { square: 'e1', family: 'king' }].map(slot => [slot.square, slot]));

function sourceFor(pieces, square, definition, color) {
  const slot = relativeSlots.get(square);
  if (!slot || slot.family !== definition.family || pieces.get(relativeSquare(square, color)) !== colored(STANDARD_TYPES[definition.family], color)) {
    throw new Error(`The ${definition.family} design cannot be placed for ${relativeSquare(square, color)}.`);
  }
}

function insertPawnStack(pieces, target, letter, color, pawnTypes) {
  if (!/^[a-h]2$/.test(target)) throw new Error('Inserted pieces must start on their own second rank.');
  const file = target[0];
  let empty = 2;
  while (empty <= 4 && pieces.has(relativeSquare(file + empty, color))) {
    const piece = pieces.get(relativeSquare(file + empty, color));
    if (!own(piece, color) || !pawnTypes.has(piece.toLowerCase())) throw new Error(`Only your own pawns can move forward to make room on the ${file}-file.`);
    empty++;
  }
  if (empty > 4) throw new Error(`There is no deployment space on your half of the ${file}-file.`);
  for (let rank = empty; rank > 2; rank--) {
    const previous = relativeSquare(file + (rank - 1), color);
    pieces.set(relativeSquare(file + rank, color), pieces.get(previous));
    pieces.delete(previous);
  }
  pieces.set(relativeSquare(target, color), colored(letter, color));
}

/** Deploy both armies transactionally. Squares in each descriptor are relative
 * White-side starting squares; inserted pieces may advance pawn stacks. */
function deployDesignArmies(profile, white = {}, black = {}, initialPieces = pieceMap(START_FEN)) {
  if (!(initialPieces instanceof Map)) throw new Error('Deployment needs a starting piece map.');
  const pieces = new Map(initialPieces);
  if (Object.hasOwn(initialPieces, 'pocket')) pieces.pocket = initialPieces.pocket;
  else if (profile.roles.reserveTypes) pieces.pocket = '';
  const pawnTypes = new Set(profile.roles.pawnTypes.filter(type => !profile.roles.royalTypes.includes(type)));
  for (const [color, army] of [['w', white], ['b', black]]) {
    const choices = army.choices || [];
    const remove = army.remove || [];
    const reserve = army.reserve || [];
    if (!Array.isArray(choices) || !Array.isArray(remove) || new Set(choices.map(choice => choice.square)).size !== choices.length) throw new Error('Deployment needs distinct starting choices.');
    if (!Array.isArray(reserve)) throw new Error('Deployment needs a finite reserve array.');
    for (const { definition, letter, count } of reserve) {
      if (definition?.family !== 'king' || definition.placement !== 'reserve' || !profile.roles.reserveTypes?.includes(letter)
        || !Number.isInteger(count) || count < 1 || count > 9) throw new Error('Deployment needs registered nonroyal grants with finite quantities.');
      pieces.pocket = (pieces.pocket || '') + colored(letter, color).repeat(count);
    }
    for (const square of remove) {
      const target = relativeSquare(square, color);
      const piece = pieces.get(target);
      if (!relativeSlots.has(square) || choices.some(choice => choice.square === square) || (piece && !own(piece, color))) throw new Error(`The starting piece on ${target} cannot be removed.`);
      pieces.delete(target);
    }
    // Pawns are settled first, so an insertion never overwrites a pawn choice.
    const ordered = [...choices].sort((a, b) => Number(a.definition.family !== 'pawn') - Number(b.definition.family !== 'pawn') || a.square.localeCompare(b.square));
    const extras = [];
    for (const { square, definition, letter } of ordered) {
      sourceFor(pieces, square, definition, color);
      if (definition.placement === 'reserve') {
        if (definition.family !== 'king' || square !== 'e1' || !profile.roles.reserveTypes?.includes(letter)) throw new Error('A reserve grant must be selected on its own royal king.');
        pieces.pocket = (pieces.pocket || '') + colored(letter, color);
        continue;
      }
      if (['extra', 'insert', 'split'].includes(definition.placement)) {
        extras.push({ square, definition, letter });
        continue;
      }
      if (definition.placement === 'pair') {
        if (definition.family !== 'pawn' || !/^[a-h]2$/.test(square)) throw new Error('Paired designs must replace a starting pawn.');
        const second = relativeSquare(square[0] + '3', color);
        if (pieces.has(second)) throw new Error(`The paired-pawn square ${second} is occupied.`);
        pieces.set(second, colored(letter, color));
      } else if (definition.placement !== 'replace') throw new Error('This deployment rule is not supported.');
      pieces.set(relativeSquare(square, color), colored(letter, color));
    }
    for (const { square, definition, letter } of extras) {
      const target = definition.extraSquare?.[square];
      if (!/^[a-h][234]$/.test(target || '') || target[0] !== square[0]) throw new Error(`The extra piece cannot be placed for ${relativeSquare(square, color)}.`);
      if (definition.placement === 'insert' || definition.placement === 'split') {
        insertPawnStack(pieces, target, letter, color, pawnTypes);
        if (definition.placement === 'split') pieces.set(relativeSquare(square, color), colored(letter, color));
      }
      else {
        const destination = relativeSquare(target, color);
        if (pieces.has(destination)) throw new Error(`The extra-piece square ${destination} is occupied.`);
        pieces.set(destination, colored(letter, color));
      }
    }
  }
  return pieces;
}

/** Infer standard-army purchases from a starting board. Callers regenerate the
 * army before trusting this best-effort result as saved setup metadata. */
function recoverDesignChoices(initialPieces, profile) {
  const pieces = new Map(initialPieces);
  const result = Object.fromEntries(PIECE_SLOTS.map(slot => [slot.square, '']));
  if (profile.roles.reserveTypes) {
    for (const [color, square] of [['w', 'e1'], ['b', 'e8']]) {
      const pocket = [...(initialPieces.pocket || '')].filter(type => own(type, color));
      const definition = pocket.length === 1 ? profile.definitionsByLetter[pocket[0].toLowerCase()] : undefined;
      result[square] = definition?.family === 'king' && definition.placement === 'reserve' && pieces.get(square) === colored('k', color) ? definition.id : '';
    }
  }
  const definitions = profile.registry.allocations.map(allocation => ({ ...allocation, definition: profile.definitionsByLetter[allocation.letter] }));
  const pawnTypes = new Set(profile.roles.pawnTypes.filter(type => !profile.roles.royalTypes.includes(type)));
  // Undo insertion before inspecting the pawns' canonical second rank. A split
  // purchase must retain both of its units, while an insert keeps its base piece.
  for (const slot of PIECE_SLOTS.filter(slot => slot.family !== 'pawn')) {
    const square = relativeSquare(slot.square, slot.color);
    const inserted = definitions.find(({ definition, letter }) => {
      const target = definition.extraSquare?.[square];
      const sourceType = definition.placement === 'split' ? letter : STANDARD_TYPES[slot.family];
      return definition.family === slot.family && ['insert', 'split'].includes(definition.placement) && /^[a-h]2$/.test(target || '')
        && pieces.get(slot.square) === colored(sourceType, slot.color)
        && target[0] === square[0] && pieces.get(relativeSquare(target, slot.color)) === colored(letter, slot.color);
    });
    if (!inserted) continue;
    result[slot.square] = inserted.id;
    const file = square[0];
    pieces.delete(relativeSquare(file + '2', slot.color));
    for (let rank = 3; rank <= 4; rank++) {
      const source = relativeSquare(file + rank, slot.color);
      const piece = pieces.get(source);
      if (!own(piece, slot.color) || !pawnTypes.has(piece.toLowerCase())) break;
      pieces.set(relativeSquare(file + (rank - 1), slot.color), piece);
      pieces.delete(source);
    }
  }
  for (const slot of PIECE_SLOTS) {
    if (result[slot.square]) continue;
    const square = relativeSquare(slot.square, slot.color);
    const source = pieces.get(slot.square);
    const extra = definitions.find(({ definition, letter }) => {
      const target = definition.extraSquare?.[square];
      return definition.family === slot.family && definition.placement === 'extra' && target
        && source === colored(STANDARD_TYPES[slot.family], slot.color) && pieces.get(relativeSquare(target, slot.color)) === colored(letter, slot.color);
    });
    if (extra) result[slot.square] = extra.id;
    else if (own(source, slot.color)) {
      const definition = profile.definitionsByLetter[source.toLowerCase()];
      if (definition?.family !== slot.family) continue;
      if (definition.placement === 'replace') result[slot.square] = definition.id;
      else if (definition.placement === 'pair' && slot.family === 'pawn' && pieces.get(relativeSquare(square[0] + '3', slot.color)) === source) result[slot.square] = definition.id;
    }
  }
  return result;
}

module.exports = { deployDesignArmies, recoverDesignChoices };
