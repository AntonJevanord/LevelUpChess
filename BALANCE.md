# Balance experiments

Run paired engine games to compare upgrade armies, strength handicaps, and ordinary material odds. Upgrade prices stay fixed at blue 1, orange 2, and purple 3. The aim is to measure whether their abilities justify those prices, including whether three blue upgrades compete with one purple upgrade.

These tools collect results; they do not assign measured values to pieces or change the game's movement rules.

The [first balance revision plan](experiments/balance/revision-plan.md) starts piece changes now. It caps the first two-piece batch at 200 scheduled games and ends with a keep/revert/park decision. Existing experiment files are options, not a queue that must be exhausted before development continues.

## Start a run

Install dependencies with `npm ci`. On Windows, use `npm.cmd` in place of `npm`. No browser or running game server is needed. The harness uses the bundled Windows engine, or the executable selected by `FAIRY_STOCKFISH_PATH`; Linux/macOS need a compatible native executable.

Start with the short smoke configuration:

```sh
npm run balance -- --config experiments/balance/smoke.json --out balance-results/smoke
```

The smoke run checks the workflow. Its small search budget and move limit do not provide balance evidence. Choose a new output directory for each experiment; resume an existing one instead of overwriting it.

| Configuration | Purpose |
| --- | --- |
| `experiments/balance/smoke.json` | Short control and three-blue-versus-purple-knight checks. |
| `experiments/balance/budget-3.json` | Equal-cost armies, including three blue upgrades versus one purple and blue-plus-orange versus purple. |
| `experiments/balance/outlier-effects.json` | Follow-up: each knight/pawn/rook tier and the blue bishop against ordinary armies; pawns start on d2. |
| `experiments/balance/budget-3-confirmation.json` | Follow-up: five selected budget-3 matchups at ten times the node budget, holding the same openings fixed. |
| `experiments/balance/blue-rook-confirmation.json` | Follow-up: ordinary control and blue rook versus ordinary armies at 100,000 nodes. |
| `experiments/balance/upgrade-effects.json` | Each upgrade against an ordinary army, to estimate its added benefit; asymmetric king cases are exploratory. |
| `experiments/balance/skill-sweep.json` | Compare a purple-queen army at several uncalibrated skill settings against an ordinary army. |
| `experiments/balance/material-anchors.json` | Ordinary-army controls and pawn, knight, bishop, rook, or queen handicaps. |
| `experiments/balance/purple-material-handicaps.json` | Optional 320-game material research at 100,000 nodes; not required before piece changes. |
| `experiments/balance/designs-smoke.json` | Six-game schema-2 workflow check: original and candidate pawn/rook definitions coexist under one registry. |
| `experiments/balance/revision-1-screen.json` | First candidate batch: 100 games over the ten predeclared screening prefixes. |
| `experiments/balance/revision-1-confirmation.json` | Reserved confirmation half: at most 100 games after the screening decision. |

For example:

```sh
npm run balance -- --config experiments/balance/budget-3.json --out balance-results/budget-3
```

Add `--limit-pairs 2` to a new run to cap that invocation at two color-swapped pairs. A limited run is useful for inspection, not a substitute for broad opening coverage.

These configurations are templates and historical protocols, not a queue. The first revision batch is closed; the next milestone is the playable experimental picker.

| Completed experiment | Main finding | Evidence |
| --- | --- | --- |
| Budget-3 baseline, 480 games | Selected purple rook/pawn/knight armies outperform the blue-minor allocation. | [Report](experiments/balance/results/budget-3-001.md) |
| Individual effects, 440 games | Large tier differences and an anomalous blue-rook score; all games replayed. | [Report](experiments/balance/results/outlier-effects-001.md), [audit](experiments/balance/results/outlier-effects-001.games-audit.md) |
| Blue-rook confirmation, 80 games | Intended larger search raises its score from 28.75% to 52.5%; control remains 50%. | [Report](experiments/balance/results/blue-rook-confirmation-001.md) |
| Budget-3 confirmation, 200 games | Selected purple advantages persist at the intended larger search budget. | [Report](experiments/balance/results/budget-3-confirmation-001.md) |
| First revision, 100 screen + 60 confirmation games | Park pawn@2; keep rook@2 experimentally: 85% vs blue minors, 61.25% vs blue-plus-orange; control 50%. | [Decision and game audit](experiments/balance/results/revision-1-rook-confirmation-001.md), [revision ledger](experiments/balance/results/revision-1-evidence.csv) |

These are contextual army scores, not measured whole-piece material values. Reports distinguish summary-only evidence from audited manifests and games. The first revision spent 160 of its capped 200 games; the remaining 40 are unused, with no automatic extension.

Material-compensation templates remove an ordinary piece from the upgraded army. A score near 50% suggests compensation for that specific handicap, including its positional effects. This measures the upgrade bonus; the underlying ordinary piece still contributes. Such research remains optional.

### Select comparisons for a new run

Use `--comparisons ID,ID` to select comparisons without changing the full declared configuration or design allocation. Selection preserves seeded order and color pairs, and happens before `--limit-pairs`. Unknown, empty, and repeated IDs are rejected. For a short workflow example:

```sh
npm run balance -- --config experiments/balance/designs-smoke.json --out balance-results/selected-smoke --comparisons rook-revisions,standard-control --limit-pairs 1
```

This deliberately short smoke produces unscored truncations. It is not a balance experiment. Normal `--resume DIRECTORY` uses the exact recorded schedule; selection flags apply only to a new run. The official selector reproduces the earlier rook-only schedule without the temporary Node override.

Registry allocation and strength validation still use every declared comparison. An unsupported strength setting in an excluded comparison can therefore fail preflight; keep declared settings compatible with the chosen engine. The original configuration and registry remain part of the run identity.

## Stop, inspect, and resume

In the running terminal, press `q` or Ctrl+C to stop immediately with a checkpoint, `g` to stop after the current game, or `p` to finish the current color-swapped pair. Stopping after a pair avoids leaving one color unrepresented.

From another terminal, use:

```sh
npm run balance -- --status balance-results/budget-3
npm run balance -- --stop-now balance-results/budget-3
npm run balance -- --stop-after-game balance-results/budget-3
npm run balance -- --stop-after-pair balance-results/budget-3
```

Resume an interrupted run with:

```sh
npm run balance -- --resume balance-results/budget-3
```

Progress is checkpointed after moves. An aborted or errored attempt remains in the log; resuming continues the saved game without turning the interruption into a loss or draw. Resume uses the original manifest settings and checks engine/rules identities. Change the node budget, move limit, engine, or rules in a new run directory. Only one writer may use a run directory at a time.

Version 0.7.1 retries brief Windows file-sharing failures while atomically replacing checkpoints and reports. On the preserved `version_07` branch, an approved recovery patch can resume a 0.7.0 run with identical engine, rules, and settings; the original manifest stays unchanged and `storage-upgrade.json` records the patch. Resume uses validated journal history if it is newer than the checkpoint, and skips games already completed or truncated.

Use the matching original branch and engine to resume an old run. Version 08 changes the runner/rules identity and does not migrate version-07 experiments. Keep existing result folders. If OneDrive or another application holds a file beyond the retry window, stop the run, let that application release the file, and resume. You can also move the entire stopped run folder to a location outside OneDrive and pass its new path to `--resume`.

If you stop during initial rules preflight before `run.json` exists, no games have started; repeat the original command. External stop commands apply once the run directory has an active lock.

## Choose armies and search settings

Copy a sample JSON file and edit its `comparisons`. Both armies use White-side starting-square names; the harness mirrors them when that army plays Black. For example, `b1` means the queen-side starting knight for either army, and `e1` selects its king level. Missing entries mean ordinary level 0.

This comparison spends three upgrade points on each army:

```json
{
  "id": "three-blue-v-purple-knight",
  "armyA": { "upgrades": { "b1": 1, "g1": 1, "c1": 1 } },
  "armyB": { "upgrades": { "b1": 3 } },
  "strengthA": { "skill": 20 },
  "strengthB": { "skill": 20 }
}
```

Costs are the sum of chosen levels. Compare equal costs first, then vary which pieces receive those points. All upgrade families and independent king choices are supported by the experiment profiles. A purple knight still adds its extra unit. King experiments retain one royal per side and use the profile recorded with the run.

When both kings have the same level, the harness uses the engine's actual king type, preserving ordinary king-safety evaluation. Different king levels require custom pseudo-royals: their legal moves and checkmate are enforced, but the engine's usual king-shelter/danger evaluation is disabled. These asymmetric-king results are exploratory and may reflect that evaluation weakness. The manifest records this distinction. Even symmetric upgraded kings need evaluation tuning before strength claims are reliable.

For ordinary material odds, an army can include `"remove": ["a2"]` to remove its a-pawn, or another non-king starting square. A piece cannot be both removed and upgraded. Removed material is a separate handicap, not a change to upgrade prices.

Default search uses a fixed node budget, `threads: 1`, equal hash, and equal skill. This is a useful baseline for comparing armies at similar search effort. The configuration selects either `engine.nodes` or `engine.movetimeMs`; use one, and record changes as a new experiment. Fixed nodes do not guarantee identical play across engines or platforms.

Each side selects exactly one of `{"skill": 0}` through `{"skill": 20}`, or `{"elo": ...}` within the engine's advertised UCI range. The harness rejects unsupported strength settings. Skill values are not Elo ratings. `UCI_Elo` is an engine's ordinary-chess calibration for particular conditions; it is not a validated rating for these variants or arbitrary node budgets.

## Design revisions and run-level registries

Schema-1 files keep their numeric upgrade levels and historical profiles. Schema-2 files instead choose permanent design IDs from [the catalog](src/design-catalog.js):

```json
{
  "id": "pawn-revisions",
  "armyA": { "upgrades": { "d2": "pawn.purple@1" } },
  "armyB": { "upgrades": { "d2": "pawn.purple@2" } },
  "strengthA": { "skill": 20 },
  "strengthB": { "skill": 20 }
}
```

The file's top-level `schemaVersion` must be `2`. Choices must match their starting-piece family. Current dynamic profiles allow at most six upgrade points per army and support nonking designs with ordinary royal kings; independent upgraded kings and the larger historical sandbox remain available through schema 1. Definitions are curated catalog entries in this milestone, rather than arbitrary movement text supplied in experiment JSON.

Before games start, the runner resolves the union of designs in every comparison and freezes one deterministic letter/custom-slot allocation. PNBRQK stay reserved for ordinary pieces and promotions. Identical design revisions share their allocation across both armies; different definitions keep distinct types. Existing assignments are preferred when available. A run that exceeds engine capacity is rejected before collecting results; split a larger catalog into declared batches.

The run archives exact definition snapshots, allocations, generated profile rules, and their hashes. Fresh engine processes are still used for each game. Resume validates the same registry and source/rules identities before writing; it does not silently use a design's latest revision. The initial implementation also verifies archived definitions against the immutable bundled catalog, so keep the original checkout with archived results. Loading retired definitions independently of that checkout belongs to the future portable save/export work.

The revised `pawn.purple@2` has quiet orthogonal slides of one or two clear squares, with the original diagonal captures and standard promotion. `rook.purple@2` keeps ordinary rook movement/captures and adds capture-only knight jumps. Their `@1` predecessors remain unchanged. All other current nonking designs are also available as `family.color@1`; IDs identify behavior and must not be renamed when display colors change.

Use `designs-smoke.json` to verify workflow. Its four-ply limit intentionally truncates games; these are unscored. The first actual candidate batch has **100 screening games** in `revision-1-screen.json`, followed by **at most 100 reserved confirmation games** in `revision-1-confirmation.json`. Their opening sets are disjoint and retain the same fixed suite. The [decision plan](experiments/balance/revision-plan.md) is now closed after 100 screening and 60 selected rook/control confirmation games. These files preserve the protocol; they do not queue another run.

Schema-2 results use a new protocol identity. Preserve the mapping when comparing or reproducing results; finite-search play can depend on internal type allocation. Evidence follows stable design revisions and the engine/rules context, never a temporary letter alone. No long-term engine training is performed.

The browser picker, save slot, and PGN importer still use their existing profiles. Dynamic experimental PGNs need their run directory and exact rules in a compatible viewer; they cannot yet be imported into the browser board. The playable second set and its palette follow in version 09.

## Openings and fair comparisons

Each configured UCI opening prefix is played on the actual upgraded armies, then the engines continue. Every comparison uses both assignments of Army A and Army B to White and Black from that same prefix. Seeded ordering helps distribute order effects and makes the schedule repeatable.

The entire opening suite is validated before results are collected. If an opening is illegal for any scheduled army or color assignment, the run fails preflight. Correct the configuration explicitly; dropping only troublesome or unfavorable lines would bias the comparison.

Use varied development patterns and also test sparse endgames separately. Repeating a single opening many times may reveal instability, but does not create new independent opening evidence. The supplied short prefixes are an exploratory, related suite; they are not a random sample of all chess positions.

## Read the results

| File | Contents |
| --- | --- |
| `run.json` | Full configuration, schedule identity, engine and rules hashes, and search/strength settings. |
| `games.jsonl` | Append-only attempts with UCI/SAN moves, FENs, status, result, and termination reason. |
| `checkpoint.json` | Latest move-level state for interruption recovery. |
| `summary.json` | Attempt counts, completed pairs, opening-level scores, and uncertainty estimates. |
| `games.pgn` | Games for replay and review. |

`balance-results/` is ignored by Git, so generated games do not appear in `git status`. Keep or back up these folders separately; Git pulls leave them in place.

These experimental PGNs require the accompanying `rules/*.ini` in a compatible viewer or engine. The current game's PGN importer does not yet accept the balance profiles.

Statuses distinguish `completed`, `truncated`, `aborted`, and `error`. Reaching `maxPlies` is an unscored truncation, not a draw: the schedule advances, and resume does not replay that truncated game with a higher limit. Cancellation and engine errors are also unscored. There is no resignation or draw adjudication from engine evaluation alone. Inspect unfinished and failed attempts alongside the scores: excluding many hard-to-finish games can distort a comparison.

`maxPlies` counts the entire game, including the forced opening prefix. Increase it in a new experiment if truncation is common.

The experiment rules recognize mate, stalemate, repetition, and the fifty-move limit. Bare royals are drawn only when both use the same royal type. Other dead positions may continue until the move limit; this conservative policy matters when comparing endgame-heavy armies. The engine's internal material-draw heuristics can still undervalue endings where upgraded king attacks create new mating possibilities; legal move agreement does not remove that search limitation.

The primary score uses only complete color-swapped pairs. A win scores 1, a draw ½, and a loss 0 from Army A's perspective. Repeated pairs are averaged within each unique opening, then openings receive equal weight. A completed game whose color partner is unfinished is visible in the totals but excluded from the primary estimate.

The reported 95% Hoeffding interval treats opening-cluster means as independent sampled observations. Repeating an opening does not increase that independent sample count. For fixed or closely related openings, treat the interval as descriptive rather than a guarantee about general play. Broad intervals and tiny samples do not establish equality or superiority; a score near 50% with a broad interval is inconclusive.

The score-equivalent Elo gap is `400 × log10(S / (1 − S))`, where `S` is the primary score. At score 0 or 1 there is no finite estimate; interval endpoints can also be unbounded. This is a relative performance description for these armies, openings, engine, and search settings. It is neither a piece's intrinsic Elo nor an engine strength setting to subtract directly.

## Relate upgrades to skill and material

To estimate a strength handicap, compare an upgraded army against an ordinary one at equal settings, then sweep the upgraded side's strength downward while holding the ordinary side fixed. Include ordinary-versus-ordinary controls at the same settings. Look for a score near 50% across diverse paired openings, then repeat at other search budgets. That estimates compensation under the tested protocol; it does not establish a universal Elo bonus for an upgrade.

Keep ordinary material values separate from upgrade prices. Pawn ≈1, knight/bishop ≈3, rook ≈5, and queen ≈9 are familiar starting references. A target of “ordinary piece value + level” is a design hypothesis: a blue bishop might aim to add about one pawn of value, but its price of 1 does not prove that it does. A royal king has no ordinary exchange value.

The Amazon (`queen.purple@1`, `QN`) is the reference upgrade for the next design batch: ordinary queen ≈9 and Amazon ≈12–13 suggests an added benefit of ≈3–4, not an exact LevelUp measurement. Compare a candidate purple purchase against that queen purchase on otherwise ordinary armies first. Multiple-copy layouts need explicit shared setup support and measure their own context. See [the design rationale](DESIGN.md#material-estimates-and-the-amazon-reference).

Material-odds runs can later provide additional anchors under matching conditions. Fit any pawn-equivalent estimates across several anchors, armies, openings, and search budgets; do not convert one score or an engine's centipawn evaluation directly into a material price. Extra units, promotion, and royal safety can make advantages nonlinear.

Start with equal-strength, equal-cost comparisons; inspect completion rates and opening sensitivity before tuning abilities. Keep the agreed 1/2/3 prices and increasing overall strength as design goals, and preserve old profiles when movement changes.

## After changing a piece

The current harness fingerprints the full rules bundle, runner, and engine. A change requires a new run directory; old games remain available under their original identities. There is no automatic per-piece evidence counter or adaptive scheduler. Use `--comparisons` to focus a new run while preserving its full declared registry; changing a configuration can change that registry.

The first batch has a curated [evidence ledger](experiments/balance/results/revision-1-evidence.csv), keyed by design revision, cohort, opponent, and protocol context. Future aggregation should retain that context. A revision should cover movement, captures, regional conditions, extra units, starting placement, promotion, and special rules. Changing behavior creates a new revision; keep its predecessor and start a separate evidence record rather than erase its counter. Opponent changes also change the matchup, even when the tested piece stays the same.

Track completed color-swapped pairs, distinct opening families, opponent coverage, unfinished rates, and uncertainty. Count special-ability use separately: merely appearing in an army does not establish that the ability was tested. Repeating the same opening or counting engine evaluation calls should not make a revision look well understood.

Prioritize a revised piece's comparison against an ordinary army, equal-cost alternatives, and relevant interactions. Add targeted starting positions for its changed behavior, such as blocked captures, promotion races, or sparse mating endings; these endgame scenarios still need harness support. Retain ordinary controls and some unchanged comparisons to detect broader effects. Use fixed effort per side within each comparison; prioritize additional paired games rather than giving one army extra search time.

Engine evaluation tuning is a separate experiment. Its search evaluates whole positions, and custom-piece values come from movement heuristics or explicit overrides, not an evaluation counter. Change evaluation parameters separately from movement, record a new engine/runner identity, and test against a fixed opponent so tuning cannot validate itself.
