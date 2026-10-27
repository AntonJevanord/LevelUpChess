# Roadmap

Version 16 is closed with UI follow-up `v0.16.5`. The four references and completed evidence remain fixed. Version 17 will begin mixed-army testing; this roadmap starts no balance run.

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

## 2. Finish the version-16 playable closeout

- [x] Add official names/rules and immutable family-workshop candidates to new playable libraries; retain historical libraries and profiles.
- [x] Add board-click upgrade selection and a setup preview; retain the current game until starting the selected armies.
- [x] Expose king grants through a named King workshop using the unchanged reference profile.
- [x] Let short desktop viewports scroll past the setup toolbar to reveal the bottom rank; recheck after resizing and flipping.
- [x] Give first level-1/2/3 options green/yellow/red accents and alternatives blue/orange/purple accents; keep the four references red across workshops.
- [x] Add king purchases costing 1–9: keep the ordinary royal king and grant one finite reserve piece, with own-half drops and no checking drops.
- [x] Complete movement, royal safety, castling, promotion, native-engine, undo, clock, save and PGN checks for the new libraries, including ten browser regressions and a native forced drop.
- [x] Push the tested closeout and tag `v0.16.3`; keep version 16 intact when branching version 17.
- [ ] Human-playtest the [new roster](docs/playtest-roster-v16.md) for readability, fun and counterplay. Changed behavior receives a new design revision.

## 3. Version 17: test combinations of the references

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
- [ ] Declare drop-aware balance collection and analysis before testing king grants; normal setup grants one guard, while laboratory bundles may place several directly in the starting FEN pocket. Keep one ordinary royal king per side.
- [ ] After the replacement roster is settled, test reserve purchases against fixed opponents with declared drop rules. Material estimates remain supporting evidence for extra units.

The [mixed-army plan](docs/mixed-army-balance-plan.md) develops these decisions. The [balancing strategy](docs/balancing-strategy.md) sets the evidence rules. Preserve tested milestones as branches/tags; later method or storage work must not rewrite earlier experiments.
