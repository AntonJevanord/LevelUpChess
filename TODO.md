# Roadmap

Version 16 remains active. The [2,688-game four-reference comparison](experiments/balance/reference-panel-proposal.md) is ready for local execution with four jobs. The [1,152-game convergence study](experiments/balance/results/material-study-001.md) is complete and closed: rough contextual estimates are usable, with an Amazon upgrade bonus near 3.8 on the assumed pawn-1/queen-9 scale. Keep the [96-game pilot](experiments/balance/results/material-collection-001.md), earlier 320-game material pilot and 400-game Blink comparison separate and closed. Earlier milestones are in [development history](docs/development-history.md).

Browser-save compatibility across releases is optional. Experiment definitions, identities, and results must remain reproducible.

## Version 08 — registry and first balance decision

- [x] Preserve version 07 and branch to `version_08`.
- [x] Add immutable design IDs and revisions, independent of colors and temporary engine letters.
- [x] Allocate letters/custom slots from all declared comparisons, including those excluded by a schedule filter; reserve ordinary pieces and promotions.
- [x] Compile role-aware rules for movement, pawn promotion/en passant, extra units, and rook castling.
- [x] Freeze definitions, allocations, generated rules, and hashes; validate them before resume.
- [x] Verify the existing browser boards and native/browser rule agreement; complete and resume the short workflow smoke.
- [x] Complete the 100-game screen and selected 60-game rook confirmation within the [200-game cap](experiments/balance/revision-plan.md).
- [x] Park `pawn.purple@2`; retain `rook.purple@2` for experimental playtesting, without changing browser defaults or calling it balanced. See the [batch decision](experiments/balance/results/revision-1-rook-confirmation-001.md).
- [x] Archive summaries, replayed confirmation games, audit limits, and a [revision evidence ledger](experiments/balance/results/revision-1-evidence.csv). Close the batch at 160 games; its remaining 40 games are unused.
- [x] Add supported `--comparisons` selection while preserving the full registry and complete color pairs.
- [x] Condense active documentation and move historical checklists/probe details into linked archives.
- [x] Pass all 279 unit/integration checks with two test workers; verify native comparison selection and byte-preserving resume with the short CLI smoke.

## Version 09 — playable design experiments

Implement in this order. Start human playtesting before requiring tight numerical balance or a complete second set.

### 1. Share profile handling

- [x] Make board display, setup reconstruction, and move labels resolve stable design IDs through the active profile rather than hardcoded letters.
- [x] Share the catalog and compiled profile rules with the native bridge; validate selections and revision-aware capabilities before engine play.
- [x] Add a save/export format containing selections, definitions, allocation, and exact rule identity. A release may require fresh games.
- [x] Load only the selected rules profile, preserving profile isolation and retrying failed initialization.
- [x] Verify the self-contained HTML with networking disabled, engine replies, undo/clocks, round trips, and both-color promotion/en passant/castling for the selected profiles.
- [x] Verify 301 unit/integration cases and 174 browser cases. Recheck the multi-stage legacy-save test with a 60-second overall budget after its full-run timeout.

### 2. Expose a small development picker

- [x] Begin with original/revised rook choices and a small set of pawn alternatives; label experimental and parked references explicitly.
- [x] Keep tier/cost separate from design name, behavior revision, and color. Show a short movement description and highlight legal moves; name designs in board/history tooltips.
- [x] Use green/cyan/red for levels 1/2/3; review desktop/mobile layouts, level numbers, and White/Black contrast.
- [x] Receive initial playtesting feedback and preserve `version_09` before the next changes.

### 3. Test the surviving ideas

- [x] Keep `queen.purple@1` (Amazon, `QN`) fixed as the reference upgrade for the next design batch. Its estimated 12–13 total material is a contextual prior, not a measured LevelUp value.
- [x] Collect initial direct Amazon comparisons on ordinary armies within the version-12 round robin; keep the same underlying standard material.
- [ ] Use existing legal armies for tier-ratio comparisons. Add explicit shared custom starting setups only when several copies of one family answer a specific pending question.
- [x] Declare candidates, opponents, opening cohorts, search settings, decision criteria, and a game cap for each batch. Follow-up stages require an explicit question and budget.
- [ ] Extend evidence aggregation from the curated ledger when repeated batches justify it; distinguish co-occurrence, actual ability use, and individual-effect evidence.

Two to six ideas per family per tier means 36–108 upgraded designs. Keep that as an idea pool and implement selected alternatives gradually. A full second set does not block the first playable picker.

## Version 10 — army reset and pawn candidates

- [x] Preserve version 09 and develop on `version_10`.
- [x] Clear White, Black, or both draft armies across all families in each upgrade mode; apply the new army through **New game**.
- [x] Add Courier, Rank, Returning, and Twin pawn purchases as separate three-point revisions, retaining their predecessors.
- [x] Deploy pawns first; insert the experimental knight guard on its own second rank and advance only its own pawn stack within its half. Twin pawns plus guard occupy ranks 1–4 with the ordinary knight, mirrored for Black.
- [x] Freeze a curated 20-design playable library from the 22-entry catalog. Preserve the parked pawn and earlier guard placement for archived balance profiles.
- [x] Record [working material priors and initial adjustments](DESIGN.md#version-10-pawn-experiments). No new balance campaign is queued.
- [x] Verify new moves, promotion, en passant, fifty-move counters, mirrored deployment, draft reset, engine play, timed undo, and save/PGN round trips: 324 unit/integration cases, 19 focused browser cases, and an offline/mobile smoke. Combined-run timeouts passed focused rechecks.
- [ ] Consolidate Windows playtesting, including direct-file loading. Managed Chromium blocks `file://` in the cloud; offline checks supply the complete HTML from memory.
- [ ] Record feedback by revision: promotion pressure, sideways control, retreat loops, Twin-pawn congestion, readability, enjoyment, and counterplay. Shortlist ideas before declaring another capped balance batch.

## Version 11 — mobility and pairs

- [x] Preserve version 10 and develop on `version_11`.
- [x] Add two frozen 20-design libraries, **Mobility and pairs** and **First prototypes**, retaining immutable earlier definitions and the original library profile.
- [x] Switch draft libraries while retaining shared choices, clearing unavailable choices, and preserving the current game until **New game**.
- [x] Add the `NC` Camel knight, Sideways bishop, and quiet-jumping Blink rook with short movement descriptions.
- [x] Try Twin pawns at level 2 under a new ID; keep the original level-3 purchase in First prototypes.
- [x] Add Twin short queens and Queen and companion; insert the extra unit on its own second rank and advance only its own pawn stack within its half. Keep one royal king per side.
- [x] Resolve display, rules, native-engine checks, saves, and PGNs through the selected trusted profile.
- [x] Record [provisional costs and material priors](DESIGN.md#version-11-mobility-and-pairs); keep the Amazon reference unchanged.
- [x] Verify movement, royal safety, castling, deployment, engine play, library switching, and save/PGN round trips: 341 unit/integration cases and 22 focused browser cases. One combined-run native timeout passed its focused recheck.
- [x] Check the complete HTML offline and at mobile width, including both libraries and queen packages, Twin-pawn displacement, moves, saves, imports, and reset. No external requests, page errors, or horizontal overflow; managed Chromium still blocks direct `file://` navigation.
- [x] Receive positive playtesting feedback on the new designs; identify the Camel knight for level-3 pricing.
- [x] Declare the next comparison batch after initial playtesting; keep unimplemented alternatives outside its fixed roster.

## Version 12 — level-3 comparison

- [x] Preserve version 11 and develop on `version_12`.
- [x] Add `knight.purple@3` at level 3 with unchanged `NC` movement; retain the old level-2 definition and defer any diagonal-step buff.
- [x] Declare the [14-design round robin](experiments/balance/level3-plan.md): 1,820 matchup games plus 40 controls, with at most 140 selected confirmation games and no automatic third stage.
- [x] Freeze the roster, short opening cohorts, letter allocation, and previous 100,000-node search settings. Keep upgraded kings outside this batch.
- [x] Add campaign validation, capped stage selection, matchup/standings reports, timing estimates, and separate control diagnostics. Lock the one confirmation selection and verify its engine, runner, and rules identities against screening.
- [x] Verify all 3,720 possible army/color/opening assignments and 3,864 exact native/WASM positions across both cohorts. Verify 369 unit/integration cases (two updated expectations passed focused rechecks), 23 focused browser cases, an offline/mobile smoke, and four unscored workflow games covering stop/resume and reports.
- [x] Check Windows runtime with the user and preserve the recorded schedule/settings during play.
- [x] Close the screen early at the user's request: 1,507 completed games, one truncation, two failed attempts, and 753 complete color pairs. Keep snapshots separate and assign no final rankings.
- [x] Archive [the results and design decisions](experiments/balance/results/level3-screen-001.md). Do not run the reserved confirmation stage; unused games stay unused.

## Version 13 — balance workflow tools

- [x] Preserve version 12 and develop infrastructure on `version_13`; keep the current campaign's rules, engine, roster, and core runner identity frozen.
- [x] Default to game starts/results and retain optional `--log plies` diagnostics for new or resumed runs.
- [x] Generate capped round-robin or reference comparisons from a chosen roster, including color pairs, controls, cost/capacity checks, frozen allocations, and opening validation before writing. Preparation never starts games.
- [x] Add independent parallel workers with complete-pair schedules, separate checkpoints, aggregate results, and coordinated stopping. Freeze worker count for resume; preserve one engine thread and the declared search budget.
- [x] Verify 197 balance cases, including native parallel stop/resume, failure recovery, preparation limits, and Windows sharing retries; one test mock was corrected and passed its focused recheck. Check native serial resume with the frozen version-12 identity and a four-game parallel CLI/report workflow using all 14 designs. Short, truncated workflow games remain unscored.
- [x] Publish the tested tools and [future-run guide](docs/balance-tools.md) on `version_13`. Use parallelism for a later declared run; keep experiment identities separate.
- [x] Name each game's winning army and color, then show the running matchup points and win/draw/loss counts. Restore counters on resume, combine parallel workers, and keep unfinished games unscored.

## Version 14 — revised purchases against the Amazon

- [x] Preserve version 13 and develop on `version_14`; retain every earlier behavior ID and archived profile.
- [x] Retire Capture-box rook from the active workshop and park Twin short queens at level 3. Keep the knights, Knight-capture rook, and Returning pawn unchanged without repeat subject tests.
- [x] Add seven new three-point revisions: Ranging capture-range nerf, Courier capture-range buff, Rank forward-wide jumps, quiet knight jumps for Vertical bishop, capturing horizontal slides for Sideways bishop, adjacent diagonal captures for Blink, and diagonal-only captures for the companion.
- [x] Expose the revisions in the Rebalance workshop, retain First prototypes as an archive, and document their moves, promotion, castling, and deployment.
- [x] Declare one [540-game Amazon comparison](experiments/balance/amazon-revision-plan.md): seven new subjects plus two controls over 30 color-swapped opening pairs. Preserve 100,000 nodes, Skill 20, one engine thread, 32 MB hash, and 400 plies; no automatic extra stage.
- [x] Set a 40%–60% point-score design target, with draws worth half a point; retain completion, opening-sensitivity, and human-play feedback beside it.
- [x] Verify 426 unit/integration cases; update the experiment-file inventory and pass its focused recheck. New-rule tests compare 168 native/browser legal-move sets and 66 resulting positions, covering promotion/en passant, clocks, royal safety, castling, and companion deployment.
- [x] Validate all 540 army/color/opening assignments, 92 movement probes, and 480 distinct native starting/opening positions. Pass 30 focused browser cases and the offline/mobile check; verify ten unscored serial/parallel workflow games, immutable resume, and the capped Amazon report.
- [x] Preserve this plan and its command; the user's paired-alternative request replaces it as the next batch in version 15. Any started run keeps its original directory and matching build; no journals are merged.

## Version 15 — paired design alternatives

Implement and verify the alternatives before starting the single declared batch.

- [x] Preserve version 14 and develop on `version_15`; keep all existing behavior IDs and the original workshop/archive profiles unchanged.
- [x] Append five immutable three-point alternatives: Rank with full wide forward camel jumps, Vertical bishop with full tall knight jumps, unlimited-horizontal Sideways bishop, Blink with two-square clear diagonal captures, and a companion that captures forward/sideways only. Ranging and Courier form the sixth pair without further revisions.
- [x] Add ID-specific native/browser probes and independent both-color tests for the changed moves, blockers, promotion/en passant, castling/check, and nonroyal companion placement.
- [x] Expose both options in each group together in a 20-type **Design alternatives** library; retain the earlier libraries and verify setup, engine play, saves, PGN, and switching.
- [x] Freeze the [Amazon alternatives plan](experiments/balance/amazon-alternatives-plan.md): 12 subjects × 40 color-swapped opening pairs plus 160 control games = 1,120 games, within the authorized 1,200-game cap. Retain 100,000 nodes, Skill 20, one thread per engine, 32 MB hash, and 400 plies.
- [x] Add the `balance:alternatives` check/run/resume/report command. Report per-design scores and each group's distance from 50% on shared fully scored openings; show incomplete cohorts as provisional and make no automatic winner declaration.
- [x] Document full Rank jumps, the 40%–60% point-score target, control limits, preserved experiment identities, and the fixed stopping decision. Unused budget is not an automatic follow-up stage.
- [x] Validate all 1,120 army/color/opening combinations, 152 movement probes, and 1,040 distinct native positions; verify 132 independent new-rule move sets and 52 resulting positions.
- [x] Verify 454 unit/integration cases and 36 focused browser cases. Two timing failures in the combined run passed isolated rechecks. Confirm offline play at 390px without external requests, errors, or overflow; verify eight unscored workflow games, immutable stop/resume, and the capped report.
- [x] Receive and archive the [completed batch summary and shortlist](experiments/balance/results/amazon-alternatives-001.md): 1,119 completed games, one truncation, no errors, and 559 complete color pairs. Check aggregate arithmetic and declared labels; keep manifest/engine identity explicitly unverified until game records arrive.
- [x] Audit original `run.json` and `games.jsonl`: exact campaign/source/executable identities (verified Windows bundle line endings), regenerated summary, all 1,120 games / 150,035 plies, physical colors and Blink exchanges. Archive the [follow-up audit](experiments/balance/results/amazon-alternatives-001-audit.md), source diagnostic and two importable recorded lines.
- [x] Verify that duplicate-free Blink @5 notation preserves legal moves at 9,543 recorded positions while changing the engine's automatic valuation. Identify incomplete INI override propagation in exchange heuristics.
- [ ] Combine human feedback with the tentative shortlist; review evaluation consistency before a Blink movement nerf. Further valuation testing belongs to a separate declared experiment, preserving this completed batch.

## Version 16 — Blink evaluation consistency

Preserve movement IDs, Betza text, three-point prices, and the version-15 executable/results. Retain the frozen engine, runner and policy inputs for reproducing the closed batch; documentation and evidence updates retain its identity.

- [x] Preserve version 15 and develop on `version_16`; declare the [400-game evaluation plan](experiments/balance/rook-values-plan.md).
- [x] Patch explicit custom values through raw/adjusted evaluation, exchange and capture-order tables; leave automatic values unchanged. Record matching source, patch and executable provenance.
- [x] Add optional schema-2 `evaluation.pieceValues`, keyed by immutable design ID; compile through the frozen letter allocation and include values in profile/run/resume identities.
- [x] Preflight the engine's actual value tables with a read-only diagnostic; reject an older or inconsistent engine before manual-value searches. Verify ordinary pieces and Amazon retain their values.
- [x] Prepare two explicit 200-game policies using the same patched engine: automatic baseline, then manual eight-point total value for all three Blink revisions. Include quiet-only Blink, the same 20 prefixes, both colors and two controls per policy; cap the complete campaign at 400 games.
- [x] Add `balance:rook-values` check/start/resume/report commands and frozen parent `rook-values-campaign.json`. Finish automatic policy before explicitly launching manual policy; stopping never starts the next policy. Report matched complete-opening scores, changes and control diagnostics.
- [x] Document eight as a rook-relative evaluation prior, not measured material: ordinary rook MG/EG 1276/1380 scaled by 8/5 gives 2042/2208. Do not multiply raw pawn units by eight or alter movements to compensate for evaluation.
- [x] Verify 498 unit/integration cases across the full suite and focused additions, plus 16 browser/API cases. Validate all 400 army/color/opening combinations, 88 movement probes and 320 native positions across both policies. Pass 20 unscored native workflow games, paired stop/resume, immutable identities, partial reports and old-engine rejection before campaign creation.
- [x] Verify source-table consistency and matching source/patch/executable hashes; rebuild the Windows bundle and test the same patch natively on Linux. All existing playable profiles and movement definitions remain unchanged.
- [x] Receive and replay the [automatic 200-game baseline](experiments/balance/results/rook-values-auto-001.md): all games completed, no errors/truncations, 100 complete pairs and 26,693 legal plies. Regenerate its summary and match declared profile/settings; leave missing manifest/binary identity checks open.
- [x] Establish the [balancing strategy](docs/balancing-strategy.md): separate engine calibration, contextual upgrade benefit and purchase price; review all active values but override selectively; retain Amazon as one reference and use bounded follow-ups only for concrete decisions.
- [x] Receive and replay the [eight-point 200 games](experiments/balance/results/rook-values-eight-001.md): no errors/truncations, 100 complete pairs and 27,727 legal plies. Every record matches manual MG2042/EG2208; regenerate its summary and compare all 20 shared openings per matchup.
- [x] Archive the [completed policy comparison](experiments/balance/results/rook-values-comparison-001.md): Quiet −31.25 percentage points, adjacent −8.75, long −3.75; all 80 controls have identical histories. Values affect play, but this does not choose a stronger engine policy or measure intrinsic material.
- [ ] Verify parent and policy manifests against the bundled executable and source identities when supplied. Uploaded journals alone do not prove which Windows binary ran.
- [x] Close the fixed 400-game question: establish sensitivity and explicitly defer authoritative Blink values and movement changes. Preserve prototypes, retract any balanced-Quiet inference, and queue no extension or universal target-value assignment.

### After the current policy comparison

- [ ] Record actual automatic/explicit MG/EG values, provenance and confidence for shortlisted active designs; retain ordinary-piece defaults and royal semantics. Do not assign desired base-plus-level targets to every custom type.
- [x] Design the [512-game material pilot](experiments/balance/material-estimate-plan.md): one 256-game queen-versus-rook odds control, then 64/128/256 cumulative Amazon games. Freeze reference evaluation, nominal pawn units, two removal layouts and 16 opening blocks; use no Blinks.
- [x] Implement explicit stages, native reference-value inventory, frozen identities, stop/resume and immutable cumulative estimates. Report raw/per-layout curves, monotone-fit crossings, conditional resampling bands and incomplete coverage without extrapolating.
- [x] Refresh and print live provisional estimates after finished games; explain incomplete paired blocks and preserve final checkpoints. Group schedules by opening block so matched estimates become available early.
- [x] Validate the original implementation before local execution: 53 focused regression checks, all 512 native/browser army/opening comparisons and eight native movement probes. Verify 32 unscored three-worker games with paired stop/resume, native reference inventory, old-engine rejection, immutable checkpoints and live-report callbacks. No formal pilot games were run in the cloud.
- [x] Receive and audit 256 control games and the first 64 Amazon games: all 320 completed, 160 complete pairs, 34,360 legal plies, no errors/truncations; both summaries and reported curves regenerate. Actual binary/source identities still require missing manifests.
- [x] Close the pilot at 320 games. The queen-favored side scores 89.84% after four pawn removals and 82.81% after five; the control does not bracket 50%. Keep the Amazon's 4–5 removed-pawn crossing as contextual odds evidence, not a calibrated +458-cp bonus. Leave 192 games unused.
- [x] Review [ubdip's outcome-regression method](docs/material-regression-review.md) and pinned source. Correct the narrow four-pawn expectation: the supplied study gives queen minus rook 4.89 overall and 5.75/4.64 by phase. Distinguish fixed NNUE inference from separate training; no new network or games are required for an offline diagnostic.
- [x] Export sparse, material-stable samples with stable design IDs, frozen identity contexts and game/pair/opening groups. Replay all 320 pilot games, keep 3,071 samples from 318 games, expose two partially sampled pairs and retain draws. Odd stride five samples both turns; incompatible policies and corrupted evidence fail explicitly.
- [x] Implement dependency-free expected-score regression with equal game weights, full-rank/correlation checks, ordinary material plus Amazon bonus, grouped holdouts/bootstrap and unsupported-estimate reporting. Archive the [first diagnostic](experiments/balance/results/material-regression-001.md): prediction works, but ordinary-material ratios do not establish transferable prices; no new engine games.
- [x] Validate 27 new exporter/model/command cases, including synthetic effect recovery, draws, repeated-row invariance, sampling parity, corrupted evidence and output preservation. Full unit suite: 533 passed, 36 environment-dependent cases skipped. Verify emitted source/rules/protocol/data hashes against the archived diagnostic.
- [x] Add a provenance-aware adapter for the automatic rook campaign's ordinary/Amazon controls and close the [bounded offline check](experiments/balance/results/material-controls-001.md). Verify 80 records, deduplicate 40 physical histories, fit ordinary values first and inspect phases. Ordinary ratios remain unsuitable; the Amazon bonus has no observed variation. No new engine games or adopted prices.
- [x] Pass 18 new control-source, deduplication/phase and command cases; full unit suite: 551 passed, 36 environment-dependent cases skipped. Verify the archived control report and tool/rules/config hashes.
- [x] Audit the [supplied outcome EPDs](experiments/balance/results/material-epd-001.md): baseline 90,614 positions/605 game IDs reproduces queen 8.40 and rook 4.74; test has 35,052 positions/220 IDs. Use whole-game uncertainty and disclose append/file mismatches, draw/weight sensitivity and unknown generation identities. Add an independent optional helper; generate no new games.
- [x] Pass six optional Python checks for strict EPD parsing, interleaved game IDs, draws/unit weights, effect recovery, duplicate-row invariance, per-resample pawn normalization and output preservation. Verify both input hashes and the final analysis-source identity.
- [x] Preserve the broader EPD baseline separately and define the [96-game collection pilot](experiments/balance/material-collection-plan.md): 32 full-army book positions, each ordinary once and Amazon in both colors; seed 42, automatic values, Skill 20, 20,000 nodes, one thread, 32 MB and 400 plies. Freeze identities and selected positions; add checkpoint/resume and offline reports with draws, game weights and coverage checks.
- [x] Pass 38 new collector cases and the full unit suite: 589 passed, 36 environment-dependent cases skipped. Preserve [native preflight evidence](experiments/balance/results/material-collection-preflight-001.json) for all 96 starts and eight movement probes with zero searches; verify cancellation/resume with three separate unscored workflow games. Recheck source, rules and executable hashes after workspace recovery.
- [x] Receive and verify the [completed 96-game pilot](experiments/balance/results/material-collection-001.md): no errors, truncations or retries; all 10,639 plies replay, 881 samples retained, and sources/Windows engine/rules match the frozen manifest. Keep the original result files; no additional games start automatically.
- [x] Fix terminal input remaining active after completion; verify fresh/paused/active input handling, natural subprocess exit after success or failure, and actual terminal exit. Full suite: 591 passed, 36 environment-dependent cases skipped. Preserve strict identities for unfinished runs; completed original runs can report offline without rerunning games.
- [x] Review completed/sample-game counts, duplicate histories, actual Amazon-count variation, rank, phase coverage and grouped prediction before interpreting conditional coefficients. Keep legacy EPD data separate; declare another question and budget only if the pilot justifies it.
- [x] Complete the [offline pilot/anchor review](experiments/balance/results/material-collection-001-anchors.md): verify unchanged reports, expose ordinary-material coverage limits, and independently compare a fitted pawn-1/queen-9 convention with the unconstrained model. Prediction remains similar; the anchored Amazon bonus is about 2.82 on that assumed scale. Preserve original estimators and native evaluation values.
- [x] Declare the [1,152-game convergence study](experiments/balance/material-study-plan.md), superseding the earlier 576-game suggestion: four jobs, 384 fresh positions excluding the pilot 32, ordinary/Amazon triplets, cumulative 384/768/1,152-game barriers, unchanged rules/evaluation/effort, primary pawn-1/queen-9 assumptions and unconstrained diagnostics. Freeze five grouped folds and 200 whole-position resamples.
- [x] Complete and validate the new study command, immutable cumulative reports and stop/resume: 41 new checks and 632 full-suite passes, with 36 environment-dependent cases skipped. Preserve [native evidence](experiments/balance/results/material-study-preflight-001.json) for all 1,152 starts and eight probes; two interrupted four-job invocations preserve prefixes/manifests and report unavailable estimates honestly. Zero completed study games in the cloud.
- [x] Receive and audit the [completed 1,152-game study](experiments/balance/results/material-study-001.md): 384 complete triplets, no errors/truncations/retries, 126,924 legal plies, 10,689 samples from 1,143 games. Verify the original manifest, all 26 source hashes, bundled Windows executable, rules line endings and recorded four-job settings; reproduce all three checkpoints and the final uploaded Markdown exactly without new games.
- [x] Close at the cap as usable for rough comparisons in context. Combined rook 4.78 and Amazon bonus 3.84 change by about 0.32 from the preceding checkpoint; the anchored rook cohort gap falls to 0.30. Keep the bonus range 3.37–4.38, residual unconstrained gap 0.57, phase limits and assumed scale visible; no automatic extension or familiar-value target.
- [ ] In future declared campaigns, justify deterministic symmetric-control repeats; repeated A/B histories are one observation for regression. Preserve all past schedules and raw records.
- [ ] Review compensation methods before another batch: preserve fuller pawn structures, sample representative matched positions and use several ordinary-material anchors. Screen any new control cheaply before committing to a large sample; literal queen replacement alone does not remove the other confounds.
- [ ] Make future reports lead with control validity and use removed-pawn units until the conventional material interpretation is justified. Preserve the current frozen report/checkpoint identities and archived raw evidence.
- [ ] If choosing Blink search values would change a design decision, declare one bounded identical-army calibration pilot. Independent per-engine policies need new runner support; implement it only after choosing that question and budget. This is optional, not a gate for unrelated material anchors.
- [x] Establish contextual Amazon bonus Δ ≈ 3.8 as the provisional level-3 comparison reference. Rough tier-1/2 targets near 1.3/2.6 are design hypotheses, not measured strengths of those pieces. Keep this scale separate from native engine parameters and purchase prices.
- [x] Draft the [four-reference comparison](experiments/balance/reference-panel-proposal.md): 2,688 games, four jobs, exact Horizontal bishop/Camel knight/Knight-capture rook/Amazon revisions, 1,152 ordinary/single-upgrade and 1,536 head-to-head games. Compare estimates from each cohort and all games combined, with paired whole-position uncertainty on their differences; five fixed grouped folds check predictions. Compare upgrade bonuses rather than whole-piece values; keep earlier results separate.
- [x] Implement `material:references` with a fixed shared profile, 416-position exclusions, matched member selection, 21-game blocks, three cohort fits, paired difference uncertainty, grouped predictions and immutable cumulative reports. Preserve all earlier frozen collector/model sources and completed evidence.
- [x] Pass 53 new checks and the full suite: 685 passed, 36 environment-dependent cases skipped. Preserve [validation evidence](experiments/balance/results/reference-panel-preflight-001.json) for all 2,688 native starts, 30 movement/role probes, two interrupted four-job invocations with preserved prefixes/manifests, honest provisional reporting and natural offline CLI exit. Zero completed study games in the cloud.
- [x] Preserve the updated [family draft](experiments/designs/family-draft.ini) separately; keep tested `BsR2sN` for this experiment as confirmed, with automatic evaluation.
- [ ] Run the fixed 2,688-game study locally with four jobs and preserve reports at 672/1,344/2,688 games.
- [ ] Review separate/combined estimates, paired cohort differences, feature/phase support and predicted-versus-observed matchup scores. Close at the cap as usable, inconclusive or context-dependent; no automatic extension or redesign.
- [ ] Human-playtest survivors and use a small, contrasting equal-cost reference set. Apply later compensation checks only to surviving designs whose approximate added-value range would change a design decision.

## Deferred work

- [ ] Integrate independent capture-only king choices into the main browser board after royal identity, castling, mating tests, and asymmetric-king evaluation limits are handled. Keep one royal per side.
- [ ] Agree on queen/rook conversion goals and a consistent dead-position policy; guard grants remain an alternative design.
- [ ] Automatically split larger idea pools into capacity-bounded experiment groups; add general custom setups when a declared experiment needs them.
- [ ] Consider a reusable four-reference parent variant (Knight-capture rook, Camel knight, Sideways bishop and Amazon) with up to 16 candidate slots when the next reference-panel question needs it. Generate matched test FENs separately; validate unique letters, promotion, castling and MG/EG policies before scored comparisons. Keep this sandbox separate from completed studies.
- [ ] Investigate ordinary/custom representation effects, material handicaps, wider openings, or evaluation overrides only for a concrete decision. Existing templates are optional research.
- [ ] Consider random armies, additional art/themes, and online play after the local design workflow is useful.

The original legacy executable's matching source remains unresolved; the current bundled LevelUp engine has recorded matching-source provenance in [stockfish/README.md](stockfish/README.md).

Keep releases playable, branch from tested milestones, and tag finished releases. Further tests are not an automatic queue.
