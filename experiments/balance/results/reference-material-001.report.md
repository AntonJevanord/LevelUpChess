# All-reference head-to-head material estimates

This separate fit uses all 1,534 complete scored color-paired games between the four exact frozen references. It excludes other experimental opponents. Pawn = 1 and queen = 9 are assumptions. Earlier reports, reference designs, native values and purchase costs are unchanged.

| Reference | Added value | Added conditional 95% range | Whole piece | Whole conditional 95% range |
| --- | ---: | --- | ---: | --- |
| Vanguard | 3.12 | 2.76–3.52 | 7.85 | 7.43–8.33 |
| Unicorn | 2.82 | 2.45–3.20 | 5.70 | 5.25–6.21 |
| Cruisader | 3.26 | 2.95–3.64 | 6.50 | 6.14–6.94 |
| Amazon | 3.37 | 3.06–3.82 | 12.37 | 12.06–12.82 |

Ordinary values in this same fit:

| Piece | Estimate | Conditional 95% range |
| --- | ---: | --- |
| pawn | 1.00 | fixed assumption |
| knight | 2.88 | 2.65–3.12 |
| bishop | 3.24 | 3.02–3.44 |
| rook | 4.73 | 4.52–4.99 |
| queen | 9.00 | fixed assumption |

Whole-piece values add family plus bonus before rounding. Their ranges use the sum within each same normalized bootstrap refit.

| Reference matchup (first piece perspective) | Games | W / D / L | Points score |
| --- | ---: | --- | ---: |
| Unicorn / Amazon | 254 | 115 / 30 / 109 | 51.18% |
| Vanguard / Unicorn | 256 | 108 / 45 / 103 | 50.98% |
| Vanguard / Amazon | 256 | 120 / 30 / 106 | 52.73% |
| Cruisader / Vanguard | 256 | 112 / 42 / 102 | 51.95% |
| Cruisader / Unicorn | 256 | 95 / 54 / 107 | 47.66% |
| Cruisader / Amazon | 256 | 116 / 33 / 107 | 51.76% |

Selection scans 7040 records in three authoritative journals: 1536 concern the exact references; 5504 other-opponent records are excluded. One Unicorn/Amazon game hit the 400-ply cap; its completed opposite-color partner is excluded from this paired analysis. Both original records remain preserved. No completed game is silently scored as a draw.

Selected sources contribute 254 original Unicorn/Amazon games, 512 simple-study Vanguard games, and 768 final-decision Cruisader games. All 176824 plies replay under their original profiles, then material features align by immutable design ID. Duplicated inherited copies add no weight.

Sampling retains 15216 stable positions from 1526 games (6375 middlegame / 8841 endgame). 8 games have no eligible positions; 8 pairs contribute samples from only one game. All 767 raw pairs remain complete. Each sampled game has unit total weight; min-ply 16, stride 5, two unchanged-material plies before/after.

All sources share 128 selected opening groups, engine/search settings and the recorded relevant material tables. Each source retains its profile, identity and policy. The simple study has a reconstructed replay descriptor rather than its original collection manifest; its value evidence is a compatibility preflight. Bounded compatibility supports this conditional pooled estimate without establishing universal process equivalence.

Anchored rank 10/10; converged true; 200/200 valid bootstrap fits. All five held-out folds supported: true. Held-out Brier 0.11073, constant baseline 0.21002.

Intervals use 200 whole-opening resamples, seed 42. Every context and matchup belonging to an opening shares its resample multiplicity and validation fold. There are 128 opening groups, not 1,534 independent observations; broader ancestry is unknown.

The [earlier 1,280-game fit](bishop-decision-material-001.report.md) included the unselected long-hop bishop and had different opponent coverage. It remains unchanged: Vanguard 8.01, Unicorn 6.21, Cruisader 6.81, Amazon 12.58. Coefficients can change with the cohort. Material-only values do not capture every tactical matchup; the near-even observed scores and frozen designs are unchanged.

No new match games, engine searches, evaluator tuning or ordinary-control collection were performed. Reproduce from the existing archives:

```powershell
node experiments/balance/results/reference-material-001.audit.cjs
```
