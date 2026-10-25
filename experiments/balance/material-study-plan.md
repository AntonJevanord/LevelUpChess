# Version 16: material estimate convergence study

Test whether more distinct positions stabilize the conditional material
estimates. The fixed cap is **1,152 new scheduled games**, using **four jobs**.
The study is **complete and closed**; see the [results and audit](results/material-study-001.md).
All 1,152 local games finished, and no extension is scheduled. The protocol and
commands below preserve the original design, which replaced the earlier
576-game suggestion. [Native validation](results/material-study-preflight-001.json)
started no completed study games in the cloud.

## Frozen design

Select **384 fresh book positions**. Each supplies one ordinary game, one White
Amazon game and one Black Amazon game. Exclude the [pilot's 32 physical positions](results/material-collection-preflight-001.json)
using placement, turn, castling and en-passant fields, ignoring move counters.
Keep the pilot and external EPDs as separate evidence; do not pool them with this
study or replay their games.

| Setting | Fixed value |
| --- | --- |
| Pieces | Ordinary chess and unchanged `queen.purple@1` Amazon |
| Selection seed | 42 |
| Engine | Automatic evaluation, Skill 20, 20,000 nodes per move |
| Resources | Four game jobs; one search thread and 32 MB hash per engine |
| Game limit | 400 plies; truncations remain unscored |
| Cumulative checkpoints | 384 / 768 / 1,152 games: 128 / 256 / 384 triplets |
| Primary analysis | Pawn = 1 and queen = 9 assumed; other values and score conversion fitted |
| Diagnostic analysis | Unconstrained ordinary-only and combined fits |
| Validation and uncertainty | Five deterministic grouped folds; 200 whole-position bootstrap resamples |

Retain quiet, legal, nonterminal full-army starts under all three conditions.
Freeze book bytes/hash, selected FENs, schedule, rules, engine/source identities,
analysis settings and four-job configuration before play. Each checkpoint waits
for its complete scheduled triplets, preserving cumulative estimates independently
of worker completion order. Collection then continues within this declared cap.

## Original Windows commands

Preserved for reproduction, not a request to repeat the completed study. Use
`--report` on the existing result folder for offline analysis. From the repository folder:

```bat
git pull
npm.cmd ci
npm.cmd run material:study -- --check --book "..\chess-variant-stats\chess.epd"
npm.cmd run material:study -- --out balance-results/material-study --book "..\chess-variant-stats\chess.epd"
npm.cmd run material:study -- --resume balance-results/material-study
npm.cmd run material:study -- --report balance-results/material-study
```

Adjust the book path if needed and use a new output directory. `--check` validates
the declared study without playing games. Resume uses saved positions and the
fixed worker count; supply no new book or jobs. Keep the complete result directory
and matching checkout/engine together. Offline `--report` starts no engine games.

Press **q / Ctrl+C** to stop now, **g** after active games, or **p** after active
pairs. Reports and estimates refresh at cumulative checkpoints and on stop;
starts/results print during collection, without ply logs. The last stage finishes
and exits normally. Stopping does not erase completed games or require replaying
them. No games beyond the 1,152-game schedule start automatically.

Checkpoint JSON/Markdown lives in `checkpoints/384`, `checkpoints/768` and
`checkpoints/1152`; current `material-study-report.md` includes their comparison
table. If a blackout leaves `report.lock`, remove it only after confirming its
recorded process has stopped. Resume automatically handles a stale study/run lock.

Validation passed 632 unit/integration cases, with 36 environment-dependent
cases skipped, all 1,152 native starting positions and eight movement probes.
Two interrupted four-job native invocations preserved move prefixes, the original
manifest and provisional reporting, with zero completed study games.

## Analysis and final decision

Fit expected final score with wins/draws/losses scored 1/0.5/0 and unit total
sample weight per game. Keep all three conditions
for one position together in folds and resamples. Different positions may share
opening ancestry, so ranges remain conditional. Fit the positive score conversion
and preserve both original pawn and queen ridge-penalty terms under the anchor
constraint. Anchors are assumptions; native MG/EG values and purchase costs stay
unchanged.

At each checkpoint report supported values/ranges, rank, convergence, duplicate
histories, sampled games, ordinary rook-imbalance support, phase coverage and
ordinary-only versus combined estimates. Unsupported values are unavailable,
not zero. Preserve checkpoint results so all three sample sizes can be compared.

Use **0.5 pawn as the practical resolution** for the final review: compare the
last two checkpoints' estimate changes, interval half-widths and the ordinary/
combined rook gap against it. These are design-resolution flags, not formal
equivalence tests or a requirement to recover rook = 5. Phase differences and
weak support still limit interpretation.

Close at the cap with one decision: usable within this recorded context, still
too imprecise, or persistently dependent on cohort/model. More data can reduce
sampling uncertainty; it cannot remove selection bias or make chosen anchors
empirical facts. Do not extend the run automatically or add more piece types.

The [completed pilot](results/material-collection-001.md), its
[anchor review](results/material-collection-001-anchors.md), and their original
files and source identities remain preserved.
