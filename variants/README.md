# Knight upgrades

Version 03 supports all three knight levels. The browser and native Fairy Stockfish engine load the same `levelup-knight.ini` rules.

| Level | Piece | Movement | Cost |
| --- | --- | --- | --- |
| 0 | Standard knight (`N/n`) | Standard knight moves and captures. | 0 |
| 1 | Blue knight (`E/e`) | Standard knight, plus one orthogonal step into an empty square. That extra step cannot capture or attack. | 1 |
| 2 | Orange knight (`F/f`) | Standard knight, plus an exact two-square horizontal jump, moving or capturing on the destination. | 2 |
| 3 | Purple extra piece (`G/g`) | An exact two-square jump in any orthogonal direction, moving or capturing on the destination. The standard knight stays on its original square. | 3 |

Orange and purple jumps ignore intermediate pieces; friendly pieces block only the destination. Purple has the listed orthogonal jumps only, without knight moves. These definitions were confirmed by the project owner: orange uses `NsD` and purple uses `D`, correcting the draft's `N2F` and `2W` notation. Blue remains `NmW`.

## Setup

Choose a level for each starting knight (b1/g1/b8/g8), with separate White and Black budgets from one to six points. Points equal the selected levels. Purple adds its extra piece on b3/g3 for White or b6/g6 for Black; no knight or pawn is removed. Two purple selections per side use six points and produce a 36-piece starting army.

Changes apply to the next new game. Existing standard/blue saves remain compatible. Browser saves preserve the selected budget; PGN preserves the initial army but carries no budget or clock settings. Custom PGN analysis positions are validated for legal chess rules, independently of new-game setup budgets.

## Rules and files

Standard castling, en passant, checkmate, and king safety remain active. Promotion choices are queen, rook, bishop, or a standard knight. Extra pieces are ordinary capturable pieces; kings retain standard victory rules.

A lone blue knight or purple extra piece versus a bare king is insufficient mating material. An orange knight can mate with its king. Other draws use the variant's legal rules and repetition history.

Upgrade PGNs keep the `[Variant "levelup-knight"]` identifier and an explicit starting FEN. Their main line is validated move by move. Brace/semicolon comments and numeric annotations can be read but are omitted on export; side variations are rejected. Standard-chess PGN behavior is unchanged.

`Example.txt` remains a draft for other piece families. Its swapped king/queen starting FEN is not loaded: the working configuration starts kings on e1/e8 and queens on d1/d8.
