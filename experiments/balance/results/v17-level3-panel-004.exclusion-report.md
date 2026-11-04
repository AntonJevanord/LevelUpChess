# Panel roster exclusions

Every scenario reuses observed results. No games, engine searches or material models are rerun.

## Opponent exclusions — 20,000 nodes

Each cell is the retained upgrade’s score, followed by its number of shared opening cases. Excluded matchups are removed; retained games are unchanged.

| Upgrade | Full roster | Without Herald | Without Inquisitor | Without Unicorn | Without Vanguard | Without Amazon | Without Ranger | Without Crusader | Without Nightrider | Without Cataphract | Without Wraith |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Herald | 47.40% (64) | — | 48.14% (64) | 47.22% (64) | 48.34% (64) | 46.83% (64) | 47.02% (64) | 47.85% (64) | 46.73% (64) | 48.97% (64) | 45.46% (64) |
| Inquisitor | 57.47% (64) | 57.32% (64) | — | 58.15% (64) | 58.64% (64) | 58.11% (64) | 57.18% (64) | 56.98% (64) | 56.35% (64) | 58.79% (64) | 55.66% (64) |
| Unicorn | 51.17% (64) | 51.17% (64) | 51.56% (64) | — | 51.12% (64) | 51.76% (64) | 52.20% (64) | 50.98% (64) | 50.05% (64) | 52.20% (64) | 49.51% (64) |
| Vanguard | 53.43% (64) | 52.59% (64) | 53.61% (64) | 54.05% (64) | — | 54.10% (64) | 52.78% (64) | 53.96% (64) | 54.15% (64) | 54.69% (64) | 50.93% (64) |
| Amazon | 51.30% (64) | 51.71% (64) | 51.76% (64) | 51.03% (64) | 51.22% (64) | — | 50.88% (64) | 51.42% (64) | 50.34% (64) | 53.17% (64) | 50.20% (64) |
| Ranger | 49.26% (64) | 49.22% (64) | 50.39% (64) | 48.29% (64) | 50.24% (64) | 49.76% (64) | — | 50.15% (64) | 47.80% (64) | 51.22% (64) | 46.29% (64) |
| Crusader | 53.65% (64) | 53.32% (64) | 55.52% (64) | 54.44% (64) | 54.00% (64) | 54.15% (64) | 53.13% (64) | — | 52.25% (64) | 53.71% (64) | 52.29% (64) |
| Nightrider | 41.67% (64) | 40.97% (64) | 42.68% (64) | 41.89% (64) | 40.33% (64) | 41.75% (64) | 41.99% (64) | 42.48% (64) | — | 42.77% (64) | 40.14% (64) |
| Cataphract | 61.63% (64) | 61.18% (64) | 62.70% (64) | 62.21% (64) | 62.26% (64) | 61.38% (64) | 61.04% (64) | 63.48% (64) | 60.94% (64) | — | 59.52% (64) |
| Wraith | 33.03% (64) | 32.52% (64) | 33.64% (64) | 32.71% (64) | 33.84% (64) | 32.18% (64) | 33.79% (64) | 32.71% (64) | 31.40% (64) | 34.47% (64) | — |

Full-roster coverage shared by every retained matchup: 64/64 cases. JSON also provides stricter standings using this common case set.

- Scores average both observed colors, declared opening cases and remaining opponents equally. Ordinary-army anchors do not enter standings.
- Removing a piece removes its matchups from the opponent basket; every retained head-to-head result stays unchanged. This is reweighting, not a counterfactual game replay or material refit.
- Filtered rows may gain opening cases when an excluded opponent had an unfinished pair. Matched changes compare full and filtered baskets only on the same original complete cases.
- Row-wise standings retain all cases complete against that row’s opponents, so rows can have different coverage. The separate global-case standings use one common roster-wide case set.
- Conditional ranges resample whole opening blocks, retaining both colors and opponents together. Related openings, engine bias and selection after viewing results remain outside them.
- Removing weak opponents can lower remaining averages; removing strong opponents can raise them. Neither result means a retained piece changed strength.

## Opponent exclusions — 40,000 nodes

Each cell is the retained upgrade’s score, followed by its number of shared opening cases. Excluded matchups are removed; retained games are unchanged.

| Upgrade | Full roster | Without Herald | Without Inquisitor | Without Unicorn | Without Vanguard | Without Amazon | Without Ranger | Without Crusader | Without Nightrider | Without Cataphract | Without Wraith |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Herald | 47.05% (64) | — | 48.24% (64) | 46.39% (64) | 47.46% (64) | 47.46% (64) | 46.19% (64) | 47.61% (64) | 45.85% (64) | 48.93% (64) | 45.31% (64) |
| Inquisitor | 54.85% (63) | 53.97% (63) | — | 55.66% (64) | 55.80% (63) | 56.15% (63) | 54.81% (63) | 54.81% (63) | 53.72% (63) | 55.90% (63) | 53.03% (63) |
| Unicorn | 51.79% (62) | 52.17% (62) | 51.59% (63) | — | 51.81% (62) | 51.81% (62) | 52.67% (62) | 52.12% (62) | 51.16% (62) | 52.63% (63) | 49.70% (62) |
| Vanguard | 54.54% (63) | 54.32% (63) | 54.71% (63) | 55.26% (63) | — | 54.17% (63) | 53.47% (63) | 55.66% (64) | 54.56% (63) | 55.95% (63) | 52.68% (63) |
| Amazon | 51.91% (64) | 51.37% (64) | 51.46% (64) | 52.25% (64) | 53.08% (64) | — | 51.86% (64) | 50.83% (64) | 50.83% (64) | 54.30% (64) | 51.22% (64) |
| Ranger | 48.87% (64) | 49.22% (64) | 49.37% (64) | 48.05% (64) | 50.34% (64) | 49.02% (64) | — | 49.51% (64) | 47.56% (64) | 50.88% (64) | 45.90% (64) |
| Crusader | 53.17% (63) | 52.73% (63) | 54.37% (63) | 53.27% (63) | 52.88% (64) | 54.96% (63) | 52.73% (63) | — | 53.13% (63) | 52.68% (63) | 51.79% (63) |
| Nightrider | 42.66% (64) | 42.58% (64) | 43.55% (64) | 42.63% (64) | 42.38% (64) | 43.07% (64) | 42.92% (64) | 42.14% (64) | — | 42.77% (64) | 41.94% (64) |
| Cataphract | 60.54% (63) | 59.67% (63) | 61.46% (63) | 61.18% (64) | 61.11% (63) | 59.72% (63) | 59.72% (63) | 62.60% (63) | 60.81% (63) | — | 58.68% (63) |
| Wraith | 34.85% (64) | 34.33% (64) | 35.35% (64) | 35.35% (64) | 35.35% (64) | 33.89% (64) | 35.79% (64) | 34.67% (64) | 32.76% (64) | 36.18% (64) | — |

Full-roster coverage shared by every retained matchup: 61/64 cases. JSON also provides stricter standings using this common case set.

- Scores average both observed colors, declared opening cases and remaining opponents equally. Ordinary-army anchors do not enter standings.
- Removing a piece removes its matchups from the opponent basket; every retained head-to-head result stays unchanged. This is reweighting, not a counterfactual game replay or material refit.
- Filtered rows may gain opening cases when an excluded opponent had an unfinished pair. Matched changes compare full and filtered baskets only on the same original complete cases.
- Row-wise standings retain all cases complete against that row’s opponents, so rows can have different coverage. The separate global-case standings use one common roster-wide case set.
- Conditional ranges resample whole opening blocks, retaining both colors and opponents together. Related openings, engine bias and selection after viewing results remain outside them.
- Removing weak opponents can lower remaining averages; removing strong opponents can raise them. Neither result means a retained piece changed strength.

## Opponent exclusions — 80,000 nodes

Each cell is the retained upgrade’s score, followed by its number of shared opening cases. Excluded matchups are removed; retained games are unchanged.

| Upgrade | Full roster | Without Herald | Without Inquisitor | Without Unicorn | Without Vanguard | Without Amazon | Without Ranger | Without Crusader | Without Nightrider | Without Cataphract | Without Wraith |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Herald | 47.35% (64) | — | 47.71% (64) | 47.17% (64) | 47.31% (64) | 46.39% (64) | 46.63% (64) | 49.37% (64) | 47.02% (64) | 49.51% (64) | 45.07% (64) |
| Inquisitor | 55.25% (63) | 55.31% (63) | — | 55.46% (63) | 55.06% (63) | 55.46% (63) | 55.42% (64) | 55.61% (63) | 54.96% (63) | 57.04% (63) | 53.08% (63) |
| Unicorn | 52.29% (63) | 52.43% (63) | 53.03% (63) | — | 52.38% (63) | 52.88% (63) | 52.88% (64) | 52.73% (63) | 50.94% (63) | 52.93% (63) | 50.35% (63) |
| Vanguard | 53.60% (64) | 53.76% (64) | 54.98% (64) | 54.25% (64) | — | 52.78% (64) | 52.34% (64) | 54.54% (64) | 53.22% (64) | 55.03% (64) | 51.51% (64) |
| Amazon | 50.09% (64) | 50.73% (64) | 50.44% (64) | 49.76% (64) | 51.37% (64) | — | 49.71% (64) | 49.85% (64) | 47.75% (64) | 52.59% (64) | 48.58% (64) |
| Ranger | 47.18% (61) | 47.34% (61) | 47.28% (62) | 46.32% (62) | 48.41% (61) | 47.23% (61) | — | 48.57% (61) | 45.29% (61) | 49.19% (62) | 44.88% (61) |
| Crusader | 55.47% (64) | 53.81% (64) | 56.49% (64) | 56.01% (64) | 55.66% (64) | 56.40% (64) | 54.49% (64) | — | 55.37% (64) | 56.93% (64) | 54.05% (64) |
| Nightrider | 43.14% (64) | 42.29% (64) | 43.26% (64) | 43.80% (64) | 43.12% (64) | 44.63% (64) | 43.85% (64) | 43.07% (64) | — | 42.97% (64) | 41.31% (64) |
| Cataphract | 63.71% (63) | 62.95% (63) | 64.19% (63) | 65.03% (63) | 64.43% (63) | 62.80% (63) | 62.65% (64) | 64.73% (63) | 64.63% (63) | — | 61.61% (63) |
| Wraith | 32.29% (64) | 32.03% (64) | 32.96% (64) | 32.37% (64) | 32.62% (64) | 31.59% (64) | 32.03% (64) | 32.18% (64) | 31.05% (64) | 33.79% (64) | — |

Full-roster coverage shared by every retained matchup: 61/64 cases. JSON also provides stricter standings using this common case set.

- Scores average both observed colors, declared opening cases and remaining opponents equally. Ordinary-army anchors do not enter standings.
- Removing a piece removes its matchups from the opponent basket; every retained head-to-head result stays unchanged. This is reweighting, not a counterfactual game replay or material refit.
- Filtered rows may gain opening cases when an excluded opponent had an unfinished pair. Matched changes compare full and filtered baskets only on the same original complete cases.
- Row-wise standings retain all cases complete against that row’s opponents, so rows can have different coverage. The separate global-case standings use one common roster-wide case set.
- Conditional ranges resample whole opening blocks, retaining both colors and opponents together. Related openings, engine bias and selection after viewing results remain outside them.
- Removing weak opponents can lower remaining averages; removing strong opponents can raise them. Neither result means a retained piece changed strength.

