# Cross-level panel: L1 + L2 versus L3

This experiment compares every eligible pair of one L1 and one L2 board
upgrade against every selected L3 board upgrade. Both armies spend three
upgrade points and keep the ordinary starting material. It uses a new owned
runtime; existing tier panels, playable libraries and puzzle runs stay intact.

## Selection and size

Start from immutable expanded roster 005, with the user's exclusions:

- Exclude all reserve grants while release deployment rules are explored.
- Use restricted Arbalest `RcsNcfN`; exclude full `RcN` (`rook.orange@3`).
- Exclude the L2 reference Knight pawn (`pawn.knight-tall-quiet@1`).
- Exclude the old L3 queen-moving Herald (`pawn.queen-sideways@1`). Keep the
  L2 forward-range Herald `fQ2` and L3 Six-jump Horseman.
- Mark queen+queen packages **unavailable**: a standard army has one queen,
  upgrades do not stack and the experiment introduces no extra queens.

There are **11 L1, 12 L2 and 11 L3 designs**. Of 132 possible L1+L2 pairs,
six queen+queen pairs are unavailable. The remaining **126 teams × 11 L3
opponents = 1,386 scheduled matchups**. The 66 unavailable matchup cells have
no score and do not enter the denominator.

| Total openings | Scheduled games, both colors |
| ---: | ---: |
| 8 | 22,176 |
| 16 | 44,352 |
| 32 | 88,704 |
| 64 | 177,408 |

These are new army comparisons. Earlier one-purchase tier games cannot fill
their cells. Extending this cross-level run retains its own completed games
and collects only the newly requested opening cases.

## Run on Windows

Use the project directory and a new output folder:

```powershell
git pull --ff-only
npm.cmd run balance:v19:cross -- --out balance-results/v19-cross-level --openings 8 --jobs 3
```

The default target is eight total openings. Search uses **40,000 nodes,
Skill 20, one thread and 32 MiB hash per engine**. Four workers are the default;
the example uses three to leave headroom for interactive grant playtesting.
Use `--jobs 4` when dedicating the laptop to the run. The worker count is
retained on resume. Windows selects the supported
`fairy-stockfish-levelup_x86-64.exe`; `--engine PATH` or
`FAIRY_STOCKFISH_PATH` can select another compatible executable.

To validate without collecting games:

```powershell
npm.cmd run balance:v19:cross -- --check --openings 8
```

Add `--rules-only` to omit native-engine checks. Preflight checks exact army
prefixes, movement capabilities and the manual MG/EG value tables. It does not
certify tactical equality. Opening cases are shared globally rather than
selected separately to give each matchup a near-zero evaluation.

## Stop, resume and extend

`q` / Ctrl+C stops now; `g` finishes active games; `p` finishes active color
pairs. Keep the entire run folder, including the private runtime and stage
journals. The run does not extend beyond its requested target automatically.

```powershell
npm.cmd run balance:v19:cross -- --resume balance-results/v19-cross-level
npm.cmd run balance:v19:cross -- --resume balance-results/v19-cross-level --openings 16
npm.cmd run balance:v19:cross -- --resume balance-results/v19-cross-level --openings 32
npm.cmd run balance:v19:cross -- --resume balance-results/v19-cross-level --openings 64
```

These targets are **totals**, not additional opening counts. Completed stages
are verified and skipped; interrupted stages resume under their original
engine, rules and worker identities. Changed movement, selection, priors or
placement policy requires a new experiment declaration and output directory.

Offline reporting starts no games:

```powershell
npm.cmd run balance:v19:cross -- --report balance-results/v19-cross-level
```

## Placements and engine limits

Different-family teammates use the established home squares: pawn c2, knight
b1, bishop c1, rook a1 and queen d1, expressed relative to White for either
army. Same-family teammates use the two available homes: c2/e2, b1/g1,
c1/f1 or a1/h1. The L3 opponent uses its established single-purchase home.

For same-family teams, the assignment swaps by
`(global opening index + eight-case batch index) % 2`. Both physical-color
games use the same relative assignment. Each eight-case batch covers both
placements; the next batch swaps the opening families between them. At sixteen
openings, each opening family has appeared with both assignments.

Each team gets a profile containing its two designs and all eleven L3
opponents: **13 custom types**, below the engine's twenty-type limit. Letters
may differ between groups; the archived semantic IDs, mappings, profiles and
manual priors determine their meaning. Ordinary kings, castling, en passant
and standard pawn promotions retain the declared piece rules.

## Read the results

The run folder contains `panel-report.md` for summaries, `cross-matrix.md`
for the full matchup table and `cross-cells.csv` for spreadsheet analysis.
`panel-report.json` retains the structured results. These refresh after each
completed team group and when pausing; completed opening targets are also
saved under `reports/openings-8`, `openings-16`, `openings-32` and `openings-64`.

Reports distinguish complete color-paired scores from errors, truncations and
unpaired results. Draws count as half a point. Team and L3 summaries include
opponent coverage and physical-color results; partial coverage is provisional.
The full matchup matrix retains unavailable queen cells separately.

The L1/L2 component summaries mean **teams containing this design**, averaged
over their legal partner/opponent basket. They do not isolate an individual
piece's contribution. Queen designs have fewer legal partners, and teammates
can reinforce or obstruct each other. Compare the underlying cells before
interpreting an overall score.

Equal three-point budgets test purchase brackets and interactions. They do
not identify a universal individual Elo or pawn-value scale. Later unequal-cost
anchors and a dedicated material-analysis adapter remain separate work.
The raw stage journals retain move histories, profiles, outcomes and first
post-opening engine evaluations for those later analyses; this command does
not silently feed mixed games into the existing same-tier material fitter.

Report checkpoints retain completed 8/16/32/64-opening prefixes. Starts and
results are the default log output; `--log plies` adds progress every ten plies.
No scored cloud campaign is collected while preparing this command.
