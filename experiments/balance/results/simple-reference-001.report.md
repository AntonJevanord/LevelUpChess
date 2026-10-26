# Linked simple material and matchup report

Conditional ordinary-piece values and added upgrade bonuses from linked evidence. Analysis assumes P=1/Q=9; native search values follow the separate frozen queen-match policy.

Analysis source identity: 01860f05153f22c4b265f54ffd986d4ca78b61fc6d0ac665eb5fb76e08967290 (normalized LF).
Status: checkpoint-complete; checkpoint: 3072 new games; new finished 3072/3072; new cap: 3072.
Inherited: 2688; linked finalized: 5760/5760; linked study cap: 5760.
Parent run: fdbc7887-daf3-4ce6-b33b-98e95bcfe7a9; parent manifest/journal hashes: 534dd8c8688899b555757978fcf8a36fabd700416e6dd78b18e6e858d6871417 / 3aaa7ea9dd70cb555e368849897d6c1dc67d6240b0091c5da5092fcb9b64ba49.
Bounded parent compatibility diagnostics: passed; historical contexts remain separate provenance.
Completed outcomes: 5759; distinct histories: 5759; sampled games: 5733; positions: 52703.
Latest statuses: 1 truncated, 0 errors, 0 aborted; remaining: 0.
Journal attempts: 5760; historical errors: 0; historical aborted attempts: 0.

Pawn = 1 and queen = 9 are assumed anchors. Fitted ordinary-piece values and upgrade bonuses use that conditional scale, separate from native MG/EG search parameters.

| Ordinary piece | Ordinary/single | Head-to-head | Combined | Combined conditional 95% range |
| --- | ---: | ---: | ---: | --- |
| Pawn (assumed) | 1.00 | 1.00 | 1.00 | fixed assumption |
| Knight | 2.73 | 2.76 | 2.74 | 2.61–2.85 |
| Bishop | 2.98 | 3.12 | 3.07 | 2.94–3.21 |
| Rook | 4.50 | 4.55 | 4.52 | 4.39–4.65 |
| Queen (assumed) | 9.00 | 9.00 | 9.00 | fixed assumption |
| Queen minus rook | 4.50 | 4.45 | 4.48 | 4.35–4.61 |

Kings have no estimated exchange value. The queen-minus-rook range conditions on Q=9 and reverses the paired rook bootstrap range.

The following table reports added upgrade bonuses over ordinary pieces.

| Upgrade (role) | Ordinary/single bonus | Head-to-head bonus | Combined bonus | Combined conditional 95% range |
| --- | ---: | ---: | ---: | --- |
| Horizontal bishop (original) (historical) | 5.34 | 4.12 | 4.46 | 4.18–4.70 |
| Knight-capture rook (original) (historical) | 3.66 | 2.61 | 3.03 | 2.80–3.25 |
| Rank bishop (candidate) | 2.96 | 1.94 | 2.50 | 2.20–2.71 |
| Queen-moving rook (candidate) | 5.07 | 4.50 | 4.74 | 4.41–5.08 |
| Forward-bishop rook (candidate) | 3.09 | 3.31 | 3.50 | 3.22–3.84 |
| Short-bishop rook (candidate) | 4.08 | 2.97 | 3.40 | 3.14–3.72 |
| Camel knight (reference) | 3.70 | 3.19 | 3.51 | 3.33–3.72 |
| Amazon (reference) | 3.88 | 3.49 | 3.80 | 3.60–4.05 |

| Cohort difference, head minus ordinary/single | Point | Paired conditional 95% range | Decision at ±0.5 pawn |
| --- | ---: | --- | --- |
| Horizontal bishop (original) | -1.23 | -2.29–-0.40 | inconclusive |
| Knight-capture rook (original) | -1.05 | -1.80–-0.33 | inconclusive |
| Rank bishop | -1.02 | -1.89–-0.38 | inconclusive |
| Queen-moving rook | -0.58 | -1.68–0.23 | inconclusive |
| Forward-bishop rook | 0.22 | -0.58–0.85 | inconclusive |
| Short-bishop rook | -1.10 | -1.87–-0.28 | inconclusive |
| Camel knight | -0.50 | -1.40–0.25 | inconclusive |
| Amazon | -0.39 | -1.06–0.27 | inconclusive |

| Head-to-head matchup (A versus B) | Paired games | A W / D / L | A score | Conditional range | Out-of-fold predicted A score | Observed minus predicted (pp) |
| --- | ---: | --- | ---: | --- | ---: | ---: |
| Camel knight / Amazon | 254 | 115 / 30 / 109 | 51.18% | 44.84%–57.14% | 44.86% | 6.32 |
| Forward-bishop rook / Amazon | 256 | 120 / 30 / 106 | 52.73% | 46.88%–58.59% | 44.65% | 8.09 |
| Forward-bishop rook / Camel knight | 256 | 108 / 45 / 103 | 50.98% | 45.12%–56.84% | 49.79% | 1.19 |
| Horizontal bishop (original) / Amazon | 256 | 129 / 34 / 93 | 57.03% | 51.56%–61.91% | 60.94% | -3.91 |
| Horizontal bishop (original) / Camel knight | 256 | 108 / 48 / 100 | 51.56% | 46.88%–56.45% | 65.74% | -14.18 |
| Horizontal bishop (original) / Knight-capture rook (original) | 256 | 159 / 33 / 64 | 68.55% | 62.50%–74.41% | 72.21% | -3.65 |
| Knight-capture rook (original) / Amazon | 256 | 95 / 30 / 131 | 42.97% | 37.70%–49.22% | 37.53% | 5.44 |
| Knight-capture rook (original) / Camel knight | 256 | 66 / 28 / 162 | 31.25% | 25.59%–37.30% | 42.48% | -11.23 |
| Queen-moving rook / Amazon | 256 | 167 / 32 / 57 | 71.48% | 67.19%–76.37% | 64.78% | 6.70 |
| Queen-moving rook / Camel knight | 256 | 156 / 31 / 69 | 66.99% | 60.74%–72.66% | 69.35% | -2.36 |
| Rank bishop / Amazon | 256 | 67 / 21 / 168 | 30.27% | 23.05%–35.16% | 29.05% | 1.22 |
| Rank bishop / Camel knight | 256 | 57 / 47 / 152 | 31.45% | 26.17%–35.55% | 33.48% | -2.03 |
| Short-bishop rook / Amazon | 256 | 107 / 37 / 112 | 49.02% | 43.16%–54.88% | 43.02% | 6.00 |
| Short-bishop rook / Camel knight | 256 | 92 / 36 / 128 | 42.97% | 36.72%–48.44% | 48.14% | -5.17 |

Partial camel-knight-v-amazon: 1 completed games lack a scored partner and are excluded from the paired score.

Matchup scores count draws as half a point; prediction differences are percentage points. JSON retains the 0–1 score scale, physical-color results and out-of-fold support.

| Fit | Games sampled | Groups | Effective rank | Converged | Held-out Brier | Supported estimates |
| --- | ---: | ---: | --- | --- | ---: | --- |
| primary baseline | 2166 | 128 | 14/14 | true | 0.0409 | conditional only |
| primary head | 3567 | 128 | 14/14 | true | 0.1048 | conditional only |
| primary combined | 5733 | 128 | 14/14 | true | 0.0807 | conditional only |
| diagnostic baseline | 2166 | 128 | 15/15 | true | 0.0410 | conditional only |
| diagnostic head | 3567 | 128 | 15/15 | true | 0.1049 | conditional only |
| diagnostic combined | 5733 | 128 | 15/15 | true | 0.0807 | conditional only |

| Frozen checkpoint | Ordinary value / difference | Ordinary/single | Head-to-head | Combined |
| --- | --- | ---: | ---: | ---: |
| 768 | Pawn (assumed) | 1.00 | 1.00 | 1.00 |
| 768 | Knight | 2.61 | 2.84 | 2.77 |
| 768 | Bishop | 2.89 | 3.24 | 3.13 |
| 768 | Rook | 4.60 | 4.81 | 4.74 |
| 768 | Queen (assumed) | 9.00 | 9.00 | 9.00 |
| 768 | Queen minus rook | 4.40 | 4.19 | 4.26 |
| 1536 | Pawn (assumed) | 1.00 | 1.00 | 1.00 |
| 1536 | Knight | 2.53 | 2.81 | 2.73 |
| 1536 | Bishop | 2.77 | 3.17 | 3.05 |
| 1536 | Rook | 4.50 | 4.68 | 4.62 |
| 1536 | Queen (assumed) | 9.00 | 9.00 | 9.00 |
| 1536 | Queen minus rook | 4.50 | 4.32 | 4.38 |
| 3072 | Pawn (assumed) | 1.00 | 1.00 | 1.00 |
| 3072 | Knight | 2.73 | 2.76 | 2.74 |
| 3072 | Bishop | 2.98 | 3.12 | 3.07 |
| 3072 | Rook | 4.50 | 4.55 | 4.52 |
| 3072 | Queen (assumed) | 9.00 | 9.00 | 9.00 |
| 3072 | Queen minus rook | 4.50 | 4.45 | 4.48 |

| Frozen checkpoint | Upgrade | Ordinary/single | Head-to-head | Combined |
| --- | --- | ---: | ---: | ---: |
| 768 | Horizontal bishop (original) | 5.41 | 4.19 | 4.55 |
| 768 | Knight-capture rook (original) | 3.68 | 2.64 | 3.09 |
| 768 | Rank bishop | 2.25 | 1.95 | 2.33 |
| 768 | Queen-moving rook | 4.96 | 4.74 | 4.95 |
| 768 | Forward-bishop rook | 3.61 | 3.38 | 3.65 |
| 768 | Short-bishop rook | 4.08 | 2.51 | 3.09 |
| 768 | Camel knight | 3.78 | 3.31 | 3.66 |
| 768 | Amazon | 3.91 | 3.54 | 3.87 |
| 1536 | Horizontal bishop (original) | 5.39 | 4.15 | 4.52 |
| 1536 | Knight-capture rook (original) | 3.65 | 2.62 | 3.06 |
| 1536 | Rank bishop | 2.84 | 2.11 | 2.62 |
| 1536 | Queen-moving rook | 5.15 | 4.42 | 4.69 |
| 1536 | Forward-bishop rook | 3.35 | 3.46 | 3.69 |
| 1536 | Short-bishop rook | 4.07 | 2.81 | 3.32 |
| 1536 | Camel knight | 3.75 | 3.26 | 3.61 |
| 1536 | Amazon | 3.86 | 3.49 | 3.83 |
| 3072 | Horizontal bishop (original) | 5.34 | 4.12 | 4.46 |
| 3072 | Knight-capture rook (original) | 3.66 | 2.61 | 3.03 |
| 3072 | Rank bishop | 2.96 | 1.94 | 2.50 |
| 3072 | Queen-moving rook | 5.07 | 4.50 | 4.74 |
| 3072 | Forward-bishop rook | 3.09 | 3.31 | 3.50 |
| 3072 | Short-bishop rook | 4.08 | 2.97 | 3.40 |
| 3072 | Camel knight | 3.70 | 3.19 | 3.51 |
| 3072 | Amazon | 3.88 | 3.49 | 3.80 |

Coverage: 23938 middlegame and 28765 endgame samples; 26 completed distinct games contain no eligible sampled positions.

Each completed sampled game has total weight one. Whole selected-position blocks retain all 45 historical and extension conditions in folds and paired resamples; broader opening ancestry remains unknown.
Head-to-head games contribute to estimates. Prediction checks hold out every game in an opening group before fitting; final all-game fit agreement is descriptive.
Cohort agreement is a practical design-resolution check, not proof of universal equivalence. Unsupported values remain unavailable. The declared RB queen-match policy stays fixed; purchase prices do not change.
This extension stops after 3072 new games. Completed parent games are never played again or rewritten. At early checkpoints all parent groups are present while only the new prefix is collected.

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
