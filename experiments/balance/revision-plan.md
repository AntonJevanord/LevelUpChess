# First balance revision: bounded plan

Recorded 2026-10-20 to begin piece changes with a finite test budget. The [200-game confirmation](results/budget-3-confirmation-001.md) provides enough practical evidence to prototype changes. Exact material values are not a prerequisite.

## Outcome — 2026-10-21

**Batch closed: 160 of at most 200 games used.** The original protocol below is retained as declared before the matches.

- [Screening](results/revision-1-screen-001.md): all 100 games completed. Park `pawn.purple@2` after its 87.5% score against blue pawns reached the predeclared early-stop threshold; its 40 reserved confirmation games remain unused.
- [Selected rook confirmation](results/revision-1-rook-confirmation-001.md): all 60 rook/control games completed. Across both cohorts, `rook.purple@2` scores 85% against blue minors and 61.25% against blue knight plus orange rook; ordinary control scores 50%.
- **Keep the rook candidate experimentally**, without declaring it balanced or changing browser defaults. Record the conflicting matchup results and move to human playtesting through the version-09 picker.

The [revision ledger](results/revision-1-evidence.csv) keeps cohort/opponent coverage and verification limits separate. No third run, replacement candidate, or optional material-handicap campaign is queued. Version 08 closes with the registry, supported comparison filtering, and this decision; browser integration follows in version 09. The earlier instruction to finish a playable revision does not require waiting for a fully balanced catalog or silently replacing the current browser rules.

## Start with two changes

Implement the first candidate on `version_08`, preserving `version_07` and its existing rules/results as the baseline. These are proposed candidates, not measured improvements or changes already made to the game.

Version 08 first gives the balance runner stable design IDs and a frozen run-level letter/slot registry. Original and candidate definitions can coexist without rewriting the historical rules. The second playable set, alternate-color picker, and dynamic browser save/export formats belong to version 09; they do not block this first revision. See the ordered milestones in [TODO](../../TODO.md).

| Piece | First candidate | Purpose |
| --- | --- | --- |
| Purple pawn | Limit quiet orthogonal slides to one or two clear squares in any direction. Keep diagonal bishop captures, standard promotion, and the existing capture/en passant rules. Quiet movement does not jump blockers. | Reduce rapid board traversal and promotion races while keeping its reversible move/capture identity. |
| Purple rook | Ordinary rook movement and captures, plus capture-only knight jumps. Remove its other added diagonal and two-square orthogonal capture jumps. | Replace the large capture box with one clear, narrower extra attack pattern. |

Keep prices at 1/2/3. Keep the purple knight's retained knight and extra `WD` unit for this first batch; its new unit was explicitly improved for usability, and these results do not identify which blue purchases need buffs. Do not combine changes to blue minors, orange rooks, kings, and engine evaluation with this batch. Those can become separate, bounded revisions after this decision.

Before engine matches, verify legal moves and blockers in both colors, native/browser agreement, check handling, castling, and promotions/en passant. Verify save/load for the current playable profile when integrating a candidate into the board. These are correctness checks, not an additional balance campaign. Use a behavior revision for each changed piece and archive its experiment rules. Backward compatibility for browser saves is not required; a release may require fresh games. Link behavior revisions to run hashes in an evidence ledger, retaining old coverage separately.

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
