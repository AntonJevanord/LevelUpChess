# Roadmap

Version 16 is closed. The four references and completed evidence remain fixed. This roadmap orders future work; it does not start another balance run.

## Completed foundation

- [x] Freeze Vanguard `RfB`, Unicorn `NC`, Cruisader `BsR2nsN` and Amazon `QN` as three-point references with immutable IDs.
- [x] Verify the complete bishop-decision uploads and replay all 2,304 retained/new histories; reproduce the nine matchup scores and ranges.
- [x] Preserve the separate [1,280-game material fit](experiments/balance/results/bishop-decision-material-001.report.md) and [all-reference fit](experiments/balance/results/reference-material-001.report.md).
- [x] Leave the 400-ply NC–Amazon game unscored; no continuation or replacement is planned.
- [x] Move detailed completed-study documentation and historical checklists into the [archive](docs/archive/roadmap-version-16.md). Preserve unresolved research there without treating it as an automatic queue.

## 1. Housekeeping before the next campaign

- [x] Record a [cloud analysis baseline](experiments/balance/results/reference-material-001.resources.json): 44.3 seconds and 629 MiB peak RSS for the complete all-reference replay/fit. No runtime optimization is claimed.
- [ ] Measure local Windows run-folder sizes and analysis RAM before choosing optimizations; the cloud measurement does not describe that PC.
- [ ] Add verified compressed archival and shared evidence references for future runs, avoiding repeated parent copies. Preserve legacy paths, raw bytes, manifests and frozen readers.
- [ ] Make large derived sample/EPD exports optional in future tools. Consider streaming or compact arrays only after identifying the bottleneck.
- [x] Shorten the four active guides and archive their original completed-study notes without deleting evidence.

## 2. Start the next playable milestone

- [ ] Branch from the tested version-16 closeout and add the official names/rules to a new playable library; retain historical libraries.
- [ ] Verify movement, royal safety, castling, promotion, engine play, undo, clocks, saves and PGN for that library.
- [ ] Human-playtest surviving pawn and bishop ideas for readability, fun and counterplay; give every changed behavior a new design revision.

## 3. Test combinations of the references

- [ ] Declare one capped 2v2 reference pilot using legal shared setups and complete color pairs. Vary partners, starting members and openings; do not silently create extra queens or change pawn placement.
- [ ] Compare combination outcomes with the existing single-upgrade evidence. Record interaction uncertainty rather than forcing additive strengths.
- [ ] Keep all source contexts and original results visible. No new match games are scheduled until the pilot's question, setup and budget are declared.

## 4. Add mixed-army ratings

- [ ] Implement an army-outcome model from differences in upgrade counts. Report Elo-style relative contributions, uncertainty, coverage and held-out prediction; do not award ordinary individual Elo updates to every member of a winning army.
- [ ] Declare anchors and enough varied comparisons to identify tier relationships. Equal-budget games alone leave a cost-related ambiguity.
- [ ] Mix informative near-even matches with exploration. Freeze each scheduling batch so adaptive selection and stopping remain auditable.
- [ ] Check the working tier relationship: two level-2 purchases should usually beat one level-3 purchase and trail two level-3 purchases across a varied basket. Treat this as a design target with matchup exceptions.

## 5. Lower tiers and reserve grants

- [ ] Begin a small level-1 pawn shortlist. Compare three level-1 purchases with one level-3 purchase using matched legal armies; inspect promotion and cooperative effects.
- [ ] Use the surviving level-1 roster and frozen level-3 references to assess level-2 pieces and mixed six-point armies.
- [ ] Integrate drop-aware reserve setup, engine moves, history, saves and PGN before testing king grants. Keep one ordinary royal king per side.
- [ ] After the replacement roster is settled, test reserve purchases against fixed opponents with declared drop rules. Material estimates remain supporting evidence for extra units.

The [mixed-army plan](docs/mixed-army-balance-plan.md) develops these decisions. The [balancing strategy](docs/balancing-strategy.md) sets the evidence rules. Preserve tested milestones as branches/tags; later method or storage work must not rewrite earlier experiments.
