# Knight-pawn capture modes

These rule prototypes preserve all four forward knight destinations but change
the **two-forward, one-sideways** component. The **one-forward, two-sideways**
component `fsN` keeps both moves and captures.

| Prototype | Betza |
| --- | --- |
| Tall jumps capture only | `ifmnDfmWfceFfsNfceN` |
| Tall jumps quiet only | `ifmnDfmWfceFfsNfmN` |

The first is the user's proposed ordering, with `e` after each explicit pawn
capture modifier. All new pawn designs should follow that convention. Pawn and
en-passant roles must also be configured; notation alone does not supply those
variant rules. Existing archived definitions and running studies retain their
original identities.

In this engine, `fN` selects the two tall forward knight targets and `fsN` the
two wide targets. `fhN` selects all four. Do not substitute `fvN`: its behavior
is not the intended forward-only split in this build.

Both prototypes keep ordinary quiet forward steps, diagonal forward captures,
the clear initial double advance and mandatory Q/R/B/N promotion. Capture-only
`fceN` can capture en passant by landing on the en-passant target through a tall
knight jump. The checking-pawn fixture proves that the bypassed pawn disappears
and the king escapes check. Both colors agree between native and browser rules.

The negative fixture disables the custom type's en-passant role. In this build,
that role can enable en passant for capture components even when `e` is omitted;
we retain explicit `ce` spelling for clarity. A quiet-only tall jump cannot make
that en-passant capture.

Run `node --test tests-unit/v17-knight-pawn-modes.test.js`.
This performs movement/perft fixtures without searches or scored games. Neither
prototype is imported into the live catalog yet, preserving the current panel's
resume identity. A future acceptance study should compare both with the current
Knight pawn using matched partners and placements before selecting a replacement.
