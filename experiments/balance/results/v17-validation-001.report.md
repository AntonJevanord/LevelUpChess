# Level-three trials and level-two validation evidence

All 1,152 uploaded games completed on attempt 1: 768 level-three trial games and 384 level-two validation games. There were no errors, retries, truncations or excluded partners. All 576 color-swapped pairs are scored, and both original reports reproduce byte-for-byte.

These are three separate purchase contexts: one three-point trial versus one frozen three-point reference; one two-point purchase versus another two-point purchase; and three identical two-point purchases versus two identical non-Amazon three-point references (six points per side). No overall percentage is pooled across these contexts.

## Three-point trials

Each trial has 128 games: sixteen fixed cases, both colors and four equally weighted frozen references. Both eight-case halves are predeclared opening lists, not completion order. Draws count half a point.

| Trial | First 8 | Second 8 | All 16 | W / D / L | White | Black |
| --- | ---: | ---: | ---: | :--- | ---: | ---: |
| Blocked Vertical bishop | 50.00% | 50.00% | 50.00% | 48 / 32 / 48 | 51.56% | 48.44% |
| Sideways Queen pawn | 53.13% | 53.91% | 53.52% | 59 / 19 / 50 | 54.69% | 52.34% |
| Rook-ray queen | 63.28% | 67.97% | 65.63% | 72 / 24 / 32 | 70.31% | 60.94% |
| King grant (three points) | 69.53% | 68.75% | 69.14% | 83 / 11 / 34 | 76.56% | 61.72% |
| Three-step Orthogonal grant (three points) | 60.16% | 62.50% | 61.33% | 72 / 13 / 43 | 59.38% | 63.28% |
| Knight grant (three points) | 62.50% | 61.72% | 62.11% | 73 / 13 / 42 | 61.72% | 62.50% |

The selected Blocked Vertical bishop scores 50.00% in each fixed half and overall; its opponent scores range from 45.31% to 57.81%. The selected Sideways Queen pawn scores 53.13%/53.91% across halves and 53.52% overall, with opponent scores from 43.75% to 59.38%. These support retaining them for playtesting, rather than proving exact universal balance.

Rook-ray queen scores 65.63% (63.28%/67.97% across halves) and is parked. Three-point King grant scores 69.14% (White 76.56%, Black 61.72%); this does not establish its strength at a future four-point price. Three-step Orthogonal grant scores 61.33% and Knight grant 62.11%. No new price is inferred from those percentages.

## Two-point singles and six-point bridge

### Two-point singles

96 games; 2 upgrade points per side. The following means include only this panel’s scheduled opponents.

| Purchase | First 8 | Second 8 | All 16 | W / D / L | White | Black |
| --- | ---: | ---: | ---: | :--- | ---: | ---: |
| Forward Knight pawn (one; 2 points) | 65.63% | 57.81% | 61.72% | 31 / 17 / 16 | 68.75% | 54.69% |
| Rank pawn (one; 2 points) | 43.75% | 43.75% | 43.75% | 20 / 16 / 28 | 50.00% | 37.50% |
| Diagonal grant (one; 2 points) | 40.63% | 48.44% | 44.53% | 21 / 15 / 28 | 46.88% | 42.19% |

### Six-point bridge

288 games; 6 upgrade points per side. The following means include only this panel’s scheduled opponents.

| Purchase | First 8 | Second 8 | All 16 | W / D / L | White | Black |
| --- | ---: | ---: | ---: | :--- | ---: | ---: |
| Forward Knight pawn (three; 6 points) | 65.63% | 68.75% | 67.19% | 61 / 7 / 28 | 68.75% | 65.63% |
| Rank pawn (three; 6 points) | 30.21% | 14.58% | 22.40% | 15 / 13 / 68 | 31.25% | 13.54% |
| Diagonal grant (three; 6 points) | 44.79% | 65.63% | 55.21% | 48 / 10 / 38 | 67.71% | 42.71% |

Forward Knight pawn scores 61.72% in singles and 67.19% as a three-purchase bundle. Rank pawn scores 43.75% in singles and 22.40% in the bridge; the latter’s White/Black scores are 31.25%/13.54%. Diagonal grant scores 44.53% in singles and 55.21% in the bridge, with bridge halves 44.79%/65.63% and White/Black 67.71%/42.71%. These contexts expose stacking, opponent and placement effects; they do not provide an additive material value or piece Elo.

## Provenance and reproduction

Both studies retain the same sixteen frozen two-ply prefixes, 20,000 nodes per move, Skill 20, one thread, 32 MiB hash and a 400-total-ply cap. The level-two study retains bracket calibration `205709189dcec631970253dbdf826669262e412c325764f47880acbfbd96d2f9`; the new level-three trials retain revision receipt `9507dbc13aec08c22562433852ffdb3bc5dea572835dab2ee342cf5729f0358f`, whose baseline is the same bracket calibration. These are declared engine priors, not outcome-fitted material estimates.

- Original run.json, archived INI files and native-preflight proof were not supplied. Reconstructed declarations check compatibility, not original run provenance.
- Recorded starts, identities, opening prefixes, search settings and outcomes match the declarations. Engine names and profile hashes do not attest the executable or native material tables.
- Moves and terminal outcomes were not independently replayed. No games, engine searches, material fit, Elo or population confidence interval were produced.

Exact original uploads are preserved as deterministic gzip with original-byte and archive SHA-256 pins. The audit JSON retains configuration, metadata, registry, profile and schedule receipts, both applied-value audits, all per-opponent results and the separate cohort/color summaries. Original-run/native-preflight validation remains separate.

Selection or retention of a playable design is a project decision; this archive changes no movement, immutable identity, price, reference, catalog, runtime or engine setting. Sixteen fixed cases support descriptive review without population confidence intervals or automatic final acceptance.

Verify offline with `node scripts/balance/v17-validation-evidence.js`; use `--write` to regenerate derived artifacts only. No engine or game is started.
