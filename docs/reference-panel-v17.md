# Level-1 and level-3 reference panel

The selected level-1 references are **Two-step pawn** `fmW2fceF2`, **King-step
pawn** `mWFifmnD` and **Pawn grant** `fWmfF`. The four frozen level-3 references
remain Vanguard, Unicorn, Cruisader and Amazon. The
[roster snapshot](../experiments/designs/reference-panel-v17.json) fixes the exact
design revisions and purchase costs for this panel; Scout is outside this run.

The [current panel preview](../experiments/balance/results/reference-panel-v17-001/reference-panel.md)
shows the reused results and marks every unplayed cell as pending.

The panel separates four purchase budgets. Every game has both a normal royal
king and an otherwise ordinary starting army. A grant adds a finite nonroyal
reserve; it costs a turn to drop on an empty square in the owner's half and cannot
give check on deployment. Captured pieces never return to reserve.

| Table | Armies | New games |
| --- | --- | ---: |
| Three points | One level-3 upgrade or three identical level-1 purchases | 64: only the missing King-step-pawn triple versus Pawn-grant triple |
| One point | Each of the three level-1 references against the other two | 192 |
| Two points | All six level-1 pairs, including repeated designs, against one another | 960 |
| Six points | All six distinct-family level-3 pairs against one another | 0: reuse the completed 240-game pilot |
| Total | Three independent experiments | **1,216** |

The six two-point armies are Two-step + Two-step, Two-step + King-step,
Two-step + grant, King-step + King-step, King-step + grant and grant + grant.
Their fifteen distinct pairings exclude self matches. **No two-point army faces
a level-3 reference.** Those games would compare different purchase budgets.

## Reuse and interpretation

The three-point table reuses 1,534 scored historical level-3 games and 890 scored
games involving the selected level-1 triples. Only one of its twenty-one matchup
cells is missing. Completed cells are never replayed merely to assemble this
panel. Old move-limit truncations and their completed unpaired partners remain
unscored, including the original Unicorn–Amazon game.

The historical level-3 games use 128 book-derived opening groups. The newer
level-1 trials use 32 short starts. Each cell retains its source context, game
count and W/D/L. The report does not combine these different opening cohorts into
one overall rating or confidence interval. Draws count half a point.

The level-3 2v2 pilot contributes another 240 scored games in its own six-point
table. It used eight short starts and remains a coarse screen. Across all tables,
the panel reuses **2,664 scored games** before any new stage is run.

Single-purchase and two-purchase results require new games: a three-pawn package's
score cannot be treated as a single pawn's score. Their tables remain separate
from the three-point panel and from material estimates.

All new stages use the existing 32 short starts, both colors, Skill 20,
20,000 nodes per move, one thread per engine, 32 MiB hash and a 400-ply cap.
Single pawns start on c2. Two pawns start on c2/e2; in the mixed pair, Two-step
occupies c2 and King-step e2. A pawn paired with a grant starts on c2. Black's
positions are mirrored vertically. Triples retain c2/d2/e2. These fixed placements
are part of the experiment; the results do not establish placement-independent
partnership strength.

## Run on Windows

Pull the update after finishing any active campaign. Launch each stage once in
its own new folder:

```powershell
git pull --ff-only
npm.cmd run balance:v17 -- --experiment panel-gap --out balance-results/reference-panel-gap --jobs 4
npm.cmd run balance:v17 -- --experiment panel-level1 --out balance-results/reference-level1 --jobs 4
npm.cmd run balance:v17 -- --experiment panel-level1-pairs --out balance-results/reference-level1-pairs --jobs 4
```

Four jobs suit the established PC. Logs show game starts, winners and running
scores; `--log plies` adds move-by-move progress. q / Ctrl+C stops immediately,
g finishes active games and p finishes active color pairs. Only the selected
stage runs. Resume with the same experiment name and `--resume DIRECTORY`.

Each launch validates all scheduled positions against the native engine. A
separate diagnostic profile checks the four frozen level-3 value tables; it
does not put level-3 pieces into these new matches. Use `--check` instead of
`--out ... --jobs ...` to validate without playing or writing results.

Create or refresh the complete report without starting games:

```powershell
npm.cmd run balance:panel -- --out balance-results/reference-panel --gap balance-results/reference-panel-gap --singles balance-results/reference-level1 --pairs balance-results/reference-level1-pairs
```

Omit inputs for stages that have not started; their cells stay pending. To see
the archived results before running anything, use only `--out DIRECTORY`.
The report validates each supplied run's manifest, rules and native preflight.
Keep the source folders: report output does not replace their journals or proofs.

Review the completed tables before extending the game cap. A useful reference
can deter attacks through a recapture threat without ever using that capture;
the panel measures outcomes rather than move counts. The
[human playtest notes](playtest-notes-v17.md) track those observations separately.
