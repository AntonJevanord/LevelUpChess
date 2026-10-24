# Pilot review: pawn and queen anchors

Reviewed 2026-10-24 using the completed 96-game pilot. No new engine games.
The uploaded Markdown report exactly matches its offline regeneration; unchanged
games and a fixed seed produce the same estimates. The shutdown fix changes
terminal cleanup, not the dataset or estimator.

The collector passed its workflow checks. Its 881 samples identify all pooled
features, but a successful predictive model does not establish a unique material
scale. The ordinary-only fit gives queen/rook 4.12/2.50, versus 7.43/3.41 when
Amazon games are included. Only 12 ordinary games contain rook imbalance; the
ordinary middlegame subset contains no queen-count imbalance.

## Test the proposed anchors

Pawn = 1 is already a normalization. Also choosing queen = 9 is a substantive
assumption. Refitting with `beta_queen = 9 * beta_pawn` retains a fitted positive
conversion between material and expected score. Other coefficients remain free.
An affine remapping of every old piece value would add a total-piece-count term
and change unequal-count exchanges, so it is not an equivalent unit conversion.

An independent offline implementation reproduces the original point coefficients
within 0.0001. Both fits retain draws, unit total weight per game and the original
standardized ridge penalty, including both pawn and queen terms. Each held-out
book-position cluster keeps its three conditions together. Training folds alone
determine standardization. The [recorded output](material-collection-001-anchors.summary.json)
contains hashes, runtime, coefficients and every held-out result.

| Combined-data diagnostic | Unconstrained | Pawn 1 / queen 9 assumed |
| --- | ---: | ---: |
| Knight | 2.92 | 3.12 |
| Bishop | 2.81 | 3.01 |
| Rook | 3.41 | 3.68 |
| Queen | 7.43 | 9.00 |
| Amazon upgrade bonus | 2.68 | 2.82 |
| Held-out Brier, lower is better | 0.05046 | 0.05077 |
| Held-out log loss, lower is better | 0.26742 | 0.26550 |

The anchored Amazon total is 9 + 2.82 = 11.82 on this chosen scale. Prediction is
similar; these results neither establish a preferred model nor prove queen/pawn
equals nine. The anchored ordinary-only rook remains 2.69, showing that anchors
do not remove cohort sensitivity. These are exploratory point fits without new
uncertainty intervals. The model choice uses this pilot; fresh positions are
needed for confirmation. No engine MG/EG values or purchase prices change.

## Next study proposal

No further software smoke is needed. Declare the analysis convention before
collecting more data. A possible next study is **576 new ordinary/Amazon games
across 192 fresh book positions**, reviewing cumulative 192/384/576-game triplet
checkpoints. Keep movement, native evaluation and search effort fixed; track
ordinary rook support, phase coverage and conditional uncertainty. This is a
proposal, not a configured or started batch. No extension follows automatically.
Confirm the measurement convention before adding the other reference upgrades.

The original reporter remains unchanged. Reproduce this separate diagnostic with
the optional NumPy/SciPy dependencies from `scripts/analysis/requirements-epd.txt`:

```sh
python scripts/analysis/material-anchor-review.py balance-results/material-data-pilot --out balance-results/pilot-anchor-review.json
```

Use the actual collection directory and a new output file. The helper does not
overwrite evidence, run an engine or modify the collection's original reports.
