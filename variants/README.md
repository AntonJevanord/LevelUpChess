# Upgrade rules

Browser and native Fairy Stockfish load the same configuration. Current games use `levelup.ini` (`levelup`); version 03 games use the unchanged `levelup-knight.ini` (`levelup-knight`). Rules are stored with saves and PGNs so older games retain their original movement.

## Version 04 movement

Unlisted standard abilities remain unchanged. A **quiet** move must land on an empty square. Quiet-only movement adds no capture or attack directions; the piece can still give check after landing through its ordinary attacks. Jumps ignore intermediate pieces; friendly pieces always block the destination. Sliding moves need a clear path.

| Family | Blue · cost 1 | Orange · cost 2 | Purple · cost 3 |
| --- | --- | --- | --- |
| Knight | Knight + quiet one-square orthogonal step (`NmW`). | Knight + exact two-square horizontal jump (`NsD`). | Extra piece with one- or two-square orthogonal moves/captures (`WD`); two-square moves jump. Keep the normal knight. |
| Pawn | Quiet forward jumps of one or two squares; three from the starting rank. Capture one square diagonally forward (`ifmHfmDfmWfceF`). | Move or capture one square forward or diagonally forward. Initial quiet two-square advance needs a clear path (`ifmnDfeWfF`). | Quiet rook slides; bishop captures in any direction (`mRceB`). |
| Bishop | Bishop + quiet one-square orthogonal step (`BmW`). | Bishop + capture-only jump two squares forward and one sideways (`BcfN`). | Bishop + vertical rook slides (`BfbR`). |
| Queen | Deferred. | Queen + quiet knight jumps (`QmN`). | Queen + full knight moves/captures: amazon (`QN`). |

Forward is toward the opponent's back rank for each color. The blue pawn's two- and three-square advances jump; the orange pawn's initial double advance does not. Blue's three-square advance is available while on its starting rank, not tracked as a historical first-move flag.

All pawn levels promote to a standard queen, rook, bishop, or knight on the far rank. Blue and orange forward moves reset the fifty-move counter; purple's reversible quiet rook moves count toward it. Captures and promotions reset it. This follows the native engine's reversibility rules. Rooks and royal kings remain standard; legal checking and castling rules apply.

## En passant

Custom pawns use the engine's native en passant rules:

- Blue can capture en passant diagonally forward. Its initial three-square leap can be captured en passant on a crossed square; its repeatable two-square jump does not create en passant rights.
- Orange's initial two-square advance can be captured en passant. Orange itself cannot capture en passant: moving diagonally onto an empty target is a quiet move and leaves the bypassed pawn in place.
- Purple can capture en passant along its diagonal capture lines. Its rook-like quiet moves do not create en passant rights.

The board, undo, repetition detection, saved games, and PGN use these engine results, including the blue pawn's multiple en passant targets after a three-square leap.

## Setup and budgets

Choose levels for 26 starting pieces: sixteen pawns, four knights, four bishops, and two queens. The same selected budget of 1–39 applies independently to each side. Cost equals level; unspent points are allowed.

Every upgrade replaces its starting piece except purple knights. Those keep the standard knight and add a piece on b3/g3 for White or b6/g6 for Black. Purple bishops replace c1/f1/c8/f8; they do not add pieces. Kings start on e1/e8 and queens on d1/d8.

Choices across all families apply to the next **New game**. Browser saves retain the selected budget. PGN retains the initial army and rules, but not budgets or clocks. Imported analysis positions are validated independently of new-game budgets.

## Version 03 compatibility

Choose **Version 03 knight rules** for the original mode. Blue and orange knights retain the movement above; purple extras use `D`, exact two-square orthogonal jumps only. Budgets remain 1–6 per side. Existing saves and `[Variant "levelup-knight"]` PGNs keep these rules rather than receiving the new `WD` movement.

A lone blue knight or version 03 purple extra versus a bare king is insufficient mating material. This does not describe version 04's stronger purple piece.

## PGN and draft rules

Upgrade PGNs contain `[Variant "levelup"]` or `[Variant "levelup-knight"]` and a starting FEN. The main line is validated move by move. Brace/semicolon comments and numeric annotations can be read but are omitted on export; side variations are rejected. Standard-chess PGN behavior is unchanged.

`Example.txt` is a design draft. The engine ignores its `j` modifier, so its jump-slider and back-rank rook/queen/king descriptions do not follow from those Betza strings. Blue queens, rook upgrades, and king upgrades remain deferred pending supported movement and royal/castling rules. Custom castling is possible in modern Fairy Stockfish, but compatibility with the bundled Windows engine has not been established.

For future castling rules, modern builds support `castlingRookPieces` and a Betza definition for the actual royal `king`. Assigning `castlingKingPiece` to a custom piece alone does not make it royal. King movement currently applies to both colors, so independent king upgrades need a separate design.
