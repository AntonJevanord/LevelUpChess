# LevelUp Chess

Chess with upgradeable pieces. Build an army within a shared budget, then play locally or against Fairy Stockfish. Purchase costs equal the displayed levels; they are not material values.

## Play locally

Download `index.html` and open it in Chrome, Edge or Firefox. It contains the board, styles and rules; two local players need no server or internet connection. Open the downloaded file directly if a chat preview restricts interaction.

Select a piece and a legal destination. Normal play shows only legal moves: gray dots for movement and gray rings for captures. **Inspect pieces** shows either army's complete movement pattern, ignoring blockers, pins and check: dots for movement, red rings for captures, and both for either. Inspect never plays a move. A small **↷** marks jumping or hopping destinations; hops still need a hurdle during play. Arrow keys move focus; Enter or Space selects.

The side panel has **Game, Setup, Design and Files** tabs. Status and essential game controls stay visible across tabs. In Setup, choose a **Version 19 · Level 1, 2 or 3 roster** under Rules, then click a starting piece to choose an upgrade in the board's central ranks. Press **Start game** to apply the draft. **Edit armies** reopens setup; **Return to game** keeps the current game. **Clear White**, **Clear Black** and **Clear both** reset draft armies.

Right-click for a circle or right-drag for an arrow; repeat to remove a mark, or press Escape to clear marks. **Draw** enables tap/drag annotation on touch screens. Design offers four piece styles, four board palettes and an annotation color, with preferences remembered locally. See the [interface guide](docs/interface-v18.md).

**Menu → Puzzles** filters by solution length, mate/material goal, upgraded-ability relevance, and pieces involved, moved or present. Three authored practice examples are included. The [puzzle miner](docs/puzzle-generation.md) reuses completed panel games with exact profiles and targets a 90/10 mix of variant-specific and ordinary tactics; import its `puzzles.json` in the menu. Your normal game stays paused while solving.

The setup budget is 1–9 points per side. Choose **Level 1/2/3 roster · expanded** for 12, 15 and 13 designs, including five new alternatives with the colors of their original counterparts. The original **current** rosters and every earlier library retain their rules. The [version-19 guide](docs/version19.md) gives the roster, Windows branch-switch instructions and panel commands. Historical family workshops remain selectable for earlier mixed-tier setups.

The [first public roster proposal](docs/first-release-roster.md) narrows launch
to fifteen board upgrades and three grants, whose costs may be 1/3/6 rather
than 1/2/3. The long-term target is 39: two choices per tier for each board
family and one grant at each cost from 1–9. Settle costs 1–6 under the
[release deployment policy](docs/grant-deployment-options.md) before selecting
the initial grants; existing reserve rules remain research references. The
[name index](docs/piece-names.md) maps the proposed public names to exact designs;
current playable labels and running experiments retain their identities.

The [cross-level panel](docs/v19-cross-level-panel.md) compares 106 L1+L2 teams
with eleven L3 designs at 40k nodes. Grants and queen+queen teams are excluded;
the full RcN rook, L2 reference Knight pawn and old L3 Herald are omitted.
Wraith, Wide-knight queen and Hopping bishop are excluded; Hippogriff `NZ`
joins L3. The first eight openings schedule 18,656 games:

```powershell
npm.cmd run balance:v19:cross -- --out balance-results/v19-cross-level-002 --openings 8 --jobs 3
```

Use three workers alongside interactive playtesting, or four for a dedicated
run. Resume the same folder with `--openings 16`, `32` or `64` for total
coverage; completed games and intermediate reports are retained.

Select the king during setup to buy one nonroyal reserve guard. Starting the game keeps the ordinary royal king and places the guard in reserve. Click a reserve piece, then a highlighted empty square in your own half. A drop spends a turn and cannot give check; captured pieces disappear rather than refill reserves. All ordinary king safety and castling rules still apply.

## Play Fairy Stockfish

Install Node.js 20+, then run these commands in the repository folder:

```bat
npm.cmd ci
npm.cmd start
```

Open the printed address, keep the terminal running, and choose **Fairy Stockfish** under **Opponent** in Setup. Choose **Stockfish vs Stockfish** to watch from the current position; it connects paused, with **Start / Resume**, **Pause engine** and **One move** controls. The server listens only on your computer. Direct-file play supports local players and the other interface features; engine play uses this local server.

Windows uses the bundled LevelUp engine automatically. Easy / Medium / Hard are skill and search-time presets, not measured Elo ratings. Stop the server before updating the branch and restart it afterward.

An existing `FAIRY_STOCKFISH_PATH` setting takes precedence. Remove an obsolete PowerShell override with:

```powershell
Remove-Item Env:FAIRY_STOCKFISH_PATH -ErrorAction SilentlyContinue
```

For another compatible executable, set its path before starting the server:

```powershell
$env:FAIRY_STOCKFISH_PATH = 'C:\engines\fairy-stockfish.exe'
npm.cmd start
```

Linux/macOS require a compatible native build. See [engine setup and source provenance](stockfish/README.md).

## Clocks, saves and PGN

Choose untimed or a clock preset in Setup before **New game**. **Start clock** begins timed play; pause also cancels engine searches. Undo restores the beginning of the undone turn and leaves clocks paused. In self-play, Undo takes back one half-move and pauses the engine.

Files contains **Save game**, **Load saved**, **Export PGN** and **Import PGN**. Browser saves include rules, setup, play mode and clocks; loading restores the game paused. PGN transfers games and exact rules, without clocks. Imports start untimed and preserve the board if validation fails. Temporary drawing marks are not included.

Browser saves belong to the current browser and site address. Use PGN when moving between direct-file and server play. New releases may require fresh saves. Checkmate, stalemate, repetition and the fifty-move rule end games automatically; experimental low-material limits are documented in the [rules guide](variants/README.md).

## Version 19: accepted roster and tier panels

The [expanded roster 005](docs/v19-expanded-panels.md) adds **BD**, **NfhZ**,
**RcsNcfN**, **QsDsNA** and **QsHsCsZG** alongside the original choices.
For its panel, use `balance:v19:expanded --reuse ORIGINAL_PANEL` in a new
folder: eight openings need **992 new games** across the three tiers, reusing
the original roster-004 evidence. Explicit `--fresh` instead collects a full
new panel. The `balance:v19` command below still declares roster 004.
The [archived 64-opening reports](experiments/balance/results/v19-panel-64-001.sources.json)
retain the supplied outcome/material summaries; reuse needs the actual local
run folders and journals, not those reports alone.

Branch **`version_19`** starts from the **`v0.18.14`** closeout. The final
choices include L3 **NAD**, L2 **NDmW, QcC, BsR and fQ2**, and L1 **QfN/QfsN**.
The [current roster](experiments/designs/v19-roster-004.json),
[search values](experiments/designs/v19-panel-values-004.json) and
[shared 64-case book](experiments/balance/v19-panel-openings.json) are declared
before collection. Historical profiles and outcomes retain their identities.

The complete same-tier round robins use one purchase per army, paired colors,
**40k nodes only**, one engine thread and four workers. At sixteen openings the
L1/L2/L3 panels contain **1,760 / 2,112 / 2,112 games**. Start one panel at a time:

```powershell
npm.cmd run balance:v19 -- --tier 1 --out balance-results/v19-level1-roster004 --openings 16 --jobs 4
npm.cmd run balance:v19 -- --tier 2 --out balance-results/v19-level2-roster004 --openings 16 --jobs 4
npm.cmd run balance:v19 -- --tier 3 --out balance-results/v19-level3-roster004 --openings 16 --jobs 4
```

These fresh panels use revision 004, including the **Six-jump pawn**
`ifmnDfmWfceFsNfN` at L3 beside Herald and Ranger. Earlier panel folders retain
their exact owned roster. Resume with `--resume DIRECTORY`;
add `--openings 32` or `64` for total coverage. Reports retain completed
eight-case checkpoints and separate fixed-reference scores from whole-roster
averages. See the [guide](docs/version19.md) for validation and offline reports.
No scored balance campaign starts during installation or build.

Revision 002 removes the third L2 Bishop pawn and selects the tested
`QgmQ0gcBgcsR0` Wraith. The fixed Knight-pawn reference and Herald remain.
The [focused pawn/queen trials](docs/v19-pawn-queen-trials.md) add eight new
designs plus fresh controls, for **608 games** at eight openings. Use
`npm.cmd run balance:v19:trials -- --help` for the three separate studies.
Movement dots and capture rings are larger and thicker.

The [first trial results](docs/v19-focused-trials-review.md) retain all 1,664
L2/L3 games and flag Wraith's immediate post-prefix mates. A separate
[L2 pawn follow-up](docs/v19-pawn-range-followup.md) compares `fQ2` with
`mvQ2fceB2`; the same guide explains recovery of the queen trial's incomplete
runtime setup.

The [completed queen/pawn trials](docs/v19-selected-trials-review.md) add
1,152 archived games. Playable revision 003 selects **Wide-forward queen
`QfsN`** as the blue second L1 queen and **Forward-range pawn `fQ2`** as a
two-point L2 choice, retaining the fixed pawn references. These are design
choices at recorded scores of 42.19% and 56.51%; published panel declarations
and earlier game profiles retain their identities.

The playable Six-jump pawn is now red like Herald; Forward-range pawn is yellow
like the Knight pawn. Their movement, costs and archived profiles are unchanged.

New runs [record the first post-opening engine score](docs/opening-evaluations.md)
with each game and summarize it automatically in the panel/trial reports.
This reuses the normal search and keeps exact cp, bounds, mates and missing
historical observations separate.

After a panel target finishes, [fit material estimates offline](docs/v19-material-estimates.md)
with `npm.cmd run balance:v19:material -- --run PANEL_DIRECTORY --out NEW_DIRECTORY`.
This replays the saved games without engine searches. The fit assumes pawn=1
and ordinary queen=9, retains support/uncertainty checks, and excludes whole
grant-involved matchups. Grant strength remains in the outcome panel.

The separate [queen/rook follow-up](docs/v19-queen-rook-followup.md) screens
`QsNfD` / `QsNfDfH`, restricted-capture rook `RcsNcfN`, and L3 queens
`QsCfC` / `QsZfZ` / `QZAG` / `QZH` / `QC` / `QZ` against fixed references
with fresh controls.
Use `npm.cmd run balance:v19:queen-rook -- --help` after the current panel
finishes. These research studies preserve the running roster; selected
replacements would enter a separate panel with verified reuse of unchanged
matchups.

The [sideways extension](docs/v19-sideways-followup.md) adds L2 queens
`QsDsN` / `QsDsNA` / `QsNsDsH`, rooks `RcfhN` / `RcsN`, and L3 queens
`QsCsZ` / `QsHsCsZ` / `QsHsCsZG` in separate reference screens. Use
`npm.cmd run balance:v19:sideways -- --help`; earlier follow-up folders
retain their original command and definitions.

The [minor-piece trials](docs/v19-minor-followup.md) compare six L1 bishop
designs using two-square orthogonal jumps and seven L2 zebra-knight compounds
against unchanged references and controls. Use
`npm.cmd run balance:v19:minors -- --help`. The corrected forward design is
`NfhZfAfG`, with lowercase `h`; full `NZ` / `NZA` are strength checks because
their earlier L3 results were already strong.

The [completed expanded-panel reports](docs/v19-expanded-panel-review.md)
support all five alternatives for further playtesting. The separate
[puzzle workflow](docs/puzzle-generation.md) is ready: use
`npm.cmd run puzzles:mine -- --help` after the panels stop. It samples both
colors throughout completed games, verifies longer mates and bounded material
tactics, and tests whether upgraded movement matters. Material goals use a
declared counting scale, separate from fitted piece values. Builds do not
start mining or collect extra balance games.

Windows puzzle commands use `fairy-stockfish-levelup_x86-64.exe`. If a
0.19.12 run stopped with a native/archived-rules mismatch, retain its output
and follow the [new-output recovery command](docs/puzzle-generation.md#correct-the-version-01912-windows-engine-selection).

## Version 16: frozen references and playtest roster

The playable closeout with UI fixes is tagged `v0.16.7`. Mixed-army experiments belong to version 17.

These are the official three-point replacement upgrades, available in the level-three roster and historical reference workshops:

| Reference | Family | Movement |
| --- | --- | --- |
| Vanguard | Rook | `RfB` |
| Unicorn | Knight | `NC` |
| Crusader | Bishop | `BsR2nsN` |
| Amazon | Queen | `QN` |

The [reference guide](docs/official-references.md), [frozen declaration](experiments/designs/official-references-v16.json) and [standalone INI](experiments/designs/official-references-v16.ini) preserve their exact identities. New workshop candidates and reserve prices are provisional; adding them does not change the frozen references or historical evidence.

The [all-reference material fit](experiments/balance/results/reference-material-001.report.md) uses 1,534 complete paired games across all six matchups. Under assumed pawn = 1 / queen = 9, whole-piece estimates are Vanguard **7.85**, Unicorn **5.70**, Crusader **6.50** and Amazon **12.37**. These are conditional estimates, separate from purchase prices and engine evaluation values. Archived reports retain the earlier “Cruisader” spelling.

Future candidates face the frozen references. The unfinished NC–Amazon game remains unscored.

## Version 18: closed screening and interface release

Version 18 is closed at **`v0.18.14`** on **`version_18`**. Its historical
profiles and exact evidence remain available; the accepted choices move into
the [version-19 tier panels](docs/version19-plan.md).

Branch **`version_18`** begins after the **`v0.17.23`** closeout. Its new roster
replaces Knight pawn with `ifmnDfmWfceFfsNfmN` at cost two and Cataphract with
`RsCfC` at cost three. The tested search priors remain 536/592 and 2240/2413
MG/EG respectively. Version-17 profiles retain their old pieces.

Its screening work feeds the version-19 tier panels before cross-level and
mixed-budget studies. See the [closeout guide](docs/version18.md).

The [lower-tier roster and mobility screens](docs/v18-balance-roster.md) review
existing level-one evidence, test nine level-one and eight level-two candidates
against same-tier references at 40k nodes, and compare quiet-step Nightriders
and three bounded Wraith hopper designs with fresh controls at 40k/80k. Use
`npm.cmd run balance:v18 -- --study level1 --out balance-results/v18-level1 --openings 8 --jobs 4`
for the first 432 games. Choose `level2` or `mobility` with a separate output
folder for their 384 or 1,024 games. Run one study at a time. Extend with
`--study NAME --resume DIRECTORY --openings 16` (then 32 or 64); completed games
remain in their original stage journals and reports retain earlier checkpoints.
No trial changes the playable roster or historical definitions.

The first sixteen cases are [archived and reviewed](experiments/balance/results/v18-screens-001.report.md).
Run `npm.cmd run balance:review-v18` to verify the uploaded outcomes offline.
The [targeted lower-tier follow-ups](docs/v18-followup-screens.md) test `NmQ` /
`NmK`, longer-hopping bishops and a Blink queen at level one, and `NWD` / `NWH`
/ `NFA` / `NAD` plus two stronger Bishop board pawns at level two. Each trial
faces fixed same-tier references with fresh matched controls; candidate scores
do not pull one another down. Use new study folders with `--study level1-followup`
or `--study level2-followup`; original folders remain resumable through their
owned snapshots. The weak Bishop pawn is a replacement pawn; the `F` Bishop
grant remains a fixed reference.

The [completed follow-up review](docs/v18-followup-review.md) shortlists `NmQ`,
`BgB0` and the clear-range Bishop pawn for playtesting. `NFA` was the closest new
L2 knight in that follow-up, while `NWH` overshoots at two points. Blink queen remains exploratory.
The archived games and reports preserve every result; this review changes no
playable profile, reference, price or engine setting and starts no new study.
Verify the follow-up uploads with `npm.cmd run balance:review-v18-followups`.

The completed [focused L2 knight review](docs/v18-knight-review.md) selects
unchanged `N0` for level two: **54.69% overall**, with 51.56%–57.81% against
the three references. `NH` is weak and `NDH` is strong at this tier. All 480
games finished cleanly. Verify the archived uploads offline with
`npm.cmd run balance:review-v18-knights`; the old three-point Nightrider and
playable profiles retain their tested definitions.

The [current lower-tier shortlist](docs/v18-lower-tier-shortlist.md) gathers
the promising pawn, knight, bishop, rook and grant choices alongside the fixed
references. L1 now has QfN and QvN panel candidates; the remaining L2 queen
decision awaits its new-context results.

The [roster trials](docs/v18-roster-completion.md) added L1 queens `QcC`,
`QfN` and sanity comparison `QfhN`; L2 queens `QsN` / `QvN`; and L2 knights
`ND` / `NDmK`. Free Boar remained a candidate and received new reference cases.
Sixteen cases scheduled 384 L1 and 672 L2 games. Use `--study level1-queens`
or `--study level2-completion` in separate new output folders. One grant per
tier is enough; no second grant is scheduled.

The [completed roster-trial review](docs/v18-completion-review.md) favors
`QfN` (44.79%) at L1, `QsN` (47.40%) at L2 and `NDmK` (56.77%) as the
second L2 knight. Free Boar remains, with a broader strength concern at 65.56%.
The 1,056 finalized games include two unscored move-limit truncations, without
errors or retries. Verify the archived uploads with
`npm.cmd run balance:review-v18-completion`. That review left second queen
choices open; it started no new experiment or playable replacement.

The [targeted alternatives](docs/v18-prepanel-alternatives.md) test the
queen price swap, `NDmW` / `NDmF`, three shorter-sideways bishops, and seven
L3 knight compounds, including `NDH`. Sixteen cases total 2,080 games across
`prepanel-level1`, `prepanel-level2` and `prepanel-level3`; use separate new
folders. The [version-19 plan](docs/version19-plan.md) reserves same-tier
panels for 16-opening review, then cumulative 32/64 cases and finally explicit
cross-level comparisons. Wraith remains the original weaker `QgB0` design.

The [32-opening L1 queen review](docs/v18-queen32-review.md) supports keeping
QfN at **50.78%**, alongside QvN at **53.76%**. The matched 31-case difference
is only 3.49 percentage points, with a conditional range spanning zero. All
384 games are archived, including one unscored truncation; verify them with
`npm.cmd run balance:review-v18-queen32`.

The [32-opening L2/L3 review](docs/v18-prepanel32-review.md) favors NAD at L3
(51.76%, with all four matchups 50.00%–55.47%) and retains QcC and Free Boar
as viable L2 candidates (both 55.21%). Free Boar's four opening batches span
48.96%–59.38%; keep them all rather than selecting a favorable batch.
All 3,776 games are archived; verify them with
`npm.cmd run balance:review-v18-prepanel32`. Historical and playable profiles
remain separate from these roster choices.

Pre-panel screening is complete: retain **L3 NAD** and **L2 NDmW, QcC and
Free Boar BsR**. Next is roster integration and the
[version-19 tier panels](docs/version19-plan.md), starting at sixteen openings.

The [opening diagnostic](docs/opening-diagnostics.md) can inspect completed
runs or the pinned queen archive without playing new games. It reports prefix
captures and upgraded-piece survival, checks, royal-shield pins and legal
capture/recapture candidates; `--evaluate` adds optional pre/post native searches.
Use `npm.cmd run balance:opening-audit -- --archive v18-queen32-001 --out balance-results/queen-opening-audit`
for the archived example. It flags concerns without selecting a separate book
for each matchup or modifying recorded results.

## Version 17: balance experiments

Version 17 is closed at **`v0.17.23`** on branch **`version_17`**, retaining its
tested playable roster. The selected Knight-pawn and Cataphract replacements
enter playable profiles only after switching to version 18. See the
[closeout record](docs/version17-closeout.md).

The five-stage bracket campaign finished **6,752 games**; the next two studies finished another **1,152**, all without errors. The [latest review](docs/v17-roster-confirmation.md) and [archived reports](experiments/balance/results/v17-validation-001.report.md) retain opponent, opening-half and color results without pooling different purchase budgets. Scores count draws as half a point.

The selected Vertical bishop is now `BvW2vnN` (**50.00%**), and Queen pawn is `mQ2cfQ2` (**53.52%**). Retain the Rook pawn, Ranged rook, Nightrider and original diagonal-X-ray queen. The four frozen research references stay unchanged. Choose **Version 17 · Roster and king trials** to try the [current roster](docs/playtest-roster-v17.md); earlier workshops remain available.

The completed mixed-package study found a strong Knight-pawn signal: its three L1 partners scored **60.94%, 70.31% and 58.59%**. The [follow-up review](docs/v17-followup-decisions.md) selects the quiet-tall revision at **49.93%**, preserving wide knight movement and standard promotion. Its new level-two reference declaration is frozen for future campaigns; playable activation belongs to version 18.

WD is the working three-point **Warden**, scoring **55.21%**. W2 scored **66.67%** and stays a trial; its difference from WD remains uncertain, and nonchecking-drop rules affect their legal placements. The original four-point King grant remains a candidate. Current definitions and applied search priors stay frozen per run; these priors are separate from fitted material estimates and purchase prices.

Run one experiment at a time with four workers total. Game-boundary checkpoints preserve completed results and save interrupted positions on clean stops. The [historical storage-only upgrade](docs/game-checkpoints-v17.md) uses tag `v0.17.10` for unfinished version-0.17.8 campaigns; later research definitions require new run identities.

The completed [version-18 engine-sharing benchmark](docs/engine-sharing-benchmark-v18.md) found about 1.7% / 10.6% fewer games/hour with sharing at 20k / 80k. Shared searches were slightly faster per ply, but games were longer. Retain separate engines as the default; this small benchmark does not establish a whole-panel speed difference or piece-balance result.

The [complete level-three panel](docs/level3-panel-v17.md) compares all ten selected pieces at 20k/40k/80k nodes, with ordinary-army material anchors. Start with `npm.cmd run balance:level3:panel -- --out balance-results/level3-panel --openings 8 --jobs 4`, then increase the total to 16, 32 or 64 using `--resume`. Completed games remain in their original stages and append to the campaign's `games.jsonl`; matchup and material reports keep budgets separate. The [Betza convention](docs/betza-convention.md) records the exact ten definitions and tested aliases.

Check remaining game time from a second PowerShell window with `npm.cmd run balance:level3:eta -- --run balance-results/level3-panel`. It reads live stage journals without pausing the panel or starting engines; estimates keep node budgets separate and exclude material fitting and preflight.

The [final 64-opening review](docs/v17-final-panel-review.md) covers **21,120 finalized / 21,106 scored games**. The four frozen references remain healthy; use the tested `RsCfC` Cataphract revision at the next roster activation and keep Nightrider/Wraith as exploration choices. `npm.cmd run balance:review-panel-final` verifies the compact outcome archive and uploaded reports without starting games or refitting material values. Earlier snapshots remain separate historical evidence.

Earlier opening totals remain recoverable. A normally completed target already has a report in `reports/openings-32` inside the campaign. Otherwise, run `npm.cmd run balance:level3:snapshot -- --run balance-results/level3-panel --openings 32 --out balance-results/level3-panel-first32` to export the original completed stages to a separate folder while later stages continue. It starts no games and leaves the active target unchanged.

After material analysis, use the [color and exclusion reports](docs/panel-insights.md) with `npm.cmd run balance:panel:insights -- --run balance-results/level3-panel --out balance-results/panel-insights`. They reuse scored color pairs to separate piece balance from White's initiative and recompute standings with pieces excluded. The compact paired-outcome export supports later questions here or locally without transferring the full journals again.

The completed [Nightrider focus protocol](docs/nightrider-focus-v17.md) preserves its fresh `N0`, `N0cF` and `N0cW` results in an owned runtime. The requested `N0gN0` lacks a supported hopper generator in this engine. Wraith stays unchanged. `npm.cmd run balance:review-search` verifies the archived statistical review without starting games.

All **3,328 targeted follow-up games** are complete and [archived](experiments/balance/results/v17-targeted-followups-001.report.md). Quiet-tall Knight pawn is the selected level-two reference; `RsCfC` scored **49.61% / 52.34%** in its separate confirmation. Park `N0cF` at **65.63% / 62.11%** and schedule no further small-move trials now. The [closeout plan](docs/v17-followup-decisions.md) preserves version 17, then activates the selected roster in fresh version-18 profiles before mixed-bracket validation.

Current playable names are **Herald**, **Ranger**, **Cataphract**, **Inquisitor**, **Wraith**, **Warden**, **Nightrider** and **Crusader**. Historical reports keep their original labels and rule identities.

Earlier evidence remains in the [level-one acceptance review](docs/v17-acceptance-review.md), [level-two selection](docs/v17-level2-review.md), [level-three confirmation](docs/v17-level3-review.md), [mobility review](experiments/balance/results/v17-mobility-001.report.md) and [complete reference panel](experiments/balance/results/reference-panel-v17-002.panel.md). Reuse compatible outcomes and reserve further tests for repeated concerns that could change a design decision.

## Development

Use Node.js 20+. On Windows, replace `npm` with `npm.cmd`.

```sh
npm ci
npm run build
npx playwright install chromium
npm test
```

`npm run test:unit` runs unit/integration checks; `npm test` also runs browser tests with a temporary server. Native checks use `FAIRY_STOCKFISH_PATH`; `CHROMIUM_PATH` can select an installed browser.

Edit `src/`, `styles.css` and validated rules, then build. Commit the generated HTML, bundles and playable profiles together; do not edit generated files directly. Designs have immutable revisions in `src/design-catalog.js`; `src/playable-library.js` selects each library within the engine's 20-custom-type limit.

## Project guide

| Location | Purpose |
| --- | --- |
| `src/`, `styles.css`, `variants/` | App source, styles and movement profiles |
| `scripts/`, `tests-unit/`, `tests/` | Tools, unit checks and browser tests |
| `experiments/` | Declared protocols, designs and reproducible archived evidence |
| `balance-results/` | Local run folders; ignored by Git |
| `node_modules/` | Installed dependencies; ignored and recreated by `npm ci` |
| `prototypes/` | Isolated [king](prototypes/kings/README.md) and [reserve](prototypes/reserve-guards/README.md) experiments |

Previous milestones and detailed completed-study notes are in [development history](docs/development-history.md) and the [archived version-16 README](docs/archive/readme-version-16.md). Historical protocols retain their original commands and source requirements.

Standard chess uses [chess.js](https://github.com/jhlywa/chess.js), with its BSD license in `dist/chess.js-LICENSE.txt`. Upgrade rules use Fairy Stockfish; GPL notices and matching-source details are in [vendor/README.md](vendor/README.md) and [stockfish/README.md](stockfish/README.md).
