# Blue knight prototype

Version 03 implements one upgrade from `Example.txt`:

- Level 0: standard knight (`N` / `n`).
- Level 1, blue: standard knight moves and captures, plus a one-square orthogonal **non-capturing** step (`E` / `e`). Fairy Stockfish notation: `NmW`.
- Orthogonal steps do not attack squares. They cannot capture a piece or give adjacent-square check.

Each upgraded starting knight costs one point. Each side has its own selected budget of one or two points. The setup chooses each of b1, g1, b8, and g8 separately; changes apply to the next new game. The initial default upgrades b1 and b8 only.

`levelup-knight.ini` is the shared configuration loaded by the browser rules library and the native engine. Standard rules, castling, en passant, and checkmate remain active. Promotion choices remain queen, rook, bishop, or a standard knight. There are no extra pieces, king replacement rules, orange/purple knights, or other piece upgrades in this prototype.

Upgrade PGNs use `[Variant "levelup-knight"]` and an explicit starting FEN. Their main line is validated move by move. Brace/semicolon comments and numeric annotations can be read but are omitted on export; side variations are rejected. Standard-chess PGN behavior is unchanged.

`Example.txt` remains a draft for later upgrades. Its unresolved rules and swapped king/queen starting FEN are not loaded into this prototype. The working configuration starts kings on e1/e8 and queens on d1/d8.
