'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { rulesBuildOptions } = require('../scripts/rules-build');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { getDesign, LEGACY_DESIGN_IDS } = require('../src/design-catalog');
const { NEW_DEFINITIONS, L1_BRACKETS, L2_PAWN_BRACKETS, L2_GRANT_BRACKETS, L3_NEW } = require('../src/balance-designs-v17');
const { pieceMap, pocketLetters } = require('../src/profile-fen');
const { UciEngine } = require('../scripts/balance/uci');

const groups = [...L1_BRACKETS, ...L2_PAWN_BRACKETS, ...L2_GRANT_BRACKETS];
const group = key => groups.find(value => value.key === key);
const contexts = new Map(), fixtures = [];
const home = { pawn: 'c2', knight: 'b1', bishop: 'c1', rook: 'a1', queen: 'd1' };
const kings = { h1: 'K', h7: 'k' };
let directory;
function position(pieces, turn = 'w', ep = '-', pocket = '', rights = '-') {
  const ranks = Array.from({ length: 8 }, (_, row) => {
    let rank = '', empty = 0;
    for (const file of 'abcdefgh') {
      const type = pieces[file + (8 - row)];
      if (!type) { empty++; continue; }
      if (empty) rank += empty;
      empty = 0; rank += type;
    }
    return rank + (empty || '');
  });
  return `${ranks.join('/')}${pocket ? '[' + pocket + ']' : ''} ${turn} ${rights} ${ep} 0 1`;
}
const reflect = square => square[0] + (9 - Number(square[1]));
const swap = value => value.replace(/[a-z]/gi, character => character === character.toUpperCase() ? character.toLowerCase() : character.toUpperCase());
function opposite(input) {
  const fields = input.split(' ');
  fields[0] = swap(fields[0].split('[')[0].split('/').reverse().join('/')) + (input.includes('[') ? '[' + swap(pocketLetters(input)) + ']' : '');
  fields[1] = fields[1] === 'w' ? 'b' : 'w';
  const rights = swap(fields[2]);
  fields[2] = [...'KQkq'].filter(character => rights.includes(character)).join('') || '-';
  if (fields[3] !== '-') fields[3] = fields[3].match(/[a-h][1-8]/g).map(reflect).sort().join('');
  return fields.join(' ');
}
const typeFor = (context, id) => context.profile.registry.allocations.find(allocation => allocation.id === id).letter.toUpperCase();
function both(t, id, name, input, check) {
  const context = contexts.get(id);
  for (const color of ['w', 'b']) {
    const fen = color === 'w' ? input : opposite(input);
    fixtures.push({ context, name: `${id}: ${name} (${color})`, fen });
    const board = context.rules.createBoard(fen);
    t.after(() => board.dispose());
    check(board, color === 'w' ? square => square : reflect, color);
  }
}
const targets = (board, from) => [...new Set(board.moves().filter(move => move.startsWith(from)).map(move => move.slice(2, 4)))].sort();
function forVariants(t, key, name, make, check) {
  const bracket = group(key);
  for (const variant of bracket.variants) {
    const context = contexts.get(variant.id), type = typeFor(context, variant.id);
    both(t, variant.id, name, make(type), (board, square, color) => check(board, square, variant.key, type, color));
  }
}

test.before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v17-brackets-'));
  const output = path.join(directory, 'rules.cjs');
  await build({ ...rulesBuildOptions(), absWorkingDir: path.resolve(__dirname, '..'), entryPoints: ['src/balance-rules.js'],
    bundle: true, platform: 'node', format: 'cjs', outfile: output, legalComments: 'none' });
  const sets = [L1_BRACKETS.slice(0, 4).flatMap(b => b.variants.map(v => v.id)),
    L1_BRACKETS.slice(4).flatMap(b => b.variants.map(v => v.id)),
    L2_PAWN_BRACKETS.flatMap(b => b.variants.map(v => v.id)),
    L2_GRANT_BRACKETS.flatMap(b => b.variants.map(v => v.id)),
    [...L3_NEW.map(v => v.id), 'bishop.purple@16', 'bishop.purple@19']];
  for (const [index, raw] of sets.entries()) {
    const ids = [...new Set(raw)];
    const registry = createDesignRegistry({ schemaVersion: 3, comparisons: ids.map(id => ({
      armyA: getDesign(id).placement === 'reserve' ? { reserve: [{ id, count: 1 }] }
        : { upgrades: { [home[getDesign(id).family]]: id } }, armyB: {},
    })) });
    const profile = compileDesignProfile(registry);
    const context = { profile, rules: await require(output).createMatchRules({ profile }), ini: path.join(directory, `profile-${index}.ini`) };
    fs.writeFileSync(context.ini, profile.config);
    for (const id of ids) contexts.set(id, context);
  }
});
test.after(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

test('new brackets preserve the legacy allocation map, measured definitions and old prices', () => {
  assert.deepEqual(LEGACY_DESIGN_IDS, { e: 'knight.blue@1', f: 'knight.orange@1', g: 'knight.purple@1',
    h: 'bishop.blue@1', i: 'bishop.orange@1', j: 'bishop.purple@1', t: 'queen.orange@1', u: 'queen.purple@1',
    a: 'pawn.blue@1', c: 'pawn.orange@1', d: 'pawn.purple@1', o: 'rook.purple@1', l: 'rook.blue@1',
    m: 'rook.orange@1', s: 'queen.blue@1' });
  assert.equal(getDesign('pawn.blue@2').level, 1);
  assert.equal(getDesign('pawn.blue@2').movement, 'fmWfeFifmnD');
  assert.equal(getDesign('king.reserve-rook@1').level, 3);
  assert.equal(getDesign('king.reserve-pawn@3').level, 1);
  assert.equal(getDesign('king.reserve-pawn@4').level, 1);
  assert.equal(getDesign('pawn.purple@11').level, 3);
  assert.equal(NEW_DEFINITIONS.length, 42);
  assert.equal(new Set(NEW_DEFINITIONS.map(definition => definition.id)).size, 42);
  for (const definition of NEW_DEFINITIONS) {
    assert.equal(getDesign(definition.id), definition);
    assert.equal(definition.inheritLegacyProbes, false);
    assert.ok(!definition.movement.includes('nC'));
    assert.ok(Object.isFrozen(definition));
    assert.ok(contexts.get(definition.id).profile.capabilityProbes.some(probe => probe.name.startsWith(definition.id + ':')));
  }
  for (const bracket of groups) for (const variant of bracket.variants) {
    assert.equal(getDesign(variant.id).level, bracket.level);
    assert.equal(getDesign(variant.id).movement, variant.movement);
  }
  assert.equal(new Set(L2_GRANT_BRACKETS.flatMap(b => b.variants.map(v => v.id))).size, 13);
});

test('reduced, current and expanded brackets have nested quiet movement sets for both colors', t => {
  for (const bracket of groups) {
    for (const color of ['w', 'b']) {
      const sets = bracket.variants.map(variant => {
        const context = contexts.get(variant.id), type = typeFor(context, variant.id);
        const white = position({ ...kings, d4: type });
        const fen = color === 'w' ? white : opposite(white);
        fixtures.push({ context, fen, name: `${bracket.key}: nested quiet movement (${color})` });
        const board = context.rules.createBoard(fen);
        t.after(() => board.dispose());
        return targets(board, color === 'w' ? 'd4' : 'd5');
      });
      assert.ok(sets[0].every(square => sets[1].includes(square)), bracket.key + ' reduced/current');
      assert.ok(sets[1].every(square => sets[2].includes(square)), bracket.key + ' current/expanded');
    }
  }
});

test('Positional and Climbing knight brackets distinguish slide range, directions and vertical jumps', t => {
  forVariants(t, 'positional', 'quiet slide range', type => position({ ...kings, d4: type }), (board, square, version) => {
    const moves = targets(board, square('d4'));
    assert.ok(moves.includes(square('b4')));
    assert.equal(moves.includes(square('a4')), version !== 'reduced');
    assert.equal(moves.includes(square('d7')), version === 'expanded');
  });
  forVariants(t, 'positional', 'quiet slides cannot cross friendly blockers or capture', type => position({ ...kings, d4: type, e4: 'P', b4: 'p' }), (board, square) => {
    const moves = targets(board, square('d4'));
    for (const target of ['e4', 'f4', 'b4']) assert.ok(!moves.includes(square(target)));
  });
  forVariants(t, 'climbing', 'vertical extra steps', type => position({ ...kings, d4: type }), (board, square, version) => {
    const moves = targets(board, square('d4'));
    assert.ok(moves.includes(square('d5')));
    assert.equal(moves.includes(square('d3')), version !== 'reduced');
    assert.equal(moves.includes(square('d6')), version === 'expanded');
  });
  forVariants(t, 'climbing', 'two-square jump crosses a blocker', type => position({ ...kings, d4: type, d5: 'P', d6: 'p' }), (board, square, version) => {
    assert.equal(board.moves().includes(square('d4') + square('d6')), version === 'expanded');
  });
});

test('bishop brackets distinguish forward hops, through hops and sideways captures', t => {
  forVariants(t, 'hopping', 'hopping directions and distance', type => position({ ...kings, d4: type, e5: 'P', c3: 'P' }), (board, square, version) => {
    const moves = targets(board, square('d4'));
    assert.ok(moves.includes(square('f6')));
    assert.ok(moves.includes(square('b2')));
    assert.equal(moves.includes(square('g7')), version === 'expanded');
  });
  forVariants(t, 'hopping', 'hurdle farther than one square', type => position({ ...kings, d4: type, f6: 'P' }), (board, square, version) => {
    assert.equal(board.moves().includes(square('d4') + square('g7')), version !== 'reduced');
    assert.equal(board.moves().includes(square('d4') + square('h8')), version === 'expanded');
  });
  forVariants(t, 'hopping', 'hops are quiet only', type => position({ ...kings, d4: type, e5: 'P', f6: 'p' }), (board, square) => {
    assert.ok(!board.moves().includes(square('d4') + square('f6')));
  });
  forVariants(t, 'wazzap', 'sideways capture range', type => position({ ...kings, d4: type, c4: 'p', f4: 'p' }), (board, square, version) => {
    const moves = targets(board, square('d4'));
    assert.equal(moves.includes(square('c4')), version !== 'reduced');
    assert.equal(moves.includes(square('f4')), version === 'expanded');
  });
  forVariants(t, 'wazzap', 'sideways path stays blocked', type => position({ ...kings, d4: type, e4: 'P', f4: 'p' }), (board, square) => {
    assert.ok(!board.moves().includes(square('d4') + square('f4')));
  });
});

test('Ghost rook jumps are quiet and Pawn rook captures use all four diagonals in the current design', t => {
  forVariants(t, 'ghost', 'orthogonal and diagonal hurdle paths', type => position({ ...kings, d4: type, d5: 'P', d3: 'P', c4: 'P', e4: 'P', e5: 'P' }), (board, square, version) => {
    const moves = targets(board, square('d4'));
    assert.ok(moves.includes(square('d6')));
    assert.ok(moves.includes(square('d2')));
    assert.equal(moves.includes(square('d7')), version !== 'reduced');
    assert.equal(moves.includes(square('f6')), version === 'expanded');
  });
  forVariants(t, 'ghost', 'hopping capture stays forbidden', type => position({ ...kings, d4: type, d5: 'P', d6: 'p', e5: 'P', f6: 'p' }), (board, square) => {
    for (const to of ['d6', 'f6']) assert.ok(!board.moves().includes(square('d4') + square(to)));
  });
  forVariants(t, 'pawn-rook', 'diagonal capture directions', type => position({ ...kings, d4: type, c3: 'p', e5: 'p' }), (board, square, version) => {
    assert.ok(board.moves().includes(square('d4') + square('e5')));
    assert.equal(board.moves().includes(square('d4') + square('c3')), version !== 'reduced');
  });
  forVariants(t, 'pawn-rook', 'diagonal capture range and blocker', type => position({ ...kings, d4: type, f6: 'p', c3: 'P', b2: 'p' }), (board, square, version) => {
    assert.equal(board.moves().includes(square('d4') + square('f6')), version === 'expanded');
    assert.ok(!board.moves().includes(square('d4') + square('b2')));
    assert.ok(!board.moves().includes(square('d4') + square('e5')), 'quiet diagonal step remains absent');
  });
  for (const bracket of L1_BRACKETS.filter(b => b.family === 'rook')) for (const variant of bracket.variants) {
    const type = typeFor(contexts.get(variant.id), variant.id);
    both(t, variant.id, 'ordinary king castling with upgraded rook', position({ a1: type, e1: 'K', h1: type, e8: 'k' }, 'w', '-', '', 'KQ'), (board, square) => {
      assert.ok(board.moves().includes(square('e1') + square('g1')));
      assert.ok(board.moves().includes(square('e1') + square('c1')));
    });
  }
});

test('Advancing queen restriction is the home zone and its jumps remain quiet', t => {
  forVariants(t, 'advancing', 'home-zone forward knight jumps', type => position({ h1: 'K', h8: 'k', d2: type }), (board, square) => {
    assert.ok(board.moves().includes(square('d2') + square('c4')));
  });
  forVariants(t, 'advancing', 'middle-board forward jumps', type => position({ ...kings, d4: type }), (board, square, version) => {
    assert.equal(board.moves().includes(square('d4') + square('c6')), version !== 'reduced');
    assert.equal(board.moves().includes(square('d4') + square('c2')), version === 'expanded');
  });
  forVariants(t, 'advancing', 'quiet jumps do not capture', type => position({ ...kings, d4: type, c6: 'p', c2: 'p' }), (board, square) => {
    for (const to of ['c6', 'c2']) assert.ok(!board.moves().includes(square('d4') + square(to)));
  });
  const id = group('advancing').variants[0].id, type = typeFor(contexts.get(id), id);
  both(t, id, 'returning home restores the extra jump', position({ h1: 'K', h8: 'k', d2: type }), (board, square) => {
    for (const move of ['d2d3', 'h8g8', 'd3d2', 'g8h8']) assert.equal(board.push(square(move.slice(0, 2)) + square(move.slice(2))), true);
    assert.ok(board.moves().includes(square('d2') + square('c4')));
  });
});

test('Bishop pawn brackets restrict quiet diagonals by home zone and extend only quiet forward range', t => {
  forVariants(t, 'bishop-step', 'home diagonal', type => position({ ...kings, d2: type }), (board, square) => {
    assert.ok(board.moves().includes(square('d2') + square('c3')));
    assert.ok(board.moves().includes(square('d2') + square('d4')));
  });
  forVariants(t, 'bishop-step', 'middle diagonal and forward range', type => position({ ...kings, d4: type }), (board, square, version) => {
    assert.equal(board.moves().includes(square('d4') + square('c5')), version !== 'reduced');
    assert.equal(board.moves().includes(square('d4') + square('d6')), version === 'expanded');
  });
  forVariants(t, 'bishop-step', 'quiet extra forward step is blocked and cannot capture', type => position({ ...kings, d4: type, d5: 'P', d6: 'p', c5: 'p' }), (board, square) => {
    assert.ok(!board.moves().includes(square('d4') + square('d6')));
    assert.ok(board.moves().includes(square('d4') + square('c5')));
  });
});

test('Knight pawn brackets distinguish quiet leaps, forward capture directions and full backward captures', t => {
  forVariants(t, 'forward-knight', 'forward captures and quiet retreat', type => position({ ...kings, d4: type, b5: 'p', c6: 'p', e6: 'p', f5: 'p' }), (board, square, version) => {
    for (const to of ['b5', 'c6', 'e6', 'f5']) assert.equal(board.moves().includes(square('d4') + square(to)), version !== 'reduced');
    assert.equal(board.moves().includes(square('d4') + square('d3')), version === 'expanded');
  });
  forVariants(t, 'full-knight', 'forward/backward knight captures', type => position({ ...kings, d4: type, c6: 'p', c2: 'p', b3: 'p', e4: 'p' }), (board, square, version) => {
    assert.ok(board.moves().includes(square('d4') + square('c6')));
    for (const to of ['c2', 'b3']) assert.equal(board.moves().includes(square('d4') + square(to)), version !== 'reduced');
    assert.ok(!board.moves().includes(square('d4') + square('e4')), 'expanded sideways steps are quiet');
  });
  forVariants(t, 'full-knight', 'sideways quiet steps', type => position({ ...kings, d4: type }), (board, square, version) => {
    assert.equal(board.moves().includes(square('d4') + square('e4')), version === 'expanded');
  });
});

test('Rank and Rook pawns use clear sliding paths and bracket their capture ranges', t => {
  forVariants(t, 'rank', 'sideways range and repeatable forward double', type => position({ ...kings, d4: type, a4: 'p' }), (board, square, version) => {
    assert.equal(board.moves().includes(square('d4') + square('a4')), version !== 'reduced');
    assert.equal(board.moves().includes(square('d4') + square('d6')), version === 'expanded');
  });
  forVariants(t, 'rank', 'sideways and forward intermediate blockers', type => position({ ...kings, d4: type, c4: 'P', a4: 'p', d5: 'P' }), (board, square) => {
    for (const to of ['a4', 'd6']) assert.ok(!board.moves().includes(square('d4') + square(to)));
  });
  for (const [target, permitted] of [['c5', ['reduced', 'current', 'expanded']], ['b6', ['current', 'expanded']], ['a7', ['expanded']]]) {
    forVariants(t, 'rook-step', 'forward diagonal capture ' + target, type => position({ ...kings, d4: type, [target]: 'p' }), (board, square, version) => {
      assert.equal(board.moves().includes(square('d4') + square(target)), permitted.includes(version));
      assert.ok(board.moves().includes(square('d4') + square('d2')), 'quiet retreat stays available');
    });
  }
  forVariants(t, 'rook-step', 'diagonal captures cannot jump', type => position({ ...kings, d4: type, c5: 'P', b6: 'p', a7: 'p' }), (board, square) => {
    for (const to of ['b6', 'a7']) assert.ok(!board.moves().includes(square('d4') + square(to)));
  });
});

test('all new pawns retain mandatory QRBN promotion and en-passant is checked by actual removal', t => {
  for (const bracket of L2_PAWN_BRACKETS) for (const variant of bracket.variants) {
    const type = typeFor(contexts.get(variant.id), variant.id);
    both(t, variant.id, 'standard promotion', position({ h1: 'K', h6: 'k', b7: type }), (board, square) => {
      const prefix = square('b7') + square('b8');
      assert.deepEqual(board.moves().filter(move => move.startsWith(prefix)).sort(), ['b', 'n', 'q', 'r'].map(piece => prefix + piece));
      assert.equal(board.push(prefix + 'q'), true);
      assert.equal(pieceMap(board.fen()).get(square('b8')).toLowerCase(), 'q');
    });
    both(t, variant.id, 'actual en-passant capture', position({ h1: 'K', h8: 'k', c5: type, d5: 'p' }, 'w', 'd6'), (board, square) => {
      assert.equal(board.push(square('c5') + square('d6')), true);
      // Quiet diagonal overlap in the current/expanded Bishop pawn suppresses
      // removal in this build; a destination-only test would miss the issue.
      const removes = bracket.key !== 'bishop-step' || variant.key === 'reduced';
      assert.equal(pieceMap(board.fen()).has(square('d5')), !removes);
    });
    both(t, variant.id, 'ordinary pawn captures the custom double-step victim', position({ h1: 'K', h8: 'k', d2: type, e4: 'p' }), (board, square) => {
      assert.equal(board.push(square('d2') + square('d4')), true);
      // Repeated quiet forward ranges suppress the special initial-double
      // marker in this engine, even though the custom pawn remains listed
      // among eligible enPassantTypes. Record that actual rule explicitly.
      const vulnerable = bracket.key !== 'rook-step'
        && !(variant.key === 'expanded' && ['bishop-step', 'rank'].includes(bracket.key));
      assert.equal(board.moves().includes(square('e4') + square('d3')), vulnerable, variant.id + ': ' + board.fen());
      fixtures.push({ context: contexts.get(variant.id), fen: board.fen(), name: variant.id + ': after clear double advance' });
      if (vulnerable) {
        assert.equal(board.push(square('e4') + square('d3')), true);
        assert.ok(!pieceMap(board.fen()).has(square('d4')));
        assert.equal(pieceMap(board.fen()).get(square('d3')).toLowerCase(), 'p');
      }
    });
  }
});

test('range grants stop at blockers, stay nonroyal/nonpromoting and have finite own-half nonchecking drops', t => {
  const variants = [...new Map(L2_GRANT_BRACKETS.flatMap(b => b.variants).map(v => [v.id, v])).values()];
  for (const variant of variants) {
    const definition = getDesign(variant.id), type = typeFor(contexts.get(variant.id), variant.id);
    assert.equal(definition.level, 2);
    assert.deepEqual(definition.roles, { pawn: false, castlingRook: false, enPassant: false });
    both(t, variant.id, 'finite nonchecking drops', position({ h1: 'K', d5: 'k', a3: 'P' }, 'w', '-', type.repeat(3)), (board, square, color) => {
      const drops = board.moves().filter(move => move.startsWith(type + '@'));
      assert.ok(drops.length);
      assert.ok(drops.every(move => color === 'w' ? Number(move[3]) <= 4 : Number(move[3]) >= 5));
      assert.ok(drops.every(move => !/[+#]$/.test(board.san(move))));
      assert.ok(!drops.includes(type + '@' + square('a3')));
      assert.equal(board.push(drops[0]), true);
      assert.equal(pocketLetters(board.fen()).length, 2);
      assert.equal(pieceMap(board.fen()).get(square('h1')).toLowerCase(), 'k');
    });
    both(t, variant.id, 'captured grants do not return', position({ h1: 'K', a8: 'k', d4: type, d8: 'r' }, 'b'), (board, square) => {
      assert.equal(board.push(square('d8') + square('d4')), true);
      assert.equal(pocketLetters(board.fen()), '');
    });
    both(t, variant.id, 'final rank without promotion', position({ h1: 'K', h6: 'k', b7: type, c8: 'p' }), (board, square) => {
      const moves = board.moves().filter(move => move.startsWith(square('b7')) && move[3] === square('b8')[1]);
      assert.ok(moves.length);
      assert.ok(moves.every(move => move.length === 4));
      assert.equal(board.push(moves[0]), true);
      assert.equal(pieceMap(board.fen()).get(moves[0].slice(2, 4)).toUpperCase(), type);
    });
    both(t, variant.id, 'grant cannot capture en passant', position({ h1: 'K', h8: 'k', c5: type, d5: 'p' }, 'w', 'd6'), (board, square) => {
      const move = square('c5') + square('d6');
      if (definition.movement.includes('fceF')) assert.ok(!board.moves().includes(move));
      if (board.moves().includes(move)) {
        assert.equal(board.push(move), true);
        assert.ok(pieceMap(board.fen()).has(square('d5')));
      }
    });
  }
  const quietCounts = { fF: 2, F: 4, F2: 8, F3: 12, W: 4, W2: 8, W3: 12, fW: 1, fW2: 2, fW3: 3, fceF: 0, fmWfceF: 1, fmW2fceF: 2 };
  for (const variant of variants) {
    const type = typeFor(contexts.get(variant.id), variant.id);
    both(t, variant.id, 'exact clear grant range', position({ ...kings, d4: type }), (board, square) => {
      assert.equal(targets(board, square('d4')).length, quietCounts[variant.movement]);
    });
  }
  for (const key of ['grant-long-diagonal', 'grant-orthogonal', 'grant-forward']) {
    const diagonal = key === 'grant-long-diagonal';
    forVariants(t, key, 'range-two blockers', type => position({ ...kings, d4: type, [diagonal ? 'e5' : 'd5']: 'P', [diagonal ? 'f6' : 'd6']: 'p' }), (board, square) => {
      assert.ok(!board.moves().includes(square('d4') + square(diagonal ? 'f6' : 'd6')));
    });
  }
});

test('new level-three bishop alternatives remove knight/camel captures while preserving their quiet jumps', t => {
  for (const candidate of L3_NEW) {
    const type = typeFor(contexts.get(candidate.id), candidate.id), camel = candidate.movement.includes('C');
    const target = camel ? 'g5' : 'f5';
    both(t, candidate.id, 'quiet extra jumps', position({ ...kings, d4: type, e4: 'P', d5: 'P' }), (board, square) => {
      assert.ok(board.moves().includes(square('d4') + square(target)));
    });
    both(t, candidate.id, 'quiet extra jumps cannot capture', position({ ...kings, d4: type, [target]: 'p' }), (board, square) => {
      assert.ok(!board.moves().includes(square('d4') + square(target)));
    });
    if (camel) both(t, candidate.id, 'color-bound bishop and dabbaba captures', position({ ...kings, d4: type, f4: 'p', e4: 'P', c4: 'P' }), (board, square) => {
      assert.ok(board.moves().includes(square('d4') + square('f4')));
      const from = square('d4');
      const parity = value => (value.charCodeAt(0) + Number(value[1])) % 2;
      assert.ok(targets(board, from).every(target => parity(target) === parity(from)));
    });
  }
});

const nativePath = process.env.FAIRY_STOCKFISH_PATH || path.resolve(__dirname, '../node_modules/.cache/levelup-native-values/stockfish');
test('native and browser rules agree on all bracket fixtures and declared capability positions', { skip: !fs.existsSync(nativePath), timeout: 120000 }, async t => {
  let checked = 0;
  for (const context of new Set(contexts.values())) {
    const engine = new UciEngine({ path: nativePath, variantPath: context.ini, variant: context.profile.variant, options: { threads: 1, hashMb: 16 } });
    t.after(() => engine.close());
    await engine.start();
    const positions = new Map([...context.profile.capabilityProbes, ...fixtures.filter(f => f.context === context)].map(fixture => [fixture.fen, fixture]));
    for (const { fen, name } of positions.values()) {
      const board = context.rules.createBoard(fen);
      try { assert.deepEqual(await engine.perft({ fen }), board.moves().sort(), name + ': ' + fen); checked++; }
      finally { board.dispose(); }
    }
    await engine.close();
  }
  t.diagnostic(`${checked} distinct native/browser positions checked across five profiles.`);
});
