# Roadmap

## Version 01 — playable foundation

- [x] Offline browser board for two local players.
- [x] Standard legal moves, checkmate, and draw detection.
- [x] Castling, en passant, and selectable promotion.
- [x] Move history, undo, board flip, and new game.
- [x] Responsive layout, keyboard controls, and browser tests.
- [ ] Playtest on the target Windows computer before tagging `v0.1.0`.

## Version 02 — engine play

- Choose a local Windows bridge or browser-compatible Fairy Stockfish build.
- Verify engine provenance, license, and required redistribution files.
- Add engine connection status, side selection, difficulty, and cancellation.
- Add clocks and optional saved games.

## Version 03 — first upgrades

- Resolve unfinished rules in `Example.txt`; validate them with Fairy Stockfish.
- Add a setup phase with upgrade descriptions and a configurable budget.
- Implement and test one piece family before expanding to all six.
- Handle extra starting pieces, promotion choices, and upgraded king victory rules.
- Distinguish levels by color and visible labels, preserving side contrast.

## Later versions

- Complete all piece upgrades and balance their costs.
- Add low-budget, high-budget, and equal-budget random modes.
- Automate engine matches with saved progress and immediate/after-game stopping.
- Version balance results so rule changes can be compared.
- Add menus, settings, piece art, board palettes, and optional themes.
- Consider online casual/ranked play after local rules and balance are stable.

Keep each release playable. Create its branch from the previous tested milestone and tag the finished release.
