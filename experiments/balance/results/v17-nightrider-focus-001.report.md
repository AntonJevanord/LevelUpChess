# Nightrider capture-step evidence

All 576 scheduled games completed on attempt 1: three budgets of 192 games, 288 complete color pairs, no truncations, errors or retries. The uploaded focus report reproduces byte-for-byte. No old panel games are included.

| Nodes | Original N0 | Diagonal captures N0cF | Orthogonal captures N0cW |
| ---: | ---: | ---: | ---: |
| 20000 | 41.41% | 53.91% | 73.44% |
| 40000 | 45.31% | 51.56% | 70.31% |
| 80000 | 44.53% | 67.97% | 76.56% |

| Nodes | Revision | Matched cases | Gain over N0 (pp) | Conditional 95% range (pp) |
| ---: | --- | ---: | ---: | --- |
| 20000 | Nightrider: diagonal captures | 8/8 | 12.50 | -1.56 to 24.22 |
| 20000 | Nightrider: orthogonal captures | 8/8 | 32.03 | 23.44 to 41.41 |
| 40000 | Nightrider: diagonal captures | 8/8 | 6.25 | -5.47 to 17.19 |
| 40000 | Nightrider: orthogonal captures | 8/8 | 25.00 | 13.28 to 35.96 |
| 80000 | Nightrider: diagonal captures | 8/8 | 23.44 | 14.84 to 32.03 |
| 80000 | Nightrider: orthogonal captures | 8/8 | 32.03 | 19.53 to 43.77 |

Every body retains applied MG/EG 2326/2211 and the four reference priors. Eight held-out prefixes, both colors and all four opponents are shared across 20k/40k/80k conditions. Each body/budget has 64 games; each individual opponent cell has 16. The source report ranges resample whole opening cases.

The diagonal version scores 53.91%, 51.56% and 67.97%; the fresh control scores 41.41%, 45.31% and 44.53%. The orthogonal version scores 73.44%, 70.31% and 76.56%. These recorded differences motivate matched cross-budget analysis and replication; they do not by themselves separate sampling variation from a persistent search-budget interaction.

## Provenance and reproduction

- Original focus.json, stage run.json files, archived INI files, runtime ownership/receipt and native-preflight proofs were not supplied. Reconstructed descriptors check declaration compatibility, not original execution provenance.
- The current verified research overlay resolves the declared IDs solely for compatibility analysis. It is not asserted to be the original runtime snapshot.
- Recorded starting armies, profiles, search/evaluation policies, opening prefixes, move counts and outcome shapes match the declarations. Engine names and profile hashes do not attest the executable or native value tables.
- Moves and terminal outcomes were not independently replayed. No searches, new games, material fit, piece Elo or population confidence interval were produced.
- Each row has 64 physical games from eight opening cases, four fixed opponents and both colors. Games sharing prefixes and color swaps are dependent; a physical game count is not an independent-opening count.
- Matched control gains and percentile ranges condition on eight fixed holdout cases and the shared search prior. They do not establish universal material balance or optimal engine valuation.
- The four-reference focused basket differs from the nine-opponent full roster panel. Its fresh control is the relevant within-study baseline.

Exact journals and the report are retained as deterministic gzip with archive and original-byte SHA-256 pins. The compact audit keeps the declarations, profile/registry hashes, search/value policies, definitions, complete outcome tables and original conditional ranges.

Run `node scripts/balance/v17-nightrider-focus-evidence.js` to verify; `--write` regenerates only the derived artifacts. No engine, game or original catalog change is involved.
