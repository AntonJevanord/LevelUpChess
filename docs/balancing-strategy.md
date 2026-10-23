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
and is independent of reviewing the material method.

## Material anchor: first method did not validate the scale

The [first material pilot](../experiments/balance/results/material-pilot-001.md)
stopped after 256 control games and 64 Amazon games. All 320 replay correctly,
but the queen-favored control side still scored 82.81% after five pawn removals.
It did not recover a 50% crossing in the tested range. The remaining 192 games
are unused; no replacement campaign is scheduled.

The Amazon's first-stage crossing is about 4.58 removed starting pawns across
four opening blocks. The control did not establish that coordinate as conventional
pawn-equivalent material, so do not call it +458 cp or assign a whole-piece value
of 13.58. A consistent curve and narrower sampling band cannot remove setup bias.

Removing many starting pawns changes mobility, king cover, targets and promotion.
The control opponent has no queen, whereas the Amazon opponent keeps one, making
some pawn-removal costs different between phases. Two left/right layouts expose
only part of these effects. Native raw MG/EG entries are also internal components,
not a linear conventional material list. There is no justified correction factor
that makes this control equal 400 and transfers the correction to Amazon.

Keep the goal of estimating the Amazon's added benefit Δ over an ordinary queen.
A revised method should first pass a small diagnostic screen using ordinary
reference differences, fuller pawn structures, representative matched positions
and several compensation packages. An exact queen-to-rook replacement could
improve one setup detail; it does not by itself validate the scale. Define what
the assay measures, then declare a limited budget before implementation or play.

If a credible contextual Δ range is eventually established, use it as a provisional
level-3 target, with roughly 2Δ/3 and Δ/3 for levels 2 and 1. That remains a design
hypothesis. Keep native parameter units, displayed engine scores and conventional
material centipawns separate. Do not tune the evaluator or reinterpret the data
until the desired target appears.

For now, retain the ordinary/Amazon evaluation and movement definitions, use
relative equal-cost comparisons and human feedback for design decisions, and
preserve both valid games and negative method results. Future reports must lead
with control validity and label unvalidated outputs as contextual odds.

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
