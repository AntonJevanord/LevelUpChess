# Balancing strategy

Stay on version 16 while separating engine evaluation from purchase balance.
The goal is a useful, enjoyable set of upgrades with credible strength ranges,
not an exact material number for every possible position.

## Current evidence and stopping point

The completed automatic-value stage has 200 scored games, no truncations or
errors, and 20 color-swapped opening pairs per comparison. Draws count as half
a point. On otherwise ordinary armies, these are the Blink purchase's scores
against the unchanged Amazon purchase:

| Purchase | Stable ID | Point score |
| --- | --- | ---: |
| Quiet Blink, ordinary rook captures | `rook.purple@3` | 46.25% |
| Blink, adjacent diagonal captures | `rook.purple@4` | 85.00% |
| Long Blink, two-square diagonal captures | `rook.purple@5` | 88.75% |

This stage varies movement and its automatic valuation together. It reinforces
the evaluation concern but does not isolate material values as the cause.
Quiet Blink also receives a high automatic estimate while scoring near 50%.

The user has started the remaining 200-game eight-point stage. Keep its engine,
runner, configurations and movements frozen. Compare both policies on shared
fully scored opening pairs using the [existing plan](../experiments/balance/rook-values-plan.md).
The complete campaign remains capped at 400 games. No further games are scheduled.

If scores change substantially, the result demonstrates sensitivity to an
evaluation assumption. If they remain similar, changing this particular prior
has not explained the original result. Neither outcome proves an exact value,
best play or a universally balanced movement design. Review recorded trades,
completion, opening sensitivity and human feedback before choosing a response.

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

If calibration remains necessary, one future test can give both armies identical
pieces while the two engines use different valuation policies, swapping policies
between colors. Each engine must value both colors consistently. This tests which
policy plays those armies better; it still does not reveal an intrinsic material
constant. The current runner shares one policy per game, so this requires a
separate harness change and an explicitly capped experiment. It is not scheduled.

## Estimate the Amazon's added benefit first

After closing the current 400-game question, a future pilot can estimate the
Amazon purchase's incremental benefit, Δ, from play. Freeze the evaluator first,
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

Declare the pilot's question, layouts, effort, cap and stopping rule before play.
Review precision before estimating other purchases. No further games are scheduled.

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
