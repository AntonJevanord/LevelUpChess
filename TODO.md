# Roadmap

Version 16 is preserved at `v0.16.7`. Version 17 begins three bounded outcome
experiments; the four reference definitions and completed evidence stay fixed.

## Version 17: prepare and run the initial experiments

- [x] Freeze the final king colors as blue/green, yellow/orange, red/purple, then teal/gold/silver; costs remain 1–9.
- [x] Create `version_17` from the tested version-16 closeout.
- [x] Declare eight opening cases, fixed engine settings, complete color pairs and the three game caps below.
- [x] Add schema-3 finite reserve bundles to registry, deployment, preflight, journals, PGN, serial/parallel play and resume; retain ordinary royal kings.
- [x] Keep old schema-1/2 meanings and saved experiment identities unchanged; reject reserves in the board-only material estimator.
- [x] Finish the unified check/run/resume/report command, portable native-value proof and offline matchup tables.
- [x] Verify all 1,312 army/opening positions against the native engine, reference value tables, bounded stop/resume and old-run compatibility. Play no scored cloud campaign during setup.
- [ ] Run the level-3 screen locally, inspect outliers and truncations, then decide which designs need a revision.
- [ ] Run the reference 2v2 table and inspect partner effects without assuming individual values add exactly.
- [ ] Run the level-1 pawn/guard bundles; assess the purchase including placement and deployment tempo.

| Experiment | Games | Scope |
| --- | ---: | --- |
| `level3` | 832 | 13 replacement candidates × four references × eight openings × both colors |
| `reference-2v2` | 240 | All 15 pairings of six distinct-family reference teams |
| `pawn-grants` | 240 | Three pawn/guard bundles versus the references and each other |

Use the [commands and exact setups](docs/version17-experiments.md). Each campaign
requires its own output directory and explicit launch. Eight starts provide a
screen for gross outliers; they do not establish precise balance.

## After reviewing these results

- [ ] Human-playtest the [roster](docs/playtest-roster-v16.md) for readability, fun and counterplay. Changed movement or price gets a new immutable revision.
- [ ] Declare only the follow-ups that could change a design decision; do not restart completed reference cells whenever another candidate changes.
- [ ] Add an army-outcome model for joint upgrade contributions, uncertainty, coverage and held-out prediction. Keep its Elo-style units separate from material values.
- [ ] Use ordinary-army anchors or unequal-budget bridges to identify tier relationships; equal-budget games alone leave a cost-related ambiguity.
- [ ] Add frozen adaptive batches with exploration after fixed schedules work. Assess three level-2 purchases versus two level-3 purchases and the related tier targets.
- [ ] Treat pocket-aware material regression as a separate method; reserve outcomes remain the primary balancing tool.

## Evidence and storage

- [x] Freeze Vanguard `RfB`, Unicorn `NC`, Cruisader `BsR2nsN` and Amazon `QN`; preserve the [reference guide](docs/official-references.md), archived games and reproducible material fits.
- [x] Leave the 400-ply NC–Amazon game unscored, without continuation or replacement.
- [x] Archive completed-study notes and record the [cloud replay/fit baseline](experiments/balance/results/reference-material-001.resources.json): 44.3 seconds and 629 MiB peak RSS.
- [ ] Measure Windows folder sizes and analysis RAM before optimizing; do not infer them from the cloud measurement.
- [ ] Add verified compressed archives/shared evidence references and optional large sample exports without changing frozen readers or deleting source evidence.

The [mixed-army plan](docs/mixed-army-balance-plan.md) and
[balancing strategy](docs/balancing-strategy.md) explain the later analysis.
