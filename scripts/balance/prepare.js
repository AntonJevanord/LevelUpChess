'use strict';

const { createHash } = require('node:crypto');
const { normalizeConfig, makeSchedule } = require('./plan');
const { allocateDesigns, createDesignRegistry } = require('./design-registry');
const { compileDesignProfile } = require('./design-profile');
const { getDesign } = require('../../src/design-catalog');
const defaultOpenings = require('../../experiments/balance/level3-round-robin.json').openings;

const SQUARES = { pawn: 'd2', knight: 'b1', bishop: 'c1', rook: 'a1', queen: 'd1' };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`${name} must be an object.`);
}

function integer(value, name, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer from ${min} to ${max}.`);
  return value;
}

function candidatesFromRoster(roster) {
  object(roster, 'Roster');
  if (!Array.isArray(roster.candidates) || roster.candidates.length < 2) throw new Error('Select at least two candidates in the roster.');
  const ids = new Set(), keys = new Set();
  const candidates = roster.candidates.map((input, index) => {
    object(input, `candidates[${index}]`);
    for (const field of Object.keys(input)) if (!['key', 'id', 'label', 'square'].includes(field)) throw new Error(`candidates[${index}].${field} is not supported.`);
    const design = getDesign(input.id);
    if (!design || !Object.hasOwn(SQUARES, design.family)) throw new Error(`Select a known nonroyal design ID for candidates[${index}].`);
    const key = input.key ?? input.id.replace(/[.@]/g, '-');
    const label = input.label ?? input.id;
    if (typeof key !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,29}$/.test(key)) throw new Error('Candidate keys need 1–30 letters, numbers, hyphens or underscores.');
    if (typeof label !== 'string' || !label.trim() || label.length > 70 || /[\u0000-\u001f\u007f]/.test(label)) throw new Error('Candidate labels need 1–70 printable characters.');
    if (ids.has(input.id) || keys.has(key)) throw new Error('Candidate design IDs and keys must be distinct.');
    ids.add(input.id); keys.add(key);
    return { key, id: input.id, label: label.trim(), square: input.square ?? SQUARES[design.family], cost: design.level };
  });
  allocateDesigns(candidates.map(candidate => candidate.id));
  if (typeof roster.referenceId !== 'string' || !ids.has(roster.referenceId)) throw new Error('referenceId must identify one selected candidate.');
  return candidates;
}

/** Generate one reviewable experiment; preparation never starts games. */
function buildCampaign(roster, options = {}) {
  object(options, 'Preparation options');
  for (const field of Object.keys(options)) if (!['mode', 'maxGames', 'openingPairs', 'seed', 'nodes', 'openings', 'allowUnequalCosts'].includes(field)) throw new Error(`Preparation option ${field} is not supported.`);
  const candidates = candidatesFromRoster(roster);
  const mode = options.mode ?? 'round-robin';
  if (!['round-robin', 'reference'].includes(mode)) throw new Error('mode must be round-robin or reference.');
  const maxGames = integer(options.maxGames ?? 2000, 'maxGames', 2, 100000);
  const seed = integer(options.seed ?? 42, 'seed', 0, 0xffffffff);
  const nodes = integer(options.nodes ?? 100000, 'nodes', 1, 100000000);
  if (options.allowUnequalCosts !== undefined && typeof options.allowUnequalCosts !== 'boolean') throw new Error('allowUnequalCosts must be true or false.');
  const unequalCosts = new Set(candidates.map(candidate => candidate.cost)).size > 1;
  if (unequalCosts && !options.allowUnequalCosts) throw new Error('Candidates have different upgrade costs. Select equal-cost purchases, or explicitly use --allow-unequal-costs for a handicap experiment.');
  const reference = candidates.find(candidate => candidate.id === roster.referenceId);
  const army = candidate => ({ upgrades: { [candidate.square]: candidate.id } });
  const comparisons = [];
  const add = (a, b) => comparisons.push({ id: `${a.key}-v-${b.key}`, label: `${a.label} versus ${b.label}`, armyA: army(a), armyB: army(b), strengthA: { skill: 20 }, strengthB: { skill: 20 } });
  if (mode === 'round-robin') {
    for (let a = 0; a < candidates.length; a++) for (let b = a + 1; b < candidates.length; b++) add(candidates[a], candidates[b]);
  } else for (const candidate of candidates) if (candidate.id !== reference.id) add(candidate, reference);
  const matchupCount = comparisons.length;
  const controls = [{ id: 'standard-control', label: 'Ordinary armies', kind: 'standard' }, { id: `${reference.key}-control`, label: `${reference.label} armies`, kind: 'reference' }];
  for (const control of controls) comparisons.push({ id: control.id, label: control.label, armyA: control.kind === 'standard' ? { upgrades: {} } : army(reference), armyB: control.kind === 'standard' ? { upgrades: {} } : army(reference), strengthA: { skill: 20 }, strengthB: { skill: 20 } });
  const bank = options.openings ?? defaultOpenings;
  if (!Array.isArray(bank) || !bank.length) throw new Error('Supply at least one declared opening prefix.');
  const openingPairs = integer(options.openingPairs ?? Math.min(10, bank.length), 'openingPairs', 1, 100);
  if (openingPairs > bank.length) throw new Error(`Requested ${openingPairs} opening pairs, but the declared cohort contains only ${bank.length} prefixes.`);
  const gamesPerOpening = comparisons.length * 2;
  const scheduledGames = gamesPerOpening * openingPairs;
  if (scheduledGames > maxGames) {
    const affordable = Math.floor(maxGames / gamesPerOpening);
    throw new Error(`This plan needs ${scheduledGames} games, exceeding the ${maxGames}-game cap. At this roster size, at most ${affordable} opening pairs fit; choose --opening-pairs explicitly, use --mode reference, or reduce the roster.`);
  }
  const name = typeof roster.name === 'string' && roster.name.trim() ? roster.name.trim() : 'Prepared design comparison';
  const config = normalizeConfig({ schemaVersion: 2, name: `${name}: ${mode === 'round-robin' ? 'round robin' : 'reference comparisons'}`, seed, repetitions: 1,
    engine: { nodes, threads: 1, hashMb: 32, maxPlies: 400 }, openings: bank.slice(0, openingPairs), comparisons });
  const registry = createDesignRegistry(config), profile = compileDesignProfile(registry);
  const schedule = makeSchedule(config);
  return {
    config,
    preparation: {
      schemaVersion: 1, format: 'levelup-balance-preparation', mode,
      name: config.name, maxGames, scheduledGames: schedule.length, colorPairs: schedule.length / 2,
      matchupComparisons: matchupCount, controlComparisons: controls.length, comparisons: comparisons.length,
      openingPairs, availablePrefixes: bank.length, unselectedPrefixes: bank.length - openingPairs,
      candidateCount: candidates.length, unequalCosts, engine: config.engine, seed,
      referenceId: reference.id, candidates, controls,
      configSha256: hash(config), registryHash: registry.hash, profileHash: profile.hash,
      designRegistry: registry,
      designProfile: { variant: profile.variant, config: profile.config, hash: profile.hash, registryHash: profile.registryHash },
      interpretation: 'This freezes the selected candidates, declared openings, search settings and game budget for review. It neither plays games nor chooses balance decisions. Pairings compare purchase packages; material and Elo are not assigned by preparation.',
    },
  };
}

module.exports = { buildCampaign };
