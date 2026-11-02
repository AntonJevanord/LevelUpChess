# Betza notation in LevelUpChess

Use Fairy-Stockfish Betza, with **uppercase movement atoms** and **lowercase
modifiers**. Spelling is case-sensitive: the Vertical bishop is `BvW2vnN`, with
lowercase `v` in both places.

## Accepted level-three spellings

These are the exact catalog strings. Color is presentation; a frozen research
reference keeps its identity when a workshop color changes.

| Piece | Catalog Betza | Stable design ID |
| --- | --- | --- |
| Queen pawn | `mQ2cfQ2` | `pawn.queen-sideways@1` |
| Vertical bishop | `BvW2vnN` | `bishop.vertical-blocked@1` |
| Unicorn | `NC` | `knight.purple@3` |
| Vanguard | `RfB` | `rook.purple@10` |
| Amazon | `QN` | `queen.purple@1` |
| Rook pawn | `mRcfB` | `pawn.purple@13` |
| Cruisader | `BsR2nsN` | `bishop.purple@13` |
| Nightrider | `N0` | `knight.purple@4` |
| Ranged rook | `RC` | `rook.purple@12` |
| X-ray queen | `QgB0` | `queen.purple@7` |

`BsW2snN` gives the same tested movement as `BsR2nsN`: `W2` and `R2` both
provide clear orthogonal slides of up to two squares, restricted sideways here;
`snN` and `nsN` both select the blocked wide-knight moves. Keep the frozen
`BsR2nsN` string in stored definitions. The alias test compares all four
combinations across 984 single-blocker positions, both colors and four origins,
in browser/WASM and native rules. This is targeted compatibility evidence,
not a general guarantee that arbitrary modifier reorderings are interchangeable.

## Writing new designs

- Concatenate independent components: `RfB` means rook movement plus forward
  bishop movement. A modifier applies to the following atom, not every component.
- Prefer familiar atoms: `W` orthogonal step, `F` diagonal step, `N` knight,
  `D` orthogonal two-square jump, `A` diagonal two-square jump, `C` camel,
  `Z` zebra, and `B/R/Q/K` their usual movement patterns.
- Use `m` for quiet moves only and `c` for captures only. Without either, the
  component normally permits both. Put modifiers immediately before their atom;
  preserve tested spellings such as `fmW`, `cfB` and `fceF`. Do not automatically
  sort modifiers or rewrite old strings.
- Use lowercase `f/b/s/v` for forward, backward, sideways and vertical.
  Directions are relative to the piece's color. On a knight, `sN` selects wide
  jumps and `vN` tall jumps. Use the tested `fhN` when all four forward knight
  jumps are intended.
- Put a finite range after its atom: `R2` reaches one or two clear orthogonal
  squares. `N0` repeats knight leaps along a ray; intervening landing squares
  must remain clear. `WD` jumps over the intermediate square on its two-square
  component, unlike `W2`.
- Preserve explicit special modifiers: `n` adds supported blocking behavior,
  `g` denotes a hopper component, `e` enables the en-passant component and `i`
  restricts a component to the configured initial region. `i` is not a stored
  "has never moved" flag. Use tested examples such as `ifmnD`; do not assume
  every atom supports every modifier.

For the blocked bishops, `d4–f5` checks `e4` only (Cruisader); `d4–e6` checks
`d5` only (Vertical bishop). Neither checks both squares of an imagined bent
path. New descriptions should say which intermediate square blocks the move.

Keep each definition's exact Betza string, immutable ID, pawn/castling roles and
promotion/drop settings together. Movement text alone does not specify royal
status, en passant, promotion or reserve rules. Verify a new definition with
friendly blockers, enemy blockers, captures and both colors in native and WASM
rules before collecting scored games. Changed behavior gets a new revision;
aliases never silently rewrite archived profiles or research identities.

Validation: `node --test tests-unit/betza-aliases.test.js`.
