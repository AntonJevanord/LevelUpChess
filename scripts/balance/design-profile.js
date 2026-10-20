'use strict';

const { createHash } = require('node:crypto');
const { restoreDesignRegistry } = require('./design-registry');
const { capabilityProbes: legacyCapabilityProbes } = require('../engine-capabilities');

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const COMPILER_VERSION = 1;
const sha256 = value => createHash('sha256').update(value).digest('hex');

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function position(pieces, turn = 'w', castling = '-') {
  const placement = Array.from({ length: 8 }, (_, row) => {
    let rank = '', empty = 0;
    for (const file of 'abcdefgh') {
      const piece = pieces[file + (8 - row)];
      if (!piece) { empty++; continue; }
      if (empty) rank += empty;
      empty = 0;
      rank += piece;
    }
    return rank + (empty || '');
  }).join('/');
  return `${placement} ${turn} ${castling} - 0 1`;
}

function opposite(fen) {
  const fields = fen.split(' ');
  const swapCase = value => value.replace(/[a-z]/gi, character => character === character.toUpperCase() ? character.toLowerCase() : character.toUpperCase());
  fields[0] = swapCase(fields[0].split('/').reverse().join('/'));
  fields[1] = fields[1] === 'w' ? 'b' : 'w';
  const rights = swapCase(fields[2]);
  fields[2] = [...'KQkq'].filter(character => rights.includes(character)).join('') || '-';
  if (fields[3] !== '-') fields[3] = fields[3].match(/[a-h][1-8]/g).map(square => square[0] + (9 - Number(square[1]))).sort().join('');
  return fields.join(' ');
}

function remap(fen, from, to) {
  const fields = fen.split(' ');
  fields[0] = fields[0].replace(new RegExp(from, 'gi'), character => character === character.toUpperCase() ? to.toUpperCase() : to);
  return fields.join(' ');
}

function definitionProbes(definition, letter) {
  const type = letter.toUpperCase();
  const frames = [
    { name: 'open movement and range', fen: position({ a1: 'K', h7: 'k', d4: type }) },
    { name: 'blocked movement and capture jumps', fen: position({ a1: 'K', h7: 'k', d4: type, c4: 'P', e4: 'P', d3: 'P', d5: 'P', b4: 'p', f4: 'p', d2: 'p', d6: 'p', b6: 'p', f6: 'p' }) },
  ];
  if (definition.movement.includes('i')) frames.push({
    name: 'initial movement across home-rank blockers',
    fen: definition.family === 'pawn'
      ? position({ h1: 'K', h7: 'k', d2: type, d3: 'P', c3: 'p', e3: 'p' })
      : position({ h1: 'K', h7: 'k', d1: type, d2: 'P', c1: 'P', e1: 'P', e3: 'p' }),
  });
  if (definition.roles.pawn) frames.push({ name: 'mandatory standard promotion', fen: position({ a1: 'K', h6: 'k', b7: type }) });
  if (definition.roles.castlingRook) frames.push({ name: 'both castling sides', fen: position({ e8: 'k', a1: type, e1: 'K', h1: type }, 'w', 'KQ') });
  for (const legacy of legacyCapabilityProbes(definition.legacyType, 'levelup-v5')) {
    frames.push({ name: legacy.name, fen: remap(legacy.fen, definition.legacyType, letter) });
  }
  return frames.flatMap(frame => [
    { name: `${definition.id}: White ${frame.name}`, fen: frame.fen },
    { name: `${definition.id}: Black ${frame.name}`, fen: opposite(frame.fen) },
  ]);
}

/** Compile a trusted, archived run-wide registry without mutating older rules. */
function compileDesignProfile(input) {
  const registry = restoreDesignRegistry(input);
  const variant = `levelup-design-${sha256(JSON.stringify({ compiler: COMPILER_VERSION, registry })).slice(0, 20)}`;
  const byId = Object.fromEntries(registry.definitions.map(definition => [definition.id, definition]));
  const definitionsByLetter = Object.fromEntries(registry.allocations.map(({ id, letter }) => [letter, byId[id]]));
  const lettersFor = role => registry.allocations.filter(({ id }) => byId[id].roles[role]).map(({ letter }) => letter).sort();
  const roles = {
    pawnTypes: ['p', ...lettersFor('pawn')],
    enPassantTypes: ['p', ...lettersFor('enPassant')],
    castlingRooks: ['r', ...lettersFor('castlingRook')],
    royalTypes: ['k'],
    initialPawnLeaps: { p: 2 },
    initialLandingLeaps: {},
  };
  for (const { id, letter } of registry.allocations) {
    const definition = byId[id];
    if (definition.roles.pawn) {
      if (definition.movement.includes('ifmH')) roles.initialPawnLeaps[letter] = 3;
      else if (definition.movement.includes('ifmnD')) roles.initialPawnLeaps[letter] = 2;
    }
    const leaps = [['imN', 12], ['imC', 13], ['imZ', 23]].filter(([movement]) => definition.movement.includes(movement)).map(([, leap]) => leap);
    if (leaps.length) roles.initialLandingLeaps[letter] = leaps;
  }
  const config = [
    '# Dynamic experiment profile. Meanings belong to the archived registry.',
    `[${variant}:chess]`,
    ...registry.allocations.slice().sort((a, b) => a.slot - b.slot).map(({ id, letter, slot }) => `customPiece${slot} = ${letter}:${byId[id].movement}`),
    'pieceToCharTable = -',
    `castlingRookPiece = ${roles.castlingRooks.join('')}`,
    'doubleStepRegionWhite = *1 *2',
    'doubleStepRegionBlack = *7 *8',
    `pawnTypes = ${roles.pawnTypes.join('')}`,
    `enPassantTypes = ${roles.enPassantTypes.join('')}`,
    'promotionPieceTypes = nbrq',
    `startFen = ${START_FEN}`,
    '',
  ].join('\n');
  const probes = registry.allocations.flatMap(({ id, letter }) => definitionProbes(byId[id], letter));
  for (const turn of ['w', 'b']) probes.push({ name: `ordinary ${turn === 'w' ? 'White' : 'Black'} king castling`, fen: `r3k2r/8/8/8/8/8/8/R3K2R ${turn} KQkq - 0 1` });
  const capabilityProbes = [...new Map(probes.map(probe => [probe.fen, probe])).values()];
  return freeze({
    schemaVersion: 1,
    variant,
    config,
    registry,
    registryHash: registry.hash,
    hash: sha256(JSON.stringify({ config, registry })),
    roles,
    definitionsByLetter,
    capabilityProbes,
  });
}

module.exports = { compileDesignProfile };
