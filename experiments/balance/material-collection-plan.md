# Version 16: matched material-data pilot

Collect **96 games maximum**, then review data coverage before deciding on more
play. This tests whether matched ordinary/Amazon games support useful outcome
regression. It does not establish piece prices or change movement or evaluation.
The [first pilot is complete](results/material-collection-001.md): 96 completed
games, no errors or truncations, and 881 retained samples. No repeat is required.

[Cloud validation](results/material-collection-preflight-001.json) passed all 96
native starting-position checks and eight movement probes without searches.
Three separate, deliberately truncated workflow games verified cancellation,
saved-prefix recovery, worker-count preservation and offline reports; they supply
no balance evidence.

## Frozen design

Select 32 distinct full-army positions from `chess.epd`, shuffled with seed 42.
Each selected position supplies three conditions:

| Condition | Games per position | Change from the book position |
| --- | ---: | --- |
| Ordinary | 1 | None |
| White Amazon | 1 | Replace White's queen with `queen.purple@1` (`QN`). |
| Black Amazon | 1 | Replace Black's queen with the same Amazon. |

Both sides use automatic evaluation, Skill 20, **20,000 nodes per move**, one
search thread and 32 MB hash. Games stop at 400 plies; truncated games remain
unscored. [The fixed configuration](material-collection.json) permits no larger
automatic stage. There are no pawn handicaps or duplicate color-swapped ordinary
controls.

Book filtering requires all 32 ordinary pieces, including both queens, legal pawn
ranks and quiet, legal, nonterminal starts in all three conditions. Deduplicate
positions by placement, turn, castling and en-passant fields, ignoring counters.
Keep the actual queen square and every other piece, turn, right and counter
unchanged. Record rejected candidates and reasons before any games are played.

## Run on Windows

From the repository folder, after `npm.cmd ci`:

```bat
npm.cmd run material:collect -- --check --book "..\chess-variant-stats\chess.epd"
npm.cmd run material:collect -- --out balance-results/material-data-pilot --book "..\chess-variant-stats\chess.epd" --jobs 3
npm.cmd run material:collect -- --resume balance-results/material-data-pilot
npm.cmd run material:collect -- --report balance-results/material-data-pilot
```

Adjust the book path if needed. `--check` validates the complete selected plan,
native movement and reference values without playing games or creating a run.
Use a new output directory. Three workers play independent games; each engine
still uses one search thread. Resume retains the saved worker count, settings and
selected-position snapshot; do not add `--book` or `--jobs` to resume.

The collector and its reports use Node; Python is not required.

Press **g** to finish active games, **p** to finish active units (an ordinary game
or an Amazon color pair), or **q / Ctrl+C** to stop immediately and save active
histories. Checkpoints allow interrupted games to continue. Starts and results
print during play, without ply logs or live fits. Reports refresh after a normal
stop or completion; `--report` regenerates them offline without an engine.
Terminal cleanup now releases previously idle input so the command exits after
finishing. Completed original runs can regenerate reports after this fix without
changing their manifest; unfinished runs retain the original source requirements.
Only one report writer can refresh a directory at a time. If a blackout leaves
`report.lock`, remove it only after confirming its recorded process has stopped.

`collection.json` and `run.json` retain the frozen plan, registry, generated rules,
selected FENs, original book SHA-256, settings and source/executable hashes.
Resume rejects changed identities. Keep the whole result directory and matching
checkout/engine together; the complete book is not copied into the run.

## Review before collecting more

Read `material-collection-report.md` and its JSON counterpart first. Share those,
`collection.json` and `games.jsonl` for review. Derived artifacts also include
`material-dataset.json`, `material-samples.jsonl`, `ordinary.epd` and `amazon.epd`.
The custom EPD requires the frozen letter mapping; the ordinary-only Python helper
cannot interpret its Amazon letters.

Fits retain draws, give each sampled game unit total weight and use sparse
nonterminal samples from ply 16, every five plies, with two stable-material plies
on either side. Inspect completion, distinct histories, sampled games, actual
Amazon-count variation, rank, phase coverage and held-out performance before any
coefficient. Resampling/validation groups each selected book position's three
conditions; their broader opening families are unknown. Ranges are conditional
diagnostics, not validated material prices.

Keep the [supplied legacy EPD baseline](results/material-epd-001.md) separate:
its generation identities and settings are incomplete. Neither that baseline nor
this small pilot proves a transferable centipawn scale. Review coverage at 96
games, including failures and truncations, and declare a specific question and
new budget before any follow-up. No larger batch starts automatically.
