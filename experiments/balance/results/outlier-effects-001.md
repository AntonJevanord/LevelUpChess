# Individual upgrade effects 001

Recorded 2026-10-19 from the project owner's uploaded [summary](outlier-effects-001.summary.json). Run ID: `a1441826-831e-44a3-93ae-9cb5804e9a1a`. Original summary SHA-256: `1dd632a67d2a3438074539b6ef1afd6355347633779feccda7acf36ed0bd8635`. This follows [budget-3 results 001](budget-3-001.md).

All **440 games completed**, covering 11 comparisons, 220 complete color-swapped pairs, and 20 opening prefixes per comparison. There were no errors, aborts, truncations, invalid records, duplicate completions, or partial/invalid pairs. Internal cross-checks agree on all reported W/D/L totals, pair counts, opening means, and termination counts: 365 checkmates, 24 fifty-move draws, 22 threefold repetitions, 27 reported insufficient-material draws, and two stalemates.

This is an aggregate summary. Setup descriptions use the unchanged [outlier-effects configuration](../outlier-effects.json), which specifies 10,000 nodes per move, equal Skill 20, one thread, 32 MB hash, and 400 total plies. The actual engine/rules fingerprints and settings await `run.json`; game moves and actual ability use await `games.jsonl` or PGNs. Those files were not provided or examined.

Army A has a single starting-piece upgrade in an otherwise ordinary army; Army B is ordinary. Purple knight retains its original knight and adds its extra `WD` unit. Pawn choices use d2 for White and d7 for Black, matching the central pawn in the preceding budget-3 tests. Scores below are from the upgraded army's perspective, with draws worth half. Every row has 40 games; pair W/D/L means scores above/equal/below 50% across the two colors.

| Choice | Score vs ordinary army | Game W / D / L | Opening-pair W / D / L |
| --- | ---: | ---: | ---: |
| Blue bishop (c1) | 65.00% | 24 / 4 / 12 | 10 / 8 / 2 |
| Blue knight (b1) | 52.50% | 16 / 10 / 14 | 7 / 5 / 8 |
| Blue pawn (d2) | 66.25% | 20 / 13 / 7 | 11 / 7 / 2 |
| Blue rook (a1) | 28.75% | 5 / 13 / 22 | 1 / 4 / 15 |
| Orange knight (b1) | 65.00% | 22 / 8 / 10 | 11 / 6 / 3 |
| Orange pawn (d2) | 72.50% | 25 / 8 / 7 | 12 / 6 / 2 |
| Orange rook (a1) | 95.00% | 38 / 0 / 2 | 18 / 2 / 0 |
| Purple knight (b1 + extra unit) | 96.25% | 38 / 1 / 1 | 19 / 1 / 0 |
| Purple pawn (d2) | 86.25% | 33 / 3 / 4 | 17 / 2 / 1 |
| Purple rook (a1) | 96.25% | 38 / 1 / 1 | 19 / 1 / 0 |
| Ordinary control | 50.00% | 13 / 14 / 13 | 0 / 20 / 0 |

The ordinary control scored **50%** with 13 wins, 14 draws, and 13 losses. Every control opening pair scored 50%. Its complete aggregate comparison is identical to the previous run's control, consistent with the fixed engine/search/opening protocol. Repeating it does not add new independent opening evidence.

The knight and pawn point scores rise across tiers: knights 52.5% → 65% → 96.25%; pawns 66.25% → 72.5% → 86.25%. These are separate comparisons with the ordinary baseline, not direct tier-versus-tier matches or measured material increments. In particular, orange pawn scored above blue pawn on eight matched opening pairs, tied five, and below it on seven. The average ordering does not imply consistent superiority in every opening.

Blue knight is near parity with ordinary play at this budget, while blue bishop has a positive 65% point score. Thus the earlier weak three-blue-minor package may partly reflect small practical gain from its two blue-knight purchases. The data does not establish a zero intrinsic value for the knight's added quiet steps or justify buffing every blue minor. Blue and orange pawns also have positive point scores in this central starting slot; they should not be treated as uniformly useless.

Orange rook (**95%**), purple rook (**96.25%**), and purple knight (**96.25%**) are close to the ordinary-baseline scoring ceiling. Orange and purple rooks scored differently on only two of the 20 opening pairs: purple better once, worse once, and tied eighteen. These outcomes cannot show that the two rook tiers are equally strong or worth nearly the same material. Head-to-head matches, stronger opposition, or ordinary-material handicaps are needed to distinguish such high scorers. Purple pawn also has a strong **86.25%** signal and led on 17 opening pairs, tied two, and trailed one.

**Blue rook is the main new diagnostic concern.** It scored **28.75%**, with five wins, thirteen draws, and twenty-two losses; it led on only one opening pair and trailed on fifteen. Its rules retain ordinary rook movement/captures and add quiet home-rank jumps. The result warrants checking engine behavior and actual game histories before changing the movement design. Added move options do not ensure that a bounded-search engine will use a piece well.

Inspection of the bundled engine's matching vendored source found a concrete representation difference: a custom rook uses generic custom-piece material and positional evaluation rather than all of the ordinary rook's tuned treatment. A temporary diagnostic build from that source reported internal middlegame/endgame values of **1276/1380 for ordinary R** and **1277/1327 for blue L**. The generic material estimator ignores the initial-only quiet-jump table. These are internal evaluation units, not conventional pawn-equivalent values. Custom L also uses generic slider piece-square/mobility treatment and misses ordinary-rook-specific terms such as file bonuses. A temporary custom piece with plain rook movement likewise receives different evaluation from ordinary R.

The [logging-only diagnostic patch](blue-rook-evaluation-001.patch) and [recorded output/source references](blue-rook-evaluation-001.txt) preserve this source audit. The temporary build used the exact source archive recorded in the bundled engine manifest.

Native/WASM move-set probes retained both castling choices for blue rooks on either side; no missing castling was found. This narrows one possible explanation, but does not prove complete behavioral equivalence in every position. The diagnostic source findings establish an evaluation asymmetry in the bundled build; they do **not** prove that it caused this run's poor blue-rook score, and the uploaded summary alone does not identify the executable used. Move histories are needed to investigate trades, premature deployment, actual bonus use, and the position of decisive mistakes.

There are still only 20 short, related opening prefixes per comparison. The summary's conditional Hoeffding half-width is about 30.4 percentage points before clipping; orange rook, purple knight, purple pawn, and purple rook have bounds above 50% under that model, while blue rook's interval still includes 50%. Fixed related openings and multiple comparisons prevent a general significance claim. No material chart or calibrated engine-strength handicap follows directly from these scores.

Recommended next steps:

1. Run [blue-rook confirmation](../blue-rook-confirmation.json): **80 games at 100,000 nodes**, ordinary control plus the same blue-rook comparison, with other settings/openings held fixed. This checks search sensitivity, not the cause of an evaluation bias. Inspect the original blue-rook PGNs and manifest alongside it.
2. Run the already prepared [budget-3 confirmation](../budget-3-confirmation.json): **200 games at 100,000 nodes** for the earlier rook/pawn/knight findings and the blue-pawn interaction. These repeated prefixes are controlled comparisons, not new opening independence.
3. Add a representation-control profile with ordinary rook movement under a custom piece identity, alongside ordinary R and actual blue L, to isolate evaluator effects. This profile is not implemented yet. Keep evaluation tuning as a separate experiment from movement changes.
4. Use direct tier matchups or material handicaps to separate the near-ceiling orange/purple rook and purple knight results, then expand legal opening families and targeted positions before tuning abilities to the fixed 1/2/3 prices.
