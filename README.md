# LevelUp Chess

Chess with upgradeable pieces. Pieces start at level 0 (standard chess), then gain abilities at levels 1 (blue), 2 (orange), and 3 (purple). Each game mode will limit the total upgrade budget.

## Local chess

Open `index.html` in a modern browser. The file includes its own styles and JavaScript: download it and open it in Chrome, Edge, or Firefox. No server, npm installation, companion files, or internet connection is needed to play. Chat previews may block interactive content; use your browser if a preview fails. Two people share the board; select a piece, then a highlighted destination. Arrow keys move focus; Enter or Space selects a square.

Includes legal moves, check/checkmate, automatic draw detection, castling, en passant, promotion choice, move history, undo, board flip, and new game. Unsaved moves reset when the page reloads; use **Save game** or **Export PGN** to keep them. Draws are automatically ended on threefold repetition or the fifty-move rule; claim-based tournament rules are outside this version.

## Optional clocks

Choose **Time control**, then start a **New game** to apply it. Available presets are untimed, 3+2, 5+0, 10+5, and 15+10: minutes per side plus seconds added after each completed move. Untimed remains the default.

- Press **Start clock** when both sides are ready. Timed games require running clocks to move. In engine mode, connect the engine first.
- **Pause clock** freezes both clocks, blocks moves, and cancels any engine search. **Resume clock** restarts the side to move and requests a fresh engine reply when needed. Engine pause/errors and changes to opponent, side, or difficulty also pause the clocks.
- Time runs while the tab is in the background and while dialogs are open. Pause before taking a break or importing a game. Promotion choice uses the promoting player's time.
- Checkmate and rule-based draws stop the clocks. Running out of time ends play and records the result in PGN; it is a draw if the opponent has only a king. Other rare position-specific inability-to-mate cases are not adjudicated.
- Undo restores the time at the beginning of the undone turn, removes that move's increment, and leaves clocks paused. Against the engine, it undoes a full pair of moves where available.
- Browser saves keep remaining time, the selected control, and clock undo history. Loads are paused and do not charge time spent away. Older saves load untimed. PGN import starts untimed because these files do not carry the app's clock state.

Changing the time-control dropdown during a game only selects the next game's preset.

## Saved games and PGN

- **Save game** stores one game in this browser, including move history, opponent, side, difficulty, board orientation, and clock state. Saving again replaces that slot.
- **Load saved** restores that slot; confirm before replacing current moves. Loading leaves the engine and clocks paused. Connect or resume when ready.
- **Export PGN** downloads a portable game file with move history, starting position, comments, and result. It does not include remaining clock times, engine settings, or display settings.
- **Import PGN** accepts pasted notation or a `.pgn` file up to 256 KB. Invalid or unsupported variant games leave the current board unchanged. Import keeps your opponent and display settings, switches to untimed play, and pauses the engine.

Saving is manual. New games, imports, and loading do not overwrite the saved slot. Saves belong to this browser and site address; private browsing, clearing site data, switching browsers, or moving between direct-file and server play can make them unavailable. If browser storage is blocked, use PGN export. Downloaded PGNs remain usable independently of browser storage.

Imported result headers (including resignation or agreed draws) are preserved on export. You can continue an imported position for analysis; making or undoing a move clears its recorded result, and checkmate or rule-based draws determine the exported result again.

## Development

Use Node.js 20 or newer. On Windows, use `npm.cmd` wherever `npm` appears below.

```sh
npm ci
npm run build
npx playwright install chromium
npm test
```

`npm test` runs clock-model unit tests, then browser tests that start a temporary local server. Set `TEST_FILE_URL=1` to test direct file loading where browser policy permits it. `npm start` also serves the game locally during development. Set `CHROMIUM_PATH` to use an existing Chromium installation instead of downloading one.

Edit `src/app.js`, `styles.css`, or `src/index.html`, then run `npm run build` and reload the page. The build generates self-contained `index.html` and `dist/app.js`; keep both committed. Do not edit the generated HTML directly. Standard chess rules use [chess.js](https://github.com/jhlywa/chess.js); its BSD license is included in `dist/chess.js-LICENSE.txt`.

## Version 02: play Fairy Stockfish

On Windows, open a terminal in the repository folder:

```bat
npm.cmd ci
npm.cmd start
```

Open the address printed in the terminal and keep that terminal running. Choose **Fairy Stockfish** under **Opponent**, then select your side and difficulty. The server launches `stockfish/fairy-stockfish-largeboard_x86-64.exe` automatically. The HTML preview and direct file mode support local two-player games; engine play requires this server.

- **Easy / Medium / Hard:** engine skill 0 / 8 / 20, with 150 / 600 / 1500 ms search budgets. These are presets, not Elo ratings.
- **Pause engine:** cancels its current search and pauses timed play. Resume the clock in a timed game, or resume the engine in an untimed game.
- **Undo move:** takes back your move and the engine reply, then pauses the engine.
- Changing opponent, side, or difficulty preserves the board and cancels any old search. **New game** resets it.
- Engine errors leave the board intact. Retry the connection or switch to a local opponent.

Node.js 20+ is required. The server binds only to the local computer and requires no cloud services or keys. If the default engine cannot run, use `FAIRY_STOCKFISH_PATH` to select a compatible native executable. For example, in PowerShell:

```powershell
$env:FAIRY_STOCKFISH_PATH = 'C:\engines\fairy-stockfish.exe'
npm.cmd start
```

Linux/macOS require an engine built for that platform. For a Linux source build, follow the upstream build instructions and set `FAIRY_STOCKFISH_PATH` to the resulting `src/stockfish`. Setting that variable during `npm test` also enables the native engine integration test; otherwise that test is explicitly skipped. Tests use mocked engine responses for deterministic UI checks and a real executable for the optional integration check.

The bridge currently supports standard chess only. `Example.txt` contains draft custom rules, including unresolved pieces and setup details; these rules are not loaded by the game. See [stockfish/README.md](stockfish/README.md) for engine provenance, licensing, and validation limits.

## Version history

`v0.1.0` preserves local chess on `version_01`; `v0.2.0` preserves engine play, saved games, and clocks on `version_02`. Use `version_01`, `version_02`, etc. as development branches. Tag finished milestones (`v0.1.0`, `v0.2.0`) for stable checkpoints; branches can continue changing. Merge a tested milestone into `main`, then create the next branch from that commit. Avoid maintaining separate implementations for old versions.

See [TODO.md](TODO.md) for scope and later milestones.
