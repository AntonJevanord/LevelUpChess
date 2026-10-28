# Design shortlist

The [completed mobility review](../experiments/balance/results/v17-mobility-001.report.md)
supports playtesting two-step and king-step pawns, mobile-forward grants and
Scout grants. Mobile-forward grants have the narrowest spread against the four
references; Scout offers a different retreat ability but a weak Cruisader matchup.
These are provisional one-point candidates, not confirmed material values.

Park Support and full-diagonal pawns rather than repeat their unchanged tests.
Support scored 28.52% against references and 25.00% against two-step pawns;
Scout scored 45.31% and 48.39%. Support and Scout remain outside the playable
workshops. Two-step and King-step pawns and the mobile-forward Pawn grant are
available in the [Version 17 workshops](playtest-roster-v17.md). The bishop and
rook ideas below remain outside the completed budget; human playtesting the
shortlist comes before another large experiment.

| Idea | Tentative movement | Identity and question |
| --- | --- | --- |
| Scout guard | `fWbmF` | Playtest candidate: move/capture one forward and retreat quietly on backward diagonals. Check whether its file changes and Cruisader weakness allow enjoyable counterplay. |
| Support pawn | `fmWfceFifmnDsW` | Parked after testing: ordinary forward movement/captures and clear home double, plus sideways steps and captures, did not provide enough strength in the three-pawn purchase. |
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
