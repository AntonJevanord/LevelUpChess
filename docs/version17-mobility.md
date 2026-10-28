# Version-17 mobility and capture batch

Support pawn and Scout guard are now included as one-point trials. Use the
expanded revision campaign for a fresh run, or the additions-only campaign
after finishing an already-started original revision run. Both paths preserve
the earlier declarations and produce the same intended matchup coverage.

The [completed design-focus screen](../experiments/balance/results/v17-focus-001.report.md)
contains 640 scored games. Grid bishop `BDC` scored 58.59% across references,
with individual reference scores of 48.44–64.06%. Keep its level-3 definition
for confirmation. Removing Camel and trying `BD` at level 2 remains a later
design question, rather than a necessary correction established by this screen.

## Results received

The [Support/Scout supplement](../experiments/balance/results/v17-mobility-additions-001.report.md)
has finished: 639 completed games, one unscored 400-ply truncation and no errors.
All four-reference matchups have complete color pairs. Scores count draws as
half a point; every purchase costs three upgrade points.

| Purchase | Reference overall | Three two-step pawns | References: original / new sixteen |
| --- | ---: | ---: | ---: |
| Three Support pawns | 28.52% | 25.00% | 24.22% / 32.81% |
| Three Scout grants | 45.31% | 48.39% | 46.48% / 44.14% |

Park Support rather than repeat its unchanged tests or immediately create another
buff. It underperforms against every reference and the direct pawn baseline in
both cohorts. Scout is worth human playtesting at its current one-point price.
Its Cruisader score is 28.91% (25.00% / 32.81% by cohort), so keep that specific
weakness visible rather than buffing all its other matchups automatically.

The truncation belongs to Scout versus two-step pawns. Its completed color partner
is also excluded from the paired baseline score, leaving 62 scored baseline games;
reference averages are unaffected. Neither game needs replaying for this decision.

Two other uploaded journals and their reports exactly duplicate the archived
`level3-confirm` (576) and `level3-revisions` (640) follow-ups. They add no games.
They are **not** `mobility-confirm` or `mobility-revisions`; results for those
campaigns have not been supplied. Check the existing local folders before
launching anything. Since the supplement is complete, use only the original
960-game revision campaign for the other three candidates if it has not run;
the expanded campaign would duplicate Support/Scout evidence.

The declarations and alternative commands below remain available for reference.
There is no new campaign, movement change or playable-roster change in this review.

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
this isolates the effect of extra quiet mobility. Their capture geometry is
identical. These are three finite nonroyal reserves, with the existing own-half,
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

## Choose one revision path

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
640 games and the baseline's completed 128 reference games remain archived for
later thirty-two-case comparisons. Changed definitions receive fresh games.

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

Reference-panel averages are a first screen, not a complete ranking. In the
last run, long-forward grants scored 55.86% across references and 71.88% against
three two-step pawns; that baseline score was 71.88% in each opening cohort.
Treat a repeated direct matchup seriously even when both purchases have similar
reference averages. It can expose a counter, an army interaction, or a gap in
the benchmark basket. It does not require every pair to reach 50%.

The full-diagonal pawn's baseline result instead reversed from 65.63% to
31.25%, making replication particularly useful. Compare cohort and color
effects before declaring that a specific piece is weak to all level-1 armies.
Unicorn is relatively vulnerable to some of these purchases; pawn-like grants
show a different opponent pattern.

Overall score continues to include only the four references. The two-step
comparison has its own column. Review the 40–60% panel target alongside
35–65% matchup flags, repetition on the new cohort and human counterplay.
These are design criteria, not confidence intervals or material values.

## Run on Windows

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
