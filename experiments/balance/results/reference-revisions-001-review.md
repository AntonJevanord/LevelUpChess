# Revision experiment: reported completion and valuation review

The user's [final Markdown report](reference-revisions-001.uploaded-report.md),
received 2026-10-26, reports 4,608 new games complete: 7,295 completed outcomes
across parent and extension, one inherited truncation, and no errors or aborted
attempts. Its SHA-256 is
`cf4d138e6021f8740317f31e5f9db78470c9cb3890b34cb0195a7e5bccafe37a`.
Close collection at its cap. This is a report review, not a reproduced final
audit: the supplied extension journal contains 2,873 games, and no extension
manifest, final JSON report or complete 4,608-game journal was supplied.

## Final reported comparisons

Scores count draws as half a point. Bonuses use assumed pawn = 1 / queen = 9.

| Purchase | Amazon score | Camel score | Combined added-value estimate |
| --- | ---: | ---: | ---: |
| Original horizontal bishop | 57.03% | 51.56% | 4.54 |
| Short-side bishop | 47.66% | 41.02% | 3.49 |
| Quiet-jump bishop | 29.69% | 38.67% | 2.74 |
| Forward-jump bishop | 43.36% | 45.51% | 3.46 |
| Diagonal-capture rook | 66.41% | 60.74% | 4.99 |
| Diagonal-step rook | 76.17% | 66.80% | 5.49 |
| Full-knight rook | 67.38% | 59.57% | 4.62 |

Amazon's reported bonus is 3.89; Camel's is 3.61. Keeping the original bishop
remains reasonable. The rook revisions retain advantages against this reference
basket, particularly diagonal-step. These are outcomes under the recorded
playing policy, not an independent calibration of the engine's values.

## Existing-game exchange audit

The [read-only helper](reference-revisions-checkpoint-2304-exchanges.cjs) and
[output](reference-revisions-checkpoint-2304-exchanges.json) validate the exact
parent upload and the partial extension's schedule/profile annotations. They
legally replay 1,468 relevant rook-versus-Amazon/ordinary games, 150,540 plies,
checking SAN, final positions and outcomes. Original pieces are tracked through
castling, promotion and captures. No new games or native searches are involved.
The extension's actual executable/inventory still needs its process manifest.

Matched checkpoint comparisons below use `reference-001` through `reference-064`,
128 scored games per design and opponent. The upload's later games are reported
separately in JSON and do not enter these checkpoint counts.

| Rook | Amazon takes rook and is immediately recaptured | Ordinary queen does the same | Score against ordinary army |
| --- | ---: | ---: | ---: |
| Original `RcN` | 13/128 | 9/128 | 87.50% |
| Diagonal capture `RcNcF` | 23/128 | 19/128 | 98.05% |
| Diagonal step `RcNF` | 27/128 | 15/128 | 96.09% |
| Full knight `RN` | 25/128 | 24/128 | 92.19% |

On those same ordinary-army positions, original bishop scores 94.92%, Camel
89.06%, Amazon 87.50%; revised bishops range from 85.55% to 91.02%.
The rook improvement is present without an Amazon opponent. Ordinary-queen
exchanges also become more frequent. A capture followed by recapture may be
forced, compensated or a rational decision in an already lost position; these
counts do not establish blunders or their cause. Subsets excluding those games
are descriptive, selection-dependent results, not causal corrections.

## Check the actual prior before changing it

The [native diagnostic](reference-revisions-valuation-diagnostic-001.json)
reproduces the expected profile's preflight inventory with zero searches.
Internal units below are not the fitted pawn-equivalent material scale.

| Type | Middlegame | Endgame |
| --- | ---: | ---: |
| Ordinary queen | 2538 | 2682 |
| Original `RcN` | 1904 | 1959 |
| Diagonal capture | 2240 | 2297 |
| Diagonal step | 2413 | 2531 |
| Full knight | 2240 | 2413 |
| Amazon | 3738 | 3875 |

All current rook raw/capture/evaluation tables agree, both colors. These rooks
are priced below an ordinary queen in both phases. Old adjacent-capture Blink
was 3536/4370 and long-capture Blink 4002/4877: their overpricing relative to
Amazon was materially different. Current moves also lack the earlier overlapping
diagonal-capture description. This weakens that specific explanation, without
establishing correct values or accurate fairy-piece exchange search.

The prior manual Blink comparison changed adjacent-capture score 85% to 76.25%,
long-capture 88.75% to 85%, and quiet Blink 46.25% to 15%. It established value
sensitivity, not a policy that solved every design or measured true strength.
Current fitted bonuses are learned from these same engine outcomes and cannot
independently rule out evaluation bias.

If this uncertainty changes a design decision, first inspect a bounded set of
pre-exchange positions, preserving full histories. Compare identical movement
under automatic and one declared alternate prior at equal search budgets and
a deeper budget. Changed choices establish sensitivity; they do not prove which
prior plays better. A complete rerun is optional after that review, with a new
policy identity. Setting every piece to its intended cost does not calibrate it.

## Reproduce checkpoint observations

```sh
node experiments/balance/results/reference-revisions-checkpoint-2304-exchanges.cjs --games PATH/TO/games.jsonl --out NEW-AUDIT.json
```

The pinned parent is the default. `--parent` can select its byte-identical local
copy. A later journal can reproduce the first-64-opening tables if those games
are preserved; its input hash and `allUploaded` totals will differ. Preserve
the current outputs and all completed run files.
