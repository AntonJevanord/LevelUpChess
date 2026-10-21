# Upgrade rules

Browser and native Fairy Stockfish load the same configuration. Reference Piece upgrades uses `levelup-v5.ini` (`levelup-v5`); Experimental designs uses the generated profile described below. Earlier modes retain `levelup.ini` (`levelup`, version 04) or `levelup-knight.ini` (`levelup-knight`, version 03). Saves and PGNs identify their rules.

## Experimental designs — version 10

The picker freezes the 20 revisions in [the playable library](../src/playable-library.js), selected from 22 immutable [catalog entries](../src/design-catalog.js). The build compiles [levelup-playable.ini](levelup-playable.ini) and [the matching profile](../src/playable-profile.json) through the balance registry/compiler. These are generated files. Names, descriptions, and colors live in [design options](../src/design-options.js).

Each side has a 1–6 point budget. New pawn purchases all cost three points:

| Design | Movement | Deployment |
| --- | --- | --- |
| Courier, `pawn.purple@3` | Quiet forward/horizontal rook slides; forward diagonal captures up to two clear squares (`mfRmsRcfB2`). | Replaces one pawn. |
| Rank, `pawn.purple@4` | Horizontal rook moves/captures; ordinary forward pawn moves/captures with a clear initial double-step (`ifmnDfmWfceFsR`). | Replaces one pawn. |
| Returning, `pawn.purple@5` | Forward queen rays up to two clear squares move/capture; backward rays are quiet-only; no sideways rays (`fQ2mbQ2`). | Replaces one pawn. |
| Twins, `pawn.purple@6` | Each unit jumps one or two squares quietly forward and captures one square diagonally forward (`fmWfmDfceF`). | Two same-type pawns on relative ranks 2/3 for one three-point purchase. |

The revised `knight.purple@2` keeps the ordinary knight and inserts its `WD` guard on b2/g2 for White or b7/g7 for Black. Insertion pushes only its own contiguous pawn stack one square forward, stopping within its own half. With Twins, the ordinary knight, guard, and two pawns fill relative ranks 1/2/3/4. Deployment rejects collisions and overflow. Purchase cost is counted once; the board's level summary counts remaining units.

Other original designs remain selectable, as does the experimental `rook.purple@2` (`RcN`). The parked `pawn.purple@2` and fixed rank-3 `knight.purple@1` remain immutable historical definitions outside this picker; version 09 preserves its earlier library.

The active mapping determines pawn roles, promotions/en passant, extra-unit placement, and castling rooks. It also determines board glyphs and labels; a temporary letter alone never identifies a family. Kings remain ordinary. Experimental games draw bare kings, repetition, stalemate, and the fifty-move rule; other material endings continue conservatively, with checkmate taking priority.

Experimental PGNs include the hashed variant, starting FEN, and a `LevelUpProfile` snapshot containing definitions, allocation, and exact INI. Browser saves also store starting choices where the position describes a standard starting army. Imports require the matching bundled profile and validate every move; arbitrary edited definitions are rejected. Imported study positions are independent of new-game budgets.

### Experimental pawn special rules

- Every new pawn unit must promote to a standard queen, rook, bishop, or knight on the enemy back rank.
- Courier, Rank, and Twins can capture en passant along their diagonal capture paths. Returning moves quietly onto an empty en-passant target and leaves the bypassed pawn, like the reference orange pawn.
- Rank's initial clear double-step creates en-passant rights. Courier's long advances, Returning's two-square slides, and Twin repeatable jumps create no such rights, including from shifted starting ranks.
- Returning quiet moves and quiet sideways Courier/Rank moves count toward the fifty-move limit because they are reversible. Their captures and promotions reset it. Forward-only Courier/Rank moves and Twin forward jumps reset it.

Use **Clear White**, **Clear Black**, or **Clear both** to clear draft selections across hidden families. Budgets stay selected. **New game** applies the new army and resets the board.

## Version 05 movement

Unlisted standard abilities remain unchanged. A **quiet** move must land on an empty square. Quiet-only movement adds no capture or attack directions; the piece can still give check after landing through its ordinary attacks. Jumps ignore intermediate pieces; friendly pieces always block the destination. Sliding moves need a clear path.

| Family | Blue · cost 1 | Orange · cost 2 | Purple · cost 3 |
| --- | --- | --- | --- |
| Knight | Knight + quiet one-square orthogonal step (`NmW`). | Knight + exact two-square horizontal jump (`NsD`). | Extra piece with one- or two-square orthogonal moves/captures (`WD`); two-square moves jump. Keep the normal knight. |
| Pawn | Quiet forward jumps of one or two squares; three from the starting rank. Capture one square diagonally forward (`ifmHfmDfmWfceF`). | Move or capture one square forward or diagonally forward. Initial quiet two-square advance needs a clear path (`ifmnDfeWfF`). | Quiet rook slides; bishop captures in any direction (`mRceB`). |
| Bishop | Bishop + quiet one-square orthogonal step (`BmW`). | Bishop + capture-only jump two squares forward and one sideways (`BcfN`). | Bishop + vertical rook slides (`BfbR`). |
| Rook | Rook + quiet two-square orthogonal jumps on the home two ranks (`RimD`). | Rook + capture across exactly one intervening piece in any rook direction (`RcpR`). | Rook + jump-captures anywhere within two squares horizontally and vertically (`RcFcAcNcD`). |
| Queen | Queen + quiet (1,2), (1,3), and (2,3) jumps on the home two ranks (`QimNimCimZ`). | Queen + quiet knight jumps (`QmN`). | Queen + full knight moves/captures: amazon (`QN`). |

Forward is toward the opponent's back rank for each color. The blue pawn's two- and three-square advances jump; the orange pawn's initial double advance does not.

All pawn levels promote to a standard queen, rook, bishop, or knight on the far rank. Blue and orange forward moves reset the fifty-move counter; purple's reversible quiet rook moves count toward it. Captures and promotions reset it. This follows the native engine's reversibility rules.

## Conditional moves and rook captures

Version 05 sets the initial-move region to ranks 1–2 for White and 7–8 for Black. The `i` modifier enables these extra quiet moves while a piece occupies that region; it is not a record of whether the piece has moved. Returning home restores blue rook and queen jumps. Outside the region, those pieces have ordinary rook or queen movement.

This shared region also permits initial pawn advances from a pawn's own back rank in imported analysis positions. Pawns in ordinary starting armies have the same abilities as version 04. Version 04 keeps its original initial region, rank 2/7.

Orange rook screen captures require exactly one intervening piece of either color and an enemy at the destination. They may cross friendly or enemy screens, but cannot jump quietly or capture through two screens. Ordinary rook moves and captures remain available. Purple rook jumps require an enemy destination; its quiet movement remains ordinary rook movement. Both kinds of capture add attacks and can give check.

All rook levels can castle with the standard royal king. Normal path, check, and castling-right restrictions apply. Moving a king or rook consumes the appropriate rights; returning home does not restore them. Pawn promotion grants neither upgraded pieces nor fresh castling rights. Kings retain standard movement, check, and checkmate.

## En passant

Custom pawns use the engine's native en passant rules:

- Blue can capture en passant diagonally forward. Its initial three-square leap can be captured en passant on a crossed square; its repeatable two-square jump does not create en passant rights.
- Orange's initial two-square advance can be captured en passant. Orange itself cannot capture en passant: moving diagonally onto an empty target is a quiet move and leaves the bypassed pawn in place.
- Purple can capture en passant along its diagonal capture lines. Its rook-like quiet moves do not create en passant rights.

The board, undo, repetition detection, saved games, and PGN use these engine results, including the blue pawn's multiple en passant targets after a three-square leap.

## Reference setup and budgets

Choose levels for 30 starting pieces: sixteen pawns, four knights, four bishops, four rooks, and two queens. The same selected budget of 1–45 applies independently to each side. Cost equals level; unspent points are allowed.

Every upgrade replaces its starting piece except purple knights. Those keep the standard knight and add a piece on b3/g3 for White or b6/g6 for Black. Purple bishops replace c1/f1/c8/f8; they do not add pieces. Kings start on e1/e8 and queens on d1/d8.

Choices across all families apply to the next **New game**. Browser saves retain the selected budget. PGN retains the initial army and rules, but not budgets or clocks. Imported analysis positions are validated independently of new-game budgets.

## Earlier versions

Choose **Version 04 piece rules** for its unchanged 26 upgradeable starting pieces and 1–39 point budget. It includes the pawn, knight, bishop, orange queen, and purple queen rules above, but has no blue queen or rook upgrades. Its original pawn initial region remains rank 2/7.

Choose **Version 03 knight rules** for the original mode. Blue and orange knights retain the movement above; purple extras use `D`, exact two-square orthogonal jumps only. Budgets remain 1–6 per side. Existing saves and `[Variant "levelup-knight"]` PGNs keep these rules rather than receiving the new `WD` movement.

A lone blue knight or version 03 purple extra versus a bare king is insufficient mating material. Version 04 and 05 use the stronger purple `WD` piece, which has mating potential.

## PGN and draft rules

Upgrade PGNs contain `[Variant "levelup-v5"]`, `[Variant "levelup"]`, or `[Variant "levelup-knight"]` and a starting FEN. The main line is validated move by move. Brace/semicolon comments and numeric annotations can be read but are omitted on export; side variations are rejected. Standard-chess PGN behavior is unchanged.

`Example.txt` is a design draft. The engine ignores its `j` modifier, so those jump-slider descriptions do not follow from the strings. Version 05 uses supported movement rather than reproducing each example. The draft blue queen's unrestricted back-rank teleport remains a possible future engine extension.

Current configuration uses `castlingRookPiece = rlmo`, accepted as a set by modern builds. Older engines may accept the variant name while silently dropping configuration abilities. The server checks relevant legal moves before searching, including castling, promotions, en passant, conditional jumps, and screen captures. An incompatible engine produces an update error; offline local play remains available. See [engine guidance](../stockfish/README.md).

King upgrades are available in the separate prototype and balance harness; integration with the main board remains future work. Modern builds can define Betza movement for the actual royal `king`; assigning `castlingKingPiece` to a custom piece alone does not make it royal. See [DESIGN.md](../DESIGN.md) for current royal constraints and integration limits.
