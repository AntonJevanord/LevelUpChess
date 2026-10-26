# LevelUp Chess

Chess with upgradeable pieces. Build an army within a shared per-side budget, then play locally or against Fairy Stockfish. Levels 1, 2, and 3 cost that many upgrade points.

## Play locally

Download `index.html` and open it in Chrome, Edge, or Firefox. It includes the board, styles, and rules; local two-player games need no server, npm, companion files, or internet connection. Chat previews may restrict interactive content, so open the downloaded file directly.

Select a piece and a highlighted destination. Arrow keys move focus; Enter or Space selects. Includes legal moves, checkmate, draw detection, castling, en passant, selectable promotion, history, undo, and board flip. Threefold repetition and the fifty-move rule end games automatically.

## Playable design alternatives

Under **Rules**, choose **Experiments · Design alternatives**, select each starting piece's design, then press **New game**. Each side has a 1–6 point budget. Levels use green, cyan, and red accents, with level numbers and separate White/Black piece colors.

Compare two three-point designs in each group, guided by the [early-closed level-3 screen](experiments/balance/results/level3-screen-001.md):

| Group | Alternatives |
| --- | --- |
| Ranging / Courier pawn | Ranging can retreat and captures up to two diagonal squares; Courier cannot retreat but captures any clear distance diagonally forward. Both use quiet rook lines. |
| Rank pawn | Wide forward knight jumps, or those plus wide forward camel jumps. Both jumps move and capture. |
| Vertical bishop | Quiet jumps to all knight squares, or moves/captures on the four tall knight jumps. Both retain bishop and vertical rook movement. |
| Sideways bishop | Horizontal rook movement of up to two squares, or unlimited range. Both retain bishop moves and wide knight jumps. |
| Blink rook | Diagonal captures of one square, or up to two clear squares. Both retain rook moves and quiet jumps within three squares. |
| Queen and companion | The extra companion captures only diagonally, or only forward and sideways. Both move quietly like a king and keep the ordinary queen. |

These are balance candidates. The Amazon, Camel knight (`NC`), Knight and guard, Knight-capture rook, and Returning pawn stay unchanged. Capture-box rook is retired from the active workshop, and Twin short queens are parked at level 3. Earlier definitions remain available through archived profiles and branches.

Extra companions and guards start on their own second rank and push that file's own pawns forward within their half. Two-point Twin pawns remain available; purchase cost is counted once for a pair, while the board summary counts surviving units. Every pawn unit promotes to standard Q/R/B/N, and upgraded rooks can castle normally.

The **Rebalance workshop** and **First prototypes (archive)** libraries preserve their earlier rules. Each library fits the engine's 20 custom-type limit. Switching libraries keeps shared draft choices and clears unavailable choices; **New game** applies the draft. Use **Clear White**, **Clear Black**, or **Clear both** to reset draft armies across all families.

All three libraries support offline play, the local engine, clocks, undo, saves, and PGN. Saves and exports identify their exact library; imports validate the bundled snapshot and every move. New releases may require fresh games.

Experimental games draw bare kings, stalemate, repetition, and the fifty-move rule. Other low-material endings stay playable, with checkmate taking priority. See [exact pawn rules](variants/README.md#experimental-pawn-special-rules) and the [design decisions](DESIGN.md#version-15-paired-alternatives).

## Historical reference piece upgrades

Choose **Piece upgrades** under **Rules**, select each piece's level, and press **New game**. Configure pawns, knights, bishops, rooks, and queens with the family selector; choices across families are kept. Each level costs that many points, with the same chosen limit of 1–45 points for each side.

- **Knights:** blue adds a quiet orthogonal step; orange adds a two-square sideways jump; purple keeps the normal knight and adds a piece that moves or captures one or two squares orthogonally. Two-square moves jump over blockers.
- **Pawns:** blue gains forward jumps; orange moves and captures forward or diagonally forward; purple moves along clear rook lines and captures along clear bishop lines. All pawn levels promote to a standard queen, rook, bishop, or knight.
- **Bishops:** blue adds a quiet orthogonal step; orange adds capture-only jumps two squares forward and one sideways; purple adds vertical rook movement and replaces the starting bishop.
- **Rooks:** blue adds quiet two-square orthogonal jumps on the home two ranks; orange can capture across exactly one intervening piece; purple adds jump-captures anywhere within two squares horizontally and vertically. All levels retain ordinary rook moves and castling.
- **Queens:** blue adds quiet (1,2), (1,3), and (2,3) jumps on the home two ranks; orange adds quiet knight jumps everywhere; purple adds full knight moves and captures.

Home ranks mean ranks 1–2 for White and 7–8 for Black. Conditional jumps depend on the piece's current square, so returning home restores them. Kings remain royal, with standard movement, check, and checkmate. Upgrade choices apply to the next new game.

**Version 04 piece rules** and **Version 03 knight rules** preserve earlier games, budgets, and movement. Offline play, clocks, undo, saves, and PGN support all three profiles. See [variants/README.md](variants/README.md) for exact movement and compatibility rules.

## Version 06: king prototype

Open [prototypes/kings/index.html](prototypes/kings/index.html) to try the capture-only king designs offline, or run `npm.cmd start` and open `http://127.0.0.1:4173/prototypes/kings/index.html`. Blue adds sideways two-square capture jumps, orange adds forward/backward captures, and purple adds diagonal captures. Ordinary quiet king movement remains unchanged.

Both kings use the selected level, and other pieces use standard chess rules. This separate local-play board includes practice positions, FEN loading, undo, and promotion choices. Bringing king choices into the main board's setup, engine play, and saves remains integration work. See the [prototype guide](prototypes/kings/README.md).

## Version 16: simple-piece comparison

The [simple-piece experiment](experiments/balance/simple-reference-plan.md) compares `BsR`, `RB`, `RfB` and `RB2` against Amazon (`QN`) and Camel knight (`NC`). It runs **3,072 new games with four jobs**: 2,048 head-to-head games and 1,024 ordinary-army games, reusing the original 2,688 reference records.

```bat
npm.cmd run material:simple -- --out balance-results/simple-references --jobs 4
```

Use a new folder; no opening-book download is needed. Reports at 768 / 1,536 / 3,072 new games print ordinary P/N/B/R/Q estimates, the queen–rook gap and upgrade bonuses. P=1/Q=9 are assumed anchors. Only the queen-moving rook receives ordinary-queen native values; the others retain automatic values. See the [guide](experiments/balance/simple-reference-plan.md) for stop/resume and offline reporting.

## Completed four-reference comparison

The [four-reference review](experiments/balance/results/reference-panel-001.md) closes the study at **2,688 scheduled games**: 2,687 completed, one unscored move-limit truncation, no errors. All 301,770 recorded plies replay, and the dataset and report reproduce exactly.

```bat
npm.cmd run material:references -- --report balance-results/reference-panel
```

Camel knight scores 51.18% against Amazon. The bishop is strong across the basket, while the rook trails all three opponents. Material estimates give useful context, but equivalence between ordinary/single and head-to-head estimates remains inconclusive at ±0.5 pawn. Keep this run closed; no repeat is needed.

The [4,608-game revision report](experiments/balance/results/reference-revisions-001-review.md) is also complete. Preserve its results; its original collector identity matches commit `f963a32`. The simple-piece experiment is a new collection with separate profiles and output files.

The completed reference audit's original whole-file source hashes match commit `1658cc4`. Reproduce that historical audit on its matching checkout; additive candidate definitions in current source files intentionally change their hashes.

## Completed material estimate study

The [1,152-game study](experiments/balance/results/material-study-001.md) is complete: all games finished without errors or truncations, and all 126,924 plies replay correctly. Under the assumed pawn = 1 / queen = 9 scale, the combined estimates are knight 2.88, bishop 3.04, rook 4.78 and Amazon 12.84, including an upgrade bonus of 3.84 (conditional range 3.37–4.38).

```bat
npm.cmd run material:study -- --report balance-results/material-study
```

More data substantially improved stability; residual cohort and phase effects remain. Use the result for rough comparisons in this context. The study is closed at its declared cap; no repeat or extension is needed. Original files, checkpoint estimates and the reproducible offline audit are preserved in the [review](experiments/balance/results/material-study-001.md). Engine values and purchase prices remain unchanged.

## Completed matched material-data pilot

The [96-game pilot](experiments/balance/material-collection-plan.md) is complete: all games finished without errors or truncations, and all 10,639 recorded plies replay correctly. The [audit](experiments/balance/results/material-collection-001.md) verifies the recorded sources, engine and rules; it retains 881 samples without adopting material prices.

```bat
npm.cmd run material:collect -- --report balance-results/material-data-pilot
```

Use your actual result directory. Terminal cleanup now releases keyboard input so completed commands exit normally. Existing games need no rerun; offline reporting preserves their manifest. The [plan](experiments/balance/material-collection-plan.md) retains reproduction commands and frozen identities. No larger batch starts automatically.

The separate [pawn-1/queen-9 anchor review](experiments/balance/results/material-collection-001-anchors.md) gives conditional knight/bishop/rook estimates of 3.12/3.01/3.68 and an Amazon bonus of 2.82. The rook remains sensitive to the cohort; original reports and engine values are unchanged.

## Closed material-compensation pilot

The [audited pilot](experiments/balance/results/material-pilot-001.md) contains 256 control games and the first 64 Amazon games. All games replay correctly. The queen-favored control side still scores **89.84% after four pawn removals** and **82.81% after five**, so the tested range never brackets compensation.

The control does not validate a conventional material scale. The Amazon's preliminary crossing of about 4.6 removed starting pawns cannot establish a +460-cp upgrade bonus. Removing many pawns changes development, king cover, targets and promotion; the control and Amazon armies also differ in queen presence. More samples would not remove those setup effects.

The batch is **closed at 320 games**. Leave the remaining 192 unused. The [original protocol](experiments/balance/material-estimate-plan.md), commands and snapshots remain preserved for reproduction. The separate collection pilot above follows the [balancing strategy](docs/balancing-strategy.md); it does not extend this compensation experiment.

The [offline regression diagnostic](experiments/balance/results/material-regression-001.md) reuses those games: 3,071 eligible positions, draws retained and validation grouped by related openings. It predicts their outcomes but does not establish transferable material prices. Reproduce it without an engine or new games:

```bat
npm.cmd run balance:regression -- --out balance-results/material-regression
```

Use a new output directory. The command saves the dataset, samples, grouped validation, conditional ranges and reproducibility hashes. See the [method and options](docs/material-regression-review.md#offline-command).

The [ordinary-control follow-up](experiments/balance/results/material-controls-001.md) is also complete: 80 records collapse to 40 distinct histories. Their ordinary-material fit is unsuitable for pricing, and retained positions contain no Amazon-count imbalance. Reproduce that bounded check with `--dataset controls`; it starts no match games.

The [supplied EPD audit](experiments/balance/results/material-epd-001.md) independently reproduces queen 8.40 and rook 4.74 from 605 recorded games. Whole-game uncertainty is much wider than position-level errors. Preserve this provisional legacy baseline separately from the new matched collection; their generation identities and settings differ.

For external Python runs, use the exact same filename for generation and fitting: `baseline-chess.epd` and `baseline_chess.epd` are different files. Give each settings combination its own output file; compare input hashes, position counts and game counts before interpreting repeated estimates as convergence. The project's optional EPD audit prints these input details.

## Completed Blink evaluation check

The [400-game plan](experiments/balance/rook-values-plan.md) compares the same three Blink movements under two engine evaluation policies: automatic values and a manual **eight-point whole-rook target**. Eight comes from ordinary rook ≈5 plus three upgrade levels; it is a judgment supplied to the engine, not a measured piece value. The test includes quiet-only Blink alongside the adjacent-diagonal and two-square-diagonal versions. Movement and three-point purchase prices stay unchanged.

Manual values apply to this balance experiment. The playable board continues using automatic values.

The [completed 400-game comparison](experiments/balance/results/rook-values-comparison-001.md) includes 200 games per policy: three Blink designs versus Amazon, plus ordinary and Amazon controls, over 20 color-swapped opening pairs. Quiet Blink scored **46.25% → 15%**, adjacent-capture Blink **85% → 76.25%**, and long-diagonal Blink **88.75% → 85%**. The value assumption matters, especially for Quiet Blink; neither policy establishes intrinsic strength. No repeat or extension is needed.

Generate the combined report from the existing local campaign:

```bat
npm.cmd run balance:rook-values -- --report balance-results/rook-values
```

The report uses shared fully scored openings. The [original plan](experiments/balance/rook-values-plan.md) retains check/run/resume commands for reproduction with matching sources and engine. Keep old result directories with their matching build.

The [balancing strategy](docs/balancing-strategy.md) separates engine calibration, upgrade strength and purchase cost. Keep the current playable prototypes; automatic values remain the browser default without being certified as correct. The closed material pilot used unchanged ordinary/Amazon evaluation.

## Completed Amazon comparison: 1,120 games

The [completed version-15 batch](experiments/balance/results/amazon-alternatives-001.md) reports 1,119 completed games, one truncation, and no errors. Ranging, Rank without camel jumps, and quiet-jump Vertical are near the practical 40%–60% point-score target. Short Sideways and the diagonal companion narrowly miss it; both Blink rooks overshoot. The [game-record audit](experiments/balance/results/amazon-alternatives-001-audit.md) confirms every move and identifies the Blink valuation confound motivating version 16.

The [original plan](experiments/balance/amazon-alternatives-plan.md) and `balance:alternatives` command remain preserved. Reproduce or resume its games only on the original `version_15` checkout with its matching engine; no replay or extra stage is needed. Keep version-14 and version-15 result directories separate from the new evaluation campaign.

The version-12 round robin also closed early; its reserved confirmation stage is unused. See [the audit and design decisions](experiments/balance/results/level3-screen-001.md). Reusable `balance:prepare` and `balance:parallel` tools are documented in [the tool guide](docs/balance-tools.md); historical configurations are evidence, not an automatic queue.

## Play Fairy Stockfish

Install Node.js 20+, then run these commands in the repository folder on Windows:

```bat
npm.cmd ci
npm.cmd start
```

Open the printed address, keep the terminal running, and choose **Fairy Stockfish** under **Opponent**. Select your side and difficulty. The server launches the bundled LevelUp Windows engine, using the same movement profiles as the browser board. Direct-file play supports local players only.

- Easy / Medium / Hard use skill 0 / 8 / 20 and 150 / 600 / 1500 ms search budgets. These are presets, not Elo ratings.
- Pause cancels the current search. Undo takes back a full turn where available and pauses play. Changing opponent, side, or difficulty preserves the board and cancels obsolete searches.
- Engine errors preserve the game. Before searching, the bridge checks the custom abilities needed by the army. An incompatible executable reports the missing ability; choose the bundled engine or a compatible replacement.

The current branches include the version 05 engine fix. Stop the server before updating your branch, then restart with `npm.cmd start`. No engine download or path setting is required on Windows. If an earlier `FAIRY_STOCKFISH_PATH` override still selects an old executable, update it or remove it before restarting; in PowerShell, use `Remove-Item Env:FAIRY_STOCKFISH_PATH -ErrorAction SilentlyContinue`.

The server listens only on your computer and needs no cloud services or keys. Linux/macOS require a compatible native engine. Set `FAIRY_STOCKFISH_PATH` to use another executable; for example, in PowerShell:

```powershell
$env:FAIRY_STOCKFISH_PATH = 'C:\engines\fairy-stockfish.exe'
npm.cmd start
```

Browser and native engines load the same variant configurations. See [stockfish/README.md](stockfish/README.md) for the bundled engine's source, build instructions, and validation limits.

## Clocks

Choose untimed, 3+2, 5+0, 10+5, or 15+10, then start a **New game**. Numbers mean minutes per side plus seconds added after a move. Untimed is the default.

- **Start clock** begins play; timed games require running clocks to move. Connect the engine first in engine mode.
- Pause stops both clocks, blocks moves, and cancels the search. Resume restarts the side to move. Engine errors and play-setting changes also pause clocks.
- Time continues in background tabs and dialogs, including promotion choice. Pause before taking a break.
- Checkmate and rule-based draws stop clocks. Timeout ends play; it is a draw if the opponent has only a king. Other position-specific inability-to-mate cases are not adjudicated.
- Undo restores time from the beginning of the undone turn and leaves clocks paused. Saves preserve remaining time and clock history; loads stay paused. PGN imports start untimed.

## Save and share

- **Save game** manually replaces one browser slot with the game, rules, setup, play settings, and clocks.
- **Load saved** confirms before replacing current moves, then leaves the engine and clocks paused.
- **Export PGN** downloads moves, starting position, rules, and result. It excludes clock and display settings. Upgrade games export the main line without comments.
- **Import PGN** accepts pasted text or a `.pgn` file up to 256 KB. Invalid or unsupported games leave the board intact. Imports keep opponent/display settings, start untimed, and pause the engine.

New games, imports, and loads do not overwrite the saved slot. Browser saves belong to the current browser and site address; moving between direct-file and server play may hide them. Use PGN to transfer games or when storage is unavailable.

Imported results are preserved on export. Making or undoing a move clears a recorded result for analysis; checkmate and rule-based draws determine it again.

## Development

Use Node.js 20+. On Windows, replace `npm` with `npm.cmd`.

```sh
npm ci
npm run build
npx playwright install chromium
npm test
```

Edit `src/`, `styles.css`, or validated files in `variants/`, then build and reload. Commit generated `index.html` and `dist/app.js`; do not edit generated HTML. `npm start` serves the game locally.

Experimental behavior lives in immutable revisions in `src/design-catalog.js`. The explicit groups in `src/playable-library.js` select libraries within the engine's 20 custom-type limit. The build uses the balance compiler to generate the three `src/playable-*-profile.json` / `src/playable-profile.json` files and matching INIs in `variants/`; commit these outputs and do not edit them directly. Letters are fixed within each profile and may mean different designs in different libraries.

`npm test` runs unit and browser tests using a temporary server. Set `FAIRY_STOCKFISH_PATH` to enable native integration checks, `CHROMIUM_PATH` to use an installed browser, or `TEST_FILE_URL=1` to test direct-file loading where browser policy permits.

Standard chess uses [chess.js](https://github.com/jhlywa/chess.js), with its BSD license in `dist/chess.js-LICENSE.txt`. Browser upgrade rules use Fairy Stockfish; matching source and GPL notices are documented in [vendor/README.md](vendor/README.md). `Example.txt` is a design draft, not the active rules configuration.

## Versions

| Branch | Stable tag | Milestone |
| --- | --- | --- |
| `version_01` | `v0.1.0` | Local standard chess |
| `version_02` | `v0.2.0` | Engine play, saves, PGN, and clocks |
| `version_03` | `v0.3.0` | Three knight upgrade levels |
| `version_04` | `v0.4.0` | Improved purple knight, pawns, bishops, and queens |
| `version_05` | `v0.5.1` | Home-rank abilities, blue queen, rook upgrades, and compatible Windows engine |
| `version_06` | `v0.6.0` | Capture-only king prototype |
| `version_07` | Preserved baseline | Automated balance experiments and recorded first results |
| `version_08` | Preserved checkpoint | Design registries and the first bounded balance revision |
| `version_09` | Preserved checkpoint | Shared playable profiles and the first 17-design picker |
| `version_10` | Preserved checkpoint | Army reset controls, pawn candidates, and own-file deployment |
| `version_11` | Preserved checkpoint | Selectable libraries, mobility alternatives, and queen pairs |
| `version_12` | Closed early | Level-3 Camel knight and capped all-design balance campaign |
| `version_13` | Preserved tools | Parallel balance games, quieter output, and roster-based preparation |
| `version_14` | Preserved workshop | Seven new revisions and a capped Amazon comparison |
| `version_15` | Completed batch | Paired alternatives, 1,120-game Amazon comparison and replay audit |
| `version_16` | Current evaluation check | Consistent manual values and a bounded three-Blink policy comparison |

Create each development branch from the previous tested milestone and tag finished releases. Tags preserve stable checkpoints while branches can evolve. See [TODO.md](TODO.md) for progress and later work.

Piece design candidates are discussed in [DESIGN.md](DESIGN.md). See [BALANCE.md](BALANCE.md) for the implemented testing protocol.
