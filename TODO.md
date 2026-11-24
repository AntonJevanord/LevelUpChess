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
- [x] Add a separate read-only live ETA command using original stage journals, first-attempt timings by node budget and the recorded worker count; preserve the running panel's pinned sources and distinguish remaining game time from analysis and preflight overhead.
- [x] Add a separate outcome snapshot export for completed 8/16/32/64-opening totals while later stages continue; preserve source journals, target and runtime identity, and keep material fitting separate.
- [x] Review the uploaded 64-target checkpoint as report-only evidence: 12,320 finalized games, 40/40/32 declared cases. Recover Nightrider's common-32 scores without mixing the larger low-budget cohorts; the raw journal exceeds the workspace transfer limit.
- [x] Add reusable [color and exclusion analysis](docs/panel-insights.md): per-matchup White/Black and color-balanced scores, whole-opening conditional ranges, leave-one-out standings and controlled exclusion changes on matching cases. Export compact paired outcomes for later local or cloud analysis without new games or material refits.
- [x] Review the [completed 64-opening panel](docs/v17-final-panel-review.md): 21,120 finalized / 21,106 scored games, reproducible compact outcomes and color/exclusion reports. Retain coverage differences and keep White's initiative separate from piece imbalance.
- [x] Review the uploaded material summary: full-rank fits and stable ordinary estimates, saturated ordinary-army anchors and baseline/head discrepancies. Preserve engine priors; structured diagnostics and position-level replay remain prerequisites for future valuation changes.

## Version 17: named roster and focused revisions

- [x] Apply Herald, Ranger, Cataphract, Inquisitor, Wraith, Warden and corrected Crusader names in current setup/board labels while preserving all nineteen rule-profile identities and archived labels. Retain WD as the working three-point Warden; keep W2 and four-point King trials separate.
- [x] Validate tall Knight-pawn capture-only `ifmnDfmWfceFfsNfceN` and quiet-only `ifmnDfmWfceFfsNfmN` prototypes. Preserve wide `fsN`, actual en-passant removal, home double advances and standard promotion; use `ce` on new explicit pawn capture components.
- [x] Compare both pawn revisions with the current Knight pawn under matched L1 partners and c/e placements: quiet tall moves score 49.93%, capture-only 55.01%, fresh original control 61.65%.
- [x] Prepare the [2,304-game Knight-pawn follow-up](docs/targeted-followups-v17.md): fresh current control plus capture-only and quiet-only tall-jump revisions, all three L1 partners, both c/e layouts and sixteen new openings against frozen L3 references at 20k. Keep Rank pawn and F grant unchanged.
- [x] Demonstrate that `N0gN0` adds no supported hopping moves but inflates automatic valuation. Retain the negative source/engine fixtures and verify supported `N0cF` / `N0cW` alternatives.
- [x] Prepare the [576-game Nightrider focus](docs/nightrider-focus-v17.md): fresh N0 control and both capture-step revisions, four frozen references, eight holdout cases outside the ongoing first 32, both colors and 20k/40k/80k budgets. Hold all three at 2326/2211.
- [x] Add a verified owned runtime snapshot for new research definitions, preserving the active panel's source identity. Retain code/rule/dependency receipts, immutable resume, q/g/p queue stops and matched-control gain reports.
- [x] Verify all 576 focused opening/color/budget cases with native rules and fixed value tables, prototype attacks and en-passant removal, a deliberately unscored worker/resume fixture, nineteen preserved profile identities and current browser labels.
- [x] Complete and archive all 576 focused games without errors, retries or truncations. Diagonal captures score 53.91/51.56/67.97% and orthogonal captures 73.44/70.31/76.56% at 20k/40k/80k; leave Wraith unchanged and park the stronger orthogonal design.
- [x] Archive the cumulative 5,288-game panel snapshot: 2,640 earlier records retained exactly and 2,648 new. Use sixteen complete cases at all budgets; exclude the eight next-batch games from matched overall comparisons.
- [x] Publish the [paired search-budget review](experiments/balance/results/v17-search-review-001.report.md), separating revision-v-control gains from raw cross-budget changes. Retain empirical opening-block and small-sample sensitivity ranges, leave-one-out checks and Cataphract's two-cohort replication.
- [x] Prepare one fixed confirmation of N0/N0cF at 40k/80k on sixteen fresh matched openings against the four references (512 games). Keep discovery and confirmation separate; omit the already-high orthogonal variant.
- [x] Prepare a separate 512-game Cataphract test of `RsCfC` and `RfhC` at 40k/80k on the same sixteen cases and frozen references, holding both at the original RC prior. Keep original RC panel results separate from this study's evidence.
- [x] Archive and reproduce all three targeted follow-ups: 3,328 completed games, 1,664 complete pairs, no errors, truncations or retries. Retain whole-opening comparisons, partner/placement results and separate node budgets.
- [x] Freeze the [revised level-two reference selection](experiments/designs/level2-references-v17-002.json): quiet-tall Knight pawn `ifmnDfmWfceFfsNfmN`, unchanged Rank pawn and F grant. Preserve the earlier declaration and active panel identities.
- [x] Park diagonal-capture Nightrider `N0cF` (65.63%/62.11%) and forward-half Cataphract `RfhC` (38.67%/39.84%). Shortlist `RsCfC` (49.61%/52.34%) for the final panel review; do not start further incremental Nightrider trials without a concrete design reason.

## Version 17 closeout

- [x] Review the final 64-opening panel and material summary, superseding the planned interim first-32 review. Earlier outcome totals remain recoverable; preserve the original catalog, controller, balance bundle and evidence limits.
- [x] Resolve the final Cataphract selection as `RsCfC` for the next roster activation, supported by its confirmation and the completed original-`RC` panel. Retain original Nightrider/Wraith as exploration choices and preserve the original four frozen level-three references.
- [x] Close version 17 at `v0.17.23` with its tested playable roster and all nineteen profiles unchanged. Move both selected replacements to version 18 after the branch split; retain the [closeout record](docs/version17-closeout.md).

## Version 18

- [x] Create branch `version_18` from the version-17 closeout before any roster replacement; retain [switching and roster notes](docs/version18.md).
- [x] Activate the selected quiet-tall Knight pawn and `RsCfC` Cataphract in a new version-18 playable profile, with their tested MG/EG priors. Preserve all nineteen historical profiles and the four frozen references; keep Nightrider/Wraith as exploration choices.
- [x] Verify both-color movement, pawn promotion/en passant, rook castling, all six native value tables, setup costs, saves, PGN, undo and browser engine play. Retain all nineteen historical profiles and the original four frozen references; complete unit regressions and thirteen browser checks.
- [x] Complete the [tabbed interface](docs/interface-v18.md): one Game/Setup/Design/Files panel, persistent game controls and central-rank upgrade cards without covering either home army.
- [x] Verify arrows and highlight circles with right-click/right-drag and touch Draw mode, board flips, toggle/removal and clearing after position changes.
- [x] Verify the piece-ability guide for both sides: quiet dots, capture rings on empty squares, combined abilities, blockers and jumps, while actual play still enforces turns and king safety.
- [x] Verify Stockfish self-play, serial searches, Start/Pause/One move, clocks, cancellation, undo and paused save restoration.
- [x] Verify four piece styles, board palettes and annotation colors, locally remembered appearance and offline artwork; preserve upgrade colors and level badges.
- [x] Complete keyboard, touch, responsive-layout and historical browser regressions before the interface release: 38 interface/save unit checks, 30 clock/native/profile checks and all 236 browser cases pass across the full run and final affected-suite rerun.
- [x] Review the [level-one/two roster and archived acceptance evidence](docs/v18-balance-roster.md); retain the six lower-tier references and distinguish weak candidates from untested designs.
- [x] Prepare separate 40k same-tier screens for nine L1 and eight L2 designs, plus controlled 40k/80k Nightrider `N0mF` / `N0mW` / `N0mK` and three bounded Wraith hopper trials. Freeze search priors, purchase budgets, paired colors and all 64 starting cases before the first game.
- [x] Revise the unstarted L1 screen to `NmR`, `NW`, `BgB`, both `RmBgmR0` / `RmBgmQ0` Ghost rooks and Baby Amazon `QmN`; retain three unchanged comparison bodies and family priors. Add the infinite-diagonal/sideways Wraith `QgsQ0gmvR0` without vertical hopping captures.
- [x] Add opt-in owned study snapshots, cumulative 8/16/32/64-opening continuation, offline reports, physical-color/overall scores, matched control gains and retained first-target reports. Preserve all existing playable profiles, source definitions and the balance bundle.
- [x] Verify new movement, capture limits, blockers, royal safety, hopper direction diagnostics and opening-mate regressions; validate initial native positions and the entire future casebook without scored cloud games.
- [x] Archive and reproduce the [first sixteen L1/L2/mobility cases](experiments/balance/results/v18-screens-001.report.md): 3,680 finalized games, four unscored truncations, eight recovered retries and 1,836 scored color pairs. Keep the exact journals/reports and distinguish reconstructed context from absent original manifests/native proofs.
- [x] Review direct reference matchups: retain promising `NW`, `BsW` and `RmBgmQ0` for playtesting; Free Boar's high mean is driven by its Rank-pawn matchup. Record Wraith's intended below-50% role; the full-diagonal version's 57%/60% does not meet that goal.
- [x] Prepare [new matched lower-tier follow-ups](docs/v18-followup-screens.md) for `NmQ` / `NmK`, `BgBgmB0` / `BgB0`, Blink queen, four L2 knight compounds and two stronger Bishop board pawns. Keep `F` grants unchanged; use fresh controls, held-out first cases and explicit shared search priors.
- [x] Archive and review the [two completed lower-tier follow-ups](docs/v18-followup-review.md): 1,632 completed games and 816 scored pairs, without errors, retries or truncations. Compare revisions with fresh controls; keep the old Bishop-pawn 22.92% result separate from its new-prior control.
- [x] Shortlist `NmQ`, `BgB0` and the clear-range Bishop pawn for playtesting; keep the jumping pawn as an alternative and `NFA` as the nearest upper-edge L2 knight in that follow-up. Park `NmK`, quiet-range hopping bishop and L2 `NWH`; leave Blink queen exploratory without another automatic buff.
- [ ] Human-playtest the accepted panel roster for readability and counters alongside the numerical panels. The small clear-versus-jumping pawn score gap is not proof of intrinsic superiority; changed movements or prices require new identities.
- [x] Prepare the user-requested [focused L2 knight screen](docs/v18-knight-screen.md): `NH`, `NDH` and a separate two-point `N0`, with fresh `NA` / `NFA` controls, frozen L2 references, common 1203/1352 priors and held-out first cases. Preserve all earlier declarations and the original L3 Nightrider.
- [x] Archive and review the [480-game sixteen-case knight screen](docs/v18-knight-review.md): 240 complete pairs, no errors or truncations. Select unchanged `N0` for L2 at 54.69%, with 51.56%–57.81% across references and steady opening halves; park weak `NH` and strong `NDH`. Keep original L3 Nightrider outcomes separate from the new purchase/search context.
- [x] Compile the [current L1/L2 shortlist](docs/v18-lower-tier-shortlist.md), distinguishing fixed references, promising bodies, matchup concerns and unresolved queen slots; retain separate study contexts and the original search priors.
- [x] Retain Free Boar as the second L2 bishop candidate while checking its Rank-pawn counter on new cases and later mixed armies. Keep one grant option per tier; two choices are required for ordinary piece families.
- [x] Prepare [roster-completion studies](docs/v18-roster-completion.md): L1 `QcC` / `QfN` / sanity `QfhN`, L2 `QsN` / `QvN`, and the approved `ND` / `NDmK` knight bracket, with fresh family controls, unchanged Free Boar, frozen priors and held-out first cases. Preserve old campaign identities and playable profiles.
- [x] Archive and review the [384-game L1 queen and 672-game L2 completion screens](docs/v18-completion-review.md): 1,054 completed results, two unscored truncations, 526 complete color pairs and no errors/retries. Select `QfN`, `QsN` and `NDmK` for playtesting; keep `QfhN` as a stronger alternative. No immediate `NDmW` / `NDmF` study is needed.
- [x] Compare Free Boar's new Rank-pawn cases with its earlier screen: 71.88% versus 82.81%, with favorable new scores against the other references too. Retain its movement as requested; keep the old and new study contexts separate.
- [ ] Assess Free Boar alongside other upgrades in human games and mixed armies. Its latest 32-case 55.21% average is healthier than the earlier 65.56% context; retain every batch, including the 48.96% third batch.
- [x] Review `QcC` at two points: 55.21% across 32 cases supports keeping it as an L2 queen candidate. Preserve its old one-point high score and QvN's old two-point weak score as separate contexts. Record `QfcCscC` as an optional six-camel-capture revision, not an automatic nerf.
- [x] Prepare the user-requested [pre-panel alternatives](docs/v18-prepanel-alternatives.md): L1 `QvN`, L2 `QcC`, `NDmW` / `NDmF`, `BsW2` / `BsWsnN` / `BsW3`, and L3 `NWH` / `NH` / `NZ` / `NAZ` / `NAD` / `NADmK` / `NDH`. Use fresh family comparisons, frozen priors and explicit new price contexts; retain all older study identities.
- [x] Archive and review the [32-opening L1 queen study](docs/v18-queen32-review.md): 384 finalized games, 383 completed results, one unscored truncation and 191 complete pairs. Keep QfN (50.78%) and QvN (53.76%) as L1 panel candidates; distinguish the 31-case matched gain from different-coverage headline scores.
- [x] Add a read-only [opening diagnostic](docs/opening-diagnostics.md) for completed dynamic runs and pinned archives: replay only forced prefixes, track inventory and upgrade lineage, inspect royal-shield pins and capture/recapture candidates, and optionally search before/after positions. Keep reports outside source folders and preserve all recorded results.
- [x] Archive and review the [32-case L2/L3 alternatives](docs/v18-prepanel32-review.md): 3,776 finalized games, 1,886 scored color pairs and two unscored truncations. Prefer NAD as the new L3 knight (51.76%, every matchup 50.00%–55.47%); retain QgB0 Wraith's weaker role and the unchanged frozen references.
- [x] Inspect all 3,776 L2/L3 prefixes under their recorded rules: no prefix trades, post-prefix royal-shield pins or capture threats against upgrades. Retain ordinary-piece tactical flags in the archived report; do not turn diagnostic flags into score corrections or claim the short book rules out later tactics.
- [x] Conclude pre-panel screening with the user's final choices: L3 `NAD`, L2 `NDmW`, `QcC` and unchanged Free Boar `BsR`. Keep NDmK, BsW3 and QfcCscC as optional alternatives rather than required follow-up campaigns.
- [x] Integrate the selected L2 Nightrider / `NDmW`, L1 `QfN` / `QvN`, L2 `QsN` / `QcC`, and new L3 `NAD` alongside the accepted shortlist in three version-19 tier libraries. Preserve all twenty earlier libraries and frozen references; retain Free Boar `BsR` and the third L2 Bishop pawn.
- [ ] Declare a bounded mixed-bracket study using fixed level-one, revised level-two and original level-three references. Reopen parked designs only for a decision-relevant result or a well-founded gameplay idea.

## Version 19: planned panel sequence

- [x] Record the [panel sequence and budget rules](docs/version19-plan.md): separate tier panels, one purchase per army throughout L1/L2/L3, one grant option per tier, then explicit cross-level bridges and mixed armies.
- [x] Close version 18 at `v0.18.14` after the alternatives review; retain its twenty playable libraries, interface, declarations and exact journals.
- [x] Create `version_19` from `v0.18.14` with the accepted roster, preserving every historical profile and experimental identity.
- [x] Prepare three frozen same-tier round robins with canonical semantic IDs, tested search priors, one purchase per army, fixed starting homes and paired-color openings. Include revised Cataphract; retain separate reference-basket and whole-roster scores, colors, truncations and per-batch reports.
- [x] Broaden and freeze a shared 64-case opening book using eight structural families, eight quiet plies and one case per family in every batch. Validate actual army prefixes, retain diagnostic flags and avoid matchup-specific evaluation selection.
- [x] Add version-19 check/run/resume/offline-report commands with owned runtime snapshots, bounded 16/32/64 total targets and first-eight/first-sixteen checkpoints. Preserve completed batches and pause the queue on cancellation or incomplete games.
- [x] Verify accepted movement and six native MG/EG tables, setup/save/PGN/undo and three live native-engine connections. Preserve the historical byte baseline; reject transposed book positions and validate replacement prefixes before release.
- [x] Add roster revision 002: remove the third L2 Bishop pawn, retain frozen Knight/Rank pawns and Herald, and promote tested Wraith `QgmQ0gcBgcsR0` without changing published profiles. New panels have eleven bodies per tier; existing runs retain their owned runtime.
- [x] Prepare the requested [focused pawn/queen trials](docs/v19-pawn-queen-trials.md): supported `QfsN` and `QAD` at L1; `B2vR2` / `fQ2mbQ2` at L2; `PN` / `PsNfN` / `PfhN` and `QgsQ0` at L3. Retain QfN/QvN and Herald controls, fixed opponents and frozen family priors; expand P explicitly and check native geometry.
- [x] Enlarge movement dots and capture rings while retaining quiet/capture-only distinctions, annotation colors and responsive board interaction.
- [x] Automatically record the first normal post-opening search in each new game's journal/checkpoint, preserving White POV, bounds/mates, engine/position/search metadata and retry provenance without extra searches or per-ply writes. Add coverage and paired-color opening summaries to panel/trial reports; preserve old owned runtimes and missing historical observations.
- [x] Archive and [review the first L2/L3 trials](docs/v19-focused-trials-review.md): 1,664 finalized games on 32 shared openings. Preserve all original scores, one unscored truncation and Wraith's eight Qa4# opening flags; keep whole-opening sensitivity separate from official scores.
- [x] Prepare the [restricted L2 pawn follow-up](docs/v19-pawn-range-followup.md): `fQ2` and requested `mvQ2fcB2` (declared `mvQ2fceB2`), unchanged three references and 536/592 priors. Verify native/browser movement, blockers, promotion and the actual quiet en-passant convention. Reuse trial machinery while pinning every original declaration/profile.
- [x] Test queen-trial recovery from a null runtime receipt/empty folder, retain original four workers and 32-opening target, and show the original bootstrap error with safe resume guidance. Refuse foreign/unverified data without deleting it.
- [x] Complete and [review the queen trial and restricted L2 pawn follow-up](docs/v19-selected-trials-review.md): 1,152 completed games, 576 complete color pairs, no errors/retries/truncations, and all stored opening FENs replayed. Retain exact uploads and distinct experiment contexts.
- [x] Add playable revision 003: blue second L1 queen `QfsN` and two-point L2 Forward-range pawn `fQ2`, retaining fixed reference pawns, historical rule libraries and published panel declarations. Verify setup, movement, capture hints, costs/colors, promotion, save/PGN/undo and native engine support; rebuild the self-contained page.
- [x] Add playable revision 004 with the exact tested six-jump L3 pawn beside Herald/Ranger, retaining its 762/808 prior, three-point purple presentation, ordinary pawn captures/en passant and Q/R/B/N promotion. Preserve every earlier library/profile.
- [x] Declare fresh revision-004 panels with 11/12/12 bodies at **40k nodes only**, one thread and four workers; retain original readers and owned runtimes. Sixteen openings schedule 1,760/2,112/2,112 games with eight-case checkpoints.
- [x] Prepare [offline board-piece material fitting](docs/v19-material-estimates.md) from verified owned panel journals: preserve original profiles/letters, exclude whole grant-involved cells, reject pockets/drops/reserve pieces, and fit direct whole-piece counts with assumed pawn=1/queen=9. Report bonuses, coverage, grouped uncertainty and unavailable fits; never change recorded outcomes or search priors.
- [x] Fix populated material-run loading: rebuild full profiles from each archived registry and compact descriptor, compare reconstructed profiles across batches, and preserve original source manifests. Cover real serialized two-batch loading/replay, tamper rejection and retry; verify the 100-bootstrap fit on the uploaded L1 board games.
- [ ] Human-playtest QfsN/fQ2 and the six-jump pawn; keep Wraith's forced-prefix mate flags visible. Playable and panel selections do not rewrite completed or running contexts.
- [x] Review all three numerical tier panels through sixteen openings, then 32 unchanged cases: 11,968 finalized games, nine truncations, no errors and 5,975 scored color pairs. Reproduce all three outcome reports and replay every new forced prefix; retain material estimates and human counterplay as separate evidence.
- [ ] Finish the running unchanged 64-opening panels and compare with retained sixteen/32-opening checkpoints. Changed pieces, priors or placements receive new contexts; reused cells require verified compatibility.
- [x] Prepare the isolated [queen/rook follow-up](docs/v19-queen-rook-followup.md): L2 `QsNfD` / `QsNfDfH` and `RcsNcfN`, L3 `QsCfC` / `QsZfZ` / `QZAG` / `QZH` / `QC` / fresh `QZ`, unchanged reference baskets, fresh original-design controls and fixed family priors. Preserve every published panel profile; `QsNsDsH` enters the later sideways extension and `QsNDH` remains a fallback.
- [x] Review the uploaded 64-opening queen/rook reports: the restricted camel queen scores 45.21%, full camel 42.68%, restricted zebra 37.60% and full zebra 40.48%; QZAG/QZH remain above 65%. Retain report-only provenance and unequal shared-case coverage; raw journals for this checkpoint were not supplied.
- [x] Prepare the separate [sideways extension](docs/v19-sideways-followup.md): L2 `QsDsN` / `QsDsNA` / `QsNsDsH`, `RcfhN` / `RcsN`, and L3 `QsCsZ` / `QsHsCsZ` / `QsHsCsZG`, with unchanged references, current control designs, fixed priors and 8/16/32/64 total opening targets. Preserve earlier campaign definitions and live libraries.
- [ ] Review the sideways trials and human counterplay before choosing replacements. Declare a successor panel only after selection; retain original journals/provenance and schedule changed matchups after validating reuse compatibility. Do not rename old results as new pieces.
- [ ] After the tier panels, declare a combined cross-level experiment with unequal-budget anchors and equal-budget mixed armies. Respect board capacity and the twenty-custom-type limit through per-group mappings; keep army Elo-like estimates separate from fitted material values.

## After reviewing these results

- [ ] Human-playtest the [version-18 roster](docs/version18.md) for readability, fun and counterplay. Changed movement or price gets a new immutable revision.
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
- [x] Prepare the [version-18 engine-sharing benchmark](docs/engine-sharing-benchmark-v18.md): four versus eight Stockfish processes at four workers, one repeated color-swapped matchup without forced openings, 20k/80k budgets and counterbalanced rounds in an owned snapshot. Preserve the current two-engine protocol for existing runs.
- [x] Review the completed 64-game laptop benchmark: shared mode is about 1.7% / 10.6% lower in games/hour at 20k / 80k despite faster searches per ply and fewer processes. Retain separate engines; longer shared-mode games and the small workload prevent a whole-panel speed claim. Configured hash is not measured RSS.
- [ ] Profile incremental aggregation, hidden ply IPC, repeated preflight and central pair dispatch separately before combining runner optimizations in version 18.

- [x] Freeze Vanguard `RfB`, Unicorn `NC`, Cruisader `BsR2nsN` and Amazon `QN`; preserve the [reference guide](docs/official-references.md), archived games and reproducible material fits.
- [x] Leave the 400-ply NC–Amazon game unscored, without continuation or replacement.
- [x] Archive completed-study notes and record the [cloud replay/fit baseline](experiments/balance/results/reference-material-001.resources.json): 44.3 seconds and 629 MiB peak RSS.
- [ ] Measure Windows folder sizes and analysis RAM before optimizing; do not infer them from the cloud measurement.
- [ ] Add verified compressed archives/shared evidence references and optional large sample exports without changing frozen readers or deleting source evidence.

The [mixed-army plan](docs/mixed-army-balance-plan.md) and
[balancing strategy](docs/balancing-strategy.md) explain the later analysis.
