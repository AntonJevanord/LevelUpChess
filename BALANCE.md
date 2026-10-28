# Balance experiments

Version 16 is closed with four [official references](docs/official-references.md): Vanguard `RfB`, Unicorn `NC`, Cruisader `BsR2nsN` and Amazon `QN`. Each costs three upgrade points. Their definitions, roles and identities are frozen.

The initial version-17 screens and follow-ups completed **2,912 games**. The [combined sixteen-start report](experiments/balance/results/v17-followup-001.report.md) reuses the first eight cases only for unchanged designs and keeps revised IDs separate. The [second-screen decisions](docs/version17-second-review.md) consider overall scores, replicated matchups and human-facing tactics. References and historical outcomes stay fixed.

The [640-game focused screen](docs/version17-design-focus.md) compares four new capture/guard designs with the references and three two-step pawns. Every army spends three upgrade points; the baseline has its own report column and is excluded from the four-reference overall score.

## Current results

The [all-reference material report](experiments/balance/results/reference-material-001.report.md) uses 1,534 complete scored color-paired games across all six reference matchups. One NC–Amazon game reached the 400-ply cap; it and its completed unpaired partner are excluded from this paired fit. Both original histories remain preserved, and no continuation is planned.

| Reference | Added value | Whole-piece estimate | Whole conditional 95% range |
| --- | ---: | ---: | --- |
| Vanguard | +3.12 | 7.85 | 7.43–8.33 |
| Unicorn | +2.82 | 5.70 | 5.25–6.21 |
| Cruisader | +3.26 | 6.50 | 6.14–6.94 |
| Amazon | +3.37 | 12.37 | 12.06–12.82 |

Pawn = 1 and queen = 9 are assumed anchors. This fit estimates ordinary knight/bishop/rook at 2.88/3.24/4.73. Each whole piece uses the ordinary family plus bonus from the same fit; intervals use that sum within each bootstrap refit.

The fit retains each source's original profile and identity. Compatible settings and reference-value checks support conditional pooling; they do not prove universal process equivalence. All contexts share the same 128 opening groups for validation and resampling.

The earlier [1,280-game fit](experiments/balance/results/bishop-decision-material-001.report.md), which included the unselected long-hop bishop, remains unchanged. Material coefficients depend on the cohort; saved matchup outcomes and reference movement do not change with a new fit.

## Reproduce existing analysis

These commands use archived games without native searches or new matches:

```bat
node experiments/balance/results/reference-material-001.audit.cjs
node experiments/balance/results/bishop-decision-material-001.audit.cjs
```

The [complete upload audit](experiments/balance/results/bishop-decision-complete-001.audit.json) verifies the final journals/manifests, replays all 2,304 retained/new histories and reproduces all nine original matchup scores/ranges. Earlier study commands and validation details are in the [archived balance guide](docs/archive/balance-version-16.md).

## Declare a new experiment

1. State the design decision and a game cap. Choose immutable candidate revisions, reference opponents, legal starting setups and stopping criteria.
2. Freeze rules, letter allocation, engine/source identities, evaluation policy, search effort, opening groups, color pairs and worker count.
3. Preflight movement, native capabilities, castling, promotion and any reserve/drop rules before scored play. Test stop/resume with bounded workflow checks.
4. Reuse compatible saved games with their source contexts. Deduplicate inherited copies, preserve unknown provenance and exclude unfinished results explicitly.
5. Review at the cap: keep, revise, park or defer. Further games need a question they could change.

Future replacement candidates face the fixed reference basket. A 2v2 reference pilot can test interactions; mixed-army ratings can later screen varied tier combinations. Experimental candidate round robins are not the default workflow.

Use [the strategy](docs/balancing-strategy.md) for interpretation and [the roadmap](TODO.md) for implementation order. The older [preparation and parallel-tool guide](docs/balance-tools.md) describes existing tooling; a new setup or reserve mode may still need implementation and independent rule checks.

## Runs, controls and storage

Use a new output directory for every declared campaign. Resume on the matching source/engine checkout; changing settings creates a new context. Keep the complete run folder, including manifests, journals, evidence and rules.

For collectors that expose the standard controls, **q / Ctrl+C** stops immediately with saved prefixes, **g** finishes active games and **p** finishes active color pairs. Check that command's help before use. Four jobs suit the established Windows runs; worker count remains frozen per campaign.

`games.jsonl` records moves and outcomes. Manifests bind them to exact definitions and settings. Checkpoints support recovery; reports and sample/EPD exports can be derived from the sources. An unscored move-limit truncation is not a draw or a failed file save.

`balance-results/`, installed dependencies and test outputs are already ignored by Git. A large directory tree does not establish high RAM usage. Measure local sizes and process memory before cleanup or optimization.

Preserve source journals and manifests before archiving completed local folders. Use verified compression and shared evidence references in future formats; retain legacy readers and their hashed paths. The newer archived uploads already use compressed storage. No old evidence or dependencies are deleted by this documentation cleanup.

Windows OneDrive can briefly lock checkpoint/report files. Keep retry-safe writes and avoid moving an active run. An unsynced work folder is an option for later runs; back up completed records separately.

## Meaning of the numbers

- A points score is wins plus half the draws divided by scored games. W/D/L and the army's color remain visible.
- Purchase cost, engine MG/EG values, outcome-fitted material and Elo-style army contributions are different quantities.
- Stable material windows reduce recent capture/promotion noise; they do not prove tactical quietness.
- Positions from the same game and opening are dependent. Use game-balanced samples and whole-opening validation/bootstrap groups.
- Near-even direct matchups and similar material estimates support a design choice, rather than proving universal equality. Human playtesting still assesses readability, enjoyment and counterplay.

Closed studies, their exact commands and unresolved historical provenance checks remain available in the [archived guide](docs/archive/balance-version-16.md), [development history](docs/development-history.md) and individual reports under `experiments/balance/results/`.
