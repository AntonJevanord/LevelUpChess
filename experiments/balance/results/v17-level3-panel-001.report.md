# Level-three panel: first eight openings

All 2,640 uploaded games completed on attempt 1, forming 1,320 complete color pairs. There are no errors, retries or truncations. Each node budget contains 880 games. This is the first eight-case snapshot of a campaign requesting 32 openings; 7,920 planned games remain outside this upload. The original report reproduces byte-for-byte.

| Design | Betza | 20k overall | 40k overall | 80k overall |
| --- | --- | ---: | ---: | ---: |
| Herald | `mQ2cfQ2` | 57.64% | 53.47% | 50.69% |
| Inquisitor | `BvW2vnN` | 60.76% | 54.17% | 56.25% |
| Unicorn | `NC` | 46.18% | 47.92% | 56.25% |
| Vanguard | `RfB` | 54.86% | 55.21% | 53.13% |
| Amazon | `QN` | 49.31% | 51.74% | 46.53% |
| Ranger | `mRcfB` | 45.83% | 52.43% | 42.36% |
| Crusader | `BsR2nsN` | 55.90% | 50.69% | 51.39% |
| Nightrider | `N0` | 35.42% | 42.71% | 43.40% |
| Cataphract | `RC` | 59.38% | 54.86% | 66.32% |
| Wraith | `QgB0` | 34.72% | 36.81% | 33.68% |

Each overall row contains 144 head-to-head games: nine opponents, eight openings and both colors. Ordinary-army anchors are excluded from those means.

| Design | 20k ordinary W / D / L (score) | 40k | 80k |
| --- | :--- | :--- | :--- |
| Herald | 15 / 0 / 1 (93.75%) | 14 / 2 / 0 (93.75%) | 15 / 1 / 0 (96.88%) |
| Inquisitor | 16 / 0 / 0 (100.00%) | 14 / 2 / 0 (93.75%) | 16 / 0 / 0 (100.00%) |
| Unicorn | 15 / 0 / 1 (93.75%) | 15 / 1 / 0 (96.88%) | 16 / 0 / 0 (100.00%) |
| Vanguard | 14 / 0 / 2 (87.50%) | 16 / 0 / 0 (100.00%) | 14 / 2 / 0 (93.75%) |
| Amazon | 12 / 0 / 4 (75.00%) | 15 / 1 / 0 (96.88%) | 16 / 0 / 0 (100.00%) |
| Ranger | 13 / 1 / 2 (84.38%) | 15 / 1 / 0 (96.88%) | 15 / 1 / 0 (96.88%) |
| Crusader | 15 / 0 / 1 (93.75%) | 16 / 0 / 0 (100.00%) | 14 / 1 / 1 (90.63%) |
| Nightrider | 15 / 0 / 1 (93.75%) | 12 / 3 / 1 (84.38%) | 13 / 1 / 2 (84.38%) |
| Cataphract | 15 / 1 / 0 (96.88%) | 14 / 1 / 1 (90.63%) | 16 / 0 / 0 (100.00%) |
| Wraith | 12 / 3 / 1 (84.38%) | 11 / 2 / 3 (75.00%) | 8 / 4 / 4 (62.50%) |

Nightrider and Wraith are the only designs to lose at least one ordinary-army game at all three budgets. They still beat the ordinary army overall at each budget. Sixteen games per anchor are too few for a precise exchange value or a firm search-strength trend.

| Nodes | Roster mean | Overall min–max | Population SD (pp) | Mean distance from 50% (pp) |
| ---: | ---: | :--- | ---: | ---: |
| 20000 | 50.00% | 34.72%–60.76% | 8.94 | 7.71 |
| 40000 | 50.00% | 36.81%–55.21% | 5.67 | 4.51 |
| 80000 | 50.00% | 33.68%–66.32% | 8.58 | 6.81 |

The mean is exactly 50% by round-robin construction. Scores narrow at 40k, then spread out again at 80k; this is not monotone convergence. Cataphract rises from 59.38% to 54.86% to 66.32%, while Unicorn rises from 46.18% to 47.92% to 56.25%. Pawns, bishops and Amazon are not the only search-sensitive rows. The JSON retains all 45 matched-budget contrasts and their conditional ranges.

The two weakest overall rows remain Nightrider and Wraith. This supports a focused design discussion, while the small opening sample and selection after inspecting the table argue for fresh matched cases before accepting a buff. No scored games or engine searches were started during this audit.

## Provenance and reproduction

- Original run.json, archived INI files and native-preflight proof were not supplied. Reconstructed declarations check compatibility, not original run provenance.
- Recorded starts, identities, opening prefixes, search settings and outcomes match the declarations. Engine names and profile hashes do not attest the executable or native material tables.
- Moves and terminal outcomes were not independently replayed. No games, engine searches, material fit, Elo or population confidence interval were produced.
- This upload is the first complete eight-opening batch of a campaign requesting 32 total openings. It is a checkpoint snapshot, not the final 32-case result.
- A complete symmetric round robin has a roster-average score of 50% by construction. Score spread is descriptive and does not establish calibrated material values or universal balance.
- The observed spread narrows at 40k and widens again at 80k; increased computation does not produce monotone convergence in this sample.
- Each ordinary-army cell contains only sixteen games. Nightrider and Wraith lose some games at every budget but beat the ordinary army overall at every budget.
- Search sensitivity uses the same eight opening cases across budgets. Conditional ranges omit broader opening ancestry, search-prior bias and selection after inspecting forty-five head-to-head matchups.
- Retain these unchanged records and use new matched cases to evaluate a chosen buff. Alternative names are presentation aliases; original report labels and stable design IDs remain exact.

Exact uploads are preserved as deterministic gzip with archive and original-byte SHA-256. Every stage envelope, config hash, recorded run ID, game identity, starting army, opening prefix, search policy, value profile and move-count/result shape is checked against the reconstructed declaration. These checks do not independently replay legal moves or attest original process identity.

Verify with `node scripts/balance/v17-level3-panel-evidence.js`; `--write` regenerates only the derived artifacts. Existing campaign plans, catalogs, bundles and original uploaded bytes stay unchanged.
