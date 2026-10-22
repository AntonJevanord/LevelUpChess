'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getDesign } = require('../../src/design-catalog');
const { PIECE_SLOTS } = require('../../src/piece-catalog');
const roster = require('../../experiments/balance/level3-roster.json');

const RESULTS = new Set(['1-0', '0-1', '1/2-1/2']);
const names = new Map(roster.candidates.map(candidate => [candidate.id, candidate.label]));
const families = new Map(PIECE_SLOTS.map(slot => [slot.square, slot.family]));
families.set('e1', 'king');
const capitalize = text => text[0].toUpperCase() + text.slice(1);

function armyName(army) {
  const upgrades = Object.entries(army.upgrades || {}).filter(([, choice]) => choice !== 0);
  const removed = army.remove || [];
  const label = (square, choice) => {
    if (typeof choice === 'number') return `Level ${choice} ${families.get(square) || 'piece'}`;
    const design = getDesign(choice);
    return names.get(choice) || (design ? `${capitalize(design.family)} level ${design.level} (${choice})` : choice);
  };
  if (upgrades.length === 1 && !removed.length) return label(...upgrades[0]);
  const pieces = upgrades.map(([square, choice]) => `${label(square, choice)} at ${square}`);
  return (pieces.join(' + ') || 'Standard army') + (removed.length ? ` without ${removed.join(', ')}` : '');
}

function journal(directory) {
  let text;
  try { text = fs.readFileSync(path.join(directory, 'games.jsonl'), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  return text.slice(0, text.lastIndexOf('\n') + 1).split('\n').filter(Boolean).map(JSON.parse);
}

/** Load once on resume. Worker journals can be ahead of the parent aggregate. */
function readProgressHistory(directory, manifest) {
  const records = journal(directory);
  for (const shard of manifest?.parallel?.shards || []) {
    // Only read the coordinator's fixed worker directories.
    if (!/^workers\/worker-(?:0[1-9]|1[0-6])$/.test(shard.directory)) continue;
    records.push(...journal(path.join(directory, shard.directory)));
  }
  return records;
}

/** Presentation only: update counters from existing results, without file writes. */
function createProgressFormatter(schedule, records = []) {
  const games = new Map(schedule.map(game => [game.id, game]));
  const matchups = new Map(), completed = new Map();
  for (const game of schedule) if (!matchups.has(game.comparisonId)) {
    matchups.set(game.comparisonId, { a: armyName(game.comparison.armyA), b: armyName(game.comparison.armyB), wins: 0, draws: 0, losses: 0 });
  }
  const count = (state, score, delta) => { state[score === 1 ? 'wins' : score === 0.5 ? 'draws' : 'losses'] += delta; };
  const complete = (game, result) => {
    const score = result === '1/2-1/2' ? 0.5 : (result === '1-0') === (game.aColor === 'w') ? 1 : 0;
    const state = matchups.get(game.comparisonId);
    if (completed.has(game.id)) count(state, completed.get(game.id), -1);
    completed.set(game.id, score);
    count(state, score, 1);
    return score;
  };
  for (const record of records) {
    const game = games.get(record.id);
    if (game && record.status === 'completed' && RESULTS.has(record.result)
      && record.comparisonId === game.comparisonId && record.aColor === game.aColor) complete(game, record.result);
  }
  return message => {
    const match = message.match(/^(\[worker \d+\] )?Finished (\S+): (1-0|0-1|1\/2-1\/2|\*) \(.*\)\.$/);
    if (!match) return message;
    const [, prefix = '', id, result] = match, game = games.get(id);
    if (!game) return message;
    const state = matchups.get(game.comparisonId);
    let outcome = 'Unscored.';
    if (RESULTS.has(result)) {
      const score = complete(game, result);
      const winner = score === 1 ? 'A' : 'B';
      const color = (score === 1) === (game.aColor === 'w') ? 'White' : 'Black';
      outcome = score === 0.5 ? 'Draw.' : `Winner: ${winner} ${score === 1 ? state.a : state.b} (${color}).`;
    }
    const total = state.wins + state.draws + state.losses;
    const aPoints = state.wins + state.draws / 2, bPoints = state.losses + state.draws / 2;
    const wins = `${state.wins} ${state.wins === 1 ? 'win' : 'wins'}`;
    const draws = `${state.draws} ${state.draws === 1 ? 'draw' : 'draws'}`;
    const losses = `${state.losses} ${state.losses === 1 ? 'loss' : 'losses'}`;
    return `${message} ${outcome}\n${prefix}Match score (${game.comparisonId}; all scored games): A ${state.a} ${aPoints} - ${bPoints} B ${state.b}; A: ${wins}, ${draws}, ${losses} (${total} ${total === 1 ? 'game' : 'games'}).`;
  };
}

module.exports = { createProgressFormatter, readProgressHistory };
