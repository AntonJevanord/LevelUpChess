'use strict';

// A new research declaration. The roster-004 panels and their owned source
// snapshots remain immutable while this follow-up screens alternatives.
const { createTrialPlan } = require('./v19-trial-plan');
const anchorRoster = require('../../src/designs-v19-panel-ready');
const { TRIALS, revisionProbes } = require('../../src/balance-designs-v19-queen-rook-followup');

module.exports = createTrialPlan({
  trials: TRIALS, revisionProbes, anchorRoster,
  format: 'levelup-v19-queen-rook-followup', experimentPrefix: 'v19-queen-rook-followup',
  configurationLabel: 'queen/rook', reportLabel: 'queen/rook follow-up',
  controlsForTier: tier => tier === 2 ? [
    ['side-knight-queen-control', 'Wide-knight queen control', 'queen.level2-side-knight@1'],
    ['knight-capture-rook-control', 'Knight-capture rook control', 'rook.orange@3'],
  ] : tier === 3 ? [
    ['wraith-control', 'Current Wraith control', 'queen.wraith-side-through@1'],
  ] : [],
  question: 'Compare limited forward-jump buffs to the level-two Wide-knight queen, a restricted Knight-capture rook, and six full-movement queen leapers against unchanged same-tier references and fresh roster-004 controls.',
  valuePolicy: 'Freeze roster-004 search priors: level-two queens retain 3738 MG / 4155 EG, the level-two rook retains 1904 / 1959, and all level-three queen trials retain the current Wraith prior of 3772 / 3470. Fresh controls and fixed references keep their exact roster-004 values. All six engine tables and both colors are checked. These priors are not fitted material values or purchase costs.',
  movementNotes: 'QsNfD adds a forward two-square orthogonal jump to QsN; QsNfDfH also adds a forward three-square orthogonal jump. Both jump through blockers and can move or capture. RcsNcfN retains ordinary rook movement and six capture-only knight directions, omitting the two tall backward jumps. QsCfC and QsZfZ keep ordinary queen movement and six full move/capture camel or zebra jumps, respectively; both omit the two tall backward jumps. QZAG adds full zebra jumps and two-/three-square diagonal jumps to ordinary queen movement. QZH adds full zebra and three-square orthogonal jumps; QC adds all eight camel jumps; QZ is a fresh all-eight-zebra-jump retest under this protocol. The current Wraith control is QgmQ0gcBgcsR0, not the earlier QgB0 design. Sideways/full D/H queen additions remain possible later designs; this command does not add them automatically. Opening diagnostics do not select favorable positions, and trial outcomes do not alter the active playable or panel roster.',
});
