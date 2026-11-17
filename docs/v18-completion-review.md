# Version 18 queen and knight results

The [roster-completion studies](v18-roster-completion.md) finished **1,056
scheduled games**: 1,054 completed results and two move-limit truncations,
with no errors or retries. There are **526 complete scored color pairs**.
The [archived evidence](../experiments/balance/results/v18-completion-001.report.md)
retains the exact reports and journals and reproduces their numeric tables.
Scores count draws as half a point.

## Level-one queens

Each queen played 96 games against single purchases of the three L1 references.

| Body | Overall | Two-step pawn | King-step pawn | Pawn grant | First / second eight cases |
| --- | ---: | ---: | ---: | ---: | ---: |
| `QmN` control | 27.60% | 39.06% | 21.88% | 21.88% | 31.25% / 23.96% |
| `QcC` | 64.58% | 70.31% | 56.25% | 67.19% | 63.54% / 65.63% |
| **`QfN`** | **44.79%** | **48.44%** | **42.19%** | **43.75%** | **48.96% / 40.63%** |
| `QfhN` sanity check | 59.38% | 54.69% | 62.50% | 60.94% | 57.29% / 61.46% |

**Prefer QfN as the L1 queen for playtesting.** Its three matchup scores are
close and all fall in the descriptive 40%–60% band. The capture-capable QfN
outperformed the quiet-knight control: its matched gain over QmN is 17.19
percentage points, with a conditional opening-block range of 7.81–26.05 points
under the same declared search prior.
This compares whole designs: QfN also removes six of QmN's quiet knight jumps.

Keep QfhN as an upper-end alternative. It adds the two wide forward knight
jumps to QfN without losing any movement, and leads by 14.58 observed points.
It is not an independent specialization or evidence of equal strength at the
same price. Its conditional score range is 50.52%–68.23%; QfN's is
35.42%–53.13%. Do not treat either endpoint as a precise acceptance boundary.

QcC is high in both halves and against two of three references. Retain the
idea, but do not automatically make it an accepted L1 choice. A later two-point
test is a focused possibility; this run does not establish its L2 strength.
All three capture-capable trials improve over the matched quiet-knight control.

## Level-two queens and knights

| Body | Overall | Knight pawn | Rank pawn | Bishop grant | First / second eight cases |
| --- | ---: | ---: | ---: | ---: | ---: |
| Box queen control | 34.38% | 34.38% | 39.06% | 29.69% | 32.29% / 36.46% |
| **`QsN`** | **47.40%** | **56.25%** | **45.31%** | **40.63%** | **52.08% / 42.71%** |
| `QvN` | 38.54% | 50.00% | 35.94% | 29.69% | 36.46% / 40.63% |
| N0 control | 51.11% | 57.81% | 45.31% | 56.67% | 54.17% / 47.62% |
| `ND` | 38.54% | 40.63% | 39.06% | 35.94% | 36.46% / 40.63% |
| **`NDmK`** | **56.77%** | **50.00%** | **56.25%** | **64.06%** | **57.29% / 56.25%** |
| Free Boar `BsR` | 65.56% | 64.06% | 71.88% | 61.67% | 69.79% / 60.71% |

**Prefer QsN as the L2 queen and NDmK as the second L2 knight**, alongside N0.
QsN fits the basket with a conditional 40.63%–54.70% overall range. Its gain
over the fresh Box queen control is 13.02 points, with a 0.52–23.96 range.
QvN remains weak, especially against the Bishop grant; the comparison does not
prove universal superiority for QsN in every army.

NDmK is stable across both halves and reasonably close to the references,
although its 64.06% grant matchup deserves attention in playtesting. Its
50.00%–63.03% conditional overall range and 48.96% Black score support keeping
it without an immediate nerf. ND stays weak. There is no current need to
schedule the intermediate NDmW/NDmF variants merely because they are available.

The fresh N0 result supports its earlier 54.69% selection. Its new 51.11%
overall uses fifteen shared cases because one grant game reached the ply cap.
Both results retain their own contexts rather than becoming one pooled score.

## Keep Free Boar, with a broader strength concern

Retain Free Boar as requested. Its Rank-pawn score is lower than the earlier
82.81%, but remains high at 71.88%. This time it also scores 64.06% against
Knight pawn and 61.67% against Bishop grant. The new strength signal is broader
than the Rank-pawn counter seen in the earlier 59.38% screen. Its conditional
overall range, 55.00%–73.89%, still leaves
uncertainty around the 60% screening boundary.

Prioritize Free Boar in human counterplay and mixed-army review. Preserve its
movement and the fixed references during that review; this audit schedules
neither a nerf nor another full round robin.

## Coverage and next decision

N0/grant on case 59 and Free Boar/grant on case 62 each contain one truncated
game. Their completed color partners remain in the journal but are excluded
from paired scores. Each overall row therefore uses 90 games across fifteen
shared cases; its individual matchup cells retain other complete pairs. The
truncations are not converted into draws, losses or engine errors.

Choose QfN, QsN and NDmK for the next playable-roster integration and human
playtests. The queen family still needs another distinct balanced choice per
tier; QfhN remains a stronger alternative rather than closing that design
question automatically. Do not launch new knight refinements or reprice QcC
without a specific follow-up question.

All results use sixteen related fixed cases at 40k nodes and the predeclared
family search priors. They are conditional scores, not material values or
individual-piece Elo. Original execution manifests and native proofs were not
supplied; reconstructed descriptors verify recorded context, not executable
identity or independently replayed outcomes.

```powershell
npm.cmd run balance:review-v18-completion
```

The review preserves historical profiles and studies and starts no new games.
