# Version 18 interface

The board has one side panel with four tabs. Turn/result status, engine
playback, clocks, Undo, Flip and New game stay available across tabs. On smaller
screens, the panel sits below the board.

| Tab | Contents |
| --- | --- |
| Game | Move history, piece inspection and drawing tools |
| Setup | Rules, upgrade budgets, opponents and time control |
| Design | Piece artwork, board palette and annotation color |
| Files | Browser save, load and PGN import/export |

## Build an army

In Setup, choose **Version 18 · Roster and king trials** or another workshop.
Click a starting piece to open its upgrade cards across ranks 3–6. Both home
armies remain visible, so clicking another piece changes the choices. Cards
show the name, price and movement description; long lists scroll inside the
picker.

Select an upgrade to change the draft army. Close the picker with its close
button or Escape. **Start game** applies the draft; **Return to game** keeps
the existing game. The clear-army buttons reset draft selections.

## Read a piece's abilities

Click either side's piece to see its movement guide:

| Marker | Ability |
| --- | --- |
| Gray dot | Move without capturing |
| Red ring | Capture |
| Dot and ring | Move or capture |

Capture-only rings also appear on empty squares. The guide follows blockers,
jumps and the piece's movement rules, but ignores turn order, pins and check.
Squares occupied by that piece's allies are omitted. **A marker is not a
promise that the move is legal now**: the game still enforces whose turn it is,
king safety and all other rules.

Normally, clicking a legal capture destination plays the capture. Turn on
**Inspect pieces** when you want to examine pieces without making any move.
Inspection also works while watching the engine or while clocks are paused.

## Draw on the board

Right-click a square to toggle a circle; right-drag between squares to toggle
an arrow. Repeat the same gesture to remove that mark. **Clear marks** or
Escape removes all marks. On touch screens, turn on **Draw**, then tap or drag.
Turn Draw off to move pieces again.

Marks use yellow by default, follow their squares when the board flips, and
clear after a move, undo or new game. They are temporary aids and are not
included in saved games or PGN.

## Change the appearance

Design offers **Classic glow**, **Flat classic**, **Outline** and **Medallion**
pieces, plus Sage, Blue, Walnut and Slate boards. Upgrade colors and level
badges keep their meanings in every style. The annotation color controls both
arrows and circles.

Appearance preferences are remembered locally, independently of game saves.
These controls, artwork, drawing and piece guides work offline in the bundled
`index.html`; only engine play needs the local server.

## Watch Stockfish

In Setup, choose **Stockfish vs Stockfish**. It connects in a paused state and
can continue the current position, including an imported game. Use
**Start / Resume** for continuous play, **Pause engine** to stop, or **One move**
for exactly one half-move followed by a pause. The selected difficulty applies
to both sides.

Clocks still apply. One move starts a timed clock if needed and pauses it
again after the move. Undo takes back one half-move and leaves the engine
paused. Saved self-play games also load paused. Piece inspection and drawing
remain available while the engines play.

Run `npm.cmd start` and open its printed address for engine play. Direct-file
play supports local players and the other interface features.
