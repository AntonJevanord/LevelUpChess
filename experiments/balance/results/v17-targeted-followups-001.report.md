# Targeted follow-up evidence

All 3,328 scheduled games completed on attempt 1: 2,304 Knight-pawn games and 512 each for Nightrider and Cataphract. All three uploaded reports reproduce byte-for-byte; there are 1,664 complete color pairs and no retries, errors or truncations. No historical games are included.

| Knight-pawn body | Score | W / D / L | First eight | Second eight |
| --- | ---: | :--- | ---: | ---: |
| Forward Knight pawn control | 61.65% | 420 / 107 / 241 | 59.51% | 63.80% |
| Knight pawn: tall captures only | 55.01% | 367 / 111 / 290 | 56.38% | 53.65% |
| Knight pawn: tall quiet only | 49.93% | 327 / 113 / 328 | 50.26% | 49.61% |

Each pawn body has 768 games from sixteen opening blocks. The quiet-tall body has 327 wins, 113 draws and 328 losses: changing one loss to a draw would give exactly 50%; changing it to a win would give 50.07%. The percentage is an equal-partner/placement/reference army score, not a direct material value.

| Nodes | N0 control | N0cF diagonal captures |
| ---: | ---: | ---: |
| 40000 | 31.64% | 65.63% |
| 80000 | 36.72% | 62.11% |

The diagonal capture version is strong at both budgets. Its 80k-minus-40k raw score change is negative in this new cohort, with conditional ranges crossing zero; the earlier high 80k discovery score does not reproduce as a clear positive depth trend.

| Nodes | Cataphract RsCfC | Cataphract RfhC |
| ---: | ---: | ---: |
| 40000 | 49.61% | 38.67% |
| 80000 | 52.34% | 39.84% |

RsCfC keeps the backward-wide camel pair and removes only the two tall backward jumps. RfhC removes all backward camel jumps. Both retain rook movement/captures and castling; shared RC priors remain 2240/2413.

## Provenance and interpretation

- Original followup.json and stage run.json files, archived INI files, runtime ownership/receipts and native-preflight proofs were not supplied. Derived descriptors check declaration compatibility rather than original execution provenance.
- The current verified research overlay resolves immutable trial IDs for compatibility analysis. It is not asserted to be the original runtime snapshot.
- Recorded starts, profiles, search and evaluation policies, opening prefixes, move counts and outcome shapes match the declarations. Recorded engine names and profile hashes do not attest the executable or its native value tables.
- Moves and terminal outcomes were not independently replayed. No searches, new games, fitted material prices, piece Elo or population confidence intervals were produced.
- The same sixteen fixed cases are matched across colors, opponents, placements, partners and budgets. Physical game counts are not independent-opening counts, and reused cases across studies do not add opening diversity.
- Knight-pawn outcomes are three-point mixed armies, not isolated two-point piece prices. Original control and both revisions share MG/EG 536/592; the reported partner means keep fixed equal weights.
- Nightrider confirmation is separate from the earlier eight-case discovery. Cataphract compares two restrictions against references; original RC is not a fresh control in that study.
- The full ten-piece panel is still a separate ongoing study; none of its games or historical mixed results are added to these 3328 records.

Exact journals and uploaded reports are retained as deterministic gzip with original and archive SHA-256 pins. The audit stores complete generated report data once per study, including opening-block contrasts and partner/placement diagnostics.

Run `node scripts/balance/v17-targeted-followups-evidence.js` to verify offline; `--write` regenerates derived artifacts only. No engine or game is started.
