# Revision 1 screening

Recorded 2026-10-21 from the owner's uploaded [summary](revision-1-screen-001.summary.json). Run ID: `96cf5d5a-0e37-437a-9976-6c4c0d3f44bf`. Original upload SHA-256: `7c792c495279d70f33e2246781280990765df2e611fb902fe69a6aa2171a1f72`.

All **100 scheduled games completed**: five comparisons, each with 20 games and ten complete color-swapped opening pairs. No errors, truncations, aborts, invalid records, duplicate completions, or partial/invalid pairs were reported. Counts, opening means, and scores reconcile within the summary.

The intended [screen configuration](../revision-1-screen.json) uses 100,000 nodes per move, Skill 20, one thread, 32 MB hash, ordinary kings, and a 400-ply limit. Its ten prefixes are the predeclared even-index half of the original suite. Only the summary was supplied for screening: actual executable/rules fingerprints, settings, and move histories cannot be independently verified from it.

## Screening results and decision

Scores are from **Army A's perspective: the revised purple army**, except in the ordinary control. All upgrade comparisons cost three points per side. Blue minors means blue knights on b1/g1 and a blue bishop on c1; blue pawns means c2/d2/e2; blue-plus-orange means blue knight b1 and orange rook a1. Relative starting squares are mirrored when an army plays Black.

| Army A / opponent | A W / D / L | A score | Complete pairs |
| --- | ---: | ---: | ---: |
| `pawn.purple@2` / blue minors | 13 / 7 / 0 | 82.5% | 10 |
| `pawn.purple@2` / blue pawns | 16 / 3 / 1 | 87.5% | 10 |
| `rook.purple@2` / blue minors | 15 / 2 / 3 | 80% | 10 |
| `rook.purple@2` / blue-plus-orange | 12 / 4 / 4 | 70% | 10 |
| Ordinary control | 5 / 10 / 5 | 50% | 10 |

**Park `pawn.purple@2` for this batch.** Its 87.5% score reaches the predeclared 85% screening threshold. Limiting quiet slides to two squares did not produce a useful equal-cost result against both tested allocations. Retain its immutable definition for reference; do not silently replace it with another candidate or spend its 40 reserved confirmation games.

**Advance `rook.purple@2` to its reserved confirmation.** Both screening scores remain below the coarse early-stop threshold, although neither is inside the provisional 35%–65% target. The mixed allocation provides a different comparison from the three-blue-minor package.

The selected confirmation comprises 40 rook games plus 20 ordinary controls, using the reserved odd-index prefixes and the same full declared registry. That confirmation is now complete; see the [final batch decision](revision-1-rook-confirmation-001.md). Total batch expenditure is 160 games, with 40 unused.

These are complete-army performance observations, not intrinsic piece material or evidence that every blue allocation is weak. The fixed opening prefixes are related; neither the screening thresholds nor the summary's conditional intervals establish general balance.
