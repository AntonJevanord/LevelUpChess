# Level-three material estimates

Each node budget is fitted separately. Pawn = 1 and queen = 9 are assumed. Values are conditional on these openings and the fixed engine policy; engine search values and purchase costs stay unchanged.

## 20,000 nodes

Status: conditional-estimates.

7040 scored paired games; 7024 sampled games; 75460 eligible positions; 64 opening groups.

| Ordinary piece | Combined value | Conditional 95% range |
| --- | ---: | --- |
| pawn | 1.00 (assumed) | fixed assumption |
| knight | 2.85 | 2.76–2.93 |
| bishop | 3.18 | 3.08–3.30 |
| rook | 4.60 | 4.50–4.71 |
| queen | 9.00 (assumed) | fixed assumption |

| Upgrade | Baseline bonus | Head-to-head bonus | Combined bonus | Whole piece | Whole-piece conditional 95% range |
| --- | ---: | ---: | ---: | ---: | --- |
| Queen pawn | 4.31 | 3.38 | 3.54 | 4.54 | 4.14–5.00 |
| Vertical bishop | 5.28 | 3.33 | 3.52 | 6.70 | 6.47–6.94 |
| Unicorn | 3.55 | 2.58 | 2.79 | 5.64 | 5.39–5.92 |
| Vanguard | 3.85 | 2.78 | 2.97 | 7.57 | 7.33–7.80 |
| Amazon | 2.98 | 3.00 | 3.16 | 12.16 | 11.88–12.37 |
| Rook pawn | 3.40 | 3.00 | 3.17 | 4.17 | 3.79–4.52 |
| Cruisader | 5.83 | 3.19 | 3.41 | 6.59 | 6.36–6.85 |
| Nightrider | 1.71 | 1.56 | 1.77 | 4.61 | 4.40–4.77 |
| Ranged rook | 4.23 | 3.27 | 3.44 | 8.04 | 7.72–8.36 |
| X-ray queen | 1.42 | 0.99 | 1.24 | 10.24 | 10.05–10.40 |

| Fit | Effective rank | Converged | Held-out Brier | Estimate support |
| --- | ---: | --- | ---: | --- |
| primary baseline | 16/16 | true | 0.04 | conditional only |
| primary head | 16/16 | true | 0.10 | conditional only |
| primary combined | 16/16 | true | 0.09 | conditional only |
| diagnostic baseline | 17/17 | true | 0.04 | conditional only |
| diagnostic head | 17/17 | true | 0.10 | conditional only |
| diagnostic combined | 17/17 | true | 0.09 | conditional only |

## 40,000 nodes

Status: conditional-estimates.

7032 scored paired games; 7025 sampled games; 81268 eligible positions; 64 opening groups.

| Ordinary piece | Combined value | Conditional 95% range |
| --- | ---: | --- |
| pawn | 1.00 (assumed) | fixed assumption |
| knight | 2.87 | 2.74–2.95 |
| bishop | 3.18 | 3.11–3.24 |
| rook | 4.57 | 4.47–4.66 |
| queen | 9.00 (assumed) | fixed assumption |

| Upgrade | Baseline bonus | Head-to-head bonus | Combined bonus | Whole piece | Whole-piece conditional 95% range |
| --- | ---: | ---: | ---: | ---: | --- |
| Queen pawn | 3.59 | 3.35 | 3.50 | 4.50 | 4.18–4.71 |
| Vertical bishop | 3.80 | 3.23 | 3.40 | 6.58 | 6.29–6.79 |
| Unicorn | 3.95 | 2.58 | 2.82 | 5.69 | 5.48–5.88 |
| Vanguard | 5.39 | 2.72 | 2.94 | 7.51 | 7.25–7.75 |
| Amazon | 3.86 | 3.00 | 3.19 | 12.19 | 11.98–12.42 |
| Rook pawn | 3.09 | 2.97 | 3.13 | 4.13 | 3.84–4.49 |
| Cruisader | 4.28 | 3.05 | 3.25 | 6.43 | 6.18–6.65 |
| Nightrider | 1.50 | 1.67 | 1.87 | 4.74 | 4.49–4.95 |
| Ranged rook | 3.84 | 3.29 | 3.45 | 8.02 | 7.79–8.27 |
| X-ray queen | 1.49 | 1.14 | 1.41 | 10.41 | 10.21–10.63 |

| Fit | Effective rank | Converged | Held-out Brier | Estimate support |
| --- | ---: | --- | ---: | --- |
| primary baseline | 16/16 | true | 0.03 | conditional only |
| primary head | 16/16 | true | 0.10 | conditional only |
| primary combined | 16/16 | true | 0.08 | conditional only |
| diagnostic baseline | 17/17 | true | 0.03 | conditional only |
| diagnostic head | 17/17 | true | 0.10 | conditional only |
| diagnostic combined | 17/17 | true | 0.08 | conditional only |

## 80,000 nodes

Status: conditional-estimates.

7034 scored paired games; 7030 sampled games; 85565 eligible positions; 64 opening groups.

| Ordinary piece | Combined value | Conditional 95% range |
| --- | ---: | --- |
| pawn | 1.00 (assumed) | fixed assumption |
| knight | 2.83 | 2.76–2.89 |
| bishop | 3.10 | 3.02–3.20 |
| rook | 4.60 | 4.51–4.69 |
| queen | 9.00 (assumed) | fixed assumption |

| Upgrade | Baseline bonus | Head-to-head bonus | Combined bonus | Whole piece | Whole-piece conditional 95% range |
| --- | ---: | ---: | ---: | ---: | --- |
| Queen pawn | 5.22 | 3.74 | 3.90 | 4.90 | 4.61–5.13 |
| Vertical bishop | 4.41 | 3.15 | 3.35 | 6.45 | 6.22–6.68 |
| Unicorn | 5.06 | 2.65 | 2.91 | 5.74 | 5.55–6.02 |
| Vanguard | 3.80 | 2.68 | 2.88 | 7.48 | 7.30–7.71 |
| Amazon | 4.32 | 2.83 | 3.06 | 12.06 | 11.92–12.27 |
| Rook pawn | 6.56 | 3.05 | 3.27 | 4.27 | 3.98–4.55 |
| Cruisader | 4.89 | 3.23 | 3.44 | 6.54 | 6.36–6.76 |
| Nightrider | 1.87 | 1.50 | 1.76 | 4.59 | 4.35–4.77 |
| Ranged rook | 6.31 | 3.48 | 3.66 | 8.26 | 8.07–8.42 |
| X-ray queen | 1.21 | 0.89 | 1.18 | 10.18 | 10.00–10.37 |

| Fit | Effective rank | Converged | Held-out Brier | Estimate support |
| --- | ---: | --- | ---: | --- |
| primary baseline | 16/16 | true | 0.03 | conditional only |
| primary head | 16/16 | true | 0.09 | conditional only |
| primary combined | 16/16 | true | 0.08 | conditional only |
| diagnostic baseline | 17/17 | true | 0.03 | conditional only |
| diagnostic head | 17/17 | true | 0.09 | conditional only |
| diagnostic combined | 17/17 | true | 0.08 | conditional only |

Head-to-head scores compare upgrade bonuses over each ordinary army. Whole-piece totals add the ordinary family estimate from the same fit. Their ranges use joint refits, preserving covariance.

Games have equal total fitting weight. Folds and resamples withhold whole opening groups; material-stable windows do not prove tactical quietness. Unfinished or truncated pairs are excluded. Unsupported estimates remain unavailable. Free-ratio diagnostic fits test the anchored model without changing it.
