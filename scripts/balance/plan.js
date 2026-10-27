'use strict';

// Plans describe an experiment, not an estimate of the pieces' material values.
const { PIECE_SLOTS } = require('../../src/piece-catalog');
const { getDesign } = require('../../src/design-catalog');
const { normalizeEvaluation } = require('./evaluation');

const WHITE_SLOTS = new Set([
  ...PIECE_SLOTS.filter(slot => slot.color === 'w').map(slot => slot.square),
  'e1', // Independent royal upgrade, supplied by the balance rules profile.
]);
const SLOT_FAMILIES = Object.fromEntries(PIECE_SLOTS.filter(slot => slot.color === 'w').map(slot => [slot.square, slot.family]));
const MAX_GAMES = 100000;
const DEFAULT_ENGINE = Object.freeze({ nodes: 10000, threads: 1, hashMb: 32, maxPlies: 400 });
const defaulted = (value, fallback) => value === undefined ? fallback : value;

function object(value, path, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new Error(`${path} must be an object.`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`${path}.${key} is not supported.`);
  }
  return value;
}

function integer(value, path, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${path} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

function label(value, path, maximum = 160) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${path} must be nonempty text of at most ${maximum} characters.`);
  }
  return value.trim();
}

function identifier(value, path) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value)) {
    throw new Error(`${path} must use 1–64 letters, numbers, hyphens, or underscores.`);
  }
  return value;
}

function list(value, path, maximum) {
  if (!Array.isArray(value) || value.length === 0 || value.length > maximum) {
    throw new Error(`${path} must contain 1–${maximum} entries.`);
  }
  return value;
}

function uniqueId(entries, path) {
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.id)) throw new Error(`${path} has duplicate id ${entry.id}.`);
    seen.add(entry.id);
  }
}

function normalizeArmy(input, path, schemaVersion) {
  object(input, path, schemaVersion === 3 ? ['upgrades', 'remove', 'reserve'] : ['upgrades', 'remove']);
  const upgrades = defaulted(input.upgrades, {});
  object(upgrades, `${path}.upgrades`, [...WHITE_SLOTS]);
  const entries = Object.entries(upgrades).sort(([a], [b]) => a.localeCompare(b));
  let cost = 0;
  for (const [square, choice] of entries) {
    if (schemaVersion === 1) integer(choice, `${path}.upgrades.${square}`, 0, 3);
    else {
      if (square === 'e1') throw new Error(schemaVersion === 3
        ? `${path}.upgrades.e1: keep the ordinary royal king and declare nonroyal grants in reserve.`
        : `${path}.upgrades.e1: dynamic king designs are not supported; use schemaVersion 1 for legacy kings.`);
      const design = typeof choice === 'string' ? getDesign(choice) : undefined;
      if (!design) throw new Error(`${path}.upgrades.${square} must select a known stable design ID.`);
      if (design.family !== SLOT_FAMILIES[square]) throw new Error(`${path}.upgrades.${square} requires a ${SLOT_FAMILIES[square]} design.`);
      cost += design.level;
    }
  }
  let reserve;
  if (schemaVersion === 3) {
    reserve = defaulted(input.reserve, []);
    if (!Array.isArray(reserve) || reserve.length > 9) throw new Error(`${path}.reserve must contain at most 9 finite grant entries.`);
    const seen = new Set();
    reserve = reserve.map((entry, index) => {
      const location = `${path}.reserve[${index}]`;
      object(entry, location, ['id', 'count']);
      const design = typeof entry.id === 'string' ? getDesign(entry.id) : undefined;
      if (!design || design.family !== 'king' || design.placement !== 'reserve') throw new Error(`${location}.id must select a known nonroyal reserve grant.`);
      if (seen.has(entry.id)) throw new Error(`${path}.reserve must not repeat grant IDs; use count for finite quantities.`);
      seen.add(entry.id);
      const count = integer(entry.count, `${location}.count`, 1, 9);
      cost += design.level * count;
      return { id: entry.id, count };
    }).sort((a, b) => a.id.localeCompare(b.id));
  }
  const budget = schemaVersion === 3 ? 9 : 6;
  if (schemaVersion >= 2 && cost > budget) throw new Error(`${path} may spend at most ${budget} upgrade points.`);
  const remove = defaulted(input.remove, []);
  if (!Array.isArray(remove) || remove.some(square => !WHITE_SLOTS.has(square) || square === 'e1')) {
    throw new Error(`${path}.remove must list ordinary starting squares other than the king.`);
  }
  if (new Set(remove).size !== remove.length) throw new Error(`${path}.remove must not repeat squares.`);
  for (const square of remove) {
    if (upgrades[square]) throw new Error(`${path} cannot both upgrade and remove ${square}.`);
  }
  return { upgrades: Object.fromEntries(entries.filter(([, level]) => level !== 0)), remove: [...remove].sort(), ...(schemaVersion === 3 ? { reserve } : {}) };
}

function normalizeStrength(input = { skill: 20 }, path) {
  object(input, path, ['skill', 'elo']);
  if (Object.keys(input).length !== 1) throw new Error(`${path} must select exactly one of skill or elo.`);
  if (Object.hasOwn(input, 'skill')) return { skill: integer(input.skill, `${path}.skill`, 0, 20) };
  // The engine's advertised UCI range is checked separately at preflight.
  return { elo: integer(input.elo, `${path}.elo`, 1, 100000) };
}

function normalizeEngine(input = {}) {
  object(input, 'engine', ['nodes', 'movetimeMs', 'threads', 'hashMb', 'maxPlies']);
  if (Object.hasOwn(input, 'nodes') && Object.hasOwn(input, 'movetimeMs')) {
    throw new Error('engine must select nodes or movetimeMs, not both.');
  }
  const search = Object.hasOwn(input, 'movetimeMs')
    ? { movetimeMs: integer(input.movetimeMs, 'engine.movetimeMs', 1, 3600000) }
    : { nodes: integer(defaulted(input.nodes, DEFAULT_ENGINE.nodes), 'engine.nodes', 1, 100000000) };
  return {
    ...search,
    threads: integer(defaulted(input.threads, DEFAULT_ENGINE.threads), 'engine.threads', 1, 1),
    hashMb: integer(defaulted(input.hashMb, DEFAULT_ENGINE.hashMb), 'engine.hashMb', 1, 4096),
    maxPlies: integer(defaulted(input.maxPlies, DEFAULT_ENGINE.maxPlies), 'engine.maxPlies', 2, 2000),
  };
}

function normalizeConfig(input) {
  object(input, 'config', ['schemaVersion', 'name', 'seed', 'repetitions', 'engine', 'openings', 'comparisons', 'evaluation']);
  if (![1, 2, 3].includes(input.schemaVersion)) throw new Error('schemaVersion must be 1, 2 or 3.');
  if (input.evaluation !== undefined && input.schemaVersion === 1) throw new Error('evaluation requires schemaVersion 2 or 3 design IDs.');
  const openings = list(defaulted(input.openings, [{ id: 'start', moves: [] }]), 'openings', 100).map((opening, index) => {
    const path = `openings[${index}]`;
    object(opening, path, ['id', 'moves']);
    if (!Array.isArray(opening.moves) || opening.moves.length > 40) throw new Error(`${path}.moves must contain 0–40 UCI moves.`);
    const moves = opening.moves.map((move, moveIndex) => {
      const drop = input.schemaVersion === 3 && typeof move === 'string' && /^[A-Z]@[a-h][1-8]$/.test(move);
      if (typeof move !== 'string' || !drop && (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move) || move.slice(0, 2) === move.slice(2, 4))) {
        throw new Error(`${path}.moves[${moveIndex}] must be a UCI coordinate move.`);
      }
      return move;
    });
    return { id: identifier(opening.id, `${path}.id`), moves };
  });
  uniqueId(openings, 'openings');
  const prefixes = new Set();
  for (const opening of openings) {
    const prefix = opening.moves.join(' ');
    if (prefixes.has(prefix)) throw new Error('openings must not repeat the same move sequence under different ids.');
    prefixes.add(prefix);
  }
  const comparisons = list(input.comparisons, 'comparisons', 500).map((comparison, index) => {
    const path = `comparisons[${index}]`;
    object(comparison, path, ['id', 'label', 'armyA', 'armyB', 'strengthA', 'strengthB']);
    const id = identifier(comparison.id, `${path}.id`);
    return {
      id,
      label: comparison.label === undefined ? id : label(comparison.label, `${path}.label`),
      armyA: normalizeArmy(comparison.armyA, `${path}.armyA`, input.schemaVersion),
      armyB: normalizeArmy(comparison.armyB, `${path}.armyB`, input.schemaVersion),
      strengthA: normalizeStrength(comparison.strengthA, `${path}.strengthA`),
      strengthB: normalizeStrength(comparison.strengthB, `${path}.strengthB`),
    };
  });
  uniqueId(comparisons, 'comparisons');
  const config = {
    schemaVersion: input.schemaVersion,
    name: label(input.name, 'name'),
    seed: integer(defaulted(input.seed, 42), 'seed', 0, 0xffffffff),
    repetitions: integer(defaulted(input.repetitions, 1), 'repetitions', 1, MAX_GAMES),
    engine: normalizeEngine(input.engine),
    openings,
    comparisons,
  };
  if (input.evaluation !== undefined) config.evaluation = normalizeEvaluation(input.evaluation,
    comparisons.flatMap(comparison => [comparison.armyA, comparison.armyB].flatMap(army => [...Object.values(army.upgrades), ...(army.reserve || []).map(entry => entry.id)])));
  if (config.repetitions * openings.length * comparisons.length * 2 > MAX_GAMES) {
    throw new Error(`An experiment must schedule at most ${MAX_GAMES} games.`);
  }
  return config;
}

function randomSource(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 0x100000000;
  };
}

function makeSchedule(input) {
  const config = normalizeConfig(input);
  const pairs = [];
  for (const comparison of config.comparisons) {
    for (const opening of config.openings) {
      for (let repetition = 1; repetition <= config.repetitions; repetition++) {
        pairs.push({ comparison, opening, repetition });
      }
    }
  }
  const random = randomSource(config.seed);
  for (let index = pairs.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [pairs[index], pairs[other]] = [pairs[other], pairs[index]];
  }
  return pairs.flatMap(({ comparison, opening, repetition }) => {
    // Length prefixes make IDs unambiguous even when user IDs contain hyphens.
    const pairId = `c${comparison.id.length}_${comparison.id}_o${opening.id.length}_${opening.id}_r${repetition}`;
    const firstColor = random() < 0.5 ? 'w' : 'b';
    return [firstColor, firstColor === 'w' ? 'b' : 'w'].map(aColor => ({
      id: `${pairId}_${aColor}`,
      pairId,
      comparisonId: comparison.id,
      openingId: opening.id,
      repetition,
      aColor,
      openingMoves: [...opening.moves],
      comparison,
    }));
  });
}

module.exports = { normalizeConfig, makeSchedule };
