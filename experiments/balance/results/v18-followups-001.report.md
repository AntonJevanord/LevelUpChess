# Version 18 targeted follow-up evidence

1632 games completed on their first attempt, with 816 complete color pairs. There are no errors, aborted attempts, retries or move-limit truncations. Every uploaded numeric table, headline count, physical-color score, fixed-cohort score, conditional range, control gain and search prior reproduces from the journals.

Both studies use 40,000 nodes per move on the same sixteen held-out case IDs, `l3-panel-17` through `l3-panel-32`. These are sixteen related opening blocks, not 1,632 independent starting positions. Draws count half a point.

## Level one

| Body | Score | Fixed halves | White / Black |
| --- | ---: | ---: | ---: |
| 2 × Positional knight control | 31.77% | 37.50% / 26.04% | 30.21% / 33.33% |
| 2 × Hopping bishop control | 30.21% | 30.21% / 30.21% | 38.54% / 21.88% |
| Baby Amazon control | 31.25% | 28.13% / 34.38% | 32.29% / 30.21% |
| 2 × Positional knight: quiet queen paths | 46.35% | 50.00% / 42.71% | 51.04% / 41.67% |
| 2 × Positional knight: quiet king steps | 18.75% | 17.71% / 19.79% | 23.96% / 13.54% |
| 2 × Hopping bishop: long quiet hops | 34.38% | 31.25% / 37.50% | 42.71% / 26.04% |
| 2 × Hopping bishop: long capture hops | 48.44% | 46.88% / 50.00% | 55.21% / 41.67% |
| Blink queen | 39.06% | 38.54% / 39.58% | 44.79% / 33.33% |

`NmQ` (46.35%) and `BgB0` (48.44%) are the strongest candidates to keep for human playtesting. Their gains over fresh matched controls are 14.58 and 18.23 percentage points, with conditional ranges of 4.69–24.48 and 6.25–30.22. NmQ retains a 32.81% King-step-pawn matchup; BgB0 scores 39.06% there. Their averages do not remove those interactions.

Park `NmK` (18.75%) and `BgBgmB0` (34.38%). Blink queen reaches 39.06%, but its 7.81-point gain has a −2.60 to +18.75 conditional range and it scores only 23.44% against King-step pawns. It remains a lower-edge or exploration design rather than an automatic promotion or another immediate buff.

## Level two

| Body | Score | Fixed halves | White / Black |
| --- | ---: | ---: | ---: |
| Dabada knight control | 34.38% | 35.42% / 33.33% | 39.58% / 29.17% |
| Long-range knight control | 38.02% | 33.33% / 42.71% | 45.83% / 30.21% |
| Bishop pawn: new-prior control | 20.83% | 16.67% / 25.00% | 19.79% / 21.88% |
| Knight: wazir and dabbaba | 66.15% | 68.75% / 63.54% | 69.79% / 62.50% |
| Knight: wazir and three-step jump | 77.08% | 79.17% / 75.00% | 76.04% / 78.13% |
| Knight: diagonal steps and jumps | 61.46% | 64.58% / 58.33% | 63.54% / 59.38% |
| Knight: diagonal and orthogonal two-jumps | 64.06% | 68.75% / 59.38% | 69.79% / 58.33% |
| Bishop pawn: clear diagonal range | 45.31% | 47.92% / 42.71% | 50.00% / 40.63% |
| Bishop pawn: diagonal jumps | 42.71% | 45.83% / 39.58% | 47.92% / 37.50% |

All four knight compounds are stronger than their fresh control. `NWH` is the clearest high outlier at 77.08%, with 75.00%–81.25% against every reference and 79.17%/75.00% across the fixed halves. `NWD` reaches 66.15%, driven partly by 81.25% against the Bishop grant; `NAD` reaches 64.06%, including 73.44% against Rank pawn.

`NFA` is closest to the screening target at 61.46%; its conditional 54.67–68.75 range overlaps the 60% boundary. It is the most reasonable knight to retain for playtesting or a later decision-relevant confirmation, not a proven exact two-point match. Do not promote or reprice a body from this screen alone.

The clear-range Bishop pawn (45.31%) is the simpler provisional playtest choice with more even observed opponent scores: 48.44%, 46.88% and 40.63%, compared with 39.06%, 53.13% and 35.94% for the jumping pawn (42.71%). Both improve over the fresh 20.83% control under the same 536/592 prior; matched gains are 24.48 and 21.87 points. The jumping pattern permits every clear-range move plus blocked-path jumps, so its lower observed score can reflect finite search and sampling. This screen does not establish intrinsic superiority for either pawn.

The old Bishop-pawn screen used 214/245 on different cases. Do not pool its 22.92% score with this fresh 536/592 control or interpret their difference as a clean valuation experiment. The old body remains weak under the new policy, while both movement revisions improve within this matched study.

## Keep the study bounded

Keep the fixed references and previously promising unchanged bodies intact. Review NmQ, BgB0 and the clear-range Bishop pawn in human games; park the clearly weak or strong alternatives. No new experiments, movement changes, purchase-price changes, material fits or playable promotions are scheduled by this audit.

## Evidence limits

- Original screen.json, stage run.json, archived INI files, runtime receipts and native-preflight proofs were not supplied. Derived descriptors check recorded declaration compatibility; they are not recovered original manifests.
- Recorded profile/registry hashes, starting armies, openings, strengths, search settings and applied value policies match the reconstructed declarations. Engine names and profile hashes do not attest the executable or its native tables.
- Moves and terminal outcomes were not independently replayed. No new matches, engine searches, outcome-fitted material values or individual-piece Elo were produced.
- All studies use sixteen related fixed opening cases. Opening-block ranges are conditional; raw game counts do not imply that many independent starting positions.

Exact uploaded bytes are retained in deterministic gzip archives with original and archive SHA-256 pins. The archived compatibility descriptors and control mappings were reconstructed from v0.18.4 declarations. They are not recovered original run manifests or native proof.

Run `node scripts/balance/v18-followup-evidence.js` to verify offline; `--write` regenerates only the derived audit and review. The earlier `v18-screen-evidence.js` audit remains unchanged.
