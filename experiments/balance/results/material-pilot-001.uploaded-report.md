# Material compensation pilot

320/512 games finalized. 512 scheduled games maximum. No extrapolation, automatic extra stage, or sample-size selection based on the preferred estimate.

Checkpoints are cumulative and dependent; sample sizes are not guaranteed accuracy levels. A snapshot filename denotes planned games, while scored coverage is reported separately.

## Queen-versus-rook odds control

256/256 scheduled games finalized; 256 scored paired games, 16/16 complete matched opening blocks. 0 paired scored games excluded from the balanced estimate.

Above the tested 500 material cp boundary; no extrapolation.

| Compensation (material cp) | Raw A score | Left raw | Right raw | Monotone fit |
| --- | ---: | ---: | ---: | ---: |
| 200 | 100.0% | 100.0% | 100.0% | 100.0% |
| 300 | 97.7% | 96.9% | 98.4% | 97.7% |
| 400 | 89.8% | 89.1% | 90.6% | 89.8% |
| 500 | 82.8% | 82.8% | 82.8% | 82.8% |

- left: Above the tested 500 material cp boundary; no extrapolation.
- right: Above the tested 500 material cp boundary; no extrapolation.

95% opening-resampling stability band: 500 to above tested range material cp. Fixed related openings make this conditional, not universal confidence.

Raw reversals: 0. Inspect layout differences; the fit does not remove their bias.

Queen-versus-rook odds proxy. About 400 material cp is a conventional diagnostic expectation, not exact ground truth; do not rescale Amazon results to force agreement.

## Amazon-over-queen compensation

64/64 scheduled games finalized; 64 scored paired games, 4/4 complete matched opening blocks. 0 paired scored games excluded from the balanced estimate.

400–500 material cp bracket; interpolated crossing about 460 cp (provisional).

| Compensation (material cp) | Raw A score | Left raw | Right raw | Monotone fit |
| --- | ---: | ---: | ---: | ---: |
| 200 | 81.3% | 87.5% | 75.0% | 81.3% |
| 300 | 75.0% | 81.3% | 68.8% | 75.0% |
| 400 | 71.9% | 62.5% | 81.3% | 71.9% |
| 500 | 34.4% | 31.3% | 37.5% | 34.4% |

- left: 400–500 material cp bracket; interpolated crossing about 440 cp (provisional).
- right: 400–500 material cp bracket; interpolated crossing about 470 cp (provisional).

Resampling band unavailable: requires-at-least-8-opening-blocks.

Raw reversals: 0. Inspect layout differences; the fit does not remove their bias.

Contextual Amazon-over-queen pawn-compensation estimate. Raw engine MG/EG and displayed evaluation cp are separate units.

The control is reused only within this frozen engine, reference evaluation, rules, node budget, layout method and opening protocol. Relevant protocol changes require a fresh control.
