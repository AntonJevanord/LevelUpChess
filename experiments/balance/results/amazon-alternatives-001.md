# Amazon alternatives: completed batch and shortlist

Recorded 2026-10-23 from the user's [uploaded summary](amazon-alternatives-001.summary.json). Run ID: `dfc6a3dd-4c1d-486f-8042-9c3124234a61`. The summary reports **1,120/1,120 finalized scheduled games: 1,119 completed, one move-limit truncation, and no errors or aborted attempts**. There are **559 complete color pairs / 1,118 paired scored games**; one completed game has an unscored partner. No invalid records, invalid pairs, duplicate completions, or invalid completed results are reported.

Close this batch at its declared 1,120 games. The unused 80-game budget does not start another stage. Do not rerun unchanged subjects or replay the single truncation solely to make the table complete.

## Scores and proposed choices

Scores are whole-army points against the fixed Amazon purchase: a win counts one, a draw half. Each subject has 40 complete color pairs except the quiet-jump Vertical bishop, which has 39. The practical target is 40%–60%, including both endpoints.

| Group | First option | Alternative | Recommendation for human review |
| --- | ---: | ---: | --- |
| Ranging / Courier pawn | Ranging `pawn.purple@7`: **48.75%** | Courier `pawn.purple@8`: **40.00%** | Prefer Ranging numerically; Courier also reaches the target band and can remain a forward-only alternative if playtesting favors it. |
| Rank pawn | Wide knight `pawn.purple@9`: **54.375%** | Knight + camel `pawn.purple@10`: **73.75%** | Keep the wide-knight version; park the camel addition at level 3. |
| Vertical bishop | Quiet knight `bishop.purple@3`: **53.85%** | Full tall knight `bishop.purple@5`: **80.63%** | Keep quiet jumps; park full tall jumps at this price. |
| Sideways bishop | Two-square rank range `bishop.purple@4`: **61.25%** | Unlimited rank range `bishop.purple@6`: **77.50%** | Prefer the shorter version; retain for playtesting without an automatic nerf. Park unlimited rank range at this price. |
| Blink rook | Adjacent diagonal capture `rook.purple@4`: **81.875%** | Two-square diagonal capture `rook.purple@5`: **89.375%** | Both overshoot. Review existing games and choose one deliberate redesign or park the family; do not add another buff. |
| Queen and companion | Diagonal captures `queen.purple@4`: **38.75%** | Forward/sideways captures `queen.purple@5`: **68.75%** | Prefer the diagonal companion for playtesting; avoid an automatic buff to chase the boundary. Park the forward companion at this price. |

These are proposed selections, not changes to the current picker. Four subjects fall within the target band: Ranging, Courier, Rank without camel jumps, and Vertical with quiet knight jumps. The short Sideways bishop and diagonal companion each miss the band by **one game point out of 80**. That is too small a boundary difference to require a design change by itself.

The Vertical comparison uses **39 shared fully scored openings**: quiet jumps score **53.85%**, full tall jumps **80.13%**. The tall version's complete 40-opening score is 80.63%. The missing quiet-jump pair is `quiet-e-pawns`; its truncated game ended at the declared move limit. Other groups share all 40 scored openings.

Numerical closeness to 50% supports a shortlist, not proof that an alternative is better designed or balanced in every matchup. Combine readability, enjoyment, counterplay and opening sensitivity with these results. All five newly added alternatives score higher than their respective preceding designs on shared openings; this batch supports using restraint with further buffs. Do not translate these scores into intrinsic piece material or piece Elo.

## Completion and controls

- Ordinary control: 40 complete pairs, A score 50%; 19 wins, 42 draws, 19 losses.
- Amazon control: 40 complete pairs, A score 50%; 18 wins, 44 draws, 18 losses.
- Both controls have no reported errors or truncations. The single truncation is 0.089% of scheduled games, below the plan's 5% review threshold.

Control A scores are symmetric by construction. This summary does not contain physical White/Black totals, and a 50% A score does not establish color balance, correct engine evaluation, or material calibration.

## Evidence limits and next action

Comparison IDs, opening labels, counts, paired scores and opening-cluster means match the declared roster and are internally consistent. At the initial review only the summary was supplied. **The original `run.json` and `games.jsonl` were subsequently supplied. The [follow-up audit](amazon-alternatives-001-audit.md) verifies recorded engine/rule identity, reproduces the summary, and replays all 1,120 games / 150,035 plies. It also finds a representation-dependent engine valuation in Blink @5 and very high default Blink material estimates; review evaluation consistency before attributing the scores to intrinsic strength or prescribing a movement nerf.** The source hashes and observed control colors are recorded in the follow-up audit; matching labels alone were not used to validate identity.

The raw summary is preserved byte-for-byte, SHA-256 `67e50b8d234f12850a8d48932501759f902751df0316d3a93b3cb13a2ca0c309`. Its conditional confidence bounds assume independent opening families; the campaign's related fixed prefixes do not satisfy that sampling assumption, so this review uses descriptive scores rather than formal equivalence or significance claims. Old version-12 results use different revisions and coverage and must not be pooled with this batch.

Next, address the evaluation confound and combine the user's playtesting feedback before selecting the playable shortlist. Movement definitions, prices, engine settings and campaign inputs stay unchanged while that review is pending. No additional balance games are queued.
