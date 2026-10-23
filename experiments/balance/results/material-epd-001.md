# Supplied ordinary-chess EPDs: reproduced estimates and game-level uncertainty

Recorded 2026-10-23. Independently read the supplied EPDs and scripts; executed
only the new [offline audit helper](../../../scripts/analysis/epd-material-audit.py).
**No new engine games.** The [baseline result](material-epd-baseline-001.summary.json)
and [test result](material-epd-test-001.summary.json) preserve input/source hashes,
library versions, method settings, uncertainty and verification limits. Large
raw EPDs remain external inputs rather than additional committed game journals.

## What reproduces

| Uploaded file | Positions | Game IDs | Drawn games | Eligible decisive positions |
| --- | ---: | ---: | ---: | ---: |
| `baseline_chess.epd` | 90,614 | 605 | 126 | 49,563 |
| `test.epd` | 35,052 | 220 | 66 | 16,661 |

The independent point fit matches the supplied `piece_values.py` defaults:
liblinear logistic regression, C=10, material-stability counter at least one,
draws excluded, side-to-move perspective and automatic normalization by the
smallest qualifying positive coefficient. That coefficient is the pawn here.

| Piece | Baseline reproduction | Test reproduction |
| --- | ---: | ---: |
| Pawn | 1.00 | 1.00 |
| Knight | 2.83 | 2.11 |
| Bishop | 2.97 | 2.17 |
| Rook | 4.74 | 3.93 |
| Queen | 8.40 | 8.72 |
| Queen minus rook | **3.66** | **4.79** |

The baseline exactly reproduces the first reported table. Neither supplied
snapshot reproduces the later 88,963-row/48,514-sample table with queen 8.26 and
rook 4.68. These are contextual pawn-normalized material coefficients, not native
engine centipawn scores or exact exchange prices. Royal king counts never vary;
its printed zero is not a measured king value.

## Uncertainty and method sensitivity

Resample complete game IDs while retaining the reference fit's position weights,
and recompute the pawn denominator in every replicate. With 100 seeded resamples,
the baseline's conditional 95% percentile ranges are:

| Quantity | Point fit | Whole-game range |
| --- | ---: | ---: |
| Queen | 8.40 | 7.01–10.06 |
| Rook | 4.74 | 4.03–5.49 |
| Queen minus rook | 3.66 | 2.72–5.06 |

The queen's game-bootstrap standard deviation is about 0.83, versus the user's
position-bootstrap display of 0.15. Positions from one game are correlated, and
the supplied normalized error calculation holds its denominator fixed. The
whole-game ranges are exploratory and conditional on this corpus; shared opening
families can correlate different games, so they do not guarantee general accuracy.

A separate sensitivity model retains draws, gives each game total weight one,
uses White perspective with tempo/intercept and fixed standardized ridge 0.001.
It gives baseline queen/rook ratios 7.23/4.09 and test ratios 6.58/3.29. It predicts
held-out game outcomes better than a training-only constant, but it changes
several assumptions together. Do not interpret that change as identifying one
cause or establishing a preferred price table. Full details are in the JSON.

## Files, collection and limits

- Generation counts positions and appends by default; `--overwrite` is available.
  The pasted baseline log accumulates cohorts and reaches 90,614 rows. Its shown
  requested totals account for 90,000; the extra 614 are not explained there.
- Commands writing `test.epd` do not update `baseline_chess.epd`. Per-row search
  settings and the original binary identity are unavailable, so these files do
  not establish a controlled 20-ms versus 40-ms comparison.
- `chess.epd` is the 31,526-position opening book, with no outcomes/game IDs.
  It is distinct from the generated outcome-labelled data.
- Game IDs do not overlap between the two result files. Some UUIDs reappear in
  later blocks, so grouping is global rather than based on consecutive rows.
  No identical full recorded histories were found. Nine first-observed physical
  positions are shared between datasets; different UUIDs do not guarantee a
  completely independent opening test.
- Six baseline and ten test recorded tails stop before `bm none`. The generator
  plays a game to its result before emitting its positions, so this is compatible
  with a valid label. The audit validates format, labels and material features;
  it does not replay legal moves or attest execution.
- The supplied fitter's unused equal-weight option reads `game_uuid`, whereas
  this generator writes `game`. Our helper groups the actual `game` annotation.

## Decision and reproduction

The supplied baseline is substantially more informative than the 20 unique
ordinary-control histories. **Preserve it as a provisional reference corpus;
do not generate more ordinary games merely to reproduce familiar integers.**
Before an Amazon material study, freeze engine/rules/search identities and use
positions that actually vary the upgrade count. Keep data collection, draw
treatment, weighting and uncertainty fixed across comparisons. No new match
budget or piece-value override follows from this audit.

Optional Python dependencies are recorded in
[requirements-epd.txt](../../../scripts/analysis/requirements-epd.txt); they are
not required by the game or Node commands. From an environment with those
packages installed:

```sh
python scripts/analysis/epd-material-audit.py path/to/baseline_chess.epd --out balance-results/epd-baseline.json
```

The helper never replaces an output file. Defaults are `--bootstrap 100 --seed 42`.
It records input and analysis-source hashes. Final parser/reference-point checks
were repeated after CLI hardening; unchanged bounded bootstrap calculations were
reused, as explicitly recorded in the archived results. No full final-CLI rerun
is claimed.
