'use strict';

// Expanded alternatives own a new declaration. Published roster-004 panels
// and completed focused studies retain their original semantic profiles.
const { createPanelPlan } = require('./v19-panel-plan');
const roster = require('../../src/designs-v19-expanded');
const { revisionProbes } = require('../../src/v19-expanded-capability-probes');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { normalizeConfig, makeSchedule } = require('./plan');
const { createDesignRegistry } = require('./design-registry');
const { compileDesignProfile } = require('./design-profile');
const { createV17Report } = require('./v17-report');
const reuseTools = require('./v19-expanded-reuse');
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

const full = createPanelPlan({
    roster, capabilityProbes: revisionProbes,
    format: 'levelup-v19-tier-panels-005', experimentPrefix: 'v19-expanded',
    declarationLabel: ' (expanded roster 005)',
    contextLabel: 'Roster revision 005 retains all roster-004 bodies and adds BD, NfhZ, RcsNcfN, QsDsNA and QsHsCsZG as alternatives. Earlier panels and focused studies keep their original declarations; no earlier games are imported automatically.',
    reportFormat: 'levelup-v19-tier-panel-report-005',
});

function createExpandedPlan(reuse) {
  if (!reuse) return full;
  const study = reuse.identity.sourceStudy, old = new Set(reuse.oldIds);
  reuseTools.verifyBodies(reuse, full.candidates(study));
  reuseTools.verifyProtocol(reuse, full);
  const checkStudy = value => { if (value !== study) throw new Error('Reuse evidence belongs to another tier.'); };
  const cells = full.matches(study).filter(row => !old.has(row.designA) || !old.has(row.designB));
  const selected = new Set(cells.map(row => row.id));
  const expectedGames = (value, openings) => {
    checkStudy(value); full.expectedGames(value, openings);
    if (openings > reuse.availableOpenings) throw new Error(`Copied source covers only ${reuse.availableOpenings} openings.`);
    return cells.length * openings * 2;
  };
  function getBatchDeclaration(value, batchIndex, nodes) {
    checkStudy(value);
    const declaration = full.getBatchDeclaration(value, batchIndex, nodes);
    const config = normalizeConfig({ ...declaration.config,
      name: `${declaration.config.name} — new alternative pairings`,
      comparisons: declaration.config.comparisons.filter(row => selected.has(row.id)) });
    return { ...declaration, experiment: `${declaration.experiment}-delta`, config,
      metadata: { ...declaration.metadata, kind: 'v19-expanded-new-pairings',
        comparisons: declaration.metadata.comparisons.filter(row => selected.has(row.id)),
        scheduledGames: cells.length * 16, reuseIdentity: reuse.identity } };
  }
  function buildCampaignPlan(options) {
    checkStudy(options.study);
    const original = full.buildCampaignPlan(options);
    return { ...original, format: 'levelup-v19-tier-panels-005-reuse',
      games: cells.length * 64 * 2, reuseIdentity: reuse.identity,
      stages: original.stages.map(stage => {
        const declaration = getBatchDeclaration(study, stage.batchIndex, stage.nodes);
        const schedule = makeSchedule(declaration.config), registry = createDesignRegistry(declaration.config);
        const profile = compileDesignProfile(registry, declaration.config.evaluation);
        return { ...stage, experiment: declaration.experiment, games: schedule.length,
          configSha256: sha(declaration.config), scheduleSha256: sha(schedule),
          profileHash: profile.hash, registryHash: registry.hash };
      }) };
  }
  function reportStudy(manifest, stages) {
    checkStudy(manifest.study);
    const target = manifest.targetOpenings || manifest.initialOpenings || 8;
    expectedGames(study, target);
    if (!isDeepStrictEqual(manifest.reuseIdentity, reuse.identity)) throw new Error('The copied reuse identity changed.');
    const seen = new Set();
    for (const stage of stages) {
      const declaration = getBatchDeclaration(study, stage.batchIndex, stage.nodes);
      const registry = createDesignRegistry(declaration.config), profile = compileDesignProfile(registry, declaration.config.evaluation);
      if (seen.has(stage.batchIndex) || stage.batchIndex >= target / 8) throw new Error('Duplicate or out-of-target expanded stage.');
      seen.add(stage.batchIndex);
      if (!isDeepStrictEqual(stage.manifest?.designRegistry, registry)
        || stage.manifest.designProfile?.hash !== profile.hash
        || stage.manifest.designProfile?.config !== profile.config
        || !isDeepStrictEqual(stage.manifest.schedule, makeSchedule(declaration.config))) throw new Error('Expanded delta profile or schedule changed.');
      createV17Report({ ...declaration, records: stage.records, manifest: stage.manifest });
    }
    const declaration = getBatchDeclaration(study, 0), config = { ...declaration.config, openings: full.OPENINGS.slice(0, target) };
    const records = stages.slice().sort((a, b) => a.batchIndex - b.batchIndex)
      .flatMap(stage => stage.records.map(row => ({ ...row, id: `${stage.batchIndex}:${row.id}`, pairId: `${stage.batchIndex}:${row.pairId}` })));
    const checked = createV17Report({ ...declaration, config, records });
    const report = { schemaVersion: 1, format: 'levelup-v19-expanded-delta-report-005',
      study, tier: Number(study.at(-1)), runId: manifest.runId, nodes: 40000,
      targetOpenings: target, scheduledGames: expectedGames(study, target), progress: checked.progress,
      rows: [], comparisons: checked.comparisons, cohorts: [],
      openingEvaluations: require('./opening-evaluation-report').buildOpeningEvaluationReport(records,
        { engineSha256: manifest.identity?.engineSha256 }) };
    return reuseTools.buildCompositeReport({ report, reuse, planTools: api, manifest, stages });
  }
  const api = { ...full, FORMAT: 'levelup-v19-tier-panels-005-reuse',
    matches: value => { checkStudy(value); return cells; }, expectedGames, getBatchDeclaration,
    buildCampaignPlan, reportStudy, renderReport: reuseTools.renderCompositeReport };
  return api;
}

module.exports = { ...full, createExpandedPlan };
