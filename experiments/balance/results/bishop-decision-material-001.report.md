# Material estimates from the final bishop comparison

Primary cohort: the 1,280 new comparison games only. No historical games are pooled into this fit. Pawn = 1 and queen = 9 are assumed anchors; native engine values and purchase costs are unchanged.

| Reference | Ordinary counterpart | Added value | Added conditional 95% range | Whole piece | Whole conditional 95% range |
| --- | ---: | ---: | --- | ---: | --- |
| Vanguard | 4.86 | 3.15 | 2.74–3.70 | 8.01 | 7.49–8.71 |
| Unicorn | 3.04 | 3.17 | 2.67–3.68 | 6.21 | 5.64–6.77 |
| Cruisader | 3.42 | 3.40 | 3.04–3.76 | 6.81 | 6.44–7.28 |
| Amazon | 9.00 | 3.58 | 3.10–3.97 | 12.58 | 12.10–12.97 |

Whole-piece intervals add ordinary family and bonus within each same normalized bootstrap refit. They are not sums of separate interval endpoints.

| Ordinary piece | Value | Conditional 95% range |
| --- | ---: | --- |
| pawn | 1.00 | fixed assumption |
| knight | 3.04 | 2.74–3.29 |
| bishop | 3.42 | 3.15–3.62 |
| rook | 4.86 | 4.65–5.10 |
| queen | 9.00 | fixed assumption |

The unselected long quiet-hop bishop remains in the model as a nuisance design: bonus 2.53, range 2.00–2.99. Its games are not attributed to Cruisader.

All 1280 games and 151488 plies replay. Material sampling retains 13344 stable positions from 1276 games: 5391 middlegame and 7953 endgame. 4 games have no eligible samples. All 640 raw color pairs are complete; 4 pairs contribute sampled positions from only one game.

Sampling: ply 16 onward, stride 5, unchanged material for two plies before and after; each sampled game has total weight one. The model retains ordinary material and all five observed upgrade bonuses, omitting only eight unused profile bonus columns.

Anchored design rank: 11/11; converged: true. Bootstrap: 200/200 valid normalized refits. Failures: 0 rank, 0 convergence, 0 pawn scale, 0 separation.

Five opening-group validation folds supported: true. Held-out Brier score 0.10661; constant-score baseline 0.20751.

Intervals use 200 whole-opening percentile resamples, seed 42, over all 128 selected opening groups. Related opening ancestry is unknown. These ranges condition on this selected head-to-head cohort and playing policy; they are not universal exchange prices. No ordinary/single-upgrade control games occur in this cohort.

The earlier broader fit remains separate: Vanguard +3.34, Unicorn +3.48, Amazon +3.78. Different cohorts can change fitted values without changing any saved matchup score or reference design.

The [complete upload audit](bishop-decision-complete-001.audit.json) verifies the manifests, rules, recorded engine/source identities and all nine original matchup scores/ranges. The [material audit JSON](bishop-decision-material-001.audit.json) retains exact input/source hashes, sample identity, model coefficients, diagnostics and intervals. Raw uploads are preserved compressed; large derived sample/EPD files are regenerated when needed.

Reproduce offline without an engine or new matches:

```powershell
node experiments/balance/results/bishop-decision-material-001.audit.cjs
```
