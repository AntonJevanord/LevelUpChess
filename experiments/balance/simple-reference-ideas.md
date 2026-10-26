# Simple reference candidates

These are candidates for a later declared comparison, not additions to the
current catalog or a queued balance run. Prefer a small set of readable ideas.

| Movement | Meaning | Recorded balance status |
| --- | --- | --- |
| `BsR` | Bishop diagonals plus unlimited horizontal movement/capture; a rank bishop. | Untested. Earlier tests used `BsR2sN` and `BsRsN`, both with wide knight jumps. |
| `RB` | Full rook and bishop movement: exactly queen movement. | Present in the user's family draft; no recorded scored campaign. |
| `RfB` | Rook plus unlimited forward-diagonal movement/capture. | No recorded scored campaign. |
| `RB2` | Rook plus diagonal slides of up to two clear squares. | Present in the family draft; no recorded scored campaign. |

The vertical analogue `BfbR` existed earlier; pawn direction and positions make
its evidence distinct from a horizontal bishop. The native/browser movement
check covers ten empty/blocked frames in an isolated [diagnostic profile](../designs/simple-references.ini),
including `RB` versus custom `Q`. The [record](results/simple-reference-movement-001.json)
contains values and move sets. It plays no balance games and measures no strength.

## Rook-to-queen as a comparison

The last independently reproduced convergence study gives ordinary rook
4.7794 under assumed queen = 9, so its fitted queen-minus-rook gap is about
4.2206. The final revision Markdown reports Amazon's added bonus as 3.89.
Their proximity makes upgrading a rook to queen movement a useful hypothesis
for an equal-cost reference. These are estimates from different datasets;
the new Markdown omits the ordinary-rook coefficient, so it does not establish
the exact current gap. The final JSON stores it in `currentEstimate.rook.value`.

`RB` is already queen geometry; adding nominal rook and bishop values is not
how its total strength is determined. A second queen changes army coordination
and exchange options. Preserve the upgraded rook's castling rights and test its
whole-army benefit, rather than assuming equal deltas guarantee equal results.

The isolated diagnostic also finds slightly different automatic values for a
custom queen-equivalent and the ordinary queen: custom `Q` is 2590/2590 raw,
ordinary queen 2538/2682. A clean queen-movement reference should explicitly
use the ordinary queen's prior or an ordinary queen representation, with role
and castling behavior verified. Matching priors alone does not prove identical
custom-piece search behavior.

Prioritize `BsR` and rook-to-queen for simple design review. `RfB` and `RB2`
provide direction-limited and range-limited alternatives if a later decision
needs them. Freeze any resulting roster, evaluation policy, positions and cap
before collecting games; the current experiment remains closed at its cap.
