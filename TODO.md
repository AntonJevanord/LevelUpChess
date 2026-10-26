# Roadmap

Version 16 is closed. **Vanguard, Unicorn, Cruisader and Amazon** are the [official frozen references](docs/official-references.md). The [final bishop decision](experiments/balance/results/bishop-decision-final-001.report.md) selects the blocked-wide-knight bishop; no more version-16 match games are needed. Future candidates face the fixed references rather than one another. Earlier milestones are in [development history](docs/development-history.md).

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

## Version 16 — evaluation methods and frozen references (closed)

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

### Completed method and reference work

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
- [x] Receive and audit the [completed four-reference study](experiments/balance/results/reference-panel-001.md): 2,687 completed games, one unscored truncation and no errors/retries. Verify all 27 source hashes, recorded engine/rules identity and all 301,770 plies; reproduce the uploaded dataset, all three checkpoint estimates and final Markdown exactly. No new engine games.
- [x] Close at the cap with useful contextual comparisons and inconclusive ±0.5-pawn cohort equivalence. Combined bonuses are bishop 4.66, rook 3.15, Camel 3.79 and Amazon 3.96. Camel/Amazon score 51.18%; bishop/Camel remains close to even despite the model's 64.01% prediction. Keep all-Black-to-move book coverage and conditional uncertainty explicit; do not replace the truncation.
- [x] Declare [three bishop nerfs and three rook buffs](experiments/balance/reference-revision-proposal.md) under fresh immutable IDs, retaining Camel/Amazon. Reuse the exact 128 parent positions and 2,688 records; schedule only 4,608 new candidate games with four jobs and cumulative checkpoints at 1,152 / 2,304 / 4,608. Keep the playable libraries unchanged.
- [x] Complete linked collection/report support and verify new movements, castling, standard promotions, native values, parent compatibility and stop/resume. Preserve parent raw files and old-profile decoding; group inherited and new evidence by the same position IDs. [Validation evidence](experiments/balance/results/reference-revisions-preflight-001.json): 51 new checks, 736 full-suite passes and 36 environment-dependent skips; all 4,608 native starts and 90 movement/role probes; 48 matching historical static evaluations; two interrupted four-job invocations and natural offline-report exit. Zero completed extension games in the cloud. No validation match campaign or repeated unchanged matchup is needed.
- [x] Place partial-pair notes below the new matchup table; preserve the original uploaded report. Reproduce historical whole-file source audits on matching commit `1658cc4`.
- [ ] If the missing historical revision manifest/final JSON are recovered, verify their source/process identities and reproduce the analysis. The full journal is now recovered and replayed; this archive follow-up does not block version closure or require new games.
- [x] Review the user's [first checkpoint tables](experiments/balance/results/reference-revisions-checkpoint-1152.md) against the same 32 parent openings. Keep the original bishop eligible; early rook results need broader coverage. Review again at 2,304 new games without changing active sources or scheduling a redesign.
- [x] Receive the [completed 4,608-game Markdown report](experiments/balance/results/reference-revisions-001-review.md) and close collection at the cap. Its initial journal covered 2,873 games; the subsequent full-journal recovery is recorded below. No extension manifest/final JSON was supplied.
- [x] Recover and [audit the full 4,608-game revision journal](experiments/balance/results/reference-revisions-retained-001.report.md): 499,642 legal plies, 2,304 complete color pairs and all 12 head-to-head counts match. Preserve the exact bytes compressed; deduplicate the old 480-game subset and close the 192-game short-side raw-history gap. No Cruisader games, new material fit or new match games.
- [x] Audit rook exchanges from the supplied journals: 1,468 relevant games / 150,540 legal plies; matched ordinary-army scores and Amazon/ordinary-queen recaptures reproduced. Verify expected native values separately. More queen-for-rook exchanges do not establish engine mistakes; all new rook priors remain below ordinary queen and Amazon.
- [ ] If valuation uncertainty would change a choice, inspect bounded pre-exchange positions under declared priors and search budgets before considering a full policy rerun. Keep fitted material secondary to direct outcomes; it is learned from the same engine games.
- [x] Record [simple reference ideas](experiments/balance/simple-reference-ideas.md): pure `BsR`, queen-equivalent `RB`, `RfB` and `RB2`; distinguish draft/probe checks from balance results. The user selected all four for the declared campaign below.
- [x] Declare the [simple-piece comparison](experiments/balance/simple-reference-plan.md): four new immutable replacements against QN/NC, with ordinary-army baselines; 3,072 new games, four jobs and 768/1,536/3,072 checkpoints. Match only `RB` to ordinary-queen native values and retain rook castling.
- [x] Complete [simple-campaign validation](experiments/balance/results/simple-reference-preflight-001.json): 49 new checks, 785 full-suite passes and 36 environment-dependent skips; all 3,072 native starts and 68 movement/role probes; 48 matching historical evaluations and 57 legal-move checks; two interrupted four-job invocations and natural offline-report exit. Ordinary-piece console/Markdown estimates, assumed anchors, queen–rook ranges and parent reuse pass. Zero completed campaign games in the cloud; preserve earlier collectors/reports.
- [x] Receive and review the [completed simple campaign](experiments/balance/results/simple-reference-001-review.md): all 3,072 new games finish without errors, truncations or retries; all 336,140 new plies replay. Retain `RfB` as a provisional reference beside QN/NC: 52.73% versus Amazon and 50.98% versus Camel. Close at the cap; preserve raw uploads and distinguish the replay descriptor from the missing original collection manifest/native inventory.
- [x] Declare the [five-bishop comparison](experiments/balance/bishop-reference-plan.md): original horizontal, both leading nerfs and quiet-hop `BsRgmsR`/`BsRgmsR0` against unchanged `RfB`; 1,280 new games, four jobs, checkpoints 320/640/1,280. Reuse all 5,760 original/simple records once; repeat no ordinary controls or QN/NC games.
- [x] Complete [bishop-campaign validation](experiments/balance/results/bishop-reference-preflight-001.json): 65 new checks and 850 unique passing checks overall, with 36 environment-dependent skips; all 1,280 native/browser starts and 108 movement/role probes; 96 matching historical static evaluations and 113 legal-move comparisons. Two interrupted four-job invocations preserve prefixes and both raw source layers; offline reporting reproduces all six inherited point fits exactly. Keep head-only baseline estimates unavailable. Zero completed new study games in the cloud.
- [x] Close the bishop campaign at 1,280 games: no errors/truncations/retries; all 156,583 new plies replay. Short side scores 53.32% against RfB, long quiet hop 46.29%; keep both eligible while preserving the missing historical process-manifest caveat.
- [x] Recover and replay-check 480 short-side bishop games / 54,855 plies from the earlier upload: 160 each against ordinary armies, Camel and Amazon. Preserve the compact raw subset and distinguish it from the final report's 256-game scores.
- [x] Complete the offline [four-piece reference matrix](experiments/balance/results/reference-matrix-001.md) and [gap inventory](experiments/balance/results/reference-matrix-001.gap-plan.json). All 34 focused checks pass, including 18 new matrix cases; actual offline CLI refresh imports the retained journal without double-counting or modifying inputs. The running bishop collector's complete identity is unchanged. No new games or material fits.
- [x] Declare the [final focused bishop comparison](experiments/balance/bishop-decision-plan.md): restore up to 192 missing short-side cells, test long quiet hop against Camel/Amazon (512 games), and test `BsR2nsN` against all three references (768). Auto-detect retained revision data, reuse both existing rook matchups, and cap new games at 1,472.
- [x] Complete [bishop-decision validation](experiments/balance/results/bishop-decision-preflight-001.json): 78 new cases and 946 unique passing checks, 36 environment-dependent skips; all 1,472 native/browser starts, 210 movement/role probes and 40 retained static comparisons. Replay 832 relevant source histories / 101,805 plies. Two interrupted four-job restoration invocations and a comparison-profile prefix preserve identities and saved moves; actual offline CLI reporting releases all locks. Zero completed new study games in the cloud.
- [x] Complete the local bishop decision: the final report contains all nine 256-game matchups, with 1,280 new comparison games and no restoration games, errors or truncations. Select blocked-wide-knight `bishop.purple@13` (`BsR2nsN`): 51.95% against RfB, 47.66% against NC and 51.76% against QN. Preserve conditional intervals and distinguish reported new outcomes from the duplicate historical journal.
- [x] Freeze the [official version-16 roster](docs/official-references.md): Vanguard `rook.purple@10`, Unicorn `knight.purple@3`, Cruisader `bishop.purple@13`, and Amazon `queen.purple@1`, each costing three points. Add a machine-readable snapshot and standalone w/x/y/z INI while preserving historical definitions, allocations and results.
- [x] Replace the proposed candidate round robin with fixed-reference comparisons. Future design changes receive new identities and face the unchanged reference basket; earlier measured scores keep their original context.
- [x] Pass 62 focused closeout checks and [103 native/browser position checks](experiments/balance/results/official-references-v16.validation.json). Verify both notation orders, first-leg blocking, castling, promotion, en passant, and unchanged ordinary/reference value tables; no new match games.
- [x] Preserve and [audit the final decision journal and manifests](experiments/balance/results/bishop-decision-complete-001.audit.json): 1,280 new games / 151,488 legal plies, 2,304 retained/new histories / 275,775 plies. Verify 52 historical source hashes, Windows engine/rules identity and exact reproduction of all nine matchup scores/ranges. Keep inherited-process identity limits separate.
- [x] Calculate [offline material estimates](experiments/balance/results/bishop-decision-material-001.report.md) from the new 1,280-game cohort only. Preserve P=1/Q=9 assumptions, 13,344 stable positions, full rank, all 200 valid whole-opening resamples, five supported validation folds and joint whole-piece intervals. Cruisader is +3.40 / total 6.81; preserve earlier fits separately. Pass 52 focused checks, including six new method cases; two independent extraction/fit executions agree exactly. No new matches or reference changes.
- [x] Keep extra-unit purchases outside the planned replacement-piece balance roster. Explore the user's [finite-reserve alternative](prototypes/reserve-guards/README.md) separately: an ordinary royal king plus a nonroyal pocket grant can avoid starting congestion and special king castling. Preserve historical definitions and results.

- [x] Validate the [isolated finite-reserve guard rules](prototypes/reserve-guards/validation.json): 56 mirrored WebAssembly fixtures, 18 state/round-trip checks, 58 exact native legal-move comparisons and six bounded engine replies, including forced drops and drop histories. Own-half deployment, capture, royal safety, castling, mate, undo, serialization and normal promotion/en passant pass. No balance games; the active collector identity is preserved.
- [x] Defer reserve-grant balance testing until the nonroyal roster is settled. Prioritize paired head-to-head scores against varied fixed equal-cost opponents; extra-unit trade/sacrifice options and deployment effects make material estimates a secondary diagnostic.

## Next version — candidates against frozen references

- [ ] Branch from the tested version-16 closeout; keep the four official reference definitions and evidence fixed.
- [ ] Add the official names and selected rules to a new playable library, then verify movement, castling, saves/PGN and engine play. Preserve historical libraries and immutable design definitions.
- [ ] Human-playtest the surviving mobile/Rank pawns, Vertical bishop and other candidates for readability, enjoyment and counterplay. Use the updated [shortlist plan](experiments/balance/level3-shortlist-plan.md); its earlier candidate round-robin proposal is superseded.
- [ ] Declare a capped candidate-versus-reference batch only after choosing the candidates. Reuse compatible scores; report each matchup separately and freeze engine values, openings, search effort and stopping criteria. Keep older policy cohorts separate. No candidate-versus-candidate schedule is needed.
- [ ] Develop levels 1/2 with tier-appropriate fixed reference packages and test mixed six-point armies for combinations and stacking. Keep material estimates secondary and contextual.

- [ ] If adopting reserves, add isolated playable reserve controls first, then versioned grant/deployment rules and drop-aware engine/history/save/PGN logs. After the nonroyal roster is settled, declare a capped head-to-head campaign with fixed drop/checking rules, costs and draw adjudication; retain deployment, exchange/endgame and opponent context. Pocket-aware material estimates can describe the same games without gating collection or setting the king purchase's target strength.

## Deferred work

- [x] Add a reusable head-to-head collector with declared-plan, identity and native-preflight callbacks for the two-stage bishop decision. Preserve earlier frozen collectors and source identities instead of copying another full collector for each new roster.
- [ ] In that future collector, make large EPD/sample exports optional. Keep compact source journals and manifests sufficient for exact regeneration; preserve the current run's frozen export behavior.
- [ ] Choose the king-upgrade direction after reserve playtesting. Keep capture-only royal changes archived while integrating the selected design with castling, checkmate and draw adjudication; retain one royal per side.
- [ ] Agree on queen/rook conversion goals and a consistent dead-position policy; guard grants remain an alternative design.
- [ ] Automatically split larger idea pools into capacity-bounded experiment groups; add general custom setups when a declared experiment needs them.
- [x] Freeze a reusable four-reference parent variant (Vanguard, Unicorn, Cruisader and Amazon) with w/x/y/z in slots 17–20, leaving slots 1–16 for future candidates. Keep this sandbox separate from completed studies; future batch FENs, evaluation policies and native checks remain explicit.
- [ ] Investigate ordinary/custom representation effects, material handicaps, wider openings, or evaluation overrides only for a concrete decision. Existing templates are optional research.
- [ ] Consider random armies, additional art/themes, and online play after the local design workflow is useful.

The original legacy executable's matching source remains unresolved; the current bundled LevelUp engine has recorded matching-source provenance in [stockfish/README.md](stockfish/README.md).

Keep releases playable, branch from tested milestones, and tag finished releases. Further tests are not an automatic queue.
