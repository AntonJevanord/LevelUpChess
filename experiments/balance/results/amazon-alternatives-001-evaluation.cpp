#include <iostream>
#include <string>
#include "fairy-stockfish-43b66c8/src/piece.cpp"
#include "fairy-stockfish-43b66c8/src/psqt.cpp"
int main() {
 using namespace Stockfish;
 Variant variant;
 const char* definitions[] = {"QN", "RFmDmNmAmHmCmZmG", "RFmDmNmAmHmCmZmGcB2", "RmFmDmNmAmHmCmZmGcB2"};
 for(int i=0;i<4;i++) variant.customPiece[i]=definitions[i];
 for(int i=0;i<4;i++) variant.pieceTypes |= piece_set(PieceType(CUSTOM_PIECES+i));
 pieceMap.init(&variant);
 PSQT::init(&variant);
 for(int i=0;i<4;i++){
  auto type=PieceType(CUSTOM_PIECES+i);auto p=pieceMap.at(type);
  std::cout << definitions[i] << " quietSteps=" << p->steps[0][MODALITY_QUIET].size() << " captureSteps=" << p->steps[0][MODALITY_CAPTURE].size() << " quietSliders=" << p->slider[0][MODALITY_QUIET].size() << " captureSliders=" << p->slider[0][MODALITY_CAPTURE].size() << " rawMG=" << piece_value(MG,type) << " rawEG=" << piece_value(EG,type) << '\n';
 }
 auto type=PieceType(CUSTOM_PIECES+1);
 std::cout << "default Blink4 PieceValueMG="<<PieceValue[MG][type]<<" CapturePieceValueMG="<<CapturePieceValue[MG][type]<<" EvalPieceValueMG="<<EvalPieceValue[MG][type]<<" PSQd4MG="<<mg_value(PSQT::psq[type][SQ_D4])<<"\n";
 variant.pieceValue[MG][type]=1000; variant.pieceValue[EG][type]=1100; PSQT::init(&variant);
 std::cout << "override Blink4 PieceValueMG="<<PieceValue[MG][type]<<" CapturePieceValueMG="<<CapturePieceValue[MG][type]<<" EvalPieceValueMG="<<EvalPieceValue[MG][type]<<" PSQd4MG="<<mg_value(PSQT::psq[type][SQ_D4])<<"\n";
 pieceMap.clear_all();
}
