# Version 19

Branch **`version_19`** starts from the version-18 closeout, **`v0.18.14`**.
Pre-panel screening is complete. The accepted roster now enters playable tier
libraries and separate same-tier round robins before cross-level experiments.
All twenty-three previously published libraries and their exact rules remain available.

## Accepted roster

The final choices are **NAD at L3**, and **NDmW, QcC and Free Boar BsR at L2**.
L1 retains QfN/QvN pending the [new queen and pawn trials](v19-pawn-queen-trials.md).
Revision 002 removes the third L2 Bishop pawn, retaining the frozen Knight/Rank
pawn references. Herald remains at L3 while alternatives are tested.
The playable Wraith is now **`QgmQ0gcBgcsR0`**, the best tested below-50%
revision (38.67% at 40k nodes; 37.89% at 80k). The
[revised roster declaration](../experiments/designs/v19-roster-002.json) records every
accepted identity; the [screening review](v18-prepanel32-review.md) preserves
the comparisons behind the final choices.

The fixed reference baskets remain:

| Tier | References |
| --- | --- |
| L1 | Two-step pawn, King-step pawn, Pawn grant |
| L2 | Quiet-tall Knight pawn, Rank pawn, Bishop grant |
| L3 | Vanguard `RfB`, Unicorn `NC`, Crusader `BsR2nsN`, Amazon `QN` |

MG/EG search priors are frozen separately in the
[value declaration](../experiments/designs/v19-panel-values-002.json). They are
engine settings, not purchase prices or fitted material values. Existing
research identities retain their tested movement and historical contexts.

## Switch and play on Windows

Stop the local server, then run in the project folder:

```powershell
git fetch origin
git switch version_19
git pull --ff-only
npm.cmd ci
npm.cmd start
```

Under **Rules**, choose **Version 19 · Level 1 roster**, **Version 19 · Level 2
roster · revised** or **Version 19 · Level 3 roster · revised**. Each contains
11 upgrade designs. Separate libraries keep each profile below the engine's
20-custom-type limit; each offers its tier's upgrades alongside ordinary pieces.
Local two-player games also work by opening `index.html` directly.

The existing setup budget is 1–9 points per army. Select a king to buy the
tier's nonroyal reserve grant. Starting play keeps the ordinary royal king and
places the grant in reserve. A drop spends a turn, must land in your own four
ranks and cannot give check. Captures do not refill reserves. Save files and
PGN retain the selected profile and exact piece identities.

Keep the tested en-passant conventions: Herald and King-step pawn can visit an
empty target diagonally as a quiet move, leaving the bypassed pawn. Ranger's
adjacent diagonal en-passant capture removes it. The piece descriptions retain
these distinctions; notation was not silently changed during promotion.

## Run the tier panels

Each panel compares **one purchase per army**, including pawns, queens and
grants, in every same-tier pairing. Both physical colors play each shared
opening. Search uses **40,000 nodes, one engine thread and 32 MiB hash**;
four workers are the default. Run one panel at a time.

Preflight can check all sixty-four cases before collecting games:

```powershell
npm.cmd run balance:v19 -- --tier 1 --check --openings 64
```

Repeat for tiers 2 and 3. Add `--rules-only` to omit native-engine checks.
Windows uses the bundled compatible engine unless `FAIRY_STOCKFISH_PATH` or
`--engine PATH` selects another. Preflight does not play scored games.

The same preflight runs automatically before each eight-case batch: every
army/color prefix must be legal and nonterminal, native/browser move sets must
agree, and manual MG/EG tables must match. It does not certify that a pinned
or exposed piece is tactically safe. Those concerns remain separate diagnostic
flags rather than automatic exclusions or matchup-specific opening selection.

Start at sixteen openings, with a separate output folder per tier:

```powershell
npm.cmd run balance:v19 -- --tier 1 --out balance-results/v19-level1 --openings 16 --jobs 4
npm.cmd run balance:v19 -- --tier 2 --out balance-results/v19-level2-revised --openings 16 --jobs 4
npm.cmd run balance:v19 -- --tier 3 --out balance-results/v19-level3-revised --openings 16 --jobs 4
```

The revised schedules each contain **1,760 games** at sixteen openings.
These commands start games only when you run them. This release has not
started a scored cloud campaign.

Existing v0.19.0 panels retain their original roster and counts through their
owned runtime. Resume those folders with the same command; use new folders for
revised L2/L3 panels. Do not pool the different Wraith profiles or opponent baskets.

Resume an interrupted panel without changing its target, or extend the same
unchanged declaration to a **total** of 32 or 64 openings:

```powershell
npm.cmd run balance:v19 -- --tier 1 --resume balance-results/v19-level1
npm.cmd run balance:v19 -- --tier 1 --resume balance-results/v19-level1 --openings 32
npm.cmd run balance:v19 -- --tier 1 --report balance-results/v19-level1
```

Complete eight-case batches retain reports under `reports/openings-8`,
`reports/openings-16`, `reports/openings-32` and `reports/openings-64`.
The current report is `panel-report.md` with a JSON companion. Keep the whole
run folder, including its owned runtime and journals. `q` or Ctrl+C stops now;
`g` finishes active games; `p` finishes active color pairs. Starts and results
are logged by default; `--log plies` adds moves.

New runs also [record the first post-opening evaluation](opening-evaluations.md)
with each game and summarize its coverage in the report. This reuses the normal
search, preserving scores through retries without extra evaluation searches.
Already-started owned runtimes retain their original behavior.

## Read the results

Reports separate the fixed-reference basket from the whole-panel average.
Changing the opponent roster changes the latter average; an unchanged direct
matchup retains its results. Scores count draws as half a point and distinguish
White/Black performance, paired coverage and conditional uncertainty. Move-limit
truncations and errors are not draws. No ordinary-army anchor games are included.

One shared book contains 64 distinct ordinary positions across eight opening
families, with one case from each family per eight-case batch. Transpositions
are rejected even when their move clocks differ. The book is declared globally, without selecting
near-zero evaluations separately for each upgraded matchup. The
[opening diagnostic](opening-diagnostics.md) can flag trades, pins and exposure;
its flags do not correct recorded scores or prove forced material losses.

Review the first sixteen openings before extending to 32 or 64. Movement,
placement or search-policy changes require new declarations; historical games
are reused only after explicit compatibility checks. The
[panel plan](version19-plan.md) reserves cross-level bridges and mixed armies
for the next stage.

## Initial release checks

The roster, continuation/reporting logic and save/PGN behavior pass the new
unit checks. Browser checks cover all three native-engine connections, setup,
movement hints, colors and save/undo, alongside historical controls. All twenty
earlier profile pairs and the frozen balance bundle retain their bytes.
The 64-case army prefixes pass browser-rule validation; native parity also
covers the first eight cases, the four replacement prefixes and all 452
accepted-roster movement fixtures. No scored panel games were collected here.

Revision 002 adds native/browser Wraith checks, revised setup/save/PGN tests
and desktop/mobile marker checks. The original v0.19.0 declarations and three
profile pairs stay unchanged. Experimental queen and pawn results are collected
separately before any further roster promotion.
