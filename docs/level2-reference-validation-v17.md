# Selected level-two reference validation

This is a new **384-game** experiment after the running 6,752-game campaign.
It uses the selected Forward Knight pawn `fmWfceFifmnDfhN`, Rank pawn
`ifmnDmfWfceFsR` and Diagonal grant `F`, each costing two upgrade points.
The [selected reference declaration](../experiments/designs/level2-references-v17.json)
pins their immutable IDs and applied engine values. No completed screen is rerun.

| Panel | Comparisons | Games | Question |
| --- | ---: | ---: | --- |
| Two-point singles | 3 | 96 | How do the three selected references play against one another? |
| Six-point bridge | 9 | 288 | Can three identical level-two purchases match two identical Vanguard, Unicorn or Cruisader upgrades? |

Each cell has sixteen fixed opening cases and both colors, for 32 games.
Amazon is excluded from the doubled roster because ordinary chess has one queen;
the other doubled references occupy their native pair of starting squares.
Single pawn upgrades use c2; triples use c2/d2/e2. Black's squares are vertically
reflected. The Diagonal grant starts as one or three finite nonroyal pieces in
reserve, with an ordinary royal king and no displaced starting pawns. Deployment
spends a turn, stays in the owner's half and cannot give check. Captures never
refill reserves. Pawns retain standard Q/R/B/N promotions and their declared
en-passant behavior.

The sixteen [two-ply prefixes](../experiments/balance/v17-level2-bridge-openings.json)
are disjoint from the first two moves of every earlier declared opening in the
37-file historical inventory. Each side plays one ordinary opening move before
any reserve deployment. They include Queen's Pawn, English, Reti, Van Geet,
Larsen and king-side fianchetto positions, without forcing a tactical opening.
The first and second fixed eight cases remain visible separately.

Keep **20,000 nodes per move, one thread, 32 MiB hash, Skill 20 and 400 total
plies**, including the two forced plies. Applied MG/EG values come unchanged
from the original bracket calibration; preflight checks all six tables for both
colors. These are search priors, not measured material values or purchase prices.
The four official references are checked in their standalone diagnostic profile,
including Amazon, without adding Amazon games to the schedule.

Run this separate experiment after the current campaign finishes. Then:

```powershell
Set-Location 'D:\Chess\LevelUpChess'
git pull --ff-only
npm.cmd run balance:level2 -- --check
npm.cmd run balance:level2 -- --out balance-results/level2-reference-validation --jobs 4
```

The launch command repeats preflight, so the separate `--check` is optional.
Use `--engine PATH` or `FAIRY_STOCKFISH_PATH` for a compatible native build.
The current static worker assignments and separate engines remain unchanged;
dynamic dispatch and shared-engine benchmarking are separate future work.

```powershell
npm.cmd run balance:level2 -- --resume balance-results/level2-reference-validation
npm.cmd run balance:level2 -- --report balance-results/level2-reference-validation
```

q / Ctrl+C stops now; g finishes active games; p finishes active color pairs.
The existing runner preserves completed journals and clean-stop prefixes, and
resume keeps its frozen worker count. No stage is appended to the active queue.

The resulting `v17-report.md` has separate matrices and overall scores for the
two budgets, fixed-half coverage, per-cell W/D/L and unscored counts. Each row
also shows physical White/Black scores, W/D/L and included counts for each fixed
half and all sixteen cases, using exactly the same shared completed pairs as
its overall score. An unfinished
pair contributes no score; missing shared opening cases reduce overall coverage.
The JSON retains original-run/native-preflight provenance and the derived panels.
CSV lists each declared matchup without a pooled grand mean.

Use the bridge to inspect tier scaling and stacking, rather than requiring every
individual counter to reach exactly 50%. With only sixteen fixed cases, treat
results as descriptive. Follow up only on a repeated mismatch that could change
a selection; these games do not fit material values or individual piece Elo.
