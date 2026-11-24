'use strict';

// A separate extension preserves every earlier trial and active tier panel.
const { createTrialPlan } = require('./v19-trial-plan');
const anchorRoster = require('../../src/designs-v19-panel-ready');
const { TRIALS, revisionProbes } = require('../../src/balance-designs-v19-sideways-followup');

module.exports = createTrialPlan({
  trials: TRIALS, revisionProbes, anchorRoster,
  format: 'levelup-v19-sideways-followup', experimentPrefix: 'v19-sideways-followup',
  configurationLabel: 'sideways queen/rook', reportLabel: 'sideways queen/rook follow-up',
  controlsForTier: tier => tier === 2 ? [
    ['side-knight-queen-control', 'Wide-knight queen control', 'queen.level2-side-knight@1'],
    ['knight-capture-rook-control', 'Knight-capture rook control', 'rook.orange@3'],
  ] : tier === 3 ? [
    ['wraith-control', 'Current Wraith control', 'queen.wraith-side-through@1'],
  ] : [],
  question: 'Compare sideways queen jump compounds and more restricted level-two rook captures against unchanged same-tier references and fresh roster-004 controls.',
  valuePolicy: 'Freeze roster-004 search priors: level-two queens retain 3738 MG / 4155 EG, level-two rooks retain 1904 / 1959, and all level-three queen trials retain the current Wraith prior of 3772 / 3470. Fresh controls and fixed references keep their exact roster-004 values. All six engine tables and both colors are checked. These priors are not fitted material values or purchase costs.',
  movementNotes: 'QsDsN keeps ordinary queen movement and adds sideways two-square orthogonal jumps plus the four wide knight jumps; QsDsNA also adds all four two-square diagonal jumps, while QsNsDsH adds sideways three-square orthogonal jumps. QsCsZ adds the four wide camel and four wide zebra jumps; QsHsCsZ also adds sideways three-square orthogonal jumps, and QsHsCsZG also adds all four three-square diagonal jumps. These queen jumps can move or capture across blockers. A directional s applies only to its following atom, so A and G are intentionally unrestricted diagonals. An ordinary queen already reaches the D/H/A/G destinations on clear lines; these components add jumps across occupied intervening squares. RcfhN adds the four forward-half capture-only knight jumps to ordinary rook movement, while RcsN adds only the four wide capture-only knight jumps, including their forward and backward directions. The current Wraith control is QgmQ0gcBgcsR0. Earlier queen/rook trials and panel rosters remain unchanged; no alternative is promoted or earlier result imported automatically.',
});
