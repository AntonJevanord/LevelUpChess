'use strict';

// Diagnostic-only raw boards inspect hypothetical turns and removed blockers.
// They never replace the validated game board, choose openings or score games.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { build } = require('esbuild');
const { rulesBuildOptions } = require('../rules-build');
const { pieceMap, placementFromMap } = require('../../src/profile-fen');

const ROOT = path.resolve(__dirname, '../..');
const CACHE = path.join(ROOT, 'node_modules/.cache/levelup-opening-inspector');
const modules = new Map();
let factory;
const sha = value => createHash('sha256').update(value).digest('hex');
const colorOf = letter => letter === letter.toUpperCase() ? 'w' : 'b';
const other = color => color === 'w' ? 'b' : 'w';
const legal = board => board.legalMoves().split(' ').filter(Boolean).sort();
const LIMITS = Object.freeze([
  'A legal capture without an immediate legal recapture is an exposed-piece candidate, not proof of a forced material loss.',
  'Opposite-turn captures are hypothetical: the actual player may respond before that opponent gets a turn.',
  'Removing a royal shield exposes its own king; a pinned piece may still move along the shielding line or capture the attacker.',
  'Pins are not classified for a side already in check. Hypothetical opposite-turn captures are skipped while the actual side is in check.',
  'This static inspection does not establish sacrifices, multi-move tactics or game-history draw claims; use the optional search and its principal variation for further review.',
]);

function abort(signal) {
  if (!signal?.aborted) return;
  const error = new Error('Opening tactic inspection cancelled.');
  error.name = 'AbortError'; error.code = 'ABORT_ERR'; throw error;
}

async function rawFactory() {
  if (!factory) factory = (async () => {
    const result = await build({ ...rulesBuildOptions(), absWorkingDir: ROOT,
      stdin: { contents: "import Module from 'ffish-es6'; import bytes from 'variant-wasm'; export async function createRaw(config) { const m = await Module({ wasmBinary: Uint8Array.from(atob(bytes), c => c.charCodeAt(0)) }); m.loadVariantConfig(config); return m; }", resolveDir: ROOT, loader: 'js' },
      bundle: true, platform: 'node', format: 'cjs', write: false, legalComments: 'none' });
    const bytes = Buffer.from(result.outputFiles[0].contents);
    fs.mkdirSync(CACHE, { recursive: true });
    const directory = fs.lstatSync(CACHE);
    if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('Opening inspector cache must be an ordinary directory.');
    const file = path.join(CACHE, `raw-${sha(bytes)}.cjs`);
    try { fs.writeFileSync(file, bytes, { flag: 'wx' }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || !fs.readFileSync(file).equals(bytes)) throw new Error('Opening inspector cache changed.');
    return require(file).createRaw;
  })().catch(error => { factory = null; throw error; });
  return factory;
}

function validateProfile(profile) {
  if (!profile || typeof profile !== 'object' || typeof profile.config !== 'string'
    || !/^[a-z0-9][a-z0-9_-]*$/i.test(profile.variant || '')
    || !profile.definitionsByLetter || Array.isArray(profile.definitionsByLetter)
    || !Array.isArray(profile.roles?.royalTypes) || profile.roles.royalTypes.length !== 1 || profile.roles.royalTypes[0] !== 'k') {
    throw new Error('Opening tactics require an archived dynamic profile with ordinary royal kings.');
  }
}

async function profileModule(profile) {
  const key = sha(JSON.stringify([profile.variant, profile.config]));
  let pending = modules.get(key);
  if (!pending) {
    pending = rawFactory().then(create => create(profile.config));
    modules.set(key, pending);
    while (modules.size > 2) modules.delete(modules.keys().next().value);
    pending.catch(() => { if (modules.get(key) === pending) modules.delete(key); });
  } else { modules.delete(key); modules.set(key, pending); }
  return pending;
}

function position(fen) {
  if (typeof fen !== 'string') throw new Error('Opening tactics require a FEN.');
  const fields = fen.trim().split(/\s+/);
  if (fields.length !== 6 || !['w', 'b'].includes(fields[1]) || !/^\d+$/.test(fields[4]) || !/^[1-9]\d*$/.test(fields[5])) throw new Error('Invalid opening tactic FEN.');
  const pieces = pieceMap(fields.join(' '));
  const royals = [...pieces.values()].filter(piece => piece.toLowerCase() === 'k');
  if (royals.length !== 2 || !royals.includes('K') || !royals.includes('k')) throw new Error('Opening tactics require one ordinary royal king per side.');
  return { fields, pieces, fen: fields.join(' ') };
}

function syntheticFen(fields, color, pieces) {
  const next = [...fields]; next[1] = color; next[3] = '-';
  if (pieces) {
    next[0] = placementFromMap(pieces);
    // A removed rook/king-side shield must not leave synthetic castling data.
    // Castling rights do not affect the static attack test.
    next[2] = '-';
  }
  return next.join(' ');
}

function withBoard(module, variant, fen, action) {
  const board = new module.Board(variant, fen, false);
  try { return action(board); } finally { board.delete(); }
}

function makeInspector(raw, input) {
  let module = raw;
  const profile = JSON.parse(JSON.stringify(input));
  const describe = (square, letter) => ({ square, letter, color: colorOf(letter),
    designId: profile.definitionsByLetter[letter.toLowerCase()]?.id || null,
    isUpgrade: Boolean(profile.definitionsByLetter[letter.toLowerCase()]) });
  return {
    inspect(fen, { signal } = {}) {
      abort(signal);
      if (!module) throw new Error('Opening tactic inspector is closed.');
      const current = position(fen), sideToMove = current.fields[1];
      const ordinaryValidation = [...current.fields]; ordinaryValidation[3] = '-';
      if (module.validateFen(ordinaryValidation.join(' '), profile.variant) !== 1) throw new Error('Invalid opening tactic position.');
      const checks = Object.fromEntries(['w', 'b'].map(color => [color,
        withBoard(module, profile.variant, syntheticFen(current.fields, color), board => board.isCheck())]));
      const actual = withBoard(module, profile.variant, current.fen, board => {
        const moves = legal(board);
        return { inCheck: board.isCheck(), legalMoves: moves.length,
          terminal: moves.length ? null : { reason: board.isCheck() ? 'checkmate' : 'stalemate',
            result: board.isCheck() ? sideToMove === 'w' ? '0-1' : '1-0' : '1/2-1/2' } };
      });
      // Callers replay and validate actual game positions first. Reject a bad
      // inactive king rather than drawing conclusions from an impossible turn.
      if (checks[other(sideToMove)]) throw new Error('Opening tactic position checks the inactive king.');
      const pieces = [...current.pieces].filter(([, letter]) => letter.toLowerCase() !== 'k')
        .map(([square, letter]) => ({ ...describe(square, letter), royalShieldPin: null, captureThreats: [] }))
        .sort((a, b) => a.color.localeCompare(b.color) || a.square.localeCompare(b.square));
      const bySquare = new Map(pieces.map(piece => [piece.square, piece]));
      const pins = [], captureThreats = [], inspections = {};

      for (const piece of pieces) {
        abort(signal);
        if (checks[piece.color]) { piece.royalShieldPin = { status: 'unclassified-king-in-check', exposesCheck: null }; continue; }
        const removed = new Map(current.pieces);
        if (Object.hasOwn(current.pieces, 'pocket')) removed.pocket = current.pieces.pocket;
        removed.delete(piece.square);
        const exposed = withBoard(module, profile.variant, syntheticFen(current.fields, piece.color, removed), board => board.isCheck());
        piece.royalShieldPin = { status: exposed ? 'royal-shield-pin' : 'not-a-royal-shield', exposesCheck: exposed };
        if (exposed) pins.push({ ...describe(piece.square, piece.letter), kind: 'removal-exposes-own-king' });
      }

      for (const attackerColor of ['w', 'b']) {
        abort(signal);
        const actualTurn = attackerColor === sideToMove;
        if (!actualTurn && actual.inCheck) {
          inspections[attackerColor] = { mode: 'hypothetical', status: 'skipped-actual-side-in-check', captures: 0 };
          continue;
        }
        const turnFen = actualTurn ? current.fen : syntheticFen(current.fields, attackerColor);
        const found = withBoard(module, profile.variant, turnFen, board => {
          const outcomes = [];
          for (const move of legal(board)) {
            abort(signal);
            if (move.includes('@') || !board.isCapture(move)) continue;
            const landingSquare = move.slice(2, 4), attackerSquare = move.slice(0, 2);
            // Synthetic turns must never simulate capturing a royal king.
            if (current.pieces.get(landingSquare)?.toLowerCase() === 'k') continue;
            if (!board.push(move)) throw new Error('Opening tactic legal capture could not be replayed.');
            try {
              const after = pieceMap(board.fen());
              const victims = pieces.filter(piece => piece.color !== attackerColor && after.get(piece.square) !== piece.letter);
              if (!victims.length) continue;
              const attackerOnLanding = after.get(landingSquare);
              const canRecapture = attackerOnLanding && colorOf(attackerOnLanding) === attackerColor;
              const recaptures = canRecapture ? legal(board).filter(reply => !reply.includes('@') && reply.slice(2, 4) === landingSquare && board.isCapture(reply)) : [];
              for (const victim of victims) outcomes.push({ victim: describe(victim.square, victim.letter),
                attacker: describe(attackerSquare, current.pieces.get(attackerSquare)), attackerColor,
                move, landingSquare, actualTurn, mode: actualTurn ? 'actual-turn' : 'hypothetical-opponent-turn',
                recaptures, recaptureStatus: canRecapture ? recaptures.length ? 'legal-immediate-recapture' : 'no-legal-immediate-recapture' : 'attacker-not-on-landing',
                unrecapturedCandidate: Boolean(canRecapture && recaptures.length === 0),
                forcedMaterialLoss: false });
            } finally { board.pop(); }
          }
          return outcomes;
        });
        inspections[attackerColor] = { mode: actualTurn ? 'actual' : 'hypothetical', status: 'inspected', captures: found.length };
        for (const threat of found) { captureThreats.push(threat); bySquare.get(threat.victim.square).captureThreats.push(threat); }
      }
      return { schemaVersion: 1, format: 'levelup-opening-tactics', sideToMove,
        inCheck: actual.inCheck, checks, legalMoves: actual.legalMoves, terminal: actual.terminal,
        pins, captureThreats, inspections, pieces,
        upgradedPieces: pieces.filter(piece => piece.isUpgrade), limits: [...LIMITS] };
    },
    close() { module = null; },
  };
}

async function createOpeningInspector(profile) {
  validateProfile(profile);
  return makeInspector(await profileModule(profile), profile);
}

async function inspectPosition({ profile, fen, signal } = {}) {
  abort(signal);
  const inspector = await createOpeningInspector(profile);
  try { return inspector.inspect(fen, { signal }); } finally { inspector.close(); }
}

module.exports = { createOpeningInspector, inspectPosition, LIMITS };
