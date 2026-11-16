# Version 18 level-two knight evidence

480 games completed on their first attempt, with 240 complete color pairs. There are no errors, aborted attempts, retries or move-limit truncations. Every uploaded numeric table, headline count, physical-color score, fixed-cohort score, conditional range, control gain and search prior reproduces from the journals.

The study uses 40,000 nodes per move on sixteen fixed opening IDs, `l3-panel-33` through `l3-panel-48`, with both colors. Every body has 96 games against the three unchanged L2 references. Draws count half a point.

| Body | Overall | Knight pawn | Rank pawn | Bishop grant | First / second eight cases | White / Black |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Long-range knight control | 28.65% | 32.81% | 34.38% | 18.75% | 33.33% / 23.96% | 33.33% / 23.96% |
| NFA knight control | 69.79% | 65.63% | 68.75% | 75.00% | 73.96% / 65.63% | 71.88% / 67.71% |
| Knight: three-square orthogonal jumps | 31.77% | 26.56% | 35.94% | 32.81% | 30.21% / 33.33% | 39.58% / 23.96% |
| Knight: two- and three-square orthogonal jumps | 75.00% | 78.13% | 73.44% | 73.44% | 76.04% / 73.96% | 82.29% / 67.71% |
| Nightrider: two-point trial | 54.69% | 54.69% | 57.81% | 51.56% | 53.13% / 56.25% | 62.50% / 46.88% |

`N0` is the clear level-two candidate in this screen: 42 wins, 21 draws and 33 losses give 54.69%, with opponent scores spanning 51.56%–57.81%. Its two fixed halves score 53.13% and 56.25%. The conditional opening-block 95% range is 47.92%–61.98%; this supports a practical L2 fit rather than proof of exact balance.

`NH` is weak at 31.77%; `NDH` is high at 75.00%, exceeding 73% against every reference. Fresh NA and NFA controls bracket the trials at 28.65% and 69.79%. Keep those comparisons within this protocol rather than pooling their earlier screens into a single score.

All five bodies share the 1203/1352 MG/EG search prior; references retain their frozen priors. The historical L3 Nightrider used 2326/2211 and different opponents and purchase context. This screen cannot isolate the effect of its price change, and its old results are not pooled here. No material value or individual-piece Elo is fitted.

Human counterplay and later mixed-army results can confirm the practical choice; this audit schedules no automatic refinement, additional matches, playable promotion or reference change.

## Evidence limits

- Original screen.json, stage run.json, archived INI files, runtime receipts and native-preflight proofs were not supplied. Derived descriptors check recorded declaration compatibility; they are not recovered original manifests.
- Recorded profile/registry hashes, starting armies, openings, strengths, search settings and applied value policies match the reconstructed declarations. Engine names and profile hashes do not attest the executable or its native tables.
- Moves and terminal outcomes were not independently replayed. No new matches, engine searches, outcome-fitted material values or individual-piece Elo were produced.
- All studies use sixteen related fixed opening cases. Opening-block ranges are conditional; raw game counts do not imply that many independent starting positions.

Exact uploaded bytes are retained in deterministic gzip archives with original and archive SHA-256 pins. Compatibility descriptors and fresh-control mappings were reconstructed from v0.18.6 declarations, not recovered from original execution manifests.

Run `node scripts/balance/v18-knight-evidence.js` to verify offline; `--write` regenerates only the derived audit and this review. Older evidence remains unchanged.
