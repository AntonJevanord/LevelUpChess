# Completed reference panels

The three uploaded stages contain **1,216 completed games**, with no errors,
truncations or missing color partners. All three uploaded Markdown reports
reproduce exactly from the archived journals. The [complete panel](../experiments/balance/results/reference-panel-v17-002.panel.md)
reuses **3,880 scored games** across four separate purchase budgets.

| Stage | Points per side | Games | Opening cases |
| :--- | ---: | ---: | ---: |
| Missing King-step/Pawn-grant triple bridge | 3 | 64 | 32 |
| Level-one single purchases | 1 | 192 | 32 |
| Level-one two-purchase teams | 2 | 960 | 32 |

Draws count half a point. Each matchup uses complete color-swapped pairs.
The historical level-three matchups and the eight-case level-three 2v2 pilot
remain in their own contexts; they do not enter an overall ranking across budgets.

## Level-one results

| Single purchase | Overall against the other two | W / D / L |
| :--- | ---: | :--- |
| Two-step pawn | 48.05% | 49 / 25 / 54 |
| King-step pawn | 53.13% | 57 / 22 / 49 |
| Pawn grant | 48.83% | 50 / 25 / 53 |

The three singles are close in this cohort. Their identical-copy packages show
more separation:

| First army against second | First army's score | W / D / L |
| :--- | ---: | :--- |
| Two Two-step pawns / two King-step pawns | 41.41% | 21 / 11 / 32 |
| Two Two-step pawns / two Pawn grants | 46.09% | 25 / 9 / 30 |
| Two King-step pawns / two Pawn grants | 58.59% | 28 / 19 / 17 |
| Three King-step pawns / three Pawn grants | 55.47% | 29 / 13 / 22 |

The mixed King-step/Pawn-grant team scored 61.25% against its five opponents;
two King-step pawns scored 58.13%, and two Two-step pawns scored 38.91%.
These are fixed-placement team outcomes, not individual piece values or proof
of a universal synergy bonus. Use all three identical-copy packages as distinct
benchmarks in the acceptance screen rather than treating them as interchangeable.

## Earlier Returning pawn results

The [initial screen](../experiments/balance/results/v17-screen-001.report.md)
included the Returning pawn `pawn.blue@3`, movement `bmWfmW2fceF`.
Three copies faced one level-three reference upgrade on eight short opening
cases, both colors:

| Opponent | Returning-pawn package score | Games |
| :--- | ---: | ---: |
| Vanguard | 34.38% | 16 |
| Unicorn | 18.75% | 16 |
| Cruisader | 18.75% | 16 |
| Amazon | 6.25% | 16 |
| **Overall** | **19.53%** | **64** |

The package scored 10 wins, five draws and 49 losses. This supports parking the
unchanged Returning pawn rather than spending another acceptance run on it.
It was not tested directly against the newly selected level-one reference panel.

The Bishop-pawn package `pawn.blue@2`, `fmWfeFifmnD`, also underperformed in
that older screen: **24.22%**, with 11 wins, nine draws and 44 losses in 64 games.
Moving it into the new two-point candidate pool is the user's design decision;
the older outcomes do not establish that higher price. The new brackets can
test that proposal explicitly, with en-passant behavior checked separately.

## Evidence and reproduction

The six exact uploads are retained as deterministic gzip archives under
`experiments/balance/results/reference-panel-v17-002.*`. The
[audit JSON](../experiments/balance/results/reference-panel-v17-002.audit.json)
pins original and compressed byte counts/hashes, declarations, profile hashes,
schedule hashes, results and the older pawn evidence. A
[JSON panel](../experiments/balance/results/reference-panel-v17-002.panel.json)
and [CSV](../experiments/balance/results/reference-panel-v17-002.panel.csv)
retain per-cell outcomes and context.

The original run manifests, archived INI files and native preflight proofs were
not uploaded. Reconstructed declarations check compatibility without restoring
that provenance. The audit does not independently replay legal moves, attest to
an executable, fit material values, calculate Elo or establish balance equivalence.
The existing strict run-folder report path remains unchanged.

Verify all pinned inputs and regenerate the expected reports in memory:

```powershell
node scripts/balance/reference-panel-evidence.js
```

Use `--write` only to refresh these derived artifacts after an intentional audit
change. Neither mode starts engines, plays games or changes source journals.
