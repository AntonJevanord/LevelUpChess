'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const current = require('../scripts/balance/v19-panel-current-plan');
const old = require('../scripts/balance/v19-panel-plan');
const roster = require('../src/designs-v19-panel-ready');
const { makeSchedule } = require('../scripts/balance/plan');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const originalPins = {
  "level1:0": "f80cce5266e63027fc646c9175434077fffc794a6af47f83a78951494151f03f",
  "level1:1": "8b5d94880cea6bf944e3d892f0dc791d1421a8001e252b47e1e8df1e9b05f677",
  "level1:2": "0d26b5ac8e08344e27c848a578a69298590cc4725aaed034e6d25d0104712ebf",
  "level1:3": "241b09c7d38e93a28257f2cc2cbd4803511764fdfc42591c3ffcec32a2b2a4bb",
  "level1:4": "04f4bce0ac5fea5ee85b2519374c34bb74b5dc1c1930b3a82948ccb4e48f9f32",
  "level1:5": "6335c7f253bdf808ef26d65deb39e751c4e6056ca22e9c369863ffb9c2608526",
  "level1:6": "988128ee17f12aa760a0ccae53477421526466eee83794d857a076e290fc387c",
  "level1:7": "e70510f3d82f1a6455d3b08024f5962b307ae55c7d071206b9c99cbf11475f08",
  "level2:0": "1e2734c6068fd6e8f524aa037a8294f067c8118f1edb6ea613d4d624cb1b3b6c",
  "level2:1": "8e299b86b20d9d933c88bb7ed5305828f2402d21529eda45989d9fa3ab2ffcfe",
  "level2:2": "de9776f37c426fe4fbd0d0f0760d3e5f5949e454ff80153b04f610f6bb006a21",
  "level2:3": "f32c40b968da32d113df47918fff076077d36992488bcbbb70022da0f94c4fde",
  "level2:4": "6d09439ba75795a575214efde403f2549adcf62d2ad7dfcdf8928dc8a0df1378",
  "level2:5": "0382d1e9f4e261ced45651bf6830f3860ef8f4d8d920e1b857b0719432306426",
  "level2:6": "d6f062dc6ebef669cd460cde9385616de854822df74f79b687015fac68eb3f4a",
  "level2:7": "3da2df5056ac1b5765aa21031c259be89194e073b4445e8b4dd998bd4e02ba37",
  "level3:0": "f2f4834032d7a36359f014596092d0ae16174d4b248a60c50aac2c0b8f73be05",
  "level3:1": "56029428002e1307deb488b2915454674948b1ce895b39e88db2623b925c2365",
  "level3:2": "4c1aac893a3816074127e324d46cba946abdddf58c80ddf71abe92d8ca1387f6",
  "level3:3": "4f6b1a6e4745e2881e587cb1ac3f477050e4ee6a90abd97171d86d682dcb0ca5",
  "level3:4": "3de05811994460ab08694a9b294476e41b1e2f9f7473dd62749bb07a7981e3ef",
  "level3:5": "7d2d989304ab9a71eb67762724b488ecb112cdb0fa6e110c65c0e26680c28a7c",
  "level3:6": "1715a1819b51cb83d5e27ae31283df51a54708958af05b26ba457378e7bc5876",
  "level3:7": "1591a0dcf6ea7ba8378b582af871f930ac543a0e83a7bd3b30411d99b36bab69"
};
function context(plan = current, study = 'level1', batchIndex = 0) {
  const declaration = plan.getBatchDeclaration(study, batchIndex), schedule = makeSchedule(declaration.config);
  const registry = createDesignRegistry(declaration.config), profile = compileDesignProfile(registry, declaration.config.evaluation);
  const records = schedule.map(game => ({ ...game, attempt: 1, status: 'completed', result: '1/2-1/2', reason: 'threefold-repetition',
    profileHash: profile.hash, registryHash: registry.hash, variant: profile.variant, registryReference: 'run.json#designRegistry',
    engine: declaration.config.engine, evaluation: declaration.config.evaluation, whiteStrength: { skill: 20 }, blackStrength: { skill: 20 } }));
  return { batchIndex, nodes: 40000, records, declaration, schedule, registry, profile,
    manifest: { runId: `synthetic-${study}-${batchIndex}`, config: declaration.config, schedule, designRegistry: registry, designProfile: profile } };
}

test('the original revision-002 reader retains all 24 declared configurations, schedules and semantic profiles', () => {
  for (const study of old.STUDIES) for (let batchIndex = 0; batchIndex < 8; batchIndex++) {
    const { declaration, schedule, registry, profile } = context(old, study, batchIndex);
    assert.equal(sha({ declaration, schedule, registry, profile }), originalPins[`${study}:${batchIndex}`]);
  }
  assert.equal(old.FORMAT, 'levelup-v19-tier-panels');
  assert.equal(old.expectedGames('level2', 16), 1760);
  assert.equal(old.expectedGames('level3', 16), 1760);
});

test('fresh panels use all selected bodies and unchanged references in an explicit 40k-node revision-004 context', () => {
  assert.equal(current.FORMAT, 'levelup-v19-tier-panels-004');
  assert.equal(current.NODES, 40000);
  const ids = study => current.candidates(study).map(row => row.id);
  assert.ok(ids('level1').includes('queen.level1-wide-forward-knight@1'));
  assert.ok(!ids('level1').includes('queen.level1-tall-knight@1'));
  assert.ok(ids('level2').includes('pawn.level2-forward-queen-only@1'));
  assert.ok(ids('level3').includes('pawn.level3-six-knight@1'));
  assert.ok(ids('level3').includes('pawn.queen-sideways@1'));
  assert.ok(ids('level3').includes('pawn.purple@13'));
  for (const [study, count, expected] of [['level1', 11, 1760], ['level2', 12, 2112], ['level3', 12, 2112]]) {
    const campaign = current.buildCampaignPlan({ study, jobs: 4 });
    assert.equal(campaign.roster.length, count); assert.equal(campaign.stages.length, 8);
    assert.equal(current.expectedGames(study, 16), expected);
    assert.equal(current.expectedGames(study, 32), expected * 2);
    assert.equal(current.expectedGames(study, 64), expected * 4);
    assert.equal(current.selectedStages(16, campaign).length, 2);
    assert.equal(current.selectedStages(32, campaign).length, 4);
    assert.deepEqual(campaign.rosterReceipt, roster.getRosterReceipt());
    assert.match(campaign.rosterReceipt.file, /v19-roster-004\.json$/);
    assert.deepEqual(current.references(study).map(row => row.id), old.references(study).map(row => row.id));
    const stage = context(current, study);
    assert.equal(stage.registry.definitions.length, count);
    assert.equal(stage.schedule.length, expected / 2);
    const pairs = new Map();
    for (const game of stage.schedule) {
      const group = pairs.get(game.pairId) || []; group.push(game.aColor); pairs.set(game.pairId, group);
      assert.equal(stage.declaration.config.engine.nodes, 40000);
    }
    for (const colors of pairs.values()) assert.deepEqual(colors.sort(), ['b', 'w']);
    for (const candidate of campaign.roster) {
      assert.equal(candidate.count, 1); assert.equal(candidate.upgradePoints, Number(study.at(-1)));
      assert.equal(Object.keys(candidate.army.upgrades).length + (candidate.army.reserve?.reduce((sum, item) => sum + item.count, 0) || 0), 1);
    }
    assert.throws(() => current.getBatchDeclaration(study, 0, 20000));
    assert.throws(() => current.getBatchDeclaration(study, 0, 80000));
  }
});

test('current reporting preserves paired outcomes, fixed-reference baskets and recorded opening diagnostics', () => {
  const stage = context(current, 'level3'), report = current.reportStudy({ study: 'level3', targetOpenings: 8 }, [stage]);
  assert.equal(report.format, 'levelup-v19-tier-panel-report-004');
  assert.equal(report.scheduledGames, 1056); assert.equal(report.progress.completePairs, 528);
  assert.equal(report.rows.length, 12); assert.ok(report.rows.every(row => row.allOpponents.score === 0.5));
  const pawn = report.rows.find(row => row.id === 'pawn.level3-six-knight@1');
  assert.equal(pawn.fixedReferences.opponents.length, 4);
  assert.equal(pawn.allOpponents.openingCoverage.shared, 8);
  assert.equal(report.openingEvaluations.counts.missing, 1056);
  const markdown = current.renderReport(report);
  assert.match(markdown, /Roster revision 004/); assert.match(markdown, /six-jump/i); assert.match(markdown, /Opening evaluations/);
  const truncated = structuredClone(stage); Object.assign(truncated.records[0], { status: 'truncated', result: '*', reason: 'max-plies' });
  assert.equal(current.reportStudy({ study: 'level3', targetOpenings: 8 }, [truncated]).progress.completePairs, 527);
  assert.throws(() => current.reportStudy({ study: 'level3', targetOpenings: 8 }, [stage, stage]), /repeated/);
});

test('an earlier stage cannot be silently reinterpreted as the selected roster', () => {
  for (const study of ['level1', 'level2', 'level3']) {
    const earlier = context(old, study);
    assert.throws(() => current.reportStudy({ study, targetOpenings: 8 }, [earlier]), /semantic profile/);
    assert.equal(old.reportStudy({ study, targetOpenings: 8 }, [earlier]).rows.length, 11);
  }
});

test('the public controller defaults to the selected plan without starting match games during checks', async () => {
  const calls = [];
  const result = await require('../scripts/v19-panels').runStudy(['--tier', '3', '--check', '--rules-only', '--openings', '8'], {
    log() {}, check: async declaration => { calls.push(declaration); },
    run() { assert.fail('a check cannot start games'); }, persist() { assert.fail('a check cannot write game evidence'); },
  });
  assert.equal(result.checked, true); assert.equal(calls.length, 1);
  assert.equal(calls[0].metadata.scheduledGames, 1056);
  assert.ok(calls[0].metadata.rows.some(row => row.key === roster.getTierRoster(3).find(body => body.id === 'pawn.level3-six-knight@1').key));
});
