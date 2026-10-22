# LevelUp Chess

Chess with upgradeable pieces. Build an army within a shared per-side budget, then play locally or against Fairy Stockfish. Levels 1, 2, and 3 cost that many upgrade points.

## Play locally

Download `index.html` and open it in Chrome, Edge, or Firefox. It includes the board, styles, and rules; local two-player games need no server, npm, companion files, or internet connection. Chat previews may restrict interactive content, so open the downloaded file directly.

Select a piece and a highlighted destination. Arrow keys move focus; Enter or Space selects. Includes legal moves, checkmate, draw detection, castling, en passant, selectable promotion, history, undo, and board flip. Threefold repetition and the fifty-move rule end games automatically.

## Version 15: paired design alternatives

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

## Amazon comparison: 1,120 games

The [paired-alternatives plan](experiments/balance/amazon-alternatives-plan.md) compares these 12 designs with the unchanged Amazon. Each gets 40 color-swapped opening pairs / 80 games. Ordinary and Amazon self-play controls add 160 games, for **1,120 scheduled games** within the 1,200-game budget. No follow-up stage starts automatically.

On Windows:

```bat
npm.cmd run balance:alternatives -- --check
npm.cmd run balance:alternatives -- --out balance-results/amazon-alternatives --jobs 2
```

The check validates armies, opening prefixes, and native movement without playing games. Search stays at 100,000 nodes per move, Skill 20, one thread per engine, 32 MB hash, and 400 plies. Start with two game workers; runtime depends on CPU and memory. Press **p** to stop each worker after its active color pair, then inspect or resume:

```bat
npm.cmd run balance:alternatives -- --report balance-results/amazon-alternatives
npm.cmd run balance:alternatives -- --resume balance-results/amazon-alternatives
```

Aim for **40%–60% point score** against the Amazon: one point per win and half per draw. The report compares alternatives' distance from 50% on shared fully scored openings; small differences remain inconclusive. This is a practical design target, not proof of equal strength or material value. Combine the results with readability, enjoyment, and counterplay. Keep rules and settings fixed during the run; unchanged earlier candidates are not retested as subjects.

Finished games name the winner and its color, then show the running matchup points and win/draw/loss counts. Add `--log plies` for move progress. Scores exclude truncations and errors; formal comparisons use complete color pairs. Controls check scoring and completion, and a 50% control score alone does not establish balance. See [BALANCE.md](BALANCE.md) for interpretation.

This replaces the version-14 540-game plan as the next design batch. Its files and branch remain preserved. If that run has already started, keep its directory and matching build separate; do not combine journals or resume it under changed rules.

The version-12 campaign closed early at 1,508 of 1,860 finalized scheduled games, with 1,507 completed games, one truncation, and two failed attempts. Its reserved confirmation stage is unused. The [audit and design decisions](experiments/balance/results/level3-screen-001.md) distinguish the newer summary from the earlier standings snapshot; no final ranking is assigned.

Reusable `balance:prepare` and `balance:parallel` tools remain available for other declared experiments. See the [future-run guide](docs/balance-tools.md). Historical configurations are preserved evidence, not an automatic test queue.

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
| `version_15` | Current workshop | Paired alternatives and one 1,120-game Amazon comparison |

Create each development branch from the previous tested milestone and tag finished releases. Tags preserve stable checkpoints while branches can evolve. See [TODO.md](TODO.md) for progress and later work.

Piece design candidates are discussed in [DESIGN.md](DESIGN.md). See [BALANCE.md](BALANCE.md) for the implemented testing protocol.
