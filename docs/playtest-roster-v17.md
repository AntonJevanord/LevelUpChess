# Version-17 playable workshops

Choose **Version 17 · Roster and trials** under Rules to try the selected roster
and six new level-three trials together. Earlier family workshops remain available.
Click a starting pawn, choose its upgrade beside the board, then start the game.

| Cost | Pawn | Movement |
| ---: | --- | --- |
| 1 | Two-step pawn | `fmW2fceF2`: move one or two clear squares forward without capturing; capture one or two clear squares diagonally forward. Its two-step advance remains available after leaving the starting ranks. |
| 1 | King-step pawn | `mWFifmnD`: move one square in any direction; capture one square diagonally in any direction. A clear two-square advance is available from the home two ranks. |
| 2 | Knight pawn | `fmWfceFifmnDfhN`: ordinary pawn moves and captures, plus all forward knight jumps, including captures. |
| 2 | Rank pawn | `ifmnDmfWfceFsR`: ordinary forward advances and diagonal captures, plus moves and captures any clear distance sideways. Its initial two-step needs a clear path. |

All four replace the selected pawn and promote to an ordinary queen, rook, bishop
or knight. The King-step pawn's diagonal visit to an empty en-passant target is
quiet and leaves the bypassed pawn; the Two-step pawn can capture en passant.
The Two-step pawn is green; the King-step pawn is blue. Knight pawn is yellow;
Rank pawn is orange. The two-point designs are the [selected working references](v17-level2-review.md);
the next study checks direct matchups and stacking before permanent freezing.

The combined roster also retains three tested level-three designs:

| Piece | Movement | Behavior |
| --- | :--- | --- |
| Rook pawn | `mRcfB` | Move any clear distance orthogonally without capturing; capture any clear distance diagonally forward. Standard promotion remains. |
| Vertical bishop | `BvWvN` | Normal bishop moves, vertical single steps and tall knight jumps, including captures. |
| Ranged rook | `RC` | Normal rook moves and camel jumps, including captures. |

The four frozen references are red; other level-three pieces are purple.
Nightrider remains available as an exploration option. The six trial choices are
Blocked Vertical bishop `BvW2vnN`, Sideways Queen pawn `mQ2cfQ2`, Rook-ray queen
`QgR0`, and three-point `K`/`W3`/`N` grants. The queen hops over one piece only
on ranks and files; diagonal moves need a clear path. The full-X-ray `QgQ0`
prototype is excluded after its forced opening mate was found.

The earlier **Pawn workshop (bishop trial)** retains Bishop pawn at cost two.
It cannot capture en passant through its quiet diagonal move, but remains vulnerable to an
ordinary pawn after its initial double advance. Its earlier low bundle score
does not establish the new price. Returning pawn is parked in **Pawn workshop
(initial)**, which retains its original profile.

Every **Version 17** workshop also updates the one-point **Pawn grant** to
`fWmfF`: move or capture one square straight forward, or move one square
diagonally forward **without capturing**. Select the king during setup to buy it.
The ordinary royal king remains on the board; the nonroyal guard starts in reserve.
Drop it onto an empty square in your own half, spending a turn and giving no check.
The grant remains blue, cannot promote, and never refills the reserve when captured.
The two-point **Bishop grant** (`F`, the selected Diagonal grant) is also a working reference:
move or capture one square diagonally in any direction. It is green, nonroyal
and color-bound after deployment. It follows the same finite-reserve drop rules.
The new three-point grant trials are yellow and have distinct movement names.
They do not reprice the historical guards. Use the King workshop for the other
existing grants and costs.

Current family workshops appear before Version 16 in the Rules menu. They keep
the four frozen level-3 references and the other
[version-16 roster choices](playtest-roster-v16.md). The combined roster
contains twenty custom types. All seventeen earlier library profiles retain
their original movements, costs and saved identities.

The [combined mobility report](../experiments/balance/results/v17-mobility-001.report.md)
explains the one-point shortlist. The [level-two review](v17-level2-review.md)
records the later selection. The [384-game level-two check](level2-reference-validation-v17.md)
and [768-game revision screen](level3-revisions-v17.md) follow the completed
campaign. Historical experiments retain their original definitions and results.

The checked-in `index.html` already includes the updated workshop. For later
playable-only edits, `npm.cmd run build:playable` rebuilds the browser and its
Node rules facade while keeping `dist/balance-rules.cjs` untouched. The full
`build` command also regenerates research bundles, so finish an active frozen
campaign before using it.
