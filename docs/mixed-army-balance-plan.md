# Next balance stage: combinations and lower tiers

Version 16 freezes its four reference designs and adds a playable workshop with
finite king reserves. This plan schedules no new games. Keep the unfinished Unicorn/Amazon game unscored; the user declined
a continuation. The [all-reference material fit](../experiments/balance/results/reference-material-001.report.md)
uses the surviving complete pairs and preserves previous estimates separately.

## 1. Clean up the workflow before collecting more data

Keep active instructions and TODO concise; link completed studies and frozen
protocols from history. Preserve raw results, immutable definitions, original
paths and source identities that existing audits require. New archives can use
compressed journals and references to shared evidence rather than copied parent
datasets. Migrate old readers through a compatibility adapter before changing
their inputs. Do not delete local result folders based on a directory tree.

Measure disk usage, peak RAM and elapsed analysis time separately. Installed
dependencies and generated offline bundles serve different purposes from saved
experiment data. Future memory targets are optional EPD/sample exports,
streaming replay and compact numeric samples; establish a measurement before
claiming an improvement.

The [initial cloud baseline](../experiments/balance/results/reference-material-001.resources.json)
measured 44.3 seconds and 629 MiB peak RSS for the full 1,534-game replay and
200-resample verification. This is one Linux measurement; Windows behavior is
not inferred from it. Future numeric optimizations must preserve or explicitly
version the estimator, sampling, normalization and bootstrap semantics.

## 2. Check reference combinations with a small 2v2 pilot

Use two distinct-family three-point purchases per side: Vanguard–Unicorn,
Vanguard–Cruisader, Vanguard–Amazon, Unicorn–Cruisader, Unicorn–Amazon, and
Cruisader–Amazon. These six armies fit ordinary starting slots and cost six
points. They do not require a second starting queen or new custom positions.

A proposed cap is **480 games**: 15 army matchups × 16 declared opening groups
× two colors. Freeze the actual positions, member selection, search effort and
checkpoints before collection. Validate every resulting position;
vary legal home squares for duplicated ordinary families. No games start from
this proposal alone.

Use the existing single-purchase evidence to help distinguish individual effects
from partner effects. Begin with an additive prediction, then inspect held-out
army scores and residuals. A table of team strengths does not automatically
identify every individual and every partnership coefficient. Add a small number
of interaction terms only when the design matrix supports them. Same-family
stacking is a later question; a two-Amazon army needs an explicit setup rule.

## 3. Estimate upgrade contributions from mixed-army outcomes

Use a Bradley–Terry/fractional-logistic army model. Its inputs are differences
in the **starting counts of upgrade purchases**, with an ordinary army as the
zero-upgrade baseline. For example:

`logit(expected White score) = color offset + sum((White count - Black count) * contribution)`

Draws count as half a point. Contributions can be displayed on an Elo-style
scale by multiplying log-odds coefficients by `400 / ln(10)`. These describe
upgrade effects under the tested engine, openings and roster; they are not
human ratings, whole-piece exchange values or native MG/EG parameters.

Fit contributions jointly from complete game records. Giving every winning
piece the same ordinary Elo update confounds its strength with its partners.
Keep individual matchup counts as diagnostics without requiring a complete
candidate round robin. Mixed trials estimate average contributions and reveal
combination effects; the fixed-reference comparisons remain useful anchors.

Predicted-even armies provide information, but reserve an exploratory share
(initial proposal: 25%) for random legal armies, under-tested revisions and
contrasting opponents. Otherwise early mistakes can determine what is tested.
Choose schedules in frozen batches, recording seed, model snapshot and source
data prefix. Keep a fixed held-out position set; preserve all games for refits.

Equal-budget-only games cannot determine an absolute tier scale: adding a
constant times purchase cost to every coefficient leaves their predictions
unchanged. Use suitable unequal-budget/count bridges or ordinary-army anchors.
Compatible existing reference-versus-ordinary games may supply these without
another control run. Require rank and coverage checks before publishing ratings.
Do not force fitted tier order: a level-1 design outperforming level 2 should
remain visible.

Track appearances, complete color pairs, opening diversity, partners, opponents
and uncertainty by immutable design revision. A changed design gets a new ID;
old outcomes retain their old meaning. Fit interval/resampling groups by opening,
including all related teams together. There is no promise that an additive
score explains every rock-paper-scissors matchup or promotion/endgame pattern.

## 4. Test tier economics with specific bundles

The direct equal-cost comparison is **three level-2 purchases versus two
level-3 purchases**: six points per side. Sample multiple legal combinations
and all fixed references rather than choosing one favorable matchup.

Two level-2 purchases cost four: they should tend to beat one level-3 purchase
costing three and trail two costing six. Treat these as aggregate sanity checks,
not guaranteed outcomes for every design, position or partnership. Promotion,
initiative and extra-unit sacrifices can change individual matchups.

Do not substitute "three upgrades per side" for equal purchase cost. Such games
can be useful unequal-budget bridges, but record and analyze their actual costs.
A stable level-1 roster helps later tests; it need not delay testing a small
readable subset.

## 5. Begin lower tiers with pawns; integrate reserve grants separately

Start with a small level-1 pawn selection. Three one-point pawn upgrades can
face each three-point reference across varied files, including central/flank
combinations and both colors. Check promotion, en passant, deployment and legal
opening compatibility before engine collection. These give an initial
three-point package baseline without requiring all level-1 families first.

Three level-1 king grants mean **three nonroyal guards in reserve**, retaining
one ordinary royal king. They are a laboratory bundle, not three royal kings
or an automatic legal purchase in the current one-king setup. The
[reserve prototype](../prototypes/reserve-guards/README.md) preserves the earlier
rules study. Version 16 now supports playable pockets, legal drops, native engine
replies, history, saves and PGN. The normal collection/material pipeline still
needs an explicit reserve protocol and pocket-aware analysis.

Before reserve balance games, declare the tested pocket quantities, drop regions,
checking restrictions, capture behavior and bundle cost; validate collector logs
and reports against those rules. Rate the whole grant ability,
including its deployment tempo, rather than assigning it the board piece's
material price. Prioritize head-to-head outcomes; pocket material estimates
remain supporting analysis. Pawn testing can proceed before this integration.

## 6. Implementation order

1. Close archival analysis and simplify active docs; preserve reproducibility.
2. Branch version 17 from the tested playable closeout. Retain the version-16
   libraries and immutable definitions while developing mixed-army profiles.
3. Add shared multi-upgrade army generation, deterministic batch manifests,
   coverage summaries and a read-only army-rating fitter.
4. Declare and validate the bounded reference 2v2 pilot; review model support
   and partner effects before widening the roster.
5. Playtest level-1 pawns, then declare their fixed-reference bundle tests and
   tier-2/tier-3 bridges. Keep budgets and interpretation explicit.
6. Add adaptive batch selection only after a fixed schedule works; reserve
   exploratory games and shared reference anchors. Profiles must fit the
   engine's 20 custom-type limit, with at most 16 candidates beside the references.
7. Extend collection and analysis for reserves before their separately declared
   outcome tests; retain the playable one-guard purchase and ordinary royal king.

No completed pair is rerun merely because another candidate changes. Further
games require a stated decision and a cap, rather than tighter numbers alone.
