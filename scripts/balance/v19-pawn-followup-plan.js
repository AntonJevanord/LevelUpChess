'use strict';

const { createTrialPlan } = require('./v19-trial-plan');
const { TRIALS, revisionProbes } = require('../../src/balance-designs-v19-pawn-followup');

module.exports = createTrialPlan({
  trials: TRIALS, revisionProbes,
  format: 'levelup-v19-pawn-range-followup',
  experimentPrefix: 'v19-pawn-range-followup',
  controlsForTier: () => [],
  question: 'Compare two restricted range-two level-two pawns with the unchanged Knight pawn, Rank pawn and Bishop grant references.',
  valuePolicy: 'Both new pawns retain the previous L2 pawn trial prior of 536 MG / 592 EG. Fixed references retain their tested priors. All six engine tables and both colors are checked; these are search priors, not measured material values or purchase prices.',
  movementNotes: '`fQ2` moves and captures up to two squares forward, straight or diagonally. `mvQ2fceB2` moves quietly up to two squares vertically or diagonally and captures only on forward diagonals up to two squares. In these engines vQ2 includes diagonals; the leading m prevents their quiet components from capturing. The requested mvQ2fcB2 retains e on its capture component as the pawn notation convention, but both engines resolve the overlapping quiet diagonal as a quiet landing on an empty en-passant target: c5-d6 leaves the bypassed d5 pawn in place, as does fQ2. The e modifier does not override that engine behavior. Both have mandatory Q/R/B/N promotion. Range-two moves require a clear path and remain available away from the home rank.',
});
