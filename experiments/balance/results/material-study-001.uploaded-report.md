# Material study: cumulative estimates

Conditional strength estimates under chosen anchors. No purchase prices or native evaluation values are changed.

Current analysis source identity: 85d0412fd9587b3f9d9f38bd4bf39f79729ad871125eaf48d42fb2d8e84866ff (normalized LF).
Status: checkpoint-complete; checkpoint: 1152; finished 1152/1152 scheduled games in this report. Study cap: 1152.
Completed outcomes: 1152; distinct histories: 1152; sampled games: 1143; positions: 10689.
Latest game statuses: 0 truncated, 0 errors, 0 aborted. Remaining in this prefix: 0.
Journal records: 1152; 0 error and 0 aborted records, including earlier unfinished attempts. They remain unscored.

| Primary quantity | Ordinary-only | Combined | Combined conditional 95% range |
| --- | ---: | ---: | --- |
| Pawn | 1.00 (assumed) | 1.00 (assumed) | fixed assumption |
| Knight | 2.53 | 2.88 | 2.55–3.22 |
| Bishop | 2.73 | 3.04 | 2.70–3.34 |
| Rook | 4.48 | 4.78 | 4.34–5.23 |
| Queen | 9.00 (assumed) | 9.00 (assumed) | fixed assumption |
| Amazon upgrade bonus | unavailable | 3.84 | 3.37–4.38 |
| Amazon total | unavailable | 12.84 | 12.37–13.38 |

Absolute ordinary/combined rook gap: 0.30.

| Fit | Effective rank | Converged | Held-out Brier | Constant baseline | Supported normalized estimates |
| --- | --- | --- | ---: | ---: | --- |
| primary ordinary | 6/6 | true | 0.0919 | 0.1731 | conditional only |
| primary combined | 7/7 | true | 0.0602 | 0.2149 | conditional only |
| diagnostic ordinary | 7/7 | true | 0.0926 | 0.1731 | conditional only |
| diagnostic combined | 8/8 | true | 0.0604 | 0.2149 | conditional only |

| Frozen checkpoint | Samples | Ordinary rook | Combined rook | Rook gap | Amazon bonus | Bonus range |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 384 | 3579 | 4.17 | 4.76 | 0.59 | 4.02 | 3.19–5.12 |
| 768 | 6934 | 4.64 | 5.10 | 0.46 | 4.17 | 3.56–5.04 |
| 1152 | 10689 | 4.48 | 4.78 | 0.30 | 3.84 | 3.37–4.38 |

| Material variation | Ordinary games / groups | Combined games / groups |
| --- | ---: | ---: |
| rook imbalance | 186 / 186 | 600 / 341 |
| queen imbalance | 170 / 170 | 390 / 273 |

Amazon imbalance: 724 games across 382 groups; 1681 positive and 1661 negative sampled positions.
Phase samples: 4657 middlegame, 6032 endgame. Detailed signs, phase support, raw coefficients, unconstrained values and resampling failures are in JSON.

Ranges resample whole selected book-position clusters and are conditional on this book, model and playing policy. They are not universal material confidence intervals. The pawn/queen anchors have no empirical interval because they are assumptions.
The study uses five deterministic grouped validation folds. Related opening ancestry may extend across different FENs. More games do not automatically correct model or selection bias.

Review the 384/768/1152-game checkpoints for estimate changes, interval width, ordinary/combined disagreement and phase support. Roughly half a pawn is a practical design-resolution guide, not a statistical acceptance test. No extension follows automatically.

- Pawn = 1 and queen = 9 are declared analysis anchors, not measured ratios.
- More data can reduce sampling uncertainty without removing selection bias, phase dependence or model assumptions.
- Whole selected-position clusters preserve triplets; distinct book positions may share opening ancestry.
- Material-stable windows do not prove tactical quietness; sampled games retain unit total weight and draws.
- Original pilot and external EPD data are not pooled into this study.
- Manifest hashes identify frozen inputs when present; journal replay alone does not attest executable or process identity.
