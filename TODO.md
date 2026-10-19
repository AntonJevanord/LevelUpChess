# Roadmap

## Version 01 — playable foundation

- [x] Offline browser board for two local players.
- [x] Standard legal moves, checkmate, and draw detection.
- [x] Castling, en passant, and selectable promotion.
- [x] Move history, undo, board flip, and new game.
- [x] Responsive layout, keyboard controls, and browser tests.
- [x] User playtest confirmed that basic chess works.
- [x] Preserve version 01 in a local commit and `v0.1.0` tag; branch to `version_02`.

## Version 02 — engine play

- [x] Add a local Node/UCI bridge for the bundled Windows executable.
- [x] Add opponent selection, human side, and three difficulty presets.
- [x] Show connection/search errors with retry and local-play fallback.
- [x] Add pause/resume, safe cancellation on reset, and full-turn undo.
- [x] Keep direct HTML local play working without companion files.
- [x] Test browser controls, stale responses, input validation, and real engine play.
- [x] Include the upstream GPL license and document binary/source provenance gaps.
- [x] Playtest the bundled Windows executable through `npm.cmd start` on Windows.
- [ ] Establish the original executable's exact upstream release and matching source.
- [x] Add optional clocks with presets, increments, and explicit start/pause/resume.
- [x] Stop play on timeout; cancel engine searches and export the timed result.
- [x] Restore clocks with undo and browser saves; load old saves untimed.
- [x] User playtest confirmed clocks and losing on time work.
- [x] User playtest confirmed timed saves and clock undo work.
- [x] Add one browser save slot with moves and play settings.
- [x] Add PGN download, paste import, and file import.
- [x] Validate imports before replacement; preserve history and special-move rights.
- [x] Pause the engine after loading and reject obsolete search responses.
- [x] Pass clock-model unit tests and browser/integration tests, including timed saves and PGN round trips.
- [x] User playtest confirmed saving/loading and PGN import/export work.
- [x] Preserve the tested version 02 as `v0.2.0`; continue upgrades on `version_03`.

Version 02 cloud integration used a Linux source build; the user playtested its Windows executable. Difficulty presets control engine skill and search time; they are not Elo ratings.

## Version 03 — first upgrades

- [x] Extract and validate the blue-knight `NmW` rule from `Example.txt`.
- [x] Add individual starting-knight selection and a per-side upgrade budget.
- [x] Implement level 1 knights using Fairy Stockfish rules in the browser and engine.
- [x] Show a blue accent and L1 badge while preserving White/Black contrast.
- [x] Support undo, clocks, saved games, and variant PGN import/export.
- [x] Embed browser rules in the standalone HTML for offline local play.
- [x] Include the browser rules library's matching source archive and GPL notice.
- [x] Pass 115 checks: 44 unit tests and 71 browser/integration tests.
- [x] User playtest confirmed blue knights and native engine play work on Windows.
- [ ] Finish Windows playtesting of setup budget limits.
- [x] Confirm orange `NsD` and purple `D` movements with the project owner.
- [x] Add orange knights and extra purple pieces with correct starting placement.
- [x] Support levels 0–3, separate 1–6 point budgets, and mixed armies.
- [x] Preserve old blue saves; restore all new setup levels from saved games and PGN.
- [x] Verify jumps, king safety, mixed armies, persistence, and native Stockfish for both new levels.
- [x] User playtest confirmed the knight upgrades work; purple mobility needs improvement.
- [ ] Finish Windows playtesting of mixed-budget armies.
- [x] Preserve the knight-family build as `v0.3.0`; improve purple and add other families in version 04.
- [ ] Resolve remaining draft rules, extra starting pieces, promotions, and upgraded king victory rules.

## Version 04 — more piece families

- [x] Improve purple knights to one- or two-square orthogonal moves/captures (`WD`), preserving jumps.
- [x] Preserve version 03 movement under its original variant ID for old saves and PGNs.
- [x] Add individual pawn, bishop, and queen choices alongside knight upgrades.
- [x] Apply one per-side budget of 1–39 points across all 26 upgradeable starting pieces.
- [x] Add blue, orange, and purple bishops; purple replaces the starting bishop.
- [x] Add orange quiet-knight-jump queens and purple amazon queens.
- [x] Add all three pawn levels with standard queen/rook/bishop/knight promotions.
- [x] Keep kings royal and preserve standard checking and castling rules.
- [x] Share current rules between offline browser play and the native engine bridge.
- [x] Retain clocks, undo, saves, PGN, and next-game setup recovery across both variant versions.
- [x] Pass 180 checks: 83 unit tests and 97 browser/integration tests, including native pawn-rule comparisons and engine play.
- [x] User playtest confirmed version 04 works; blue queen remains deferred.
- [ ] Playtest current pawn promotions, en passant, mixed armies, and budgets on Windows.
- [ ] Playtest bishop/queen upgrades and the improved purple knight with the bundled engine.
- [x] Choose supported blue-queen home-rank jumps for version 05 with the project owner.
- [x] Define supported rook upgrades and implement custom castling in version 05.
- [ ] Design per-side royal king upgrades, retaining checkmate and defining check rules for any extra king.
- [x] Preserve version 04 as `v0.4.0`; continue remaining upgrades on `version_05`.

## Version 05 — home-rank abilities and rooks

- [x] Add blue queens: normal queen plus quiet (1,2), (1,3), and (2,3) jumps on the home two ranks.
- [x] Add blue rooks: normal rook plus quiet two-square orthogonal jumps on the home two ranks.
- [x] Add orange rooks: normal rook plus captures across exactly one intervening piece.
- [x] Add purple rooks: normal rook plus jump-captures throughout the surrounding 5×5 area.
- [x] Let all upgraded rooks castle with the royal king under normal safety and castling-right rules.
- [x] Add all rook and queen levels to setup, with 30 starting choices and a 1–45 point budget per side.
- [x] Preserve version 04 and version 03 profiles, saves, PGNs, and original budgets.
- [x] Keep standard pawn promotions and shared browser/native configurations.
- [x] Check required engine abilities before searching; explain incompatible engines and retain local play.
- [x] Keep saved clock state and time-forfeit results consistent when saving at the deadline.
- [x] Preserve blue-queen jumps through FEN, PGN, saves, and engine replies.
- [x] Pass 250 checks: 130 unit tests and 120 browser/integration tests, including native engine comparisons and play.
- [ ] Playtest home-rank jumps, screen captures, and custom castling with a current Windows engine.
- [ ] Playtest mixed armies, budgets, saves, undo, and timed games on Windows.
- [ ] Balance upgrade abilities within the fixed level costs after playtesting.

### Patch v0.5.1 — Windows engine compatibility

- [x] Record Windows failures with blue-queen home-rank checks, required pawn promotions, and blue-rook engine exit.
- [x] Make a matching-source LevelUp Windows executable the default; retain the original executable unchanged.
- [x] Include matching source, a cross-build script, and a manifest recording the new executable's provenance.
- [x] Isolate capability checks by piece family and explain engine exits during checks.
- [x] Keep custom engine-path overrides and document updating or removing stale overrides.
- [x] Reproduce all three failures with the original Windows executable under Wine.
- [x] Pass 135 unit tests with Linux-native and Windows-under-Wine engines, including 56 isolated native/browser move-set comparisons.
- [x] Pass all 120 existing browser/API tests and six new blue-queen, blue-pawn, and blue-rook regressions.
- [x] Run all 14 native browser/API cases with the bundled Windows executable under Wine, including legacy rules, mixed armies, pause/resume, and undo.
- [x] User reports the patched bundled engine works on Windows.

The blue queen's draft back-rank teleport remains an optional engine extension. Version 05 uses supported conditional jumps instead. King experiments continue separately in version 06; each side keeps a clear checkmate rule.

## Version 06 — king prototype

- [x] Preserve version 05 as `v0.5.1` and start `version_06`.
- [x] Select capture-only royal bonuses for the first prototype: sideways, orthogonal, then orthogonal plus diagonal two-square jumps.
- [x] Ship a separate offline local-play board with all three tiers, a standard baseline, practice positions, FEN loading, undo, and promotions.
- [x] Verify 138 positions for both colors against browser/native Linux rules and the Windows executable under Wine, including blockers, safe landings, royal attacks, castling, and mating examples.
- [x] Identify single-knight mating positions enabled by royal attacks; avoid premature ordinary-material draws in the prototype.
- [x] Pass 135 unit tests and 160 browser/API cases across the main game and king prototype, including repetition, fifty-move draws, and undo.
- [x] User playtest approved the capture-only king prototype for initial balance experiments.
- [ ] Integrate independent king levels with other upgrades, setup budgets, saves, PGN, and engine play.
- [x] Use explicit mate, stalemate, repetition, and fifty-move rules in experiments; avoid premature minor-material draws.
- [x] Preserve the confirmed prototype as `v0.6.0`; continue on `version_07`.

## Version 07 — balance testing

- [x] Add configurable paired self-play with colors swapped and seeded opening order.
- [x] Support every current upgrade, independent king levels, and ordinary material handicaps in the harness.
- [x] Preflight opening legality for every scheduled army/color assignment and validate native move sets.
- [x] Save run identities, full games, move checkpoints, summaries, and PGN.
- [x] Add immediate, after-game, and after-pair stopping, plus interrupted-game resume.
- [x] Keep engine failures, cancellation, and move-limit truncations unscored.
- [x] Report complete-pair scores, opening coverage, and conditional uncertainty without assigning intrinsic piece Elo.
- [x] Supply smoke, three-point-budget, individual-upgrade, strength-sweep, and ordinary-material anchor configurations.
- [x] Pass 231 unit/integration checks with the native engine, including cancellation, resume, and all upgrade capabilities.
- [x] Finish an eight-game smoke run and four full native pilot games; retain these as workflow validation, not balance evidence.
- [x] Pass all 160 existing browser/API cases after adding the harness build.
- [x] User ran the harness on Windows; engine preflight and four games worked before a OneDrive checkpoint replacement failure.
- [x] Add bounded retries for transient Windows sharing errors while preserving atomic checkpoints and primary errors.
- [x] Recover the latest interrupted history from the journal and permit the exact reviewed recovery patch to resume version 0.7.0 runs.
- [x] Pass 247 unit/integration checks with injected file-sharing failures; resume an actual pre-patch run without changing its manifest or journal.
- [ ] Confirm checkpoint retries and resumed smoke completion on Windows after the patch.
- [ ] Collect broad paired-opening results at several search budgets before assigning material ranges.
- [ ] Investigate completion rates, opening sensitivity, king evaluation limits, and outlier games before changing movement.
- [ ] Add per-piece behavior revisions and an evidence ledger; preserve old results and prioritize changed pieces by coverage and uncertainty.
- [ ] Add targeted starting positions and special-ability usage counts alongside full-game comparisons.

## Later versions

- [x] Draft king design options, engine constraints, and balance candidates in [DESIGN.md](DESIGN.md).
- [x] Keep costs equal to level (1/2/3) and target increasing strength, allowing distinct or cumulative abilities.
- [x] Distinguish fixed upgrade costs from estimated material; record base-plus-level values as provisional targets.
- [x] Keep royal abilities and 1/2/3-value guard grants open; the extra-piece approach remains provisional.
- [x] Record playtest impressions: strong orange/purple rooks and purple pawns, weaker blue/orange pawns.
- [x] Choose the capture-only king tier progression for the first prototype.
- [ ] Agree on minimum mating material and confirm the progression after playtesting.
- [ ] Prototype one king design and verify independent setup, checkmate, castling, draws, saves, and PGN.
- [x] Plan concrete balance tests with separate army scores, engine-strength compensation, and material anchors.
- [ ] Estimate material ranges from collected results, including uncertainty and interactions.
- [ ] Compare selected upgrades at budgets 3 and 6 with colors swapped; record rules, budgets, and conversion results.
- Complete all piece upgrades and tune their abilities to the fixed level costs.
- Add low-budget, high-budget, and equal-budget random modes.
- [x] Automate engine matches with saved progress and immediate/after-game stopping.
- Version balance results so rule changes can be compared.
- Add menus, settings, piece art, board palettes, and optional themes.
- Consider online casual/ranked play after local rules and balance are stable.

Keep each release playable. Create its branch from the previous tested milestone and tag the finished release.
