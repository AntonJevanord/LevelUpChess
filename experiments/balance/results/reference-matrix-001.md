# Four-reference matchup matrix

Each cell is the row piece’s paired point score against the column piece. Draws count half. Historical reported totals and recovered raw subsets are separate evidence; different opening coverage is not averaged into a ranking.

| Row piece / opponent | Short-side bishop | Forward-bishop rook | Camel knight | Amazon |
| --- | ---: | ---: | ---: | ---: |
| Short-side bishop | — | 50.39% | 41.02% | 47.66% |
| Forward-bishop rook | 49.61% | — | 50.98% | 52.73% |
| Camel knight | 58.98% | 49.02% | — | 51.18% |
| Amazon | 52.34% | 47.27% | 48.82% | — |

| Comparison (A / B) | Paired games | A W / D / L | Source | Evidence |
| --- | ---: | --- | --- | --- |
| Camel knight / Amazon | 254 | 115 / 30 / 109 | simple-archive | archived-replay-audited-report |
| Forward-bishop rook / Amazon | 256 | 120 / 30 / 106 | simple-archive | archived-replay-audited-report |
| Forward-bishop rook / Camel knight | 256 | 108 / 45 / 103 | simple-archive | archived-replay-audited-report |
| Short-side bishop / Camel knight | 256 | 78 / 54 / 124 | revision-final-report | historical-report-only |
| Short-side bishop / Amazon | 256 | 103 / 38 / 115 | revision-final-report | historical-report-only |
| Short-side bishop / Forward-bishop rook | 128 | 56 / 17 / 55 | bishop-observation-640 | user-reported-checkpoint |

## Recovered raw bishop games

These subset scores are not substituted for the historical full-report scores above.

| Comparison | Paired raw games | W / D / L | Raw subset point score | Completed raw games | Historical reported games |
| --- | ---: | --- | ---: | ---: | ---: |
| Short-side bishop / Camel knight | 160 | 47 / 39 / 74 | 41.56% | 160 | 256 |
| Short-side bishop / Amazon | 160 | 58 / 21 / 81 | 42.81% | 160 | 256 |

Recovery inventory: 192 absent/unfinished short-side bishop/QN/NC games; 0 historical truncations remain unscored. This is not a runnable campaign.

## Sources

- simple-archive: archived-replay-audited-report; SHA-256 c83a26ca3cf0ab33306bc7ad2481076b6585786538c6d90d7342e0b8f2c4c4dd; /workspace/LevelUpChess/experiments/balance/results/simple-reference-001.uploaded-report.json.
- revision-final-report: historical-report-only; SHA-256 cf4d138e6021f8740317f31e5f9db78470c9cb3890b34cb0195a7e5bccafe37a; /workspace/LevelUpChess/experiments/balance/results/reference-revisions-001.uploaded-report.md.
- revision-recovered-archive: previously-legally-replayed-archive; SHA-256 c5e3d9c38b14f354c4febda2fa35dfce1fc35b7cb76140191274ccb3e5dee7c0; /workspace/LevelUpChess/experiments/balance/results/short-side-revision-recovery-001.games.jsonl.
- bishop-observation-640: user-reported-checkpoint; SHA-256 9f40fb38ca4e3d815eb0bb0392f1248286ce9d5c13a3860ef9c41bfa6cda1d4e; /workspace/LevelUpChess/experiments/balance/results/reference-matrix-640.observation.json.

## Limits

- The historical bishop/QN and bishop/NC reported scores use 256 games each; raw recovery may cover fewer games and yield different scores.
- Default bishop/RfB is the transcribed 640-game checkpoint. Supply --bishop with the actual local report to refresh it.
- This command starts no games, makes no material fits and performs no rule or engine replay. Imported journal metadata and history shape are checked against the original declared schedule.
- Different source profiles and checkpoints remain identified; this table does not establish universal equivalence or statistical independence.
- The active bishop collector and its raw files remain unchanged. Missing-game inventories do not authorize an automatic rerun or replace completed/truncated histories.
