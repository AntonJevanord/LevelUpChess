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
- [x] Review the initial two-step/backward-capture pawn shortlist and park the weak quiet-diagonal pawn. Later confirmation selects the long-forward-capture Rook pawn and Ranged rook; retain the earlier results as history.
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
- [ ] Continue human playtesting of the [current pawn and grant choices](docs/playtest-roster-v17.md) for readability and counterplay before freezing permanent level-1 references. Scout remains a research alternative; park Support/full-diagonal pawns. Keep the older strong grants as research and Grid bishop at level 3.
- [x] Record a [small design shortlist](docs/design-ideas.md) separately from the declared game budget.

## Version 17: complete reference panel

- [x] Select Two-step pawn, King-step pawn and the `fWmfF` Pawn grant as the level-1 panel baselines; keep the four frozen level-3 definitions intact.
- [x] Declare the [three panel stages](docs/reference-panel-v17.md): missing three-point cell (64 games), level-1 singles (192) and all six level-1 2v2 teams (960). No level-1 pair faces level 3.
- [x] Reuse compatible completed cells with explicit source contexts; keep different purchase counts and historical opening cohorts separate.
- [x] Record [human playtest feedback](docs/playtest-notes-v17.md), including defensive recapture threats that matter without being played.
- [x] Complete the three stages: all 1,216 games finished without errors or truncations. Archive the exact six uploads and publish the [complete panel](experiments/balance/results/reference-panel-v17-002.panel.md); distinguish reconstructed declarations from missing original run manifests/native proofs.
- [x] Review direct level-1 matchups and partnership effects. Singles are close overall, while identical and mixed pairs differ; retain all three selected benchmarks and keep purchase budgets separate.

## Version 17: movement brackets and level-3 confirmation

- [x] Finish the [five bracket declarations](docs/balance-brackets-v17.md): `acceptance-minors` (1,152 games), `acceptance-majors` (864), `reference-pawns` (1,440), `reference-grants` (1,248) and `level3-confirmation` (2,048). Total: 6,752 games on sixteen new matched cases.
- [x] Give level-1/2 candidates reduced, current and expanded versions under immutable IDs. Deduplicate identical `F`/`F2` grant treatments and split profiles within twenty custom types.
- [x] Keep Two-step pawn, King-step pawn, Pawn grant and all four level-3 references fixed. Park Returning pawn after its 19.53% original bundle score; record Bishop pawn's old 24.22% score separately from its proposed new two-point price.
- [x] Add the repriced Bishop pawn to a new playable pawn-workshop revision while preserving every older profile and its saved identity.
- [x] Declare and verify common applied MG/EG values within each bracket, record automatic values, and preserve the frozen reference tables. Do not equate these units with material estimates or purchase points.
- [x] Check both-color movement, blockers, home-rank abilities, actual en-passant removal, standard promotions, castling and finite grants; exclude unsupported `nC` behavior.
- [x] Verify all scheduled positions and the new reports without playing scored cloud games. Show the first fixed eight cases, second eight and all sixteen with shared-case coverage and per-opponent scores.
- [x] Add and verify a sequential launcher that freezes the five stages and jobs, skips only validated completions, and pauses the entire queue for immediate/game/pair stops.
- [x] Complete and archive the [two level-1 acceptance stages](docs/v17-acceptance-review.md): all 2,016 games completed without retries, errors or truncations. Retain per-opponent and eight-case cohort results; no roster changes while level 2 runs.
- [x] Complete and archive the [level-2 pawn/grant stages](docs/v17-level2-review.md): 2,688 finalized games, two unscored truncations and no errors or retries; exclude incomplete color pairs from scores.
- [x] Select the existing Forward Knight pawn `fmWfceFifmnDfhN`, Rank pawn `ifmnDmfWfceFsR` and Diagonal grant `F` as working two-point references. Pin their IDs and engine tables; reserve orthogonal grants for later design work without rewriting historical prices.
- [x] Add a selected-pawn workshop with both level-one pawns and the Knight/Rank two-point choices, retaining all sixteen prior profiles and the existing `F` grant. Add a playable-only build that preserves the frozen balance bundle.
- [x] Complete and archive [level-3 confirmation](docs/v17-level3-review.md): all 2,048 games finalized, one unscored truncation and no errors/retries. All five campaign stages are finished: 6,752 finalized games.
- [x] Retain tested Vertical bishop `BvWvN`, long-forward-capture Rook pawn `mRcfB` and Ranged rook `RC`; preserve the four frozen research references. Keep Nightrider as an exploration option without another unchanged run.
- [x] Declare and preflight the [384-game selected-reference validation](docs/level2-reference-validation-v17.md): 96 direct level-two games and 288 six-point bridge games on sixteen fresh fixed cases, with separate reports for each budget.
- [x] Complete and archive the 384-game level-two direct/bridge validation. Knight scores 61.72%/67.19%, Rank 43.75%/22.40% and F grant 44.53%/55.21% in their separate contexts; test mixed partners before redesigning the L2 pieces.

## Version 17: selected roster and targeted trials

- [x] Archive and reproduce the completed level-three report; keep incomplete color pairs unscored and retain cohort/opponent differences.
- [x] Add immutable trials `BvW2vnN`, `mQ2cfQ2`, rook-only X-ray `QgR0` and three-point finite `K`/`W3`/`N` grants, without changing historical definitions or prices.
- [x] Reject full X-ray `QgQ0` for forced `1.Qh5+ g6 2.Qe5#`. Preserve the negative fixture and exhaustively verify no starting mate in two for either color with the rook-only replacement.
- [x] Declare and verify the [768-game targeted screen](docs/level3-revisions-v17.md), using the same unplayed sixteen-case holdout as the separate L2 validation. Preserve original search priors for movement revisions and W3; record native custom K/N values in a new receipt.
- [x] Add the twenty-type Roster and trials workshop, preserving all seventeen earlier profile identities, with retained pieces and six labeled trials.
- [x] Complete and archive all 1,152 follow-up games with no errors, retries or truncations; reproduce both reports and preserve opponent, cohort and color results.
- [x] Confirm blocked Vertical bishop `BvW2vnN` and Queen pawn `mQ2cfQ2`. Retain Nightrider and diagonal-X-ray queen; park the stronger Rook-ray queen and three-point K/W3/N grants.

## Version 17: mixed partners and orthogonal grants

- [x] Add WD as an immutable three-point reserve grant. Compare its two-square jumps with existing W2 clear-path movement, preserving the shared W2 search prior and recording WD's automatic values separately.
- [x] Add the nineteen-type Roster and king trials workshop with the confirmed pieces, W2/WD trials and original four-point King candidate; preserve all eighteen earlier profile identities.
- [x] Declare the [1,824-game study](docs/mixed-reference-validation-v17.md): all nine L1+L2 teams versus four frozen L3 references, twelve matched four-ply openings, real c2/e2 placement variants and both colors. Deduplicate the grant-only layout; report logical partner means independently of game counts.
- [x] Complete and archive all 1,824 mixed/grant games: 1,822 completed, two unscored truncations and 910 scored pairs. Reproduce the upload and review partners, placements, colors and matched WD/W2 uncertainty.
- [ ] Test the King grant at its existing four-point price against declared four-point opposition, such as L1+L3 reference packages; do not relabel the old three-point results or infer a price from their percentage.

## Version 17: complete level-three panel

- [x] Record the ten accepted replacement IDs and a [Betza convention](docs/betza-convention.md); verify Crusader aliases against native and browser rules without rewriting old definitions.
- [x] Declare all 45 unordered matchups plus ten ordinary-army material anchors at 20k/40k/80k nodes, preserving the applied MG/EG priors and four frozen references.
- [x] Freeze 64 fresh quiet four-ply cases in eight-case batches. Add cumulative 8/16/32/64 targets, immutable stage identities, resume without replay, and a provenance-scoped append-only campaign journal.
- [x] Add separate node-budget matrices, shared-case overall scores, physical colors and matched-opening search sensitivity; fit baseline/head/combined material estimates with ordinary values and joint whole-piece ranges.
- [x] Preserve the active mixed campaign's catalog, runner and balance bundle. Keep grants outside the board-only material panel; distinguish proposed roster colors from current UI colors and frozen reference status.
- [x] Verify all 7,040 distinct army/color/opening cases, native movement and value tables, cumulative continuation, copied/torn journals, bounded cancellation and Windows checkout checksums without playing scored cloud games.
- [x] Archive the [first 2,640 collected games](docs/v17-mixed-panel-review.md), reproducing all three budgets exactly. Retain the actual requested32-opening target and note that dispersion tightens at 40k but widens again at 80k.
- [ ] Finish the ongoing32-opening/10,560-game target before treating search-budget effects as stable. Its original catalog, controller and balance bundle remain fixed; there is no 2,000-game cap.
- [ ] Review material rank, held-out prediction, ordinary anchors and cohort differences before considering any engine-value changes. Fixed priors and fitted material estimates remain separate.

## Version 17: named roster and focused revisions

- [x] Apply Herald, Ranger, Cataphract, Inquisitor, Wraith, Warden and corrected Crusader names in current setup/board labels while preserving all nineteen rule-profile identities and archived labels. Retain WD as the working three-point Warden; keep W2 and four-point King trials separate.
- [x] Validate tall Knight-pawn capture-only `ifmnDfmWfceFfsNfceN` and quiet-only `ifmnDfmWfceFfsNfmN` prototypes. Preserve wide `fsN`, actual en-passant removal, home double advances and standard promotion; use `ce` on new explicit pawn capture components.
- [ ] Compare both pawn revisions with the current Knight pawn under matched L1 partners and c/e placements before replacing its playable definition. Its mixed partner mean is 63.28% across all three partners.
- [x] Demonstrate that `N0gN0` adds no supported hopping moves but inflates automatic valuation. Retain the negative source/engine fixtures and verify supported `N0cF` / `N0cW` alternatives.
- [x] Prepare the [576-game Nightrider focus](docs/nightrider-focus-v17.md): fresh N0 control and both capture-step revisions, four frozen references, eight holdout cases outside the ongoing first 32, both colors and 20k/40k/80k budgets. Hold all three at 2326/2211.
- [x] Add a verified owned runtime snapshot for new research definitions, preserving the active panel's source identity. Retain code/rule/dependency receipts, immutable resume, q/g/p queue stops and matched-control gain reports.
- [x] Verify all 576 focused opening/color/budget cases with native rules and fixed value tables, prototype attacks and en-passant removal, a deliberately unscored worker/resume fixture, nineteen preserved profile identities and current browser labels.
- [x] Complete and archive all 576 focused games without errors, retries or truncations. Diagonal captures score 53.91/51.56/67.97% and orthogonal captures 73.44/70.31/76.56% at 20k/40k/80k; leave Wraith unchanged and park the stronger orthogonal design.
- [x] Archive the cumulative 5,288-game panel snapshot: 2,640 earlier records retained exactly and 2,648 new. Use sixteen complete cases at all budgets; exclude the eight next-batch games from matched overall comparisons.
- [x] Publish the [paired search-budget review](experiments/balance/results/v17-search-review-001.report.md), separating revision-v-control gains from raw cross-budget changes. Retain empirical opening-block and small-sample sensitivity ranges, leave-one-out checks and Cataphract's two-cohort replication.
- [ ] Finish the existing 32-case panel before deciding a Cataphract change. Its 80k score is 66.32% in both eight-case cohorts and 62.89% against the frozen four; those opponent baskets remain separate.
- [ ] If a Nightrider selection is the next decision, prepare one fixed confirmation of N0/N0cF at 40k/80k on 16 fresh matched openings against the four references (512 games). Keep discovery and confirmation separate; do not rerun the already-high orthogonal variant or automatically freeze diagonal captures from eight cases.

## After reviewing these results

- [ ] Human-playtest the [current roster](docs/playtest-roster-v17.md) for readability, fun and counterplay. Changed movement or price gets a new immutable revision.
- [ ] Declare only the follow-ups that could change a design decision; do not restart completed reference cells whenever another candidate changes.
- [ ] Add an army-outcome model for joint upgrade contributions, uncertainty, coverage and held-out prediction. Keep its Elo-style units separate from material values.
- [ ] Use ordinary-army anchors or unequal-budget bridges to identify tier relationships; equal-budget games alone leave a cost-related ambiguity.
- [ ] Add frozen adaptive batches with exploration after fixed schedules work. Assess three level-2 purchases versus two level-3 purchases and the related tier targets.
- [ ] Treat pocket-aware material regression as a separate method; reserve outcomes remain the primary balancing tool.

## Evidence and storage

- [x] Replace per-move checkpoint writes with durable game boundaries, retaining clean-stop/error prefix recovery and crash-safe completed results. Verify the exact version-0.17.8 storage-only resume upgrade, including previously uncreated workers.
- [x] Add an isolated synthetic-storage benchmark; retain identical result bytes and distinguish write reduction from full-game throughput.
- [ ] Measure Windows games/hour and disk latency after the checkpoint update before changing any further performance settings.
- [ ] Add a central queue for future runs: dispatch the next frozen color-swapped pair to each free worker. Preserve durable results, interrupted-pair recovery and q/g/p controls; keep existing static-shard campaigns resumable with their original assignments.
- [ ] Separately benchmark one shared engine per game when both sides use identical settings: compare RAM, throughput and search behavior at the same node budget. Keep fresh-game resets and preserve the current two-engine protocol for existing runs.

- [x] Freeze Vanguard `RfB`, Unicorn `NC`, Cruisader `BsR2nsN` and Amazon `QN`; preserve the [reference guide](docs/official-references.md), archived games and reproducible material fits.
- [x] Leave the 400-ply NC–Amazon game unscored, without continuation or replacement.
- [x] Archive completed-study notes and record the [cloud replay/fit baseline](experiments/balance/results/reference-material-001.resources.json): 44.3 seconds and 629 MiB peak RSS.
- [ ] Measure Windows folder sizes and analysis RAM before optimizing; do not infer them from the cloud measurement.
- [ ] Add verified compressed archives/shared evidence references and optional large sample exports without changing frozen readers or deleting source evidence.

The [mixed-army plan](docs/mixed-army-balance-plan.md) and
[balancing strategy](docs/balancing-strategy.md) explain the later analysis.
