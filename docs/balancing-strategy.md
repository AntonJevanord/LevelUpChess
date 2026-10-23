# Balancing strategy

Stay on version 16 while separating engine evaluation from purchase balance.
The goal is a useful, enjoyable set of upgrades with credible strength ranges,
not an exact material number for every possible position.

## Current evidence and stopping point

The [400-game comparison](../experiments/balance/results/rook-values-comparison-001.md)
is complete: 200 games per policy, no errors or truncations, and 20 shared scored
opening pairs per comparison. Draws count as half a point. Blink purchases faced
the unchanged Amazon purchase on otherwise ordinary armies:

| Purchase | Stable ID | Automatic | Eight-point | Change |
| --- | --- | ---: | ---: | ---: |
| Quiet Blink, ordinary rook captures | `rook.purple@3` | 46.25% | 15.00% | −31.25 pp |
| Blink, adjacent diagonal captures | `rook.purple@4` | 85.00% | 76.25% | −8.75 pp |
| Long Blink, two-square diagonal captures | `rook.purple@5` | 88.75% | 85.00% | −3.75 pp |

Both stages' moves, outcomes and policy annotations check out; actual binary and
runner identities await the missing manifests. All 80 control games reproduce
the same histories across policies. Quiet Blink's result changes substantially;
the capture variants remain above the working band under both policies. In the
manual stage all three receive the same values, yet their scores differ widely.

Close this batch with **evaluation sensitivity established under the recorded
protocol; authoritative Blink valuation and movement changes deferred**. The
manual policy does not validate eight points, and the automatic result does not
certify Quiet Blink as balanced. Both engines changed policy together, so the
score changes do not identify which engine plays better. Fixed related openings
limit generalization. Keep both research policies and current prototypes;
no extension or blanket value assignment follows.

## Keep three quantities separate

| Quantity | Meaning | How it is established |
| --- | --- | --- |
| Upgrade cost | The 1/2/3 points a player spends | A game-design choice |
| Engine MG/EG value | A material prior used in evaluation and exchanges | A recorded engine parameter |
| Incremental strength | Benefit over the ordinary piece or purchase package | Contextual play and comparison evidence |

“Ordinary material + level” was a starting prior, not a calibration rule. A three-point
rook purchase does not prove an eight-pawn whole-piece value. The current manual
policy anchors ordinary rook at five and scales its MG/EG values by 8/5, giving
2042/2208 internal units. Those units do not map linearly to familiar pawn values.

A purchase includes extra units, pawn displacement, promotion and deployment.
Royal kings have no exchange price; test safety, mating and conversion instead.

## Establish a credible evaluator before redesigning from scores

For future batches, record every active type's actual raw and adjusted MG/EG
values, including ordinary pieces and references. Use the native diagnostic to
check both colors and all relevant tables. Collecting this inventory needs no games.

Every piece already has a value. Retain plausible defaults; flag estimates with
documented problems such as notation-dependent double counting, excessive quiet
mobility credit or implausible exchange behavior. Use explicit overrides only
where justified, with a named policy and a frozen identity. Avoid assigning all
pieces their desired final strength merely because that is their intended cost.

Keep movement changes and evaluation changes in separate experiments. Never tune
a value until its purchase reaches 50% against Amazon: that would use the desired
answer as the calibration target. A better or worse Amazon score alone does not
identify which valuation policy makes either engine play better.

If choosing Blink search values remains necessary, one future test can give both
armies identical pieces while the engines use different valuation policies, swapping policies
between colors. Each engine must value both colors consistently. This tests which
policy plays those armies better; it still does not reveal an intrinsic material
constant. The current runner shares one policy per game, so this requires a
separate harness change and an explicitly capped experiment. It is not scheduled
and does not block an Amazon-only material anchor.

## Estimate the Amazon's added benefit first

The [512-game material pilot](../experiments/balance/material-estimate-plan.md) estimates the Amazon purchase's incremental
benefit, Δ, from play. It uses only ordinary pieces and the unchanged Amazon;
neither tested Blink override changes their values. Freeze this reference evaluator,
then compare matched ordinary-queen armies: one side upgrades its queen to Amazon
and gives up compensating ordinary material. Swap colors and use several handicap
amounts and layouts to bracket compensation. Removing material also changes
development and king shelter, so report a contextual range.

This estimates Δ directly instead of subtracting two separately estimated
whole-piece values. The ordinary queen remains the common baseline. Matching
Amazon's win rate alone provides no absolute material value; compensation
supplies that reference.

Use the estimated Δ as a common provisional target: level 3 aims at Δ added
benefit, level 2 at roughly 2Δ/3, and level 1 at roughly Δ/3. If Δ were hypothetically
300 material centipawns, those targets would be 300/200/100. This is an example,
not a measurement, and strength need not scale linearly with purchase level.

Define material centipawns as 100 per reference pawn. Keep that convention distinct
from native raw MG/EG units and from an engine's displayed centipawn evaluation.
Neither conversion is an automatic equality. Do not install these desired strength
targets as engine parameters or retune the evaluator to obtain them.

The pilot declares its layouts, effort, 512-game cap and stopping rule before play.
Run the 256-game queen-versus-rook odds control once, then Amazon increments of
64, 64 and 128 games, retaining cumulative estimates at 64/128/256. Live estimates
update after finished games when complete matched blocks exist. Review layout
sensitivity and conditional resampling stability before estimating other purchases.
The control is reused within its frozen context, not repeated at every checkpoint.
This proceeds independently of optional Blink calibration; formal pilot games
remain for local execution and no automatic extension follows.

## Compare surviving designs against the common target

1. **Play and inspect first.** Shortlist designs for readability, enjoyment and
   counterplay. Check promotion, en passant, castling, checks and representative
   mating or conversion positions before spending another match budget.
2. **Use a small reference basket.** Keep Amazon fixed within a batch as one
   level-3 upgrade benchmark. For shortlisted candidates, choose a contrasting
   equal-cost purchase or combination that tests a relevant interaction. Avoid
   repeating a full round robin or retesting unchanged designs without a question.
3. **Hold evaluation fixed.** Record engine, policy, movement revisions,
   deployment, openings and search effort. Swap colors and score complete pairs.
   Treat 40%–60% against Amazon as a practical screening band, not absolute value
   or certification. A score near 50% suggests comparable purchases in that setup.
4. **Estimate compensation for shortlisted purchases when useful.** Once the
   Amazon pilot establishes a usable anchor, bracket other purchases against
   ordinary material across several layouts and compare their added benefit
   with the tier target. Report contextual ranges, not exact pawn numbers.
   Add the ordinary baseline to estimate a whole piece only when its assumptions
   and deployment match. Include every extra unit in a purchase package.

An Amazon score compares upgrade packages; it is not a direct rook-versus-Amazon
exchange rate. The familiar 12–13 total estimate motivates a prior, not the final
anchor. One score, score-equivalent Elo or static engine evaluation cannot be
converted directly into material points. Promotion, cooperation, congestion and
position phase can change relative values and create matchup-specific strengths.

## Bound the work and make a decision

Before any later batch, name the decision, candidates, policies, references,
opening cohort, effort, game cap and stopping rule. Reserve at most one optional
confirmation with a specific question and budget; it never starts automatically.

Close a batch with **keep, revise, park or defer**, recording both evidence and
limits. Ambiguous results can justify keeping a prototype for human play without
declaring it balanced. Freeze the current choices and stop rather than repeatedly
retuning toward 50% or increasing the sample until a preferred answer appears.

Follow-up work needs a new question or a changed design that could alter a decision.
See [BALANCE.md](../BALANCE.md) for tools and [DESIGN.md](../DESIGN.md) for design history.
