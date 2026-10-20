# First balance revision: bounded plan

Recorded 2026-10-20 to begin piece changes with a finite test budget. The [200-game confirmation](results/budget-3-confirmation-001.md) provides enough practical evidence to prototype changes. Exact material values are not a prerequisite.

## Start with two changes

Implement the first candidate on `version_08`, preserving `version_07` and its existing rules/results as the baseline. These are proposed candidates, not measured improvements or changes already made to the game.

| Piece | First candidate | Purpose |
| --- | --- | --- |
| Purple pawn | Limit quiet orthogonal slides to one or two clear squares in any direction. Keep diagonal bishop captures, standard promotion, and the existing capture/en passant rules. Quiet movement does not jump blockers. | Reduce rapid board traversal and promotion races while keeping its reversible move/capture identity. |
| Purple rook | Ordinary rook movement and captures, plus capture-only knight jumps. Remove its other added diagonal and two-square orthogonal capture jumps. | Replace the large capture box with one clear, narrower extra attack pattern. |

Keep prices at 1/2/3. Keep the purple knight's retained knight and extra `WD` unit for this first batch; its new unit was explicitly improved for usability, and these results do not identify which blue purchases need buffs. Do not combine changes to blue minors, orange rooks, kings, and engine evaluation with this batch. Those can become separate, bounded revisions after this decision.

Before engine matches, verify legal moves and blockers in both colors, native/browser agreement, check handling, castling, promotions/en passant, save/load, and historical-rule compatibility as applicable. These are correctness checks, not an additional balance campaign. Use a new versioned profile and behavior revision for each changed piece; preserve existing INIs and old saves. Link the new behavior revisions to their run hashes in an evidence ledger, retaining old coverage separately.

Make capability fixtures and application/engine variant routing revision-aware. The existing purple-rook probe intentionally requires an attack this candidate removes, so preserve that probe for v5 and add new positive/negative cases for the revised rules. Start new run directories for changed behavior; old runs retain their recorded rules, checkout, and identities.

## One batch, at most 200 scheduled full games

Use 100,000 nodes per move for both engines, Skill 20, one thread, 32 MB hash, and the existing 400-ply limit. Do not change search settings while comparing candidate behavior.

Five comparisons, each covering 20 color-swapped opening pairs:

1. Revised purple pawn versus the existing three-blue-minor army.
2. Revised purple pawn versus the existing three-blue c/d/e-pawn army.
3. Revised purple rook versus the existing three-blue-minor army.
4. Revised purple rook versus blue knight plus orange rook.
5. Ordinary control.

All four upgrade matchups cost three points per side. The mixed blue/orange case tests another allocation; it is not a direct orange-versus-purple tier test.

Split the 20 prefixes in [budget-3 confirmation](budget-3-confirmation.json) **before playing**: entries at indices 0, 2, …, 18 go to screening and indices 1, 3, …, 19 to confirmation. That gives **100 screening games and at most 100 confirmation games**. Reserve confirmation until the candidate is fixed. Reusing old prefixes preserves comparison with the baseline; these related prefixes still do not provide independent opening-family evidence.

There is one candidate per changed piece in this batch. Stop immediately for correctness failures or an unusable design. Make score-based screening decisions only after the planned **ten complete opening pairs per matchup**: a score at or below 15%, or at or above 85%, can park that candidate without spending its confirmation allocation. These are coarse design signals, not proof from a small sample. Fix correctness failures before interpreting scores. A redesigned candidate gets its own revision and a newly declared budget; it is not silently substituted into the same results.

## Decide, then move on

Use **35%–65%**, from the revised purple army's perspective, as a practical provisional target for each equal-cost matchup. This is a design band, not a confidence interval or proof of balance.

- Inside the band, with useful and understandable play: retain provisionally.
- Above it: record the remaining advantage and decide whether to keep experimentally or park the candidate; do not call it balanced.
- Below it: consider the change too severe and revert or park it.
- Conflicting matchup results: record the interaction and make a design choice; do not automatically add opponents until the scores agree.

At the end of the batch, record **keep, revert, or park** for each piece, with the reason. Inspect a small selection of already-recorded games and human play impressions alongside the scores. Do not demand exactly 50%, narrow confidence intervals, or precise material values before accepting a provisional version. Neither a noisy score nor a desired result authorizes extending the scheduled run.

**No automatic third run or additional baseline suite.** Complete the playable revision with its known limitations and continue project development. A later balance cycle requires a specific unresolved design question, a chosen candidate, and a game cap written down before it starts. This first plan does not queue that later cycle.

The prepared [320-game material-handicap suite](purple-material-handicaps.json) is optional research. It is not the next required run and does not block this revision. Use material compensation, wider openings, engine representation controls, or strength sweeps later only when one answers a concrete pending decision. Approximate material calibration remains useful, but is no longer a gate before changing pieces.
