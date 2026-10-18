# LevelUp Chess

Chess with upgradeable pieces. Pieces start at level 0 (standard chess), then gain abilities at levels 1 (blue), 2 (orange), and 3 (purple). Each game mode will limit the total upgrade budget.

## Local chess

Open `index.html` in a modern browser. The file includes its own styles and JavaScript: download it and open it in Chrome, Edge, or Firefox. No server, npm installation, companion files, or internet connection is needed to play. Chat previews may block interactive content; use your browser if a preview fails. Two people share the board; select a piece, then a highlighted destination. Arrow keys move focus; Enter or Space selects a square.

Includes legal moves, check/checkmate, automatic draw detection, castling, en passant, promotion choice, move history, undo, board flip, and new game. Games are held in memory and reset when the page reloads. Draws are automatically ended on threefold repetition or the fifty-move rule; claim-based tournament rules are outside this version.

## Development

Use Node.js 20 or newer. On Windows, use `npm.cmd` wherever `npm` appears below.

```sh
npm ci
npm run build
npx playwright install chromium
npm test
```

Tests start a temporary local server. Set `TEST_FILE_URL=1` to test direct file loading where browser policy permits it. `npm start` also serves the game locally during development. Set `CHROMIUM_PATH` to use an existing Chromium installation instead of downloading one.

Edit `src/app.js`, `styles.css`, or `src/index.html`, then run `npm run build` and reload the page. The build generates self-contained `index.html` and `dist/app.js`; keep both committed. Do not edit the generated HTML directly. Standard chess rules use [chess.js](https://github.com/jhlywa/chess.js); its BSD license is included in `dist/chess.js-LICENSE.txt`.

## Version 02: play Fairy Stockfish

On Windows, open a terminal in the repository folder:

```bat
npm.cmd ci
npm.cmd start
```

Open the address printed in the terminal and keep that terminal running. Choose **Fairy Stockfish** under **Opponent**, then select your side and difficulty. The server launches `stockfish/fairy-stockfish-largeboard_x86-64.exe` automatically. The HTML preview and direct file mode support local two-player games; engine play requires this server.

- **Easy / Medium / Hard:** engine skill 0 / 8 / 20, with 150 / 600 / 1500 ms search budgets. These are presets, not Elo ratings.
- **Pause engine:** cancels its current search. Resume to request a fresh move.
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

The local `v0.1.0` tag preserves the playable foundation on `version_01`; development continues on `version_02`. These references have not been pushed. Use `version_01`, `version_02`, etc. as development branches. Tag finished milestones (`v0.1.0`, `v0.2.0`) for stable checkpoints; branches can continue changing. Merge a tested milestone into `main`, then create the next branch from that commit. Avoid maintaining separate implementations for old versions.

See [TODO.md](TODO.md) for scope and later milestones.
