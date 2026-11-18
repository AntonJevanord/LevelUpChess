'use strict';

// Fresh same-tier reference screens. Existing panel plans and study journals
// retain their original identity; no candidate-versus-candidate games are added.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const base = require('./v19-panel-plan');
const selected = require('../../src/designs-v19-selected');
const { TRIALS: DEFAULT_TRIALS, revisionProbes: defaultRevisionProbes } = require('../../src/balance-designs-v19-trials');
const { getDesign } = require('../../src/design-catalog');
const { normalizeConfig, makeSchedule } = require('./plan');
const { createDesignRegistry } = require('./design-registry');
const { compileDesignProfile } = require('./design-profile');
const { createV17Report } = require('./v17-report');
const ROOT = path.resolve(__dirname, '../..');
const DEFAULT_FORMAT = 'levelup-v19-focused-pawn-queen-trials';
const STUDIES = Object.freeze(['level1', 'level2', 'level3']);
const SELECTORS = Object.freeze({ queens: 'level1', pawns2: 'level2', pawns3: 'level3' });
const NODES = 40000;
const WRAITH_OPENING_WARNING = Object.freeze({
  designId: 'queen.wraith-side-ray-full@1',
  ordinaryOpponent: 'With only White queen upgraded in the ordinary starting army, Qh5+ forces g6. Exhaustive three-ply testing finds no forced mate within two; Qe5 after that reply is not check because vertical hopping is absent. Both physical colors are checked.',
  searchLimit: 'Bounded engine searches suggest substantial opening pressure under their probe settings. This is not proof of forced material gain, an intrinsic value or a match result.',
  forcedBookLimit: 'The shared eight-ply prefixes prescribe the opening instead of allowing the engine to choose its first move. This trial measures those declared positions and does not measure unrestricted first-move opening power. The warning does not remove or reweight games.',
});
const OPENINGS = base.OPENINGS;
const OPENING_TARGETS = Object.freeze([8, 16, 32, 64]);
const sha = value => createHash('sha256').update(value).digest('hex');
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const level = study => { if (!STUDIES.includes(study)) throw new Error('Choose queens, pawns2 or pawns3.'); return Number(study.at(-1)); };
const DEFAULT_VALUE_POLICY = 'Freeze shared family priors for each trial bracket: L1 queens 2771/2833, L2 pawns 536/592, L3 knight pawns 762/808 from Ranger. Herald control keeps 418/436; QgsQ0 Wraith keeps 3772/3470 from its historical Wraith anchor. Fixed references retain their tested values. All six engine tables and both colors are verified. Search priors are not measured material values or purchase prices.';
const DEFAULT_MOVEMENT_NOTES = '`P` expands to `ifmnDfmWfceF`. Its three knight variants add full jumping movement/captures in eight, six or four directions. The requested `QsfN` component is ignored by both engines; supported `QfsN` implements the intended two wide-forward jumps. QAD adds two-square jumps through blockers, not additional clear-board queen destinations. The L2 pawn designs have the same quiet paths; B2vR2 also captures backward. Their quiet diagonal en-passant visits leave the bypassed pawn.';
const DEFAULT_QUESTION = 'Screen new queen and pawn designs against unchanged same-tier references, retaining fresh QfN/QvN and Herald controls.';
for (const receipt of [selected.getRosterReceipt(), selected.getValueReceipt()]) {
  const bytes = fs.readFileSync(path.join(ROOT, receipt.file), 'utf8').replace(/\r\n/g, '\n');
  if (sha(bytes) !== receipt.sha256) throw new Error(`Frozen trial anchor changed: ${receipt.file}.`);
}
function anchor(id) { const body = selected.ALL_BODIES.find(body => body.id === id); if (!body) throw new Error(`Missing tested value anchor: ${id}.`); return body; }
function army(id) {
  const design = getDesign(id);
  if (!design) throw new Error(`Trial ${id} requires its isolated owned research runtime.`);
  return design.placement === 'reserve' ? { upgrades: {}, reserve: [{ id, count: 1 }] }
    : { upgrades: { [base.HOME[design.family]]: id } };
}
function defaultControlsForTier(tier) {
  return tier === 1 ? [
    ['forward-queen-control', 'Forward-tall queen control', 'queen.level1-forward-knight@1'],
    ['tall-queen-control', 'Tall-knight queen control', 'queen.level1-tall-knight@1'],
  ] : tier === 3 ? [['herald-control', 'Herald control', 'pawn.queen-sideways@1']] : [];
}

/** Share collection/reporting machinery without rewriting a published trial.
 * New plans supply their own identities, notes and isolated catalog extension.
 * Definitions are resolved lazily, after entering the owned research runtime. */
function createTrialPlan({ trials = DEFAULT_TRIALS, revisionProbes = defaultRevisionProbes,
  format: FORMAT = DEFAULT_FORMAT, experimentPrefix = 'v19-trials', question = DEFAULT_QUESTION,
  valuePolicy = DEFAULT_VALUE_POLICY, movementNotes = DEFAULT_MOVEMENT_NOTES,
  controlsForTier = defaultControlsForTier } = {}) {
  if (!Array.isArray(trials) || !trials.length || typeof revisionProbes !== 'function' || typeof controlsForTier !== 'function') {
    throw new Error('A trial plan requires candidate rows and probe/control functions.');
  }
  for (const [name, value] of Object.entries({ format: FORMAT, experimentPrefix, question, valuePolicy, movementNotes })) {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`Trial ${name} must be a nonempty string.`);
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(FORMAT) || !/^[a-z0-9][a-z0-9-]*$/.test(experimentPrefix)) throw new Error('Trial format and experiment prefix must be simple identities.');
  const keys = new Set(), ids = new Set();
  const TRIALS = freeze(trials.map(row => {
    if (!row || typeof row.key !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(row.key)
      || keys.has(row.key) || typeof row.id !== 'string' || !row.id || ids.has(row.id)
      || !Number.isInteger(row.level) || row.level < 1 || row.level > 3
      || !Object.hasOwn(base.HOME, row.family) || typeof row.label !== 'string' || !row.label
      || typeof row.movement !== 'string' || !row.movement) throw new Error('Trial candidates have invalid or duplicate keys, IDs, levels or movements.');
    const valueAnchor = anchor(row.anchorId);
    if (valueAnchor.level !== row.level || valueAnchor.family !== row.family) throw new Error('Trial value anchors must match the candidate tier and family.');
    keys.add(row.key); ids.add(row.id);
    return { ...row };
  }));
  function candidates(study) {
    const tier = level(study);
    const rows = TRIALS.filter(row => row.level === tier).map(row => ({ ...row, prior: anchor(row.anchorId).prior,
      priorSource: anchor(row.anchorId).priorSource, control: false }));
    const controls = controlsForTier(tier);
    if (!Array.isArray(controls)) throw new Error('Trial controls must be an array.');
    rows.push(...controls.map(([key, label, id]) => {
      const body = anchor(id);
      if (body.level !== tier || typeof key !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(key)
        || typeof label !== 'string' || !label) throw new Error('Trial controls must have valid labels, keys and the same tier.');
      return { ...body, key, label, control: true };
    }));
    if (new Set(rows.map(row => row.key)).size !== rows.length || new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Trial controls repeat a candidate key or ID.');
    return freeze(rows.map(row => ({ ...row, army: army(row.id), count: 1, upgradePoints: tier })));
  }
  function references(study) {
    return freeze(selected.getTierRoster(level(study)).filter(row => row.reference)
      .map(row => ({ ...row, army: army(row.id), count: 1, upgradePoints: row.level })));
  }
  function matches(study) {
    return freeze(candidates(study).flatMap(a => references(study).map(b => ({
      id: `${a.key}-v-${b.key}`, aKey: a.key, aLabel: a.label, bKey: b.key, bLabel: b.label,
      designA: a.id, designB: b.id, armyA: a.army, armyB: b.army,
    }))));
  }
  function getValueAudit(study) {
    const bodies = [...candidates(study), ...references(study)];
    return freeze({ sources: [selected.getRosterReceipt(), selected.getValueReceipt()],
      policy: valuePolicy,
      values: bodies.map(row => ({ id: row.id, movement: row.movement, applied: row.prior, anchorId: row.anchorId || row.id,
        source: row.priorSource, ...(row.requestedMovement ? { requestedMovement: row.requestedMovement } : {}) })) });
  }
  function getBatchDeclaration(study, batchIndex, nodes = NODES) {
    const tier = level(study);
    if (nodes !== NODES || !Number.isInteger(batchIndex) || batchIndex < 0 || batchIndex > 7) throw new Error('Choose one of the eight declared 40k-node trial batches.');
    const rows = candidates(study), columns = references(study), cells = matches(study), audit = getValueAudit(study);
    const config = normalizeConfig({ schemaVersion: 3, name: `Version 19 focused level ${tier} pawn/queen trials: batch ${batchIndex + 1}`,
      seed: 20261118 + batchIndex, repetitions: 1, engine: { nodes, threads: 1, hashMb: 32, maxPlies: 400 },
      openings: OPENINGS.slice(batchIndex * 8, batchIndex * 8 + 8),
      comparisons: cells.map(cell => ({ id: cell.id, label: `${cell.aLabel} versus ${cell.bLabel}`,
        armyA: cell.armyA, armyB: cell.armyB, strengthA: { skill: 20 }, strengthB: { skill: 20 } })),
      evaluation: { pieceValues: Object.fromEntries(audit.values.map(row => [row.id, row.applied])) } });
    return freeze({ experiment: `${experimentPrefix}-${study}-b${batchIndex + 1}`, file: null, config,
      metadata: { kind: FORMAT.replace(/^levelup-/, ''), tier, nodes, batchIndex, scheduledGames: cells.length * 16,
        symmetric: false, rows: rows.map(({ key, label }) => ({ key, label })), columns: columns.map(({ key, label }) => ({ key, label })),
        comparisons: cells.map(({ armyA, armyB, ...cell }) => ({ ...cell, kind: 'head' })),
        referenceValueProfile: 'official-standalone', evaluationAudit: audit,
        question,
        ...(tier === 3 && TRIALS.some(row => row.id === WRAITH_OPENING_WARNING.designId) ? { openingWarnings: [WRAITH_OPENING_WARNING] } : {}),
        openings: { file: base.OPENINGS_FILE, sha256: base.OPENINGS_SHA256, policy: base.BOOK.policy } } });
  }
  function expectedGames(study, openings) {
    level(study); if (!OPENING_TARGETS.includes(openings)) throw new Error('Choose 8, 16, 32 or 64 total openings.');
    return matches(study).length * openings * 2;
  }
  function buildCampaignPlan({ study, jobs = 4 }) {
    const tier = level(study);
    if (!Number.isInteger(jobs) || jobs < 1 || jobs > 16) throw new Error('Jobs must be 1 through 16.');
    const stages = Array.from({ length: 8 }, (_, batchIndex) => {
      const declaration = getBatchDeclaration(study, batchIndex), schedule = makeSchedule(declaration.config);
      const registry = createDesignRegistry(declaration.config), profile = compileDesignProfile(registry, declaration.config.evaluation);
      if (registry.definitions.length > 20) throw new Error('Trial bracket exceeds twenty custom piece types.');
      const id = `batch-${String(batchIndex + 1).padStart(2, '0')}-n${NODES}`;
      return { id, directory: id, batchIndex, nodes: NODES, games: schedule.length,
        configSha256: sha(JSON.stringify(declaration.config)), scheduleSha256: sha(JSON.stringify(schedule)),
        profileHash: profile.hash, registryHash: registry.hash };
    });
    return freeze({ schemaVersion: 1, format: FORMAT, study, tier, jobs, games: expectedGames(study, 64), nodes: [NODES],
      openingTargets: OPENING_TARGETS, batchSize: 8, roster: candidates(study), references: references(study),
      evaluationAudit: getValueAudit(study), book: { file: base.OPENINGS_FILE, sha256: base.OPENINGS_SHA256, policy: base.BOOK.policy }, stages });
  }
  function selectedStages(openings, manifest) { expectedGames(manifest.study, openings); return manifest.stages.filter(stage => stage.batchIndex < openings / 8); }

  async function checkExperiment(declaration, options = {}) {
    const proof = await base.checkExperiment(declaration, options);
    const profile = compileDesignProfile(createDesignRegistry(declaration.config), declaration.config.evaluation);
    const rules = await require('../../dist/balance-rules.cjs').createMatchRules({ profile });
    let engine, directory;
    try {
      if (options.enginePath) {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v19-trials-'));
        const file = path.join(directory, 'profile.ini'); fs.writeFileSync(file, profile.config);
        const { UciEngine } = require('./uci');
        engine = new UciEngine({ path: options.enginePath, variantPath: file, variant: profile.variant, options: { skill: 20, threads: 1, hash: 32 } });
        await engine.start({ signal: options.signal });
      }
      const probes = revisionProbes(profile);
      for (const probe of probes) {
        if (options.signal?.aborted) throw new Error('Trial validation cancelled.');
        const board = rules.createBoard(probe.fen);
        try { const moves = board.moves().sort(); if (engine && !isDeepStrictEqual([...(await engine.perft({ fen: probe.fen, signal: options.signal }))].sort(), moves)) throw new Error(`Native/browser disagreement: ${probe.name}.`); }
        finally { board.dispose(); }
      }
      options.onProgress?.(`Validation: ${probes.length} new-trial movement fixtures passed${engine ? ' native/browser parity' : ' browser rules'}.`);
      return { ...proof, trialMovementChecks: probes.length };
    } finally { await engine?.close(); if (directory) fs.rmSync(directory, { recursive: true, force: true }); }
  }

  function reportStudy(manifest, stages) {
    const study = manifest.study, targetOpenings = manifest.targetOpenings || manifest.initialOpenings || 8;
    expectedGames(study, targetOpenings);
    const seen = new Set();
    for (const stage of stages) {
      const declaration = getBatchDeclaration(study, stage.batchIndex, stage.nodes), registry = createDesignRegistry(declaration.config), profile = compileDesignProfile(registry, declaration.config.evaluation);
      if (seen.has(stage.batchIndex) || stage.batchIndex >= targetOpenings / 8) throw new Error('Duplicate or out-of-target trial stage.');
      seen.add(stage.batchIndex);
      if (!isDeepStrictEqual(stage.manifest?.designRegistry, registry) || stage.manifest.designProfile?.hash !== profile.hash
        || stage.manifest.designProfile?.config !== profile.config || !isDeepStrictEqual(stage.manifest.schedule, makeSchedule(declaration.config))) throw new Error('Trial profile or schedule changed.');
      createV17Report({ ...declaration, records: stage.records, manifest: stage.manifest });
    }
    const declaration = getBatchDeclaration(study, 0), config = { ...declaration.config, openings: OPENINGS.slice(0, targetOpenings) };
    const records = stages.slice().sort((a, b) => a.batchIndex - b.batchIndex).flatMap(stage => stage.records.map(record => ({ ...record,
      id: `${stage.batchIndex}:${record.id}`, pairId: `${stage.batchIndex}:${record.pairId}` })));
    const checked = createV17Report({ ...declaration, config, records }), pairs = base.completePairs(records, declaration.metadata), ids = config.openings.map(row => row.id);
    const rows = candidates(study).map(row => ({ ...row,
      ...base.summarize(row, references(study), pairs, ids, `v19trial:${study}:${targetOpenings}:${row.key}`),
      cells: references(study).map(other => ({ key: other.key, label: other.label,
        ...base.summarize(row, [other], pairs, ids, `v19trial:${study}:${row.key}:${other.key}`) })) }));
    const openingEvaluations = require('./opening-evaluation-report').buildOpeningEvaluationReport(records,
      { engineSha256: manifest.identity?.engineSha256 });
    return { schemaVersion: 1, format: FORMAT === DEFAULT_FORMAT ? 'levelup-v19-focused-trial-report' : `${FORMAT}-report`, runId: manifest.runId || null, study, tier: level(study),
      targetOpenings, scheduledGames: expectedGames(study, targetOpenings), progress: checked.progress,
      comparisons: checked.comparisons, rows, references: references(study), evaluationAudit: getValueAudit(study), openingPolicy: base.BOOK.policy, openingEvaluations,
      openingWarnings: declaration.metadata.openingWarnings || [],
      sources: stages.map(stage => ({ batchIndex: stage.batchIndex, nodes: stage.nodes, runId: stage.manifest.runId, profileHash: stage.manifest.designProfile.hash })) };
  }
  function renderReport(report) {
    const pct = value => value === null ? 'pending' : `${(100 * value).toFixed(2)}%`;
    const range = value => value.available ? `${pct(value.lower)}–${pct(value.upper)}` : 'pending';
    return [`# Version 19 focused level ${report.tier} trials`, '',
      `${report.targetOpenings} shared openings; ${report.scheduledGames} scheduled games; ${report.progress.finalizedGames} finalized; ${report.progress.completePairs} scored color pairs. Draws count half a point.`, '',
      'Each trial faces only the fixed reference basket, with one purchase per army and both colors. Eight openings are an outlier screen, not a precise balance estimate. Incomplete pairs, truncations and errors remain unscored. No earlier outcomes are pooled.', '',
      ...(report.openingWarnings || []).flatMap(warning => [
        `Opening warning for \`${warning.designId}\`: ${warning.ordinaryOpponent} ${warning.searchLimit}`, '', warning.forcedBookLimit, '',
      ]),
      '| Design | Overall | White | Black | Conditional 95% range | Shared cases | W / D / L |', '| --- | ---: | ---: | ---: | --- | ---: | :--- |',
      ...report.rows.map(row => `| ${row.label}${row.control ? ' [control]' : ''} | ${pct(row.score)} | ${pct(row.physicalColors[0].score)} | ${pct(row.physicalColors[1].score)} | ${range(row.conditionalRange)} | ${row.openingCoverage.shared}/${report.targetOpenings} | ${row.wins} / ${row.draws} / ${row.losses} |`), '',
      '| Trial / reference | ' + report.references.map(row => row.label).join(' | ') + ' |', '| --- | ' + report.references.map(() => '---:').join(' | ') + ' |',
      ...report.rows.map(row => `| ${row.label} | ${row.cells.map(cell => `${pct(cell.score)} (${cell.games})`).join(' | ')} |`), '',
      '| A versus B | Paired games | A W / D / L | A score | Truncations | Errors |', '| --- | ---: | :--- | ---: | ---: | ---: |',
      ...report.comparisons.map(row => `| ${row.aLabel} / ${row.bLabel} | ${row.pairedGames} | ${row.wins} / ${row.draws} / ${row.losses} | ${pct(row.score)} | ${row.statusCounts.truncated} | ${row.statusCounts.error} |`), '',
      require('./opening-evaluation-report').renderOpeningEvaluationReport(report.openingEvaluations),
      '## Frozen search priors', '', report.evaluationAudit.policy, '', '| Design | Movement | Applied MG / EG |', '| --- | --- | ---: |',
      ...report.evaluationAudit.values.map(row => `| ${row.id} | \`${row.movement}\` | ${row.applied.mg} / ${row.applied.eg} |`), '',
      movementNotes, '',
      report.openingPolicy, '',
      'Opening flags and optional evaluations do not correct scores or select favorable cells. Conditional ranges resample shared opening blocks and exclude engine and protocol bias. New pawn promotion uses ordinary Q/R/B/N choices. Unselected trials do not alter the playable roster.', ''].join('\n');
  }
  return { ROOT, FORMAT, STUDIES, SELECTORS, NODES, OPENINGS, OPENING_TARGETS, WRAITH_OPENING_WARNING, candidates, references, matches, getValueAudit,
    getBatchDeclaration, expectedGames, buildCampaignPlan, selectedStages, checkExperiment, reportStudy, renderReport };
}
module.exports = { ...createTrialPlan(), createTrialPlan };
