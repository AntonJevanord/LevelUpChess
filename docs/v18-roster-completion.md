# Version 18: queen and second-knight trials

The first sixteen cases are now [completed and reviewed](v18-completion-review.md).
This document preserves the prospective protocol; no new run starts automatically.

Retain Free Boar `BsR` as the second L2 bishop candidate. Its 59.38% screen
score included 82.81% against Rank pawn, but only 46.88% and 48.44% against
the other references. New cases can check whether that counter repeats;
mixed-army play can later test its contribution against other upgrades.

This preparation adds five queen designs and two knight designs in separate
L1 and L2 studies. No existing run, playable profile or reference is replaced.
One grant per tier is sufficient; second grant designs are not required.

## New designs

Every queen retains ordinary queen moves and captures.

| Cost | Trial | Added ability |
| ---: | --- | --- |
| 1 | `QcC` | Eight capture-only camel jumps; no quiet camel jumps |
| 1 | `QfN` | The two tall forward knight jumps, moving or capturing |
| 1 | `QfhN` | All four forward knight jumps, moving or capturing; sanity comparison |
| 2 | `QsN` | Four wide sideways knight jumps, moving or capturing |
| 2 | `QvN` | Four tall vertical knight jumps, moving or capturing |
| 2 | `ND` | Ordinary knight jumps plus four two-square orthogonal jumps |
| 2 | `NDmK` | ND plus one-square king moves to empty squares only |

For White on d4, `fN` adds c6/e6, while `fhN` also adds b5/f5. `sN` adds
b3/b5/f3/f5; `vN` adds c2/c6/e2/e6. Forward reverses for Black. Jumps cross
intervening pieces; friendly landing squares stay blocked. NDmK's adjacent
quiet moves do not become adjacent captures or checking attacks.

ND is untested at this price. The earlier knight results leave room between
weak and strong compounds:

| Earlier L2 knight | Separate 40k screen scores | Assessment |
| --- | --- | --- |
| `NsWsD` | 33.85%, then 34.38% | Weak |
| `NA` | 32.81%, 38.02%, then 28.65% | Weak |
| `NH` | 31.77% | Weak |
| `NWD` | 66.15% | High |
| `NWH` | 77.08% | High |
| `NFA` | 61.46%, then 69.79% | High |
| `NAD` | 64.06% | High |
| `NDH` | 75.00% | High |
| `N0` | 54.69% | Selected |

The selected N0 Nightrider is the fresh knight comparison. Only if ND and
NDmK leave an unresolved gap should a later study consider NDmW or NDmF.
Those intermediate revisions are not scheduled now.

## Fixed protocol

Both studies use 40,000 nodes per move, Skill 20, one thread, 32 MiB hash and
a 400-ply limit. Every cell retains both physical colors and the same opening
cases. Trials face fixed references, not one another.

`level1-queens` contains QcC, QfN, QfhN and a fresh Baby Amazon `QmN`
control. Each side purchases one one-point upgrade; opponents are Two-step
pawn, King-step pawn and Pawn grant. All four queens share the earlier L1
queen **2771/2833 MG/EG** search prior.

`level2-completion` contains QsN, QvN, a fresh Box queen control, ND, NDmK,
a fresh N0 control and unchanged Free Boar. Each side purchases one two-point
upgrade against Quiet-tall Knight pawn, Rank pawn and Bishop grant. Queens
share the Box queen's **3738/4155** prior; ND, NDmK and N0 share **1203/1352**.
Free Boar retains its own **1782/1756**, and every reference retains its frozen
prior. All pairs apply to all six native engine tables and both colors. These
are controlled search settings, not fitted material values.

The casebook order is **49–64, then 1–48**. The first sixteen cases are new
for these trials and fresh comparisons, not globally new openings. Earlier
completed journals remain separate. Reports retain overall and per-reference
scores, White/Black scores, opening halves, conditional opening-block ranges
and matched changes against the appropriate fresh family control. Free Boar
has its own row, without a fabricated control gain.

| Total opening cases | L1 queens | L2 completion | Combined games |
| ---: | ---: | ---: | ---: |
| 8 | 192 | 336 | 528 |
| 16 | 384 | 672 | 1,056 |
| 32 | 768 | 1,344 | 2,112 |
| 64 | 1,536 | 2,688 | 4,224 |

## Run and continue

Run one study at a time, using new folders:

```powershell
git pull --ff-only
npm.cmd run balance:v18 -- --study level1-queens --out balance-results/v18-level1-queens --openings 16 --jobs 4
npm.cmd run balance:v18 -- --study level2-completion --out balance-results/v18-level2-completion --openings 16 --jobs 4
```

The first-eight checkpoint is retained even when starting with sixteen cases.
Resume a paused study without changing its target:

```powershell
npm.cmd run balance:v18 -- --study level1-queens --resume balance-results/v18-level1-queens
npm.cmd run balance:v18 -- --study level2-completion --resume balance-results/v18-level2-completion
```

Add `--openings 32` or `--openings 64` on resume for that cumulative total;
completed stages are verified and skipped. `--report DIRECTORY` refreshes
reports without playing. `q` / Ctrl+C stops now, `g` finishes active games,
and `p` finishes active color pairs. Keep each entire output folder, including
its owned runtime and stage journals.

## Roster coverage

These are candidate slots, not claims that the new trials already passed.

| Family | Level 1 | Level 2 |
| --- | --- | --- |
| Pawn | Two-step / King-step | Quiet-tall / Rank; Bishop-pawn alternative |
| Knight | NW / NmQ | N0 / ND or NDmK, pending results |
| Bishop | BsW / BgB0 | BvN / Free Boar BsR |
| Rook | RceF / RmBgmQ0 | Blink / RcN |
| Queen | QcC / QfN, with QfhN comparison | QsN / QvN, pending results |
| King grant | Pawn grant | Bishop grant |

This fills two proposed choices per ordinary piece at L1/L2 once the new
queens and second knight earn acceptance. Grants keep one choice per tier.
At L3, quiet-step Nightriders N0mF and N0mW are already promising alternatives
alongside Unicorn; historical plain N0 is not a distinct balanced choice at
both two and three points. Any playable activation gets a new profile that
preserves historical saves and experiments.
