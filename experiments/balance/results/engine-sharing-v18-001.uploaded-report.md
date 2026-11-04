# Engine-sharing throughput benchmark

**Benchmark only. These games are excluded from balance evidence.**

4 game workers; 2 alternating rounds; 64/64 games finalized; 8/8 fresh timed cells.

| Nodes | Engine mode | Eligible rounds | Median cell seconds | Games/hour | Search ms/ply | Plies/game | Nominal native processes | Configured hash MiB |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20000 | separate | 2/2 | 16.55 | 1742.48 | 40.72 | 108.50 | 8 | 256 |
| 20000 | shared | 2/2 | 16.82 | 1712.78 | 39.14 | 131.50 | 4 | 128 |
| 80000 | separate | 2/2 | 42.24 | 681.97 | 162.33 | 107.00 | 8 | 256 |
| 80000 | shared | 2/2 | 47.22 | 609.97 | 156.21 | 129.00 | 4 | 128 |

| Nodes | Paired fresh rounds | Median elapsed reduction with shared (%) | Median throughput ratio (shared/separate) |
| ---: | ---: | ---: | ---: |
| 20000 | 2/2 | -1.75 | 0.98 |
| 80000 | 2/2 | -11.80 | 0.89 |

Positive elapsed reduction favors sharing; a throughput ratio above 1 favors sharing. Comparisons use only rounds where both modes completed fresh. Native RSS is not measured.

| Cell | Finalized | Truncated | Timing eligible | Wall seconds | Reported nodes/s (wall) | Mean setup ms/game |
| --- | ---: | ---: | --- | ---: | ---: | ---: |
| round-01-n20000-separate | 8/8 | 0 | yes | 17.12 | 999877 | 554.43 |
| round-01-n20000-shared | 8/8 | 0 | yes | 16.73 | 1246546 | 239.15 |
| round-01-n80000-shared | 8/8 | 0 | yes | 47.84 | 1703894 | 237.78 |
| round-01-n80000-separate | 8/8 | 0 | yes | 42.86 | 1574376 | 480.63 |
| round-02-n80000-separate | 8/8 | 0 | yes | 41.62 | 1621003 | 469.71 |
| round-02-n80000-shared | 8/8 | 0 | yes | 46.61 | 1749134 | 234.44 |
| round-02-n20000-shared | 8/8 | 0 | yes | 16.90 | 1234153 | 237.35 |
| round-02-n20000-separate | 8/8 | 0 | yes | 15.97 | 1072079 | 497.47 |

- Benchmark-only repeated starting-position games are not independent openings, head-to-head balance results or piece-value evidence.
- At the default four jobs, either mode has at most four active searches. Four versus eight native processes does not imply twice the CPU search capacity.
- Shared hash/search history can change chosen moves, game lengths and search work per node. Games/hour alone cannot distinguish faster searches from shorter games.
- Reported nodes and searched plies normalize useful work but positions still differ; a fixed-trajectory replay is a separate follow-up if the result needs explanation.
- Cell wall time includes setup, native preflight, persistence, aggregation and teardown. Short benchmark cells do not reproduce every overhead of an 880-game scientific stage.
- Configured hash budgets are settings, not measured RSS. Native memory usage is not sampled by this benchmark.
- Incomplete, retried or resumed cells remain visible but do not enter fresh timing comparisons. Truncations remain unscored and are counted separately.
- Alternating order reduces consistent order bias; CPU power, cooling, disk activity and the small number of rounds still limit precision. No automatic runner switch or whole-panel speed guarantee follows.
