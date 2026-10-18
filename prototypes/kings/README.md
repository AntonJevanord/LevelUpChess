# Capture-only king prototype

An isolated local-play experiment for version 06. The main game retains its version 05 rules. Both kings use the selected level; every other piece has standard chess movement. Independent king levels and integration with the other upgrades come later.

Open [index.html](index.html) directly, or run `npm.cmd start` and open `http://127.0.0.1:4173/prototypes/kings/index.html`. The generated HTML includes its rules and styling, so local play works offline. Choose a level and a practice position, or load a FEN. Use undo, flip, and the promotion choice to explore.

| Level | Cost | Added captures | Native definition |
| --- | --- | --- | --- |
| Standard | 0 | None | `K` |
| Blue | 1 | Jump exactly two squares sideways. | `KcsD` |
| Orange | 2 | Blue's jumps plus exactly two squares forward or backward. | `KcD` |
| Purple | 3 | Orange's jumps plus exactly two squares diagonally. | `KcDcA` |

All levels retain ordinary king moves and captures. Extra jumps require an enemy destination, ignore the intervening square, and must land safely. They add attacks, so they can also make a square unsafe for the opposing king. Castling still requires its normal rights, clear paths, and a safe route. The king remains royal: checkmate ends the game.

For a king on d4, blue adds captures on b4/f4, orange adds d2/d6, and purple adds b2/b6/f2/f6. Empty squares at those distances are never quiet escape destinations. Capturing can still escape check; capture-only is not a guarantee that familiar endings remain winnable.

## Practice positions

- **Capture practice:** exposed enemy pawns show which extra directions each tier can capture. White and Black examples mirror one another.
- **Rook mating net:** a queen and two rooks mate all three candidate kings in this particular position.
- **Capture escape:** add a knight on h6 to that net. Orange and purple can capture it to escape; blue cannot. This makes the remaining mating risk visible.
- **Single knight mate:** play Nf4–g6 with White Kf7 and Black Kh8. Each upgraded king's added h7 attack makes the move mate; ordinary kings leave an escape.
- **Castling:** test ordinary king/rook castling under the selected rules.

These demonstrate behavior, not material values or general forced mates. The costs are fixed at 1/2/3; the strength increments have not been measured. No guard design is selected or removed by this prototype.

## Draws and mating material

The extra royal attacks can make a single-knight mating position possible: White Kf7 and Ng6 mate Black Kh8 at all three upgraded levels. This does not prove that king-and-knight can force mate from other positions.

The rules library still applies its ordinary insufficient-material heuristic to that ending. The prototype therefore determines checkmate/stalemate from legal moves first. Standard mode retains ordinary material draws; upgraded modes automatically draw bare kings only and keep other minor-piece endings playable. Threefold repetition and the fifty-move limit still end play automatically. Some other dead positions may continue until those limits; full integration needs a settled draw policy and matching engine behavior.

## Development

Edit `app.js`, `template.html`, `styles.css`, or `variants.ini`, then run:

```sh
npm run build:kings
npm run test:kings
```

`npm run build` also rebuilds this prototype. Commit the generated `index.html`. The verifier uses separate rules instances for each level and checks both colors. Set `FAIRY_STOCKFISH_PATH` to compare those positions with a compatible native engine, as with the main project's tests. It does not run balance matches.

Validation includes 34 prototype browser cases and 138 positions compared with native Linux and the bundled Windows executable under Wine. The remaining main-game checks also pass. These checks establish implemented behavior; Windows browser playtesting and material balance remain open.

Fairy Stockfish browser rules are GPL-3.0; the license is in [stockfish/COPYING.txt](../../stockfish/COPYING.txt), with matching source and provenance in [vendor/README.md](../../vendor/README.md). The prototype uses the same pinned rules source as the main game.
