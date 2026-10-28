# Design shortlist

Support pawn and Scout guard are now one-point research candidates in the
[expanded mobility batch](version17-mobility.md). Their prices remain provisional.
The bishop and rook remain ideas for later prototypes, outside that game budget.

| Idea | Tentative movement | Identity and question |
| --- | --- | --- |
| Scout guard | `fWbmF` | Move/capture one forward; retreat quietly on backward diagonals. Can a guard remain useful by changing files through retreat rather than gaining more capture targets? |
| Support pawn | `fmWfceFifmnDsW` | Ordinary forward movement/captures and clear home double, plus one-square sideways moves and captures. Helps nearby pawn chains without the old rank pawn's unlimited sideways range. |
| Travelling bishop | `BmC` | Bishop captures; quiet camel jumps cross blockers while retaining its square color. Tests development and repositioning rather than another capture compound. |
| Sidestep rook | `RmB2` | Ordinary rook attacks, with quiet clear diagonal slides up to two squares. A simpler positional alternative to a rook with many teleporting jumps. |

Scout guard is registered as `king.reserve-pawn@7`, Support pawn as `pawn.blue@8`.
Both have legal-move, blocker, promotion/drop and native capability checks.
The bishop and rook offer similarly readable mobility experiments at a later
tier; they still need those checks before receiving immutable design IDs.

Judge whether the extra move creates an interesting choice and understandable
counterplay. Additional mobility is not automatically a small buff, and limiting
capture directions does not by itself establish a one-point value. Existing
reference and direct purchase matchups should remain separate outcomes.
