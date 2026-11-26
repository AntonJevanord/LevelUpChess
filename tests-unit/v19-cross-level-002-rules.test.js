'use strict';

// The surviving combinations are covered by revision 001's rules tests.
// Only the added Hippogriff contexts need new prefix and native validation.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ensureResearchOverlay } = require('../scripts/balance/research-overlay');
const ROOT = path.resolve(__dirname, '..');
const NZ = 'knight.level3-nz@1';
const overlay = ensureResearchOverlay({ name: 'cross-level-panel-v19-002', entryFile: 'scripts/v19-cross-level.js',
  definitionFile: 'src/balance-designs-v19-cross-level-002.js' });
const load = file => require(path.join(overlay.directory, file));
const plan = load('scripts/balance/v19-cross-level-plan-002');
const { createDesignRegistry } = load('scripts/balance/design-registry');
const { compileDesignProfile } = load('scripts/balance/design-profile');
const { createMatchRules } = load('dist/balance-rules.cjs');
const { UciEngine } = load('scripts/balance/uci');
const { pieceMap, placementFromMap, pocketLetters } = load('src/profile-fen');
const compile = declaration => compileDesignProfile(createDesignRegistry(declaration.config), declaration.config.evaluation);
const letterFor = (profile, id) => profile.registry.allocations.find(row => row.id === id).letter;
const N = ['b3', 'b5', 'c2', 'c6', 'e2', 'e6', 'f3', 'f5'];
const Z = ['b1', 'b7', 'f1', 'f7', 'a2', 'a6', 'g2', 'g6'];
const TARGETS = [...N, ...Z];
const reflect = square => square[0] + (9 - Number(square[1]));
const swap = piece => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase();
function position(pieces, black = false) {
  const mapped = new Map(Object.entries(pieces).map(([square, piece]) => black ? [reflect(square), swap(piece)] : [square, piece]));
  return `${placementFromMap(mapped)} ${black ? 'b' : 'w'} - - 0 1`;
}
function assertOrdinaryInventory(fen, profile) {
  const standard = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }, counts = {};
  for (const piece of pieceMap(fen).values()) {
    const family = standard[piece.toLowerCase()] || profile.definitionsByLetter[piece.toLowerCase()]?.family;
    assert.ok(family); counts[family] = (counts[family] || 0) + 1;
  }
  assert.deepEqual(counts, { rook: 4, knight: 4, bishop: 4, queen: 2, king: 2, pawn: 16 });
  assert.equal(pocketLetters(fen), ''); assert.equal(pieceMap(fen).get('e1'), 'K'); assert.equal(pieceMap(fen).get('e8'), 'k');
}
function nzComparison(declaration) {
  const comparison = declaration.config.comparisons.find(row => Object.values(row.armyB.upgrades).includes(NZ));
  assert.ok(comparison, 'Each team gets one Hippogriff opponent'); return comparison;
}
function nzMoves(rules, profile, pieces, black = false) {
  const type = letterFor(profile, NZ).toUpperCase();
  const board = rules.createBoard(position({ a1: 'K', h8: 'k', d4: type, ...pieces }, black));
  try { return board.moves().filter(move => move.startsWith(black ? reflect('d4') : 'd4')).sort(); }
  finally { board.dispose(); }
}

test('Hippogriff replays all 1696 first-eight prefixes across every mixed team, home layout and physical color', { timeout: 180000 }, async t => {
  let prefixes = 0, groupsChecked = 0;
  for (const group of plan.groups()) {
    t.signal.throwIfAborted();
    // Only retain the current profile; keeping every WASM module would inflate memory.
    for (const placement of group.sameFamily ? [0, 1] : [0]) {
      const declaration = plan.getBatchDeclaration(group.id, 0, placement), profile = compile(declaration);
      const rules = await createMatchRules({ profile }), comparison = nzComparison(declaration);
      assert.equal(profile.registry.definitions.find(row => row.id === NZ).movement, 'NZ');
      assert.equal(profile.registry.definitions.length, 13);
      for (const aColor of ['w', 'b']) {
        const fen = rules.startingFen(aColor === 'w' ? comparison.armyA : comparison.armyB,
          aColor === 'w' ? comparison.armyB : comparison.armyA);
        assertOrdinaryInventory(fen, profile); assert.match(fen, / w KQkq - 0 1$/);
        const hippogriffSquare = aColor === 'w' ? 'b8' : 'b1';
        const hippogriffLetter = aColor === 'w' ? letterFor(profile, NZ) : letterFor(profile, NZ).toUpperCase();
        assert.equal(pieceMap(fen).get(hippogriffSquare), hippogriffLetter);
        for (const opening of declaration.config.openings) {
          t.signal.throwIfAborted();
          const board = rules.createBoard(fen);
          try {
            for (const move of opening.moves) assert.ok(board.push(move), `${group.id} p${placement} ${aColor} ${opening.id}: ${move}`);
            assert.equal(board.outcome(), null); assert.equal(pieceMap(board.fen()).size, 32);
            if (opening === declaration.config.openings[0]) {
              const roundTrip = rules.createBoard(board.fen());
              try { assert.deepEqual(roundTrip.moves().sort(), board.moves().sort()); }
              finally { roundTrip.dispose(); }
            }
            prefixes++;
          } finally { board.dispose(); }
        }
      }
    }
    if (++groupsChecked % 20 === 0 || groupsChecked === plan.groups().length) {
      console.log(`Hippogriff opening verification: ${groupsChecked}/${plan.groups().length} teams; ${prefixes}/1696 prefixes.`);
    }
  }
  assert.equal(prefixes, 1696);
});

test('Hippogriff has exactly full knight and zebra quiet/capture jumps for both colors, including over blockers', async () => {
  const declaration = plan.getBatchDeclaration(plan.groups()[0].id, 0, 0), profile = compile(declaration);
  const rules = await createMatchRules({ profile });
  const adjacent = { c3: 'P', c4: 'P', c5: 'P', d3: 'P', d5: 'P', e3: 'P', e4: 'P', e5: 'P' };
  for (const black of [false, true]) {
    const square = black ? reflect : value => value;
    const expected = TARGETS.map(target => square('d4') + square(target)).sort();
    assert.deepEqual(nzMoves(rules, profile, {}, black), expected);
    assert.deepEqual(nzMoves(rules, profile, adjacent, black), expected,
      'Knight and zebra components both jump across occupied intermediate squares');
    for (const target of TARGETS) {
      const move = square('d4') + square(target);
      assert.ok(nzMoves(rules, profile, { [target]: 'p' }, black).includes(move), `${target} enemy capture`);
      assert.ok(!nzMoves(rules, profile, { [target]: 'P' }, black).includes(move), `${target} friendly landing`);
    }
  }
});

test('native Hippogriff agrees with WASM and six manual value tables in quiet, capture and blocked-path mixed profiles', { timeout: 180000 }, async t => {
  const executable = process.env.FAIRY_STOCKFISH_PATH || path.join(ROOT, 'node_modules/.cache/levelup-native-values/stockfish');
  if (!fs.existsSync(executable)) { t.skip('Set FAIRY_STOCKFISH_PATH for native Hippogriff validation.'); return; }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-cross-level-002-native-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const wanted = [
    ['knight.positional-quiet-queen@1', 'queen.level2-camel-capture@1'],
    ['bishop.level1-dabbaba@1', 'bishop.orange@2'],
    ['rook.blue@3', 'rook.level2-no-tall-back-capture-knight@1'],
  ];
  let checked = 0;
  for (const [one, two] of wanted) {
    const group = plan.groups().find(row => row.l1.id === one && row.l2.id === two);
    assert.ok(group); t.signal.throwIfAborted();
    const declaration = plan.getBatchDeclaration(group.id, 0, 0), profile = compile(declaration);
    const rules = await createMatchRules({ profile }), file = path.join(directory, `${group.id}.ini`);
    fs.writeFileSync(file, profile.config);
    const engine = new UciEngine({ path: executable, variantPath: file, variant: profile.variant, options: { threads: 1, hash: 16 } });
    try {
      await engine.start(); const tables = (await engine.pieceValues()).pieces;
      for (const allocation of profile.registry.allocations) {
        const prior = profile.evaluation.pieceValues[allocation.id];
        for (const letter of [allocation.letter, allocation.letter.toUpperCase()]) {
          for (const field of ['rawMg', 'captureMg', 'evalMg']) assert.equal(tables[letter][field], prior.mg, `${allocation.id}: ${field}`);
          for (const field of ['rawEg', 'captureEg', 'evalEg']) assert.equal(tables[letter][field], prior.eg, `${allocation.id}: ${field}`);
        }
      }
      const extra = load('src/balance-designs-v18-prepanel-level3').revisionProbes(profile);
      const expanded = load('src/v19-expanded-capability-probes').revisionProbes(profile);
      const probes = [...new Map([...profile.capabilityProbes, ...extra, ...expanded].map(probe => [probe.fen, probe])).values()];
      assert.equal(extra.filter(probe => probe.name.startsWith(`${NZ}:`)).length, 10,
        'Five explicit NZ frames cover each physical color, alongside any existing NAD frames');
      for (const probe of probes) {
        t.signal.throwIfAborted(); const board = rules.createBoard(probe.fen);
        try { assert.deepEqual(await engine.perft({ fen: board.fen() }), board.moves().sort(), `${group.id}: ${probe.name}`); checked++; }
        finally { board.dispose(); }
      }
      const comparison = nzComparison(declaration);
      for (const aColor of ['w', 'b']) {
        const board = rules.createBoard(rules.startingFen(aColor === 'w' ? comparison.armyA : comparison.armyB,
          aColor === 'w' ? comparison.armyB : comparison.armyA));
        try {
          for (const move of declaration.config.openings[0].moves) assert.ok(board.push(move));
          assert.deepEqual(await engine.perft({ fen: board.fen() }), board.moves().sort()); checked++;
        } finally { board.dispose(); }
      }
    } finally { await engine.close(); }
  }
  assert.ok(checked > 100, 'Native parity includes remapped NZ and the existing mixed profiles, without scored games');
});
