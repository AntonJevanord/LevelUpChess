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
- [ ] Record the bundled executable's exact upstream release and matching source before redistribution.
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

Linux integration was verified with an upstream Fairy Stockfish source build. The bundled Windows executable was not executed in the cloud environment. Difficulty presets control engine skill and search time; they are not Elo ratings.

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
- [ ] Playtest current pawn promotions, en passant, mixed armies, and budgets on Windows.
- [ ] Playtest bishop/queen upgrades and the improved purple knight with the bundled engine.
- [ ] Confirm balance and settle the blue queen's movement.
- [ ] Define supported rook upgrades and validate custom castling with the Windows engine.
- [ ] Design per-side royal king upgrades, retaining checkmate and defining check rules for any extra king.
- [ ] Tag the tested version 04 milestone.

## Later versions

- Complete all piece upgrades and balance their costs.
- Add low-budget, high-budget, and equal-budget random modes.
- Automate engine matches with saved progress and immediate/after-game stopping.
- Version balance results so rule changes can be compared.
- Add menus, settings, piece art, board palettes, and optional themes.
- Consider online casual/ranked play after local rules and balance are stable.

Keep each release playable. Create its branch from the previous tested milestone and tag the finished release.
