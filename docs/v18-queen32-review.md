# Version 18: thirty-two-opening L1 queen review

**Keep QfN as a level-one choice.** Its score is now 50.78%, with all three
reference matchups between 45.31% and 55.47%. QvN also fits the L1 screening
target at 53.76%. Both can enter the planned version-19 panel; another immediate
movement change or automatic sixty-four-case extension is unnecessary.

The [archived evidence](../experiments/balance/results/v18-queen32-001.report.md)
preserves the uploaded report and four complete stage journals. There are
**384 finalized first attempts: 383 completed results, one unscored ply-cap
truncation and 191 complete scored color pairs**, with no errors or retries.
Draws count half a point.

| Body | Overall | Two-step pawn | King-step pawn | Pawn grant | White / Black |
| --- | ---: | ---: | ---: | ---: | ---: |
| **QfN** | **50.78%** | **55.47%** | **45.31%** | **51.56%** | **57.81% / 43.75%** |
| QvN | 53.76% | 56.45% | 48.44% | 54.69% | 58.60% / 48.92% |

## Why the larger case set matters

The earlier half of this study made QvN look substantially stronger. The next
complete common cases reversed that ordering:

| Common cases | QfN | QvN |
| --- | ---: | ---: |
| First sixteen | 45.31% | 57.81% |
| Next fifteen complete common cases | 55.56% | 49.44% |
| All thirty-one complete common cases | 50.27% | 53.76% |

The matched lead for QvN is **3.49 percentage points**, with a conditional
opening-block 95% range of **−4.58 to +13.44 points**. That supports keeping
QfN without proving exact equality or that backward knight moves have no value.
QvN contains QfN's two forward-tall jumps and adds the two backward-tall jumps;
the observed gain under this protocol is modest and uncertain.

The headline overall scores differ by 2.98 points because they use different
case coverage. QfN's 50.78% includes all thirty-two cases; the matched comparison
uses its 50.27% score on the same thirty-one cases as QvN. Keep those
denominators separate.

## Coverage and context

QvN versus Two-step pawn, case 31 as Black, reached the 400-ply cap. Its valid
completed color partner remains archived but cannot form a scored pair. QvN's
overall omits that case against every reference, leaving 186 games; its
individual matchup cells retain other complete pairs. QfN's overall includes
192 games. The truncation is not converted into a draw or loss.

Both bodies use one-point purchases, 40k nodes, the same 2771/2833 MG/EG search
prior and canonical cases 1–32. These are reused fixed prefixes, not a new
held-out book or 384 independent positions. Conditional ranges describe
sampling over these openings; they do not measure systematic engine bias.

The earlier QfN 44.79% result used cases 49–64 in the preceding queen study.
It remains historical evidence with its original context; it is not replaced
or pooled into this report. This review supplies no outcome-fitted material
value or individual-piece Elo.

Retain **QfN and QvN as the L1 panel candidates**, with QfN kept as the preferred
simple design. Review the remaining L2/L3 alternatives before freezing the
whole version-19 roster. Playable integration remains a separate profile
update preserving historical definitions.

```powershell
npm.cmd run balance:review-v18-queen32
```

The verifier uses pinned reconstructed v0.18.10 compatibility descriptors.
Original execution manifests and native proofs were not supplied, and moves
were not independently replayed. No new games or engine searches start here.
