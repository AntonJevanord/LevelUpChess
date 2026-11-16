# Version 18 targeted lower-tier follow-ups

The first screens support keeping several level-one designs and testing a
smaller set of revisions. These are new, independent declarations at **40,000
nodes per move**. They preserve the original studies, saved runtimes, playable
profiles and reference definitions.

## What the supplied reports suggest

Wazzap knight `NW` scored **51.56%**, Wazzap bishop `BsW` **50.00%**,
Omnidirectional Ghost rook `RmBgmQ0` **50.00%**, and Pawn rook `RceF` **49.44%**.
Those unchanged designs are not rerun here. Their scores remain provisional
results for the supplied openings and opponent basket.

Free Boar bishop's **59.38%** average is driven by its **82.81%** score against
Rank pawn, compared with **46.88%** against Knight pawn and **48.44%** against
the Bishop grant. That is a matchup signal, rather than uniformly excessive
strength. Box queen's **26.04%** remains flagged, but no new level-two queen
design is added to this follow-up.

The **22.92% Bishop pawn** row is the upgraded board pawn
`fmWfeFifmnD`, not the `F` reserve Bishop grant. The grant remains a fixed
two-point reference. This study revises the board pawn, as selected by the user.

A match's two sides share one point, with a draw giving each half a point.
However, candidate rows face fixed references in separate games. Improving one
candidate does not reduce another candidate's recorded score. Their collective
mean need not be 50%; both a generally strong and a generally weak candidate
set are possible. Direct counters and overall strength remain separate questions.

## Level-one follow-up

Eight bodies face the three unchanged level-one references: Two-step pawn,
King-step pawn and Pawn grant. Knights and bishops buy two identical upgrades
against two identical reference purchases. Queens buy one upgrade against one
reference purchase. Reports keep those two budgets separate.

| Role | Movement | Question |
| --- | --- | --- |
| Positional-knight control | `NmR` | Fresh baseline with the original quiet rook moves |
| Quiet-queen knight | `NmQ` | Does quiet diagonal mobility fill the remaining gap? |
| Quiet-king knight | `NmK` | Can short quiet steps provide enough flexibility? |
| Hopping-bishop control | `BgB` | Fresh baseline with short hopping captures |
| Hopping bishop with long quiet hops | `BgBgmB0` | Keep short hopping captures, but allow distant quiet landings |
| Long-hopping bishop | `BgB0` | Allow distant quiet and capturing landings beyond one hurdle |
| Baby Amazon control | `QmN` | Fresh baseline with quiet knight jumps |
| Blink queen | `QmDmAmHmGmNmCmZ` | Add quiet jumps throughout the three-square box while retaining ordinary queen captures |

The knight group retains the historical Positional-knight **972/1093** MG/EG
prior; the bishop group retains **1480/1302**, and the queen group
**2771/2833**. Holding each family's search prior fixed prevents the new move
patterns from simultaneously changing automatic material valuation. Those
numbers are experimental search settings, not inferred material strength or
purchase prices. Eight rule tests and 342 native/browser comparison positions
verify the five new bodies, including quiet-only restrictions, blocker and
hurdle behavior, both colors and the absence of a forced opening mate in two.

## Level-two follow-up

Nine bodies each buy one two-point replacement against the revised quiet-tall
Knight pawn, Rank pawn and `F` Bishop grant. Reference IDs, movement, prices and
search values remain fixed.

| Role | Movement | Question |
| --- | --- | --- |
| Dabada-knight control | `NsWsD` | Fresh baseline with sideways steps and two-square jumps |
| Long-range-knight control | `NA` | Fresh baseline with two-square diagonal jumps |
| Orthogonal two-jump knight | `NWD` | Add orthogonal steps and two-square jumps to a knight |
| Orthogonal three-jump knight | `NWH` | Add orthogonal steps and three-square jumps |
| Diagonal-step knight | `NFA` | Combine diagonal one-square steps with two-square jumps |
| Two-jump knight | `NAD` | Combine two-square diagonal and orthogonal jumps |
| Bishop-pawn control | `fmWfeFifmnD` | Retain the weak body under the new common search prior |
| Clear-range Bishop pawn | `fmWifmnDfceF2bF2` | Capture up to two squares diagonally forward; move or capture up to two diagonally backward along a clear path |
| Jumping Bishop pawn | `fmWifmnDfceFfceAbFbA` | Capture one or two squares diagonally forward; move or capture one or two diagonally backward, jumping over the intermediate square on two-square moves |

The six knight bodies share **1203/1352** MG/EG. The board-pawn control and
both new pawn bodies share the selected quiet-tall Knight-pawn **536/592**
anchor. This deliberately changes the control pawn's old **214/245** prior.
Its earlier 22.92% score must not be pooled with the fresh control or treated as
the new designs' matched baseline. Compare the two new pawns with their fresh
control on shared opening cases; their differences can then be interpreted
under the same valuation policy.

The two revised pawn patterns keep quiet forward steps and a clear home double
advance. Forward diagonals remain capture-only, including actual en-passant
removal. Backward diagonals can move and capture; the ray design needs a clear
intermediate square, while the jumping design can cross that square. Both must
retain ordinary Q/R/B/N promotion. Eleven rule tests and 176 native/browser
comparison positions verify the new knight and pawn patterns, both colors,
blockers, pins, captures giving check, actual en-passant removal and mandatory
standard promotion, including two-square diagonal captures.

The old control keeps its historical `feF` component: a quiet move onto an
en-passant target leaves the bypassed pawn. That historical behavior is not
silently changed while testing the corrected capture-only revisions.

## Schedule and commands

Both studies use one thread per engine, 32 MiB hash, complete color-swapped
pairs and the fixed declared search values. The 64-case book is rotated:
original cases **17–64, then 1–16**. Thus the first sixteen follow-up cases
are outside the original first sixteen cases. The complete casebook is reused;
extending the total does not create 64 globally new independent openings.

| Total opening cases | Level-one games | Level-two games | Both studies |
| ---: | ---: | ---: | ---: |
| 8 | 384 | 432 | 816 |
| 16 | 768 | 864 | 1,632 |
| 32 | 1,536 | 1,728 | 3,264 |
| 64 | 3,072 | 3,456 | 6,528 |

Use fresh output folders for these follow-up declarations. Run one study at a
time with four workers total:

```powershell
git pull --ff-only
npm.cmd run balance:v18 -- --study level1-followup --out balance-results/v18-level1-followup --openings 8 --jobs 4
npm.cmd run balance:v18 -- --study level2-followup --out balance-results/v18-level2-followup --openings 8 --jobs 4
```

Extend the total to sixteen cases without replaying completed games:

```powershell
npm.cmd run balance:v18 -- --study level1-followup --resume balance-results/v18-level1-followup --openings 16
npm.cmd run balance:v18 -- --study level2-followup --resume balance-results/v18-level2-followup --openings 16
```

Use 32 or 64 instead of 16 for a larger total. Refresh a report without playing:

```powershell
npm.cmd run balance:v18 -- --study level1-followup --report balance-results/v18-level1-followup
npm.cmd run balance:v18 -- --study level2-followup --report balance-results/v18-level2-followup
```

Reports retain per-reference scores, overall percentages, colors, fixed opening
cohorts, completed-pair coverage and conditional opening-block ranges. Review
those together rather than accepting a design solely because its average is
close to 50%. Eight cases remain a screen for large effects, not a precise
balance guarantee.

`q` / Ctrl+C stops immediately, `g` finishes active games, and `p` finishes
active color pairs. The original `level1`, `level2` and `mobility` study folders
remain resumable through their own saved runtimes; no follow-up rewrites them.
No scored cloud games start during this preparation.

The user's preference for a Wraith below 50% is retained as a design target.
The stronger full-diagonal variant's reported 57%/60% does not fit that target,
but no further Wraith revision is added to these lower-tier follow-ups.
