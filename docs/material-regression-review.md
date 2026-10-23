# Material estimates from game outcomes

Research review, 2026-10-23. This is a method proposal for version 16, not a new
game batch or a measured value table.

## What the supplied articles change

FM ubdip's *Finding the value of pieces* (2022-06-05, supplied in chat) fits
material-count differences to final game outcomes. Its ordinary-chess values
give **9.82 − 4.93 = 4.89 pawns** for queen minus rook. The supplied
[follow-up](https://lichess.org/@/ubdip/blog/comments-on-piece-values/Ps9kghhO)
reports 9.76 − 4.01 = **5.75** in middlegames and 9.29 − 4.65 = **4.64** in
endgames on an expanded dataset. These are different empirical fits, not exact
conversion constants or interchangeable estimates from one sample.

The original pilot's four-pawn reference was too narrow as an expectation. A
five-pawn estimate would not by itself invalidate a method. Our
[control](../experiments/balance/results/material-pilot-001.md) nevertheless
scored 82.81% for the queen-favored side after five pawn removals, so its grid
never observed equal chances. It remains closed at 320 games. Neither extending
that grid nor forcing the result to four or five establishes a transferable
material scale. The Amazon crossing remains contextual starting-pawn odds.

## A useful alternative to repeated handicap matches

The [author's repository](https://github.com/ianfab/chess-variant-stats) extracts
positions and their games' eventual results, then predicts outcomes from material.
It does not use engine evaluations as target labels. Fit ordinary material-count
differences and, initially, an Amazon upgrade-bonus feature. Count a surviving
Amazon as a queen in the ordinary baseline plus one upgrade, so the extra
coefficient estimates the bonus directly. Test that this encoding is identifiable
in the available data; it is not enough to name a coefficient.

Normalize coefficients by the fitted pawn coefficient only if it is positive,
stable and supported by independent material variation. That yields contextual
pawn-equivalent estimates. It does not turn regression coefficients into native
MG/EG parameters or make them universal exchange prices. Ordinary-piece fits are
sanity checks against broad empirical ranges, not targets to force to 1/3/3/5/9.

Engine policy still influences positions, exchanges and mistakes. The follow-up's
random-evaluation experiment recovers the broad hierarchy but different values;
outcome fitting avoids directly copying engine scores without eliminating this
indirect dependence. A predictive material coefficient is not a controlled causal
effect of adding a piece.

## Adapt the implementation before using it

Reviewed the upstream
[README](https://github.com/ianfab/chess-variant-stats/blob/252c40b00a86e260e10c538a1266d161b580405c/README.md)
and [piece_values.py](https://github.com/ianfab/chess-variant-stats/blob/252c40b00a86e260e10c538a1266d161b580405c/piece_values.py)
at commit `252c40b00a86e260e10c538a1266d161b580405c`. This reviewed revision
excludes draws and bootstraps positions independently. The original article's
2022 implementation may differ. For our experiment data:

1. Decode letters through each frozen registry into stable design IDs and rule
   revisions. Preserve engine/evaluation identity, game, color pair and opening
   family; do not silently pool incompatible runs.
2. Replay existing journals first. Audit material-feature coverage, rank and
   correlations before fitting. Sparse, predeclared samples and equal total
   weight per game limit domination by long games. Avoid captures, promotions and
   short recapture sequences; one material-stable ply does not prove tactical
   stability.
3. Retain draws. A fractional-logistic expected-score fit can use wins/draws/losses
   as 1/0.5/0 with a suitable objective, or use an explicit win/draw/loss model.
   Ordinary binary logistic classification does not directly accept 0.5 labels.
   Distinguish expected score from win chance conditional on a decisive result.
4. Keep whole color pairs and related opening families together in validation
   splits and uncertainty resampling. Report independent games/groups, feature
   coverage, held-out performance and unstable or unavailable coefficients.
   Thousands of positions from a few games are not independent replications.
5. Start with few parameters. Investigate phase effects or interactions only when
   there is enough coverage. Pawn-normalized phase differences can reflect changes
   in pawn value as well as the compared piece. Royal-king counts never differ;
   that coefficient cannot measure the value of king upgrades.

The existing 320 pilot games can test export, coverage and fitting without new
engine games. Their deliberately selected pawn handicaps and limited opening
families do not become representative merely by extracting more positions. A
small offline diagnostic must precede any decision to generate broader data; no
new game budget is declared here.

## NNUE and game phase

NNUE uses a separately trained network with fixed weights during ordinary play;
it does not learn a new piece's movement or value automatically as games run.
The current [bundled engine](../stockfish/README.md) was built with `nnue=no`.
Outcome regression can be investigated with it. NNUE is not a prerequisite, and
enabling it would require compatible features, piece encoding and training data
for our rules rather than assuming a standard-chess network understands them.

The same games can supply middlegame and endgame samples. Separate endgame game
generation is useful only if coverage is inadequate for a declared question.
Phase-specific outcome coefficients do not automatically become an engine's
tapered evaluation weights. Keep network training, search-policy calibration and
piece-balance estimation as separate tasks.
