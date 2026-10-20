# Budget-3 results 001

Recorded 2026-10-19 from the project owner's uploaded [summary](budget-3-001.summary.json). Run ID: `b952ede8-a384-4676-ad09-dfb8755c77fb`. Summary SHA-256: `cd09c5cc71e6c296f06422a87b2797383e2ac3c2be49276ca0e651f64c582da0`.

The summary reports **480 completed games, 240 complete color-swapped pairs, and zero errors, aborts, truncations, invalid records, duplicate completions, or partial pairs**. Each of 12 comparisons covers the same 20 opening prefixes. Cross-checks confirm internal consistency of the reported W/D/L totals, pair counts, opening-average scores, and combined totals.

The uploaded file contains aggregate results, not the run manifest or game histories. Army descriptions below use the unchanged checked-in [budget-3 configuration](../budget-3.json). That sample specifies 10,000 nodes per move, Skill 20 for both sides, one thread, 32 MB hash, and 400 total plies; the actual engine/rules fingerprints and settings await `run.json`. Exact move reconstruction and ability-use analysis require `games.jsonl` or the PGNs. This report does not claim those files were examined.

The ordinary control scored **50%**, with 13 wins, 14 draws, and 13 losses from A's perspective. Each opening's color-swapped pair also scored exactly 50%. That supports consistent label/color handling under this protocol; it does not establish evaluation accuracy for unusual pieces. All games ended by rules: 428 checkmates, 21 threefold repetitions, 14 fifty-move draws, and 17 reported insufficient-material draws.

The principal comparison holds Army A fixed: an otherwise ordinary army with **two blue knights (b1/g1) and one blue bishop (c1)**. Army B spends the same three upgrade points on one purple starting-piece upgrade. Scores below are from the purple army's perspective; draws count half. W/D/L refers to games; pair W/D/L refers to whether the purple army scored above/equal/below 50% across both colors.

| Purple upgrade | Purple score | Purple game W / D / L | Purple opening-pair W / D / L |
| --- | ---: | ---: | ---: |
| Purple rook | 91.25% | 35 / 3 / 2 | 18 / 2 / 0 |
| Purple pawn | 85.00% | 34 / 0 / 6 | 14 / 6 / 0 |
| Purple knight | 80.00% | 31 / 2 / 7 | 13 / 7 / 0 |
| Purple bishop | 60.00% | 18 / 12 / 10 | 9 / 7 / 4 |
| Purple queen | 58.75% | 21 / 5 / 14 | 9 / 6 / 5 |
| Purple king (exploratory) | 72.50% | 28 / 2 / 10 | 10 / 10 / 0 |

**Rook and pawn are the clearest outliers in this test.** The purple-rook army led in 18 opening pairs and tied two; the purple-pawn army led in 14 and tied six. Neither lost an opening pair. The purple knight led in 13 and tied seven. Thus their advantage was spread across this selected suite, rather than coming from just one exceptional opening. These are complete-army results; they do not show that every allocation of three blue upgrades is weaker.

The findings do not separate overly strong purple upgrades from underpowered blue minor-piece bonuses. Every one of the 11 upgrade matchups favored the purple side in point score, but that alone does not identify which abilities to change. Keep the agreed 1/2/3 prices and test individual effects before changing movement.

Two interactions deserve attention. The purple rook also scored **78.75%** against blue knight + orange rook. Against the purple d-pawn, three blue c/d/e-pawns scored **36.25%**, compared with **15%** for the blue-minor package: the blue-pawn package improved in nine matched opening pairs and tied eleven, with no worse pair. This argues for testing pawn placement and opponent context rather than treating all blue pawn bonuses as uniformly weak.

The bishop and queen results are closer to parity and opening-sensitive. Neither result establishes equality or a reliable strength ranking. They should remain available as comparison points while the larger rook/pawn/knight signals are investigated.

King cases remain exploratory: unequal king levels use pseudo-royals, which omit the engine's ordinary king-shelter/danger evaluation. Of 80 games involving purple kings, 75 ended in mate and five in draws; none truncated. That is encouraging for practical game completion here, but does not settle sparse-endgame conversion or justify a king nerf.

With 20 opening clusters, the stored conditional Hoeffding bounds have a half-width of about **30.4 percentage points** before clipping. Only the fixed-blue-package comparisons against purple rook and purple pawn exclude 50% under that model. The prefixes are short and related, not independent sampled opening families; the intervals are descriptive, and multiple comparisons further limit general claims. Forty games per matchup are not forty independent positions.

For reference, the purple-rook score transforms to roughly **+407 score-equivalent Elo** relative to the tested blue-minor army. This describes performance in this experiment. It neither assigns the rook an intrinsic Elo/material value nor calibrates an engine-strength handicap. Those require separate effect, material-anchor, and strength-sweep runs.

All comparison scores below use the original summary's **Army A** perspective, matching CLI output. Every row has 40 games and 20 complete opening pairs.

| Comparison (A vs B) | A wins / draws / losses | A score |
| --- | ---: | ---: |
| Blue bishop + orange bishop vs purple bishop | 15 / 3 / 22 | 41.25% |
| Blue knight + orange rook vs purple rook | 8 / 1 / 31 | 21.25% |
| Blue c/d/e-pawns vs purple d-pawn | 13 / 3 / 24 | 36.25% |
| Blue queen + orange d-pawn vs purple queen | 10 / 4 / 26 | 30.00% |
| Blue knight/rook/e-pawn vs purple king | 11 / 3 / 26 | 31.25% |
| Ordinary army vs ordinary army | 13 / 14 / 13 | 50.00% |
| Two blue knights + blue bishop vs purple bishop | 10 / 12 / 18 | 40.00% |
| Two blue knights + blue bishop vs purple king | 10 / 2 / 28 | 27.50% |
| Two blue knights + blue bishop vs purple knight | 7 / 2 / 31 | 20.00% |
| Two blue knights + blue bishop vs purple d-pawn | 6 / 0 / 34 | 15.00% |
| Two blue knights + blue bishop vs purple queen | 14 / 5 / 21 | 41.25% |
| Two blue knights + blue bishop vs purple rook | 2 / 3 / 35 | 8.75% |

The two focused follow-ups are now complete; their results are preserved separately.

1. [Outlier-effects results](outlier-effects-001.md): 440 games at the original sample's 10,000-node budget, comparing each knight/pawn/rook tier and the blue bishop against an ordinary army. Pawn effects use **d2**, matching the central purple pawn in this run; the broader existing effect template uses a2. These experiments separate tier effects from the fixed three-blue package.
2. [Search-confirmation results](budget-3-confirmation-001.md): 200 games under the intended **100,000-node** protocol, with the same five chosen comparisons and opening prefixes. Purple rook/pawn/knight advantages persist and rise in point score. This does not supply new independent opening evidence or measured material values.

If an individual upgrade scores close to 100% against the ordinary baseline, use material handicaps or stronger opposition to separate its strength from other strong upgrades. After reviewing these follow-ups, compare the relevant effects with ordinary-material handicaps and inspect game histories for use of the special abilities. Save changed movements as new revisions so these results remain an identifiable baseline.
