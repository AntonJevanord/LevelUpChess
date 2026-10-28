# Version-17 mobility and capture batch

The batch is complete. The [combined thirty-two-start report](../experiments/balance/results/v17-mobility-001.report.md)
reviews the confirmation, original revisions and Support/Scout supplement.
Their 2,368 scheduled games finalized with 2,363 completions, five unscored
400-ply truncations and no errors. Do not launch the overlapping expanded run.

## Results received

The combined review reuses the [640 design-focus games](../experiments/balance/results/v17-focus-001.report.md)
and 128 compatible historical two-step-pawn reference games. It contains 3,136
distinct source records: 3,131 completed and five truncated. Previously resubmitted
level-three journals add no duplicate weight. Scores count draws as half a point;
every row buys three upgrade points.

| Purchase | Movement | Reference overall | Three two-step pawns |
| --- | --- | ---: | ---: |
| Grid bishop | `BDC` | 60.55% | 72.66% |
| Three full-diagonal pawns | `FfmWifmnD` | 38.67% | 57.03% |
| Three long-forward grants | `fW2` | 62.30% | 70.31% |
| Three pawn-like grants | `fmWfceF` | 61.33% | 78.23% |
| Three two-step pawns | `fmW2fceF2` | 50.98% | — |
| Three capture-forward grants | `cfWmfF` | 41.60% | 70.31% |
| Three mobile-forward grants | `fWmfF` | 44.92% | 60.83% |
| Three king-step pawns | `mWFifmnD` | 48.39% | 51.56% |
| Three Support pawns | `fmWfceFifmnDsW` | 28.52% | 25.00% |
| Three Scout grants | `fWbmF` | 45.31% | 48.39% |

Reference overall uses only cases with complete color pairs against all four
references. King-step pawns have 31 shared cases and 248 included reference games
because one Unicorn game truncated; the other rows have 32 cases and 256 games.
Individual matchup cells retain their other completed pairs. Baseline scores use
their own available pairs: 62 games for pawn-like and Scout grants, 60 for
mobile-forward grants and 64 for other scheduled rows. Unscored truncations and
their completed color partners are excluded; none needs replaying for this review.

Human-playtest two-step and king-step pawns before choosing the pawn roster.
The two-step reference average remained close across the old and new sixteen
cases (50.39% / 51.56%). Mobile-forward grants are the preferred grant shortlist
candidate for consistent reference matchups (41.41–48.44%); keep Scout as an
alternative with a retreat ability and a repeated Cruisader weakness (28.91%
overall). Capture-forward grants' 70.31% against the pawn baseline is a counter
flag despite their lower reference average.

Park Support and full-diagonal pawns rather than repeat unchanged tests. The
older long-forward and pawn-like grants remain strong for one point, especially
against the pawn baseline; keep them as research rather than automatically
changing prices. Grid bishop is just above the 40–60% working target at 60.55%:
retain it at level 3 and assess counterplay before changing it. These results do
not support downgrading it to level 2.

No larger experiment is needed before human playtesting the shortlist. The
[Version 17 workshops](playtest-roster-v17.md) now offer the one-point Two-step
and King-step pawns and the `fWmfF` Pawn grant. Scout remains a research option.
Older libraries, immutable research definitions and frozen references stay fixed.
The declared protocols and original launch commands below are retained for
reproducibility.

Reproduce the offline combined analysis without starting games:

```powershell
node scripts/balance/v17-mobility-review.js
```

Original run manifests and native preflight proofs were not supplied with these
journals. The audit checks recorded declaration compatibility; it does not attest
to the original executable or independently replay every move. These related
short starts provide descriptive scores, not confidence intervals, material
estimates or individual piece Elo.

## New revisions

| Three-point purchase | Immutable ID | Movement | Question |
| --- | --- | --- | --- |
| Three capture-forward grants | `king.reserve-pawn@5` | `cfWmfF` | Does one straight capture target plus quiet forward-diagonal steps work well? |
| Three mobile-forward grants | `king.reserve-pawn@6` | `fWmfF` | What changes when the same guard also gains a quiet straight-forward step? |
| Three king-step pawns | `pawn.blue@7` | `mWFifmnD` | Do quiet orthogonal steps improve the full-diagonal-capture pawn? |
| Three Support pawns | `pawn.blue@8` | `fmWfceFifmnDsW` | Do sideways movement and captures help ordinary pawn chains? |
| Three Scout grants | `king.reserve-pawn@7` | `fWbmF` | Can quiet backward-diagonal retreats make a single forward capture target useful? |

Capture-forward and mobile-forward grants capture only one square straight forward and move quietly
one square diagonally forward. The second also moves quietly straight forward;
their capture geometry is identical. These are three finite nonroyal reserves, with the existing own-half,
empty-square, nonchecking drop rules. Captures never refill reserves. Guards
do not promote or capture en passant; a quiet diagonal visit leaves any
bypassed pawn in place.

The king-step pawn moves quietly like a king and captures only on the four adjacent
diagonals. Its clear forward double step is available from its home two ranks,
including after returning there. Promotion remains ordinary QRBN; its empty
en-passant target visit follows the existing quiet-diagonal convention.
This revisits the old level-2 King pawn's movement at a **one-point trial price**;
the old `pawn.orange@4` identity and price remain unchanged.

Support pawns move quietly forward or one square sideways, capture one square
sideways or diagonally forward, and retain the clear home-region forward double.
They promote to ordinary QRBN. Ordinary diagonal en-passant captures remove the
bypassed pawn; a quiet sideways visit to the target does not. Scout grants
move/capture one square forward and retreat quietly one square diagonally
backward. Their retreats cannot capture. They keep all finite reserve rules
and never promote.

## Declared revision paths

| Experiment | New games | Contents |
| --- | ---: | --- |
| `mobility-confirm` | 768 | Four existing design-focus purchases versus five opponents on sixteen new starts (640), plus two-step-pawn baseline versus references on those starts (128) |
| `mobility-expanded` | 1,600 | All five revised purchases versus five opponents on all thirty-two old/new starts |
| `mobility-additions` | 640 | Support pawns and Scout grants only, supplementing an original `mobility-revisions` run |

The expanded batch costs **2,368 new games**: confirmation (768) plus expanded
revisions (1,600). The previous three-candidate `mobility-revisions` declaration
remains 960 games. If that run has started, finish it and add only the 640 new
games: 768 + 960 + 640 gives the same total. **Choose expanded or original plus
additions; running both paths duplicates games.**

The four existing purchases are Grid bishop,
three full-diagonal pawns, three long-forward grants and three pawn-like grants.
No old opening cell is replayed for an unchanged purchase. Their completed
640 games and the baseline's completed 128 reference games supply the old cohort
in the combined analysis. Changed definitions receive fresh games.

All armies spend three upgrade points. Five opponents means Vanguard, Unicorn,
Cruisader, Amazon and **three** level-1 two-step pawns on c2/d2/e2, mirrored for
Black. New pawn bundles use those same files. Baseline self games are absent;
the baseline row in the confirmation matrix contains only its four reference
comparisons. There is no candidate round robin.

Settings stay at 20,000 nodes per move, one thread, 32 MiB hash, Skill 20,
400-ply cap, seed 20261028 and one color-swapped pair per starting case.
The sixteen new cases are distinct two-ply prefixes: `e4 c6`, `d4 e6`, `c4 Nf6`,
`Nf3 c5`, `g3 e5`, `b3 d5`, `e4 Nf6`, `d4 c6`, `c4 e6`, `Nf3 e6`, `b3 Nf6`,
`g3 Nf6`, `e4 g6`, `d4 g6`, `c4 g6` and `Nf3 g6`. Keeping prefixes at two plies
holds the forced reserve-deployment delay to one ordinary turn per side. These
related short starts expand coverage; they are not independent deep openings.

## How to judge the results

Reference-panel averages are a first screen, not a complete ranking. Repeated
direct purchase differences can expose counters, army interactions or gaps in
the benchmark basket. Similar reference averages do not require every equal-cost
pair to reach 50%. Compare opening cohorts and physical colors before attributing
a difference to movement alone. The finite engine search and setup context remain
part of the measured outcome.

Overall score continues to include only the four references. The two-step
comparison has its own column. Review the 40–60% panel target alongside
35–65% matchup flags, repetition on the new cohort and human counterplay.
These are design criteria, not confidence intervals or material values.

## Original Windows commands

The original confirmation, revisions and additions runs are complete. These
commands document the alternative launch paths; running expanded now would
duplicate games. Use the offline review command above for the combined results.

Finish any active campaign before pulling the update. Its catalog and rules
bundle are fingerprinted: an interrupted `v0.17.4` run must resume using that
original checkout, not the updated one. No saved run is rewritten or migrated.

For a fresh revision run, launch these campaigns sequentially in new folders:

```powershell
git switch version_17
git pull --ff-only
npm.cmd run balance:v17 -- --experiment mobility-confirm --out balance-results/v17-mobility-confirm --jobs 4
npm.cmd run balance:v17 -- --experiment mobility-expanded --out balance-results/v17-mobility-expanded --jobs 4
```

If the original 960-game revision run has already started, finish it on its
original checkout. Then update and run the supplement instead of expanded:

```powershell
npm.cmd run balance:v17 -- --experiment mobility-additions --out balance-results/v17-mobility-additions --jobs 4
```

Every launch performs native preflight. Substitute `--check` for the output/job
options to validate without playing. Resume the corresponding campaign with
`--resume DIRECTORY`, or refresh its report offline with `--report DIRECTORY`.
The confirmation report covers the new sixteen cases; the revision report
covers all thirty-two. Preserve both new folders and prior evidence for the
combined unchanged-design analysis.

Controls remain q / Ctrl+C to stop now, g after active games, p after active
color pairs. Only the selected campaign runs. No playable options, reference
definitions, old prices or historical outcomes change in this preparation.

The bishop and rook ideas remain in the [separate shortlist](design-ideas.md),
outside this declared game budget.
