# Mixed purchases and level-three grant trials

This new **1,824-game** study tests every combination of the three selected
level-one purchases and three selected level-two purchases against Vanguard,
Unicorn, Cruisader and Amazon. All armies spend three upgrade points. The
completed screens retain their original rules and outcomes; no old games are
replayed or appended.

| Panel | Physical package layouts | Comparisons | Games |
| --- | ---: | ---: | ---: |
| Nine logical level-one + level-two packages | 17 | 68 | 1,632 |
| W2 and WD grant trials | 2 | 8 | 192 |
| Total | 19 | 76 | 1,824 |

Each comparison uses twelve fresh four-ply orthodox openings and both colors.
The first six and second six cases remain separate. The first two plies may
match earlier books; complete four-ply prefixes and canonical standard-chess
positions are checked for duplicate or historical starts. No forced capture
removes a purchased piece. Reserve deployment starts after the four forced plies.

## Packages and placement

The level-one choices are Two-step pawn, King-step pawn and Pawn grant. The
level-two choices are Forward Knight pawn, Rank pawn and Diagonal grant. Their
existing immutable IDs, movements, prices and applied search values are retained.

For two-pawn packages, one layout places the level-one pawn on c2 and the
level-two pawn on e2; the second swaps them. A single pawn partnered with a grant
is tested on c2 and e2. Black uses the vertically reflected home squares. Both
layouts play the same opening and opposite colors, so placement is measured
within each opening case rather than confounded with a different opening half.

Pawn grant plus Diagonal grant has no starting pawn to reposition. It receives
one layout, not two copies of an identical start. This package has 96 scheduled
games; the other eight have 192 each. The report preserves those counts instead
of pretending the grant-only package has extra independent evidence.

One frozen level-three upgrade starts on its usual home square: Vanguard a1,
Unicorn b1, Cruisader c1 or Amazon d1. Ordinary royal kings and all other starting
pieces remain. Reserve grants are finite, nonroyal and capturable. Deploying one
spends a turn, uses an empty square in the owner's half and cannot give check.
Captures never refill reserves; grants cannot promote. Pawns retain their
declared en-passant behavior and ordinary Q/R/B/N promotion.

## Questions and scores

The nine-by-four matchup table answers which mixed packages perform well against
each frozen reference. A three-by-three partner table summarizes the same teams
by level-one and level-two choice. Conditional partner means give each logical
team equal weight, including the smaller grant-only team. The grant trials have
their own table and do not enter partner means.

Scores count draws as half a point. The calculation averages complete
color-swapped pairs, then required placement layouts, opening cases and the four
equally weighted references. An overall row uses only opening cases completed
for every required layout and opponent. Partner means likewise require common
cases across the included partner teams. Faster workers, duplicate records,
unpaired results and truncations cannot add weight. Placement tables, fixed
halves and physical White/Black results remain visible.

This can show whether Rank pawn improves with a particular partner or starting
file, and whether Forward Knight pawn remains strong across partners. It does
not isolate a pure coordination effect: mixed opponents, purchase counts,
starting placements and the earlier six-point bridge are different contexts.
Do not pool the old two-, three- and six-point results into one material or Elo
estimate.

## Grant trials and value policy

W2 is a clear-path orthogonal move or capture of one or two squares. WD has the
same destinations on an empty board, but its two-square moves jump over the
intervening square. Both are tested at cost three against the same four frozen
references. W2 retains its existing cost-three identity; WD is a new immutable
reserve definition. The historical WD knight helper spawned beside a knight and
shifted pawns, so its earlier scores are not reused as reserve-grant outcomes.

The [new value receipt](../experiments/designs/v17-mixed-values.json) records
native automatic tables separately from applied priors. Existing selected pieces
retain the original bracket values. W2 and WD share the W2 prior for a controlled
jumping comparison. These engine units are not measured material values or point
prices; no values are fitted from outcomes. The old calibration files are intact.
The stronger K grant is reserved for later cost-four study, not added here.

## Run on Windows

Finish any active experiment first. Use four workers total on the current laptop:

```powershell
Set-Location 'D:\Chess\LevelUpChess'
git pull --ff-only
npm.cmd run balance:mixed -- --out balance-results/mixed-references-v17 --jobs 4
```

Launch performs full native and rules preflight. To check without playing games,
use `--check`; `--check --rules-only` omits native proof. Select a compatible
native build with `--engine PATH` or `FAIRY_STOCKFISH_PATH`.

```powershell
npm.cmd run balance:mixed -- --resume balance-results/mixed-references-v17
npm.cmd run balance:mixed -- --report balance-results/mixed-references-v17
```

q / Ctrl+C stops now; g finishes active games; p finishes active color pairs.
The existing static scheduler, fresh per-game engines and game-boundary storage
remain. Resume keeps its original worker count and source/native identities.
The budget is 20,000 nodes per move, one search thread, 32 MiB hash, Skill 20 and
400 total plies including the forced prefix. Ordinary output lists games;
`--log plies` enables move-level progress.

The result folder contains `v17-report.md`, JSON and CSV. JSON retains original
run/native-preflight provenance and derived package summaries. CSV keeps the
76 physical comparisons separate. Reports describe these twelve fixed cases;
follow up only on repeated differences that could change a design decision.
