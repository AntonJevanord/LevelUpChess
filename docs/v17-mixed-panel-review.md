# Mixed packages and first-eight roster review

Both uploads reproduce exactly from their frozen declarations. Lossless
compressed evidence, checksums and derived results are retained separately
from original execution provenance, which was not supplied in these uploads.

## Mixed packages and Warden

All 1,824 games finalized: 1,822 completed, two reached the 400-ply cap and
there were no errors or retries. Excluding the two completed partners of
truncations leaves 910 scored color pairs.

| Grant | First six | Second six | Overall | W / D / L |
| --- | ---: | ---: | ---: | :--- |
| W2 | 63.54% | 69.79% | 66.67% | 56 / 16 / 24 |
| WD / Warden | 53.13% | 57.29% | 55.21% | 43 / 20 / 33 |

WD minus W2 is −11.46 percentage points. Its conditional matched-opening range
crosses zero; twelve related fixed cases do not establish intrinsic superiority.
WD does better against Crusader and worse against the other three references.

The rules also make reserve deployment different. With White's pawn on d5 and
Black's king on d6, a W2 drop on d4 need not check; a WD drop there attacks d6
through the pawn and is forbidden. Extra deployed mobility does not guarantee
more legal reserve placements under the nonchecking-drop rule. This demonstrates
a mechanism, without attributing the observed score gap to it.

Keep WD as the working three-point **Warden**. It retains its original ID, price,
movement, color and applied 563/635 search prior. W2 stays available as a trial;
neither becomes a newly frozen research reference.

The Forward Knight pawn scores **60.94%, 70.31% and 58.59%** with Two-step pawn,
King-step pawn and Pawn grant respectively. Both fixed halves and both placements
are positive for every team. Its equal-team partner mean is **63.28%**. Rank
pawn is **46.59%** and Diagonal grant **54.45%**, with their different shared-case
coverage retained. The repeated Knight-pawn signal supports a narrower-move test;
it does not establish a precise additive value or pure coordination effect.

The [pawn prototypes](../prototypes/pawns/README.md) retain full wide `fsN` jumps
and make tall jumps capture-only `fceN` or quiet-only `fmN`. New explicit pawn
capture components use `ce`; both-color en-passant removal and ordinary promotion
are verified. They are not substituted into running studies or the current
playable pawn before a balance comparison.

See the [mixed evidence](../experiments/balance/results/v17-mixed-001.report.md).

## Complete roster: eight collected openings

The uploaded report has **2,640 completed games / 1,320 color pairs**, while its
requested target remains **32 openings / 10,560 games**. It is an interim snapshot.

| Piece | 20k overall | 40k overall | 80k overall |
| --- | ---: | ---: | ---: |
| Herald | 57.64% | 53.47% | 50.69% |
| Inquisitor | 60.76% | 54.17% | 56.25% |
| Unicorn | 46.18% | 47.92% | 56.25% |
| Vanguard | 54.86% | 55.21% | 53.13% |
| Amazon | 49.31% | 51.74% | 46.53% |
| Ranger | 45.83% | 52.43% | 42.36% |
| Crusader | 55.90% | 50.69% | 51.39% |
| Nightrider | 35.42% | 42.71% | 43.40% |
| Cataphract | 59.38% | 54.86% | 66.32% |
| Wraith | 34.72% | 36.81% | 33.68% |

Nightrider and Wraith are the only pieces with at least one ordinary-army loss
at every budget. Their scores against ordinary armies remain positive:
Nightrider **93.75 / 84.38 / 84.38%**, Wraith **84.38 / 75.00 / 62.50%**.

The round-robin roster mean is necessarily 50%. The spread narrows at 40k but
widens at 80k: population standard deviations across the ten row scores are
8.94, 5.67 and 8.58 percentage points. Cataphract and Unicorn also change
noticeably with more search. Eight shared cases do not establish a monotone
computation effect or justify revising the rest of the roster.

Leave Wraith unchanged. Test the selected Nightrider capture-step alternatives
against the four references using a fresh control and eight holdout openings;
the [focused protocol](nightrider-focus-v17.md) schedules 576 games. Keep that
result separate from the ongoing full-panel opponent basket.

See the [interim panel evidence](../experiments/balance/results/v17-level3-panel-001.report.md).

## Current display names

Herald = Queen pawn; Ranger = Rook pawn; Cataphract = Ranged rook;
Inquisitor = selected Vertical bishop; Wraith = diagonal-X-ray queen;
Warden = WD grant. Nightrider keeps its established spelling; Crusader corrects
the earlier “Cruisader” typo. Current setup and board labels use these names.
Historical reports and superseded workshops retain their archived labels;
all nineteen stored rule profiles remain unchanged.
