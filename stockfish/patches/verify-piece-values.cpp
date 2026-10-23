// Static regression check against the vendored source plus the LevelUp patch.
// Compile with -I<patched-source>/src -ffunction-sections -Wl,--gc-sections.
#include <array>
#include <cassert>
#include <iostream>
#include "piece.cpp"
#include "psqt.cpp"

using namespace Stockfish;

void load(const Variant& variant) {
    pieceMap.init(&variant);
    PSQT::init(&variant);
}

void values(PieceType type, int mg, int eg) {
    for (Color color : {WHITE, BLACK}) {
        Piece piece = make_piece(color, type);
        assert(PieceValue[MG][piece] == mg && PieceValue[EG][piece] == eg);
        assert(CapturePieceValue[MG][piece] == mg && CapturePieceValue[EG][piece] == eg);
        assert(EvalPieceValue[MG][piece] == mg && EvalPieceValue[EG][piece] == eg);
    }
}

int main() {
    Variant automatic;
    const std::array<const char*, 4> movement = {
        "RmFmDmNmAmHmCmZmG", "RFmDmNmAmHmCmZmG",
        "RFmDmNmAmHmCmZmGcB2", "QN"
    };
    for (int index = 0; index < int(movement.size()); ++index) {
        automatic.customPiece[index] = movement[index];
        automatic.pieceTypes |= piece_set(PieceType(CUSTOM_PIECES + index));
    }
    load(automatic);
    const std::array<std::array<int, 2>, 4> baseline = {{{3146, 3944}, {3536, 4370}, {4002, 4877}, {3738, 3875}}};
    for (int index = 0; index < int(baseline.size()); ++index)
        values(PieceType(CUSTOM_PIECES + index), baseline[index][0], baseline[index][1]);
    values(ROOK, 1276, 1380);
    values(QUEEN, 2538, 2682);

    Variant manual = automatic;
    for (int index = 0; index < 3; ++index) {
        manual.pieceValue[MG][CUSTOM_PIECES + index] = 2042;
        manual.pieceValue[EG][CUSTOM_PIECES + index] = 2208;
    }
    load(manual);
    for (int index = 0; index < 3; ++index) {
        PieceType type = PieceType(CUSTOM_PIECES + index);
        values(type, 2042, 2208);
        assert(mg_value(PSQT::psq[make_piece(WHITE, type)][SQ_D4]) == 2047);
        assert(eg_value(PSQT::psq[make_piece(WHITE, type)][SQ_D4]) == 2213);
        assert(mg_value(PSQT::psq[make_piece(BLACK, type)][SQ_D5]) == -2047);
        assert(eg_value(PSQT::psq[make_piece(BLACK, type)][SQ_D5]) == -2213);
    }
    values(PieceType(CUSTOM_PIECES + 3), 3738, 3875);

    load(automatic);
    for (int index = 0; index < int(baseline.size()); ++index)
        values(PieceType(CUSTOM_PIECES + index), baseline[index][0], baseline[index][1]);

    Variant midgameOnly = automatic;
    midgameOnly.pieceValue[MG][CUSTOM_PIECES] = 2042;
    load(midgameOnly);
    values(CUSTOM_PIECES, 2042, 3944);
    Variant endgameOnly = automatic;
    endgameOnly.pieceValue[EG][CUSTOM_PIECES] = 2208;
    load(endgameOnly);
    values(CUSTOM_PIECES, 3146, 2208);

    Variant ordinaryOverride = automatic;
    ordinaryOverride.pieceValue[MG][ROOK] = 2042;
    ordinaryOverride.pieceValue[EG][ROOK] = 2208;
    load(ordinaryOverride);
    values(ROOK, 2042, 2208);
    load(automatic);
    values(ROOK, 1276, 1380);
    values(CUSTOM_PIECES, 3146, 3944);

    Variant changedMovement = automatic;
    changedMovement.customPiece[0] = "QN";
    load(changedMovement);
    values(CUSTOM_PIECES, 3738, 3875);
    load(automatic);
    values(CUSTOM_PIECES, 3146, 3944);

    pieceMap.clear_all();
    std::cout << "Automatic, manual, phase-only, ordinary overrides, both colors, PSQT and variant reloads passed.\n";
}
