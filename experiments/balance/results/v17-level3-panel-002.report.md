# Level-three panel: sixteen complete openings

The cumulative upload contains **5,288 completed games**, all on attempt 1: six full 880-game stages (5,280 games), plus eight completed 20k games in the third batch. These form 2,644 scored color pairs, with no errors, retries or truncations. The original report reproduces byte-for-byte.

**2,640 games are retained exactly from snapshot001, and 2,648 are new. Do not add the cumulative snapshots together.** The first 10,615,304 original bytes have the same pinned SHA-256 as the first upload; every earlier stage-scoped envelope is also compared without changing any field.

## Shared sixteen-case overall scores

| Design | Betza | 20k | 40k | 80k |
| --- | --- | ---: | ---: | ---: |
| Herald | `mQ2cfQ2` | 50.17% | 49.65% | 50.35% |
| Inquisitor | `BvW2vnN` | 61.28% | 55.38% | 53.47% |
| Unicorn | `NC` | 50.87% | 54.86% | 54.86% |
| Vanguard | `RfB` | 52.95% | 53.47% | 51.91% |
| Amazon | `QN` | 50.17% | 48.61% | 53.13% |
| Ranger | `mRcfB` | 50.00% | 50.17% | 42.53% |
| Crusader | `BsR2nsN` | 54.17% | 52.08% | 55.03% |
| Nightrider | `N0` | 36.11% | 42.53% | 42.53% |
| Cataphract | `RC` | 61.11% | 55.56% | 66.32% |
| Wraith | `QgB0` | 33.16% | 37.67% | 29.86% |

Every overall row uses the same sixteen fully scored opening cases, both colors and nine equally weighted opponents: 288 head-to-head games per piece and budget. Ordinary-army anchors are separate. The eight extra games from the next batch do not affect these overall rows.

| Nodes | Completed games | Shared overall cases | Declared cases | Roster min–max | Population SD (pp) |
| ---: | ---: | ---: | ---: | :--- | ---: |
| 20000 | 1768 | 16 | 24 | 33.16%–61.28% | 8.68 |
| 40000 | 1760 | 16 | 16 | 37.67%–55.56% | 5.56 |
| 80000 | 1760 | 16 | 16 | 29.86%–66.32% | 9.26 |

The 20k report declares 24 cases because the third stage has begun. Its four updated head-to-head cells contain seventeen cases; the remaining cells generally contain sixteen. The root overall rows require all opponents to finish a case and therefore remain at sixteen. The JSON retains the exact eight extra envelopes and their affected cells.

| Design | 20k ordinary W / D / L (score) | 40k | 80k |
| --- | :--- | :--- | :--- |
| Herald | 30 / 0 / 2 (93.75%) | 27 / 4 / 1 (90.63%) | 30 / 1 / 1 (95.31%) |
| Inquisitor | 32 / 0 / 0 (100.00%) | 27 / 3 / 2 (89.06%) | 32 / 0 / 0 (100.00%) |
| Unicorn | 28 / 2 / 2 (90.63%) | 30 / 2 / 0 (96.88%) | 32 / 0 / 0 (100.00%) |
| Vanguard | 28 / 2 / 2 (90.63%) | 32 / 0 / 0 (100.00%) | 29 / 3 / 0 (95.31%) |
| Amazon | 27 / 0 / 5 (84.38%) | 29 / 3 / 0 (95.31%) | 32 / 0 / 0 (100.00%) |
| Ranger | 27 / 2 / 3 (87.50%) | 29 / 2 / 1 (93.75%) | 29 / 1 / 2 (92.19%) |
| Crusader | 31 / 0 / 1 (96.88%) | 32 / 0 / 0 (100.00%) | 30 / 1 / 1 (95.31%) |
| Nightrider | 25 / 2 / 5 (81.25%) | 25 / 4 / 3 (84.38%) | 26 / 3 / 3 (85.94%) |
| Cataphract | 31 / 1 / 0 (98.44%) | 29 / 2 / 1 (93.75%) | 32 / 0 / 0 (100.00%) |
| Wraith | 22 / 6 / 4 (78.13%) | 21 / 6 / 5 (75.00%) | 20 / 5 / 7 (70.31%) |

## Provenance and reproduction

- Original run.json, archived INI files and native-preflight proof were not supplied. Reconstructed declarations check compatibility, not original run provenance.
- Recorded starts, identities, opening prefixes, search settings and outcomes match the declarations. Engine names and profile hashes do not attest the executable or native material tables.
- Moves and terminal outcomes were not independently replayed. No games, engine searches, material fit, Elo or population confidence interval were produced.
- This is a cumulative snapshot, not an additional 5288 independent games. It retains the original 2640 games exactly and adds 2648 new records.
- Six stages are complete: sixteen shared openings at every node budget. Eight completed 20k games from the third batch update four individual cells, but do not enter shared-sixteen-case overall rows.
- The campaign still requests 32 openings and 10560 games. No result from this checkpoint is the final 32-case estimate.
- A full symmetric round robin has a roster-average score of 50% by construction; average convergence alone does not demonstrate balance.
- Conditional opening-block ranges omit broader opening ancestry, search-prior bias and post-selection after reviewing many matchups.

Exact uploads are losslessly preserved with compressed and original-byte SHA-256 pins. Envelopes, config hashes, recorded run IDs, scheduled game identities, starts, opening prefixes, search/evaluation policies, SAN/move counts and result shapes match reconstructed declarations. Original manifests and native proofs were not supplied. No legal-move replay, executable attestation, scored games or engine searches were performed.

Verify with `node scripts/balance/v17-level3-panel-second-evidence.js`; `--write` refreshes derived artifacts only. The first snapshot, existing campaign plans, catalog and rule bundles remain unchanged.
