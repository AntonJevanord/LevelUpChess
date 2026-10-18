#!/usr/bin/env node
'use strict';

// This opt-in prototype check does not register rules in the playable app.
// Each tier needs its own process: Fairy Stockfish shares movement tables.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { readFileSync, writeFileSync, mkdtempSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PROFILES = ['king-blue', 'king-orange', 'king-purple'];
const root = path.resolve(__dirname, '../..');
const config = readFileSync(path.join(__dirname, 'variants.ini'), 'utf8');
const profile = process.argv[2];

if (!profile) {
  for (const name of PROFILES) {
    const child = spawnSync(process.execPath, [__filename, name], {
      cwd: root,
      env: process.env,
      encoding: 'utf8',
      timeout: process.env.FAIRY_STOCKFISH_PATH ? 180000 : 30000,
      maxBuffer: 1024 * 1024,
    });
    if (child.stdout) process.stdout.write(child.stdout);
    if (child.stderr) process.stderr.write(child.stderr);
    assert.ifError(child.error);
    assert.equal(child.status, 0, `${name} verification failed`);
  }
} else {
  assert.ok(PROFILES.includes(profile), `Unknown prototype: ${profile}`);
  verify(profile).catch(error => { console.error(error); process.exitCode = 1; });
}

function singleConfig(name) {
  const sections = config.match(/^\[[^\n]+\][\s\S]*?(?=^\[|$(?![\s\S]))/gm) || [];
  const section = sections.find(value => value.startsWith(`[${name}:chess]`));
  assert.ok(section, `Missing configuration for ${name}`);
  return section;
}

function fen(pieces, turn = 'w', castling = '-') {
  const placement = Array.from({ length: 8 }, (_, row) => {
    let rank = '', empty = 0;
    for (const file of 'abcdefgh') {
      const piece = pieces[file + (8 - row)];
      if (piece) {
        if (empty) rank += empty;
        empty = 0;
        rank += piece;
      } else empty++;
    }
    return rank + (empty || '');
  }).join('/');
  return `${placement} ${turn} ${castling} - 0 1`;
}

const swapCase = value => value.replace(/[a-z]/gi, character => character === character.toUpperCase() ? character.toLowerCase() : character.toUpperCase());
const mirrorSquare = square => square[0] + (9 - Number(square[1]));
const mirrorMove = move => mirrorSquare(move.slice(0, 2)) + mirrorSquare(move.slice(2, 4)) + move.slice(4);
function opposite(position) {
  const fields = position.split(' ');
  fields[0] = swapCase(fields[0].split('/').reverse().join('/'));
  fields[1] = fields[1] === 'w' ? 'b' : 'w';
  const rights = swapCase(fields[2]);
  fields[2] = [...'KQkq'].filter(character => rights.includes(character)).join('') || '-';
  if (fields[3] !== '-') fields[3] = mirrorSquare(fields[3]);
  return fields.join(' ');
}

function fixtures(tier) {
  const targets = ['b2', 'b4', 'b6', 'd2', 'd6', 'f2', 'f4', 'f6'];
  const captureTargets = tier === 0 ? ['b4', 'f4'] : tier === 1 ? ['b4', 'f4', 'd2', 'd6'] : targets;
  const captures = captureTargets.map(square => 'd4' + square);
  const normal = ['c3', 'd3', 'e3', 'c4', 'e4', 'c5', 'd5', 'e5'].map(square => 'd4' + square);
  const enemyTargets = Object.fromEntries(targets.map(square => [square, 'p']));
  const friendTargets = Object.fromEntries(targets.map(square => [square, 'P']));
  const blockers = Object.fromEntries(normal.map(move => [move.slice(2), 'P']));
  return [
    { name: 'ordinary quiet movement, no empty-square bonus jumps', fen: fen({ a8: 'k', d4: 'K' }), kingMoves: normal, check: false },
    { name: 'tier-specific enemy capture targets', fen: fen({ a8: 'k', d4: 'K', ...enemyTargets }), kingMoves: [...captures, 'd4c4', 'd4e4', 'd4d3', 'd4d5'], check: false },
    { name: 'friendly pieces cannot be captured', fen: fen({ a8: 'k', d4: 'K', ...friendTargets }), kingMoves: normal, check: false },
    { name: 'bonus captures jump across friendly blockers', fen: fen({ a8: 'k', d4: 'K', ...enemyTargets, ...blockers }), kingMoves: captures, check: false },
    { name: 'bonus captures jump across an enemy blocker', fen: fen({ a8: 'k', d4: 'K', e4: 'p', f4: 'p' }), required: ['d4f4'], check: false },
    { name: 'unsafe sideways capture landing', fen: fen({ a8: 'k', d4: 'K', f4: 'p', f8: 'r' }), forbidden: ['d4f4'], required: ['d4e4'], check: false },
    { name: 'unsafe vertical capture landing', fen: fen({ a8: 'k', d4: 'K', d6: 'p', d8: 'r' }), forbidden: ['d4d6'], required: ['d4d5'], check: false },
    { name: 'unsafe diagonal capture landing', fen: fen({ a8: 'k', d4: 'K', f6: 'p', f8: 'r' }), forbidden: ['d4f6'], required: ['d4e4'], check: false },
    { name: 'sideways royal spacing', fen: fen({ g4: 'k', d4: 'K' }), forbidden: ['d4e4'], required: ['d4d5'], check: false },
    { name: 'vertical royal spacing', fen: fen({ d7: 'k', d4: 'K' }), required: tier === 0 ? ['d4d5'] : [], forbidden: tier > 0 ? ['d4d5'] : [], check: false },
    { name: 'diagonal royal spacing', fen: fen({ g7: 'k', d4: 'K' }), required: tier < 2 ? ['d4e5'] : [], forbidden: tier === 2 ? ['d4e5'] : [], check: false },
    { name: 'both ordinary castles remain available', fen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', required: ['e1g1', 'e1c1'], check: false },
    { name: 'castling cannot cross check', fen: fen({ b8: 'k', f8: 'r', a1: 'R', e1: 'K', h1: 'R' }, 'w', 'KQ'), required: ['e1c1'], forbidden: ['e1g1'], check: false },
    { name: 'castling cannot land in check', fen: fen({ b8: 'k', g8: 'r', a1: 'R', e1: 'K', h1: 'R' }, 'w', 'KQ'), required: ['e1c1'], forbidden: ['e1g1'], check: false },
    { name: 'castling cannot escape check', fen: fen({ b8: 'k', e8: 'r', a1: 'R', e1: 'K', h1: 'R' }, 'w', 'KQ'), forbidden: ['e1g1', 'e1c1'], check: true },
    { name: 'two-rook ladder mate without capture targets', fen: fen({ h8: 'k', a8: 'R', b7: 'R', g1: 'K' }, 'b'), moves: [], check: true, mate: true },
    { name: 'protected adjacent queen mate', fen: fen({ h8: 'k', g7: 'Q', g6: 'K' }, 'b'), moves: [], check: true, mate: true },
    // The upstream material heuristic assumes ordinary kings. These positions
    // have real mating potential, but its result API incorrectly calls a draw.
    // The prototype UI must adjudicate them without that material heuristic.
    { name: 'one knight can mate with an upgraded king', fen: fen({ h8: 'k', f7: 'K', g6: 'N' }, 'b'), moves: [], check: true, mate: true, engineInsufficient: true, engineResult: '1/2-1/2' },
    { name: 'one-knight mate remains reachable', fen: fen({ h8: 'k', f7: 'K', f4: 'N' }), required: ['f4g6'], check: false, mate: false, engineInsufficient: true, engineResult: '1/2-1/2' },
    { name: 'sideways capture escapes across an attacked square', fen: fen({ h8: 'k', a1: 'K', g1: 'R', h7: 'R', f8: 'N' }, 'b'), moves: ['h8f8'], check: true, mate: false },
    { name: 'vertical capture escapes a rook net', fen: fen({ h8: 'k', a1: 'K', g8: 'R', b7: 'R', h7: 'B', h6: 'P' }, 'b'), moves: tier > 0 ? ['h8h6'] : [], check: true, mate: tier === 0 },
    { name: 'diagonal capture escapes a rook net', fen: fen({ h8: 'k', a8: 'R', b7: 'R', g1: 'K', f6: 'N' }, 'b'), moves: tier === 2 ? ['h8f6'] : [], check: true, mate: tier < 2 },
    { name: 'ordinary initial army retains its 20 legal moves', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', count: 20, check: false },
  ];
}

function nativeMoves(executable, configPath, name, position, label, checked) {
  const child = spawnSync(executable, [], {
    cwd: root,
    input: `setoption name VariantPath value ${configPath}\nsetoption name UCI_Variant value ${name}\nposition fen ${position}\nd\ngo perft 1\nquit\n`,
    encoding: 'utf8',
    timeout: 15000,
    maxBuffer: 1024 * 1024,
  });
  assert.ifError(child.error);
  assert.equal(child.status, 0, `${label}: ${child.stderr}`);
  assert.match(child.stdout, /Nodes searched:[ \t]*\d+/, `${label}: missing native perft result`);
  const checkers = child.stdout.match(/^Checkers:[ \t]*(.*)\r?$/m);
  assert.ok(checkers, `${label}: missing native check status`);
  assert.equal(Boolean(checkers[1].trim()), checked, `${label}: native check status`);
  return [...child.stdout.matchAll(/^([a-h][1-8][a-h][1-8][qrbn]?): 1\r?$/gm)].map(match => match[1]).sort();
}

async function verify(name) {
  const { initVariantRules } = require(path.join(root, 'dist/rules-node.cjs'));
  const rules = await initVariantRules();
  const selectedConfig = singleConfig(name);
  rules.loadVariantConfig(selectedConfig);
  assert.ok(rules.variants().split(' ').includes(name), `Rules did not load ${name}`);
  const executable = process.env.FAIRY_STOCKFISH_PATH;
  const temp = executable ? mkdtempSync(path.join(os.tmpdir(), 'levelup-kings-')) : null;
  const configPath = temp && path.join(temp, 'variants.ini');
  if (configPath) writeFileSync(configPath, selectedConfig);
  let verified = 0;
  try {
    for (const fixture of fixtures(PROFILES.indexOf(name))) for (const mirrored of [false, true]) {
      const position = mirrored ? opposite(fixture.fen) : fixture.fen;
      const label = `${name}: ${fixture.name}, ${mirrored ? 'opposite color' : 'original'}`;
      const transform = moves => moves.map(move => mirrored ? mirrorMove(move) : move).sort();
      assert.equal(rules.validateFen(position, name), 1, `${label}: invalid FEN ${position}`);
      const board = new rules.Board(name, position);
      try {
        const moves = board.legalMoves().split(' ').filter(Boolean).sort();
        assert.equal(board.isCheck(), fixture.check, `${label}: check status`);
        if (fixture.moves) assert.deepEqual(moves, transform(fixture.moves), `${label}: exact move set`);
        if (fixture.kingMoves) {
          const origin = mirrored ? mirrorSquare('d4') : 'd4';
          assert.deepEqual(moves.filter(move => move.startsWith(origin)), transform(fixture.kingMoves), `${label}: exact king moves`);
        }
        for (const move of transform(fixture.required || [])) assert.ok(moves.includes(move), `${label}: missing ${move}`);
        for (const move of transform(fixture.forbidden || [])) assert.ok(!moves.includes(move), `${label}: unexpected ${move}`);
        if (fixture.count !== undefined) assert.equal(moves.length, fixture.count, `${label}: move count`);
        if (fixture.engineInsufficient !== undefined) assert.equal(board.isInsufficientMaterial(), fixture.engineInsufficient, `${label}: upstream material heuristic`);
        if (fixture.engineResult !== undefined) assert.equal(board.result(true), fixture.engineResult, `${label}: upstream result limitation`);
        if (fixture.mate !== undefined) {
          assert.equal(board.isCheck() && moves.length === 0, fixture.mate, `${label}: checkmate`);
          if (fixture.engineResult === undefined) assert.equal(board.result(true), fixture.mate ? (position.split(' ')[1] === 'b' ? '1-0' : '0-1') : '*', `${label}: result`);
        }
        if (executable) assert.deepEqual(nativeMoves(executable, configPath, name, position, label, board.isCheck()), moves, `${label}: native/browser move agreement`);
      } finally { board.delete(); }
      verified++;
    }
  } finally { if (temp) rmSync(temp, { recursive: true, force: true }); }
  console.log(`${name}: ${verified} validated browser-rule positions${executable ? '; native check status and exact move sets agree' : ' (set FAIRY_STOCKFISH_PATH to compare native rules)'}.`);
  console.log('  Recorded upstream limitation: its ordinary-king material heuristic mislabels a reachable one-knight mate as a draw.');
}
