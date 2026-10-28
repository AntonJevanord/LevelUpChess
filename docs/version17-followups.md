# Version-17 follow-ups

The first three experiments completed all **1,312 games**, with no errors or
truncations. The [archived analysis](../experiments/balance/results/v17-screen-001.report.md)
preserves the uploaded journals and reports. The four reference definitions,
drop rules and engine settings stay fixed.

## What the screen tells us

Scores count a draw as half a point. Each level-3 row averages four equally
represented opponents: 64 games, but only eight shared opening groups. Each
individual matchup has 16 games; changing one loss to a win moves it by 6.25
percentage points. These are screening results, not precise strength estimates.

| Candidate | Score against references | Next step |
| --- | ---: | --- |
| Rook pawn | 32.81% | Test two capture buffs |
| Queen pawn | 54.69% | Keep; add eight openings |
| Nightrider | 49.22% | Keep; add eight openings |
| Princess knight | 60.16% | Keep; check matchup spread |
| Grid knight | 57.81% | Keep; add eight openings |
| Mating bishop | 82.03% | Reduce capture options |
| Vertical bishop | 79.69% | Remove zebra jumps |
| Archbishop | 60.16% | Keep; borderline, not an obvious outlier |
| Ranged rook | 53.13% | Keep; check matchup and color effects |
| Side rook | 67.19% | Make sideways camel jumps quiet-only |
| Sideways queen | 42.97% | Keep provisionally |
| X-ray queen | 57.81% | Keep; check matchup and color effects |
| Zebra queen | 39.06% | Keep provisionally; near the lower boundary |

The four revision signals survive removing any one opening: Rook pawn remains
30.36–36.61%, Mating bishop 79.46–83.93%, Vertical bishop 76.79–84.82%, and Side
rook 64.29–69.64%. These are sensitivity ranges, not confidence intervals.
Ranged rook scored 65.63% as White versus 40.63% as Black; X-ray queen scored
76.56% versus 39.06%. More starts should precede a redesign of those pieces.

The 2v2 pilot is retained without another automatic run. Vanguard–Amazon led
at 60.0% across its five opponents; other team averages were 44.4–50.6%.
Eight opening groups do not establish a partnership bonus or justify changing
the frozen references.

## Decisions after this batch

Use **40–60% against the equally weighted reference panel** as a provisional
design target. A matchup outside **35–65%** is an investigation flag. Neither
threshold is a confidence interval or a mechanical pass/fail rule.

1. Combine old and new results only for unchanged immutable IDs. Show both
   eight-opening cohorts as well as their sixteen-opening total.
2. Review weak or strong aggregate scores together with opponent, opening and
   physical-color splits. A lone extreme cell does not establish a counter.
3. Retain a candidate near the target unless a repeated extreme matchup or
   human playtesting identifies a concrete problem. Borderline results can
   remain provisional rather than trigger endless redesigns.
4. Change a design when the effect is broad and survives both cohorts. If a
   practical decision still depends on an uncertain matchup, declare one capped
   targeted confirmation; do not restart the full roster.

These criteria are declared for the follow-up, after seeing the initial screen.
The fixed opening cases limit generalization even after doubling their count.

Every matchup matrix also shows **Overall score**. For replacement and pawn/
grant panels it averages the four references; direct bundle matchups do not
enter that average. Reference 2v2 teams average their five opponents. Draws
count half a point. During an unfinished run, the overall column uses opening
cases with complete color pairs against every opponent, so uneven worker
progress cannot change the opponent weights. Its case count remains visible.

Refresh an existing completed report without playing more games:

```powershell
npm.cmd run balance:v17 -- --experiment level3 --report balance-results/v17-level3
```

The same `--report` mode works for the other experiment names and run folders.

## Research candidates

These alternatives are experiment-only. The playable workshops keep their
existing options while the alternatives are evaluated. Every changed behavior
has its own immutable ID; historical definitions and outcomes stay separate.

| Candidate | ID | Movement | Change |
| --- | --- | --- | --- |
| Rook pawn: backward capture | `pawn.purple@7` | `mRceB2` | Reuse historical Ranging pawn; two-square captures on all diagonals |
| Rook pawn: forward range | `pawn.purple@13` | `mRcfB` | Unlimited forward diagonal captures; retain quiet rook movement |
| Mating bishop: short arsenal | `bishop.purple@17` | `BcWcN` | Keep orthogonal step and knight captures; remove two-square diagonal/orthogonal captures |
| Vertical bishop: short arsenal | `bishop.purple@18` | `BvWvN` | Keep vertical steps and tall knight jumps; remove zebra jumps |
| Side rook: quiet camel | `rook.purple@14` | `RFsNmsC` | Retain diagonal steps and wide knight jumps; camel jumps cannot capture |

There is relevant older pawn evidence, under different protocols:

| Historical pawn | Movement | Score versus Amazon | Games |
| --- | --- | ---: | ---: |
| Ranging pawn | `mRceB2` | 48.75% | 80 |
| Courier pawn | `mfRmsRcfB` | 40.00% | 80 |
| Original ranging pawn | `mRceB` | 71.43% | 14 |

The first two used 100,000 nodes per move. They support testing backward
captures before granting unlimited captures in every direction; they are not
pooled into this 20,000-node experiment. Sources: [Amazon alternatives](../experiments/balance/results/amazon-alternatives-001.md)
and the [earlier screen](../experiments/balance/results/level3-screen-001.md).

Against references alone, three Bishop pawns scored **24.22%**, three Returning
pawns **19.53%**, and three `fW` grants **41.41%**. The pawn bundles need help;
the grant is less clearly weak. Test these three alternatives separately:

| Three-point bundle | ID | Movement | Meaning |
| --- | --- | --- | --- |
| Three retreating Bishop pawns | `pawn.blue@4` | `mFfmWfceFifmnD` | Quiet diagonal steps in all directions, quiet forward step, normal forward diagonal captures and clear initial double step |
| Three two-step pawns | `pawn.blue@5` | `fmW2fceF2` | Repeatable clear forward movement and forward diagonal captures, each one or two squares |
| Three diagonal grants | `king.reserve-pawn@2` | `fF` | Forward diagonal move/capture steps; finite reserves with unchanged drop rules |

`fF` trades straight-file movement for two diagonal directions and remains
colorbound; a buff is plausible, not guaranteed. These guards are nonroyal and
do not promote. Both new pawn types use ordinary QRBN promotion. Put the range
after the atom: `fceF2`, not `cfe2F`.

The retreating Bishop pawn retains the engine's existing quiet-diagonal
en-passant convention: visiting an empty en-passant target is quiet and leaves
the bypassed pawn. The two-step pawn has capture-only diagonals and can capture
en passant. Two-square rays need a clear intervening square.

## Run the follow-ups

| Experiment | Cases | Games | Reuse |
| --- | ---: | ---: | --- |
| `level3-confirm` | Eight new | 576 | Retain the first eight for nine unchanged candidates |
| `level3-revisions` | Old eight + new eight | 640 | Five alternate designs; no reruns of their predecessors |
| `pawn-grants-revisions` | Old eight + new eight | 384 | Three new bundles versus the four references |

Cap: **1,600 new games**, launched separately. No repeat 2v2 games or reference
controls are scheduled. Settings remain 20,000 nodes, one thread, 32 MiB hash,
Skill 20 and 400 plies. The eight new prefixes are `e4 e6`, `d4 Nf6`, `Nf3 d5`,
`c4 c5`, `e4 d5`, `d4 f5`, `g3 d5`, and `b3 e5`. All are two plies, retaining
the same one-turn reserve deployment delay as the first batch's nonempty starts.

Update only after existing runs finish, then run one campaign at a time:

```powershell
git switch version_17
git pull --ff-only
npm.cmd run balance:v17 -- --experiment level3-confirm --out balance-results/v17-level3-confirm --jobs 4
npm.cmd run balance:v17 -- --experiment level3-revisions --out balance-results/v17-level3-revisions --jobs 4
npm.cmd run balance:v17 -- --experiment pawn-grants-revisions --out balance-results/v17-pawn-grants-revisions --jobs 4
```

Every launch performs native preflight. Substitute `--check` for the output/job
options to validate without playing. Stop/resume and offline `--report` work as
in the [initial guide](version17-experiments.md). The selected campaign alone
runs; the commands above can also be entered individually.

Combine the unchanged candidates' old results with new completed color pairs,
and include alternate-design results when available:

```powershell
npm.cmd run balance:v17:review -- --confirm balance-results/v17-level3-confirm --revisions balance-results/v17-level3-revisions --pawn-grants balance-results/v17-pawn-grants-revisions --out balance-results/v17-followup-review
```

Supply only the completed or partial folders you have; at least one input is
required. This offline command starts no games. It keeps altered designs
separate, shows old/new cohorts, and preserves incomplete-pair coverage.
