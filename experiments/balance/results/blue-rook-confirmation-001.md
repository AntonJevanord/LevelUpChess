# Blue-rook confirmation 001

Recorded 2026-10-20 from the owner's uploaded [summary](blue-rook-confirmation-001.summary.json). Run ID: `6ed904aa-93f8-41ea-b5c2-40a03c31052f`. Original upload SHA-256: `f587adf62a10a115d58bdf929929810bf42045e34ca32130662f26ba007eb677`.

All **80 scheduled games completed**, with 40 games and 20 complete color-swapped opening pairs per comparison. There are no errors, truncations, aborts, invalid records, duplicate completions, or partial/invalid pairs. Reported totals, scores, opening means, and termination counts are internally consistent.

The intended [confirmation configuration](../blue-rook-confirmation.json) increases both engines from 10,000 to **100,000 nodes per move**, retaining the same 20 opening prefixes, Skill 20, one thread, 32 MB hash, and ordinary kings. Army A upgrades its a-rook to blue; Army B remains ordinary. This upload contains aggregate results only: the new run's executable/rules fingerprints and actual settings have not been verified from a manifest, and its moves have not been replayed. The earlier run's settings and games were [verified separately](outlier-effects-001.games-audit.md).

## Comparison with the initial run

Scores are from Army A's perspective, with draws worth half. Every row contains 40 games. Pair W/D/L counts opening pairs scoring above/equal/below 50%.

| Comparison | Initial score | Confirmation score | Initial W / D / L | Confirmation W / D / L |
| --- | ---: | ---: | ---: | ---: |
| Blue rook versus ordinary | 28.75% | **52.50%** | 5 / 13 / 22 | 10 / 22 / 8 |
| Ordinary control | 50.00% | **50.00%** | 13 / 14 / 13 | 11 / 18 / 11 |

The blue-rook point score rises **23.75 percentage points**. Its opening-pair W/D/L changes from **1 / 4 / 15** to **4 / 13 / 3**. Compared opening by opening, its score improves in **14**, ties in **four**, and declines in **two**; the full comparison is in this [CSV](blue-rook-confirmation-001.opening-comparison.csv).

The largest gains are Caro and Scandinavian, each rising by 75 percentage points. Reti-Indian falls by 75 points and king-pawn-step by 25. These are two-game opening-pair scores, not evidence for choosing an opening against the upgrade. Although the earlier Caro loss had a concrete tactical sequence, aggregate scores cannot show whether that same mistake disappeared.

Blue-rook draws increase from **13 to 22** and losses fall from **22 to eight**. The ordinary control also draws more often, from 14 to 18 games, while every control opening pair still scores exactly 50%. Its aggregate score is unchanged, but its individual outcomes are not identical to the initial run.

## What this changes

The large negative blue-rook point score does **not** persist in this confirmation. Assuming the intended settings were used, this supports search-sensitive performance rather than an immediate movement nerf or buff. The current result is close to parity with an ordinary army; it does not establish equality, a positive material increment, or that the upgrade earns its fixed one-point price.

The source-level ordinary/custom-rook evaluation differences remain present. This result neither removes them nor establishes whether they explain the earlier losses. Both armies receive more search in the intended protocol, so the change can reflect tactical play throughout the board rather than only improved use of the blue rook's jumps.

There are still only **20 short, related opening prefixes**. The summary's conditional 95% Hoeffding interval for the new blue-rook score is approximately **22.1%–82.9%**, and the independence assumption is not established for this fixed suite. The matched gains are descriptive, not a formal significance claim. Do not pool the two search budgets into one estimate or interpret the summary's score-equivalent Elo as piece Elo or a calibrated difficulty handicap.

## Next experiments

Keep the current blue-rook movement. The subsequent [200-game budget-3 confirmation](budget-3-confirmation-001.md) is complete: the selected purple rook/pawn/knight advantages persist under the intended larger search budget. The [first balance revision plan](../revision-plan.md) starts with purple-pawn and purple-rook changes under a capped test budget; it does not change this blue-rook design.

An ordinary-movement rook under a custom piece identity remains a separate planned control for evaluation representation effects; it is not implemented yet. Broader opening families, material handicaps, and targeted positions are still needed before assigning material ranges. The 40 blue-rook confirmation game histories would allow a later comparison of actual jumps, trades, and tactical mistakes; no such behavior change is claimed from this summary.
