# Cataphract camel restrictions

Two new candidates face the four frozen references on sixteen fresh matched openings, both colors, at 40k and 80k. Scores count draws as half a point. The original RC stays a separate benchmark in the ongoing panel; this 512-game study does not rerun it or merge historical evidence.

`RsCfC` keeps six camel jumps: four wide sideways jumps (including the backward pair), plus the two tall forward jumps. `RfhC` keeps only the four forward camel jumps. Both retain all ordinary rook moves, captures and castling.

| Budget | Matched cases | RfhC minus RsCfC score (pp) | Conditional 95% range (pp) |
| ---: | ---: | ---: | --- |
| 40000 | 16/16 | -10.94 | -21.49 to 0.00 |
| 80000 | 16/16 | -12.50 | -23.05 to -2.33 |

Contrasts keep whole opening blocks, both colors and all four equally weighted opponents together. These fixed-case ranges are conditional, not universal piece-value intervals. Truncations are unscored. Both candidates use the original RC search prior, not their lower automatic values or a fitted material estimate.

# Cataphract camel restrictions (40000 nodes)

Which directional camel restriction is closer to an even reference score at 40k and 80k? Original RC remains a separate ongoing-panel benchmark, not a fresh control or merged historical result.

Finalized games: 256/256; scored complete pairs: 128.

| Row army / column opponent | Vanguard | Unicorn | Crusader | Amazon | Overall score (cases) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Cataphract: no tall backward camel | 51.56% | 51.56% | 42.19% | 53.13% | 49.61% (16/16) |
| Cataphract: forward camel half | 43.75% | 39.06% | 35.94% | 35.94% | 38.67% (16/16) |

Matrix entries are the row army’s score; a blank dash means no scored pair or no scheduled matchup.

Overall score gives each fixed reference equal weight; reference 2v2 teams instead weight all other scheduled teams equally. Direct pawn/grant bundle matches are excluded from reference averages. Draws count half a point. Only opening cases with every scheduled repetition and both colors completed against every included opponent contribute. Other completed games remain in individual matchup cells; overall stays pending until at least one case is shared.

| Overall row | Included games | W / D / L | Overall score | Opponents | Shared cases |
| --- | ---: | :--- | ---: | ---: | ---: |
| Cataphract: no tall backward camel | 128 | 48 / 31 / 49 | 49.61% | 4 | 16/16 |
| Cataphract: forward camel half | 128 | 40 / 19 / 69 | 38.67% | 4 | 16/16 |

| A versus B | Paired games | A W / D / L | A score | Complete pairs | Openings | Truncated attempts | Errors |
| --- | ---: | :--- | ---: | ---: | ---: | ---: | ---: |
| Cataphract: no tall backward camel / Vanguard | 32 | 12 / 9 / 11 | 51.56% | 16/16 | 16 | 0 | 0 |
| Cataphract: no tall backward camel / Unicorn | 32 | 13 / 7 / 12 | 51.56% | 16/16 | 16 | 0 | 0 |
| Cataphract: no tall backward camel / Crusader | 32 | 9 / 9 / 14 | 42.19% | 16/16 | 16 | 0 | 0 |
| Cataphract: no tall backward camel / Amazon | 32 | 14 / 6 / 12 | 53.13% | 16/16 | 16 | 0 | 0 |
| Cataphract: forward camel half / Vanguard | 32 | 12 / 4 / 16 | 43.75% | 16/16 | 16 | 0 | 0 |
| Cataphract: forward camel half / Unicorn | 32 | 10 / 5 / 17 | 39.06% | 16/16 | 16 | 0 | 0 |
| Cataphract: forward camel half / Crusader | 32 | 7 / 9 / 16 | 35.94% | 16/16 | 16 | 0 | 0 |
| Cataphract: forward camel half / Amazon | 32 | 11 / 1 / 20 | 35.94% | 16/16 | 16 | 0 | 0 |

- Scores use complete color-swapped pairs only, with equal weight for each represented opening prefix. Draws count half a point.
- Unpaired completions, move-limit truncations, errors and cancelled games do not become draws or losses.
- 16 fixed short prefixes are a coarse descriptive screen, not independent samples supporting a precise strength estimate. No material values or individual piece Elo are fitted.
- This report validates journal identities and summarizes recorded outcomes; it does not independently replay every move.

# Cataphract camel restrictions (80000 nodes)

Which directional camel restriction is closer to an even reference score at 40k and 80k? Original RC remains a separate ongoing-panel benchmark, not a fresh control or merged historical result.

Finalized games: 256/256; scored complete pairs: 128.

| Row army / column opponent | Vanguard | Unicorn | Crusader | Amazon | Overall score (cases) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Cataphract: no tall backward camel | 54.69% | 50.00% | 45.31% | 59.38% | 52.34% (16/16) |
| Cataphract: forward camel half | 48.44% | 35.94% | 34.38% | 40.63% | 39.84% (16/16) |

Matrix entries are the row army’s score; a blank dash means no scored pair or no scheduled matchup.

Overall score gives each fixed reference equal weight; reference 2v2 teams instead weight all other scheduled teams equally. Direct pawn/grant bundle matches are excluded from reference averages. Draws count half a point. Only opening cases with every scheduled repetition and both colors completed against every included opponent contribute. Other completed games remain in individual matchup cells; overall stays pending until at least one case is shared.

| Overall row | Included games | W / D / L | Overall score | Opponents | Shared cases |
| --- | ---: | :--- | ---: | ---: | ---: |
| Cataphract: no tall backward camel | 128 | 51 / 32 / 45 | 52.34% | 4 | 16/16 |
| Cataphract: forward camel half | 128 | 36 / 30 / 62 | 39.84% | 4 | 16/16 |

| A versus B | Paired games | A W / D / L | A score | Complete pairs | Openings | Truncated attempts | Errors |
| --- | ---: | :--- | ---: | ---: | ---: | ---: | ---: |
| Cataphract: no tall backward camel / Vanguard | 32 | 13 / 9 / 10 | 54.69% | 16/16 | 16 | 0 | 0 |
| Cataphract: no tall backward camel / Unicorn | 32 | 12 / 8 / 12 | 50.00% | 16/16 | 16 | 0 | 0 |
| Cataphract: no tall backward camel / Crusader | 32 | 10 / 9 / 13 | 45.31% | 16/16 | 16 | 0 | 0 |
| Cataphract: no tall backward camel / Amazon | 32 | 16 / 6 / 10 | 59.38% | 16/16 | 16 | 0 | 0 |
| Cataphract: forward camel half / Vanguard | 32 | 10 / 11 / 11 | 48.44% | 16/16 | 16 | 0 | 0 |
| Cataphract: forward camel half / Unicorn | 32 | 8 / 7 / 17 | 35.94% | 16/16 | 16 | 0 | 0 |
| Cataphract: forward camel half / Crusader | 32 | 8 / 6 / 18 | 34.38% | 16/16 | 16 | 0 | 0 |
| Cataphract: forward camel half / Amazon | 32 | 10 / 6 / 16 | 40.63% | 16/16 | 16 | 0 | 0 |

- Scores use complete color-swapped pairs only, with equal weight for each represented opening prefix. Draws count half a point.
- Unpaired completions, move-limit truncations, errors and cancelled games do not become draws or losses.
- 16 fixed short prefixes are a coarse descriptive screen, not independent samples supporting a precise strength estimate. No material values or individual piece Elo are fitted.
- This report validates journal identities and summarizes recorded outcomes; it does not independently replay every move.

