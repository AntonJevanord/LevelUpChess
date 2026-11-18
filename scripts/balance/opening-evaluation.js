'use strict';

// The first normal engine search supplies this diagnostic. It never triggers
// another search and must never replace a chess outcome or adjudicate a game.
const { isDeepStrictEqual } = require('node:util');

const SOURCE = 'first-post-opening-search';
const clone = value => JSON.parse(JSON.stringify(value));
const numericInfo = ['depth', 'seldepth', 'nodes', 'time', 'nps'];
const validInteger = value => Number.isSafeInteger(value) && value >= 0;
const validScore = value => value && ['cp', 'mate'].includes(value.type) && Number.isSafeInteger(value.value)
  && (value.bound === undefined || ['lowerbound', 'upperbound'].includes(value.bound));

function base(context) {
  const result = { schemaVersion: 1, source: SOURCE, available: false, perspective: 'white',
    fen: context.fen, openingPlies: context.openingPlies, capturedOnAttempt: null,
    color: context.color, engineSha256: context.engineSha256,
    strength: clone(context.strength), limits: clone(context.limits) };
  if (context.engineName) result.engineName = context.engineName;
  return result;
}

function unavailableOpeningEvaluation(context, reason) {
  return { ...base(context), reason };
}

function makeOpeningEvaluation(context, search) {
  const info = search?.scoreInfo || search?.info;
  const value = { ...base(context), capturedOnAttempt: context.attempt };
  if (!validScore(info?.score)) return { ...value, reason: info?.score ? 'invalid-engine-score' : 'engine-reported-no-score' };
  const score = { type: info.score.type, value: info.score.value * (context.color === 'b' ? -1 : 1) };
  if (info.score.bound) score.bound = context.color === 'b'
    ? info.score.bound === 'lowerbound' ? 'upperbound' : 'lowerbound' : info.score.bound;
  const details = {};
  for (const key of numericInfo) if (validInteger(info[key])) details[key] = info[key];
  if (Array.isArray(info.pv) && info.pv.every(move => typeof move === 'string' && move && !/[\r\n\0]/.test(move))) details.pv = [...info.pv];
  if (typeof info.raw === 'string' && !/[\r\n\0]/.test(info.raw)) details.raw = info.raw;
  return { ...value, available: true, score, info: details };
}

/** A stored diagnostic can survive retries only with its original position,
 * engine, strength and search limits. A missing historical value is not filled
 * by a later move's search. Return a detached copy for the next record. */
function validateOpeningEvaluation(value, context) {
  const fail = field => { throw new Error(`Saved opening evaluation does not match its ${field}.`); };
  if (!value || value.schemaVersion !== 1 || value.source !== SOURCE || value.perspective !== 'white'
    || typeof value.available !== 'boolean') fail('schema');
  for (const field of ['fen', 'openingPlies', 'color', 'engineSha256', 'strength', 'limits']) {
    if (!isDeepStrictEqual(value[field], context[field])) fail(field);
  }
  if (!['w', 'b'].includes(value.color) || value.fen.split(' ')[1] !== value.color
    || !validInteger(value.openingPlies) || !/^[a-f0-9]{64}$/.test(value.engineSha256)) fail('position metadata');
  if (value.capturedOnAttempt !== null && (!Number.isSafeInteger(value.capturedOnAttempt)
    || value.capturedOnAttempt < 1 || value.capturedOnAttempt > context.attempt)) fail('capture attempt');
  if (value.engineName !== undefined && (typeof value.engineName !== 'string' || /[\r\n\0]/.test(value.engineName))) fail('engine name');
  if (value.available) {
    if (value.capturedOnAttempt === null || !validScore(value.score) || !value.info || typeof value.info !== 'object' || Array.isArray(value.info)) fail('score');
    for (const field of numericInfo) if (value.info[field] !== undefined && !validInteger(value.info[field])) fail(`score ${field}`);
    if (value.info.pv !== undefined && (!Array.isArray(value.info.pv)
      || value.info.pv.some(move => typeof move !== 'string' || !move || /[\r\n\0]/.test(move)))) fail('principal variation');
    if (value.info.raw !== undefined && (typeof value.info.raw !== 'string' || /[\r\n\0]/.test(value.info.raw))) fail('raw score information');
  } else if (typeof value.reason !== 'string' || !value.reason || value.score !== undefined) fail('unavailable reason');
  return clone(value);
}

module.exports = { SOURCE, makeOpeningEvaluation, unavailableOpeningEvaluation, validateOpeningEvaluation };
