# Official references — version 16

Version 16 is complete. These four three-point replacement upgrades are the
fixed benchmarks for future design work:

| Name | Stable design ID | Betza | Standalone letter / slot |
| --- | --- | --- | --- |
| Vanguard | `rook.purple@10` | `RfB` | w / 17 |
| Unicorn | `knight.purple@3` | `NC` | x / 18 |
| Cruisader | `bishop.purple@13` | `BsR2nsN` | y / 19 |
| Amazon | `queen.purple@1` | `QN` | z / 20 |

The [machine-readable snapshot](../experiments/designs/official-references-v16.json)
and [standalone INI](../experiments/designs/official-references-v16.ini) preserve
this roster. Temporary letters in older experiments retain their older meanings.
The standalone profile leaves custom slots 1–16 for future candidates; matched
test positions and campaign settings must be declared separately. The helper
[`scripts/balance/official-references.js`](../scripts/balance/official-references.js)
provides the roster, candidate/reference comparisons, and native-value checks.

Vanguard adds forward diagonal bishop rays to a rook and can castle normally.
Unicorn combines knight and camel jumps. Cruisader combines bishop movement,
clear horizontal slides of up to two squares, and wide-knight moves blocked by
their first sideways leg. For d4–f5, e4 blocks the move; f4 does not. Amazon
combines queen movement and knight jumps. None adds a unit or changes the royal
king. All capture rules follow the stated movement, and ordinary pawn promotion
remains Q/R/B/N.

`BsR2nsN` is the canonical tested spelling for Cruisader. Preserve it in the
frozen snapshot rather than changing an existing historical definition or
relying on another ordering of modifiers.

## Decision evidence

The [final report and audit](../experiments/balance/results/bishop-decision-final-001.report.md)
close all nine bishop/reference matchups at 256 games each. Retained histories
filled every restoration cell; the report records 1,280 new comparison games,
no errors and no truncations.

| Cruisader against | W / D / L | Points score | Conditional 95% range |
| --- | --- | ---: | --- |
| Vanguard | 112 / 42 / 102 | 51.95% | 46.68%–56.84% |
| Unicorn | 95 / 54 / 107 | 47.66% | 41.99%–53.32% |
| Amazon | 116 / 33 / 107 | 51.76% | 46.29%–58.01% |

These ranges use 200 whole-opening resamples over the 128 selected position
groups. They describe uncertainty within those positions and recorded policies,
not a 95% guarantee of balance across all chess positions. The results support
choosing Cruisader without another bishop batch.

### Complete reference matchup table

Each cell is the row piece's army points score against the column piece's army;
draws count as half a point. The references replace their ordinary counterparts
in otherwise matched armies, so this compares upgrade purchases rather than
equal numbers of isolated pieces.

| Row against column | Vanguard | Unicorn | Cruisader | Amazon |
| --- | ---: | ---: | ---: | ---: |
| Vanguard | — | 50.98% | 48.05% | 52.73% |
| Unicorn | 49.02% | — | 52.34% | 51.18% |
| Cruisader | 51.95% | 47.66% | — | 51.76% |
| Amazon | 47.27% | 48.82% | 48.24% | — |

Each matchup has 256 paired games except Unicorn/Amazon, which has 254.
The [six-pair evidence table](../experiments/balance/results/bishop-decision-final-001.report.md)
retains W/D/L, conditional ranges and source contexts. Separate studies are not
pooled or treated as one simultaneous confidence statement.

### Latest fitted material estimates

These are the combined estimates from the completed
[five-bishop material report](../experiments/balance/results/bishop-reference-001.report.md),
before the final decision-only run. Pawn = 1 and queen = 9 are assumptions. The
same fit estimates ordinary knight 2.77, bishop 3.09 and rook 4.64.

| Reference | Ordinary counterpart | Added value | Estimated whole piece |
| --- | ---: | ---: | ---: |
| Vanguard | Rook: 4.64 | +3.34 | 7.98 |
| Unicorn | Knight: 2.77 | +3.48 | 6.25 |
| Cruisader | Bishop: 3.09 | Not fitted | Not fitted |
| Amazon | Queen: 9.00 | +3.78 | 12.78 |

Conditional 95% ranges for the added values are Vanguard 3.14–3.54, Unicorn
3.29–3.69 and Amazon 3.59–4.03. Whole-piece point estimates add the ordinary value
and bonus from that same fit; their uncertainty is not the sum of separate
interval endpoints. Cruisader has no material fit: near-even matchup results
do not determine an exact exchange value. These contextual estimates are
separate from the engine's internal MG/EG units and the three-point purchase
costs. No new material fit or match games were run for this summary.

The final new-game journal and campaign manifests were not supplied. The
separately uploaded journal duplicates the already replayed five-bishop/RfB
study. Preserve the local decision folder for later independent replay; the
new decision outcomes are report-only evidence in this checkout. No games need
to be repeated to fill that archival gap.

The [subsequently retained revision journal](../experiments/balance/results/reference-revisions-retained-001.report.md)
restores all 4,608 older revision histories and the short-side bishop's missing
192 games. It predates Cruisader and supplies none of its decision games.

## Future experiments

1. Playtest a small set of candidates for readability, fun and counterplay.
2. Give changed designs new immutable identities. Test candidates against the
   frozen references, keeping every candidate/reference result visible. Do not
   schedule candidates against one another or rerun the reference round robin.
3. Declare matched positions, complete color pairs, engine/search settings,
   evaluation policy, checkpoints and a game cap before starting. Reuse
   compatible unchanged games and retain their source contexts.
4. Decide at the cap: keep, revise, park or defer. A 40%–60% points-score band is
   a practical screen; matchup patterns, uncertainty and human feedback matter.
   A future confirmation needs a specific question rather than an automatic
   sample-size extension.

Freeze movement and purchase costs separately from engine MG/EG values and
outcome-fitted material estimates. Record actual native values before a new
campaign; the snapshot pins the tested automatic MG/EG tables for drift checks.
These internal search units are not fitted material prices. Do not assign
desired material targets to make a score reach 50%.
A changed engine or evaluation policy creates a new comparison context, even
when the reference movement is unchanged. Earlier measured scores remain tied
to their original conditions. New data can also change estimated rates; saved
game outcomes remain unchanged. Material estimates may change when a fit includes
new data, so retain the original dataset and fit identity.

The next version can integrate this roster and its names into a new playable
library, then assess the remaining level-3 candidates and lower tiers. Reserve
king grants remain deferred until the replacement-piece roster is settled;
test their drop rules and head-to-head outcomes separately, with material
estimates as supporting information. Version 16 needs no further scored games.
