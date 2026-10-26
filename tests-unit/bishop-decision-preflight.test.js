'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getDecisionProtocol, createDecisionPlan } = require('../scripts/balance/bishop-decision-plan');
const { checkDecisionStage, PROMOTION_PROBES } = require('../scripts/balance/bishop-decision-preflight');

const ROOT = path.resolve(__dirname, '..');
const copy = value => structuredClone(value);
const FIELDS = ['rawMg', 'rawEg', 'captureMg', 'captureEg', 'evalMg', 'evalEg'];
const MOVE = 'a2a3';
const archived = name => JSON.parse(fs.readFileSync(path.join(ROOT, `experiments/balance/results/${name}-preflight-001.json`))).native.pieceValues;

let campaignPromise;
function campaign() {
  return campaignPromise ||= createDecisionPlan({ rulesFactory: async () => ({ createBoard() {
    return { outcome: () => null, dispose() {} };
  } }) });
}

async function fixture(t, options = {}) {
  const library = getDecisionProtocol(), plans = await campaign();
  const plan = plans.stages.find(stage => stage.key === (options.key || 'compare')).plan;
  const before = archived('bishop-reference'), restore = archived('reference-revisions');
  const current = copy(before);
  for (const letter of ['m', 'M']) current.pieces[letter] = Object.fromEntries(FIELDS.map(field => [field, field.endsWith('Mg') ? 1858 : 1903]));
  const inventories = new Map([[library.profile.variant, current], [library.old.profile.variant, before], [library.revision.profile.variant, restore]]);
  const calls = { engines: [], starts: [], closes: [], perfts: [], commands: [], searches: 0, newGames: 0, boards: 0, disposed: 0 };
  const rulesFactory = async ({ profile }) => ({ variant: profile.variant, capabilityProbes: profile.capabilityProbes,
    createBoard(fen) {
      calls.boards++;
      const fields = fen.split(' '), initial = [...fields]; let moves = 0;
      return { fen() { const result = [...initial]; result[4] = String(Number(initial[4]) + moves); result[5] = String(Number(initial[5]) + moves); return result.join(' '); },
        push() { moves++; return !options.badReplay; },
        outcome: () => options.terminal ? { result: '1-0', reason: 'checkmate' } : null,
        moves: () => options.browserMismatch && profile.variant === library.profile.variant ? ['b2b3'] : [MOVE],
        dispose() { calls.disposed++; } };
    } });
  const engineFactory = parameters => {
    calls.engines.push(parameters);
    const engine = { metadata: { idname: 'fixture-native' },
      async start({ signal }) { assert.equal(fs.readFileSync(parameters.variantPath, 'utf8'), [...inventories.keys()].includes(parameters.variant)
        ? [library.profile, library.old.profile, library.revision.profile].find(profile => profile.variant === parameters.variant).config : '');
        calls.starts.push(parameters.variant); await options.onStart?.({ signal, parameters }); return this.metadata; },
      async pieceValues() { const values = copy(inventories.get(parameters.variant)); options.mutateValues?.(values, parameters.variant, library); return values; },
      async perft({ fen, signal }) {
        calls.perfts.push({ fen, variant: parameters.variant });
        await options.onPerft?.({ fen, signal, parameters });
        return options.nativeMismatch?.(fen, parameters.variant, library) ? ['b2b3'] : [MOVE];
      },
      async _run(signal, operation) { return operation(); },
      async _exchange(commands, receive) {
        calls.commands.push({ commands, variant: parameters.variant });
        let result;
        const changed = options.staticMismatch && parameters.variant === library.profile.variant;
        const inCheck = options.inCheck || options.inCheckFen?.(commands[0].slice('position fen '.length));
        receive(inCheck ? 'Final evaluation: none (in check)' : `Final evaluation: ${changed ? '2.00' : '1.00'}`, value => { result = value; });
        receive('readyok', value => { result = value; });
        return result;
      },
      async search() { calls.searches++; throw new Error('Preflight must never search.'); },
      async newGame() { calls.newGames++; throw new Error('Preflight must never start a game.'); },
      async close() { calls.closes.push(parameters.variant); if (options.closeError) throw new Error('cleanup failure'); },
    };
    return engine;
  };
  t.after(() => {
    for (const parameters of calls.engines) assert.equal(fs.existsSync(path.dirname(parameters.variantPath)), false, 'temporary INI directories must be removed');
    assert.equal(calls.boards, calls.disposed, 'every browser board must be disposed');
  });
  return { library, plan, calls, current, before, restore,
    services: { plan, enginePath: process.execPath, engineFactory, rulesFactory } };
}

test('compare diagnoses both profiles, every start and role probe without starting searches or games', async t => {
  const f = await fixture(t), result = await checkDecisionStage(f.services);
  assert.equal(result.engineName, 'fixture-native');
  assert.equal(result.startingPositions, 1280);
  assert.equal(result.roleProbes, 2);
  assert.equal(result.searchesStarted, 0);
  assert.equal(result.compatibility.passed, true);
  assert.equal(result.compatibility.profileIdentical, false);
  assert.equal(result.compatibility.comparedPieceTypes, 18);
  assert.equal(result.compatibility.comparedColorEntries, 36);
  assert.equal(result.compatibility.comparedValueFields, 216);
  assert.equal(result.compatibility.currentPieceTypes, 19);
  assert.equal(result.compatibility.sourceGames, 1280);
  assert.equal(result.compatibility.staticEvaluation.positions, 30);
  assert.equal(result.compatibility.legalMoves.positions, 30);
  assert.equal(result.compatibility.historicalCollectionManifestSupplied, false);
  assert.equal(result.compatibility.historicalProcessIdentityVerified, false);
  assert.deepEqual(new Set(f.calls.starts), new Set([f.library.profile.variant, f.library.old.profile.variant]));
  assert.equal(f.calls.closes.length, 2);
  assert.equal(f.calls.searches, 0); assert.equal(f.calls.newGames, 0);
  assert.ok(f.calls.engines.every(parameters => parameters.options.skill === 20 && parameters.options.threads === 1 && parameters.options.hash === 32));
  const currentFens = new Set(f.calls.perfts.filter(call => call.variant === f.plan.profile.variant).map(call => call.fen));
  for (const game of f.plan.schedule) assert.ok(currentFens.has(game.startFen), game.id);
  for (const probe of [...f.plan.profile.capabilityProbes, ...PROMOTION_PROBES]) assert.ok(currentFens.has(probe.fen), probe.name);
  assert.ok(f.calls.commands.every(call => call.commands[1] === 'eval' && call.commands[2] === 'isready'));
  const sampled = new Set(result.compatibility.staticEvaluation.samples.map(sample => sample.gameId));
  const records = f.library.bishopRecords.filter(row => sampled.has(row.id));
  assert.equal(new Set(records.map(row => row.comparisonId)).size, 5);
  for (const comparison of new Set(records.map(row => row.comparisonId))) {
    assert.deepEqual(new Set(records.filter(row => row.comparisonId === comparison).map(row => row.aColor)), new Set(['w', 'b']));
  }
});

test('restore uses one native process, exact archived ten-type values and ten recovered history diagnostics', async t => {
  const f = await fixture(t, { key: 'restore' }), result = await checkDecisionStage(f.services);
  assert.equal(result.startingPositions, 192);
  assert.equal(result.compatibility.profileIdentical, true);
  assert.equal(result.compatibility.comparedPieceTypes, 16);
  assert.equal(result.compatibility.currentPieceTypes, 16);
  assert.equal(result.compatibility.sourceGames, 320);
  assert.equal(result.compatibility.staticEvaluation.positions, 10);
  assert.equal(result.compatibility.legalMoves.positions, 10);
  assert.deepEqual(result.pieceValues, f.restore);
  assert.equal(f.calls.starts.length, 1); assert.equal(f.calls.closes.length, 1);
  assert.equal(f.calls.searches, 0); assert.equal(f.calls.newGames, 0);
  const checked = new Set(f.calls.perfts.map(call => call.fen));
  for (const game of f.plan.schedule) assert.ok(checked.has(game.startFen));
});

test('modified movement, profile policy or engine limits reject before creating an engine', async t => {
  const f = await fixture(t);
  for (const mutate of [plan => { plan.settings.nodes = 1; }, plan => { plan.profile.config += '\n'; },
    plan => { plan.profile.registry.definitions.find(row => row.id === 'bishop.purple@13').movement = 'BN'; },
    plan => { plan.profile.evaluation.pieceValues['bishop.purple@13'] = { mg: 1858, eg: 1903 }; }]) {
    const plan = copy(f.plan); mutate(plan);
    await assert.rejects(checkDecisionStage({ ...f.services, plan }), /stage changed/);
  }
  assert.equal(f.calls.engines.length, 0);
});

test('every new bishop raw, capture and evaluation field must retain its declared native values', async t => {
  for (const field of FIELDS) {
    const f = await fixture(t, { mutateValues(values, variant, library) {
      if (variant === library.profile.variant) for (const letter of ['m', 'M']) values.pieces[letter][field]++;
    } });
    await assert.rejects(checkDecisionStage(f.services), /New bishop native value changed/);
    assert.equal(f.calls.closes.length, 1);
    assert.equal(f.calls.perfts.length, 0);
  }
});

test('all retained values are checked against the archive in both fresh old and extended profiles', async t => {
  for (const changedProfile of ['old', 'new']) {
    const f = await fixture(t, { mutateValues(values, variant, library) {
      if (variant === (changedProfile === 'old' ? library.old.profile.variant : library.profile.variant)) {
        for (const letter of ['z', 'Z']) values.pieces[letter].captureEg++;
      }
    } });
    await assert.rejects(checkDecisionStage(f.services), /Archived native value changed/);
    assert.equal(f.calls.closes.length, changedProfile === 'old' ? 2 : 1);
    assert.equal(f.calls.searches, 0);
  }
});

test('restore rejects changed archived values even when both colors agree', async t => {
  const f = await fixture(t, { key: 'restore', mutateValues(values) {
    for (const letter of ['f', 'F']) values.pieces[letter].evalMg++;
  } });
  await assert.rejects(checkDecisionStage(f.services), /Archived native value changed/);
  assert.equal(f.calls.closes.length, 1);
});

test('missing, asymmetric, nonpositive and noninteger native inventories reject before perft', async t => {
  for (const mutate of [values => { delete values.pieces.m; }, values => { values.pieces.M.evalEg++; },
    values => { for (const letter of ['m', 'M']) values.pieces[letter].rawMg = 0; },
    values => { for (const letter of ['m', 'M']) values.pieces[letter].rawMg = 1.5; },
    values => { for (const letter of ['m', 'M']) values.pieces[letter].rawMg = NaN; },
    values => { for (const letter of ['p', 'P']) values.pieces[letter].rawMg++; },
    values => { for (const letter of ['u', 'U']) values.pieces[letter].evalMg++; },
    values => { for (const letter of ['g', 'G']) values.pieces[letter].captureEg++; }]) {
    const f = await fixture(t, { mutateValues: mutate });
    await assert.rejects(checkDecisionStage(f.services), /inventory|native value|asymmetric/);
    assert.equal(f.calls.perfts.length, 0);
    assert.equal(f.calls.closes.length, 1);
  }
});

test('old/new static mismatches, native moves and browser moves reject compatibility', async t => {
  for (const options of [{ staticMismatch: true }, { browserMismatch: true },
    { nativeMismatch: (fen, variant, library) => variant === library.old.profile.variant }]) {
    const f = await fixture(t, options);
    await assert.rejects(checkDecisionStage(f.services), /static evaluation changed|legal moves changed/);
    assert.equal(f.calls.closes.length, 2);
  }
});

test('unreplayable histories and too few non-check static positions refuse compatibility', async t => {
  const f = await fixture(t, { badReplay: true });
  await assert.rejects(checkDecisionStage(f.services), /Cannot replay parent static diagnostic/);
  const g = await fixture(t, { inCheck: true });
  await assert.rejects(checkDecisionStage(g.services), /Too few evaluable/);
});

test('accepted static samples must cover both colors of every old bishop matchup', async t => {
  const library = getDecisionProtocol(), record = library.bishopRecords[0];
  const positions = new Set(library.bishopRecords.filter(row => row.comparisonId === record.comparisonId && row.aColor === record.aColor)
    .map(row => row.startFen.split(' ').slice(0, 4).join(' ')));
  const f = await fixture(t, { inCheckFen: fen => positions.has(fen.split(' ').slice(0, 4).join(' ')) });
  await assert.rejects(checkDecisionStage(f.services), /both colors of every retained matchup/);
  assert.equal(f.calls.closes.length, 2);
});

test('later opening blocks supply bounded static samples when the first block is in check', async t => {
  for (const key of ['restore', 'compare']) {
    const library = getDecisionProtocol(), source = key === 'restore' ? library.restoredRecords : library.bishopRecords;
    const firstOpening = [...new Set(source.map(record => record.openingId))].sort()[0];
    const firstBlock = source.filter(record => record.openingId === firstOpening);
    const positions = new Set(firstBlock.map(record => record.startFen.split(' ').slice(0, 4).join(' ')));
    const f = await fixture(t, { key, inCheckFen: fen => positions.has(fen.split(' ').slice(0, 4).join(' ')) });
    const result = await checkDecisionStage(f.services), samples = result.compatibility.staticEvaluation.samples;
    assert.equal(samples.length, key === 'restore' ? 10 : 30);
    assert.equal(result.compatibility.candidateOpeningIds.length, 3);
    assert.ok(samples.every(sample => !firstBlock.some(record => record.id === sample.gameId)));
    assert.ok(samples.every(sample => source.some(record => record.id === sample.gameId)));
  }
});

test('stage starts and promotion perft remain compulsory after compatibility', async t => {
  const first = await fixture(t);
  const target = first.plan.schedule.at(-1).startFen;
  for (const fen of [target, PROMOTION_PROBES[0].fen]) {
    const f = await fixture(t, { nativeMismatch: value => value === fen });
    await assert.rejects(checkDecisionStage(f.services), /decision start/);
    assert.equal(f.calls.closes.length, 2);
  }
});

test('abort before startup and during diagnostics closes all processes and removes temporary files', async t => {
  const early = new AbortController(); early.abort();
  const f = await fixture(t);
  await assert.rejects(checkDecisionStage({ ...f.services, signal: early.signal }), { name: 'AbortError' });
  assert.equal(f.calls.engines.length, 0);
  const active = new AbortController();
  const g = await fixture(t, { onPerft() { active.abort(); } });
  await assert.rejects(checkDecisionStage({ ...g.services, signal: active.signal }), { name: 'AbortError' });
  assert.equal(g.calls.closes.length, 2);
});

test('startup failures and cleanup failures still remove temporary INI files', async t => {
  const f = await fixture(t, { onStart() { throw new Error('startup failure'); } });
  await assert.rejects(checkDecisionStage(f.services), /startup failure/);
  assert.equal(f.calls.closes.length, 1);
  const g = await fixture(t, { closeError: true });
  await assert.rejects(checkDecisionStage(g.services), /cleanup failure/);
  assert.equal(g.calls.closes.length, 2);
});
