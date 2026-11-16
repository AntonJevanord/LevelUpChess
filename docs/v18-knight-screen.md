# Version 18: next level-two knight screen

This separate study tests **NH, NDH and N0 at two upgrade points** against
the three unchanged L2 references. The previous knight screen found `NA` weak
at 38.02%, `NFA` near the upper edge at 61.46%, and `NWH` clearly high at 77.08%.
Fresh NA and NFA controls bracket the three new choices without replaying the
whole roster.

| Role | Movement | Ability |
| --- | --- | --- |
| Long-range control | `NA` | Knight jumps plus two-square diagonal jumps |
| Upper-edge control | `NFA` | Knight jumps plus one- and two-square diagonal moves |
| Three-step knight | `NH` | Knight jumps plus three-square orthogonal jumps |
| Two/three-step knight | `NDH` | Knight jumps plus two- and three-square orthogonal jumps |
| Two-point Nightrider | `N0` | Repeated knight leaps on a ray; an occupied landing square stops continuation |

NH and NDH's added orthogonal jumps move and capture, and jump intermediate
squares. They have no one-square orthogonal step. N0 can cross squares between
successive knight landings, but cannot cross an occupied landing square. These
are ordinary capturable pieces, not royal kings.

## Controlled context

All five bodies use the established L2-knight **1203/1352 MG/EG** search prior,
applied to all six engine tables and both colors. References keep their own
frozen values. Use **40,000 nodes per move, one thread, 32 MiB hash and a
400-ply game cap**. Comparisons retain both physical colors and equally weight
the Quiet-tall Knight pawn, Rank pawn and F reserve Bishop grant.

The Nightrider receives a new immutable two-point ID; its movement is identical
to the original `knight.purple@4`. The old L3 body keeps its three-point price,
2326/2211 prior and historical results. This new context changes opponents,
price and the declared search prior, so an improvement cannot be attributed
solely to lowering the purchase cost. Do not pool the old L3 results into the
new scores. Purchase points and engine evaluation values are separate settings.

The frozen 64-case book is rotated to **cases 33–64, then 1–32**. The first
sixteen cases are outside both earlier lower-tier screens. They are not globally
new openings: N0 has appeared in other studies under different contexts. All
five bodies share the same case IDs and prefixes. Trials face references,
not one another.

| Total cases | Games |
| ---: | ---: |
| 8 | 240 |
| 16 | 480 |
| 32 | 960 |
| 64 | 1,920 |

## Run

Use a new output folder and finish any active study first:

```powershell
git pull --ff-only
npm.cmd run balance:v18 -- --study level2-knights --out balance-results/v18-level2-knights --openings 16 --jobs 4
```

Sixteen cases are recommended. The first-eight report is retained automatically.
To extend without replaying completed stages:

```powershell
npm.cmd run balance:v18 -- --study level2-knights --resume balance-results/v18-level2-knights --openings 32
```

The same command supports a total of 64 cases. Omit `--openings` on resume to
keep the existing target. Original workers, engine identity, definitions and
search settings remain frozen in the owned runtime.

```powershell
npm.cmd run balance:v18 -- --study level2-knights --report balance-results/v18-level2-knights
```

Reports show overall/per-reference percentages, White/Black scores, completed
pair coverage, actual opening IDs and conditional opening-block ranges. Matched
differences use the fresh NFA control; a negative difference can be desirable
when narrowing the earlier strong design. NA remains the weaker comparison.
The controls' old scores are historical context, not substitutes for these
fresh matched games.

`q` / Ctrl+C stops now; `g` finishes active games; `p` finishes active color
pairs and pauses the whole study. `--check` validates rules/native values and
positions without playing; `--check --rules-only` omits native proof. Keep the
entire output folder, including its runtime and stage journals, for resume.

No previous study, playable profile or frozen reference is changed. No scored
cloud games are started during setup.
