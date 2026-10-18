Game:
- create a board.
- create a playable version of chess with the standard pieces.
- create functionality to level up the pieces before match start. left click to level up and right click to level down? click for dropdown with options and descriptions?
- create option to play against fairy stockfish.
- implement special moves for the special pieces.
- create a board setup stage before the first move to add an appropriate amount of pieces (some pieces add other pieces before the game as their ability) aka adjust start Fen before game start.
- create 3 game modes: low level (max level = 3-4), high level (max level = 6-9), random (both players gets a random setup with the same total level on both sides).
- add options for time restraint.

Design:
- create art for the pieces, standard pieces (lv 0) looks more innocent and higher level pieces (lv 3) look aggressive. lv 1 is blue, lv 2 is orange, lv 3 is purple. (make sure pieces accurately reflect both the level and their side ie. white vs black)
- create 3 different boards with different levels of contrast with a hue selecting wheel.
- create 3 slightly more involved board designs.
- create 3 highly involved board designs with themes (lava, ocean, beach, jungle, halloween, christmas, etc.)
- create main menu.
- create settings menu.

Chess:
- implement lv 0 pieces (normal chess gameplay)
- implement pawn level ups (make sure they can promote to appropriate pieces)
- implement bishop level ups
- implement knight level ups
- implement rook level ups
- implement queen level ups
- implement king level ups (make sure the game accepts having the king replaced by another piece, f.eks. make it a capture game mode with the king pieces (lv 0-3) as the pieces to capture)

Balance:
- create a script to play the pieces against each other and evaluate their relative strength.
- make the script interruptible, one command to interrupt immediately, one to interrupt once the next game/run finnishes.
- store progress in a file.
- make a plan to adjust the balance strategy once a piece gets reworked.

Feedback:
- none
