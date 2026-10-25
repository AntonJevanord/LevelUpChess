# Four-reference comparison plan

Test whether upgrades with similar fitted **added benefit over their ordinary
piece** also score near 50% against each other. The completed
[1,152-game material study](results/material-study-001.md) stays closed and
separate. The study is **complete and closed at 2,688 scheduled games**. The
[results and audit](results/reference-panel-001.md) verify 2,687 completed games,
one unscored truncation, all recorded moves and exact report regeneration. No
repeat or extension is needed. The original design and
[preflight validation](results/reference-panel-preflight-001.json) remain preserved.
The [frozen configuration](reference-panel.json) changes no pieces, prices or
automatic engine values.

## Original Windows commands

Preserved for reproduction, not a request to repeat the completed study. Use
`--report` on the existing result folder for offline analysis. From the repository folder:

```bat
git pull
npm.cmd run material:references -- --check --book "..\chess-variant-stats\chess.epd"
npm.cmd run material:references -- --out balance-results/reference-panel --book "..\chess-variant-stats\chess.epd"
npm.cmd run material:references -- --resume balance-results/reference-panel
npm.cmd run material:references -- --report balance-results/reference-panel
```

Adjust the book path if needed. Four jobs are fixed; `--jobs 4` is optional on a
new run. Resume uses the saved positions and original identities, so supply no
new book or job count. Preserve the complete result folder and matching checkout
and engine. `--check` performs native movement/value checks without starting
games; `--report` works offline without an engine or Python.

Press **q / Ctrl+C** to save active move histories and stop immediately, skipping
expensive analysis. Run `--report` afterward to refresh estimates. **g** finishes
active games and **p** finishes active pairs before reporting and exit. Immediate
stop during analysis leaves the previous report intact and never freezes an
incomplete checkpoint. Starts/results print named winners/colors and running
points without ply logs; analysis prints progress. The final stage exits normally.

Current outputs are `reference-report.md`/`.json`, `reference-dataset.json`,
`reference-samples.jsonl` and `ordinary.epd`/`single.epd`/`head.epd`. Immutable
checkpoint reports live in `checkpoints/672`, `checkpoints/1344` and
`checkpoints/2688`; the current report includes their estimate trajectory.

## Freeze the four references

| Reference | Immutable ID | Movement | Replaces |
| --- | --- | --- | --- |
| Horizontal bishop | `bishop.purple@4` | `BsR2sN` | One ordinary bishop |
| Knight-capture rook | `rook.purple@2` | `RcN` | One ordinary rook |
| Camel knight | `knight.purple@3` | `NC` | One ordinary knight |
| Amazon | `queen.purple@1` | `QN` | The ordinary queen |

The bishop includes sideways moves **and captures**; it is neither the older
quiet-sideways `@2` nor unlimited-sideways `@6`. All four replace pieces, avoiding
extra units and pawn displacement. The rook retains its castling role, and
promotion remains standard Q/R/B/N.

The updated [family design draft](../designs/family-draft.ini) is preserved
separately. As confirmed for this run, retain the tested bishop `BsR2sN` and
automatic values; the draft's `BsNsWsD` sideways jump and manual MG settings are
different research choices.

Earlier screening supports comparison, not assumed equality: Camel knight and
Knight-capture rook scored about 56.3% and 47.2% against Amazon over only eight
and nine opening pairs. The newer Horizontal bishop scored 61.25% over 40 pairs.
Those cohorts used different positions and search effort. Keep them as prior
evidence rather than pooling their outcomes into this study.

## One matched block per position

Select **128 fresh full-army book positions**, excluding both completed material
studies. Each position supplies the same 21 conditions:

| Purpose | Conditions per position | Total games |
| --- | ---: | ---: |
| Ordinary baseline | One ordinary game | 128 |
| Single-upgrade baselines | Each of four upgrades against ordinary, in both colors | 1,024 |
| Head-to-head comparisons | All six distinct reference pairs, in both colors | 1,536 |
| Total | 21 | 2,688 |

Use one shared registry/profile with four custom letters for the entire run.
Substitute pieces on their actual book-position squares, keeping the rest of the
position intact. Use the same selected member of each family in all 21 conditions.

The frozen selection alternates leftmost/rightmost ordinary
knight and rook by block parity, with file ties resolved toward the owner's back
rank. For bishops, alternate color complexes: odd blocks use White's dark-squared
and Black's light-squared bishop, even blocks the reverse. This gives 64 positions
per bishop complex and per left/right selection rule. Record actual squares and
wing coverage; a leftmost piece need not retain its original starting-file identity.

Accept a block only if **all 21 starts** satisfy the declared quiet, legal and
nonterminal criteria, with no introduced check. Verify native/browser agreement,
castling for upgraded rooks, standard promotion and material decoding before
scoring. Freeze selection rules, FENs, schedule and hashes; do not substitute a
bishop or rook for a queen to equalize total piece values.

## Compare estimation cohorts and use all games

Fit three material models using the same sample selection and game weighting:

| Fit | Games | Question |
| --- | ---: | --- |
| Ordinary/single-upgrade | 1,152 | What bonus is estimated against ordinary armies? |
| Head-to-head | 1,536 | What bonus is estimated against other upgraded armies? |
| Combined, primary | 2,688 | What estimate uses all available games? |

All head-to-head games contribute to the combined fit and help identify relative
upgrade bonuses; ordinary/single-upgrade games provide baseline coverage. Retain
ordinary material features plus one bonus per immutable upgrade ID. Each fit
assumes pawn = 1 and queen = 9, with a fitted score conversion; report
unconstrained diagnostics alongside it.

For each piece, compare its head-to-head bonus with its ordinary/single-upgrade
bonus. Resample the same whole 21-game position blocks for both fits, refit both
on each draw, and report a **paired uncertainty range for their difference**.
Overlapping separate confidence ranges alone do not establish agreement. Compare
the point difference and its range with the predeclared practical **±0.5-pawn**
guide; report usable agreement, unresolved precision or contextual disagreement
rather than a blanket equivalence claim.

Check rank, feature coverage and positive score-scale support separately for
every cohort. Head-to-head games may identify only relative bonuses if each side
always retains one upgrade in the sampled positions; absolute bonuses can then
be unsupported. Report that limitation and resampling failures rather than
forcing a value. The cohorts also differ in opponent composition, so a discrepancy
does not isolate a causal effect of the estimation method.

## Validate predictions by position block

Check predictive agreement using **five fixed grouped folds**. For each fold,
hold out every game in its complete 21-game position blocks, fit on all conditions
from the other blocks, and predict the withheld head-to-head games. Aggregate
these out-of-fold starting-position predictions by matchup and compare them with
observed scores (wins plus half draws), color breakdowns and cluster uncertainty.
No game's outcome contributes to the model that predicts it.

Compare final combined-fit bonus differences with matchup scores descriptively; use
the out-of-fold results to assess prediction, avoiding a claim of validation from
fitting and predicting the same outcomes. Freeze the model and folds before play;
tuning them against these results would require separate future validation.
Resample whole 21-game position blocks so all conditions stay together. Different
book positions may share broader opening ancestry, so this remains a conditional
test rather than independent opening-family generalization. Agreement does not
convert win percentages directly to pawns or establish universal exchange rates.

## Fixed effort, checkpoints and decision

Retain Skill 20, **20,000 nodes per move**, one thread per engine, 32 MB hash,
400 plies and four jobs. Record automatic MG/EG tables for both colors of every
ordinary and custom type, plus any phase effects of the shared roster. A new
multi-type profile is a different policy context from the Amazon-only study;
do not pool their samples or force values to match their intended costs.

Preserve complete-block checkpoints at **672 / 1,344 / 2,688 games**, corresponding
to 32 / 64 / 128 positions. These are coverage and precision reviews, not
score-dependent stopping rules. Validate cancellation/resume before the scored
run; technical failures pause for repair while preserving completed evidence.

At the cap, report all three cohorts' bonus estimates/ranges, paired cohort
differences, feature and phase support, every matchup score/range and out-of-fold
predicted-versus-observed differences. Report insufficient precision or contextual
mismatch honestly; 256 games per matchup does not guarantee a half-pawn
distinction. Close as usable, inconclusive or context-dependent, naming any
specific unresolved relationship. No automatic extension, full-catalog round
robin or redesign follows.
