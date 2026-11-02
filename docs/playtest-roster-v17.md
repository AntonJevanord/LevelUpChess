# Version-17 playable roster

Choose **Version 17 · Roster and king trials** under Rules. Click a starting
piece and choose its upgrade beside the board. Changes apply when you start a
game. Earlier family workshops and their eighteen saved profile identities
remain available.

## Level-one and level-two pawns

| Cost | Pawn | Movement |
| ---: | --- | --- |
| 1 | Two-step pawn | `fmW2fceF2`: move one or two clear squares forward; capture one or two clear squares diagonally forward. Two-step movement remains available after leaving home ranks. |
| 1 | King-step pawn | `mWFifmnD`: move one square in any direction; capture one square diagonally in any direction. Initial clear two-step advance. |
| 2 | Knight pawn | `fmWfceFifmnDfhN`: ordinary pawn advances/captures plus all four forward knight jumps, including captures. |
| 2 | Rank pawn | `ifmnDmfWfceFsR`: ordinary forward advances/diagonal captures plus moves and captures any clear distance sideways. Initial clear two-step advance. |

All four replace the chosen pawn and promote to ordinary Q/R/B/N. King-step's
quiet diagonal visit to an empty en-passant target leaves the bypassed pawn;
Two-step can capture en passant. Two-step is green, King-step blue, Knight yellow
and Rank orange. The L2 definitions stay unchanged while the
[mixed-package review](v17-mixed-panel-review.md) supports testing narrower tall
Knight-pawn jumps. Prototype revisions remain separate from the playable pawn.

## Level-three roster

The four red research references remain Vanguard `RfB`, Unicorn `NC`, Crusader
`BsR2nsN` and Amazon `QN`. The other selected choices are purple:

| Piece | Movement | Behavior |
| --- | :--- | --- |
| Ranger (Rook pawn) | `mRcfB` | Move any clear distance orthogonally without capturing; capture any clear distance diagonally forward. Standard promotion. |
| Herald (Queen pawn) | `mQ2cfQ2` | Move quietly up to two clear squares in any queen direction; capture straight or diagonally forward up to two squares. Sideways/backward moves cannot capture. Standard promotion. |
| Nightrider | `N0` | Repeat knight leaps along a line, stopping at an occupied landing square. |
| Inquisitor (Vertical bishop) | `BvW2vnN` | Normal bishop moves, clear vertical moves up to two squares, and tall knight moves blocked on their first vertical square. |
| Cataphract (Ranged rook) | `RC` | Normal rook moves plus camel jumps, including captures. |
| Wraith (X-ray queen) | `QgB0` | Normal queen moves plus diagonal hops over one piece, landing before or capturing the next blocker if it is an enemy. Orthogonal moves cannot hop. |

The [latest review](v17-roster-confirmation.md) confirms the bishop and Queen
pawn. Nightrider and the diagonal-X-ray queen remain exploration choices.
The stronger Rook-ray queen `QgR0` stays in the archived trial workshop. Full
X-ray `QgQ0` is absent from every playable library because of its forced opening
mate.

## King purchases and reserve grants

The ordinary royal king stays on the board. A purchase adds a finite nonroyal
piece to reserve. Deployment spends a turn, uses an empty square in your own
half and cannot give check. Captured guards disappear; reserves never refill,
and guards do not promote.

| Cost | Grant | Movement | Color / status |
| ---: | --- | :--- | --- |
| 1 | Pawn grant | `fWmfF`: forward step/capture; quiet forward diagonal step | Blue |
| 2 | Bishop grant | `F`: diagonal single steps/captures | Green |
| 3 | Sliding Orthogonal grant | `W2`: clear orthogonal moves/captures up to two squares | Yellow / trial |
| 3 | Warden | `WD`: orthogonal one-step or two-square jump, including captures | Yellow / working choice |
| 4 | King grant | `K`: single steps/captures in all directions | Orange / candidate |

Warden scored 55.21% in the mixed-study grant panel. W2 scored 66.67%; retain
its trial status and the separate opponent/context evidence. Neither result
changes a frozen reference. The four-point price is the existing historical King-grant identity, not a new
balance finding. A dedicated four-point study remains pending. Other historical
grants and costs remain in the King workshop.

## Build and history

The checked-in `index.html` includes this roster. For playable-only edits,
`npm.cmd run build:playable` rebuilds the browser and Node rules facade without
rewriting `dist/balance-rules.cjs`. The full build also regenerates research
bundles, so finish an active frozen campaign before using it.

The [mobility report](../experiments/balance/results/v17-mobility-001.report.md),
[L2 selection](v17-level2-review.md), [L3 confirmation](v17-level3-review.md) and
[latest validation archive](../experiments/balance/results/v17-validation-001.report.md)
retain the earlier decisions and results. Historical definitions and prices are
preserved under their original IDs.
