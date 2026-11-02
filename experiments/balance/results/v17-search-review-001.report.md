# Search budgets: Nightrider revisions and Cataphract

This review uses 576 completed focused games and 5,280 balanced panel games across sixteen cases. Eight extra 20k games from the next panel batch remain archived and are excluded from these matched comparisons.

| Nodes | Original N0 | Diagonal N0cF | Orthogonal N0cW |
| ---: | ---: | ---: | ---: |
| 20000 | 41.41% | 53.91% | 73.44% |
| 40000 | 45.31% | 51.56% | 70.31% |
| 80000 | 44.53% | 67.97% | 76.56% |

Each cell contains 64 games: eight openings × four opponents × two colors. It contains 32 color pairs and eight opening blocks, not 64 independent opening positions. Even an idealized 64 independent decisive games near 50% has standard error 6.25 percentage points and an approximate 95% margin of ±12 points. That illustration does not replace the grouped analysis here.

| Change to 80k | Metric | Difference (pp) | Conditional block-bootstrap 95% | Small-sample t sensitivity 95% |
| --- | --- | ---: | --- | --- |
| 20000→80000 | Diagonal score | 14.06 | 0.78 to 28.13 | -3.55 to 31.67 |
| 20000→80000 | N0 score | 3.13 | -4.69 to 10.16 | -6.95 to 13.20 |
| 20000→80000 | Diagonal gain over N0 | 10.94 | -1.56 to 23.44 | -5.05 to 26.92 |
| 40000→80000 | Diagonal score | 16.41 | -3.13 to 35.16 | -8.41 to 41.22 |
| 40000→80000 | N0 score | -0.78 | -8.59 to 7.81 | -11.39 to 9.83 |
| 40000→80000 | Diagonal gain over N0 | 17.19 | 2.34 to 31.25 | -1.70 to 36.08 |

The original focus-report intervals compare each revision with N0 at the same budget; they do not directly test a change between budgets. The diagonal 40k→80k score change is +16.41 points, but its paired opening-bootstrap range includes zero. Its gain over the fresh control rises too; that interaction has a positive percentile lower endpoint while the small-sample t sensitivity range crosses zero. With eight fixed holdout cases, neither endpoint should be treated as definitive proof of a stable computation effect.

Five of eight openings favor the diagonal version at 80k over 40k, and three favor 40k. The mean budget gain stays positive when any one opening is omitted; this is broader than one outlier, but it still needs replication. At 80k the diagonal version scores 78.13% against Vanguard, 50% against Unicorn, 75% against Crusader and 68.75% against Amazon. Its physical-color scores are 79.69% as White and 56.25% as Black. Orthogonal captures remain high at every budget and can be parked.

## Cataphract

| Nodes | All nine opponents | Frozen four | Without Nightrider/Wraith | First eight (all9) | Second eight (all9) |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 20000 | 61.11% | 57.81% | 57.37% | 59.38% | 62.85% |
| 40000 | 55.56% | 53.91% | 55.80% | 54.86% | 56.25% |
| 80000 | 66.32% | 62.89% | 63.84% | 66.32% | 66.32% |

At 80k Cataphract repeats 66.32% in each distinct eight-case cohort. Combined, it has 288 head-to-head games, sixteen opening blocks and a conditional overall range of 61.46 to 70.83%. Its lead persists against the frozen four and after excluding the two weakest roster pieces. Against the references it scores 65.63% versus Vanguard, 50% versus Unicorn, 57.81% versus Crusader and 78.13% versus Amazon. Its largest reference advantage is the Amazon matchup. This is more convincing evidence of a high 80k score than a single eight-case fluctuation, without establishing a universal exchange value or a required nerf.

The roster mean is mechanically 50%. Most central pieces are near it, but the full distribution does not tighten monotonically: the sixteen-case spread narrows at 40k and widens at 80k. Inquisitor also scores 61.28% at 20k. Finish the already-running 32-case panel before redesigning Cataphract or the rest of the roster.

## Bounded next decision

Keep diagonal Nightrider as a candidate rather than freeze it as balanced. One fresh confirmation can compare N0/N0cF at 40k/80k on 16 new matched openings against the four references: 512 games. The omitted 20k budget and already-strong orthogonal variant need not be repeated. Preregister the cases and completion target, keep the discovery results separate, and review opponent/color effects. This recommendation starts no games and does not alter an existing campaign.

The deterministic bootstrap enumerates the empirical opening-block distribution by discrete convolution; it removes Monte Carlo variation in the displayed endpoints. It does not improve small-sample coverage or account for wider opening ancestry, post-selection or search-prior bias. Existing uploaded reports and their original bootstrap ranges remain unchanged.

- A physical game count is not an independent-opening count. Both colors and all fixed opponents stay in each opening block.
- Budget changes are paired by the same opening. Small-sample t intervals are sensitivity checks, not valid population intervals for selected fixed books.
- Conditional percentile bootstrap coverage can be fragile with eight blocks. A positive endpoint in one method does not establish a depth interaction.
- Cataphract cohort replication compares the first and second eight-case batches, rather than counting the cumulative snapshots twice.
- A complete symmetric round robin averages 50% by construction. Individual scores and dispersion still matter.
- Keep node budgets and opponent baskets separate. No material values, intrinsic Elo, movement or engine priors are changed.

Verify with `node scripts/balance/v17-search-budget-review.js`. No engine is started.
