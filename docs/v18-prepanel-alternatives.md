# Version 18: alternatives before the next panels

These three optional studies finish the targeted design questions before the
version-19 panels. They test new purchase contexts for the queen swap, two
intermediate knights, three shorter-sideways bishops and seven L3 knights.
Playable libraries, frozen references and completed studies remain unchanged.

## Trials and controls

| Study | Trial movements | Fresh comparisons |
| --- | --- | --- |
| `prepanel-level1` | `QvN` at one point | Selected L1 `QfN` |
| `prepanel-level2` | `QcC` at two points; `NDmW`, `NDmF`; `BsW2`, `BsWsnN`, `BsW3` | L2 `QsN`, `NDmK`, Free Boar `BsR` |
| `prepanel-level3` | `NWH`, `NH`, `NZ`, `NAZ`, `NAD`, `NADmK`, `NDH` | Frozen Unicorn `NC` |

Each body faces only the fixed references for its tier, with both physical
colors. L1 uses single purchases, including queens. L2 and L3 also use one
purchase per side, costing two or three points respectively. This is a set of
reference screens rather than a round robin among the experimental pieces.

QvN keeps its earlier geometry and gains the two backward-tall knight jumps
over QfN. QcC keeps queen movement and eight capture-only camel jumps. Both get
new immutable IDs at their proposed prices; their old results remain separate.

NDmW and NDmF keep ND's knight and two-square orthogonal jumps, adding quiet
orthogonal or diagonal steps respectively. Adjacent steps cannot capture or
give check. They fill the space between ND and the quiet-king-step NDmK.

BsW2 and BsW3 slide sideways up to two or three squares through a clear path;
they do not jump intermediate squares. BsWsnN adds a single sideways step and
the Crusader's blocked wide-knight component. For d4–f5, e4 must be empty;
f4 does not block that leap in the supported engine rule. The existing
`BsW2snN` spelling is equivalent to the frozen Crusader `BsR2nsN`.

All L3 knights retain ordinary knight jumps. W adds one-square orthogonal
moves, D two-square orthogonal jumps, H three-square orthogonal jumps,
A two-square diagonal jumps, and Z the (2,3) zebra jump. NADmK adds quiet
adjacent king steps; its captures remain NAD's jumps.

## What was already tested

NWH was the L3 Grid knight. Earlier 20k studies scored it at 54.69% and
61.72% over separate sixteen-case screens. Its search prior was the frozen
Unicorn's 1663/1877, which this study retains. The new matched 40k context
does not overwrite those results.

NH, NAD and NDH have earlier L2 results, but those used two-point budgets and
1203/1352 priors. NZ appeared as a seven-point reserve Okapi grant, which is
not an L3 replacement-knight test. No earlier exact NAZ or NADmK screen was
found. BsW2 previously ran high at L1 (62.50% in a two-copy 20k screen); that
does not establish its strength as a single L2 purchase.

## Search policy and openings

Every study uses **40,000 nodes**, Skill 20, one thread, 32 MiB hash and a
400-ply cap. Controls and their trials share the declared family prior:

| Group | MG / EG |
| --- | ---: |
| L1 queens | 2771 / 2833 |
| L2 queens | 3738 / 4155 |
| L2 knights | 1203 / 1352 |
| L2 bishops | 1782 / 1756 |
| L3 knights, including the NC comparison | 1663 / 1877 |

References retain their own frozen priors. All declared pairs apply to all
six native value tables and both colors. These settings are search priors,
not fitted material values. Repricing the queen treatments and L3 knights
also changes their opponent/search context; these are not pure price-effect
experiments, and earlier scores are not pooled into the new reports.

The studies reuse the frozen casebook in its canonical order, **cases 1–64**.
The first sixteen cases are reused positions, not a new held-out book. Fresh
controls use exactly the same cases as their trials. Reports preserve shared
coverage, per-reference scores, physical colors, opening halves and conditional
opening-block ranges.

| Total cases | L1 | L2 | L3 | Combined games |
| ---: | ---: | ---: | ---: | ---: |
| 8 | 96 | 432 | 512 | 1,040 |
| 16 | 192 | 864 | 1,024 | 2,080 |
| 32 | 384 | 1,728 | 2,048 | 4,160 |
| 64 | 768 | 3,456 | 4,096 | 8,320 |

## Run

Use separate new folders and run one study at a time:

```powershell
git pull --ff-only
npm.cmd run balance:v18 -- --study prepanel-level1 --out balance-results/v18-prepanel-level1 --openings 16 --jobs 4
npm.cmd run balance:v18 -- --study prepanel-level2 --out balance-results/v18-prepanel-level2 --openings 16 --jobs 4
npm.cmd run balance:v18 -- --study prepanel-level3 --out balance-results/v18-prepanel-level3 --openings 16 --jobs 4
```

Resume with the same selector and `--resume DIRECTORY`; omit `--openings` to
retain the existing target. `--report DIRECTORY` refreshes the report without
playing. Use cumulative 32/64 targets only for a question left unresolved by
the first sixteen cases. Changed definitions or priors require a new context.
The first-eight reports are retained automatically.

`q` / Ctrl+C stops now, `g` finishes active games and `p` finishes active color
pairs. Keep each complete output folder, including its owned runtime and stage
journals, for resume and review.

## Wraith and the panel boundary

The selected Wraith remains **QgB0**, the deliberately weaker exploration
choice. Its latest fixed-reference scores were 32.03% at 40k and 27.73% at 80k.
The already tested long-side alternative `QgmQ0gcBgcsR0` reached 38.67%/37.89%.
The full-diagonal/sideways version reached 57.03%/60.42%, above the intended
below-50% role. No replacement or additional Wraith trial is selected here.

No other family needs another speculative revision before the panels. Keep
the shortlisted L1/L2 bodies, confirmed L3 pawns and bishops, and revised
Cataphract `RsCfC` available for the roster review. Existing N0mF and N0mW
remain viable L3 knight fallbacks if the new ideas disappoint.

Review these outcomes, settle the roster and then follow the
[version-19 panel plan](version19-plan.md). This preparation starts no scored
cloud games and does not switch branches or activate a new playable roster.
