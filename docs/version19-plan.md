# Version 19: panels, then cross-level armies

Version 19 is underway; the [release guide](version19.md) records the playable
tier libraries and concrete panel commands. Pre-panel screening is complete.
The final choices from the
[targeted alternatives](v18-prepanel32-review.md) are:

| Tier | Selected movement | Role |
| --- | --- | --- |
| L3 | `NAD` | Second knight alongside the fixed Unicorn `NC` |
| L2 | `NDmW` | Second knight alongside Nightrider `N0`; replaces the earlier NDmK shortlist choice |
| L2 | `QcC` | Second queen alongside `QsN` |
| L2 | `BsR` | Retained Free Boar bishop alongside `BvN` |

The remaining shortlisted bodies carry forward. No further pre-panel campaign
is required; QfcCscC and BsW3 remain optional alternatives. Version 18 retains
the experiment definitions, raw journals and current playable profiles.
The accepted roster is integrated into three tier profiles with preserved
historical identities. The first version-19 declarations and shared opening
book are frozen for the initial sixteen-opening review.

Revision 002 removes the third L2 Bishop pawn and replaces Wraith with the
tested `QgmQ0gcBgcsR0` body. New panels use eleven designs per tier; owned
v0.19.0 runs retain their original declarations. The
[focused pawn/queen trials](v19-pawn-queen-trials.md) test possible queen/pawn
replacements separately. The frozen L2 Knight pawn and L3 Herald remain in
the panels until those results support an explicit new revision.

The selected queen/pawn trials now support explicit **revision 004**:
QfsN replaces the second L1 queen, fQ2 is an additional L2 pawn, and the
six-jump pawn joins Herald/Ranger at L3. New panels use 11, 12 and 12 bodies;
old owned runs retain their original declaration. The playable current-tier
libraries and fresh panel plans now contain the same selected bodies.

## Same-tier panels

Prepare separate L1, L2 and L3 round robins using accepted movement revisions,
fixed search priors, ordinary royal kings and the existing finite grant rules.
Keep the original references for comparison. One grant choice per tier is
enough. Include the selected revised Cataphract rather than silently restoring
the original RC body, and identify Wraith's intentionally weaker role.

Use **one purchase per side for every family**, including L1 queens. Earlier
L1 paired-minor/rook screens and single-queen screens are different budgets;
their percentages do not form one uniform panel ranking. Fix starting homes,
grant counts, engine settings and the opening book before the first game.

Run the [opening diagnostic](opening-diagnostics.md) on candidate prefixes and
recorded games to inspect forced captures, surviving upgrades, pins, exposure
and optional pre/post engine evaluations. Freeze one shared diverse book;
avoid matchup-specific near-zero evaluation selection, which conditions away
some of the strength being measured. More games do not remove that bias.

Use **40k nodes only**, one engine thread and four workers. Keep each
physical-color pair and opening ID together. The current panels do not include
other node-budget arms.

1. Run the first **16 openings**, retaining first-eight and first-sixteen reports.
2. Review averages, direct matchups, White/Black scores, shared coverage,
   conditional ranges, and human readability/counterplay.
3. Extend an unchanged panel to **32 total openings** with its original identity.
4. Extend to **64 total openings** only when that extra precision could change
   a decision. Keep the frozen first-sixteen and first-thirty-two summaries.

Report the fixed-reference basket separately from the whole-roster average.
Removing or revising a candidate changes the latter opponent basket; it should
not rewrite an unchanged direct matchup or its retained reference comparison.

The [offline material command](v19-material-estimates.md) can reuse a finished
panel's actual journals, without more engine games. It fits conditional
board-piece values with assumed pawn=1 / queen=9 and reports support problems.
Whole grant-involved cells are excluded; their strength stays in the outcome
panel. Cross-level and mixed-army tests still matter for transfer between tiers
and interactions between upgrades.

No automatic extension beyond the requested review point is needed. If a piece,
prior or placement changes, preserve the old data and declare the new revision.
Reuse unchanged games only when both army definitions, engine/search policy,
opening, color pairing and archived rule meanings match. A changed letter map
or registry needs explicit compatibility proof rather than trusting raw letters.

The selected L1 tier has eleven bodies; L2 and L3 each have twelve. The three
panels schedule **1,760 / 2,112 / 2,112 games at sixteen openings**, twice that
at 32 and four times at 64. For N bodies and
O openings, paired-color round-robin games are **N × (N − 1) × O**. Declare
the final roster and total before starting rather than imposing a 2,000-game cap.

## Across levels

The [compact launch proposal](first-release-roster.md) is the provisional
selection target: fifteen board designs across levels 1–3 and three grants
selected after release costs 1–6 are settled. The grant trio need not cost
1/2/3. A [new deployment policy](grant-deployment-options.md) is a separately
tested context; existing grant references retain their own drop rules.
Use the cross-level results to review that subset and its named watch items;
keep the full research roster and original reference baskets independently.
Public names are presentation aliases, not new evidence identities.

After the per-tier decisions, freeze a combined roster and ask two distinct
questions: how much stronger are unequal-cost single upgrades, and how well do
equal purchase budgets compete when distributed across different tiers?

Use explicit bridge matches and fixed mixed armies, including six-point budgets
such as three L2 purchases versus two L3 purchases. Six L1 purchases versus
three L2 purchases require combinations that fit the actual starting homes;
six copies of a queen upgrade cannot be installed in the ordinary starting army.
Keep reserve grants, promotions, placements and royal rules explicit.

A mixed panel must report army and partner effects, not just assign an Elo to
each piece from a team result. Ordinary-army anchors or unequal-budget bridges
are needed to identify tier relationships. Equal-budget games alone leave a
cost-related ambiguity. Material regression remains a separate diagnostic,
especially for reserve pieces.

A whole multi-tier roster can exceed the engine's twenty custom-type limit.
Allocate letters per compatible match/group and archive semantic IDs, movement,
values and mappings. Respect the limit in every compiled group while keeping
results comparable through immutable definitions. Do not require one global
letter map for every candidate across all tiers.

Prepare and validate the concrete cross-level declaration only after the tier
panels identify which pieces are being compared. None of these later panels
starts automatically from the current alternatives commands.
