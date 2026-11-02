# Nightrider capture-step focus

Original N0 and both revisions run fresh under one controlled profile. Each body faces the four frozen references on the same eight cases at each node budget; no historical panel games are counted again.

| Budget | Revision | Matched cases | Score gain over N0 (pp) | Conditional 95% range (pp) |
| ---: | --- | ---: | ---: | --- |
| 20000 | Nightrider: diagonal captures | 8/8 | 12.50 | -1.56 to 24.22 |
| 20000 | Nightrider: orthogonal captures | 8/8 | 32.03 | 23.44 to 41.41 |
| 40000 | Nightrider: diagonal captures | 8/8 | 6.25 | -5.47 to 17.19 |
| 40000 | Nightrider: orthogonal captures | 8/8 | 25.00 | 13.28 to 35.96 |
| 80000 | Nightrider: diagonal captures | 8/8 | 23.44 | 14.84 to 32.03 |
| 80000 | Nightrider: orthogonal captures | 8/8 | 32.03 | 19.53 to 43.77 |

Gains equally weight both colors and all four opponents on cases completed for the control and revision. Ranges resample eight fixed opening blocks and remain conditional. Truncations are unscored. Shared search priors are not fitted material values.

# Nightrider capture-step focus (20000 nodes)

Do capture-only adjacent steps improve Nightrider play against the four frozen references at a fixed search prior?

Finalized games: 192/192; scored complete pairs: 96.

| Row army / column opponent | Vanguard | Unicorn | Crusader | Amazon | Overall score (cases) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Nightrider control | 40.63% | 53.13% | 37.50% | 34.38% | 41.41% (8/8) |
| Nightrider: diagonal captures | 46.88% | 53.13% | 59.38% | 56.25% | 53.91% (8/8) |
| Nightrider: orthogonal captures | 81.25% | 71.88% | 75.00% | 65.63% | 73.44% (8/8) |

Matrix entries are the row army’s score; a blank dash means no scored pair or no scheduled matchup.

Overall score gives each fixed reference equal weight; reference 2v2 teams instead weight all other scheduled teams equally. Direct pawn/grant bundle matches are excluded from reference averages. Draws count half a point. Only opening cases with every scheduled repetition and both colors completed against every included opponent contribute. Other completed games remain in individual matchup cells; overall stays pending until at least one case is shared.

| Overall row | Included games | W / D / L | Overall score | Opponents | Shared cases |
| --- | ---: | :--- | ---: | ---: | ---: |
| Nightrider control | 64 | 21 / 11 / 32 | 41.41% | 4 | 8/8 |
| Nightrider: diagonal captures | 64 | 28 / 13 / 23 | 53.91% | 4 | 8/8 |
| Nightrider: orthogonal captures | 64 | 45 / 4 / 15 | 73.44% | 4 | 8/8 |

| A versus B | Paired games | A W / D / L | A score | Complete pairs | Openings | Truncated attempts | Errors |
| --- | ---: | :--- | ---: | ---: | ---: | ---: | ---: |
| Nightrider control / Vanguard | 16 | 6 / 1 / 9 | 40.63% | 8/8 | 8 | 0 | 0 |
| Nightrider control / Unicorn | 16 | 7 / 3 / 6 | 53.13% | 8/8 | 8 | 0 | 0 |
| Nightrider control / Crusader | 16 | 4 / 4 / 8 | 37.50% | 8/8 | 8 | 0 | 0 |
| Nightrider control / Amazon | 16 | 4 / 3 / 9 | 34.38% | 8/8 | 8 | 0 | 0 |
| Nightrider: diagonal captures / Vanguard | 16 | 7 / 1 / 8 | 46.88% | 8/8 | 8 | 0 | 0 |
| Nightrider: diagonal captures / Unicorn | 16 | 7 / 3 / 6 | 53.13% | 8/8 | 8 | 0 | 0 |
| Nightrider: diagonal captures / Crusader | 16 | 6 / 7 / 3 | 59.38% | 8/8 | 8 | 0 | 0 |
| Nightrider: diagonal captures / Amazon | 16 | 8 / 2 / 6 | 56.25% | 8/8 | 8 | 0 | 0 |
| Nightrider: orthogonal captures / Vanguard | 16 | 13 / 0 / 3 | 81.25% | 8/8 | 8 | 0 | 0 |
| Nightrider: orthogonal captures / Unicorn | 16 | 11 / 1 / 4 | 71.88% | 8/8 | 8 | 0 | 0 |
| Nightrider: orthogonal captures / Crusader | 16 | 12 / 0 / 4 | 75.00% | 8/8 | 8 | 0 | 0 |
| Nightrider: orthogonal captures / Amazon | 16 | 9 / 3 / 4 | 65.63% | 8/8 | 8 | 0 | 0 |

- Scores use complete color-swapped pairs only, with equal weight for each represented opening prefix. Draws count half a point.
- Unpaired completions, move-limit truncations, errors and cancelled games do not become draws or losses.
- 8 fixed short prefixes are a coarse descriptive screen, not independent samples supporting a precise strength estimate. No material values or individual piece Elo are fitted.
- This report validates journal identities and summarizes recorded outcomes; it does not independently replay every move.

# Nightrider capture-step focus (40000 nodes)

Do capture-only adjacent steps improve Nightrider play against the four frozen references at a fixed search prior?

Finalized games: 192/192; scored complete pairs: 96.

| Row army / column opponent | Vanguard | Unicorn | Crusader | Amazon | Overall score (cases) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Nightrider control | 56.25% | 65.63% | 31.25% | 28.13% | 45.31% (8/8) |
| Nightrider: diagonal captures | 56.25% | 46.88% | 59.38% | 43.75% | 51.56% (8/8) |
| Nightrider: orthogonal captures | 71.88% | 65.63% | 75.00% | 68.75% | 70.31% (8/8) |

Matrix entries are the row army’s score; a blank dash means no scored pair or no scheduled matchup.

Overall score gives each fixed reference equal weight; reference 2v2 teams instead weight all other scheduled teams equally. Direct pawn/grant bundle matches are excluded from reference averages. Draws count half a point. Only opening cases with every scheduled repetition and both colors completed against every included opponent contribute. Other completed games remain in individual matchup cells; overall stays pending until at least one case is shared.

| Overall row | Included games | W / D / L | Overall score | Opponents | Shared cases |
| --- | ---: | :--- | ---: | ---: | ---: |
| Nightrider control | 64 | 27 / 4 / 33 | 45.31% | 4 | 8/8 |
| Nightrider: diagonal captures | 64 | 27 / 12 / 25 | 51.56% | 4 | 8/8 |
| Nightrider: orthogonal captures | 64 | 38 / 14 / 12 | 70.31% | 4 | 8/8 |

| A versus B | Paired games | A W / D / L | A score | Complete pairs | Openings | Truncated attempts | Errors |
| --- | ---: | :--- | ---: | ---: | ---: | ---: | ---: |
| Nightrider control / Vanguard | 16 | 8 / 2 / 6 | 56.25% | 8/8 | 8 | 0 | 0 |
| Nightrider control / Unicorn | 16 | 10 / 1 / 5 | 65.63% | 8/8 | 8 | 0 | 0 |
| Nightrider control / Crusader | 16 | 5 / 0 / 11 | 31.25% | 8/8 | 8 | 0 | 0 |
| Nightrider control / Amazon | 16 | 4 / 1 / 11 | 28.13% | 8/8 | 8 | 0 | 0 |
| Nightrider: diagonal captures / Vanguard | 16 | 7 / 4 / 5 | 56.25% | 8/8 | 8 | 0 | 0 |
| Nightrider: diagonal captures / Unicorn | 16 | 7 / 1 / 8 | 46.88% | 8/8 | 8 | 0 | 0 |
| Nightrider: diagonal captures / Crusader | 16 | 7 / 5 / 4 | 59.38% | 8/8 | 8 | 0 | 0 |
| Nightrider: diagonal captures / Amazon | 16 | 6 / 2 / 8 | 43.75% | 8/8 | 8 | 0 | 0 |
| Nightrider: orthogonal captures / Vanguard | 16 | 11 / 1 / 4 | 71.88% | 8/8 | 8 | 0 | 0 |
| Nightrider: orthogonal captures / Unicorn | 16 | 8 / 5 / 3 | 65.63% | 8/8 | 8 | 0 | 0 |
| Nightrider: orthogonal captures / Crusader | 16 | 10 / 4 / 2 | 75.00% | 8/8 | 8 | 0 | 0 |
| Nightrider: orthogonal captures / Amazon | 16 | 9 / 4 / 3 | 68.75% | 8/8 | 8 | 0 | 0 |

- Scores use complete color-swapped pairs only, with equal weight for each represented opening prefix. Draws count half a point.
- Unpaired completions, move-limit truncations, errors and cancelled games do not become draws or losses.
- 8 fixed short prefixes are a coarse descriptive screen, not independent samples supporting a precise strength estimate. No material values or individual piece Elo are fitted.
- This report validates journal identities and summarizes recorded outcomes; it does not independently replay every move.

# Nightrider capture-step focus (80000 nodes)

Do capture-only adjacent steps improve Nightrider play against the four frozen references at a fixed search prior?

Finalized games: 192/192; scored complete pairs: 96.

| Row army / column opponent | Vanguard | Unicorn | Crusader | Amazon | Overall score (cases) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Nightrider control | 62.50% | 34.38% | 62.50% | 18.75% | 44.53% (8/8) |
| Nightrider: diagonal captures | 78.13% | 50.00% | 75.00% | 68.75% | 67.97% (8/8) |
| Nightrider: orthogonal captures | 84.38% | 65.63% | 81.25% | 75.00% | 76.56% (8/8) |

Matrix entries are the row army’s score; a blank dash means no scored pair or no scheduled matchup.

Overall score gives each fixed reference equal weight; reference 2v2 teams instead weight all other scheduled teams equally. Direct pawn/grant bundle matches are excluded from reference averages. Draws count half a point. Only opening cases with every scheduled repetition and both colors completed against every included opponent contribute. Other completed games remain in individual matchup cells; overall stays pending until at least one case is shared.

| Overall row | Included games | W / D / L | Overall score | Opponents | Shared cases |
| --- | ---: | :--- | ---: | ---: | ---: |
| Nightrider control | 64 | 22 / 13 / 29 | 44.53% | 4 | 8/8 |
| Nightrider: diagonal captures | 64 | 38 / 11 / 15 | 67.97% | 4 | 8/8 |
| Nightrider: orthogonal captures | 64 | 44 / 10 / 10 | 76.56% | 4 | 8/8 |

| A versus B | Paired games | A W / D / L | A score | Complete pairs | Openings | Truncated attempts | Errors |
| --- | ---: | :--- | ---: | ---: | ---: | ---: | ---: |
| Nightrider control / Vanguard | 16 | 10 / 0 / 6 | 62.50% | 8/8 | 8 | 0 | 0 |
| Nightrider control / Unicorn | 16 | 4 / 3 / 9 | 34.38% | 8/8 | 8 | 0 | 0 |
| Nightrider control / Crusader | 16 | 7 / 6 / 3 | 62.50% | 8/8 | 8 | 0 | 0 |
| Nightrider control / Amazon | 16 | 1 / 4 / 11 | 18.75% | 8/8 | 8 | 0 | 0 |
| Nightrider: diagonal captures / Vanguard | 16 | 11 / 3 / 2 | 78.13% | 8/8 | 8 | 0 | 0 |
| Nightrider: diagonal captures / Unicorn | 16 | 6 / 4 / 6 | 50.00% | 8/8 | 8 | 0 | 0 |
| Nightrider: diagonal captures / Crusader | 16 | 12 / 0 / 4 | 75.00% | 8/8 | 8 | 0 | 0 |
| Nightrider: diagonal captures / Amazon | 16 | 9 / 4 / 3 | 68.75% | 8/8 | 8 | 0 | 0 |
| Nightrider: orthogonal captures / Vanguard | 16 | 12 / 3 / 1 | 84.38% | 8/8 | 8 | 0 | 0 |
| Nightrider: orthogonal captures / Unicorn | 16 | 9 / 3 / 4 | 65.63% | 8/8 | 8 | 0 | 0 |
| Nightrider: orthogonal captures / Crusader | 16 | 12 / 2 / 2 | 81.25% | 8/8 | 8 | 0 | 0 |
| Nightrider: orthogonal captures / Amazon | 16 | 11 / 2 / 3 | 75.00% | 8/8 | 8 | 0 | 0 |

- Scores use complete color-swapped pairs only, with equal weight for each represented opening prefix. Draws count half a point.
- Unpaired completions, move-limit truncations, errors and cancelled games do not become draws or losses.
- 8 fixed short prefixes are a coarse descriptive screen, not independent samples supporting a precise strength estimate. No material values or individual piece Elo are fitted.
- This report validates journal identities and summarizes recorded outcomes; it does not independently replay every move.

