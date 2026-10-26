# Completed simple-piece comparison

The 2026-10-26 upload contains all **3,072 new games**, with no errors,
truncations or retries. The [audit](simple-reference-001.audit.json) replays
336,140 new plies, checking SAN, final FEN and terminal outcomes. It reproduces
the extension's game metadata and coverage: 27,338 samples from 3,056 games.
The linked original/simple collection has 5,759 completed outcomes, one inherited
unscored truncation and 52,703 samples from 5,733 games. Close this collection
at its declared cap.

## Comparison and decision

Scores count draws as half a point. Each candidate/reference matchup has 256
games over 128 complete color pairs. Bonuses below are added value over the
ordinary family, under assumed P=1/Q=9.

| Candidate | Against Amazon | Against Camel | Head-to-head bonus |
| --- | ---: | ---: | ---: |
| Rank bishop `BsR` | 30.27% | 31.45% | 1.94 |
| Queen-moving rook `RB` | 71.48% | 66.99% | 4.50 |
| Forward-bishop rook `RfB` | 52.73% | 50.98% | 3.31 |
| Short-bishop rook `RB2` | 49.02% | 42.97% | 2.97 |

`RfB` is a reasonable additional reference: its conditional score ranges are
46.88%–58.59% against Amazon and 45.12%–56.84% against Camel. Its head bonus
3.31 lies between Camel's 3.19 and Amazon's 3.49; its combined bonus is 3.50.
These fits use the same engine outcomes and do not independently confirm the
direct results or establish universal values. Retain QN/NC and inspect opponent
dependence rather than replacing them with the rook.

`RB2` remains a plausible alternative but trails Camel. `RB` is stronger than
both references in this test, despite queen movement and the ordinary-queen
native prior. Plain `BsR` needs more help. The next
[five-bishop comparison](../bishop-reference-plan.md) tests the original bishop,
both leading nerfs, and two quiet-hop additions against unchanged `RfB`, reusing
the current evidence rather than replaying it.

## Ordinary material estimates

| Ordinary piece | Combined estimate |
| --- | ---: |
| Pawn | 1.00, assumed |
| Knight | 2.74 |
| Bishop | 3.07 |
| Rook | 4.52 |
| Queen | 9.00, assumed |

Queen minus rook is **4.48**, conditional range **4.35–4.61** on the assumed
Q=9 scale. Royal kings have no estimated exchange price. Conditional uncertainty,
cohort effects and the fixed book/playing policy still limit transfer to other
positions or engine settings; native MG/EG parameters use a different scale.

## Preserved evidence and limits

Archive the raw [journal](simple-reference-001.games.jsonl),
[dataset](simple-reference-001.uploaded-dataset.json) and
[JSON report](simple-reference-001.uploaded-report.json) unchanged. The journal's
SHA-256 is
`8de913ef53c3023f525c80da572e6ad153d83d2651a96d3ccbbad10f5eea2b84`.
All 32 declared source entries, the Windows CRLF rules bundle and bundled engine
hash match the pre-edit `1cdc62f` checkout. Reproduce those whole-file checks
on that matching commit; added definitions change current hashes.

The original simple collection manifest was not uploaded. The
[canonical replay descriptor](simple-reference-001.replay-source.json) is
explicitly reconstructed from the frozen plan and supplied identity for move
replay. Its existence does not verify the missing historical manifest's checksum
or native inventory. The new campaign records that limit separately from its
own native preflight and frozen identity. No new scored games were needed to
review these results.
