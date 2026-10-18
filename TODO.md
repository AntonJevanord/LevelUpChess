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
- [ ] Finish Windows playtesting of timed saved games and clock undo.
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
- [x] Pass 87 checks: 29 unit tests and 58 browser/integration tests.
- [ ] Playtest blue knights, setup budgets, and native engine play on Windows.
- [ ] Complete orange/purple knight rules before expanding to other piece families.
- [ ] Resolve remaining draft rules, extra starting pieces, promotions, and upgraded king victory rules.

## Later versions

- Complete all piece upgrades and balance their costs.
- Add low-budget, high-budget, and equal-budget random modes.
- Automate engine matches with saved progress and immediate/after-game stopping.
- Version balance results so rule changes can be compared.
- Add menus, settings, piece art, board palettes, and optional themes.
- Consider online casual/ranked play after local rules and balance are stable.

Keep each release playable. Create its branch from the previous tested milestone and tag the finished release.
