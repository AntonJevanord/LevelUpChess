# Version 19: panels, then cross-level armies

Version 19 will begin after reviewing the [targeted alternatives](v18-prepanel-alternatives.md).
Version 18 retains the experiment definitions, raw journals and current
playable profiles. Decide the roster before creating version-19 declarations;
unresolved alternatives do not all become permanent roster slots.

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

Start at 40k nodes, one engine thread and four workers. Keep each physical-color
pair and opening ID together. Add stronger-search checks only for a specific
unresolved effect; node-budget arms remain separate datasets.

1. Run the first **16 openings**, retaining first-eight and first-sixteen reports.
2. Review averages, direct matchups, White/Black scores, shared coverage,
   conditional ranges, and human readability/counterplay.
3. Extend an unchanged panel to **32 total openings** with its original identity.
4. Extend to **64 total openings** only when that extra precision could change
   a decision. Keep the frozen first-sixteen and first-thirty-two summaries.

Report the fixed-reference basket separately from the whole-roster average.
Removing or revising a candidate changes the latter opponent basket; it should
not rewrite an unchanged direct matchup or its retained reference comparison.

No automatic extension beyond the requested review point is needed. If a piece,
prior or placement changes, preserve the old data and declare the new revision.
Reuse unchanged games only when both army definitions, engine/search policy,
opening, color pairing and archived rule meanings match. A changed letter map
or registry needs explicit compatibility proof rather than trusting raw letters.

With two ordinary upgrades per family and one grant, a tier has eleven bodies.
A full panel then schedules **1,760 games at sixteen openings**, 3,520 at 32
and 7,040 at 64. Accepted extra bodies increase that count: for N bodies and
O openings, paired-color round-robin games are **N × (N − 1) × O**. Declare
the final roster and total before starting rather than imposing a 2,000-game cap.

## Across levels

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
