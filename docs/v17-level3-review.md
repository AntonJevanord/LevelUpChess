# Level-three confirmation — 2026-11-02

The five-stage campaign has finished all **6,752 scheduled games**: 6,749
completed results, three unscored 400-ply truncations and no errors or retries.
Removing the completed partners of truncated games leaves 6,746 scored games
in complete color-swapped pairs. The final level-three stage contributed 2,048
finalized games, 2,047 completed results and 2,046 scored paired games. Its one
truncation was Archbishop versus Unicorn; it does not affect the selections below.

| Retained design | Existing ID / movement | Vanguard | Unicorn | Cruisader | Amazon | Overall | First / second eight |
| --- | :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| Vertical bishop | `bishop.purple@18` / `BvWvN` | 43.75% | 48.44% | 54.69% | 48.44% | 48.83% | 50.78% / 46.88% |
| Rook pawn, long forward captures | `pawn.purple@13` / `mRcfB` | 40.63% | 57.81% | 46.88% | 46.88% | 48.05% | 46.09% / 50.00% |
| Ranged rook | `rook.purple@12` / `RC` | 59.38% | 57.81% | 40.63% | 54.69% | 53.13% | 53.91% / 52.34% |

Each row has 128 completed games over sixteen fixed prefixes, four equally
weighted references and both colors. Scores count draws as half a point. Retain
these exact tested definitions for the playable roster. They do not replace the
four frozen research references: Vanguard, Unicorn, Cruisader and Amazon.

Keep the Nightrider as an interesting alternative. It scored 40.23% overall and
28.13% against Cruisader, but only 44.27% across the other three opponents.
The counter explains part of its result, rather than establishing otherwise
equal strength. No additional unchanged Nightrider run is scheduled.

The original Queen pawn scored 41.02%, ranging from 15.63% against Vanguard to
59.38% against Amazon. X-ray queen scored 40.23%, with a substantial White/Black
split, 57.81%/22.66%. These are reasons to inspect opponent and color results,
not to fit an individual piece Elo or require every interesting design to score
exactly 50%.

The [new 768-game trial](level3-revisions-v17.md) tests six new cost-three IDs
against the four unchanged references on sixteen predeclared cases:

- `BvW2vnN`: retain the current Vertical bishop while trying a clear vertical
  two-step and blocked tall-knight moves. The knight leg checks its first
  vertical square, matching the Cruisader's first-square blocker convention.
- `mQ2cfQ2`: Queen pawn gains quiet sideways movement; captures remain limited
  to forward straight and forward diagonal lines, up to two clear squares.
- `QgR0`: Queen keeps ordinary moves and gains one-hurdle X-ray movement along
  rook lines. Bishop moves need a clear path. The next blocker stops an X-ray
  ray; no knight ability is added.
- Finite `K`, `W3` and `N` grants at experimental cost three. Ordinary royal
  kings remain on the board. The existing cost-four `K` grant and cost-two
  `W3` research identity retain their historical prices.

The proposed all-direction `QgQ0` was rejected before any balance games: from
the starting position, `1.Qh5+` forces `1...g6`, followed by `2.Qe5#`. Forced
opening prefixes would conceal that defect. Keep a regression for the rejected
line and check the rook-only replacement at the actual starting position.

A knight grant is a useful purchase-budget check, but ordinary material value
does not determine its result: deployment spends a turn, the player chooses an
empty home-half square, and the grant adds a separate capturable piece. Checking
drops and recycling captures into reserve remain disabled.

The [new value receipt](../experiments/designs/v17-level3-revision-values.json)
records automatic tables separately from applied search priors. Movement
revisions and `W3` retain the earlier applied values; new `K` and `N` grants use
their measured custom-piece raw values. Nothing is fitted from game outcomes,
and the original 72-design calibration remains unchanged.

The six trials add 768 games; the separate selected-level-two validation adds
384, for **1,152 new games**. Neither repeats the sibling screens or changes
the completed campaign. Review repeated matchup problems and human playtests
before making further changes; an interesting exploration option can remain
outside a strict target band.

The [archived final-stage report](../experiments/balance/results/v17-level3-001.report.md)
reproduces exactly from the pinned uploads. Original manifests and native proof
were not supplied, and moves were not independently replayed. Verify offline
with `node scripts/balance/v17-level3-evidence.js`.
