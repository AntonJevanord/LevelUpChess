# Level-3 screen: closed early for redesign

Recorded 2026-10-22. The user stopped the version-12 round robin and chose to redesign the outliers. **Close this campaign without using its reserved confirmation stage.** Preserve its definitions and results; old candidates do not need another screening run before trying new revisions.

The uploaded summary contains **1,507 completed games, one unscored truncation, and two error attempts**, with 1,508 of 1,860 scheduled games finalized. There are **753 complete color pairs / 1,506 paired scored games** across all 93 comparisons. One completed Camel-knight/Vertical-bishop game lacks a scored partner because the other game reached the move limit. The summary reports no invalid records, invalid completed results, duplicate completed results, or invalid color pairs.

## Snapshot and audit limits

The three uploads do not represent the same snapshot. The standings CSV accounts for 1,408 paired scored games including controls; the summary accounts for 1,506. Several direct Amazon scores differ. The figures below use the fuller **summary**, rather than combining it with the earlier-looking CSV/report. The CSV and Markdown do not contain a run ID, so their common run provenance cannot be independently established.

The [machine audit extract](level3-screen-001.audit.json) preserves source-file SHA-256 hashes, totals, candidate summaries, and all 93 comparison tables with opening clusters. Its comparison IDs match the declared [version-12 configuration](../level3-round-robin.json). No run manifest or game journal was supplied: engine/rule identity, individual moves, recovery histories, and causes of errors have not been independently checked.

The two failed attempts report `Engine operation timed out; match was not scored.`, in the Amazon control and Rank-pawn/Returning-pawn matchup. The user reports two PC blackouts. The aggregate files cannot verify the connection. Failed attempts and the truncated game receive no points.

## Direct scores against the unchanged Amazon

“Score” means wins plus half the draws, divided by scored games; it is not the win-only percentage. Results use complete color-swapped pairs. Each listed pair uses one declared opening prefix, but related prefixes are not independent samples of all chess positions.

| Purchase | Score vs Amazon | W / D / L | Pairs / prefixes | Design response |
| --- | ---: | ---: | ---: | --- |
| Ranging pawn | 71.4% | 9 / 2 / 3 | 7 | Review a nerf; broad results also look strong. |
| Courier pawn | 30.6% | 4 / 3 / 11 | 9 | Buff candidate. |
| Rank pawn | 22.2% | 1 / 6 / 11 | 9 | Substantial redesign candidate. |
| Returning pawn | 64.3% | 8 / 2 / 4 | 7 | Watch; close to the proposed band, with mixed other matchups. |
| Knight and guard | 57.1% | 7 / 2 / 5 | 7 | Keep unchanged; no repeat subject test needed. |
| Camel knight | 56.3% | 8 / 2 / 6 | 8 | Keep unchanged; no repeat subject test needed. |
| Vertical bishop | 25.0% | 3 / 2 / 11 | 8 | Buff candidate. |
| Sideways bishop | 17.9% | 1 / 3 / 10 | 7 | Buff candidate. |
| Capture-box rook | 94.4% | 17 / 0 / 1 | 9 | Remove from the active redesign lineup; retain the archived ID. |
| Knight-capture rook | 47.2% | 7 / 3 / 8 | 9 | Keep unchanged; no repeat subject test needed. |
| Blink rook | 25.0% | 3 / 3 / 12 | 9 | Try the requested one-square diagonal capture addition. |
| Twin short queens | 19.4% | 3 / 1 / 14 | 9 | Park at level 3; a lower-price experiment remains separate. |
| Queen and companion | 71.9% | 10 / 3 / 3 | 8 | Review a nerf to the companion package. |

The Capture-box rook also scores **87.9%** in its equally weighted available-opponent mean. That supports the user's removal decision beyond one favorable reference matchup. The Knights' Amazon scores support retaining their current identities. These are prototype decisions, not measured material values or proof of tight balance.

All designs have some scored coverage against all 13 opponents, but their opening coverage and completed schedules differ. The remaining round robin is incomplete, so **no final rankings are assigned**. In particular, the bishops' roughly 45% available-opponent means coexist with poor Amazon scores; matching one reference will not eliminate matchup-specific strengths.

## Controls

- Ordinary control: eight complete pairs, paired A score 50%; no reported errors or truncations.
- Amazon control: ten complete pairs, paired A score 50%; one historical failed attempt is visible alongside its 20 completed games.

These expected control scores are scoring/completion checks. They do not establish balanced upgrades or prove every engine evaluation correct. Physical-color results and move replay were not independently reconstructed from the aggregate summary.

## Next batch

Use **40%–60% score against the fixed Amazon** as a practical design target for the new revisions. This is a decision band, not a confidence interval, a guaranteed win rate, or a material-value conversion. Seven to nine opening pairs per old direct matchup support coarse triage; close calls remain uncertain.

Test new revisions against the Amazon only, with the opening cohort, node budget, complete color pairs, game cap, and stop/decision rules declared before play. Do not replay unchanged old candidates as subjects. Keep the Amazon unchanged as the opponent, retain human playtesting, and finish the new capped batch before another design pass. The new pieces are balance candidates until measured.
