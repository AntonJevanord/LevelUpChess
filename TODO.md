# Roadmap

Version 15 completed its 1,120-game Amazon comparison; the manifest and all games replay correctly, with a Blink valuation confound identified before further design changes. Version 14 preserves the first revised workshop and 540-game plan; version 13 preserves reusable parallel-run tools. Earlier milestones are in [development history](docs/development-history.md).

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

## Deferred work

- [ ] Integrate independent capture-only king choices into the main browser board after royal identity, castling, mating tests, and asymmetric-king evaluation limits are handled. Keep one royal per side.
- [ ] Agree on queen/rook conversion goals and a consistent dead-position policy; guard grants remain an alternative design.
- [ ] Automatically split larger idea pools into capacity-bounded experiment groups; add general custom setups when a declared experiment needs them.
- [ ] Investigate ordinary/custom representation effects, material handicaps, wider openings, or evaluation overrides only for a concrete decision. Existing templates are optional research.
- [ ] Consider random armies, additional art/themes, and online play after the local design workflow is useful.

The original legacy executable's matching source remains unresolved; the current bundled LevelUp engine has recorded matching-source provenance in [stockfish/README.md](stockfish/README.md).

Keep releases playable, branch from tested milestones, and tag finished releases. Further tests are not an automatic queue.
