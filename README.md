# LevelUp Chess

Chess with upgradeable pieces. Build an army within a shared per-side budget, then play locally or against Fairy Stockfish. Levels 1, 2, and 3 cost that many upgrade points.

## Play locally

Download `index.html` and open it in Chrome, Edge, or Firefox. It includes the board, styles, and rules; local two-player games need no server, npm, companion files, or internet connection. Chat previews may restrict interactive content, so open the downloaded file directly.

Select a piece and a highlighted destination. Arrow keys move focus; Enter or Space selects. Includes legal moves, checkmate, draw detection, castling, en passant, selectable promotion, history, undo, and board flip. Threefold repetition and the fifty-move rule end games automatically.

## Version 12: piece workshop and balance

Under **Rules**, choose **Experiments · Mobility and pairs**, select each starting piece's design, then press **New game**. Each side has a 1–6 point budget. Levels use green, cyan, and red accents, with level numbers and separate White/Black piece colors.

New alternatives:

| Purchase | Cost | Movement |
| --- | --- | --- |
| Twin pawns | 2 | Two pawns for one purchase. Each moves one square forward or jumps two, and captures diagonally forward. |
| Camel knight | 3 | Knight moves plus camel jumps: three squares in one direction and one at right angles (`NC`). |
| Sideways bishop | 3 | Bishop moves, quiet horizontal slides up to two squares, and jumps two files sideways and one rank forward or backward. |
| Blink rook | 3 | Rook moves and captures; also jumps quietly to any empty square within three squares horizontally and vertically. |
| Twin short queens | 3 | Replace the queen with two queens, each limited to two clear squares in any queen direction. |
| Queen and companion | 3 | Keep the normal queen and add a capturable companion with one-square king movement. Only the ordinary king is royal. |

Extra queens start on their own second rank and push that file's own pawns forward within their half. The **Knight and guard** uses the same insertion rule. Purchase cost is counted once for a pair; the board summary counts surviving units. Pawn units promote to standard Q/R/B/N, and upgraded rooks can castle normally.

**Experiments · First prototypes** keeps the previous 20-design library, including the original three-point Twins. Each library fits the engine's 20 custom-type limit. Switching libraries keeps shared draft choices and clears unavailable choices; the current board changes only through **New game**. Use **Clear White**, **Clear Black**, or **Clear both** to reset draft armies across all families.

Both libraries support offline play, the local engine, clocks, undo, saves, and PGN. Saves and exports identify their exact library; imports validate the bundled snapshot and every move. New releases may require fresh games.

Experimental games draw bare kings, stalemate, repetition, and the fifty-move rule. Other low-material endings stay playable, with checkmate taking priority. Reversible quiet pawn moves count toward the fifty-move limit; see [exact pawn rules](variants/README.md#experimental-pawn-special-rules).

The Camel knight is now level 3 after playtesting; its movement remains `NC`, without extra diagonal steps. The [design notes](DESIGN.md#version-12-level-3-comparison) record the decision and further ideas. Prices remain provisional while the declared comparison batch measures relative upgrade strength.

## Reference piece upgrades

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

## Level-3 balance experiment

The [declared campaign](experiments/balance/level3-plan.md) compares 14 selected nonroyal level-3 purchases, including the Camel knight and Amazon, on otherwise ordinary armies. Its round robin schedules **1,860 games**; one selected confirmation stage can use at most **140 more**, within the **2,000-game cap**. Kings need a separate test because the current revision profiles use ordinary royals.

On Windows, run:

```bat
npm.cmd run balance:level3 -- --check
npm.cmd run balance:level3 -- --stage screen --out balance-results/level3-round-robin
```

The check validates both opening cohorts and native movement without playing games. Search stays at 100,000 nodes, Skill 20, one thread, 32 MB hash, and 400 plies. After the first 10–20 games, press **p** to finish the current pair and check the recorded timings before continuing:

```bat
npm.cmd run balance:level3 -- --report balance-results/level3-round-robin
npm.cmd run balance:level3 -- --resume balance-results/level3-round-robin
```

The report produces a matchup matrix, standings, completion counts, control diagnostics, and a rough runtime estimate. Standings compare upgrade purchases under this protocol; they are not material values or piece Elo. Do not use `--limit-pairs` as an extendable pilot: it permanently shortens the recorded schedule.

Controls give both engines identical armies. Their paired A score is usually 50% by construction, even when White wins both games. Check White's results, draw rates, errors, truncations, and timings; a 50% control score does not establish balance or correct movement. See [BALANCE.md](BALANCE.md) for interpretation, controls, and the single optional confirmation stage.

The first revision remains closed at 160 of its 200-game cap; its [results and decisions](experiments/balance/results/revision-1-rook-confirmation-001.md) remain historical evidence. Version 11 preserves the preceding workshop. See [TODO.md](TODO.md) for current progress.

## Play Fairy Stockfish

Install Node.js 20+, then run these commands in the repository folder on Windows:

```bat
npm.cmd ci
npm.cmd start
```

Open the printed address, keep the terminal running, and choose **Fairy Stockfish** under **Opponent**. Select your side and difficulty. The server launches the bundled LevelUp Windows engine, built from the same source revision as the browser rules. Direct-file play supports local players only.

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

Experimental behavior lives in immutable revisions in `src/design-catalog.js`. The explicit groups in `src/playable-library.js` select two 20-design libraries from 29 catalog entries. The build uses the balance compiler to generate `src/playable-profile.json`, `src/playable-reference-profile.json`, and their matching INIs in `variants/`; commit these outputs and do not edit them directly. Letters are fixed within each profile and may mean different designs in different libraries.

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
| `version_12` | In development | Level-3 Camel knight and capped all-design balance campaign |

Create each development branch from the previous tested milestone and tag finished releases. Tags preserve stable checkpoints while branches can evolve. See [TODO.md](TODO.md) for progress and later work.

Piece design candidates are discussed in [DESIGN.md](DESIGN.md). See [BALANCE.md](BALANCE.md) for the implemented testing protocol.
