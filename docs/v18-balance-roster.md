# Version 18 lower-tier roster and mobility screen

The reference sets are usable, but the rest of the lower-tier roster is not
uniformly balanced. Level-one acceptance already exposed several weak designs;
most level-two minor and major upgrades have not had a direct same-tier screen.
This campaign tests those designs against fixed references, rather than starting
another round robin or assigning new prices from a single average.

## References

| Tier | Reference | Exact movement | Design ID |
| --- | --- | --- | --- |
| 1 | Two-step pawn | `fmW2fceF2` | `pawn.blue@5` |
| 1 | King-step pawn | `mWFifmnD` | `pawn.blue@7` |
| 1 | Pawn grant | `fWmfF` | `king.reserve-pawn@6` |
| 2 | Quiet-tall Knight pawn | `ifmnDfmWfceFfsNfmN` | `pawn.knight-tall-quiet@1` |
| 2 | Rank pawn | `ifmnDmfWfceFsR` | `pawn.rank-current@1` |
| 2 | Bishop grant | `F` | `king.reserve-bishop@1` |

The level-one single-purchase panel scores are **48.05%, 53.13% and 48.83%**
respectively, each over 128 games against the other two references. Their pair
results differ: Two-step + Two-step scored 38.91%, King-step + King-step 58.13%,
and King-step + grant 61.25%. Those results describe fixed placements and
opponents; a piece's contribution need not add linearly when paired.

The revised Knight pawn scored **49.93%** over 768 games with three level-one
partners against the four level-three references. Its two fixed opening halves
scored 50.26% and 49.61%. It replaces the original full-forward Knight pawn,
whose fresh control scored 61.65%. Rank pawn and Bishop grant retain their
earlier selections: 51.56% and 54.17% in the original same-budget screen, and
46.59% and 54.45% in the later mixed-package study. Keep those different
opponent baskets separate.

Sources: the [complete reference panel](../experiments/balance/results/reference-panel-v17-002.panel.md),
[level-two review](v17-level2-review.md), [mixed-package review](v17-mixed-panel-review.md)
and [selected Knight-pawn confirmation](v17-followup-decisions.md).

## Level-one candidates

The revised, unstarted screen has nine designs. Positional knight gains quiet
rook movement in every direction; Wazzap knight gains orthogonal steps; Hopping
bishop gains hopping captures. Two Ghost rooks gain quiet diagonal movement,
with either orthogonal or queen-line quiet hops. Baby Amazon uses the previously
tested full quiet-knight addition. Wazzap bishop, Pawn rook and the promising
expanded Climbing knight remain in the shortlist.

| Candidate | Movement | Design ID | Previous score for this body at 20k | Fixed MG/EG |
| --- | --- | --- | ---: | ---: |
| Positional knight | `NmR` | `knight.positional-expanded@1` | 39.06% | 972/1093 |
| Wazzap knight | `NW` | `knight.wazzap@1` | New body | 984/1105 |
| Expanded Climbing knight | `NvWvD` | `knight.climbing-expanded@1` | 59.38% | 984/1105 |
| Hopping bishop | `BgB` | `bishop.hopping-capture@1` | New body | 1480/1302 |
| Wazzap bishop | `BsW` | `bishop.blue@3` | 52.60% | 1277/1252 |
| Diagonal Ghost rook | `RmBgmR0` | `rook.ghost-diagonal@1` | New body | 1716/1636 |
| Omnidirectional Ghost rook | `RmBgmQ0` | `rook.ghost-diagonal-omni@1` | New body | 1716/1636 |
| Pawn rook | `RceF` | `rook.blue@3` | 48.96% | 1584/1636 |
| Baby Amazon | `QmN` | `queen.advancing-expanded@1` | 35.94% | 2771/2833 |

Each historical score used sixteen opening cases, both colors and three equally
weighted benchmarks, for 96 games per row. Knights, bishops and rooks purchased
two identical upgrades against two identical reference purchases. A queen
purchased one upgrade against one reference purchase. Those budgets remain
separate in the new screen.

Wazzap bishop was the most consistent earlier candidate, with opponent scores
between 48.44% and 54.69%. Pawn rook's average conceals a counter: 62.50% against
Two-step pawns, 26.56% against King-step pawns and 57.81% against grants. All
tested quiet Hopping-bishop and Advancing-queen siblings were weak. The earlier
`NsmR`, `NvW`, `BgmB`, `RgmR0` and `QmfhN` bodies scored 24.48%, 38.54%, 27.08%,
25.00% and 29.69% respectively. Those results do not belong to their changed
successors. New bodies inherit the old family's declared value anchor so added
movement does not also change the automatic search valuation. Those anchors
are not estimates of the new pieces' strength. The [acceptance review](v17-acceptance-review.md) preserves
the full earlier three-version screen.

## Level-two candidates

Each row purchases one two-point upgrade against each selected two-point
reference. The seven family-workshop minor/major designs join the repriced
Bishop pawn. Most are new direct same-tier comparisons; their presence in a
playable workshop did not establish balance.

| Candidate | Movement | Design ID |
| --- | --- | --- |
| Bishop pawn | `fmWfeFifmnD` | `pawn.bishop-step-current@1` |
| Dabada knight | `NsWsD` | `knight.orange@3` |
| Long-range knight | `NA` | `knight.orange@4` |
| Tall-knight bishop | `BvN` | `bishop.orange@2` |
| Free Boar bishop | `BsR` | `bishop.orange@3` |
| Blink rook | `RmFmDmAmHmGmNmCmZ` | `rook.orange@2` |
| Knight-capture rook | `RcN` | `rook.orange@3` |
| Box queen | `QmHmCmZmG` | `queen.orange@2` |

Bishop pawn previously scored **24.48%** against pairs of level-one references
at its two-point price. That is an earlier warning rather than evidence from
the new level-two opponent basket. The original full-forward Knight pawn is
superseded; the older two-point King pawn and weak Returning pawn remain in
historical workshops. They are not additional references or automatic trials.

The [earlier pawn/grant screen](../experiments/balance/results/v17-level2-001.report.md)
also retains Full Knight pawn and stronger grants. Those bodies are not added
to this campaign: the current Full Knight pawn scored 65.10%, while `W2` and
`W3` grants scored 72.40% and 68.75% at two points. Their results cannot be
silently repriced or merged with the selected references.

## Nightrider and Wraith trials

These level-three trials face Vanguard, Unicorn, Crusader and Amazon. The
original `N0` Nightrider and `QgB0` Wraith serve as fresh controls.

| Nightrider | Added ability |
| --- | --- |
| `N0mF` | One-square diagonal moves without capturing |
| `N0mW` | One-square orthogonal moves without capturing |
| `N0mK` | Both quiet step types |

All three supported Wraith alternatives retain normal queen moves and captures,
and add unlimited quiet queen-line hops across one occupied hurdle:

| Trial | Exact movement | Additional hopper captures |
| --- | --- | --- |
| Long sideways | `QgmQ0gcBgcsR0` | Immediately beyond a diagonal hurdle; any clear distance beyond a sideways hurdle |
| Short through | `QgmQ0gcsQ` | Immediately beyond a diagonal or sideways hurdle |
| Full diagonal | `QgsQ0gmvR0` | Any clear distance beyond a diagonal or sideways hurdle |

None gains vertical hopper captures. A second occupied square stops a quiet
hop; a friendly landing blocker cannot be captured or crossed. Native/browser
fixtures cover both colors, blockers, landing distance, capture restrictions
and check attacks. Exhaustive rules traversal finds no forced starting mate in
two for any trial. All still allow `1.Qh5+ g6`, but `2.Qe5` is no longer
check. The full `QgQ0` remains excluded.

The reported direction bug is reproducible: compound `QgbR` / `QgfR` grants
vertical hops and attacks in both directions, even though isolated `gbR` /
`gfR` movement respects its restriction. These symmetric diagonal/sideways
trials avoid that restriction rather than depending on the broken behavior.

The new full-diagonal body has immutable ID `queen.wraith-full-diagonal@1`.
Its proof includes unlimited quiet hopping in all eight directions and
unlimited hopping captures on four diagonal and two horizontal rays, with
vertical hopping captures absent. Native and browser engines agree across the
912 tested positions covering all three Wraith revisions.

## Run and extend

Level-one and level-two screens use **40,000 nodes per move**. This asks whether
the stronger search changes the earlier 20k screening conclusions. Old 20k
games remain historical evidence and are not merged into the new totals.
The opening contexts also differ, so a historical-to-new score change cannot
be attributed solely to the node budget; that would require a matched 20k arm.
The mobility trials keep **40k and 80k** results separate. Each engine uses one
thread, 32 MiB hash and the declared fixed MG/EG values; search priors are not
purchase costs or outcome-fitted material estimates. Paired colors, the same
opening cases and per-opponent percentages remain visible.

The first eight cases schedule **432 level-one games, 384 level-two games and
1,024 mobility games**: 1,840 total. Mobility contains eight bodies: the two
controls, three quiet-step Nightriders and three Wraith revisions. Sixteen cases
double those counts; sixty-four schedule 14,720 games in total. These are three
independent studies, not an automatic queue. There is no 2,000-game limit.

The casebook is reused from the fixed 64-case panel. Its prefixes can develop
a purchased L1 knight or a pawn reference using ordinary moves. They are legal,
matched starting conditions; they are not new independent openings or a promise
that purchased pieces remain on their home squares. Future eight-case batches
are frozen before the first game, and every position is checked before play.

L1 bodies retain the historical family MG/EG anchors listed above, including
new movement revisions; reference values remain fixed. The seven newly calibrated
L2 minor/major bodies use their native automatic values, except Blink rook uses
Knight-capture rook's **1904/1959** rather than its inflated automatic
**3146/3944**. All Nightrider bodies share **2326/2211**; all Wraith bodies share
**3772/3470**. These predeclared search priors apply to all six tables and both
colors. The [new value receipt](../experiments/designs/v18-screen-values.json)
preserves automatic readings as well as the override; the new L1 revisions
inherit their historical bracket anchors without rewriting that receipt.
Results remain conditional on those priors; a repeated anomaly merits valuation
review before redesign.

Begin with eight opening cases. Each study can extend its total to sixteen,
thirty-two or sixty-four using its existing folder; completed games remain
saved and only missing opening cases are scheduled. A larger requested total
does not mean that many additional cases. Run one study at a time, with four
workers total:

```powershell
git pull --ff-only
npm.cmd run balance:v18 -- --study level1 --out balance-results/v18-level1 --openings 8 --jobs 4
npm.cmd run balance:v18 -- --study level2 --out balance-results/v18-level2 --openings 8 --jobs 4
npm.cmd run balance:v18 -- --study mobility --out balance-results/v18-mobility --openings 8 --jobs 4
```

For example, extend the level-one study to sixteen total cases, or refresh its
report without playing:

```powershell
npm.cmd run balance:v18 -- --study level1 --resume balance-results/v18-level1 --openings 16
npm.cmd run balance:v18 -- --study level1 --report balance-results/v18-level1
```

The same forms apply to the other two folders. Do not put a changed design,
price or value policy into an existing run. Grants stay finite and nonroyal;
deployment spends a turn, cannot give check and stays in the owner's half.
Ordinary royal kings, castling and standard Q/R/B/N promotions remain.
If an output folder was already created with an earlier declaration, choose a
new folder for the revised screen; resume preserves the original declaration.

The current report is `screen-report.md` (and JSON) in the selected output
folder. Journals remain under each `batch-XX-nNNNNN` stage; keep the complete
folder, including `runtime`, for resume and later analysis. Reports update at
stage boundaries and save first-8/16/32/64 snapshots under `reports/openings-N`,
including when a larger target was requested from the beginning. They show
overall percentages, per-reference W/D/L and scores, White/Black scores,
fixed-eight-case cohorts, shared coverage and conditional opening-block ranges.
JSON retains stage run IDs and journal/native-preflight receipts. A partial
screen is marked explicitly. No partial result is an automatic acceptance.

`q` / Ctrl+C stops now; `g` finishes active games; `p` finishes active color
pairs and pauses the whole study. Add `--log plies` for individual moves;
game starts/results are the default. `--check` performs native/rule/value
preflight without games; `--check --rules-only` skips native proof.

Use 40%–60% as a descriptive screening band, not a precise acceptance test.
Review shared opening coverage, both colors, repeated opponent differences and
the earlier evidence before changing a design. In particular, one overall
average can hide a counter or a partner effect. This preparation starts no
scored cloud games and changes no existing playable roster.
