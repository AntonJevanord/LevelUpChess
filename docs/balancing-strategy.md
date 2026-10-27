# Balancing strategy

Version 16 is closed. Keep the [four official references](official-references.md) fixed while developing the next playable roster and mixed-army tools. The ordered implementation plan is in [TODO](../TODO.md) and the [mixed-army proposal](mixed-army-balance-plan.md).

## Separate the measurements

| Quantity | What it describes |
| --- | --- |
| Upgrade cost | The player's level-1/2/3 purchase price |
| Native MG/EG values | Search parameters used by the engine |
| Fitted material | Outcome-predictive family values and upgrade bonuses in a selected dataset |
| Points score | Observed wins plus half draws against a particular opponent |
| Elo-style contribution | A relative army-strength parameter inferred from varied team outcomes |

Changing an engine value can change its play. Do not set every piece to a desired material target or tune the evaluator until a matchup reaches 50%. Record the actual policy and inspect a specific decision before declaring a calibration experiment.

## Fixed references and evidence reuse

Vanguard `RfB`, Unicorn `NC`, Cruisader `BsR2nsN` and Amazon `QN` are three-point replacement purchases. Give changed behavior a new immutable revision. A reference change creates a new versioned benchmark; it does not rewrite earlier scores.

The [all-reference fit](../experiments/balance/results/reference-material-001.report.md) combines 1,534 complete paired games from all six matchups. It preserves source contexts and excludes other experimental opponents. The separate [new-game fit](../experiments/balance/results/bishop-decision-material-001.report.md) remains intact.

Replay source games under their original rules, then align material features by stable identity. Preserve engine/settings differences and unknown provenance. Copies of an inherited journal add no evidence. Shared openings retain one validation/resampling group across every source.

Future individual candidates face this fixed basket. Inspect each matchup and uncertainty alongside a basket average. Roughly 40%–60% points score is a practical screen, not a proof of equivalence or a reason to seek endless confirmations.

## Combination tests before a general rating pool

Start with a bounded 2v2 reference pilot on legal matched armies. Pair each reference with varied partners, starting members and openings; retain full color pairs. Keep the ordinary starting army common rather than inventing extra queens merely to fill a symmetric table.

Compare combination outcomes with the existing single-upgrade evidence. A linear sum is a baseline hypothesis: mobility, pawn support, mating coverage and trading opportunities can produce interactions. Follow up only when an interaction would change a design decision.

## Elo-style mixed-army ratings

Model the game outcome from differences in upgrade counts between the armies, plus declared color/opening effects. Estimate each design's contribution jointly. Awarding the same ordinary Elo update to every piece on a winning team would confuse strong partners with strong designs.

An Elo-style scale makes relative outcome effects easier to read; it is not intrinsic piece material or a rating independent of setup, engine and opponents. Keep draws, uncertainty, exposure counts and held-out prediction visible.

Fix anchors before collection. Equal-cost armies alone leave a cost-related ambiguity: adding the same multiple of purchase cost to every contribution leaves every equal-budget prediction unchanged. Include declared reference/ordinary comparisons and varied tier relationships when needed to identify the intended scale.

Mix near-even pairings with exploration, including weak-looking or uncertain designs. Balancing every army by its current estimated rating alone can hide errors and reduce informative variation. Freeze scheduling batches and record their selection rules, seeds and stopping decisions.

Preserve the complete journals even when reporting only ratings. They support reconstruction, detecting interactions, and checking whether a design's apparent strength came from its partners or starting location.

## Lower levels and reserves

A small level-1 pawn roster is a useful next baseline. Three level-1 purchases against one level-3 purchase tests equal-cost armies while retaining ordinary promotion and opening behavior. Vary which pawns are upgraded; the result includes cooperation and placement effects.

Use surviving level-1 and frozen level-3 references to assess level 2. Two level-2 purchases beating one level-3 purchase and trailing two level-3 purchases is a sensible basket-level design goal. It is not a rule every matchup must satisfy; costs differ and counterplay matters.

Reserve king grants need drop-aware setup, engine/history/save/PGN support first. Keep one ordinary royal king and compare capturable grants with explicit deployment regions and checking/drop rules. Test these after the replacement roster is settled; extra units and sacrifice options make material estimates secondary.

## Bounded statistics and storage

Declare candidates, setups, effort, checkpoints and a game cap before scored play. Report rank, convergence, feature coverage, no-sample games, incomplete pairs and failed resamples. Withhold unsupported estimates instead of filling them with a target value.

Material fits assume pawn = 1 and queen = 9 when using that scale. Each sampled game has unit total weight. Whole-piece uncertainty uses family plus bonus within each shared bootstrap refit. Related opening ancestry still limits all conditional ranges.

Keep raw journals, manifests and matching source/engine identities reproducible. Reports and large derived exports can be regenerated. Future storage should share compressed evidence by content identity, while frozen historical readers retain their paths and byte checks.

Measure peak RAM and runtime before optimizing streaming, caches or numeric storage. Compressing disk files or shortening documentation does not establish a runtime memory reduction. Keep dependency files and intentional offline bundles intact.

The [archived strategy](archive/balancing-strategy-version-16.md) preserves completed method reviews and their original limitations. Unfinished historical provenance questions remain recorded there and in the [archived roadmap](archive/roadmap-version-16.md); they do not create an automatic experiment queue.
