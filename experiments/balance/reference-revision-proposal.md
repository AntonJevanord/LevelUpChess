# Linked bishop and rook revision experiment

Compare three Horizontal-bishop nerfs and three Knight-capture-rook buffs against
unchanged Camel knight and Amazon. **Reuse the completed 2,688-game parent and
collect 4,608 new games with four jobs.** This replaces the earlier 5,504-game
proposal, saving 896 repeated baseline/reference games. No extra validation match
campaign is needed before this experiment.

The bishop scored 51.56% against Camel, so a large nerf is unwarranted. The rook
scored about 31% against both bishop and Camel despite 42.97% against Amazon.
The candidates explore readable changes without assuming any move has a fixed
material gain or loss.

## Frozen candidates and references

| Design ID | Betza | Change from the tested piece |
| --- | --- | --- |
| `bishop.purple@7` | `BsWsN` | Reduce clear sideways slides from two squares to one; keep wide knight jumps. |
| `bishop.purple@8` | `BsR2msN` | Keep sideways slides up to two squares; make wide knight jumps quiet-only. |
| `bishop.purple@9` | `BsR2fsN` | Keep sideways slides up to two squares; allow wide knight jumps only forward, for movement and capture. |
| `rook.purple@6` | `RcNcF` | Keep rook moves and knight captures; add adjacent diagonal captures. |
| `rook.purple@7` | `RcNF` | Add adjacent diagonal movement and capture to rook moves and knight captures. |
| `rook.purple@8` | `RN` | Add quiet knight jumps as well as knight captures: the rook–knight compound, or empress. |

Keep `knight.purple@3` (`NC`) and `queen.purple@1` (`QN`) as the two references.
The ten-type test registry also retains original bishop `@4` and rook `@2` so
historical evidence can be decoded and projected by stable ID. Their old letters
and custom slots stay unchanged. No new game uses the two historical designs.

All candidates replace their ordinary family piece. There are no extra units or
pawn displacement. Rooks keep castling, promotions remain standard Q/R/B/N, and
the playable picker and purchase prices stay unchanged. `sN` means the four wide
knight jumps; `fsN` keeps the forward two. A two-square `sR2` slide needs a clear path.

## Linked schedule

Use the **exact 128 parent positions, selected family members and position IDs**.
Every new start must remain quiet, legal and nonterminal; fail rather than
silently replacing an inherited position. Each position adds:

| New games | Conditions per position | Total |
| --- | ---: | ---: |
| Six candidates against ordinary armies, both colors | 12 | 1,536 |
| Six candidates against Camel and Amazon, both colors | 24 | 3,072 |
| New collection | 36 | 4,608 |

Each candidate/reference pairing receives 256 games. Candidate-versus-candidate,
ordinary-control, unchanged-reference singles and Camel-versus-Amazon games are
not replayed. The parent supplies its original 21 conditions per position,
including its one unscored truncation. The linked cap is **7,296 records**.

Original archives stay intact. The new result folder copies their exact bytes to
`parent/collection.json` and `parent/games.jsonl`, verifies their hashes and keeps
its original four-type profile. New games use the ten-type profile. Derived
data records each source context; temporary letters never define piece identity.
Resampling and validation use the same original position IDs for both contexts.

## Compatibility and estimates

Keep Skill 20, **20,000 nodes per move**, one thread, 32 MB hash, automatic
MG/EG values and 400 plies. Preflight checks every start and native movement
capability. Before reusing data it also verifies unchanged historical allocations
and values, unchanged strongest-type reference, and sampled historical legal
moves/static evaluation under the old and new profiles. These bounded checks
support conditional reuse; they do not prove identical search behavior for every
historical position or attest old processes independently.

Retain min-ply 16, stride five, stable two-ply windows, draws and unit total sample
weight per game. Fit ordinary/single, head-to-head and combined cohorts separately,
assuming pawn = 1 and queen = 9. These are declared anchors, not measured ratios or
native engine values. Report unconstrained diagnostics and rank/coverage failures.

Use 200 whole-position resamples, five whole-position validation folds and the
practical ±0.5-pawn cohort-agreement guide. Keep all inherited and new conditions
for a position together. Report matchup points, color results, paired uncertainty,
phase support and out-of-fold predicted-versus-observed scores.

Cumulative checkpoints follow **1,152 / 2,304 / 4,608 new games**, or 32 / 64 / 128
new blocks. Each estimate includes all 128 parent blocks plus its new prefix;
early checkpoints therefore have unequal historical/new coverage. Before enough
new candidate games are available, pooled estimates may remain unsupported; the
original report retains the earlier estimates. The progress
counter counts new games only. Truncations remain unscored and are not replaced
automatically. Estimates remain contextual, not universal exchange prices.

## Run on Windows

```bat
npm.cmd run material:revisions -- --check
npm.cmd run material:revisions -- --out balance-results/reference-revisions --jobs 4
npm.cmd run material:revisions -- --resume balance-results/reference-revisions
npm.cmd run material:revisions -- --report balance-results/reference-revisions
```

Use a new output directory. The pinned archives are already in the repository, so
there is no `--book` argument. **q / Ctrl+C** saves move prefixes and stops now;
**g** finishes active games; **p** finishes active pairs. Resume preserves worker
count and frozen engine/source/profile identity. Offline reporting starts no
engine games and preserves raw evidence and completed checkpoints.

The completed parent's original source audit matches commit `1658cc4`. Reproduce
that audit on its matching checkout: adding new immutable definitions changes
current whole-file hashes without changing the old definitions or raw archives.

At the cap, compare each revision against both references and combine the results
with readability, enjoyment and counterplay. Select promising revisions, report
uncertainty and matchup dependence, then close the batch. Further tests require a
specific unresolved question and budget; no extension starts automatically.
