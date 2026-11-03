# Engine-sharing benchmark for version 18

This bounded benchmark compares **one shared engine per game** with the current
**separate White/Black engines**. It prepares a version-18 runner decision;
it does not change the active version-17 panel or supply piece-balance evidence.

At four workers, shared mode uses up to **four Stockfish processes**, separate
mode up to **eight**. Both have at most **four searches active at once**, because
only the side to move searches within each game. Halving the process count does
not promise twice the speed.

## Fixed workload

| Setting | Both modes |
| --- | --- |
| Matchup | Vanguard `RfB` versus Unicorn `NC` |
| Starting position | Standard setup with those replacements; no forced opening |
| Color pairs per cell | Four at the default four workers |
| Search effort | Separate 20,000- and 80,000-node cells |
| Engine settings | Skill 20, one thread, 32 MiB hash per physical engine |
| Applied piece values | Original frozen reference MG/EG pairs |
| Game limit | 400 total plies |
| Default repetitions | Two counterbalanced rounds |

Four repeated color pairs give eight games per cell. Two budgets × two modes ×
two rounds produce **64 benchmark games**. Repetitions of the same starting
position measure runtime stability; they are not independent opening samples.
Mode and budget order alternate to reduce consistent order and heating effects.

Each game starts fresh. Shared mode clears one engine's hash at game start and
uses it for both sides; separate mode starts and clears one engine per side.
Both receive the full move history on every search. Sharing changes which hash
entries and search history are available, so it can change moves, game length
and playing behavior even at the same node limit.

Both modes use the same runner, parallel coordinator and storage code inside an
owned, patched benchmark snapshot. The normal project catalog, controller and
balance bundle remain fixed. Benchmark records identify their purpose and mode;
keep them separate from balance and material datasets.

## Run on Windows

Finish or pause the active campaign before timing this benchmark. Competing
searches, copying files, CPU throttling or memory pressure would affect the
comparison. Use the same power and cooling conditions for both modes.

```powershell
npm.cmd run balance:benchmark-engines -- --out balance-results/engine-sharing-v18 --jobs 4 --rounds 2
```

Use a new result folder. To validate the workload without playing benchmark
games, run `--check`; add `--rules-only` to omit native checks. Select a compatible
engine with `--engine PATH` or `FAIRY_STOCKFISH_PATH`.

```powershell
npm.cmd run balance:benchmark-engines -- --check
npm.cmd run balance:benchmark-engines -- --resume balance-results/engine-sharing-v18
npm.cmd run balance:benchmark-engines -- --report balance-results/engine-sharing-v18
```

**q / Ctrl+C** stops immediately, **g** finishes active games and **p** finishes
active color pairs. A stop or unfinished cell pauses the whole benchmark before
the next cell. Preserve the entire result folder, including its runtime snapshot,
for resume. Reports identify incomplete measurements; interrupted work must not
be treated as an uninterrupted timing sample.

The default two rounds are an initial comparison. Four rounds can check whether
an apparent advantage repeats, using a new folder and `--rounds 4`. Do not mix
budgets or automatically treat a small difference as a proven speed improvement.

## Read the results

Compare both modes separately at each node budget. Cell wall time includes
startup, native preflight, game play, storage and reporting. Per-game preparation,
search time, actual reported nodes and searched plies help explain the total.

Use games per hour together with game length, search time per ply and nodes per
wall second. A mode may finish more games because its games become shorter;
that alone does not show that each search became faster. Fixed-node results also
do not guarantee unchanged piece rankings under a different hash-sharing policy.

Process counts and configured hash allocations are not measured RAM usage.
At four workers, the declared hash capacity is **128 MiB shared / 256 MiB
separate**, excluding all other engine and Node memory. The benchmark makes no
claim about peak native-process RSS or total physical memory saved.

Review repeatability, throughput, failure handling and search behavior before
integrating a new mode into version 18. Existing runs retain their original
two-engine protocol; the benchmark does not switch them automatically.

## Other runner work to measure separately

- Incremental journal aggregation and less frequent derived reports: workers
  rebuild whole summaries and PGNs after every game, while the parent rereads
  worker journals and rebuilds aggregate artifacts.
- Filter hidden ply progress before IPC rather than sending every move to the
  parent when only game starts and results are displayed.
- Reuse verified preflight work where its exact engine/profile identity matches.
- Dispatch complete color pairs from a central queue to reduce the final-worker
  tail, retaining durable results and the existing stop controls.

Keep these as separate benchmark questions. Changing them alongside engine
sharing would make it harder to identify which change produced a speedup.
