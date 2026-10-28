# Version-17 second-screen decisions

All **1,600 follow-up games** finished. The [combined report](../experiments/balance/results/v17-followup-001.report.md)
shows percentages for all fourteen level-3 designs on sixteen starts: nine
unchanged designs reuse their original eight cases, while five alternatives
have their own sixteen-case results. Every row contains 128 games, with 32
against each reference. Altered definitions are never pooled with predecessors.

Overall scores count draws as half a point and weight the four references
equally. They are a useful screen, but the opponent columns still matter:

| Design | Overall | Against Amazon | Original / new Amazon cases |
| --- | ---: | ---: | ---: |
| Mating bishop, short captures | 56.64% | 73.44% | 65.63% / 81.25% |
| Archbishop | 64.06% | 78.13% | 75.00% / 81.25% |
| Ranged rook | 59.77% | 75.00% | 71.88% / 78.13% |

These repeated matchup differences deserve targeted attention. A pooled score
inside 40–60% is not sufficient by itself. Conversely, sixteen fixed related
starts still do not establish precise strength or universal matchup odds.

## Bishop design

The Mating bishop's hybrid attacks can force costly exchanges. In the archived
knights-prefix game with the bishop as Black, `...Dh2+` leaves `Uxh2` as White's
only legal reply, followed by `...Bxh2+ Kxh2`. Here `D` is the upgraded bishop
and `U` is Amazon. Black trades **both the upgraded bishop and an ordinary
bishop** for Amazon. The exact source game is
`c25_bishop-purple-17-v-amazon_o14_knights-prefix_r1_b`; the
[regression check](../tests-unit/v17-followup-tactics.test.js) replays it and
verifies the forced response. This example does not explain every win in the
matchup or establish that every exchange was forced.

`BDC` is a coherent grid-bishop candidate: bishop rays, two-square orthogonal
jumps and camel jumps all preserve square color. It removes the current
bishop's attacks onto opposite-colored squares. It can still fork targets on
the same color, and its strength must be measured rather than inferred from
color restriction alone. Treat it as a separate replacement design, not a
silent change to the measured Mating bishop.

## Grants and pawns

Three `fF` grants scored **62.89%** overall: 57.81% on the original cases and
67.97% on the new cases. Compare two simple alternatives under the same finite
reserve rules:

- `fmWfceF`: quiet forward step and ordinary forward-diagonal captures. This
  is the preferred next candidate for a readable pawn-like guard. As a
  non-pawn reserve it has no promotion, double step or en-passant capture.
- `fW2`: move or capture one or two squares straight forward. The path must be
  clear; it cannot jump. Extra reach could be powerful, so it is not a
  guaranteed nerf relative to `fF`.

The two-step pawn scored **50.39%**, with 50.00% / 50.78% in the two cohorts.
Retain it as the promising level-1 pawn. The quiet-diagonal pawn remained weak
at **24.61%**, with 24.22% / 25.00%. Park that line rather than repeatedly add
small quiet-mobility buffs. If a second pawn identity is needed later, backward
diagonal captures are a distinct possibility, not a required immediate test.

The backward-capture Rook pawn is a reasonable default to retain: 46.09% overall
versus 43.75% for unlimited forward captures. Both meet the pooled target; this
small score gap does not establish a strength ranking, so movement identity and
human playtesting can decide between them.

## Bounded next step

The [next focused screen](version17-design-focus.md) now includes the grid
bishop, both grant ideas and the user's full-diagonal-capture pawn
`FfmWifmnD`. It adds three two-step pawns as a fifth opponent, keeping every
army at three upgrade points. Four candidates × five opponents × sixteen
starts × both colors gives **640 games**. No whole-roster rerun is needed.
Human-playtest these designs for clarity and counterplay; Archbishop and Ranged
rook remain separate matchup-review items.

This review schedules no games and changes no playable definitions. The exact
uploads, source hashes, cohort scores and full matchup percentages are retained
by the combined report's offline evidence audit.
