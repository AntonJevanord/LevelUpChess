'use strict';

// Fresh runs select this roster. Published revision-002 readers and owned
// runtime snapshots continue to use their exact original declarations.
const { createPanelPlan } = require('./v19-panel-plan');
const roster = require('../../src/designs-v19-panel-ready');
const { revisionProbes } = require('../../src/v19-panel-ready-capability-probes');

module.exports = createPanelPlan({
  roster, capabilityProbes: revisionProbes,
  format: 'levelup-v19-tier-panels-004',
  experimentPrefix: 'v19-current',
  declarationLabel: ' (roster 004)',
  contextLabel: 'Roster revision 004: selected QfsN queen, fQ2 pawn and six-jump L3 pawn. Earlier panel runtimes and results retain their original declarations.',
  reportFormat: 'levelup-v19-tier-panel-report-004',
});
