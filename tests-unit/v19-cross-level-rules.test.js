'use strict';

// Real rules, preflight positions and native perft only. No scored self-play.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const plan = require('../scripts/balance/v19-cross-level-plan');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { createMatchRules } = require('../dist/balance-rules.cjs');
const { UciEngine } = require('../scripts/balance/uci');
const { pieceMap, placementFromMap, pocketLetters } = require('../src/profile-fen');
const ROOT = path.resolve(__dirname, '..');
const compile = declaration => compileDesignProfile(createDesignRegistry(declaration.config), declaration.config.evaluation);
const type = (profile, id) => profile.registry.allocations.find(row => row.id === id).letter;
const pickGroup = (l1, l2) => {
  const group = plan.groups().find(row => row.l1.id === l1 && row.l2.id === l2);
  assert.ok(group, `Missing mixed fixture ${l1} + ${l2}`); return group;
};
const representativeGroups = () => [
  pickGroup('knight.positional-quiet-queen@1', 'queen.level2-camel-capture@1'),
  pickGroup('bishop.level1-dabbaba@1', 'bishop.orange@2'),
  pickGroup('rook.blue@3', 'rook.level2-no-tall-back-capture-knight@1'),
  pickGroup('pawn.blue@5', 'pawn.level2-forward-queen-only@1'),
  pickGroup('queen.level1-forward-knight@1', 'knight.level2-forward-zebra@1'),
];
function inventory(fen, profile) {
  const standard = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
  const counts = {};
  for (const letter of pieceMap(fen).values()) {
    const low = letter.toLowerCase(), family = standard[low] || profile.definitionsByLetter[low]?.family;
    assert.ok(family, 'Every actual letter keeps its semantic family'); counts[family] = (counts[family] || 0) + 1;
  }
  return counts;
}
function assertOrdinaryInventory(fen, profile) {
  assert.deepEqual(inventory(fen, profile), { rook: 4, knight: 4, bishop: 4, queen: 2, king: 2, pawn: 16 });
  assert.equal(pocketLetters(fen), '');
  assert.equal(pieceMap(fen).get('e1'), 'K'); assert.equal(pieceMap(fen).get('e8'), 'k');
}
function position(pieces, turn = 'w', rights = '-', ep = '-') {
  return `${placementFromMap(new Map(Object.entries(pieces)))} ${turn} ${rights} ${ep} 0 1`;
}

test('all selected mixed armies preserve standard material and replay all first-eight shared prefixes in both colors', { timeout: 600000 }, async t => {
  let prefixes = 0, groupsChecked = 0;
  for (const group of plan.groups()) {
    t.signal.throwIfAborted();
    for (const placement of group.sameFamily ? [0, 1] : [0]) {
      const declaration = plan.getBatchDeclaration(group.id, 0, placement), profile = compile(declaration);
      const rules = await createMatchRules({ profile });
      assert.ok(!profile.roles.reserveTypes?.length);
      for (const comparison of declaration.config.comparisons) for (const aColor of ['w', 'b']) {
        const fen = rules.startingFen(aColor === 'w' ? comparison.armyA : comparison.armyB,
          aColor === 'w' ? comparison.armyB : comparison.armyA);
        assertOrdinaryInventory(fen, profile);
        assert.match(fen, / w KQkq - 0 1$/);
        for (const opening of declaration.config.openings) {
          t.signal.throwIfAborted();
          const board = rules.createBoard(fen);
          try {
            for (const move of opening.moves) {
              assert.ok(board.push(move), `${group.id} ${comparison.id} ${aColor} ${opening.id}: ${move}`);
            }
            assert.equal(board.outcome(), null, `${group.id} ${opening.id} ends terminal`);
            assert.equal(pieceMap(board.fen()).size, 32, 'The declared quiet opening must not exchange upgraded material');
            if (comparison === declaration.config.comparisons[0] && opening === declaration.config.openings[0]) {
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
      console.log(`Cross-level opening verification: ${groupsChecked}/${plan.groups().length} groups; ${prefixes}/22176 prefixes.`);
    }
  }
  assert.equal(prefixes, 22176);
});

test('two upgraded rooks retain both castles and mixed pawn roles retain their distinct en-passant and promotion rules', async () => {
  const rookGroup = pickGroup('rook.blue@3', 'rook.level2-no-tall-back-capture-knight@1');
  for (const placement of [0, 1]) {
    const declaration = plan.getBatchDeclaration(rookGroup.id, 0, placement), profile = compile(declaration), rules = await createMatchRules({ profile });
    const comparison = declaration.config.comparisons[0], rooks = Object.fromEntries(Object.entries(comparison.armyA.upgrades)
      .map(([square, id]) => [square, type(profile, id).toUpperCase()]));
    const board = rules.createBoard(position({ ...rooks, e1: 'K', e8: 'k' }, 'w', 'KQ'));
    try { assert.ok(board.moves().includes('e1g1')); assert.ok(board.moves().includes('e1c1')); }
    finally { board.dispose(); }
  }
  const pawnGroup = pickGroup('pawn.blue@5', 'pawn.level2-forward-queen-only@1');
  const profile = compile(plan.getBatchDeclaration(pawnGroup.id, 0, 0)), rules = await createMatchRules({ profile });
  for (const id of [pawnGroup.l1.id, pawnGroup.l2.id]) {
    const pawn = type(profile, id).toUpperCase();
    const promotion = rules.createBoard(position({ a1: 'K', h6: 'k', b7: pawn }));
    try {
      assert.deepEqual(promotion.moves().filter(move => move.startsWith('b7b8')).sort(), ['b7b8b', 'b7b8n', 'b7b8q', 'b7b8r']);
      assert.ok(!promotion.moves().includes('b7b8'));
    } finally { promotion.dispose(); }
    const ep = rules.createBoard(position({ a1: 'K', h8: 'k', c5: pawn, d5: 'p' }, 'w', '-', 'd6'));
    try {
      assert.ok(ep.push('c5d6'));
      assert.equal(pieceMap(ep.fen()).has('d5'), id === pawnGroup.l2.id,
        'fQ2 visits the target quietly; the Two-step pawn removes the bypassed pawn');
    } finally { ep.dispose(); }
  }
});

test('five representative mixed profiles agree with native capability probes and all six manual value tables', { timeout: 180000 }, async t => {
  const executable = process.env.FAIRY_STOCKFISH_PATH || path.join(ROOT, 'node_modules/.cache/levelup-native-values/stockfish');
  if (!fs.existsSync(executable)) { t.skip('Set FAIRY_STOCKFISH_PATH for native cross-level validation.'); return; }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-cross-level-native-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let probesChecked = 0;
  for (const group of representativeGroups()) {
    const declaration = plan.getBatchDeclaration(group.id, 0, 0), profile = compile(declaration), rules = await createMatchRules({ profile });
    const file = path.join(directory, `${group.id}.ini`); fs.writeFileSync(file, profile.config);
    const engine = new UciEngine({ path: executable, variantPath: file, variant: profile.variant, options: { threads: 1, hash: 16 } });
    try {
      await engine.start(); const tables = (await engine.pieceValues()).pieces;
      for (const allocation of profile.registry.allocations) {
        const prior = profile.evaluation.pieceValues[allocation.id];
        for (const letter of [allocation.letter, allocation.letter.toUpperCase()]) {
          for (const field of ['rawMg', 'captureMg', 'evalMg']) assert.equal(tables[letter][field], prior.mg, `${group.id} ${allocation.id} ${field}`);
          for (const field of ['rawEg', 'captureEg', 'evalEg']) assert.equal(tables[letter][field], prior.eg, `${group.id} ${allocation.id} ${field}`);
        }
      }
      const extra = require('../src/v19-expanded-capability-probes').revisionProbes(profile);
      const probes = [...new Map([...profile.capabilityProbes, ...extra].map(probe => [probe.fen, probe])).values()];
      for (const probe of probes) {
        const board = rules.createBoard(probe.fen);
        try { assert.deepEqual(await engine.perft({ fen: board.fen() }), board.moves().sort(), `${group.id}: ${probe.name}`); probesChecked++; }
        finally { board.dispose(); }
      }
      // Include an actual compound-army prefix, not just single-piece frames.
      for (const aColor of ['w', 'b']) {
        const cell = declaration.config.comparisons.find(row => Object.values(row.armyB.upgrades).includes('bishop.purple@13'));
        const board = rules.createBoard(rules.startingFen(aColor === 'w' ? cell.armyA : cell.armyB, aColor === 'w' ? cell.armyB : cell.armyA));
        try {
          for (const move of declaration.config.openings[0].moves) assert.ok(board.push(move));
          assert.deepEqual(await engine.perft({ fen: board.fen() }), board.moves().sort());
        } finally { board.dispose(); }
      }
    } finally { await engine.close(); }
  }
  assert.ok(probesChecked > 100, 'actual remapped geometry and role probes were checked across all five groups');
});
