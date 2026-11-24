'use strict';

// New minor-piece brackets, preserving every published panel and trial.
const { createTrialPlan } = require('./v19-trial-plan');
const anchorRoster = require('../../src/designs-v19-panel-ready');
const { TRIALS, revisionProbes } = require('../../src/balance-designs-v19-minor-followup');

module.exports = createTrialPlan({
  trials: TRIALS, revisionProbes, anchorRoster,
  format: 'levelup-v19-minor-followup', experimentPrefix: 'v19-minor-followup',
  configurationLabel: 'bishop/zebra-knight', reportLabel: 'bishop/zebra-knight follow-up',
  controlsForTier: tier => tier === 1 ? [
    ['hopping-bishop-control', 'Hopping bishop control', 'bishop.hopper-full-range@1'],
  ] : tier === 2 ? [
    ['nightrider-control', 'Nightrider control', 'knight.nightrider-level2@1'],
    ['dabbaba-knight-control', 'Dabbaba knight control', 'knight.level2-nd-quiet-orthogonal@1'],
  ] : [],
  question: 'Compare six color-bound dabbaba-bishop designs at level one and seven zebra-knight designs at level two against unchanged same-tier references and fresh current minor controls.',
  valuePolicy: 'Freeze roster-004 search priors: all level-one bishop trials retain the current BgB0 prior of 1480 MG / 1302 EG, and all level-two knight trials retain the current N0/NDmW prior of 1203 MG / 1352 EG. Fresh controls and fixed references keep their exact roster-004 values. All six engine tables and both colors are checked. These priors are not fitted material values or purchase costs.',
  movementNotes: 'All knight designs retain ordinary N moves and captures. NZ adds all eight zebra jumps; NZA also adds four two-square diagonal A jumps. NfhZ adds four forward-half zebra jumps; NfhZfA adds the two forward diagonal A jumps, and the user-confirmed lowercase NfhZfAfG adds both forward A and forward three-square diagonal G jumps without any straight H jump. NsZfZ retains six zebra directions, omitting tall backward jumps; NfZsZfA adds forward A jumps to that six-direction geometry. Earlier NAZ is the same geometry as NZA, but the older level-three results have different study contexts and are not pooled: NZ and NZA are potentially strong upper bounds, not presumed weak level-two candidates. All bishops retain ordinary B paths and their original square color. BD adds full orthogonal two-square D jumps; BsD adds only sideways D jumps; BmD adds quiet D jumps in all four directions. BsmDvD adds quiet sideways D jumps plus full vertical D jumps, whereas BsmDvcD adds quiet sideways D jumps and capture-only vertical D jumps, without quiet vertical jumps. BsDvmD rotates the BsmDvD pattern: full sideways D jumps plus quiet vertical D jumps, so all four D destinations are quiet options but only the sideways pair can capture. D components jump blockers and add destinations a bishop cannot reach in one ordinary move. These new studies do not promote any design or change the accepted queen/rook shortlist, playable roster or earlier outcomes.',
});
