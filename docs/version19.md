# Version 19

Branch **`version_19`** starts from the version-18 closeout, **`v0.18.14`**.
The accepted roster has playable tier libraries and separate same-tier round
robins before cross-level experiments. Expanded roster 005 adds five tested
alternatives alongside their original choices. Every previously published
library and its exact rules remains available.

The [compact public launch proposal](first-release-roster.md) selects eighteen
candidate slots, with [public names](piece-names.md) and a three-wave path to
39 upgrades if each wave adds five board designs and two grants. Grant costs
and [deployment rules](grant-deployment-options.md) are chosen separately:
settle costs 1–6 before selecting the launch trio, then explore 7–9 later.
It is a planning layer; current libraries and research labels
remain available while cross-level results and human playtesting guide selection.

## Accepted roster

The final choices are **NAD at L3**, and **NDmW, QcC and Free Boar BsR at L2**.
Playable revision 003 keeps the green **Forward-tall queen `QfN`** and selects
the blue **Wide-forward queen `QfsN`** as the second L1 queen. It also adds the
two-point yellow **Forward-range pawn `fQ2`** at L2 while retaining the frozen
Knight/Rank pawn references. The [completed trial review](v19-selected-trials-review.md)
records scores of 42.19% and 56.51%; the selection favors their clear movement
identities rather than claiming exact balance. The L2 Bishop pawn remains in
earlier libraries. Herald and the revised Wraith remain at L3.
Revision 004 adds the red three-point **Six-jump pawn**
`ifmnDfmWfceFsNfN` beside Herald and Ranger. It keeps ordinary pawn moves and
captures, adds four wide knight jumps in both directions and two tall forward
jumps, and retains standard promotion and adjacent diagonal en passant.
The playable Wraith is now **`QgmQ0gcBgcsR0`**, the best tested below-50%
revision (38.67% at 40k nodes; 37.89% at 80k). The
[current roster declaration](../experiments/designs/v19-roster-004.json) records every
accepted identity; the [screening review](v18-prepanel32-review.md) preserves
the comparisons behind the final choices.

The fixed reference baskets remain:

| Tier | References |
| --- | --- |
| L1 | Two-step pawn, King-step pawn, Pawn grant |
| L2 | Quiet-tall Knight pawn, Rank pawn, Bishop grant |
| L3 | Vanguard `RfB`, Unicorn `NC`, Crusader `BsR2nsN`, Amazon `QN` |

MG/EG search priors are frozen separately in the
[value declaration](../experiments/designs/v19-panel-values-004.json). They are
engine settings, not purchase prices or fitted material values. Existing
research identities retain their tested movement and historical contexts.

## Expanded alternatives

The [expanded roster 005](v19-expanded-panels.md) adds `BD` beside BgB0 at L1;
`NfhZ`, `RcsNcfN` and `QsDsNA` beside NDmW, RcN and QsN at L2; and
`QsHsCsZG` beside Wraith at L3. Each alternative shares the tier, price and
presentation color of its counterpart. The original choices remain available.

The [completed original-panel reports](../experiments/balance/results/v19-panel-64-001.sources.json)
and [partial minor-selection reports](../experiments/balance/results/v19-minors-selection-001.sources.json)
retain their report-only provenance. BD's 55.47% uses 32 completed opening
cases. The [final knight report](../experiments/balance/results/v19-minors-final-001.sources.json)
now completes all 64: NfhZ scores 50.39%, with a conditional range of
46.09%–54.69%. The expansion broadens playtesting beyond the fixed references.

## Switch and play on Windows

Stop the local server, then run in the project folder:

```powershell
git fetch origin
git switch version_19
git pull --ff-only
npm.cmd ci
npm.cmd start
```

Under **Rules**, choose **Version 19 · Level 1/2/3 roster · expanded** for
12, 15 and 13 designs. The **current** libraries retain the original 11/12/12
rosters. The L1 queen choices are green QfN and blue QfsN;
the new yellow L2 pawn moves and captures up to two clear squares forward,
straight or diagonally, with no sideways/backward moves. Standard promotion
remains Q/R/B/N; its quiet diagonal en-passant landing leaves the bypassed pawn.
Separate libraries keep each profile below the engine's
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

## Run expanded panels with reuse

The separate expanded command requires `--reuse ORIGINAL_PANEL` when starting
from the completed roster-004 tier evidence, or explicit `--fresh` for a full
new collection. `balance:v19` continues to declare roster 004.

```powershell
npm.cmd run balance:v19:expanded -- --tier 1 --reuse balance-results/v19-level1-roster004 --out balance-results/v19-level1-expanded --openings 8 --jobs 1
```

The [expanded-panel guide](v19-expanded-panels.md) gives all three tier
commands, source requirements and continuation. Reuse schedules only
**176 / 624 / 192 new games** at eight openings. It copies the source evidence
into the new campaign, so subsequent resume/report commands do not need the
original source path. The combined matrix labels historical roster-004 and
new roster-005 cells; it is not a uniform new engine context. Failed,
truncated and unpaired old results remain unscored. No scored cloud campaign
was started while preparing these commands.

## Original roster-004 panels

Fresh panel runs now use [roster revision 004](../experiments/designs/v19-roster-004.json)
and its [value policy](../experiments/designs/v19-panel-values-004.json), including
QfsN, fQ2 and the six-jump L3 pawn. Earlier folders keep their original roster,
value policy and controller through their owned runtime. Use fresh folders for
the selected roster; do not reinterpret or pool earlier opponent baskets.

Each panel compares **one purchase per army**, including pawns, queens and
grants, in every same-tier pairing. Both physical colors play each shared
opening. Search uses **40,000 nodes only, one engine thread and 32 MiB hash**;
four workers are the default. There are no 20k/80k arms. Run one panel at a time.

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
npm.cmd run balance:v19 -- --tier 1 --out balance-results/v19-level1-roster004 --openings 16 --jobs 4
npm.cmd run balance:v19 -- --tier 2 --out balance-results/v19-level2-roster004 --openings 16 --jobs 4
npm.cmd run balance:v19 -- --tier 3 --out balance-results/v19-level3-roster004 --openings 16 --jobs 4
```

The schedules contain **1,760 / 2,112 / 2,112 games** at sixteen openings.
These commands start games only when you run them. This release has not
started a scored cloud campaign.

Existing panels retain their original roster and counts through their owned
runtime. Resume those folders with the same command. Do not pool different
Wraith profiles or opponent baskets.

Resume an interrupted panel without changing its target, or extend the same
unchanged declaration to a **total** of 32 or 64 openings:

```powershell
npm.cmd run balance:v19 -- --tier 1 --resume balance-results/v19-level1-roster004
npm.cmd run balance:v19 -- --tier 1 --resume balance-results/v19-level1-roster004 --openings 32
npm.cmd run balance:v19 -- --tier 1 --report balance-results/v19-level1-roster004
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

## Cross-level teams

The [cross-level panel](v19-cross-level-panel.md) uses the selected board-only
subset: eleven L1, twelve L2 and eleven L3 designs. It compares every legal
L1+L2 team against every L3 design, leaving grants out while their release rules
are explored. Queen+queen teams are unavailable in standard armies. It uses
restricted Arbalest, omits the L2 reference Knight pawn and old L3 Herald, and
retains all earlier libraries and outcomes.

```powershell
npm.cmd run balance:v19:cross -- --out balance-results/v19-cross-level --openings 8 --jobs 3
```

This schedules 22,176 games at 40k nodes with both colors. Same-family pieces
share two ordinary starting homes with a declared rotation. Thirteen custom
types per group fit the engine limit. Extend the same output to sixteen,
32 or 64 total openings; keep the entire owned folder for resume and analysis.

## Material estimates after a panel

The command below remains for the original panel contexts. Retain those fits;
the mixed-context expanded matrix is not accepted as a uniform material-fit
source. Expanded valuation needs a separately declared analysis method.

The full journals already contain the moves, results and exact profiles needed
for offline replay. No extra engine games are needed to attempt a material fit.
After a target finishes or the panel stops cleanly, use a new output folder:

```powershell
npm.cmd run balance:v19:material -- --run balance-results/v19-level3-roster004 --out balance-results/v19-level3-material-16 --bootstrap 100
```

Repeat for L1/L2 with their own source and output folders. The report estimates
ordinary pieces, upgraded whole pieces and their bonuses over ordinary family
values, under assumed pawn=1 and ordinary queen=9. It is an outcome-based,
conditional estimate, not a replacement for the recorded engine search priors.
Rank, coverage or stability problems leave estimates explicitly unavailable.

Entire grant-involved matchups are excluded from this board-material fit;
pockets, dropped pieces and royal kings are not silently priced as board
replacements. Grants stay in the outcome reports until a pocket-aware model is
implemented. Source journals and owned runtimes are not modified. See the
[material-estimate guide](v19-material-estimates.md) for scope and interpretation.

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
[panel plan](version19-plan.md) reserves further bridges and larger mixed armies
for review after the first L1+L2 versus L3 panel.

## Puzzles from the games

The [mate-puzzle pilot](puzzle-generation.md) now reads completed original and
expanded panel journals under their exact profiles. Native searches nominate
candidates; exhaustive bounded legal-defense trees validate accepted puzzles.
The playable **Menu → Puzzles** supports pack import, length/participation
filters, hints, retry and return to the paused game. Generation is a separate
command and never starts from a panel or build. The earlier
[upstream review](variant-puzzle-plan.md) informs later non-mate puzzle work.

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
