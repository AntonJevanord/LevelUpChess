# Complete level-three panel

This study compares the ten selected replacement pieces at **20,000, 40,000
and 80,000 requested nodes per move**. It can start independently of the W2/WD
grant decision. Grants need pocket-aware material accounting and belong in a
separate outcome study.

Use this as a roster audit, rather than repeating the complete table after
every design change. Later candidates can still face the four frozen references.

## Roster and notation

| Proposed roster color | Piece | Exact stored Betza |
| --- | --- | --- |
| Red | Queen pawn | `mQ2cfQ2` |
| Red | Vertical bishop | `BvW2vnN` |
| Red | Unicorn | `NC` |
| Red | Vanguard | `RfB` |
| Red | Amazon | `QN` |
| Purple | Rook pawn | `mRcfB` |
| Purple | Cruisader | `BsR2nsN` |
| Purple | Nightrider | `N0` |
| Purple | Ranged rook | `RC` |
| Purple | X-ray queen | `QgB0` |

These proposed panel groups do not recolor the current playable library. Its
four frozen references remain red, including Cruisader. Research reference
membership and presentation colors are separate: Vanguard, Unicorn, Cruisader
and Amazon retain their frozen identities and engine tables.

The [Betza convention](betza-convention.md) explains case, ranges, directional
components and blockers. `BsW2snN` is a tested alias of stored `BsR2nsN`.
`BvW2VnN` needs lowercase `v`: `BvW2vnN`. No archived definition is rewritten.

## What runs

Each opening has all **45 unordered upgrade pairings** and **10 single-upgrade
versus ordinary-army anchors**, each with colors reversed. All armies begin
with the same orthodox baseline; a matchup compares the advantage of buying
one upgrade, rather than exchanging its whole piece for another family.

| Total openings | Head-to-head games | Anchor games | All three budgets |
| ---: | ---: | ---: | ---: |
| 8 | 2,160 | 480 | 2,640 |
| 16 | 4,320 | 960 | 5,280 |
| 32 | 8,640 | 1,920 | 10,560 |
| 64 | 17,280 | 3,840 | 21,120 |

The 64-case book is frozen before play. Every eight-case batch spans different
first moves; all four forced plies are quiet and legal in ordinary chess and
every upgraded matchup. Prefixes do not move an upgraded starting piece. Full
prefixes and canonical positions differ from earlier declared cases; broader
opening ancestry can still overlap.

Eight cases are a screen. Extend only if uncertainty or search sensitivity
could change a decision. Each cell contains 16 games at eight cases and 128 at
64 cases; total campaign size is not the sample size of an individual matchup.
There is no 2,000-game cap.

Each budget uses Skill 20, one search thread, 32 MiB hash, the same fixed MG/EG
priors and a 400-total-ply cap including the forced prefix. The four reference
priors and six accepted alternative priors retain their earlier applied
values. Every native preflight checks both colors and all six engine value
tables. Fitted material values never update those priors automatically.

Four jobs run at most four simultaneous searches, using the existing two
engine processes per game. Budgets execute sequentially within each batch;
selecting three budgets does not start twelve jobs. At similar game lengths,
20k+40k+80k takes roughly seven times the search work of the 20k cohort alone.
Fixed overhead and changed game lengths affect actual elapsed time.

## Start and extend

Run one research campaign at a time. Finish or pause the mixed-army study first.
No rebuild is required for these additive tools, and they preserve its runner,
catalog and balance bundle.

```powershell
git pull
npm.cmd run balance:level3:panel -- --check --openings 8
npm.cmd run balance:level3:panel -- --out balance-results/level3-panel --openings 8 --jobs 4
```

The first target runs three 880-game stages, then fits material estimates.
To extend, request a new **total**, rather than an additional count:

```powershell
npm.cmd run balance:level3:panel -- --resume balance-results/level3-panel --openings 16
npm.cmd run balance:level3:panel -- --resume balance-results/level3-panel --openings 32
npm.cmd run balance:level3:panel -- --resume balance-results/level3-panel --openings 64
```

Use `--resume balance-results/level3-panel` without a new total to finish a
paused target. Completed stages are verified and skipped. Jobs, book, roster,
values, engine, runner and controller identities remain fixed. Finish an
existing campaign on its original checkout if a later release changes them.

`q` or Ctrl+C stops immediately; `g` finishes active games; `p` finishes active
color pairs. Any stop pauses the entire queue, including a request received at
the final game of a stage. Completed game journals are durable; a hard power
cut can lose each worker's current unsaved game prefix.

Game starts, winners and running matchup points print by default; `--log plies`
adds move output. Outcome reports and the aggregate journal update after each
stage or clean stop. During an active stage, the original stage journals update
after every game. Offline material replay yields every 32 games, prints progress
and supports Ctrl+C before the next chunk.

## Check remaining runtime

While the panel is running, open another PowerShell window in the project folder:

```powershell
npm.cmd run balance:level3:eta -- --run balance-results/level3-panel
```

This command reads the campaign and original stage journals without starting
engines, writing reports or taking the campaign lock. The panel can keep running.
Run it again for a fresh snapshot; add `--json` for structured output.

The estimate covers the remaining games in the requested total, including
unfinished and future stages. It keeps 20k/40k/80k timings separate, using finalized
first-attempt game durations and the campaign's recorded worker count. A budget
without usable timings remains unavailable rather than borrowing another budget's
speed. Estimates are rough: game lengths, worker imbalance, CPU throttling and disk
contention can change throughput. Preflight, waiting between sessions, material
fitting and other overhead are outside the estimate.

## Reports and evidence

`panel-report.md` contains separate ten-by-ten matrices, W/D/L, physical-color
scores, ordinary-army scores and overall scores equally weighting the other
nine upgrades on shared completed cases. Its search-sensitivity table compares
only opening/color pairs completed at **all three** budgets. It reports the
80k-minus-20k score change and conditional opening-block ranges.

`material-report.md` fits baseline-only, head-to-head-only and combined material
models independently at each budget. It prints ordinary piece estimates,
upgrade bonuses and whole-piece totals. **Pawn = 1 and queen = 9 are assumed**;
a separate free-ratio diagnostic checks that assumption. Whole-piece ranges add
the ordinary family and bonus inside each bootstrap refit, preserving their
covariance. Rank, convergence and held-out prediction support remain visible;
unsupported estimates print as unavailable.

Only complete scored color pairs contribute. Truncations are not draws.
Legal replay verifies SAN, final positions and outcomes; stable windows filter
nearby captures/promotions. Games receive equal fitting weight, and opening
groups stay together during validation and resampling. These are conditional
outcome estimates, not intrinsic exchange prices or an unbiased population
sample. Strongly winning anchors can provide limited information about exact
value. Related openings and engine/prior bias remain outside the ranges.

```powershell
npm.cmd run balance:level3:panel -- --report balance-results/level3-panel
npm.cmd run balance:level3:panel -- --material balance-results/level3-panel --bootstrap 100
```

These offline commands start no games. Run them after pausing the campaign;
its root lock prevents concurrent report changes. Completed targets retain
snapshots in `reports/openings-08`, `openings-16`, `openings-32` and `openings-64`.
The latest reports remain at the root. Material analysis processes one node
budget at a time to limit memory.

Original `run.json`, archived rules, preflight proofs and `games.jsonl` remain
in each stage directory. The root **`games.jsonl`** is an append-only index:
each line wraps the original record with stage, config hash and run provenance.
Identical copies do not add games; conflicting records fail validation. A
partial final aggregate write is recoverable from the original journals.
Keep the complete campaign directory. Older tools expecting raw game records
must read the stage journals, not the root provenance envelopes.

Earlier runs are not automatically appended to this study: its book, search
budgets, selected IDs and controlled profile define a new context. A future
comparison may import compatible evidence explicitly without replaying it.

## Engine strength

The bundled Fairy-Stockfish build uses classical evaluation without a trained
LevelUp NNUE. Node limits measure search effort, not Elo or a fixed depth.
Doubling nodes does not double playing strength; difficult tactics can change
more than quiet positions. Hardware affects games per hour at a fixed node
budget. This project has no rated-opponent calibration for 20k, 40k or 80k in
ordinary chess, so the report does not assign those budgets Elo ratings.
