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

The [all-reference fit](../experiments/balance/results/reference-material-001.report.md)
uses all 1,534 usable color-paired games across the six exact reference matchups.
Pawn = 1 and queen = 9 are assumptions. This fit estimates ordinary knight 2.88,
bishop 3.24 and rook 4.73.

| Reference | Added value | Added conditional 95% range | Whole piece | Whole conditional 95% range |
| --- | ---: | --- | ---: | --- |
| Vanguard | +3.12 | 2.76–3.52 | 7.85 | 7.43–8.33 |
| Unicorn | +2.82 | 2.45–3.20 | 5.70 | 5.25–6.21 |
| Cruisader | +3.26 | 2.95–3.64 | 6.50 | 6.14–6.94 |
| Amazon | +3.37 | 3.06–3.82 | 12.37 | 12.06–12.82 |

Whole-piece values add the ordinary family and bonus from the same fit, before
rounding. Their intervals use the sum within each same bootstrap refit.
All 200 normalized resamples and five grouped validation folds pass; the
anchored design has full rank. Sampling retains 15,216 material-stable positions
from 1,526 games. Eight games have no eligible positions, leaving eight partially
sampled pairs despite all 767 raw color pairs being complete. Sources are
replayed under their original profiles; shared openings, search settings and
relevant value tables support conditional reuse while source identities remain
separate. One truncated Unicorn/Amazon game and its completed unpaired partner
remain excluded. The user chose to leave that study closed.

The [previous 1,280-game fit](../experiments/balance/results/bishop-decision-material-001.report.md)
also included the unselected long-hop bishop. It remains unchanged: Vanguard
8.01, Unicorn 6.21, Cruisader 6.81 and Amazon 12.58. The new cohort includes only
the frozen references; differences in fitted values do not change observed
matchup scores or imply a design change.

The [earlier broader fit](../experiments/balance/results/bishop-reference-001.report.md)
remains separate: Vanguard +3.34 / total 7.98, Unicorn +3.48 / total 6.25, and
Amazon +3.78 / total 12.78. Different cohorts can change fitted coefficients
without changing reference designs or saved matchup scores. These conditional
estimates remain separate from native MG/EG units and purchase costs.

The [complete upload audit](../experiments/balance/results/bishop-decision-complete-001.audit.json)
now verifies the new journal, campaign/stage manifests and recorded identities.
All 2,304 retained/new histories replay, and all nine matchup scores and
bootstrap ranges reproduce the original report exactly. The raw uploads are
archived compressed. Original inherited-process manifests remain unavailable;
the new decision evidence gap is closed. No new matches were needed.

The [subsequently retained revision journal](../experiments/balance/results/reference-revisions-retained-001.report.md)
restores all 4,608 older revision histories and the short-side bishop's missing
192 games. It predates Cruisader and supplies none of its decision games.

## Future experiments

The [mixed-army and lower-tier plan](mixed-army-balance-plan.md) adds a proposed
reference 2v2 pilot and starting-upgrade contribution ratings. Candidate screens
keep the fixed reference basket; mixed-army tests address partnerships and tier
economics without requiring a candidate round robin.

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
