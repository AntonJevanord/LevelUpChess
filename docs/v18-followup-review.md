# Version 18 lower-tier follow-up review

Both sixteen-case studies finished: **1,632 completed games in 816 scored
color pairs**, without errors, retries, cancellations or move-limit truncation.
The [archived outcome review](../experiments/balance/results/v18-followups-001.report.md)
and its verifier retain the exact uploads and numerical comparisons. No new
engine games or material estimates are produced by this review.

## Level one

Every row has 96 scored games against the three fixed L1 references. Knights
and bishops use two purchases per side; queens use one. Do not pool those
purchase budgets into a roster-wide strength estimate. Scores count draws as
half a point.

| Revision | Score | Fresh control | Gain (percentage points) | First / second eight cases | Recommendation |
| --- | ---: | ---: | ---: | ---: | --- |
| `NmQ` | 46.35% | `NmR`: 31.77% | +14.58 | 50.00% / 42.71% | Shortlist for playtesting |
| `NmK` | 18.75% | `NmR`: 31.77% | -13.02 | 17.71% / 19.79% | Park |
| `BgBgmB0` | 34.38% | `BgB`: 30.21% | +4.17 | 31.25% / 37.50% | Park |
| `BgB0` | 48.44% | `BgB`: 30.21% | +18.23 | 46.88% / 50.00% | Shortlist for playtesting |
| Blink queen | 39.06% | `QmN`: 31.25% | +7.81 | 38.54% / 39.58% | Borderline weak; keep exploratory |

`NmQ` and `BgB0` improve over their matched controls with conditional
opening-block gain ranges above zero: **4.69–24.48** and **6.25–30.22**
percentage points. Both remain weaker against King-step pawns: **32.81%** and
**39.06%** respectively. Test whether those counters are understandable and
enjoyable before freezing a roster choice.

`NmK` replaces long quiet rook paths with short quiet king steps, so it is not
a strict mobility addition to `NmR`. Its weaker result does not violate movement
inclusion. Long quiet bishop hops alone have not closed the gap; allowing long
capturing hops is the promising version.

Blink queen's matched gain range includes zero (**-2.60–18.75 pp**). Its
**23.44%** King-step-pawn matchup is a concern, while its Two-step-pawn score is
53.13%. Repeatedly adding more quiet jumps is not the next automatic step.
Keep the concept available for exploration, or reconsider the ability after
human playtests. Unchanged Wazzap knight, Wazzap bishop, Ghost rook and Pawn
rook results remain in the [original review](../experiments/balance/results/v18-screens-001.report.md).

## Level two

Each body is a single two-point purchase against each of the three unchanged
L2 references. All rows have 96 scored games.

| Revision | Score | Knight pawn | Rank pawn | Bishop grant | First / second eight cases | Recommendation |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `NWD` | 66.15% | 60.94% | 56.25% | 81.25% | 68.75% / 63.54% | Likely high; strong grant counter |
| `NWH` | 77.08% | 81.25% | 75.00% | 75.00% | 79.17% / 75.00% | Park at L2; possible higher-tier idea |
| `NFA` | 61.46% | 68.75% | 53.13% | 62.50% | 64.58% / 58.33% | Closest knight; playtest before nerfing |
| `NAD` | 64.06% | 59.38% | 73.44% | 59.38% | 68.75% / 59.38% | High, with a Rank-pawn counter |
| Clear-range Bishop pawn | 45.31% | 48.44% | 46.88% | 40.63% | 47.92% / 42.71% | Shortlist; even observed matchups |
| Jumping Bishop pawn | 42.71% | 39.06% | 53.13% | 35.94% | 45.83% / 39.58% | Retain as an alternative |

`NWH` is the clearest overshoot: every opponent is at least 75%, Black scores
78.13%, and its conditional overall range (**67.71–86.98%**) is above the
descriptive 60% ceiling. A higher purchase price would be a new experiment and
immutable design revision, not a conclusion already tested here.

`NFA` is near the upper edge, rather than conclusively outside the target.
Its second half is 58.33%, Black scores 59.38%, and its conditional range
**54.67–68.75%** overlaps the target band. Prefer a human playtest or a later
decision-relevant mixed-army result over an immediate sequence of minor nerfs.
`NWD` and `NAD` also have uncertainty overlapping 60%; retain their pronounced
opponent differences when assessing them.

The old Bishop-pawn body remains weak at **20.83%** under the fresh common
536/592 MG/EG prior. Both revisions improve substantially under that same
policy, with gain ranges above zero. The previous 22.92% result used different
openings and the old 214/245 prior; it is not a matched valuation experiment.

The clear-path pawn's 2.60-point lead over the jumping pawn does not prove
greater intrinsic strength. The jumping movement contains the clear-path
destinations and additionally crosses diagonal blockers. Finite search,
different move choices and sampling can reverse their observed scores. Favor
the clear-path version for its simpler description and more even observed
opponent basket, while keeping the jumping design available for comparison.

## Next decision

The provisional shortlist is **`NmQ`, `BgB0`, the clear-range Bishop pawn and
`NFA`**, with the jumping pawn as an alternative. These are playtest choices,
not automatic playable-roster replacements or additional frozen references.
No new rules, prices, engine priors or experiments are introduced here.

Human playtests should assess readable capture threats, counterplay and the
value of the movement in ordinary armies. More games are justified only by a
specific unresolved selection. Completed cells and archived controls need not
be replayed whenever another body changes.

The samples use sixteen related fixed opening cases at 40k nodes. Conditional
opening-block ranges describe this protocol, not every possible opening or a
precise material value. Original execution manifests and native proof files
were not supplied; journal consistency is distinct from independent move replay
or binary attestation.
