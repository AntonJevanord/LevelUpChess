# Version 18 roster-completion evidence

1056 games finalized on their first attempt: 1054 completed results and 2 unscored move-limit truncations. There are 526 complete color pairs (1052 scored games), with 2 otherwise completed partners excluded from paired scores. No errors, aborted attempts or retries occurred.

Every uploaded numeric table, headline count, physical-color score, fixed-cohort score, conditional range, matched-control gain and search prior reproduces from the journals. Both studies use 40,000 nodes per move on fixed opening IDs `l3-panel-49` through `l3-panel-64`. Draws count half a point.

Overall scores and fixed halves use only opening cases complete against every reference. Per-reference cells retain every complete color pair for that individual matchup, matching the uploaded matrix; their denominators can therefore differ from the overall row.

## Level-one queens

| Body | Overall | Two-step pawn | King-step pawn | Pawn grant | First / second eight cases | Shared cases |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Baby Amazon control | 27.60% | 39.06% | 21.88% | 21.88% | 31.25% / 23.96% | 16/16 |
| Queen: camel captures | 64.58% | 70.31% | 56.25% | 67.19% | 63.54% / 65.63% | 16/16 |
| Queen: forward-tall knight jumps | 44.79% | 48.44% | 42.19% | 43.75% | 48.96% / 40.63% | 16/16 |
| Queen: forward-half knight jumps (sanity check) | 59.38% | 54.69% | 62.50% | 60.94% | 57.29% / 61.46% | 16/16 |

`QfN` is the closest, more conservative L1 queen candidate at 44.79%, with 42.19%–48.44% across references. `QfhN` remains a stronger alternative at 59.38%, near the top of the descriptive band, including 62.50% against King-step pawns. Both improve over the fresh QmN control with matched gain ranges above zero. The 14.58-point difference between QfhN and QfN is observed within this study; it is not a material-value estimate.

`QcC` reaches 64.58% and both fixed halves exceed 63%. It is a high L1 candidate rather than an automatic selection or a proven L2 piece. Its conditional 56.77%–71.35% range still overlaps the screening ceiling.

## Level-two completion

| Body | Overall | Knight pawn | Rank pawn | Bishop grant | First / second eight cases | Shared cases |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Box queen control | 34.38% | 34.38% | 39.06% | 29.69% | 32.29% / 36.46% | 16/16 |
| Queen: wide knight jumps | 47.40% | 56.25% | 45.31% | 40.63% | 52.08% / 42.71% | 16/16 |
| Queen: tall knight jumps | 38.54% | 50.00% | 35.94% | 29.69% | 36.46% / 40.63% | 16/16 |
| Level-two Nightrider control | 51.11% | 57.81% | 45.31% | 56.67% | 54.17% / 47.62% | 15/16 |
| Knight: two-square orthogonal jumps | 38.54% | 40.63% | 39.06% | 35.94% | 36.46% / 40.63% | 16/16 |
| Knight: two-square jumps and quiet king steps | 56.77% | 50.00% | 56.25% | 64.06% | 57.29% / 56.25% | 16/16 |
| Free Boar bishop | 65.56% | 64.06% | 71.88% | 61.67% | 69.79% / 60.71% | 15/16 |

`QsN` is the stronger queen choice at 47.40%, with every reference between 40.63% and 56.25%. Its 13.02-point matched gain over the Box queen has a conditional 0.52–23.96-point range. `QvN` remains weak at 38.54%, with only 29.69% against the Bishop grant; its gain range includes zero.

`NDmK` reaches 56.77%, with stable fixed halves at 57.29% and 56.25%, while ND reaches 38.54%. This supports retaining NDmK as the practical second-knight candidate alongside N0, while noting its 64.06% Bishop-grant matchup. It does not force an immediate NDmW/NDmF refinement. Fresh N0 remains near balance at 51.11% on fifteen shared cases; the old L3 results are not pooled.

Free Boar scores 65.56% on fifteen shared cases. Its individual matchups are now 64.06%, 71.88% and 61.67%, so the concern is broader than only Rank pawn in this screen. Keep the requested candidate available for human and mixed-army checks; this audit does not nerf it or rewrite its earlier 59.38% result.

## Partial outcomes and next decisions

The N0/grant game on l3-panel-59 as White and the Free-Boar/grant game on l3-panel-62 as Black reached 400 plies. Neither is counted as a draw or loss. Their two valid completed partners remain archived but cannot form scored pairs. Each affected overall row omits the entire affected opening across all three opponents, retaining ninety games and fifteen shared cases; individual matchup cells keep their other completed pairs. Matched knight gains use the same fifteen complete cases as the N0 control.

The review shortlists QfN, QfhN, QsN and NDmK for practical playtesting, with the stated strength and matchup concerns. It schedules no additional games, movement changes, playable promotions or frozen-reference changes. All search priors and purchase budgets remain separate; no material value or individual-piece Elo is fitted.

## Evidence limits

- Original screen.json, stage run.json, archived INI files, runtime receipts and native-preflight proofs were not supplied. Derived descriptors check recorded declaration compatibility; they are not recovered original manifests.
- Recorded profile/registry hashes, starting armies, openings, strengths, search settings and applied value policies match the reconstructed declarations. Engine names and profile hashes do not attest the executable or its native tables.
- Moves and terminal outcomes were not independently replayed. No new matches, engine searches, outcome-fitted material values or individual-piece Elo were produced.
- All studies use sixteen related fixed opening cases. Opening-block ranges are conditional; raw game counts do not imply that many independent starting positions.

Exact uploaded bytes are retained in deterministic gzip archives with original and archive SHA-256 pins. Compatibility descriptors and fresh-control mappings were reconstructed from v0.18.8 declarations, not recovered original execution manifests.

Run `node scripts/balance/v18-completion-evidence.js` to verify offline; `--write` regenerates only the derived audit and this review. Older evidence remains unchanged.
