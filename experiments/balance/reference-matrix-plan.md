# Four-piece reference matrix

Keep version 16 and let the current bishop campaign finish at 1,280 games.
The short-side bishop (`BsWsN`, `bishop.purple@7`) is a provisional fourth
reference alongside `RfB`, Camel knight (`NC`) and Amazon (`QN`). Its midpoint
score against `RfB` is 50.39% over 128 games, with conditional range
40.77%–60.55%. This supports retaining it; it does not establish exact equality.

The archived final revision report already gives its scores against Amazon
(47.66%) and Camel (41.02%), each over 256 games. Its weaker Camel matchup
matters when choosing the roster. Those two full results are report-only until
the remaining histories are recovered. Material estimates describe these same
engine outcomes and provide no independent confirmation.

## Display and evidence

`material:matrix` produces a small Markdown/JSON matrix. Each cell shows the
**row piece's point score against the column piece**; draws count half. The
reverse cell is `100% − score`, not another observation. No tournament ranking
is calculated from opponents with different coverage.

The display combines three archived reference matchups, two full reported
bishop matchups, and the latest bishop–rook report. A separate recovery table
shows the actual raw-game coverage and scores. Report-only results, a pasted
checkpoint and a recovered subset remain distinct sources; they are never
summed or treated as independent games.

The [recovery audit](results/short-side-revision-recovery-001.audit.json)
replays 480 preserved bishop games and 54,855 plies from an earlier upload:

| Opponent | Recovered games | Color pairs | Bishop W/D/L | Recovered score |
| --- | ---: | ---: | --- | ---: |
| Camel | 160 | 80 | 47 / 39 / 74 | 41.56% |
| Amazon | 160 | 80 | 58 / 21 / 81 | 42.81% |
| Ordinary army | 160 | 80 | 144 / 6 / 10 | 91.88% |

These are the first 80 original opening groups. Their scores need not match
the full 128-group report. The original revision manifest/native inventory was
not supplied, so the recovery verifies moves, results and declared policy rather
than the historical process identity.

For bishop versus Camel/Amazon, the missing inventory is groups
`reference-081`–`reference-128`: **96 games per matchup, 192 total**. The tool
lists exact position/color cells under the original settings. This inventory
is not a launchable experiment and starts no games. An optional local revision
journal may recover some or all of those cells before any replacements are
considered. Imported journals receive metadata/history consistency checks;
the matrix does not independently replay their SAN or attest their executable.

The running bishop–rook matchup has no replacement schedule. The original
Camel–Amazon truncation remains unscored; its 254 paired games are retained.
No controls or unchanged matchups are repeated. After the bishop run ends,
review the completed matrix and remaining raw gaps before declaring any fill.

## Commands

```powershell
npm.cmd run material:matrix -- --bishop balance-results/bishop-references --out balance-results/reference-matrix
```

If the older revision folder still exists, supply its journal too:

```powershell
npm.cmd run material:matrix -- --bishop balance-results/bishop-references --revisions balance-results/reference-revisions --out balance-results/reference-matrix
```

The bishop argument reads `bishop-report.json`; a direct report file also
works. Without it, the display uses the completed, replay-audited 1,280-game
bishop report (short side scores 53.32% against RfB). A pasted checkpoint file
can still be supplied explicitly and remains labeled as reported data.
The revision argument accepts a directory containing `games.jsonl`
or a journal file. Inputs are read only, and no engine, Python, EPD export or
material refit is needed. Outputs live in a separate matrix folder.

Re-run the command to refresh a folder created by this tool. It verifies its
generated files before replacing them and refuses source/run directories or
unrelated output files. The [saved midpoint matrix](results/reference-matrix-001.md)
and [validation record](results/reference-matrix-001.validation.json) include
34 passing focused checks, an actual engine-free CLI refresh, unchanged source
files and an unchanged running-bishop identity. No new games were played.

## Storage

Keep the **whole active run folder** until it finishes, including `run.json`,
`collection.json`, `games.jsonl`, `checkpoint.json`, `rules/`, and inherited
`parent/` / `simple-source/` inputs. Retain its source commit and matching engine
or engine hash. A summary alone cannot restore individual games or resume a run.

For completed runs, EPD exports, sampled-position JSONL and derived reports can
be regenerated with their matching frozen reporting code and raw inputs.
Archive a completed folder as ZIP before pruning generated exports, and keep
the compact final report for quick review. The example functional run had about
270 MiB of generated EPDs versus 23 MiB of inherited raw snapshots; your folder's
sizes may differ. No files are deleted by the matrix command.
