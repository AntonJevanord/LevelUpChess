# Version 19: selected queen and pawn trial review

The uploads contain **1,152 completed first-attempt games**, 576 complete color pairs and no errors, retries or truncations. Each study has four eight-case batch journals and 32 shared openings. The original numeric report tables, colors, conditional ranges, opening diagnostics and declared search priors reproduce offline.

The user selected **QfsN** as the second level-one queen and **fQ2** as the level-two range pawn for their movement identity and simplicity. These are playable roster choices; none of the recorded results or frozen reference definitions change.

## Level-one queens

| Design | Score | White | Black | Conditional 95% range | W / D / L |
| --- | ---: | ---: | ---: | --- | :--- |
| Queen: wide forward knight jumps | 42.19% | 44.79% | 39.58% | 37.24%–46.87% | 53 / 56 / 83 |
| Queen: two-square box jumps | 42.45% | 51.04% | 33.85% | 36.98%–47.40% | 45 / 73 / 74 |
| Forward-tall queen control | 46.09% | 46.88% | 45.31% | 40.88%–51.04% | 59 / 59 / 74 |
| Tall-knight queen control | 60.68% | 65.10% | 56.25% | 55.46%–65.62% | 84 / 65 / 43 |

QfsN gives two wide forward knight jumps in addition to ordinary queen movement (for White on d4: b5/f5). Its declared score is **42.19%**, with 51.56% against Two-step pawn, 33.59% against King-step pawn and 41.41% against Pawn grant. It is a weaker exploration choice in this reference basket, not a demonstrated 50% match. The retained QfN queen control scores 46.09%; QvN scores 60.68%. QAD scores 42.45%, almost the same overall as QfsN, so the selection rests on the preferred readable jump pattern.

## Level-two pawns

| Design | Score | White | Black | Conditional 95% range | W / D / L |
| --- | ---: | ---: | ---: | --- | :--- |
| Pawn: forward range two | 56.51% | 60.42% | 52.60% | 51.82%–61.46% | 75 / 67 / 50 |
| Pawn: quiet range two and forward diagonal captures | 58.07% | 60.42% | 55.73% | 52.86%–64.07% | 80 / 63 / 49 |

fQ2 moves and captures up to two squares straight or diagonally forward, with no backward or sideways moves. It scores **56.51%**, versus 58.07% for mvQ2fceB2. Its per-reference scores are 60.94% against Quiet-tall Knight pawn, 58.59% against Rank pawn and 50.00% against Bishop grant. It remains mildly strong under this protocol; the conditional 51.82%–61.46% range does not establish exact parity. Its simpler forward-only identity is the design reason for selection.

Both pawn trials use 536 MG / 592 EG; all queen trials and controls use 2771 / 2833. Fixed opponents retain their declared priors. These settings guide search and are not fitted material values. Range-two moves require a clear path, remain available away from the home rank and use mandatory ordinary Q/R/B/N promotion. The fQ2 quiet diagonal landing on an empty en-passant target leaves the bypassed pawn, matching the measured engine behavior.

## Opening diagnostics

All **1,152 forced prefixes and stored opening FENs** independently replay under the frozen browser rules. Queen games retain 631 exact-cp and 137 bounded-cp first-search observations; pawn games retain 333 exact-cp and 51 bounded-cp observations. Neither study has missing, unavailable, invalid or mate observations. No opening was omitted or reweighted.

The completed queen journals now replace the earlier missing-data status for this study; the old null-runtime receipt remains preserved in the earlier archive as historical evidence. No previous archive is rewritten or pooled into this run.

## Provenance and reproducibility

- Original run manifests, owned runtimes, archived INI files and native-preflight proofs were not supplied. Reconstructed descriptors establish declaration compatibility, not original execution provenance.
- The journals report Fairy-Stockfish 230826 and its executable hash. This offline review does not independently inspect that executable or attest its native value tables.
- Every forced opening and stored opening FEN is independently replayed with the frozen browser rules. Full game continuations and their reported outcomes are not independently replayed.
- The thirty-two related fixed opening cases, forced-prefix protocol and fixed search priors limit generalization. Conditional ranges do not include engine or protocol bias; scores are not material values.
- The selected designs reflect the user's preference for movement identity and readability. The results do not establish exact balance or justify changing any recorded score.

Exact uploaded bytes and reconstructed compatibility descriptors are gzip archived with original/archive SHA-256 pins. Run `node scripts/balance/v19-selection-evidence.js` to verify this review and the audit offline; `--write` regenerates only those two derived artifacts. No engine searches, scored games or new material fits are run.
