# Material study: completed convergence review

Close the [declared study](../material-study-plan.md) at **1,152 games**. The
larger sample substantially improves the pilot's rook estimates and supports
rough material comparisons in this recorded context. No extension or new
engine games follow automatically.

## Evidence and verification

Preserve the supplied [original manifest](material-study-001.collection.json),
[game journal](material-study-001.games.jsonl),
[summary](material-study-001.uploaded-summary.json) and
[report](material-study-001.uploaded-report.md) unchanged. The reproducible
[offline audit](material-study-001.audit.cjs) records its inputs, checks and
regenerated estimates in [JSON](material-study-001.audit.json).

- 1,152 distinct completed histories across 384 ordinary/White-Amazon/Black-Amazon
  triplets; zero errors, truncations or aborted attempts.
- All 126,924 recorded plies replay legally and outcomes validate.
- All 384 ordered starting-position hashes match the frozen preflight selection.
- 10,689 eligible positions from 1,143 games; the nine games without retained
  samples also completed normally.
- All 26 recorded source hashes match: 13 runner, seven collector and six study
  sources. Engine bytes match the bundled Windows executable; the rules bundle
  matches its Windows CRLF representation. Configuration and rules fingerprints,
  run ID and recorded four-job setting also validate.
- All three checkpoints regenerate offline; the final Markdown matches the
  supplied report byte for byte. All 12 fits are full rank and converged, with
  2,400 valid bootstrap fits and no recorded diagnostic failures.

The audit uses the original manifest, not a reconstructed reporting context.
Recorded file hashes and settings verify the saved evidence; they are not an
independent attestation of every process on the collection machine. Whole
book-position triplets remain the resampling unit; distinct FENs may share
broader opening ancestry. Reproduce without engine searches or an opening book:

```sh
node experiments/balance/results/material-study-001.audit.cjs
```

## Estimates and sample-size comparison

Pawn = 1 and queen = 9 are **analysis assumptions**. Other quantities are fitted;
these numbers change neither engine evaluation values nor purchase prices.

| Quantity | Ordinary-only | Combined | Combined conditional 95% range |
| --- | ---: | ---: | --- |
| Knight | 2.53 | 2.88 | 2.55–3.22 |
| Bishop | 2.73 | 3.04 | 2.70–3.34 |
| Rook | 4.48 | 4.78 | 4.34–5.23 |
| Amazon upgrade bonus | — | 3.84 | 3.37–4.38 |
| Amazon total, including assumed queen 9 | — | 12.84 | 12.37–13.38 |

| Cumulative games | Ordinary rook | Combined rook | Rook gap | Amazon bonus | Bonus range |
| --- | ---: | ---: | ---: | ---: | --- |
| 384 | 4.17 | 4.76 | 0.59 | 4.02 | 3.19–5.12 |
| 768 | 4.64 | 5.10 | 0.46 | 4.17 | 3.56–5.04 |
| 1,152 | 4.48 | 4.78 | 0.30 | 3.84 | 3.37–4.38 |

The [anchored pilot](material-collection-001-anchors.md) gave ordinary/combined
rook values 2.69/3.68, with only 12 ordinary games containing rook imbalance.
The study has 186 such ordinary games and a final rook gap of 0.30. More data
substantially reduces that discrepancy without forcing rook = 5.

Between the final two checkpoints, ordinary rook changes by 0.16, combined rook
by 0.32 and Amazon bonus by 0.32: below the declared practical 0.5-pawn guide.
The bonus interval narrows from width 1.93 to 1.01. Its final half-width is about
0.505, with the upper bound 0.54 above the estimate, so half-pawn precision is
borderline. Cumulative checkpoints are dependent; these comparisons do not prove
convergence or establish a formal equivalence result.

The final unconstrained combined fit gives N 2.79, B 2.95, R 4.63, Q 8.53 and
Amazon bonus 3.75, supporting a similar conclusion without fixing queen = 9.
Its ordinary/combined rook values are 4.07/4.63, a 0.57 gap: cohort dependence
has decreased, not disappeared. Combined held-out Brier is 0.0602 anchored and
0.0604 unconstrained, versus a constant baseline of 0.2149; this does not
empirically establish the queen/pawn ratio of nine.

The sample contains 4,657 middlegame and 6,032 endgame positions. Ordinary queen
imbalance appears in only 10 middlegame games versus 166 endgame games. These
data do not establish phase-specific values.

## Decision and next work

The offline review is complete. Treat these as usable rough estimates under
this book, engine playing policy and chosen scale. Retain the Amazon as the
provisional three-point upgrade benchmark with measured bonus about **3.8**;
purchase levels and material strength are different quantities. Its conditional
range excludes three, so avoid assuming one purchase point equals one pawn.

Proportional level-1/level-2 targets would be **+1.28/+2.56** on the anchored
scale. These are design hypotheses, not measurements of those pieces. Any next
reference-panel comparison needs an explicit question, fixed settings and capped
budget before collection. Keep the pilot and external EPD data separate; neither
an extension nor a new campaign starts automatically, and these coefficients
do not establish universal material prices.
