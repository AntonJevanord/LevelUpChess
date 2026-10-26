# Linked revision material and matchup report

Conditional upgrade bonuses over ordinary pieces from linked parent and extension evidence. Source contexts remain recorded; purchase prices and native engine evaluation stay unchanged.

Analysis source identity: 6dfaee4b25dcb9de7e5d538b51c3a1e4c5cacc265da91a5bc072c4cfc444c5af (normalized LF).
Status: checkpoint-complete; checkpoint: 4608 new games; new finished 4608/4608; new cap: 4608.
Inherited: 2688; linked finalized: 7296/7296; linked study cap: 7296.
Parent run: fdbc7887-daf3-4ce6-b33b-98e95bcfe7a9; parent manifest/journal hashes: 534dd8c8688899b555757978fcf8a36fabd700416e6dd78b18e6e858d6871417 / 3aaa7ea9dd70cb555e368849897d6c1dc67d6240b0091c5da5092fcb9b64ba49.
Bounded parent compatibility diagnostics: passed; historical contexts remain separate provenance.
Completed outcomes: 7295; distinct histories: 7295; sampled games: 7264; positions: 66212.
Latest statuses: 1 truncated, 0 errors, 0 aborted; remaining: 0.
Journal attempts: 7296; historical errors: 0; historical aborted attempts: 0.

Pawn = 1 and queen = 9 are assumed anchors. The table reports added bonuses, not whole-piece values.

| Upgrade (role) | Ordinary/single bonus | Head-to-head bonus | Combined bonus | Combined conditional 95% range |
| --- | ---: | ---: | ---: | --- |
| Horizontal bishop (original) (historical) | 5.35 | 4.15 | 4.54 | 4.27–4.82 |
| Knight-capture rook (original) (historical) | 3.64 | 2.63 | 3.09 | 2.85–3.33 |
| Bishop: short side (candidate) | 4.11 | 2.98 | 3.49 | 3.22–3.80 |
| Bishop: quiet jump (candidate) | 3.35 | 2.10 | 2.74 | 2.54–3.03 |
| Bishop: forward jump (candidate) | 4.24 | 2.91 | 3.46 | 3.21–3.79 |
| Rook: diagonal capture (candidate) | 6.13 | 4.64 | 4.99 | 4.70–5.31 |
| Rook: diagonal step (candidate) | 5.37 | 5.29 | 5.49 | 5.17–5.89 |
| Rook: full knight (candidate) | 5.09 | 4.31 | 4.62 | 4.34–4.91 |
| Camel knight (reference) | 3.73 | 3.22 | 3.61 | 3.40–3.82 |
| Amazon (reference) | 3.87 | 3.52 | 3.89 | 3.70–4.09 |

| Cohort difference, head minus ordinary/single | Point | Paired conditional 95% range | Decision at ±0.5 pawn |
| --- | ---: | --- | --- |
| Horizontal bishop (original) | -1.20 | -2.29–-0.35 | inconclusive |
| Knight-capture rook (original) | -1.01 | -1.72–-0.33 | inconclusive |
| Bishop: short side | -1.13 | -1.99–-0.47 | inconclusive |
| Bishop: quiet jump | -1.25 | -1.90–-0.64 | context-dependent |
| Bishop: forward jump | -1.33 | -2.20–-0.60 | context-dependent |
| Rook: diagonal capture | -1.49 | -2.34–-0.83 | context-dependent |
| Rook: diagonal step | -0.08 | -1.15–0.77 | inconclusive |
| Rook: full knight | -0.79 | -2.01–0.17 | inconclusive |
| Camel knight | -0.51 | -1.46–0.31 | inconclusive |
| Amazon | -0.35 | -1.01–0.28 | inconclusive |

| Head-to-head matchup (A versus B) | Paired games | A W / D / L | A score | Conditional range | Out-of-fold predicted A score | Observed minus predicted (pp) |
| --- | ---: | --- | ---: | --- | ---: | ---: |
| Bishop: forward jump / Amazon | 256 | 99 / 24 / 133 | 43.36% | 36.13%–49.22% | 42.70% | 0.66 |
| Bishop: forward jump / Camel knight | 256 | 94 / 45 / 117 | 45.51% | 39.65%–50.78% | 47.22% | -1.72 |
| Bishop: quiet jump / Amazon | 256 | 62 / 28 / 166 | 29.69% | 25.00%–34.57% | 31.29% | -1.60 |
| Bishop: quiet jump / Camel knight | 256 | 85 / 28 / 143 | 38.67% | 33.20%–44.92% | 35.36% | 3.31 |
| Bishop: short side / Amazon | 256 | 103 / 38 / 115 | 47.66% | 41.80%–53.32% | 43.10% | 4.56 |
| Bishop: short side / Camel knight | 256 | 78 / 54 / 124 | 41.02% | 35.74%–47.27% | 47.63% | -6.61 |
| Camel knight / Amazon | 254 | 115 / 30 / 109 | 51.18% | 44.84%–57.14% | 45.44% | 5.75 |
| Horizontal bishop (original) / Amazon | 256 | 129 / 34 / 93 | 57.03% | 51.56%–61.91% | 60.86% | -3.83 |
| Horizontal bishop (original) / Camel knight | 256 | 108 / 48 / 100 | 51.56% | 46.88%–56.45% | 65.12% | -13.56 |
| Horizontal bishop (original) / Knight-capture rook (original) | 256 | 159 / 33 / 64 | 68.55% | 62.50%–74.41% | 72.42% | -3.86 |
| Knight-capture rook (original) / Amazon | 256 | 95 / 30 / 131 | 42.97% | 37.70%–49.22% | 37.20% | 5.77 |
| Knight-capture rook (original) / Camel knight | 256 | 66 / 28 / 162 | 31.25% | 25.59%–37.30% | 41.56% | -10.31 |
| Rook: diagonal capture / Amazon | 256 | 157 / 26 / 73 | 66.41% | 61.13%–72.46% | 67.68% | -1.27 |
| Rook: diagonal capture / Camel knight | 256 | 142 / 27 / 87 | 60.74% | 55.47%–66.02% | 71.54% | -10.80 |
| Rook: diagonal step / Amazon | 256 | 183 / 24 / 49 | 76.17% | 71.48%–81.05% | 74.88% | 1.29 |
| Rook: diagonal step / Camel knight | 256 | 158 / 26 / 72 | 66.80% | 60.55%–71.88% | 78.17% | -11.38 |
| Rook: full knight / Amazon | 256 | 159 / 27 / 70 | 67.38% | 62.70%–71.88% | 62.32% | 5.06 |
| Rook: full knight / Camel knight | 256 | 137 / 31 / 88 | 59.57% | 53.91%–64.65% | 66.51% | -6.94 |

Partial camel-knight-v-amazon: 1 completed games lack a scored partner and are excluded from the paired score.

Matchup scores count draws as half a point; prediction differences are percentage points. JSON retains the 0–1 score scale, physical-color results and out-of-fold support.

| Fit | Games sampled | Groups | Effective rank | Converged | Held-out Brier | Supported estimates |
| --- | ---: | ---: | --- | --- | ---: | --- |
| primary baseline | 2678 | 128 | 16/16 | true | 0.0333 | conditional only |
| primary head | 4586 | 128 | 16/16 | true | 0.1060 | conditional only |
| primary combined | 7264 | 128 | 16/16 | true | 0.0794 | conditional only |
| diagnostic baseline | 2678 | 128 | 17/17 | true | 0.0333 | conditional only |
| diagnostic head | 4586 | 128 | 17/17 | true | 0.1061 | conditional only |
| diagnostic combined | 7264 | 128 | 17/17 | true | 0.0794 | conditional only |

| Frozen checkpoint | Upgrade | Ordinary/single | Head-to-head | Combined |
| --- | --- | ---: | ---: | ---: |
| 1152 | Horizontal bishop (original) | 5.37 | 4.29 | 4.64 |
| 1152 | Knight-capture rook (original) | 3.64 | 2.71 | 3.14 |
| 1152 | Bishop: short side | 3.11 | 2.87 | 3.21 |
| 1152 | Bishop: quiet jump | 2.87 | 1.91 | 2.47 |
| 1152 | Bishop: forward jump | 3.58 | 2.81 | 3.28 |
| 1152 | Rook: diagonal capture | 7.00 | 4.82 | 5.14 |
| 1152 | Rook: diagonal step | 5.55 | 5.46 | 5.61 |
| 1152 | Rook: full knight | 5.50 | 4.73 | 4.97 |
| 1152 | Camel knight | 3.75 | 3.34 | 3.68 |
| 1152 | Amazon | 3.87 | 3.67 | 3.98 |
| 2304 | Horizontal bishop (original) | 5.40 | 4.21 | 4.60 |
| 2304 | Knight-capture rook (original) | 3.67 | 2.66 | 3.12 |
| 2304 | Bishop: short side | 3.72 | 2.96 | 3.43 |
| 2304 | Bishop: quiet jump | 3.32 | 1.98 | 2.66 |
| 2304 | Bishop: forward jump | 4.25 | 2.78 | 3.38 |
| 2304 | Rook: diagonal capture | 6.25 | 4.68 | 5.03 |
| 2304 | Rook: diagonal step | 5.46 | 5.45 | 5.64 |
| 2304 | Rook: full knight | 4.33 | 4.69 | 4.87 |
| 2304 | Camel knight | 3.77 | 3.17 | 3.57 |
| 2304 | Amazon | 3.91 | 3.62 | 3.98 |
| 4608 | Horizontal bishop (original) | 5.35 | 4.15 | 4.54 |
| 4608 | Knight-capture rook (original) | 3.64 | 2.63 | 3.09 |
| 4608 | Bishop: short side | 4.11 | 2.98 | 3.49 |
| 4608 | Bishop: quiet jump | 3.35 | 2.10 | 2.74 |
| 4608 | Bishop: forward jump | 4.24 | 2.91 | 3.46 |
| 4608 | Rook: diagonal capture | 6.13 | 4.64 | 4.99 |
| 4608 | Rook: diagonal step | 5.37 | 5.29 | 5.49 |
| 4608 | Rook: full knight | 5.09 | 4.31 | 4.62 |
| 4608 | Camel knight | 3.73 | 3.22 | 3.61 |
| 4608 | Amazon | 3.87 | 3.52 | 3.89 |

Coverage: 30756 middlegame and 35456 endgame samples; 31 completed distinct games contain no eligible sampled positions.

Each completed sampled game has total weight one. Whole selected-position blocks retain all 57 historical and extension conditions in folds and paired resamples; broader opening ancestry remains unknown.
Head-to-head games contribute to estimates. Prediction checks hold out every game in an opening group before fitting; final all-game fit agreement is descriptive.
Cohort agreement is a practical design-resolution check, not proof of universal equivalence. Unsupported values remain unavailable. Native MG/EG parameters and purchase prices do not change.
This extension stops after 4608 new games. Completed parent games are never played again or rewritten. At early checkpoints all parent groups are present while only the new prefix is collected.

- Completed parent games are reused under their original profile and manifest; none is counted as a newly collected game.
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
- Head-to-head rank or coverage failures can prevent absolute bonus estimates despite useful relative comparisons.
- Starting predictions extrapolate the sampled later-game material model to the opening; position-specific tactics are not modeled.
