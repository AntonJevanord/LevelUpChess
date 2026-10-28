# Design shortlist

These are ideas for later human prototypes, not declared candidates or measured
values. They are excluded from the current mobility batch. Pick one or two
with a concrete design question before adding further balance games; prices
and levels would remain provisional.

| Idea | Tentative movement | Identity and question |
| --- | --- | --- |
| Scout guard | `fWbmF` | Move/capture one forward; retreat quietly on backward diagonals. Can a guard remain useful by changing files through retreat rather than gaining more capture targets? |
| Support pawn | `fmWfceFifmnDsW` | Ordinary forward movement/captures and clear home double, plus one-square sideways moves and captures. Helps nearby pawn chains without the old rank pawn's unlimited sideways range. |
| Travelling bishop | `BmC` | Bishop captures; quiet camel jumps cross blockers while retaining its square color. Tests development and repositioning rather than another capture compound. |
| Sidestep rook | `RmB2` | Ordinary rook attacks, with quiet clear diagonal slides up to two squares. A simpler positional alternative to a rook with many teleporting jumps. |

My first choices are Scout guard and Support pawn: both have short descriptions
and change where the piece can contribute. The bishop and rook offer similarly
readable mobility experiments at a later tier. Movement strings describe the
proposals; each would still need legal-move, blocker, promotion/drop and native
capability checks before being registered as an immutable design.

Judge whether the extra move creates an interesting choice and understandable
counterplay. Additional mobility is not automatically a small buff, and limiting
capture directions does not by itself establish a one-point value. Existing
reference and direct purchase matchups should remain separate outcomes.
