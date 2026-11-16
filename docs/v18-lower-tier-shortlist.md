# Version 18 lower-tier shortlist

The current screens support a useful roster at both levels, with queens still
the main gap. The scores below count draws as half a point against the fixed
same-tier references at 40k nodes and sixteen opening cases. They are separate
studies with different cases, not a ranking from one round robin.

## Level one

Keep the three fixed references: Two-step pawn `fmW2fceF2`, King-step pawn
`mWFifmnD`, and Pawn grant `fWmfF`.

| Candidate | Movement | Screen score | Assessment |
| --- | --- | ---: | --- |
| Wazzap knight | `NW` | 51.56% | Good average; 37.50% against King-step pawns |
| Positional knight | `NmQ` | 46.35% | Promising revision; King-step-pawn matchup is 32.81% |
| Wazzap bishop | `BsW` | 50.00% | Simple, close-fitting choice |
| Hopping bishop | `BgB0` | 48.44% | Promising revision; 39.06% against King-step pawns |
| Ghost rook: quiet diagonal hops | `RmBgmQ0` | 50.00% | Preferred Ghost-rook candidate |
| Pawn rook | `RceF` | 49.44% | Promising; overall uses 15/16 complete shared cases |

The simpler Ghost rook `RmBgmR0` remains an alternative at 45.31%. The expanded
Climbing knight `NvWvD` is high at 61.98%. The queen slot remains exploratory:
Baby Amazon `QmN` scored 34.38% in the initial screen and 31.25% as a fresh
control; Blink queen reached 39.06%, with only 23.44% against King-step pawns.
Neither is a balanced queen selection yet.

Knights, bishops and rooks were tested as two identical one-point upgrades
against two reference purchases. Queen tests used one purchase per side. Mixed
armies can reveal partner effects that these tests do not identify.

## Level two

Keep the fixed Quiet-tall Knight pawn `ifmnDfmWfceFfsNfmN`, Rank pawn
`ifmnDmfWfceFsR`, and Bishop grant `F`.

| Candidate | Movement | Screen score | Assessment |
| --- | --- | ---: | --- |
| Nightrider | `N0` | 54.69% | Selected knight; all three matchups are 51.56%–57.81% |
| Bishop pawn: clear diagonal range | `fmWifmnDfceF2bF2` | 45.31% | Preferred revision; all matchups are 40.63%–48.44% |
| Tall-knight bishop | `BvN` | 51.56% | Strong candidate with relatively even matchups |
| Blink rook | `RmFmDmAmHmGmNmCmZ` | 51.04% | Good average; 39.06% against Rank pawn |
| Knight-capture rook | `RcN` | 55.21% | Promising; slightly high against Bishop grant at 60.94% |

The jumping Bishop pawn `fmWifmnDfceFfceAbFbA` is an alternative at 42.71%.
Its small deficit to the clear-range version does not prove lower intrinsic
strength. Free Boar `BsR` remains an interesting counter choice at 59.38%, but
its 82.81% Rank-pawn matchup needs attention. Box queen `QmHmCmZmG` is weak at
26.04%, leaving this tier's queen slot unresolved too.

The latest knight screen makes N0 the better selection than NFA: the fresh NFA
control scored 69.79%, while NH was weak and NDH strong. Preserve the earlier
NFA results as a separate context. Historical level-three N0 also used different
search values and opponents; it is not pooled into the two-point result.

## Next roster step

Use these bodies for human playtesting and the planned mixed-budget study.
Prioritize readable threats and counterplay, especially the King-step-pawn
matchups at level one. Further tests should address a specific unresolved
choice; there is no need to rerun the entire candidate roster automatically.
New playable profiles can integrate selected changes while preserving the
historical profiles, original references and completed experiments.

The [initial screen](../experiments/balance/results/v18-screens-001.report.md),
[targeted follow-ups](v18-followup-review.md), and
[Nightrider review](v18-knight-review.md) retain the underlying evidence and
conditional ranges. Scores are not material-value or individual-piece Elo
estimates. These shortlist entries do not themselves replace playable profiles
or freeze additional references.
