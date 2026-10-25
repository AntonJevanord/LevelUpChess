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
are unused; no further pawn-odds campaign is scheduled.

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

Four pawns was only a conventional reference, not a narrow acceptance target.
The supplied ubdip study estimates queen minus rook at 4.89 pawns overall, with
5.75/4.64 in separate middlegame/endgame fits. These contextual estimates strengthen
the case for broad sanity checks rather than forcing familiar integers. Our
control remains unbracketed even at five; it does not prove an incorrect evaluator.

Keep the goal of estimating the Amazon's added benefit Δ over an ordinary queen.
A revised method should first pass a small diagnostic screen using ordinary
reference differences, fuller pawn structures, representative matched positions
and several compensation packages. An exact queen-to-rook replacement could
improve one setup detail; it does not by itself validate the scale. Define what
the assay measures, then declare a limited budget before implementation or play.

First investigate [outcome regression](material-regression-review.md) using the
existing journals, before requesting new games. Fit material differences to final
results with draws retained, stable design identities, game-balanced sampling and
validation/resampling grouped by color pair and opening family. Check feature
coverage and identifiability before reporting pawn-normalized coefficients. The
handicap data can test this pipeline but cannot establish representative values
by itself. NNUE does not learn during play and is not required for this diagnostic.

The [implemented diagnostic](../experiments/balance/results/material-regression-001.md)
retains 3,071 positions from 318 games. It has full feature rank and predicts
held-out-family outcomes, but its ordinary-material coefficient ratios differ
sharply from broad reference estimates. Keep the tool; do not adopt its ratios
as piece prices. Decide whether broader existing data or a different matched
position design can address that check before declaring another game budget.

The [ordinary-control follow-up](../experiments/balance/results/material-controls-001.md)
is complete. Its 80 records contain 40 distinct histories, only 20 ordinary.
That ordinary fit still reverses queen/rook ordering. The Amazon count difference
is zero throughout retained samples, so those controls cannot identify its bonus.
Close this cohort without prices or more games. Inspect separately supplied
outcome-labelled datasets on their own provenance and game counts; do not pool
them automatically with the handicap or control experiments.

The [supplied ordinary EPD baseline](../experiments/balance/results/material-epd-001.md)
contains 605 recorded games and reproduces queen 8.40 / rook 4.74 under its
reference model. Whole-game uncertainty for the difference spans about 2.7–5.1
pawns; changing draw treatment and game weights also changes the fit. Preserve
that corpus as a provisional reference without assigning exact prices. Keep its
legacy generation settings separate from new data.

The [completed 96-game collection pilot](../experiments/balance/results/material-collection-001.md) used
32 distinct full-army book positions, each played once with ordinary pieces and
with an Amazon in each color. Seed 42, automatic evaluation, Skill 20, 20,000
nodes, one thread, 32 MB hash and 400 plies are fixed. Require quiet, legal starts
in all three conditions; freeze the selected FENs, original book hash, rules,
source/executable identities and worker count. This provides both signs of the
starting upgrade imbalance without mass pawn removal or duplicate ordinary
color swaps. All 96 games completed and replay correctly, retaining 881 samples.
Amazon imbalance appears in 63 sampled games across all 32 starting-position groups.

The batch is complete; conditional coefficient interpretation remains a separate
review. Retain draws and equal total game weights. Group validation
and resampling by selected starting position, with its three conditions together;
broader opening families are unknown. Report completion, distinct histories,
imbalance, rank and prediction before conditional coefficient ranges. Keep this
batch closed and decide what the data supports before declaring another budget.
Neither this pilot nor an available normalized fit validates a material-price table.

The [offline anchor review](../experiments/balance/results/material-collection-001-anchors.md)
tests the proposed pawn = 1, queen = 9 convention by constrained refitting, with
a free material-to-score conversion. Its combined Amazon bonus is about 2.82;
held-out prediction is similar to the unconstrained fit. These anchors are
assumptions, and ordinary-only versus combined rook estimates still differ.
Keep the original reports and engine parameters unchanged.

The [completed 1,152-game convergence study](../experiments/balance/results/material-study-001.md)
adds 384 fresh ordinary/Amazon triplets with four recorded jobs, excluding the
pilot's 32 positions. All games finish without errors or truncations; all 126,924
plies replay, recorded source/executable hashes verify, and all three cumulative
checkpoints reproduce. Primary pawn-1/queen-9 assumptions, unconstrained diagnostics,
five grouped folds, 200 whole-position resamples and engine settings remain fixed.

Close the study as **usable for rough comparisons in this context**, without an
extension. Combined rook is 4.78 and Amazon bonus is 3.84 (range 3.37–4.38). Each
changes about 0.32 from the preceding checkpoint, while the anchored ordinary/
combined rook gap falls from the pilot's roughly 0.99 to 0.30. The bonus interval
half-width is about 0.50. These meet the intent of the practical design-resolution
review, not a formal convergence or universal-price test. Unconstrained combined
Amazon bonus is similar at 3.75; its rook cohort gap remains 0.57. Phase effects
and unknown broader opening ancestry still limit interpretation.

Use contextual Δ ≈ 3.8 as the provisional level-3 added-benefit reference, with
rough targets near 2.6 and 1.3 for levels 2 and 1. These lower-tier targets remain
design hypotheses, not measured piece strengths. Keep the Amazon fixed and
purchase prices unchanged; a three-point purchase need not confer exactly three
pawns of benefit. Preserve native parameter units, displayed engine scores and
material estimates separately. Do not tune the evaluator to produce the target.

The [four-reference proposal](../experiments/balance/reference-panel-proposal.md)
compares Horizontal bishop, Knight-capture rook, Camel knight and Amazon across
128 matched positions, capped at 2,688 games with four jobs. All 1,152 ordinary/
single-upgrade and 1,536 head-to-head games inform the final estimates. Five fixed
folds withhold whole 21-game position blocks, training on the other groups to
check head-to-head predictions. No outcome predicts itself. Selected FENs can
share broader opening ancestry, so this remains conditional validation. The
proposal needs collector/report implementation before any scored run.

Also fit the ordinary/single-upgrade and head-to-head cohorts separately. Use
paired whole-position resampling to compare their estimated bonuses and difference
ranges against a practical ±0.5-pawn guide. A head-to-head cohort can support
relative bonuses without identifying their absolute level; expose rank or
coverage failures rather than declaring equivalence from overlapping intervals.

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
   revised material method establishes a usable anchor, compare other purchases against
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
