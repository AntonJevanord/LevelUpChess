# Final version-17 panel review

The 64-opening panel finalized **21,120 games**. Its recorded stage receipts
report **21,106 scored games in 10,553 complete color pairs**. Seven pairs are
unscored; this does not establish how many individual games were truncated.
Budgets remain separate: 20k has 7,040 scored games, 40k has 7,032 and 80k has
7,034. Each budget includes ordinary-army anchors as well as head-to-head games.

The [saved outcome audit](../experiments/balance/results/v17-level3-panel-004.report.md)
recomputes the color and exclusion reports from the compact export and checks
the panel's head-to-head scores. The uploaded material report is retained as
reported evidence; its position-level fits have not been reproduced here.

## Roster results

These averages use the other nine upgrades, equal colors and each row's shared
complete opening cases. They measure the upgrade's effect on its starting army,
rather than comparing isolated pieces or assigning an intrinsic Elo.

| Upgrade | 20k score | 40k score | 80k score | 80k fitted upgrade bonus |
| --- | ---: | ---: | ---: | ---: |
| Herald | 47.40% | 47.05% | 47.35% | 3.90 |
| Inquisitor | 57.47% | 54.85% | 55.25% | 3.35 |
| Unicorn | 51.17% | 51.79% | 52.29% | 2.91 |
| Vanguard | 53.43% | 54.54% | 53.60% | 2.88 |
| Amazon | 51.30% | 51.91% | 50.09% | 3.06 |
| Ranger | 49.26% | 48.87% | 47.18% | 3.27 |
| Crusader | 53.65% | 53.17% | 55.47% | 3.44 |
| Nightrider, original `N0` | 41.67% | 42.66% | 43.14% | 1.76 |
| Cataphract, original `RC` | 61.63% | 60.54% | 63.71% | 3.66 |
| Wraith | 33.03% | 34.85% | 32.29% | 1.18 |

Missing pairs leave 61–64 shared cases per row at 80k. The four frozen
references remain healthy against one another: their 80k internal means range
from **48.18% to 51.56%**. Keep Vanguard, Unicorn, Crusader and Amazon fixed.

Original Cataphract is strong across budgets and against the frozen references.
Use the already tested **`RsCfC` revision** for the next roster activation:
49.61% at 40k and 52.34% at 80k in its separate fixed confirmation. Its sixteen
confirmation openings and four opponents remain distinct from this panel;
the new body does not inherit `RC`'s games or material estimates, and does not
become a fifth frozen reference automatically.

Keep original Nightrider and Wraith as explicit exploration choices, following
the earlier decisions. Nightrider's 43.14% full-roster score at 80k becomes
**39.06% against the four frozen references**. Its apparent late recovery does
not establish parity. The strong `N0cF` revision remains parked; no new sequence
of small movement changes is scheduled. Wraith's roughly 32–35% scores confirm
the accepted off-meta status rather than a reason to restart its design now.

Herald and Ranger are on the lower side, while both bishops are on the higher
side of the loose 40–60% roster screen. Their opponent-specific differences are
useful inputs to mixed-army work; they do not require another broad panel.

## Colors, exclusions and search

| Nodes | Physical White score | Conditional 95% range | Cases shared by all 45 matchups |
| --- | ---: | --- | ---: |
| 20,000 | 55.13% | 53.19–57.13% | 64 |
| 40,000 | 56.93% | 55.20–58.70% | 61 |
| 80,000 | 57.70% | 55.66–59.64% | 61 |

An even army matchup can still depend strongly on initiative. At 80k,
Unicorn scores **64.06% as White and 39.06% as Black against Vanguard**, giving
a balanced 51.56%. White scores 62.50% across those two armies. The overall
means already weight both colors equally; subtracting White's advantage again
would distort them.

Excluding original Cataphract and Wraith leaves most remaining means close to
their previous values. Nightrider falls to **40.85%** at 80k; its weakness is
not explained by those two opponents. Ranger gains an opening case after this
exclusion, so its available-case score and controlled same-case change differ.
Keep this coverage distinction in subsequent comparisons.

For every piece, the matched opening-block conditional range for its overall
80k-minus-20k score change includes zero. Individual matchup changes remain
exploratory across many comparisons. More search has not established that the
roster converges toward 50%, and these budgets do not establish normal-chess Elo.

## Material estimates

All three reported primary fits converge at effective rank 16/16 across 64
opening groups. Ordinary estimates are stable: knight **2.83–2.87**, bishop
**3.10–3.18**, rook **4.57–4.60**. Pawn = 1 and queen = 9 are imposed assumptions,
not independently recovered controls.

The fitted bonuses consistently separate weak Nightrider/Wraith from the main
roster and put original Cataphract high. They do not order army matchup scores
perfectly: Herald has a larger fitted bonus than Amazon while scoring lower
overall. Material remaining later in a game and the tactical effect of a
starting upgrade are different predictors of the outcome.

Treat baseline-only exact prices cautiously. At 80k, Ranger's reported bonus
is 6.56 against ordinary armies versus 3.05 in head-to-head data; Cataphract is
6.31 versus 3.48. Almost automatic wins against ordinary armies leave little
discrimination between large advantages. Context and model limitations also
matter; this discrepancy does not establish a new engine valuation bug.

The material report covers **21,079 sampled games and 242,293 eligible
positions**. Twenty-seven scored games contribute no eligible samples. Keep
engine MG/EG priors and purchase costs unchanged. Before any future prior
retuning, inspect the structured material diagnostics, free-ratio coefficients
and held-out residuals; the rounded Markdown tables do not settle calibration.

## Closeout and evidence limits

The final 64-case review supersedes the planned interim 32-case review. Earlier
outcome totals remain recoverable from the saved games or compact pairs. The
version-17 closeout keeps the tested playable roster unchanged. After the branch
split, activate the selected quiet-tall level-two Knight pawn and preferred
Cataphract revision in fresh version-18 profiles, preserving historical
definitions and the original four reference IDs. Complete the relevant rule,
engine, save and browser checks before bounded mixed-army work.

The prepared engine-sharing benchmark can now run separately on the laptop.
Its result informs runner performance, not the roster's balance decision.

The raw uploaded journal exceeds the workspace's 32 MiB transfer limit. The
compact export retains scores, identities and recorded source checksums, so
color/exclusion analysis is reproducible without that journal. The checksums
do not independently re-attest unavailable original files or the executable.
Material coefficients and ordinary-anchor outcomes are retained from the
uploaded reports; the compact file has no move histories for refitting or legal
replay. No new scored games or material fits were run for this review.
