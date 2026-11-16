# Version 18: Nightrider at level two

The [focused knight screen](v18-knight-screen.md) finished **480 games in
240 complete color pairs**, without errors, retries or move-limit truncation.
Each body played 96 games against the same three level-two references, using
sixteen opening cases and 40,000 nodes per move. Scores count draws as half a
point.

| Body | Overall score | Knight pawn | Rank pawn | Bishop grant | First / second eight cases |
| --- | ---: | ---: | ---: | ---: | ---: |
| `NA` control | 28.65% | 32.81% | 34.38% | 18.75% | 33.33% / 23.96% |
| `NFA` control | 69.79% | 65.63% | 68.75% | 75.00% | 73.96% / 65.63% |
| `NH` | 31.77% | 26.56% | 35.94% | 32.81% | 30.21% / 33.33% |
| `NDH` | 75.00% | 78.13% | 73.44% | 73.44% | 76.04% / 73.96% |
| **`N0` Nightrider** | **54.69%** | **54.69%** | **57.81%** | **51.56%** | **53.13% / 56.25%** |

**Choose unchanged `N0` as the level-two knight design.** It fits the target
against every reference, with similar results in both halves. Its 42 wins,
21 draws and 33 losses give a much closer fit than NH or NDH. Park those two
alternatives at this tier; another immediate movement refinement is unnecessary.
NFA remains an upper comparison rather than the preferred choice.

The Nightrider scores 62.50% as White and 46.88% as Black. Its conditional
opening-block 95% range is **47.92%–61.98%**. These results support the design
choice without establishing an exact 50% strength or proving every matchup
falls inside 40%–60%. Human counterplay and later mixed-army results remain
useful checks; this screen does not require another automatic confirmation run.

All five knight bodies use the same **1203/1352 MG/EG** search prior. The old
level-three N0 used **2326/2211**, different opponents and a different purchase
budget. Keep those historical outcomes separate: this is not a measurement of
the price change alone, nor a material-value estimate.

The [archived evidence](../experiments/balance/results/v18-knights-001.report.md)
retains the exact uploaded report and journals, source hashes and an offline
verifier. Original execution manifests and native proof were not uploaded;
compatibility descriptors reconstruct the declared context, and moves have not
been independently replayed.

```powershell
npm.cmd run balance:review-v18-knights
```

This records the level-two selection. Playable-profile integration remains a
separate roster update; historical level-three profiles and frozen references
retain their tested definitions. No new scored games are started by the review.
