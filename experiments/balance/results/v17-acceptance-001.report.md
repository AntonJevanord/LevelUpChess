# Level-one acceptance evidence

All 2,016 uploaded games completed on attempt 1: 1,152 minor-piece games and 864 rook/queen games, forming 1,008 color-swapped pairs. No truncations, errors or retries were recorded. Both uploaded reports reproduce byte-for-byte.

Each row below includes 96 games: 16 fixed opening cases, both colors, and three equally weighted benchmark armies. Knights, bishops and rooks use two identical candidate upgrades versus two identical reference purchases (budget 2). The single upgraded queen faces one reference purchase (budget 1). These budgets remain separate.

TT = Two-step pawns; KK = King-step pawns; GG = Pawn grants. For the queen rows, T/K/G each means one purchase. Scores count draws as half a point.

| Family | Budget | Reduced | Current | Expanded |
| --- | ---: | ---: | ---: | ---: |
| Positional knight | 2 | 23.96% | 24.48% | 39.06% |
| Climbing knight | 2 | 30.21% | 38.54% | 59.38% |
| Hopping bishop | 2 | 20.31% | 27.08% | 21.35% |
| Wazzap bishop | 2 | 29.69% | 52.60% | 62.50% |
| Ghost rook | 2 | 23.44% | 25.00% | 41.67% |
| Pawn rook | 2 | 45.31% | 48.96% | 72.92% |
| Advancing queen | 1 | 25.00% | 29.69% | 35.94% |

## Fixed-cohort and opponent detail

First and second halves refer to the predeclared opening lists, rather than completion order. Each half has 48 games per row; each all-case opponent cell has 32 games. Opponent scores for both halves and physical-color splits are retained in the audit JSON.

| Family / version | Movement | Budget | First 8 | Second 8 | All 16 | TT / T | KK / K | GG / G | W / D / L |
| --- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- |
| Positional knight: reduced | `NsmR2` | 2 | 19.79% | 28.13% | 23.96% | 31.25% | 23.44% | 17.19% | 14 / 18 / 64 |
| Positional knight: current | `NsmR` | 2 | 25.00% | 23.96% | 24.48% | 39.06% | 17.19% | 17.19% | 14 / 19 / 63 |
| Positional knight: expanded | `NmR` | 2 | 37.50% | 40.63% | 39.06% | 48.44% | 34.38% | 34.38% | 27 / 21 / 48 |
| Climbing knight: reduced | `NfW` | 2 | 26.04% | 34.38% | 30.21% | 26.56% | 34.38% | 29.69% | 21 / 16 / 59 |
| Climbing knight: current | `NvW` | 2 | 38.54% | 38.54% | 38.54% | 50.00% | 26.56% | 39.06% | 26 / 22 / 48 |
| Climbing knight: expanded | `NvWvD` | 2 | 61.46% | 57.29% | 59.38% | 65.63% | 59.38% | 53.13% | 48 / 18 / 30 |
| Hopping bishop: reduced | `BmA` | 2 | 19.79% | 20.83% | 20.31% | 23.44% | 21.88% | 15.63% | 14 / 11 / 71 |
| Hopping bishop: current | `BgmB` | 2 | 35.42% | 18.75% | 27.08% | 26.56% | 23.44% | 31.25% | 19 / 14 / 63 |
| Hopping bishop: expanded | `BgmB0` | 2 | 26.04% | 16.67% | 21.35% | 20.31% | 18.75% | 25.00% | 16 / 9 / 71 |
| Wazzap bishop: reduced | `BsmW` | 2 | 25.00% | 34.38% | 29.69% | 31.25% | 21.88% | 35.94% | 18 / 21 / 57 |
| Wazzap bishop: current | `BsW` | 2 | 55.21% | 50.00% | 52.60% | 48.44% | 54.69% | 54.69% | 42 / 17 / 37 |
| Wazzap bishop: expanded | `BsW2` | 2 | 69.79% | 55.21% | 62.50% | 65.63% | 65.63% | 56.25% | 50 / 20 / 26 |
| Ghost rook: reduced | `RgmR` | 2 | 29.17% | 17.71% | 23.44% | 26.56% | 28.13% | 15.63% | 17 / 11 / 68 |
| Ghost rook: current | `RgmR0` | 2 | 26.04% | 23.96% | 25.00% | 37.50% | 18.75% | 18.75% | 19 / 10 / 67 |
| Ghost rook: expanded | `RgmQ0` | 2 | 47.92% | 35.42% | 41.67% | 51.56% | 42.19% | 31.25% | 31 / 18 / 47 |
| Pawn rook: reduced | `RfceF` | 2 | 43.75% | 46.88% | 45.31% | 46.88% | 28.13% | 60.94% | 34 / 19 / 43 |
| Pawn rook: current | `RceF` | 2 | 42.71% | 55.21% | 48.96% | 62.50% | 26.56% | 57.81% | 42 / 10 / 44 |
| Pawn rook: expanded | `RceF2` | 2 | 78.13% | 67.71% | 72.92% | 73.44% | 60.94% | 84.38% | 62 / 16 / 18 |
| Advancing queen: reduced | `QimfhN` | 1 | 23.96% | 26.04% | 25.00% | 28.13% | 17.19% | 29.69% | 16 / 16 / 64 |
| Advancing queen: current | `QmfhN` | 1 | 29.17% | 30.21% | 29.69% | 34.38% | 15.63% | 39.06% | 13 / 31 / 52 |
| Advancing queen: expanded | `QmN` | 1 | 29.17% | 42.71% | 35.94% | 31.25% | 34.38% | 42.19% | 24 / 21 / 51 |

## Interpretation

- Current Wazzap bishop (`BsW`) is the clearest candidate to retain: 52.60% overall, 55.21%/50.00% across halves, and 48.44%–54.69% across benchmarks.
- Expanded Climbing knight (`NvWvD`) is promising near the upper edge: 59.38% overall, 61.46%/57.29% across halves. It merits playtesting before a reference decision.
- Current Pawn rook (`RceF`) averages 48.96%, but King-step pawns hold it to 26.56%, versus 62.50% against Two-step pawns and 57.81% against grants. Its reduced version has the same weak matchup. Expanded `RceF2` is consistently strong at 72.92% overall (78.13%/67.71% across halves).
- Expanded Positional knight (39.06%) and Ghost rook (41.67%) improve on their siblings, but retain weak matchup/cohort results. All Hopping bishop variants remain at 20.31%–27.08%.
- All Advancing queen variants underperform their one-point comparisons (25.00%–35.94%). The expanded queen rises from 29.17% to 42.71% between fixed halves, so its average should not be treated as a precise universal value.
- Reduced/current/expanded label movement choices. The nonmonotonic Hopping results do not prove that added quiet moves weaken a piece; outcomes also depend on fixed search and valuation.

These are descriptive screening results conditional on 20,000 nodes per move, one thread, 32 MiB hash, fixed starts and the declared common MG/EG values within each bracket. The calibration SHA-256 remains `205709189dcec631970253dbdf826669262e412c325764f47880acbfbd96d2f9`. No outcome-fitted material value, individual-piece Elo, confidence interval or statistical acceptance is implied.

Keep the active level-two run and its frozen declarations unchanged. Review/playtest the promising level-one candidates after that run; any redesign or evaluation-policy change needs its own identity and a targeted follow-up rather than replaying unchanged cells.

## Provenance and reproduction

- Original run.json, archived INI files and native-preflight proof were not supplied. Reconstructed declarations check compatibility, not original run provenance.
- Recorded starts, identities, opening prefixes, search settings and outcomes match the declarations. Engine names and profile hashes do not attest the executable or native material tables.
- Moves and terminal outcomes were not independently replayed. No games, engine searches, material fit, Elo or population confidence interval were produced.

Exact original uploads are preserved as deterministic gzip archives with original-byte and archive hashes in the audit JSON and verifier. Derived declarations are never accepted as original-run/native-preflight evidence.

Verify offline with `node scripts/balance/v17-acceptance-evidence.js`; regenerate only derived artifacts with `--write`. No engine is started. Detailed original-style reports are retained for each stage.
