# Roadmap

Version 16 is preserved at `v0.16.7`. The first version-17 screens are complete;
the four reference definitions and completed evidence stay fixed.

## Version 17: prepare and run the initial experiments

- [x] Freeze the final king colors as blue/green, yellow/orange, red/purple, then teal/gold/silver; costs remain 1–9.
- [x] Create `version_17` from the tested version-16 closeout.
- [x] Declare eight opening cases, fixed engine settings, complete color pairs and the three game caps below.
- [x] Add schema-3 finite reserve bundles to registry, deployment, preflight, journals, PGN, serial/parallel play and resume; retain ordinary royal kings.
- [x] Keep old schema-1/2 meanings and saved experiment identities unchanged; reject reserves in the board-only material estimator.
- [x] Finish the unified check/run/resume/report command, portable native-value proof and offline matchup tables.
- [x] Verify all 1,312 army/opening positions against the native engine, reference value tables, bounded stop/resume and old-run compatibility. Play no scored cloud campaign during setup.
- [x] Review all 832 level-3 games: revise Rook pawn, Mating/Vertical bishops and Side rook; retain nine candidates for eight new openings.
- [x] Review all 240 reference 2v2 games; retain the pilot without changing references or assuming partner effects are established.
- [x] Review all 240 level-1 bundle games; pawn upgrades underperform, while the grant remains uncertain.
- [x] Preserve the six exact uploads as compressed evidence with reproducible outcome analysis; distinguish reconstructed declarations from missing original manifests.

| Experiment | Games | Scope |
| --- | ---: | --- |
| `level3` | 832 | 13 replacement candidates × four references × eight openings × both colors |
| `reference-2v2` | 240 | All 15 pairings of six distinct-family reference teams |
| `pawn-grants` | 240 | Three pawn/guard bundles versus the references and each other |

The [initial protocols](docs/version17-experiments.md) remain frozen. Eight starts
provide a screen for gross outliers; they do not establish precise balance.

## Version 17: second screen

- [x] Declare eight new opening cases and five research-only level-3 alternatives, preserving every previous design ID and playable option.
- [x] Prepare two stronger level-1 pawn candidates and an `fF` grant alternative; retain ordinary promotion and finite reserve rules.
- [x] Add offline reuse of the first eight cases for unchanged candidates, with old/new cohort scores and no mixing of revised IDs.
- [x] Add overall reference scores and shared-opening coverage to Markdown reports; keep direct bundle scores separate and refresh the three initial reports.
- [x] Complete and archive `level3-confirm` (576 games), `level3-revisions` (640) and `pawn-grants-revisions` (384): 1,600 completed games with no missing pairs.
- [x] Publish the [combined sixteen-start percentages](experiments/balance/results/v17-followup-001.report.md), with unchanged IDs reusing the original eight cases and revisions kept separate.
- [x] Include the percentage beside W/D/L in the overall summary; retain the existing score calculation and archive renderers.
- [x] Review pooled targets alongside replicated opponent differences; verify an actual forced Amazon trade in the Mating-bishop games.
- [ ] Retain the promising two-step pawn and backward-capture Rook pawn for playtesting; park the weak quiet-diagonal pawn and review Archbishop/Ranged-rook matchups before choosing further changes.
- [ ] Promote successful research alternatives into the playable workshops only after outcome review and human playtesting.

## Version 17: focused capture and grant screen

- [x] Add immutable research definitions for Grid bishop `BDC`, full-diagonal pawn `FfmWifmnD`, long-forward grant `fW2` and pawn-like grant `fmWfceF`.
- [x] Declare `design-focus`: four three-point armies versus four level-3 references and three level-1 two-step pawns, on sixteen starts with both colors; cap at 640 games.
- [x] Keep the two-step-pawn comparison separate from the four-reference Overall score; preserve all six completed protocols and playable libraries.
- [x] Verify both-color captures, blockers, color restriction, ordinary promotion, finite nonchecking drops and native agreement at all 640 scheduled positions.
- [x] Complete and archive all 640 [focused games](experiments/balance/results/v17-focus-001.report.md); compare reference scores with the separate two-step-pawn matchups and both opening cohorts.
- [ ] Human-playtest the capture patterns and grant mobility for readability and counterplay before choosing replacements.

## Version 17: mobility confirmation and revisions

- [x] Retain `BDC` at level 3 for confirmation; direct level-1 matchup scores alone do not establish a tier change.
- [x] Add immutable grant designs `cfWmfF` / `fWmfF` and the one-point king-step pawn `mWFifmnD`; preserve old movements and prices.
- [x] Declare sixteen new short starting cases, preserving the reserve deployment delay and all previous case identities.
- [x] Prepare `mobility-confirm` (768 games) and `mobility-revisions` (960), with equal three-point armies and separate reference/baseline scores.
- [x] Add Support pawn and Scout guard as immutable one-point trials; create fresh `mobility-expanded` (1,600) and additions-only (640) options without changing the original 960-game declaration.
- [x] Archive and review the [Support/Scout supplement](experiments/balance/results/v17-mobility-additions-001.report.md): 639 completed games, one unscored truncation and no errors. Park Support; retain Scout for playtesting with a Cruisader matchup flag. Reuse the two resubmitted historical archives without adding their games again.
- [x] Complete and archive `mobility-confirm` (768) and `mobility-revisions` (960). Together with the supplement, 2,368 games finalized: 2,363 completed, five unscored truncations and no errors. Do not run the overlapping `mobility-expanded` campaign.
- [x] Publish the [combined thirty-two-start report](experiments/balance/results/v17-mobility-001.report.md), reusing 640 design-focus games and 128 compatible two-step-pawn reference games with explicit sources, cohorts, colors and immutable IDs.
- [x] Review repeated direct purchase counters alongside the reference basket; preserve their separate scores rather than force every equal-cost matchup to 50%.
- [x] Add Version 17 workshops with one-point Two-step and King-step pawns and the `fWmfF` Pawn grant; preserve all older libraries and show current workshops first.
- [ ] Human-playtest the [current pawn and grant choices](docs/playtest-roster-v17.md) for readability and counterplay before freezing level-1 references. Scout remains a research alternative; assess it separately if needed. Park Support/full-diagonal pawns; retain the older strong grants as research and Grid bishop at level 3. No larger batch is needed before playtesting.
- [x] Record a [small design shortlist](docs/design-ideas.md) separately from the declared game budget.

## Version 17: complete reference panel

- [x] Select Two-step pawn, King-step pawn and the `fWmfF` Pawn grant as the level-1 panel baselines; keep the four frozen level-3 definitions intact.
- [x] Declare the [three panel stages](docs/reference-panel-v17.md): missing three-point cell (64 games), level-1 singles (192) and all six level-1 2v2 teams (960). No level-1 pair faces level 3.
- [x] Reuse compatible completed cells with explicit source contexts; keep different purchase counts and historical opening cohorts separate.
- [x] Record [human playtest feedback](docs/playtest-notes-v17.md), including defensive recapture threats that matter without being played.
- [ ] Run the three stages once and refresh the panel report; preserve all run folders, native proofs and unscored truncations.
- [ ] Review direct level-1 matchups and partnership effects before changing prices, movement or declaring another experiment.

## After reviewing these results

- [ ] Human-playtest the [roster](docs/playtest-roster-v16.md) for readability, fun and counterplay. Changed movement or price gets a new immutable revision.
- [ ] Declare only the follow-ups that could change a design decision; do not restart completed reference cells whenever another candidate changes.
- [ ] Add an army-outcome model for joint upgrade contributions, uncertainty, coverage and held-out prediction. Keep its Elo-style units separate from material values.
- [ ] Use ordinary-army anchors or unequal-budget bridges to identify tier relationships; equal-budget games alone leave a cost-related ambiguity.
- [ ] Add frozen adaptive batches with exploration after fixed schedules work. Assess three level-2 purchases versus two level-3 purchases and the related tier targets.
- [ ] Treat pocket-aware material regression as a separate method; reserve outcomes remain the primary balancing tool.

## Evidence and storage

- [x] Freeze Vanguard `RfB`, Unicorn `NC`, Cruisader `BsR2nsN` and Amazon `QN`; preserve the [reference guide](docs/official-references.md), archived games and reproducible material fits.
- [x] Leave the 400-ply NC–Amazon game unscored, without continuation or replacement.
- [x] Archive completed-study notes and record the [cloud replay/fit baseline](experiments/balance/results/reference-material-001.resources.json): 44.3 seconds and 629 MiB peak RSS.
- [ ] Measure Windows folder sizes and analysis RAM before optimizing; do not infer them from the cloud measurement.
- [ ] Add verified compressed archives/shared evidence references and optional large sample exports without changing frozen readers or deleting source evidence.

The [mixed-army plan](docs/mixed-army-balance-plan.md) and
[balancing strategy](docs/balancing-strategy.md) explain the later analysis.
