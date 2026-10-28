# LevelUp Chess

Chess with upgradeable pieces. Build an army within a shared budget, then play locally or against Fairy Stockfish. Purchase costs equal the displayed levels; they are not material values.

## Play locally

Download `index.html` and open it in Chrome, Edge or Firefox. It contains the board, styles and rules; two local players need no server or internet connection. Open the downloaded file directly if a chat preview restricts interaction.

Select a piece and a highlighted destination. Arrow keys move focus; Enter or Space selects. The board supports legal moves, checkmate, castling, en passant, promotion, history, undo and board flip.

Under **Rules**, choose **Version 17 · King workshop** or another family workshop. Click a starting piece to choose its upgrade beside the board, then press **Start game**. **Edit armies** reopens setup; **Return to game** keeps the current game. Changes apply only when starting a game. **Clear White**, **Clear Black** and **Clear both** reset draft armies.

Current libraries allow a 1–9 point budget per side. Each includes the four frozen references and nine king grants; family workshops add pawn, knight, bishop, rook or queen candidates within the engine's 20-custom-piece limit. **Version 17 · Pawn workshop** includes the one-point Two-step and King-step pawns. Every Version 17 workshop gives the one-point Pawn grant quiet forward-diagonal steps. See the [current playtest guide](docs/playtest-roster-v17.md). Version 16 and earlier libraries retain their original rules and budgets.

Select the king during setup to buy one nonroyal reserve guard. Starting the game keeps the ordinary royal king and places the guard in reserve. Click a reserve piece, then a highlighted empty square in your own half. A drop spends a turn and cannot give check; captured pieces disappear rather than refill reserves. All ordinary king safety and castling rules still apply.

## Play Fairy Stockfish

Install Node.js 20+, then run these commands in the repository folder:

```bat
npm.cmd ci
npm.cmd start
```

Open the printed address, keep the terminal running, and choose **Fairy Stockfish** under **Opponent**. The server listens only on your computer. Direct-file play supports local players; engine play uses this local server.

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

Choose untimed or a clock preset before **New game**. **Start clock** begins timed play; pause also cancels engine searches. Undo restores the beginning of the undone turn and leaves clocks paused.

**Save game** stores one browser slot, including rules, setup and clocks. **Load saved** restores it paused. **Export PGN** and **Import PGN** transfer games and exact rules; PGN excludes clocks. Imports start untimed and preserve the board if validation fails.

Browser saves belong to the current browser and site address. Use PGN when moving between direct-file and server play. New releases may require fresh saves. Checkmate, stalemate, repetition and the fifty-move rule end games automatically; experimental low-material limits are documented in the [rules guide](variants/README.md).

## Version 16: frozen references and playtest roster

The playable closeout with UI fixes is tagged `v0.16.7`. Mixed-army experiments belong to version 17.

These are the official three-point replacement upgrades, available in every new playtest library:

| Reference | Family | Movement |
| --- | --- | --- |
| Vanguard | Rook | `RfB` |
| Unicorn | Knight | `NC` |
| Cruisader | Bishop | `BsR2nsN` |
| Amazon | Queen | `QN` |

The [reference guide](docs/official-references.md), [frozen declaration](experiments/designs/official-references-v16.json) and [standalone INI](experiments/designs/official-references-v16.ini) preserve their exact identities. New workshop candidates and reserve prices are provisional; adding them does not change the frozen references or historical evidence.

The [all-reference material fit](experiments/balance/results/reference-material-001.report.md) uses 1,534 complete paired games across all six matchups. Under assumed pawn = 1 / queen = 9, whole-piece estimates are Vanguard **7.85**, Unicorn **5.70**, Cruisader **6.50** and Amazon **12.37**. These are conditional estimates, separate from purchase prices and engine evaluation values.

Future candidates face the frozen references. The unfinished NC–Amazon game remains unscored.

## Version 17: balance experiments

The initial screens and follow-ups completed **2,912 games**. The [combined report](experiments/balance/results/v17-followup-001.report.md) gives sixteen-start matchup percentages for fourteen level-3 designs, plus pawn/grant results. The [second-screen review](docs/version17-second-review.md) records design recommendations and unresolved matchups. Research alternatives do not yet change the playable workshops.

The [initial protocols](docs/version17-experiments.md) and [follow-up commands](docs/version17-followups.md) remain available. `balance:v17:review` combines compatible first- and second-batch outcomes without rerunning games. Overall summary tables show percentages beside W/D/L; draws count half a point.

The [mobility batch](docs/version17-mobility.md) is complete: 2,368 games finalized, with 2,363 completions, five unscored move-limit truncations and no errors. The [combined thirty-two-start report](experiments/balance/results/v17-mobility-001.report.md) reuses 768 compatible historical games without replaying them. Reference averages are two-step pawns **50.98%**, king-step pawns **48.39%**, mobile-forward grants **44.92%** and Scout grants **45.31%**. Direct pawn-bundle scores remain separate.

Two-step and King-step pawns and the mobile-forward Pawn grant are now available in the [Version 17 workshops](docs/playtest-roster-v17.md). Scout remains a research alternative with a Cruisader weakness. Park Support and full-diagonal pawns. Grid bishop remains a level-3 candidate at 60.55%, while the older long-forward and pawn-like grants look strong for one point. Human feedback remains important when selecting permanent references. The remaining [idea shortlist](docs/design-ideas.md) stays outside the completed budget.

The [complete reference panel](docs/reference-panel-v17.md) selects those three level-1 designs beside the four level-3 references. Its [preview](experiments/balance/results/reference-panel-v17-001/reference-panel.md) reuses 2,664 scored games, including the level-3 2v2 pilot. It prepares 1,216 new games: one missing three-point matchup, level-1 singles and all level-1 2v2 teams. Two-point teams never face level-3 pieces. `balance:panel` builds the combined report offline; the three game stages launch separately through `balance:v17`.

Finite reserve bundles now have an explicit balance army format. Outcome reports include them; the existing material estimator remains restricted to board-only experiments. See [the balance guide](BALANCE.md), [next steps](TODO.md) and [mixed-army plan](docs/mixed-army-balance-plan.md).

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
