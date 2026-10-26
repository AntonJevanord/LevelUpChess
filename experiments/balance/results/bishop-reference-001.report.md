# Bishop versus forward-diagonal rook report

Conditional ordinary-piece values and added upgrade bonuses from linked evidence. Analysis assumes P=1/Q=9; native search values follow the separate frozen queen-match policy.

Analysis source identity: 6d93f2c08c299988056c455bad8e17c3f2f52caa1a0125041d77f55008dd7d49 (normalized LF).
Status: checkpoint-complete; checkpoint: 1280 new games; new finished 1280/1280; new cap: 1280.
Inherited: 5760; linked finalized: 7040/7040; linked study cap: 7040.
Parent run: fdbc7887-daf3-4ce6-b33b-98e95bcfe7a9; parent manifest/journal hashes: 534dd8c8688899b555757978fcf8a36fabd700416e6dd78b18e6e858d6871417 / 3aaa7ea9dd70cb555e368849897d6c1dc67d6240b0091c5da5092fcb9b64ba49.
Simple source: 1827bb06-2ab9-444c-9606-45d7ad70ab11; pinned reconstructed replay descriptor, not the original collection manifest. Historical native inventory and original manifest checksum remain unattested.
New bishop variants have head-to-head evidence only. Unobserved ordinary/single bonus columns are omitted from that cohort; their baseline values and cohort comparisons remain unavailable.
Bounded parent compatibility diagnostics: passed; historical contexts remain separate provenance.
Completed outcomes: 7039; distinct histories: 7039; sampled games: 7010; positions: 66586.
Latest statuses: 1 truncated, 0 errors, 0 aborted; remaining: 0.
Journal attempts: 7040; historical errors: 0; historical aborted attempts: 0.

Pawn = 1 and queen = 9 are assumed anchors. Fitted ordinary-piece values and upgrade bonuses use that conditional scale, separate from native MG/EG search parameters.

| Ordinary piece | Ordinary/single | Head-to-head | Combined | Combined conditional 95% range |
| --- | ---: | ---: | ---: | --- |
| Pawn (assumed) | 1.00 | 1.00 | 1.00 | fixed assumption |
| Knight | 2.73 | 2.79 | 2.77 | 2.66–2.86 |
| Bishop | 2.98 | 3.14 | 3.09 | 2.98–3.21 |
| Rook | 4.50 | 4.71 | 4.64 | 4.49–4.80 |
| Queen (assumed) | 9.00 | 9.00 | 9.00 | fixed assumption |
| Queen minus rook | 4.50 | 4.29 | 4.36 | 4.20–4.51 |

Kings have no estimated exchange value. The queen-minus-rook range conditions on Q=9 and reverses the paired rook bootstrap range.

The following table reports added upgrade bonuses over ordinary pieces.

| Upgrade (role) | Ordinary/single bonus | Head-to-head bonus | Combined bonus | Combined conditional 95% range |
| --- | ---: | ---: | ---: | --- |
| Horizontal bishop (original) (candidate) | 5.34 | 4.15 | 4.45 | 4.21–4.64 |
| Knight-capture rook (original) (historical) | 3.66 | 2.60 | 3.02 | 2.79–3.22 |
| Rank bishop (historical) | 2.96 | 1.93 | 2.50 | 2.21–2.70 |
| Queen-moving rook (historical) | 5.07 | 4.47 | 4.73 | 4.40–5.10 |
| Forward-bishop rook (reference) | 3.09 | 3.17 | 3.34 | 3.14–3.54 |
| Short-bishop rook (historical) | 4.08 | 2.95 | 3.39 | 3.13–3.66 |
| Camel knight (reference) | 3.70 | 3.16 | 3.48 | 3.29–3.69 |
| Amazon (reference) | 3.88 | 3.47 | 3.78 | 3.59–4.03 |
| Bishop: short side (candidate) | unavailable | 3.61 | 3.75 | 3.18–4.23 |
| Bishop: forward jump (candidate) | unavailable | 2.97 | 3.14 | 2.69–3.61 |
| Rank bishop: short quiet hop (candidate) | unavailable | 2.80 | 2.98 | 2.56–3.43 |
| Rank bishop: long quiet hop (candidate) | unavailable | 2.87 | 3.05 | 2.72–3.46 |

| Cohort difference, head minus ordinary/single | Point | Paired conditional 95% range | Decision at ±0.5 pawn |
| --- | ---: | --- | --- |
| Horizontal bishop (original) | -1.20 | -2.32–-0.38 | inconclusive |
| Knight-capture rook (original) | -1.05 | -1.77–-0.31 | inconclusive |
| Rank bishop | -1.03 | -1.86–-0.39 | inconclusive |
| Queen-moving rook | -0.60 | -1.70–0.24 | inconclusive |
| Forward-bishop rook | 0.08 | -0.76–0.62 | inconclusive |
| Short-bishop rook | -1.13 | -1.89–-0.35 | inconclusive |
| Camel knight | -0.53 | -1.45–0.21 | inconclusive |
| Amazon | -0.41 | -1.07–0.23 | inconclusive |
| Bishop: short side | unavailable | unavailable | unavailable |
| Bishop: forward jump | unavailable | unavailable | unavailable |
| Rank bishop: short quiet hop | unavailable | unavailable | unavailable |
| Rank bishop: long quiet hop | unavailable | unavailable | unavailable |

| Head-to-head matchup (A versus B) | Paired games | A W / D / L | A score | Conditional range | Out-of-fold predicted A score | Observed minus predicted (pp) |
| --- | ---: | --- | ---: | --- | ---: | ---: |
| Camel knight / Amazon | 254 | 115 / 30 / 109 | 51.18% | 44.84%–57.14% | 44.75% | 6.43 |
| Forward-bishop rook / Amazon | 256 | 120 / 30 / 106 | 52.73% | 46.88%–58.59% | 42.41% | 10.32 |
| Forward-bishop rook / Camel knight | 256 | 108 / 45 / 103 | 50.98% | 45.12%–56.84% | 47.63% | 3.35 |
| Bishop: forward jump / Forward-bishop rook | 256 | 94 / 40 / 122 | 44.53% | 38.67%–50.39% | 45.99% | -1.46 |
| Horizontal bishop (original) / Amazon | 256 | 129 / 34 / 93 | 57.03% | 51.56%–61.91% | 60.85% | -3.82 |
| Horizontal bishop (original) / Camel knight | 256 | 108 / 48 / 100 | 51.56% | 46.88%–56.45% | 65.75% | -14.19 |
| Horizontal bishop (original) / Forward-bishop rook | 256 | 144 / 34 / 78 | 62.89% | 58.01%–68.75% | 67.85% | -4.96 |
| Horizontal bishop (original) / Knight-capture rook (original) | 256 | 159 / 33 / 64 | 68.55% | 62.50%–74.41% | 72.01% | -3.45 |
| Rank bishop: short quiet hop / Forward-bishop rook | 256 | 98 / 48 / 110 | 47.66% | 42.77%–52.73% | 44.07% | 3.58 |
| Knight-capture rook (original) / Amazon | 256 | 95 / 30 / 131 | 42.97% | 37.70%–49.22% | 37.66% | 5.30 |
| Knight-capture rook (original) / Camel knight | 256 | 66 / 28 / 162 | 31.25% | 25.59%–37.30% | 42.74% | -11.49 |
| Queen-moving rook / Amazon | 256 | 167 / 32 / 57 | 71.48% | 67.19%–76.37% | 64.85% | 6.63 |
| Queen-moving rook / Camel knight | 256 | 156 / 31 / 69 | 66.99% | 60.74%–72.66% | 69.51% | -2.52 |
| Rank bishop / Amazon | 256 | 67 / 21 / 168 | 30.27% | 23.05%–35.16% | 29.38% | 0.89 |
| Rank bishop / Camel knight | 256 | 57 / 47 / 152 | 31.45% | 26.17%–35.55% | 33.94% | -2.49 |
| Short-bishop rook / Amazon | 256 | 107 / 37 / 112 | 49.02% | 43.16%–54.88% | 43.20% | 5.82 |
| Short-bishop rook / Camel knight | 256 | 92 / 36 / 128 | 42.97% | 36.72%–48.44% | 48.43% | -5.46 |
| Bishop: short side / Forward-bishop rook | 256 | 114 / 45 / 97 | 53.32% | 47.46%–58.98% | 56.76% | -3.44 |
| Rank bishop: long quiet hop / Forward-bishop rook | 256 | 97 / 43 / 116 | 46.29% | 42.19%–52.34% | 44.79% | 1.50 |

Partial camel-knight-v-amazon: 1 completed games lack a scored partner and are excluded from the paired score.

Matchup scores count draws as half a point; prediction differences are percentage points. JSON retains the 0–1 score scale, physical-color results and out-of-fold support.

| Fit | Games sampled | Groups | Effective rank | Converged | Held-out Brier | Supported estimates |
| --- | ---: | ---: | --- | --- | ---: | --- |
| primary baseline | 2166 | 128 | 14/14 | true | 0.0409 | conditional only |
| primary head | 4844 | 128 | 18/18 | true | 0.1034 | conditional only |
| primary combined | 7010 | 128 | 18/18 | true | 0.0841 | conditional only |
| diagnostic baseline | 2166 | 128 | 15/15 | true | 0.0410 | conditional only |
| diagnostic head | 4844 | 128 | 19/19 | true | 0.1035 | conditional only |
| diagnostic combined | 7010 | 128 | 19/19 | true | 0.0841 | conditional only |

| Frozen checkpoint | Ordinary value / difference | Ordinary/single | Head-to-head | Combined |
| --- | --- | ---: | ---: | ---: |
| 320 | Pawn (assumed) | 1.00 | 1.00 | 1.00 |
| 320 | Knight | 2.73 | 2.75 | 2.74 |
| 320 | Bishop | 2.98 | 3.11 | 3.07 |
| 320 | Rook | 4.50 | 4.59 | 4.55 |
| 320 | Queen (assumed) | 9.00 | 9.00 | 9.00 |
| 320 | Queen minus rook | 4.50 | 4.41 | 4.45 |
| 640 | Pawn (assumed) | 1.00 | 1.00 | 1.00 |
| 640 | Knight | 2.73 | 2.78 | 2.76 |
| 640 | Bishop | 2.98 | 3.13 | 3.09 |
| 640 | Rook | 4.50 | 4.62 | 4.57 |
| 640 | Queen (assumed) | 9.00 | 9.00 | 9.00 |
| 640 | Queen minus rook | 4.50 | 4.38 | 4.43 |
| 1280 | Pawn (assumed) | 1.00 | 1.00 | 1.00 |
| 1280 | Knight | 2.73 | 2.79 | 2.77 |
| 1280 | Bishop | 2.98 | 3.14 | 3.09 |
| 1280 | Rook | 4.50 | 4.71 | 4.64 |
| 1280 | Queen (assumed) | 9.00 | 9.00 | 9.00 |
| 1280 | Queen minus rook | 4.50 | 4.29 | 4.36 |

| Frozen checkpoint | Upgrade | Ordinary/single | Head-to-head | Combined |
| --- | --- | ---: | ---: | ---: |
| 320 | Horizontal bishop (original) | 5.34 | 4.17 | 4.49 |
| 320 | Knight-capture rook (original) | 3.66 | 2.62 | 3.03 |
| 320 | Rank bishop | 2.96 | 1.94 | 2.50 |
| 320 | Queen-moving rook | 5.07 | 4.48 | 4.73 |
| 320 | Forward-bishop rook | 3.09 | 3.20 | 3.39 |
| 320 | Short-bishop rook | 4.08 | 2.96 | 3.40 |
| 320 | Camel knight | 3.70 | 3.18 | 3.50 |
| 320 | Amazon | 3.88 | 3.48 | 3.79 |
| 320 | Bishop: short side | unavailable | 3.40 | 3.56 |
| 320 | Bishop: forward jump | unavailable | 2.45 | 2.64 |
| 320 | Rank bishop: short quiet hop | unavailable | 2.85 | 3.05 |
| 320 | Rank bishop: long quiet hop | unavailable | 2.92 | 3.11 |
| 640 | Horizontal bishop (original) | 5.34 | 4.08 | 4.41 |
| 640 | Knight-capture rook (original) | 3.66 | 2.58 | 3.01 |
| 640 | Rank bishop | 2.96 | 1.93 | 2.49 |
| 640 | Queen-moving rook | 5.07 | 4.47 | 4.73 |
| 640 | Forward-bishop rook | 3.09 | 3.26 | 3.43 |
| 640 | Short-bishop rook | 4.08 | 2.95 | 3.39 |
| 640 | Camel knight | 3.70 | 3.16 | 3.49 |
| 640 | Amazon | 3.88 | 3.47 | 3.78 |
| 640 | Bishop: short side | unavailable | 3.50 | 3.64 |
| 640 | Bishop: forward jump | unavailable | 2.92 | 3.10 |
| 640 | Rank bishop: short quiet hop | unavailable | 2.93 | 3.11 |
| 640 | Rank bishop: long quiet hop | unavailable | 2.61 | 2.81 |
| 1280 | Horizontal bishop (original) | 5.34 | 4.15 | 4.45 |
| 1280 | Knight-capture rook (original) | 3.66 | 2.60 | 3.02 |
| 1280 | Rank bishop | 2.96 | 1.93 | 2.50 |
| 1280 | Queen-moving rook | 5.07 | 4.47 | 4.73 |
| 1280 | Forward-bishop rook | 3.09 | 3.17 | 3.34 |
| 1280 | Short-bishop rook | 4.08 | 2.95 | 3.39 |
| 1280 | Camel knight | 3.70 | 3.16 | 3.48 |
| 1280 | Amazon | 3.88 | 3.47 | 3.78 |
| 1280 | Bishop: short side | unavailable | 3.61 | 3.75 |
| 1280 | Bishop: forward jump | unavailable | 2.97 | 3.14 |
| 1280 | Rank bishop: short quiet hop | unavailable | 2.80 | 2.98 |
| 1280 | Rank bishop: long quiet hop | unavailable | 2.87 | 3.05 |

Coverage: 29089 middlegame and 37497 endgame samples; 29 completed distinct games contain no eligible sampled positions.

Each completed sampled game has total weight one. Whole selected-position blocks retain all 55 historical and follow-up conditions in folds and paired resamples; broader opening ancestry remains unknown.
Head-to-head games contribute to estimates. Prediction checks hold out every game in an opening group before fitting; final all-game fit agreement is descriptive.
Cohort agreement is a practical design-resolution check, not proof of universal equivalence. Unsupported values remain unavailable. The declared RB queen-match policy stays fixed; purchase prices do not change.
This extension stops after 1280 new games. Completed parent games are never played again or rewritten. At early checkpoints all parent groups are present while only the new prefix is collected.

- Original and simple games are reused once under their respective source profiles; none is counted as a newly collected game.
- The original simple collection manifest was not supplied. Its pinned replay descriptor reconstructs the declared plan and source identity; historical native inventory and original manifest checksum remain unattested.
- The four new bishop designs have no ordinary/single games in this study. Their baseline bonuses and cohort differences are unavailable; direct matchups and head/combined estimates answer the declared comparison.
- Linked estimates combine historical and extension contexts. Compatibility diagnostics are bounded evidence, not universal playing-policy equivalence.
- Source context is retained as provenance, not fitted as a causal adjustment; pooled estimates assume contextual comparability.
- All inherited and new conditions for one selected position share its original group in validation and resampling.
- At intermediate checkpoints all parent groups are present while only the reported new prefix has been collected.
- Pawn=1 and queen=9 remain assumptions; conditional estimates do not establish intrinsic prices.
- Ply-limited games remain unscored, including the original parent truncation; no replacement games are added.
- Some completed games have an unscored color partner; paired matchup scores exclude those partial pairs.
- Pawn=1 and queen=9 are assumed; fitted ratios and ranges remain conditional on this book and playing policy.
- All games inform final combined values; out-of-fold starting predictions withhold complete position blocks.
- Different book positions may share broader opening ancestry. No universal material-price or equivalence claim follows.
- New bishop designs have head-to-head evidence only. Their absent ordinary/single bonus columns are omitted from that cohort, and their baseline estimates and cohort differences remain unavailable.
- Head-to-head rank or coverage failures can prevent absolute bonus estimates despite useful relative comparisons.
- Starting predictions extrapolate the sampled later-game material model to the opening; position-specific tactics are not modeled.
