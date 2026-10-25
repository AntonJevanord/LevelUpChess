# Four-reference material and matchup report

Conditional upgrade bonuses over ordinary pieces. Purchase prices and native engine evaluation stay unchanged.

Analysis source identity: 2de54532c23041245f3e0053ccdc2c30613ee73c469e61801fdfbcfe18d66449 (normalized LF).
Status: checkpoint-complete; checkpoint: 2688; finished 2688/2688; cap: 2688.
Completed outcomes: 2687; distinct histories: 2687; sampled games: 2677; positions: 25365.
Latest statuses: 1 truncated, 0 errors, 0 aborted; remaining: 0.
Journal attempts: 2688; historical errors: 0; historical aborted attempts: 0.

Pawn = 1 and queen = 9 are assumed anchors. The table reports added bonuses, not whole-piece values.

| Upgrade | Ordinary/single bonus | Head-to-head bonus | Combined bonus | Combined conditional 95% range |
| --- | ---: | ---: | ---: | --- |
| Horizontal bishop | 5.41 | 4.30 | 4.66 | 4.36–4.96 |
| Knight-capture rook | 3.65 | 2.70 | 3.15 | 2.88–3.37 |
| Camel knight | 3.79 | 3.44 | 3.79 | 3.42–4.18 |
| Amazon | 3.88 | 3.62 | 3.96 | 3.66–4.27 |

| Cohort difference, head minus ordinary/single | Point | Paired conditional 95% range | Decision at ±0.5 pawn |
| --- | ---: | --- | --- |
| Horizontal bishop | -1.11 | -2.38–-0.28 | inconclusive |
| Knight-capture rook | -0.95 | -1.77–-0.19 | inconclusive |
| Camel knight | -0.35 | -1.45–0.47 | inconclusive |
| Amazon | -0.27 | -1.06–0.53 | inconclusive |

| Head-to-head matchup (A versus B) | Paired games | A W / D / L | A score | Conditional range | Out-of-fold predicted A score | Observed minus predicted (pp) |
| --- | ---: | --- | ---: | --- | ---: | ---: |
| Camel knight / Amazon | 254 | 115 / 30 / 109 | 51.18% | 44.84%–57.14% | 47.18% | 4.00 |
Partial camel-knight-v-amazon: 1 completed games lack a scored partner and are excluded from the paired score.
| Horizontal bishop / Amazon | 256 | 129 / 34 / 93 | 57.03% | 51.56%–61.91% | 61.38% | -4.35 |
| Horizontal bishop / Camel knight | 256 | 108 / 48 / 100 | 51.56% | 46.88%–56.45% | 64.01% | -12.45 |
| Horizontal bishop / Knight-capture rook | 256 | 159 / 33 / 64 | 68.55% | 62.50%–74.41% | 72.70% | -4.14 |
| Knight-capture rook / Amazon | 256 | 95 / 30 / 131 | 42.97% | 37.70%–49.22% | 37.38% | 5.59 |
| Knight-capture rook / Camel knight | 256 | 66 / 28 / 162 | 31.25% | 25.59%–37.30% | 40.05% | -8.80 |

Matchup scores count draws as half a point; prediction differences are percentage points. JSON retains the 0–1 score scale, physical-color results and out-of-fold support.

| Fit | Games sampled | Groups | Effective rank | Converged | Held-out Brier | Supported estimates |
| --- | ---: | ---: | --- | --- | ---: | --- |
| primary baseline | 1147 | 128 | 10/10 | true | 0.0429 | conditional only |
| primary head | 1530 | 128 | 10/10 | true | 0.1098 | conditional only |
| primary combined | 2677 | 128 | 10/10 | true | 0.0810 | conditional only |
| diagnostic baseline | 1147 | 128 | 11/11 | true | 0.0429 | conditional only |
| diagnostic head | 1530 | 128 | 11/11 | true | 0.1100 | conditional only |
| diagnostic combined | 2677 | 128 | 11/11 | true | 0.0811 | conditional only |

| Frozen checkpoint | Upgrade | Ordinary/single | Head-to-head | Combined |
| --- | --- | ---: | ---: | ---: |
| 672 | Horizontal bishop | 6.32 | 4.42 | 4.82 |
| 672 | Knight-capture rook | 4.30 | 3.23 | 3.61 |
| 672 | Camel knight | 4.02 | 3.50 | 3.87 |
| 672 | Amazon | 4.46 | 3.46 | 3.87 |
| 1344 | Horizontal bishop | 5.33 | 4.78 | 5.00 |
| 1344 | Knight-capture rook | 3.78 | 3.13 | 3.45 |
| 1344 | Camel knight | 3.65 | 3.34 | 3.63 |
| 1344 | Amazon | 3.93 | 3.73 | 3.99 |
| 2688 | Horizontal bishop | 5.41 | 4.30 | 4.66 |
| 2688 | Knight-capture rook | 3.65 | 2.70 | 3.15 |
| 2688 | Camel knight | 3.79 | 3.44 | 3.79 |
| 2688 | Amazon | 3.88 | 3.62 | 3.96 |

Coverage: 11461 middlegame and 13904 endgame samples; 10 completed distinct games contain no eligible sampled positions.

Each completed sampled game has total weight one. Whole selected-position blocks retain all 21 conditions in folds and paired resamples; broader opening ancestry remains unknown.
Head-to-head games contribute to estimates. Prediction checks hold out every game in an opening group before fitting; final all-game fit agreement is descriptive.
Cohort agreement is a practical design-resolution check, not proof of universal equivalence. Unsupported values remain unavailable. Native MG/EG parameters and purchase prices do not change.
This study stops at its declared cap. No extension or redesign starts automatically.

- Pawn = 1 and queen = 9 are declared analysis assumptions, not measured ratios.
- All three game kinds contribute to the combined fit; each sampled game has unit total weight and draws remain scored.
- Whole selected-position blocks preserve all 21 conditions; distinct FENs may share broader opening ancestry.
- Material-stable windows do not prove tactical quietness, and game outcomes do not establish intrinsic exchange prices.
- Original pilot, Amazon-only study and external EPDs are not pooled into this study.
- Manifest hashes identify recorded inputs; replay does not independently attest the executable or historical processes.
- Ply-limited games are unscored, not draws or losses.
- 1 pairs currently contribute a completed outcome from only one color; provisional evidence is not fully paired.
- Pawn=1 and queen=9 are assumed; fitted ratios and ranges remain conditional on this book and playing policy.
- All games inform final combined values; out-of-fold starting predictions withhold complete position blocks.
- Different book positions may share broader opening ancestry. No universal material-price or equivalence claim follows.
- Head-to-head rank or coverage failures can prevent absolute bonus estimates despite useful relative comparisons.
- Starting predictions extrapolate the sampled later-game material model to the opening; position-specific tactics are not modeled.
