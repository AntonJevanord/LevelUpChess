# Budget-3 confirmation 001

Recorded 2026-10-20 from the owner's uploaded [summary](budget-3-confirmation-001.summary.json). Run ID: `73471ad9-c48d-4124-8f8a-cb36cca769da`. Original upload SHA-256: `7a13a9a609b861d48c90e035c9d48b8785bb0e89a23dc9576adf43fad0334f98`.

All **200 scheduled games completed**: five comparisons, each with 40 games and 20 complete color-swapped opening pairs. There are no errors, truncations, aborts, invalid records, duplicate completions, or partial/invalid pairs. Scores, W/D/L, opening means, and termination totals agree: 172 checkmates, ten fifty-move draws, eleven repetitions, and seven reported insufficient-material draws.

The intended [configuration](../budget-3-confirmation.json) raises both engines from 10,000 to **100,000 nodes per move**, retaining the original 20 opening prefixes, Skill 20, one thread, 32 MB hash, 400-ply limit, and ordinary kings. The upload contains aggregate results only. Actual engine/rules fingerprints, settings, and move histories have not been verified from this run's manifest or journal. Initial settings and army descriptions likewise follow the checked-in [budget-3 configuration](../budget-3.json).

## Purple advantages persist

The blue-minor army upgrades **both knights (b1/g1) and the c1 bishop to blue**. The opposing army spends the same three upgrade points on one purple rook (a1), pawn (d2), or knight (b1 plus its extra `WD` unit). The blue-pawn army instead upgrades the c/d/e-pawns. All other pieces remain ordinary. Scores below are from the **purple army's perspective**, with draws worth half.

| Purple army's opponent | Initial purple score | Confirmation purple score | Confirmation purple W / D / L | Purple opening-pair W / D / L |
| --- | ---: | ---: | ---: | ---: |
| Blue minors; purple rook | 91.25% | **98.75%** | 39 / 1 / 0 | 20 / 0 / 0 |
| Blue minors; purple pawn | 85.00% | **96.25%** | 38 / 1 / 1 | 19 / 1 / 0 |
| Blue minors; purple knight | 80.00% | **92.50%** | 36 / 2 / 2 | 18 / 2 / 0 |
| Three blue pawns; purple pawn | 63.75% | **80.00%** | 29 / 6 / 5 | 15 / 5 / 0 |

No tested blue army won an opening pair. The ordinary control remains **50%**, with 11 wins, 18 draws, and 11 losses; all 20 control pairs score 50%. Its complete aggregate comparison matches the earlier [blue-rook confirmation](blue-rook-confirmation-001.md) control, consistent with the intended shared protocol. This does not verify executable identity by itself.

For comparison with CLI output, these are **Army A's** scores and changes. Positive opening changes favor the blue army. The [CSV](budget-3-confirmation-001.opening-comparison.csv) preserves all 100 matched opening-pair comparisons, including control.

| Army A versus purple | Initial A score | Confirmation A score | Change, percentage points | Openings better / tied / worse |
| --- | ---: | ---: | ---: | ---: |
| Blue minors vs rook | 8.75% | 1.25% | −7.50 | 1 / 14 / 5 |
| Blue minors vs pawn | 15.00% | 3.75% | −11.25 | 1 / 14 / 5 |
| Blue minors vs knight | 20.00% | 7.50% | −12.50 | 3 / 9 / 8 |
| Blue pawns vs pawn | 36.25% | 20.00% | −16.25 | 7 / 2 / 11 |

The blue-pawn allocation still performs better against the same purple d-pawn than the blue-minor allocation: **20% versus 3.75%**, improving ten matched opening pairs and tying ten. This supports testing allocations and interactions; it does not support treating every blue ability as equally weak.

## Interpretation and limits

The selected purple advantages persist under the intended larger search budget, with higher point scores. They remain priorities for balance work. These results establish a practical mismatch between the tested equal-cost armies under this protocol; they do not show that one purple upgrade beats every possible three-blue allocation, or identify whether to nerf purple abilities, buff blue abilities, or improve engine evaluation.

Rook and pawn are near the scoring ceiling, so their small score difference cannot rank their material values. The new conditional 95% Hoeffding intervals for the purple armies are approximately 68.4%–100% (rook), 65.9%–100% (pawn vs minors), 62.1%–100% (knight), and 49.6%–100% (pawn vs blue pawns). These bounds assume independent opening families; the fixed short prefixes are related and do not establish that assumption. Multiple comparisons and selection of earlier outliers further limit generalization. The cross-budget changes are descriptive and have no dedicated uncertainty estimate. Do not pool the budgets as independent evidence or assign intrinsic piece Elo/material values from these scores.

## Next step: change pieces under a capped plan

The next development step is the [first balance revision](../revision-plan.md), starting with purple-pawn movement range and a narrower purple-rook capture pattern on `version_08`. It allows at most **200 scheduled games** for the batch, split into screening and confirmation, followed by an explicit keep/revert/park decision. Further baseline research is not required before implementing those candidates.

## Optional material compensation

The optional [purple material-handicap configuration](../purple-material-handicaps.json) schedules **320 games at 100,000 nodes**: ordinary control, the blue-minor army versus an ordinary army, and each purple rook/pawn/knight army versus an ordinary army while missing either its ordinary c1 bishop or h1 rook. It is not queued or required before the first changes. All 20 prefixes remain legal; removing the g1 knight would invalidate the Reti prefixes. The purple knight keeps its original b1 knight and extra b3 unit.

These are compensating handicaps, using bishop and rook as conventional roughly three- and five-point references. They test the **added upgrade benefit**. A purple pawn compensating for a missing bishop would not make the whole purple pawn worth only a bishop: its ordinary pawn's contribution must also be counted. Similarly, the purple knight's bonus is the extra unit, while its retained knight remains part of the army.

Removing material also changes development, bishop-pair structure, and castling opportunities; the missing h1 rook removes kingside castling. Any results would be contextual compensation estimates, not exact values or automatic interpolations between three and five. Broader openings, behavior audits, and ordinary-movement custom-piece controls remain research options, not an automatic sequence of prerequisites.

The optional configuration passed 17 existing plan/capability tests, all 320 opening/color assignments, and native/browser legal-move agreement at starting and post-opening positions. These checks validate preparation; no full material-handicap games were run.
