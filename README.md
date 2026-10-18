# LevelUp Chess

Chess with upgradeable pieces. Pieces start at level 0 (standard chess), then gain abilities at levels 1 (blue), 2 (orange), and 3 (purple). Each game mode will limit the total upgrade budget.

## Version 01: local chess

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

## Engine and custom rules

`stockfish/fairy-stockfish-largeboard_x86-64.exe` is a Windows command-line engine, not browser JavaScript. Version 01 does not run it. Later engine play needs a local bridge or a compatible WebAssembly build. Check upstream licensing and redistribution requirements before distributing the engine.

`Example.txt` contains draft variant rules, including unresolved pieces and setup details. It is not loaded by the game.

## Version history

Use `version_01`, `version_02`, etc. as development branches. Tag finished milestones (`v0.1.0`, `v0.2.0`) for stable checkpoints; branches can continue changing. Merge a tested milestone into `main`, then create the next branch from that commit. Avoid maintaining separate implementations for old versions.

See [TODO.md](TODO.md) for scope and later milestones.
