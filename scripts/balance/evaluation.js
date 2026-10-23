'use strict';

const { getDesign } = require('../../src/design-catalog');

// These are the matching engine's ordinary-rook values, not centipawns.
const ROOK_ANCHOR = Object.freeze({ points: 5, mg: 1276, eg: 1380 });
const MAX_VALUE = 10000;

function object(value, name, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`${name} must be a plain object.`);
  if (keys) for (const key of Object.keys(value)) if (!keys.includes(key)) throw new Error(`${name}.${key} is not supported.`);
}

function value(input, name) {
  if (!Number.isSafeInteger(input) || input < 1 || input > MAX_VALUE) throw new Error(`${name} must be an integer from 1 to ${MAX_VALUE}.`);
  return input;
}

/** Values are explicit internal engine units, keyed by immutable design ID. */
function normalizeEvaluation(input, selectedIds) {
  if (input === undefined) return undefined;
  object(input, 'evaluation', ['pieceValues']);
  object(input.pieceValues, 'evaluation.pieceValues');
  const ids = Object.keys(input.pieceValues).sort();
  if (!ids.length || ids.length > 20) throw new Error('evaluation.pieceValues must contain 1–20 selected design IDs.');
  const selected = selectedIds === undefined ? null : new Set(selectedIds);
  const entries = ids.map(id => {
    if (!getDesign(id) || selected && !selected.has(id)) throw new Error(`evaluation.pieceValues.${id} must identify a known design selected in this configuration.`);
    const pair = input.pieceValues[id];
    object(pair, `evaluation.pieceValues.${id}`, ['mg', 'eg']);
    return [id, Object.freeze({ mg: value(pair.mg, `evaluation.pieceValues.${id}.mg`), eg: value(pair.eg, `evaluation.pieceValues.${id}.eg`) })];
  });
  return Object.freeze({ pieceValues: Object.freeze(Object.fromEntries(entries)) });
}

/** Interpret a requested total using the user's ordinary-rook-equals-five scale. */
function rookPoints(points) {
  if (!Number.isFinite(points) || points <= 0) throw new Error('Rook points must be a finite positive number.');
  return Object.freeze({
    mg: value(Math.round(ROOK_ANCHOR.mg * points / ROOK_ANCHOR.points), 'Rook middlegame value'),
    eg: value(Math.round(ROOK_ANCHOR.eg * points / ROOK_ANCHOR.points), 'Rook endgame value'),
  });
}

/** Reject partial/ignored overrides before a native engine can search. */
async function requireManualValues(engine, profile, { signal } = {}) {
  const policy = profile?.evaluation;
  if (policy === undefined) return undefined;
  const normalized = normalizeEvaluation(policy, profile.registry.definitions.map(definition => definition.id));
  let report;
  try {
    if (typeof engine.pieceValues !== 'function') throw new Error('The engine does not support the levelupvalues diagnostic.');
    report = await engine.pieceValues({ signal });
    if (report?.version !== 1 || !report.pieces || typeof report.pieces !== 'object') throw new Error('Invalid levelupvalues diagnostic response.');
    const allocations = new Map(profile.registry.allocations.map(allocation => [allocation.id, allocation.letter]));
    for (const [id, expected] of Object.entries(normalized.pieceValues)) {
      const letter = allocations.get(id);
      for (const piece of [letter.toUpperCase(), letter]) {
        const actual = report.pieces[piece];
        for (const field of ['rawMg', 'captureMg', 'evalMg', 'rawEg', 'captureEg', 'evalEg']) {
          const wanted = field.endsWith('Mg') ? expected.mg : expected.eg;
          if (actual?.[field] !== wanted) throw new Error(`${id} (${piece}) ${field} is ${actual?.[field] ?? 'missing'}, expected ${wanted}.`);
        }
      }
    }
    return report;
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error(`Manual piece-value preflight failed: ${error.message} Use the bundled version-16 engine with consistent value overrides.`, { cause: error });
  }
}

module.exports = { ROOK_ANCHOR, normalizeEvaluation, rookPoints, requireManualValues };
