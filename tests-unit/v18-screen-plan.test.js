'use strict';

// Synthetic outcomes and rules diagnostics only; no scientific match games.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { ensureResearchOverlay } = require('../scripts/balance/research-overlay');
const rootCatalog = require('../src/design-catalog');
const promoted = new Map(require('../src/designs-v19-selected').NEW_DEFINITIONS.map(definition => [definition.id, definition]));
const overlay = ensureResearchOverlay({ name: 'v18-screen-plan-test', entryFile: 'scripts/v18-balance.js', definitionFile: 'src/balance-designs-v18-screen.js' });
const plan = require(path.join(overlay.directory, 'scripts/balance/v18-screen-plan'));
const { makeSchedule } = require(path.join(overlay.directory, 'scripts/balance/plan'));
const { createDesignRegistry } = require(path.join(overlay.directory, 'scripts/balance/design-registry'));
const { compileDesignProfile } = require(path.join(overlay.directory, 'scripts/balance/design-profile'));
const sha = value => createHash('sha256').update(value).digest('hex');

function context(study, batchIndex = 0, nodes = 40000) {
  const declaration = plan.getBatchDeclaration(study, batchIndex, nodes), schedule = makeSchedule(declaration.config);
  const registry = createDesignRegistry(declaration.config), profile = compileDesignProfile(registry, declaration.config.evaluation);
  return { study, batchIndex, nodes, declaration, profile, registry, schedule,
    manifest: { runId: `synthetic-${study}-${batchIndex}-${nodes}`, config: declaration.config, schedule,
      designRegistry: registry, designProfile: profile } };
}
function recordsFor(input) {
  const cells = new Map(input.declaration.metadata.comparisons.map(cell => [cell.id, cell]));
  return input.schedule.map(game => {
    const key = cells.get(game.comparisonId).aKey;
    const score = key.endsWith('-control') ? game.aColor === 'w' ? 0 : 0.5 : game.aColor === 'w' ? 1 : 0;
    return { ...game, attempt: 1, status: 'completed',
      result: score === 0.5 ? '1/2-1/2' : (score === 1) === (game.aColor === 'w') ? '1-0' : '0-1',
      reason: score === 0.5 ? 'threefold-repetition' : 'checkmate', profileHash: input.profile.hash,
      registryHash: input.registry.hash, variant: input.profile.variant, registryReference: 'run.json#designRegistry',
      engine: input.declaration.config.engine, evaluation: input.declaration.config.evaluation,
      whiteStrength: { skill: 20 }, blackStrength: { skill: 20 } };
  });
}
function source(input, records = recordsFor(input)) {
  return { batchIndex: input.batchIndex, nodes: input.nodes, manifest: input.manifest, records };
}

test('unselected trials remain isolated, selected promotions keep exact definitions and historical artifacts survive', () => {
  assert.equal(rootCatalog.getDesign('knight.nightrider-quiet-diagonal@1'), undefined);
  assert.equal(rootCatalog.getDesign('queen.wraith-side-through@1'), undefined);
  for (const id of ['knight.level2-nh@1', 'knight.level2-ndh@1', 'knight.nightrider-level2@1']) assert.deepEqual(rootCatalog.getDesign(id), promoted.get(id));
  for (const id of ['queen.level1-camel-capture@1', 'queen.level1-forward-knight@1',
    'queen.level1-forward-half-knight@1', 'queen.level2-side-knight@1', 'queen.level2-tall-knight@1',
    'knight.level2-nd@1', 'knight.level2-nd-quiet-king@1']) assert.deepEqual(rootCatalog.getDesign(id), promoted.get(id));
  for (const source of ['queens', 'level2', 'level3']) {
    for (const definition of require(`../src/balance-designs-v18-prepanel-${source}`).NEW_DEFINITIONS) {
      assert.deepEqual(rootCatalog.getDesign(definition.id), promoted.get(definition.id));
    }
  }
  assert.throws(() => require('../scripts/balance/v18-screen-plan').candidates('mobility'), /isolated research runtime/);
  assert.equal(rootCatalog.getDesign('knight.purple@4').movement, 'N0');
  assert.equal(rootCatalog.getDesign('queen.purple@7').movement, 'QgB0');
  for (const row of overlay.manifest.baseInventory.filter(row => row.file === 'dist/balance-rules.cjs'
    || /^src\/playable.*-profile\.json$/.test(row.file) || /^variants\//.test(row.file))) {
    const bytes = fs.readFileSync(path.join(__dirname, '..', row.file));
    assert.equal(sha(row.kind === 'raw' ? bytes : bytes.toString('utf8').replace(/\r\n/g, '\n')), row.sha256, row.file);
  }
});

test('all targets freeze distinct paired stages and extending does not repeat the first eight cases', () => {
  const totals = { level1: [432, 3456], level2: [384, 3072], mobility: [1024, 8192],
    'level1-followup': [384, 3072], 'level2-followup': [432, 3456], 'level2-knights': [240, 1920],
    'level1-queens': [192, 1536], 'level2-completion': [336, 2688],
    'prepanel-level1': [96, 768], 'prepanel-level2': [432, 3456], 'prepanel-level3': [512, 4096] };
  for (const study of plan.STUDIES) {
    const campaign = plan.buildCampaignPlan({ study, jobs: 4 });
    assert.equal(plan.expectedGames(study, 8), totals[study][0]);
    assert.equal(campaign.games, totals[study][1]);
    assert.deepEqual(plan.selectedStages(8, campaign), plan.selectedStages(16, campaign).slice(0, campaign.nodes.length));
    assert.deepEqual(campaign.nodes, study === 'mobility' ? [40000, 80000] : [40000]);
    for (const stage of campaign.stages) {
      const input = context(study, stage.batchIndex, stage.nodes);
      assert.ok(input.registry.definitions.length <= 20);
      assert.equal(input.schedule.length, stage.games);
      assert.equal(new Set(input.schedule.map(game => game.pairId)).size, stage.games / 2);
      assert.equal(input.profile.hash, stage.profileHash);
      assert.equal(sha(JSON.stringify(input.schedule)), stage.scheduleSha256);
    }
    const a = context(study), b = context(study, 1);
    assert.equal(a.profile.hash, b.profile.hash);
    const firstIds = new Set(a.schedule.map(game => game.id));
    assert.ok(b.schedule.every(game => !firstIds.has(game.id)));
  }
  for (const openings of [1, 7, 12, 128]) assert.throws(() => plan.expectedGames('level1', openings));
  assert.throws(() => plan.buildCampaignPlan({ study: 'other' }));
  assert.throws(() => plan.buildCampaignPlan({ study: 'level1', jobs: 0 }));
});

test('same-tier opponents and purchase budgets preserve queen singles and native minor pairs', () => {
  for (const study of ['level1', 'level2', 'level1-followup', 'level2-followup', 'level2-knights', 'level1-queens', 'level2-completion']) {
    const rows = plan.candidates(study), comparisons = plan.matches(study);
    const expected = { level1: 9, level2: 8, 'level1-followup': 8, 'level2-followup': 9, 'level2-knights': 5,
      'level1-queens': 4, 'level2-completion': 7 }[study];
    assert.equal(rows.length, expected);
    assert.equal(comparisons.length, expected * 3);
    assert.equal(plan.references(study).length, 3);
    for (const row of rows) {
      const l1 = study.startsWith('level1');
      const count = l1 && row.family !== 'queen' ? 2 : 1;
      assert.equal(Object.keys(row.army.upgrades).length, count);
      assert.equal(row.upgradePoints, count * (l1 ? 1 : 2));
      for (const cell of comparisons.filter(cell => cell.aKey === row.key)) {
        const upgrades = Object.keys(cell.armyB.upgrades).length;
        const reserve = (cell.armyB.reserve || []).reduce((sum, entry) => sum + entry.count, 0);
        assert.equal(upgrades + reserve, l1 ? count : 1);
      }
    }
  }
  assert.equal(plan.references('level2')[0].id, 'pawn.knight-tall-quiet@1');
  assert.ok(!plan.references('level2').some(row => row.id === 'pawn.orange@3'));
  const mobile = plan.matches('mobility');
  assert.equal(mobile.length, 32);
  assert.ok(mobile.every(cell => ['vanguard', 'unicorn', 'cruisader', 'amazon'].includes(cell.bKey)));
});

test('priors preserve frozen references and explicitly control quiet movement inflation', () => {
  const l1 = plan.getBatchDeclaration('level1', 0, 40000).config.evaluation.pieceValues;
  const revised = plan.candidates('level1');
  assert.deepEqual(revised.map(row => row.movement).sort(), ['NmR', 'NW', 'NvWvD', 'BgB', 'BsW', 'RmBgmR0', 'RmBgmQ0', 'RceF', 'QmN'].sort());
  for (const [movement, value] of [
    ['NmR', { mg: 972, eg: 1093 }], ['NW', { mg: 984, eg: 1105 }],
    ['BgB', { mg: 1480, eg: 1302 }], ['RmBgmR0', { mg: 1716, eg: 1636 }],
    ['RmBgmQ0', { mg: 1716, eg: 1636 }], ['QmN', { mg: 2771, eg: 2833 }],
  ]) assert.deepEqual(l1[revised.find(row => row.movement === movement).id], value);
  const lower = plan.getBatchDeclaration('level2', 0, 40000).config.evaluation.pieceValues;
  assert.deepEqual(lower['pawn.knight-tall-quiet@1'], { mg: 536, eg: 592 });
  assert.deepEqual(lower['rook.orange@2'], { mg: 1904, eg: 1959 });
  assert.deepEqual(lower['rook.orange@2'], lower['rook.orange@3']);
  const inventory = require('../experiments/designs/v18-screen-values.json');
  assert.deepEqual(inventory.values.find(row => row.id === 'rook.orange@2').automatic, { mg: 3146, eg: 3944 });
  for (const nodes of [40000, 80000]) {
    const values = plan.getBatchDeclaration('mobility', 0, nodes).config.evaluation.pieceValues;
    for (const row of plan.candidates('mobility')) assert.deepEqual(values[row.id], row.family === 'knight' ? { mg: 2326, eg: 2211 } : { mg: 3772, eg: 3470 });
    for (const reference of plan.references('mobility')) assert.deepEqual(values[reference.id], reference.engineValue);
  }
});

test('cumulative reports include percentages, physical colors, budgets, shared cases and fixed batches', () => {
  const a = context('level1'), b = context('level1', 1);
  const report = plan.reportStudy({ study: 'level1', targetOpenings: 16, runId: 'synthetic' }, [source(a), source(b)]);
  assert.equal(report.scheduledGames, 864);
  const stage = report.reports[0];
  assert.equal(stage.report.progress.pairedGames, 864);
  assert.ok(stage.rows.every(row => row.score === 0.5 && row.openingCoverage.shared === 16));
  assert.deepEqual(report.sources.map(row => row.runId), [a.manifest.runId, b.manifest.runId]);
  assert.equal(report.sources[0].profileHash, a.profile.hash);
  assert.deepEqual(stage.rows[0].physicalColors.map(color => color.score), [1, 0]);
  assert.equal(stage.cohorts.length, 2); assert.equal(stage.cohorts[0].rows[0].openingCoverage.shared, 8);
  assert.equal(stage.rows.find(row => plan.candidates('level1').find(body => body.key === row.key).family === 'queen').upgradePoints, 1);
  assert.equal(stage.rows.find(row => plan.candidates('level1').find(body => body.key === row.key).movement === 'NmR').upgradePoints, 2);
  assert.equal(stage.rows[0].conditionalRange.available, true);
  const markdown = plan.renderReport(report);
  for (const term of ['50.00%', 'White', 'Black', 'Cases 1–8', 'Cases 9–16', 'Frozen search priors']) assert.ok(markdown.includes(term), term);
});

test('new quiet/body gains use common complete opening blocks with fresh family controls', () => {
  const input = context('mobility');
  const records = recordsFor(input);
  const report = plan.reportStudy({ study: 'mobility', targetOpenings: 8, runId: 'synthetic' }, [source(input, records)]);
  const stage = report.reports[0];
  assert.equal(stage.gains.length, 6);
  assert.ok(stage.gains.every(gain => gain.sharedOpenings === 8 && gain.difference === 0.25));
  assert.equal(report.reports[1].rows[0].score, null);
  assert.ok(report.reports[1].rows[0].flags.includes('partial screen'));
  const altered = structuredClone(records);
  const record = altered.find(row => row.comparisonId.startsWith('nightrider-control-'));
  record.status = 'truncated'; record.result = '*';
  const revised = plan.reportStudy({ study: 'mobility', targetOpenings: 8 }, [source(input, altered)]);
  assert.ok(revised.reports[0].gains.filter(gain => gain.control === 'nightrider-control').every(gain => gain.sharedOpenings === 7));
  assert.ok(revised.reports[0].gains.filter(gain => gain.control === 'wraith-control').every(gain => gain.sharedOpenings === 8));
  assert.ok(revised.reports[0].rows.find(row => row.key === 'nightrider-control').flags.includes('partial screen'));
});

test('journal duplicates add no weight and foreign stages, nodes, openings and contexts fail visibly', () => {
  const input = context('level2'), records = recordsFor(input), manifest = { study: 'level2', targetOpenings: 8 };
  const duplicate = plan.reportStudy(manifest, [source(input, [...records, records[0]])]);
  assert.equal(duplicate.reports[0].report.progress.pairedGames, 384);
  assert.throws(() => plan.reportStudy(manifest, [source(input), source(input)]), /repeated/);
  assert.throws(() => plan.reportStudy(manifest, [source(context('level2', 1))]), /outside/);
  const invalid = structuredClone(records); invalid[0].engine.nodes = 80000;
  assert.throws(() => plan.reportStudy(manifest, [source(input, invalid)]), /context changed/);
  const otherOpening = structuredClone(records); otherOpening[0].openingId = 'unknown';
  assert.throws(() => plan.reportStudy(manifest, [source(input, otherOpening)]), /unknown opening/);
});


test('the eight existing screen protocols keep every config byte and campaign identity unchanged', () => {
  const pins = {
    level1: { campaign: 'a66bcbb5889ce62c865be30f0a2e75b7756138b161655739b1aa2296a8902f10', configs: '268ca3c70e404ccf97bacc9050e03df7691935a9b7399db8f8f783911afe5e63' },
    level2: { campaign: '65473c5ea3fd6a13a00260f73d1d997f312c8fd004f30ce16a550659a2b7361d', configs: 'fbab6b25a44ca3ac47aa0c61e393367445b393e724771d9620c485e12472955d' },
    mobility: { campaign: '3b97e43a69b38478e17635c2262ecc03b76f2ef29a100af2c5bb067d7c5ca7a9', configs: '696a2bce58e20becde1e0938382787101eaa3ec6405f2803e1f6a29a34d278f0' },
    'level1-followup': { campaign: '3a3be8a24e3049fc890a6122e9e68d9a99c24c9df6c7b3d4abba55a92e1a926b', configs: 'ddf1afc0aef47bada45ccc4c0350e51398642fb0656ba7743d78da6707e1b12b' },
    'level2-followup': { campaign: '3abd7053e6dd0810011d7da8934d86a37d2e1dae7c70c85a5d314d87a9e866ac', configs: 'a7a82685ce8198aaf3a6e8d5790db54a5286ff16f0a9786d2e4eb8688df5fa9e' },
    'level2-knights': { campaign: '8263ca89aae04e5154e481d1bc43c1c6edfdc597a66a0d0c924e5f2cbaaeee11', configs: '899924a350a7baaf895eac9b8b857eeae581b17b4ff3897d54854d95d21fdca3' },
    'level1-queens': { campaign: '7d84b0a254517854cc1393204c5af8d10d7fde018e2974f6225baf5ff36c003c', configs: 'ce36c120b4ad5afc65e5abbd9fe30145ee53e7a272573dc89642a027f0f5605e' },
    'level2-completion': { campaign: '47db396533dc388ec2e699bd2c722605fa60cdf33c8f55b951adf600210a419d', configs: '2726da349c48bc0a30aef73561671743e91c7871bfc7a0615ec1d543a0dea979' },
  };
  for (const [study, pin] of Object.entries(pins)) {
    const campaign = plan.buildCampaignPlan({ study, jobs: 4 });
    assert.equal(sha(JSON.stringify(campaign)), pin.campaign, study);
    const configs = campaign.stages.map(stage => plan.getBatchDeclaration(study, stage.batchIndex, stage.nodes).config);
    assert.equal(sha(JSON.stringify(configs)), pin.configs, study);
  }
});

test('follow-ups freeze heldout-first opening IDs and preserve fresh controls instead of pooling old scores', () => {
  const expectedIds = [...plan.OPENINGS.slice(16), ...plan.OPENINGS.slice(0, 16)].map(opening => opening.id);
  for (const study of ['level1-followup', 'level2-followup']) {
    const campaign = plan.buildCampaignPlan({ study, jobs: 3 });
    assert.deepEqual(campaign.book.openingIds, expectedIds);
    assert.equal(campaign.book.firstHoldoutCases, 16);
    const first = context(study), second = context(study, 1), final = context(study, 7);
    assert.deepEqual(first.declaration.config.openings.map(opening => opening.id), expectedIds.slice(0, 8));
    assert.deepEqual(second.declaration.config.openings.map(opening => opening.id), expectedIds.slice(8, 16));
    assert.deepEqual(final.declaration.config.openings.map(opening => opening.id), expectedIds.slice(56));
    assert.ok(plan.candidates(study).filter(row => row.key.endsWith('-control')).length === 3);
    assert.ok(first.declaration.metadata.openings.policy.includes('first sixteen'));
  }
  assert.ok(!plan.candidates('level2-followup').some(row => row.family === 'king'));
  assert.equal(plan.references('level2-followup').find(row => row.family === 'king').movement, 'F');
});

test('follow-up priors hold sibling bodies fixed and explicitly revalue all three Bishop board pawns', () => {
  const l1 = plan.getValueAudit('level1-followup');
  const expectedL1 = new Map([
    ['positional-control', { mg: 972, eg: 1093 }], ['hopping-control', { mg: 1480, eg: 1302 }],
    ['baby-amazon-control', { mg: 2771, eg: 2833 }],
  ]);
  for (const body of plan.candidates('level1-followup')) {
    const controlKey = body.controlKey || body.key;
    assert.deepEqual(l1.values.find(row => row.id === body.id).applied, expectedL1.get(controlKey), body.key);
  }
  const l2 = plan.getValueAudit('level2-followup');
  for (const body of plan.candidates('level2-followup')) {
    const row = l2.values.find(row => row.id === body.id);
    assert.deepEqual(row.applied, body.family === 'pawn' ? { mg: 536, eg: 592 } : { mg: 1203, eg: 1352 });
    if (body.family === 'pawn') {
      assert.equal(row.anchorId, 'pawn.knight-tall-quiet@1');
      assert.equal(row.source, 'experiments/designs/level2-references-v17-002.json');
      if (body.key !== 'bishop-pawn-control') assert.equal(row.automatic, null);
    }
  }
  assert.deepEqual(plan.getValueAudit('level2').values.find(row => row.id === 'pawn.bishop-step-current@1').applied, { mg: 214, eg: 245 });
  assert.ok(l2.policy.includes('214/245')); assert.ok(l2.policy.includes('not pooled'));
});

test('same-budget follow-up gains retain their declared fresh control and complete matched blocks', () => {
  for (const study of ['level1-followup', 'level2-followup']) {
    const input = context(study), records = recordsFor(input);
    const report = plan.reportStudy({ study, targetOpenings: 8, runId: 'followup-synthetic' }, [source(input, records)]);
    const stage = report.reports[0], bodies = plan.candidates(study);
    assert.equal(stage.report.progress.pairedGames, study === 'level1-followup' ? 384 : 432);
    assert.equal(stage.gains.length, study === 'level1-followup' ? 5 : 6);
    assert.ok(stage.gains.every(gain => gain.sharedOpenings === 8 && gain.difference === 0.25));
    for (const gain of stage.gains) {
      assert.equal(gain.control, bodies.find(body => body.key === gain.key).controlKey);
      assert.equal(gain.controlLabel, bodies.find(body => body.key === gain.control).label);
    }
    assert.deepEqual(report.openingIds, plan.OPENINGS.slice(16, 24).map(opening => opening.id));
    const markdown = plan.renderReport(report);
    for (const term of ['Fresh control', 'l3-panel-17', 'l3-panel-24', '25.00']) assert.ok(markdown.includes(term), term);
    const damaged = structuredClone(records), controlKey = stage.gains[0].control;
    const row = damaged.find(row => row.comparisonId.startsWith(controlKey + '-v-'));
    row.status = 'truncated'; row.result = '*';
    const revised = plan.reportStudy({ study, targetOpenings: 8 }, [source(input, damaged)]).reports[0];
    assert.ok(revised.gains.filter(gain => gain.control === controlKey).every(gain => gain.sharedOpenings === 7));
    assert.ok(revised.gains.filter(gain => gain.control !== controlKey).every(gain => gain.sharedOpenings === 8));
    assert.ok(revised.rows.find(row => row.key === controlKey).flags.includes('partial screen'));
  }
});

test('the knight-only L2 screen fixes five two-point singles and retains the three frozen references', () => {
  const study = 'level2-knights', bodies = plan.candidates(study), audit = plan.getValueAudit(study);
  assert.deepEqual(bodies.map(row => [row.key, row.movement]), [
    ['long-range-control', 'NA'], ['nfa-control', 'NFA'], ['knight-nh', 'NH'],
    ['knight-ndh', 'NDH'], ['nightrider-level2', 'N0'],
  ]);
  assert.ok(bodies.every(row => row.count === 1 && row.upgradePoints === 2 && row.family === 'knight'));
  assert.deepEqual(plan.references(study), plan.references('level2-followup'));
  assert.equal(plan.expectedGames(study, 16), 480);
  for (const body of bodies) {
    const prior = audit.values.find(row => row.id === body.id);
    assert.equal(prior.anchorId, 'knight.orange@3');
    assert.deepEqual(prior.applied, { mg: 1203, eg: 1352 });
    if (body.controlKey) assert.equal(body.controlKey, 'nfa-control');
  }
  for (const reference of plan.references(study)) {
    assert.deepEqual(audit.values.find(row => row.id === reference.id).applied, reference.engineValue);
  }
  const trial = bodies.find(row => row.movement === 'N0');
  assert.equal(trial.id, 'knight.nightrider-level2@1');
  assert.equal(rootCatalog.getDesign('knight.purple@4').level, 3);
  assert.equal(rootCatalog.getDesign('knight.purple@4').movement, 'N0');
  assert.deepEqual(plan.getValueAudit('mobility').values.find(row => row.id === 'knight.purple@4').applied, { mg: 2326, eg: 2211 });
  for (const term of ['1203/1352', '2326/2211', 'not a pure price-effect', 'old N0 scores are not pooled']) assert.ok(audit.policy.includes(term), term);
});

test('the knight-only screen starts with cases 33–48 and retains all 64 original case IDs without repeats', () => {
  const study = 'level2-knights', campaign = plan.buildCampaignPlan({ study });
  const expectedIds = [...plan.OPENINGS.slice(32), ...plan.OPENINGS.slice(0, 32)].map(opening => opening.id);
  assert.deepEqual(campaign.book.openingIds, expectedIds);
  assert.equal(new Set(campaign.book.openingIds).size, 64);
  assert.equal(campaign.book.firstHoldoutCases, 16);
  const selected = plan.selectedStages(16, campaign);
  assert.deepEqual(selected.flatMap(stage => plan.getBatchDeclaration(study, stage.batchIndex, stage.nodes)
    .config.openings.map(opening => opening.id)), plan.OPENINGS.slice(32, 48).map(opening => opening.id));
  assert.deepEqual(plan.getBatchDeclaration(study, 7, 40000).config.openings.map(opening => opening.id), expectedIds.slice(56));
  const policy = plan.getBatchDeclaration(study, 0, 40000).metadata.openings.policy;
  for (const term of ['33–64', '1–32', 'not globally fresh', 'No earlier scored journals are pooled']) assert.ok(policy.includes(term), term);
});

test('knight-only reports use fresh NFA gains, actual case IDs and complete paired blocks', () => {
  const study = 'level2-knights', first = context(study), second = context(study, 1);
  const records = recordsFor(first);
  const report = plan.reportStudy({ study, targetOpenings: 16, runId: 'knight-synthetic' }, [source(first, records), source(second)]);
  assert.equal(report.scheduledGames, 480);
  const stage = report.reports[0];
  assert.equal(stage.report.progress.pairedGames, 480);
  assert.equal(stage.gains.length, 3);
  assert.ok(stage.gains.every(gain => gain.control === 'nfa-control' && gain.controlLabel === 'NFA knight control'
    && gain.sharedOpenings === 16 && gain.difference === 0.25));
  assert.deepEqual(report.openingIds, plan.OPENINGS.slice(32, 48).map(opening => opening.id));
  const markdown = plan.renderReport(report);
  for (const term of ['Fresh control', 'NFA knight control', 'l3-panel-33', 'l3-panel-48', '25.00', 'not a pure price-effect']) assert.ok(markdown.includes(term), term);
  const damaged = structuredClone(records), record = damaged.find(row => row.comparisonId.startsWith('nfa-control-v-'));
  record.status = 'truncated'; record.result = '*';
  const revised = plan.reportStudy({ study, targetOpenings: 8 }, [source(first, damaged)]).reports[0];
  assert.ok(revised.gains.every(gain => gain.sharedOpenings === 7));
  assert.ok(revised.rows.find(row => row.key === 'nfa-control').flags.includes('partial screen'));
  assert.equal(revised.rows.find(row => row.key === 'long-range-control').openingCoverage.shared, 8);
});

test('queen and completion studies preserve exact requested bodies and separate equal purchase budgets', () => {
  const l1 = plan.candidates('level1-queens'), l2 = plan.candidates('level2-completion');
  assert.deepEqual(l1.map(row => [row.key, row.movement]), [
    ['baby-amazon-control', 'QmN'], ['queen-camel-capture', 'QcC'], ['queen-forward-knight', 'QfN'],
    ['queen-forward-half-knight', 'QfhN'],
  ]);
  assert.ok(l1.every(row => row.family === 'queen' && row.count === 1 && row.upgradePoints === 1));
  assert.deepEqual(l2.map(row => [row.key, row.movement]), [
    ['box-control', 'QmHmCmZmG'], ['queen-side-knight', 'QsN'], ['queen-tall-knight', 'QvN'],
    ['nightrider-control', 'N0'], ['knight-nd', 'ND'], ['knight-nd-quiet-king', 'NDmK'], ['free-boar', 'BsR'],
  ]);
  assert.ok(l2.every(row => row.count === 1 && row.upgradePoints === 2));
  assert.deepEqual(l2.map(row => row.family), ['queen', 'queen', 'queen', 'knight', 'knight', 'knight', 'bishop']);
  assert.equal(l2.find(row => row.key === 'nightrider-control').id, 'knight.nightrider-level2@1');
  assert.equal(l2.find(row => row.key === 'free-boar').controlKey, undefined);
  assert.equal(l2.find(row => row.key === 'free-boar').id, 'bishop.orange@3');
  assert.deepEqual(plan.references('level1-queens'), plan.references('level1'));
  assert.deepEqual(plan.references('level2-completion'), plan.references('level2-followup'));
  assert.equal(plan.expectedGames('level1-queens', 16), 384);
  assert.equal(plan.expectedGames('level2-completion', 16), 672);
  assert.ok(l1.some(row => row.movement === 'QfhN'));
  assert.ok(!l2.some(row => ['NDmW', 'NDmF'].includes(row.movement)));
});

test('completion search policies keep queen siblings, knight siblings and Free Boar on explicit separate priors', () => {
  const cases = {
    'level1-queens': { queen: { mg: 2771, eg: 2833 } },
    'level2-completion': { queen: { mg: 3738, eg: 4155 }, knight: { mg: 1203, eg: 1352 }, bishop: { mg: 1782, eg: 1756 } },
  };
  for (const [study, expected] of Object.entries(cases)) {
    const audit = plan.getValueAudit(study), declaration = plan.getBatchDeclaration(study, 0, 40000);
    for (const body of plan.candidates(study)) {
      const row = audit.values.find(row => row.id === body.id);
      assert.deepEqual(row.applied, expected[body.family], body.id);
      assert.equal(row.anchorId, body.anchorId);
      assert.deepEqual(declaration.config.evaluation.pieceValues[body.id], row.applied);
    }
    for (const reference of plan.references(study)) {
      const row = audit.values.find(row => row.id === reference.id);
      if (study === 'level2-completion') assert.deepEqual(row.applied, reference.engineValue);
      assert.equal(row.anchorId, reference.id);
    }
    assert.deepEqual(declaration.config.engine, { nodes: 40000, threads: 1, hashMb: 32, maxPlies: 400 });
    assert.ok(audit.policy.includes('all six engine tables for both colors'));
    assert.ok(audit.policy.includes('not estimated material values'));
  }
  const low = plan.getValueAudit('level1-queens').policy;
  for (const term of ['2771/2833', 'two tall forward', 'QfhN sanity check', 'all four forward', 'one-point']) assert.ok(low.includes(term), term);
  const high = plan.getValueAudit('level2-completion').policy;
  for (const term of ['3738/4155', '1203/1352', '1782/1756', 'four wide', 'four tall', 'two-point', 'not pooled', 'without adjacent captures', 'NDmW and NDmF are deferred']) assert.ok(high.includes(term), term);
});

test('completion studies start with cases 49–64 and freeze a unique cumulative sixty-four-case order', () => {
  const expectedIds = [...plan.OPENINGS.slice(48), ...plan.OPENINGS.slice(0, 48)].map(row => row.id);
  for (const study of ['level1-queens', 'level2-completion']) {
    const campaign = plan.buildCampaignPlan({ study });
    assert.deepEqual(campaign.book.openingIds, expectedIds);
    assert.equal(campaign.book.firstHoldoutCases, 16);
    assert.equal(new Set(campaign.book.openingIds).size, 64);
    const declarations = plan.selectedStages(16, campaign).map(stage => plan.getBatchDeclaration(study, stage.batchIndex, stage.nodes));
    assert.deepEqual(declarations.flatMap(row => row.config.openings.map(opening => opening.id)), plan.OPENINGS.slice(48).map(row => row.id));
    assert.deepEqual(plan.getBatchDeclaration(study, 7, 40000).config.openings.map(row => row.id), expectedIds.slice(56));
    const policy = declarations[0].metadata.openings.policy;
    for (const term of ['49–64', '1–48', 'not globally fresh', 'Free Boar is unchanged', 'No earlier scored journals are pooled']) assert.ok(policy.includes(term), term);
  }
  assert.ok(plan.getBatchDeclaration('level2-completion', 0, 40000).metadata.question.includes('does not establish matchups against other experimental upgrades'));
});

test('completion reports retain fresh family controls, unmatched Free Boar and actual case labels', () => {
  for (const study of ['level1-queens', 'level2-completion']) {
    const first = context(study), second = context(study, 1), records = recordsFor(first);
    const report = plan.reportStudy({ study, targetOpenings: 16, runId: 'completion-synthetic' }, [source(first, records), source(second)]);
    const stage = report.reports[0];
    assert.equal(stage.report.progress.pairedGames, study === 'level1-queens' ? 384 : 672);
    assert.equal(stage.gains.length, study === 'level1-queens' ? 3 : 4);
    assert.ok(stage.gains.every(row => row.sharedOpenings === 16 && row.difference === 0.25));
    assert.deepEqual(report.openingIds, plan.OPENINGS.slice(48).map(row => row.id));
    for (const gain of stage.gains) {
      const body = plan.candidates(study).find(row => row.key === gain.key);
      assert.equal(gain.control, body.controlKey);
      assert.equal(gain.controlLabel, plan.candidates(study).find(row => row.key === gain.control).label);
    }
    const markdown = plan.renderReport(report);
    for (const term of ['Fresh control', 'l3-panel-49', 'l3-panel-64', '25.00']) assert.ok(markdown.includes(term), term);
    if (study === 'level2-completion') {
      assert.ok(!stage.gains.some(row => row.key === 'free-boar'));
      const damaged = structuredClone(records), record = damaged.find(row => row.comparisonId.startsWith('box-control-v-'));
      record.status = 'truncated'; record.result = '*';
      const revised = plan.reportStudy({ study, targetOpenings: 16 }, [source(first, damaged), source(second)]).reports[0];
      assert.ok(revised.gains.filter(row => row.control === 'box-control').every(row => row.sharedOpenings === 15));
      assert.ok(revised.gains.filter(row => row.control === 'nightrider-control').every(row => row.sharedOpenings === 16));
      assert.equal(revised.rows.find(row => row.key === 'free-boar').openingCoverage.shared, 16);
    }
  }
});

test('prepanel trials freeze exact swaps and alternatives as single same-tier purchases', () => {
  const expected = {
    'prepanel-level1': { tier: 1, refs: 3, games: 192, movements: ['QfN', 'QvN'] },
    'prepanel-level2': { tier: 2, refs: 3, games: 864, movements: ['QsN', 'QcC', 'NDmK', 'NDmW', 'NDmF', 'BsR', 'BsW2', 'BsWsnN', 'BsW3'] },
    'prepanel-level3': { tier: 3, refs: 4, games: 1024, movements: ['NC', 'NWH', 'NH', 'NZ', 'NAZ', 'NAD', 'NADmK', 'NDH'] },
  };
  for (const [study, spec] of Object.entries(expected)) {
    const rows = plan.candidates(study), refs = plan.references(study), comparisons = plan.matches(study);
    assert.deepEqual(rows.map(row => row.movement), spec.movements);
    assert.equal(refs.length, spec.refs);
    assert.equal(plan.expectedGames(study, 16), spec.games);
    assert.equal(comparisons.length, rows.length * refs.length);
    assert.ok(rows.every(row => row.count === 1 && row.upgradePoints === spec.tier));
    for (const row of rows) {
      assert.equal(Object.keys(row.army.upgrades).length, 1);
      assert.equal(overlayCatalog(row.id).level, spec.tier);
    }
    for (const cell of comparisons) {
      assert.ok(refs.some(reference => reference.key === cell.bKey));
      const upgrades = Object.keys(cell.armyB.upgrades).length;
      const grants = (cell.armyB.reserve || []).reduce((sum, entry) => sum + entry.count, 0);
      assert.equal(upgrades + grants, 1);
      assert.equal(cell.upgradePoints, spec.tier);
    }
    assert.deepEqual(plan.getBatchDeclaration(study, 0, 40000).config.engine,
      { nodes: 40000, threads: 1, hashMb: 32, maxPlies: 400 });
  }
  assert.deepEqual(plan.references('prepanel-level1'), plan.references('level1'));
  assert.deepEqual(plan.references('prepanel-level2'), plan.references('level2'));
  assert.deepEqual(plan.references('prepanel-level3'), plan.references('mobility'));
  assert.equal(['prepanel-level1', 'prepanel-level2', 'prepanel-level3'].reduce((sum, study) => sum + plan.expectedGames(study, 16), 0), 2080);
  const lowQueen = plan.candidates('prepanel-level1').find(row => row.movement === 'QvN');
  const highQueen = plan.candidates('prepanel-level2').find(row => row.movement === 'QcC');
  assert.equal(lowQueen.id, 'queen.level1-tall-knight@1');
  assert.equal(highQueen.id, 'queen.level2-camel-capture@1');
  assert.equal(overlayCatalog('queen.level2-tall-knight@1').level, 2);
  assert.equal(overlayCatalog('queen.level1-camel-capture@1').level, 1);
  assert.equal(rootCatalog.getDesign('knight.purple@6').movement, 'NWH');
  assert.equal(rootCatalog.getDesign('knight.purple@6').level, 3);
});
function overlayCatalog(id) { return require(path.join(overlay.directory, 'src/design-catalog')).getDesign(id); }

test('prepanel family priors preserve frozen references and distinguish price from search context', () => {
  const expected = {
    'prepanel-level1': { queen: { mg: 2771, eg: 2833 } },
    'prepanel-level2': { queen: { mg: 3738, eg: 4155 }, knight: { mg: 1203, eg: 1352 }, bishop: { mg: 1782, eg: 1756 } },
    'prepanel-level3': { knight: { mg: 1663, eg: 1877 } },
  };
  for (const [study, values] of Object.entries(expected)) {
    const audit = plan.getValueAudit(study), declaration = plan.getBatchDeclaration(study, 0, 40000);
    for (const body of plan.candidates(study)) {
      const row = audit.values.find(row => row.id === body.id);
      assert.equal(row.anchorId, body.anchorId);
      assert.deepEqual(row.applied, values[body.family]);
      assert.deepEqual(declaration.config.evaluation.pieceValues[body.id], row.applied);
    }
    for (const reference of plan.references(study)) {
      const row = audit.values.find(row => row.id === reference.id);
      assert.equal(row.anchorId, reference.id);
      const original = plan.getValueAudit(study === 'prepanel-level1' ? 'level1' : study === 'prepanel-level2' ? 'level2' : 'mobility')
        .values.find(row => row.id === reference.id).applied;
      assert.deepEqual(row.applied, original);
      if (reference.engineValue) assert.deepEqual(row.applied, reference.engineValue);
    }
    for (const term of ['all six engine tables for both colors', 'not estimated material values', 'No earlier scored journals are pooled', 'not a pure price-effect']) {
      assert.ok(audit.policy.includes(term), study + ': ' + term);
    }
  }
  const l3 = plan.getValueAudit('prepanel-level3');
  assert.ok(l3.sources.some(source => source.file === 'experiments/designs/official-references-v16.json'));
  for (const term of ['NWH', 'NDH', '20k-node L3', '40k context', '1203/1352', '1663/1877']) assert.ok(l3.policy.includes(term), term);
});

test('prepanel studies reuse canonical case IDs without a false holdout claim and extend by frozen batches', () => {
  const expectedIds = plan.OPENINGS.map(row => row.id);
  for (const study of ['prepanel-level1', 'prepanel-level2', 'prepanel-level3']) {
    const campaign = plan.buildCampaignPlan({ study });
    assert.deepEqual(campaign.book.openingIds, expectedIds);
    assert.equal(campaign.book.firstHoldoutCases, 0);
    const first = plan.selectedStages(16, campaign).map(stage => plan.getBatchDeclaration(study, stage.batchIndex, stage.nodes));
    assert.deepEqual(first.flatMap(declaration => declaration.config.openings.map(row => row.id)), expectedIds.slice(0, 16));
    assert.deepEqual(plan.getBatchDeclaration(study, 7, 40000).config.openings.map(row => row.id), expectedIds.slice(56));
    for (const term of ['canonical cases 1–64', 'reused cases', 'not globally fresh or held-out', 'no earlier scored journals are pooled']) {
      assert.ok(first[0].metadata.openings.policy.includes(term), study + ': ' + term);
    }
    assert.deepEqual(plan.selectedStages(16, campaign), plan.selectedStages(32, campaign).slice(0, 2));
  }
});

test('prepanel reports retain family controls and isolate missing pairs to their shared cases', () => {
  const specs = {
    'prepanel-level1': { games: 192, gains: 1, damagedControl: 'forward-queen-control' },
    'prepanel-level2': { games: 864, gains: 6, damagedControl: 'ndmk-control' },
    'prepanel-level3': { games: 1024, gains: 7, damagedControl: 'unicorn-control' },
  };
  for (const [study, spec] of Object.entries(specs)) {
    const first = context(study), second = context(study, 1), records = recordsFor(first);
    const manifest = { study, targetOpenings: 16, runId: 'prepanel-synthetic' };
    const report = plan.reportStudy(manifest, [source(first, records), source(second)]), stage = report.reports[0];
    assert.equal(report.scheduledGames, spec.games);
    assert.equal(stage.report.progress.pairedGames, spec.games);
    assert.equal(stage.gains.length, spec.gains);
    assert.ok(stage.gains.every(gain => gain.sharedOpenings === 16 && gain.difference === 0.25));
    assert.deepEqual(report.openingIds, plan.OPENINGS.slice(0, 16).map(row => row.id));
    for (const gain of stage.gains) {
      const body = plan.candidates(study).find(row => row.key === gain.key);
      const control = plan.candidates(study).find(row => row.key === gain.control);
      assert.equal(gain.control, body.controlKey); assert.equal(gain.controlLabel, control.label);
    }
    const markdown = plan.renderReport(report);
    for (const term of ['Fresh control', 'l3-panel-01', 'l3-panel-16', '25.00', 'not globally fresh or held-out']) assert.ok(markdown.includes(term), term);
    const damaged = structuredClone(records), record = damaged.find(row => row.comparisonId.startsWith(spec.damagedControl + '-v-'));
    record.status = 'truncated'; record.result = '*';
    const revised = plan.reportStudy(manifest, [source(first, damaged), source(second)]).reports[0];
    assert.ok(revised.gains.filter(gain => gain.control === spec.damagedControl).every(gain => gain.sharedOpenings === 15));
    assert.ok(revised.gains.filter(gain => gain.control !== spec.damagedControl).every(gain => gain.sharedOpenings === 16));
    assert.equal(revised.rows.find(row => row.key === spec.damagedControl).openingCoverage.shared, 15);
  }
});
