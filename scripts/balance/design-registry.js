'use strict';

const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { DESIGNS, STANDARD_TYPES, getDesign } = require('../../src/design-catalog');

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
const CUSTOM_SLOTS = 25;
const asciiOrder = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function object(value, name, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`${name} must be an object.`);
  if (allowed) for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${name}.${key} is not supported.`);
}

function knownIds(ids) {
  if (!Array.isArray(ids)) throw new Error('Design IDs must be an array.');
  for (const id of ids) if (!getDesign(id)) throw new Error(`Unknown design ID: ${String(id)}.`);
  return [...new Set(ids)].sort(asciiOrder);
}

/** Resolve trusted catalog IDs only. Extra reserved letters can model helpers. */
function allocateDesigns(ids, options = {}) {
  object(options, 'Allocation options', ['reservedLetters']);
  const selected = knownIds(ids);
  const requested = options.reservedLetters === undefined ? [] : options.reservedLetters;
  if (typeof requested !== 'string' && !Array.isArray(requested)) throw new Error('Reserved letters must be a string or array of ASCII letters.');
  const reserved = new Set(Object.values(STANDARD_TYPES));
  for (const letter of requested) {
    if (typeof letter !== 'string' || !/^[a-z]$/i.test(letter)) throw new Error('Reserved letters must be ASCII letters.');
    reserved.add(letter.toLowerCase());
  }
  const freeLetters = [...ALPHABET].filter(letter => !reserved.has(letter));
  if (selected.length > freeLetters.length) throw new Error(`The selected designs need ${selected.length} custom letters; only ${freeLetters.length} are available.`);
  if (selected.length > CUSTOM_SLOTS) throw new Error(`The engine supports at most ${CUSTOM_SLOTS} custom slots.`);
  const usedLetters = new Set(reserved);
  const usedSlots = new Set();
  const allocations = selected.map(id => ({ id }));
  // Reserve all available legacy identities before assigning any fallback, so
  // a new revision cannot displace an unrelated unchanged design's type.
  for (const allocation of allocations) {
    const design = DESIGNS[allocation.id];
    if (!usedLetters.has(design.legacyType)) {
      allocation.letter = design.legacyType;
      usedLetters.add(allocation.letter);
    }
    if (!usedSlots.has(design.legacySlot)) {
      allocation.slot = design.legacySlot;
      usedSlots.add(allocation.slot);
    }
  }
  for (const allocation of allocations) {
    if (allocation.letter === undefined) {
      allocation.letter = [...ALPHABET].find(letter => !usedLetters.has(letter));
      usedLetters.add(allocation.letter);
    }
    if (allocation.slot === undefined) {
      for (let slot = 1; slot <= CUSTOM_SLOTS; slot++) if (!usedSlots.has(slot)) {
        allocation.slot = slot;
        usedSlots.add(slot);
        break;
      }
    }
  }
  return freeze(allocations.map(({ id, letter, slot }) => ({ id, letter, slot })));
}

function snapshot(ids) {
  const selected = knownIds(ids);
  const payload = {
    schemaVersion: 1,
    definitions: selected.map(id => DESIGNS[id]),
    allocations: allocateDesigns(selected),
  };
  const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return freeze({ ...payload, hash });
}

function createDesignRegistry(config) {
  object(config, 'Experiment');
  if (![2, 3].includes(config.schemaVersion)) throw new Error('Design registries require experiment schemaVersion 2 or 3.');
  if (!Array.isArray(config.comparisons) || !config.comparisons.length) throw new Error('Design registries require comparisons.');
  const ids = [];
  for (const [index, comparison] of config.comparisons.entries()) {
    object(comparison, `comparisons[${index}]`);
    for (const key of ['armyA', 'armyB']) {
      const army = comparison[key];
      object(army, `comparisons[${index}].${key}`);
      const upgrades = army.upgrades === undefined ? {} : army.upgrades;
      object(upgrades, `comparisons[${index}].${key}.upgrades`);
      ids.push(...Object.values(upgrades));
      if (config.schemaVersion === 3) {
        const reserve = army.reserve === undefined ? [] : army.reserve;
        if (!Array.isArray(reserve)) throw new Error('Army reserve must be an array of finite grants.');
        for (const entry of reserve) {
          object(entry, 'Reserve grant', ['id', 'count']);
          const design = getDesign(entry.id);
          if (!design || design.family !== 'king' || design.placement !== 'reserve' || !Number.isInteger(entry.count) || entry.count < 1 || entry.count > 9) throw new Error('Reserve grants require known nonroyal designs and finite counts from 1 to 9.');
          ids.push(entry.id);
        }
      }
    }
  }
  return snapshot(ids);
}

/** MVP archives resolve against the immutable bundled catalog, not user code. */
function restoreDesignRegistry(input) {
  object(input, 'Design registry', ['schemaVersion', 'definitions', 'allocations', 'hash']);
  if (input.schemaVersion !== 1) throw new Error('Unsupported design registry schemaVersion.');
  if (!Array.isArray(input.definitions) || !Array.isArray(input.allocations)) throw new Error('Design registry definitions and allocations must be arrays.');
  if (input.definitions.length > CUSTOM_SLOTS || input.allocations.length > ALPHABET.length - Object.keys(STANDARD_TYPES).length) throw new Error('Design registry exceeds the available custom letters or slots.');
  const ids = [];
  for (const definition of input.definitions) {
    object(definition, 'Archived definition');
    const canonical = getDesign(definition.id);
    if (!canonical || !isDeepStrictEqual(definition, canonical)) throw new Error(`Archived definition does not match the bundled catalog: ${String(definition.id)}.`);
    ids.push(definition.id);
  }
  if (new Set(ids).size !== ids.length) throw new Error('Design registry repeats a definition ID.');
  if (input.allocations.length !== ids.length) throw new Error('Design registry requires exactly one allocation per definition.');
  const idSet = new Set(ids), allocationIds = new Set(), letters = new Set(), slots = new Set();
  const reserved = new Set(Object.values(STANDARD_TYPES));
  for (const allocation of input.allocations) {
    object(allocation, 'Archived allocation', ['id', 'letter', 'slot']);
    if (!idSet.has(allocation.id) || allocationIds.has(allocation.id)) throw new Error('Design registry allocation IDs must match its definitions once each.');
    if (typeof allocation.letter !== 'string' || !/^[a-z]$/.test(allocation.letter) || reserved.has(allocation.letter) || letters.has(allocation.letter)) throw new Error('Design registry has an invalid, reserved, or duplicate letter.');
    if (!Number.isInteger(allocation.slot) || allocation.slot < 1 || allocation.slot > CUSTOM_SLOTS || slots.has(allocation.slot)) throw new Error('Design registry has an invalid or duplicate custom slot.');
    allocationIds.add(allocation.id);
    letters.add(allocation.letter);
    slots.add(allocation.slot);
  }
  const canonical = snapshot(ids);
  const byId = [...input.allocations].sort((a, b) => asciiOrder(a.id, b.id));
  if (!isDeepStrictEqual(byId, canonical.allocations)) throw new Error('Design registry allocations are not the deterministic allocation for these definitions.');
  if (typeof input.hash !== 'string' || input.hash !== canonical.hash) throw new Error('Design registry hash does not match its contents.');
  return canonical;
}

module.exports = { createDesignRegistry, restoreDesignRegistry, allocateDesigns };
