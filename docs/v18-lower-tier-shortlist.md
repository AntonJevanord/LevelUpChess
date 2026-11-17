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
| Forward-tall queen | `QfN` | 44.79% | Preferred L1 queen; all matchups 42.19%–48.44% |

The simpler Ghost rook `RmBgmR0` remains an alternative at 45.31%. The expanded
Climbing knight `NvWvD` is high at 61.98%. Earlier quiet queen trials were weak:
Baby Amazon `QmN` scored 34.38% in the initial screen and 31.25% as a fresh
control; Blink queen reached 39.06%, with only 23.44% against King-step pawns.
The newer capture trials give QfN the preferred slot. QfhN is a stronger
alternative at 59.38%, not an independent specialization: it contains every
QfN move plus two more. QcC scored high at 64.58%; keep it for a possible later
two-point test rather than assuming that price has already been established.

Knights, bishops and rooks were tested as two identical one-point upgrades
against two reference purchases. Queen tests used one purchase per side. Mixed
armies can reveal partner effects that these tests do not identify.

## Level two

Keep the fixed Quiet-tall Knight pawn `ifmnDfmWfceFfsNfmN`, Rank pawn
`ifmnDmfWfceFsR`, and Bishop grant `F`.

| Candidate | Movement | Screen score | Assessment |
| --- | --- | ---: | --- |
| Nightrider | `N0` | 54.69%; fresh 51.11% | Selected knight; new overall uses 15/16 shared cases |
| Quiet-step Dabbaba knight | `NDmK` | 56.77% | Preferred second knight; steady halves; grant matchup 64.06% |
| Bishop pawn: clear diagonal range | `fmWifmnDfceF2bF2` | 45.31% | Preferred revision; all matchups are 40.63%–48.44% |
| Tall-knight bishop | `BvN` | 51.56% | Strong candidate with relatively even matchups |
| Blink rook | `RmFmDmAmHmGmNmCmZ` | 51.04% | Good average; 39.06% against Rank pawn |
| Knight-capture rook | `RcN` | 55.21% | Promising; slightly high against Bishop grant at 60.94% |
| Free Boar bishop | `BsR` | 65.56% | Retained; new favorable matchups span 61.67%–71.88% |
| Wide-knight queen | `QsN` | 47.40% | Preferred L2 queen; all matchups 40.63%–56.25% |

The jumping Bishop pawn `fmWifmnDfceFfceAbFbA` is an alternative at 42.71%.
Its small deficit to the clear-range version does not prove lower intrinsic
strength. Free Boar's new 65.56% score uses fifteen shared cases, and remains
separate from its earlier 59.38%. Its Rank-pawn score fell from 82.81% to
71.88%, while the other matchups became favorable too. Keep it for mixed-army
review without automatically changing its movement. Box queen remains weak
at 34.38% in the fresh control, as does QvN at 38.54%. A second distinct L2
queen remains unresolved.

The latest knight screen makes N0 the better selection than NFA: the fresh NFA
control scored 69.79%, while NH was weak and NDH strong. Preserve the earlier
NFA results as a separate context. Historical level-three N0 also used different
search values and opponents; it is not pooled into the two-point result.

## Next roster step

The [completed roster review](v18-completion-review.md) selects QfN, QsN and
NDmK for playtesting, with QfhN as an upper-end alternative. NDmW/NDmF remain
conditional future ideas, not the next automatic experiment. Grants need only
one option per tier.

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
