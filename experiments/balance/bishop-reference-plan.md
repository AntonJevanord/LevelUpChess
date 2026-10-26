# Five bishops against RfB

Version 16 compares five level-3 bishop replacements with the unchanged
forward-bishop rook, `RfB` (`rook.purple@10`). The completed
[simple comparison](results/simple-reference-001-review.md) gives the rook
52.73% against Amazon (`QN`) and 50.98% against Camel knight (`NC`). Keep all
three as provisional references rather than treating one opponent as a complete
definition of balance.

## Designs and schedule

| Bishop | Stable ID | Movement |
| --- | --- | --- |
| Original horizontal | `bishop.purple@4` | `BsR2sN`: bishop, horizontal slides up to two squares, wide knight jumps. |
| Short-side | `bishop.purple@7` | `BsWsN`: bishop, one-square horizontal steps, wide knight jumps. |
| Forward-jump | `bishop.purple@9` | `BsR2fsN`: bishop, horizontal slides up to two squares, forward wide knight jumps. |
| Quiet-hop rank | `bishop.purple@11` | `BsRgmsR`: bishop and horizontal slides, plus quiet horizontal grasshopper hops. |
| Long quiet-hop rank | `bishop.purple@12` | `BsRgmsR0`: the same slides, with longer quiet landings after a hurdle. |

Wide knight jumps travel two files sideways and one rank forward or backward;
the forward-jump version keeps only the forward pair. All listed ordinary
slides and knight jumps move and capture. Slides stop at blockers, and forward
direction mirrors for Black.

Both rank bishops may hop over the first horizontal piece of either color onto
an empty square. `gmsR` lands immediately beyond that hurdle; `gmsR0` may choose
any empty landing beyond it, up to the next blocker. Neither hop captures or
crosses a second piece. For example, from d4 with a friendly piece on e4, the
short hop reaches f4; the long version also reaches g4 and h4 if clear. Normal
horizontal captures remain blocked. Neither design adds vertical rook moves.

Each bishop replaces one ordinary bishop for three upgrade points; the opponent
replaces one rook with `RfB` for the same cost. Ordinary royal kings, standard
promotions and rook castling remain in use. These headless definitions do not
change the playable picker.

Reuse the exact 128 original positions, family-member squares and opening IDs.
Five matchups × both colors gives **10 games per position, 1,280 new games**.
Each bishop receives 256 games, or 128 complete color pairs, against `RfB`.
There are no new ordinary-army games or repeated QN/NC matchups.

The linked collection retains the original 2,688 records and completed 3,072
simple records once, for **7,040 scheduled records** at the new cap. The original
panel's one truncation stays unscored. The separate 4,608-game revision study is
not pooled: its complete final manifest and journal have not been supplied.

## Playing and analysis policy

Keep four jobs, Skill 20, 20,000 nodes per move, one thread per engine, 32 MB
hash and a 400-ply limit. Retain automatic native values for `RfB` and all five
bishops. Both hop designs receive automatic MG2015/EG1918 despite their distinct
mobility; that is an engine prior, not a measured strength. The historical `RB`
type retains its ordinary-queen MG2538/EG2682 override in the shared profile.

Native preflight checks all starts, movement/role fixtures, values and sampled
historical legal/static-evaluation behavior. These bounded diagnostics support
reuse without proving universal equivalence between old and new processes.

The [validation record](results/bishop-reference-preflight-001.json) covers all
1,280 starts, 108 movement/role probes, 96 matching historical static evaluations,
interrupted four-worker resume and offline reporting. All 850 unique checks
passed; 36 environment-dependent checks were skipped. No completed campaign
games were played in the cloud.

Reports pause collection at **320 / 640 / 1,280 new games**, covering 32 / 64 /
128 new position blocks. They print ordinary P/N/B/R/Q estimates, the queen-minus-
rook gap, upgrade bonuses and paired head-to-head scores. P=1 and Q=9 remain
assumed anchors; royal kings have no exchange-price estimate.

In matchup tables, A score is `(wins + draws/2) / games`. Its conditional 95%
range resamples whole opening groups with their color pairs. Out-of-fold
predictions come from material models trained on other opening groups;
observed minus predicted reports the difference in percentage points. A positive
difference means A did better than the model expected, not necessarily better
than its opponent. Judge matchup balance from the observed score and its range.

Keep min-ply 16, stride five, stable two-ply windows, draws and unit total sample
weight per game. Five grouped validation folds and 200 whole-position resamples
keep inherited and new games from one position together. Early reports combine
all inherited groups with the collected new prefix, so coverage is unequal.

The four newly included bishop types appear only in head-to-head games. Their
ordinary/single estimates remain **unavailable**, not zero. Their absent bonus
columns are omitted from that cohort's fit; ordinary columns and nonzero rank
failures retain the normal checks. Head/combined fits still need full rank and
adequate coverage. Fitted material comes from the same outcomes as win rates;
it is useful context rather than independent confirmation of balance.

## Source evidence

The simple source includes the uploaded journal, dataset and JSON report plus
an explicitly reconstructed replay descriptor. The original simple
`collection.json` was not supplied. Recorded moves/SAN/outcomes and declared
source, profile and executable hashes verify against commit `1cdc62f`; the
missing manifest's checksum and historical native inventory remain unverified.
The replay descriptor is not a substitute historical manifest. Original raw
files and their distinct source contexts stay preserved in the linked output.

## Windows commands

```powershell
git -c maintenance.auto=false -c gc.auto=0 pull
npm.cmd run material:bishops -- --out balance-results/bishop-references --jobs 4
```

Use a new output directory; no book download or parent-folder argument is needed.

```bat
npm.cmd run material:bishops -- --check
npm.cmd run material:bishops -- --resume balance-results/bishop-references
npm.cmd run material:bishops -- --report balance-results/bishop-references
```

**q / Ctrl+C** stops immediately with saved prefixes; **g** finishes active
games; **p** finishes active pairs. Resume freezes the same engine, source,
profile, policy and worker count. Offline reporting needs no engine or Python
and preserves raw histories and completed checkpoints. The run closes at its
declared cap without starting another experiment.
