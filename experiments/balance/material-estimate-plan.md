# Material compensation: Amazon and ordinary-piece control

**Closed at 320 games: 256 control + 64 Amazon.** The [result audit](results/material-pilot-001.md) finds no scoring or legal-move discrepancy, but the control never reaches compensation within two to five removed pawns. It does not validate a conventional material scale. Leave the remaining 192 games unused; the protocol below is preserved for reproduction, not a request to continue.

Version 16 asks how much ordinary material compensates for upgrading a queen
to the unchanged Amazon, `queen.purple@1` (`QN`). Estimate this added benefit
directly, using the [balancing strategy](../../docs/balancing-strategy.md).
The fixed pilot contains **512 games**: one 256-game control, then 256 Amazon games.
No engine values or movements are tuned during the experiment.

## Armies and compensation

Both phases give Army A an advantage and remove ordinary pawns from A to
measure where its paired point score crosses 50%:

| Phase | Army A before pawn removal | Army B | Question |
| --- | --- | --- | --- |
| Control | Ordinary army missing one rook | Ordinary army missing its queen | Does the method recover a plausible queen-minus-rook material difference? |
| Amazon | Ordinary army with its queen upgraded to Amazon | Full ordinary army | What ordinary-material compensation offsets the Amazon upgrade? |

The control is **queen-versus-rook material odds**, not a literal queen-to-rook
replacement on one square. Its familiar expected difference is about four pawns:
queen ≈9 minus rook ≈5. This is a conventional reference, not an official exact
400-centipawn law. Development and castling also differ between these armies.

Test **2, 3, 4 and 5 removed pawns** in two predeclared nested layouts. Squares
below use White's perspective; Black uses the same files on its own starting ranks.

| Layout | Remove the first 2/3/4/5 pawns from this order | Control's missing A rook |
| --- | --- | --- |
| Left | a2, b2, c2, f2, g2 | a1 |
| Right | h2, g2, f2, c2, b2 | h1 |

Army B's missing control queen is on d1. Amazon replaces A's d1 queen.
The two layouts remain distinct at every tested dose. The d/e pawns stay present
so the same opening prefixes are legal throughout. Pawn removal changes king
cover, development and promotion potential; two layouts expose some of this bias
but do not eliminate it. Define **100 material centipawns per reference pawn**
as a reporting convention, separate from raw MG/EG values and displayed engine scores.

Each phase has `4 doses × 2 layouts × 16 prefixes × 2 colors = 256 games`.
Both engines use Skill 20, **100,000 nodes**, one thread, 32 MB hash and a 400-ply
limit. The seed is 42. The [configuration](material-estimate.json) fixes the
prefixes, armies and settings. One complete registry/profile includes Amazon in
both phases; ordinary and Amazon evaluation remain unchanged. No Blink is present.

## Three cumulative sample sizes

Run the complete control once, inspect it, then start each Amazon stage explicitly.
Every Amazon opening block contains all eight dose/layout cells and both colors.
Schedules group games by opening block, retaining seeded comparison order and
adjacent color pairs within each block, so live estimates become available early.

| Amazon stage | New opening prefixes | New games | Cumulative games |
| --- | ---: | ---: | ---: |
| 1 | First 4 | 64 | 64 |
| 2 | Next 4 | 64 | 128 |
| 3 | Last 8 | 128 | 256 |

Thus `x = 64`, `y = 64`, `z = 128`. Cumulative samples double, which gives more
useful precision comparisons than equal additions. Random error often falls
roughly with `1/√N`; doubling N suggests a factor of `1/√2`, not twice the accuracy.
Larger samples do not remove evaluation or layout bias. Later checkpoints add
different predeclared opening patterns as well as more games, so changes measure
nested-cohort stability rather than the isolated effect of sample count. The
checkpoints share earlier games and are not independent replications.

Save immutable estimates in `estimates/control.json`, `estimates/amazon-64.json`,
`estimates/amazon-128.json` and `estimates/amazon-256.json`, preserving the contributing
games, opening blocks and frozen definitions. Filenames denote scheduled sample
sizes; report actual scored coverage separately. `material-report.json` and `.md`
are live partial reports, refreshed after finished games. The terminal prints the
current provisional estimate or explains how many paired blocks are still missing.
Truncations and failed attempts are unscored; finalized
game counts alone do not imply full estimator coverage. Stop/resume preserves the
same scheduled blocks. Do not select a checkpoint because its answer looks preferable.

## Estimate and inspect

Score complete color pairs and retain opening blocks only when all eight
dose/layout cells are scored. Report excluded coverage, average openings equally,
and show dose curves pooled and separately for each layout. Estimate compensation at the 50%
crossing using a decreasing isotonic fit and interpolation **only between tested
doses**. Keep raw reversals and layout disagreements visible. A flat 50% region
is an interval; a curve without a crossing yields a one-sided bound or an
unresolved estimate. Do not extrapolate a precise answer outside 2–5 pawns.

Resample whole opening blocks, retaining every dose/layout/color pair together.
With at least eight usable opening blocks, report a deterministic 95% bootstrap
**conditional stability band**, including unbracketed resamples. The first
four-opening checkpoint is exploratory and has no bootstrap band. These fixed,
related prefixes do not support a universal confidence claim.

Compare the control with the conventional four-pawn expectation, its range,
completion and layout sensitivity. A surprising result may expose a weak method
or contextual material effects; inspect it before interpreting the Amazon result.
Do not rescale Amazon estimates merely to make the control equal 400.

The control can be reused while the engine, reference evaluation, rules/profile,
handicap method and search effort remain compatible. It need not accompany every
piece or every checkpoint. Repeat it after a consequential protocol change or
concerning diagnostics. Passing it does not certify every fairy-piece estimate.

## Commands and stopping boundary

Use a new directory and the bundled version-16 Windows engine. Linux/macOS needs
`FAIRY_STOCKFISH_PATH` pointing to the matching native build.

```powershell
npm.cmd run balance:material -- --check
npm.cmd run balance:material -- --out balance-results/material-estimate --stage control --jobs 3
```

After inspecting the control, launch the Amazon stages in order:

```powershell
npm.cmd run balance:material -- --out balance-results/material-estimate --stage 1
npm.cmd run balance:material -- --out balance-results/material-estimate --stage 2
npm.cmd run balance:material -- --out balance-results/material-estimate --stage 3
```

The first launch writes `material-campaign.json`, freezing identities, worker
count and the engine diagnostic's actual ordinary-rook, queen and Amazon MG/EG
values. `--check` also probes those tables without searches. Resume an existing
incomplete stage or generate a report without starting games:

```powershell
npm.cmd run balance:material -- --resume balance-results/material-estimate
npm.cmd run balance:material -- --report balance-results/material-estimate
```

Add `--stage control`, `1`, `2` or `3` to resume when needed. `q` or Ctrl+C stops
now, `g` finishes active games, and `p` finishes active color pairs. Neither
completion nor stopping launches the next stage. Keep the entire campaign
directory and matching build together.

Close the pilot at **512 scheduled games** with a contextual compensation range
or an explicit unresolved result. A failed bracket or wide band does not trigger
more doses, repetitions or a follow-up batch. Use a usable Amazon bonus Δ as a
provisional level-3 target, with roughly Δ/3 and 2Δ/3 for levels 1 and 2; later
candidate comparisons still need human feedback and their own bounded questions.
