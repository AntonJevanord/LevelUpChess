# Next level-3 balance pass

After the current focused bishop decision, select a small roster for one capped
head-to-head campaign. This is a planning note; it starts no new games and does
not alter the running experiment.

The [simple comparison](results/simple-reference-001-review.md) supports `RfB`
alongside Camel and Amazon. The [four-piece matrix](reference-matrix-plan.md)
adds short-side bishop provisionally: it scores 53.32% against `RfB` over
256 games; older reported scores are 41.02% against Camel and 47.66% against
Amazon. The [capped bishop decision](bishop-decision-plan.md) fills raw gaps and
tests long quiet hop plus blocked wide knight before freezing the roster.

## Provisional roster

| Purchase | Selection |
| --- | --- |
| Queen | Fixed Amazon, `queen.purple@1` |
| Knight | Camel knight, `knight.purple@3` |
| Horizontal bishop | Short-side `bishop.purple@7` provisionally; retain alternatives until the current run finishes |
| Rook | Forward-bishop rook `rook.purple@10` (`RfB`) |
| Mobile pawn | Ranging `pawn.purple@7` and/or Courier `pawn.purple@8` |
| Rank pawn | Wide-knight version, `pawn.purple@9` |
| Vertical bishop | Quiet-knight version, `bishop.purple@3` |

That is at most eight designs. Human playtesting can reduce the roster before
collection, especially if Ranging and Courier are too similar to retain both.
Returning pawn remains optional if playtesting gives it a distinct useful role.
Blink's unresolved evaluation sensitivity stays a separate deferred question.

Keep extra-unit purchases outside this balance roster: guard knights, Twin
pawns, split queens and queen companions. Preserve their historical definitions
and results. The newer [finite-reserve proposal](../../prototypes/reserve-guards/README.md)
explores deployment without starting congestion and with an ordinary royal
king. Review its isolated playability while balancing the replacement roster.
Only after that roster is settled, assess reserve king purchases through paired
head-to-head games against those fixed equal-cost opponents. Freeze drop rules;
material estimates remain secondary diagnostics. Reserves add no games to this
campaign. Changed royal kings still need separate safety, mating and conversion
checks.

## Order and reuse

1. Review the current results against both Camel and Amazon, together with added
   material estimates and playtesting. Select readable bishop/rook revisions;
   numerical closeness to exactly 50% is not the sole selection criterion.
2. Begin the next campaign with the surviving pawns and Vertical bishop against
   the fixed references under the current engine policy. Their promising older
   results used different effort/evaluation/opening contexts and support a
   shortlist, rather than automatic pooling into the current dataset.
3. Fill the remaining shortlisted matchups. The first-stage games count toward
   the final comparison matrix; no separate repeat screen is needed. Reuse old
   games only when the exact designs, positions, search settings, values and
   expanded-profile compatibility permit it. Reuse or add ordinary/single-upgrade
   baselines as needed for material fitting, using the same outcome journals.
4. Close at a declared cap, choose the enjoyable, reasonably matched survivors,
   and move toward levels 1/2 and mixed six-point armies. Further collection
   requires a specific unresolved decision, rather than tighter numbers alone.

All six pairings among the provisional horizontal bishop, rook, Camel and
Amazon have reported results; bishop versus rook is complete. Raw recovery
for the older bishop–Camel/Amazon comparisons currently covers 80 of 128 groups.
Recover remaining histories before proposing replacement games; no core matchup
needs an automatic repeat. Other entrants need their cross-family matchups.

With eight designs there are 28 pairings. Forty matched positions played in both
upgrade colors give **2,240 head-to-head games before compatible reuse**. A final
budget must also account for any new ordinary/single-upgrade games; freeze that
budget, roster and stop rules after reviewing the running experiment.

## Decision criteria

Use roughly 40%–60% point score across a varied equal-cost opponent basket as a
working guide, with draws worth half a point. Inspect individual matchups,
uncertainty, promotion/endgame behavior, readability, enjoyment and counterplay.
Do not require every pairing to reach 50% or every confidence interval to fit
inside the working band.

Fit material bonuses from the same games and compare them with the contextual
Amazon bonus, about four on the assumed pawn-1/queen-9 scale. Use discrepancies
to understand opponents and positions; do not automatically redesign a piece
solely to force either metric to a target. Full-army tests matter after this
single-purchase pass because combinations, duplicated abilities and king safety
can change the value of a six-point army.
