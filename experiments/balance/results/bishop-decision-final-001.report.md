# Version 16 reference decision

Freeze **Vanguard** (`rook.purple@10`, `RfB`), **Unicorn**
(`knight.purple@3`, `NC`), **Cruisader** (`bishop.purple@13`, `BsR2nsN`)
and **Amazon** (`queen.purple@1`, `QN`) as the official level-3 reference
roster. Close the bishop campaign; no further bishop testing is queued.
The chosen names preserve the user's first choices.

The [uploaded final decision report](bishop-decision-final-001.uploaded-report.md)
reports all 1,280 new comparison games completed, with no errors or truncation,
and all nine bishop/reference matchups complete. It reuses 1,024 historical
games and required no restoration games in this run.

## Frozen reference matchups

Scores count draws as half a point. Each row reads from the first piece's
perspective. These are observed outcomes under the recorded engine and opening
policies, not universal piece ratings.

| Pair | Paired games | First piece W / D / L | Points score | Conditional 95% range |
| --- | ---: | --- | ---: | --- |
| Cruisader / Vanguard | 256 | 112 / 42 / 102 | 51.95% | 46.68%–56.84% |
| Cruisader / Unicorn | 256 | 95 / 54 / 107 | 47.66% | 41.99%–53.32% |
| Cruisader / Amazon | 256 | 116 / 33 / 107 | 51.76% | 46.29%–58.01% |
| Vanguard / Unicorn | 256 | 108 / 45 / 103 | 50.98% | 45.12%–56.84% |
| Vanguard / Amazon | 256 | 120 / 30 / 106 | 52.73% | 46.88%–58.59% |
| Unicorn / Amazon | 254 | 115 / 30 / 109 | 51.18% | 44.84%–57.14% |

Cruisader is the best fit among the three bishops: its scores span only
47.66%–51.95%, and all three conditional intervals include 50%. The short-side
bishop scores 41.02% against Unicorn; the long quiet-hop bishop scores 39.45%
against Unicorn and 40.04% against Amazon. There is enough evidence for this
design choice without continuing the bishop search.

The 41.99%–58.01% envelope combines the lowest and highest endpoints from
separate matchup intervals. It is not a simultaneous 95% guarantee or a
probability that the true strength is equal. The decision report uses 200
whole-opening bootstrap resamples over 128 selected opening groups; different
positions, engine settings and play styles can change the matchup scores.

Unicorn/Amazon has 127 scored pairs. Its one completed game with an unscored
partner remains excluded; the frozen roster does not require replaying it.
The other two existing reference pairs retain their archived simple-study
ranges. No new fit or pooling across studies changes their published scores.

## Preserved evidence

The [audit](bishop-decision-final-001.audit.json) verifies the nine table rows'
counts and score arithmetic, independently recounts the two inherited bishop/RfB
matchups, and recounts the three existing reference/reference pairs from their
archived journals. Reproduce those checks without an engine:

```powershell
node experiments/balance/results/bishop-decision-final-001.audit.cjs
```

The uploaded `bishop.games.jsonl` is byte-identical to the previously archived
[bishop journal](bishop-reference-001.games.jsonl), SHA-256
`a54f1b4bf55e7ad5259aa465285605d23f8a999a4f3f045a18d3cc6a58b910da`.
It contains the earlier 1,280 five-bishop/RfB games and adds no new decision-game
histories, so no duplicate journal is stored.

The new decision comparison journal, campaign manifest and JSON report were not
included. The new bishop results are preserved as reported evidence; their move
histories, native inventory and bootstrap ranges have not been independently
replayed or recomputed from this upload. That audit limit does not require
another experiment to freeze the chosen designs. Retain the local complete run
folder for any later audit.

Future experimental pieces face this fixed reference panel. Keep each batch's
openings, engine policy, evaluation settings and original results frozen.
Changing another experimental piece will not revise an existing matchup's
observed W/D/L, while conditional material fits may still change if their input
dataset changes. Do not turn the default workflow into another candidate round
robin.
