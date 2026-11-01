# Version 17: upgrade brackets and level-3 confirmation

These five independent experiments schedule **6,752 games**. Level-1 and level-2
designs receive reduced, current and expanded movement versions. Those names
describe abilities; they do not assume the expanded version will win more games.
The four frozen level-3 references stay unchanged.

| Experiment | Candidates and opponents | Games |
| --- | --- | ---: |
| `acceptance-minors` | Three versions of four knight/bishop designs; two identical upgrades versus two identical L1 reference purchases | 1,152 |
| `acceptance-majors` | Three versions of two rook designs, tested in pairs; three queen versions tested as single purchases | 864 |
| `reference-pawns` | Fifteen single L2 pawn upgrades versus each double L1 benchmark | 1,440 |
| `reference-grants` | Thirteen single L2 grants versus each double L1 benchmark | 1,248 |
| `level3-confirmation` | Fourteen existing L3 designs and two bishop alternatives versus all four frozen references | 2,048 |

Each comparison uses sixteen new fixed short opening cases, both colors, Skill 20,
20,000 nodes per move, one engine thread, 32 MiB hash and a 400-ply cap. The
[opening declaration](../experiments/balance/v17-bracket-openings.json) is shared
by all five stages. These prefixes do not repeat the earlier version-17 cases;
old cases are not rerun for this batch. Profiles are split to fit the engine's
twenty-custom-type limit. No scored cloud campaign is part of preparation.

## Fixed benchmarks

The L1 benchmarks are Two-step pawn (`pawn.blue@5`, `fmW2fceF2`), King-step pawn
(`pawn.blue@7`, `mWFifmnD`) and Pawn grant (`king.reserve-pawn@6`, `fWmfF`). The
double packages are **TT, KK and GG**, not mixed partnerships. A double pawn
package starts on c2/e2; a double grant package begins with two pocket pieces.
Black's army is reflected vertically.

L1 knight, bishop and rook candidates replace both ordinary pieces of their
family. Their two purchases face two reference purchases. A queen upgrade
replaces the single queen and faces one reference purchase. Queen results have
a separate one-point context; there is no pooled score mixing these budgets.
L2 pawns replace c2, and L2 grants begin in reserve. Each costs two points for
this test and faces a double L1 package.

The L3 opponents are [Vanguard `RfB`, Unicorn `NC`, Cruisader `BsR2nsN` and
Amazon `QN`](official-references.md). Each game uses one candidate upgrade
against one reference upgrade. Experimental pieces do not face one another.

## Level-1 acceptance designs

| Design | Reduced | Current | Expanded |
| --- | --- | --- | --- |
| Positional knight | `NsmR2` | `NsmR` | `NmR` |
| Climbing knight | `NfW` | `NvW` | `NvWvD` |
| Hopping bishop | `BmA` | `BgmB` | `BgmB0` |
| Wazzap bishop | `BsmW` | `BsW` | `BsW2` |
| Ghost rook | `RgmR` | `RgmR0` | `RgmQ0` |
| Pawn rook | `RfceF` | `RceF` | `RceF2` |
| Advancing queen | `QimfhN` | `QmfhN` | `QmN` |

`RceF` adds captures on all four diagonals; the reduced version restricts them
to forward diagonals. The reduced queen's extra jumps are available only from
its home two ranks. Returning home restores that ability: `i` does not mean
once per game.

The reduced Hopping bishop adds only a quiet two-square diagonal jump. Its
current version can hop over a hurdle farther along a diagonal, landing just
beyond it; the expanded version can land farther beyond that hurdle. The reduced
Ghost rook must land immediately beyond its hurdle, while the current version
can land farther beyond it. Native checks ignored direction restrictions on the
proposed `g`-hopper nerfs, so those duplicate patterns were replaced.

Returning pawn is parked. Its original three-pawn bundle scored **19.53%**
(10 wins, five draws, 49 losses) against the four L3 references across eight
cases. Bishop pawn scored **24.22%** in that same old screen. These results
come from [the archived initial screen](../experiments/balance/results/v17-screen-001.pawn-grants.report.md),
not direct matches against the selected L1 benchmarks. Bishop pawn's proposed
two-point price is a design trial, not a conclusion established by that screen.

## Level-2 reference candidates

All these designs are tested at cost two. Repricing creates a new immutable ID;
the original one-point grants and cost-three `W2` grant retain their old meanings.

| Pawn | Reduced | Current | Expanded |
| --- | --- | --- | --- |
| Bishop | `fmWfcFifmnDifmF` | `fmWfeFifmnD` | `fmW2feFifmnD` |
| Forward Knight | `fmWfceFifmnDmfhN` | `fmWfceFifmnDfhN` | `fmWfceFifmnDfhNmbW` |
| Full Knight | `fmWfceFifmnDmNcfN` | `fmWfceFifmnDN` | `fmWfceFifmnDNsmW` |
| Rank | `ifmnDmfWfceFsR2` | `ifmnDmfWfceFsR` | `ifmnDmfW2fceFsR` |
| Original Rook | `fceFmR` | `fceF2mR` | `fceF3mR` |

The expanded Forward Knight pawn keeps its existing jumps and adds a quiet
backward step. Native checks showed that replacing `fhN` with `fN` narrowed
the jump pattern, so that proposed substitution is excluded.

| Grant | Reduced | Current | Expanded |
| --- | --- | --- | --- |
| Diagonal | `fF` | `F` | `F2` |
| Long diagonal | `F` | `F2` | `F3` |
| Orthogonal | `W` | `W2` | `W3` |
| Forward | `fW` | `fW2` | `fW3` |
| Pawn-like | `fceF` | `fmWfceF` | `fmW2fceF` |

The diagonal ladders share `F` and `F2`, so thirteen distinct grants cover the
five brackets. Their complete definitions and applied values must match to
reuse the same row. The reduced Pawn-like grant has no quiet move after
deployment; it relocates only by capturing.

`W2` and `F2` need a clear intermediate square. They are short riders, not
two-square jumps. Grants remain finite, nonroyal and nonpromoting. Deployment
spends a turn, must land on an empty square in the owner's half, and cannot give
check. Captures never replenish pockets; ordinary kings retain normal safety
and castling rules. Pawn upgrades retain standard Q/R/B/N promotion.

## Level-3 confirmation

Retain Queen pawn, both revised Rook pawns, Nightrider, Princess knight, Grid
knight, Archbishop, reduced Vertical bishop, Grid bishop, Ranged rook, reduced
Side rook, Side queen, X-ray queen and Zebra queen. Add:

- **Quiet-knight Archbishop `BmN`**: knight jumps are quiet only.
- **Quiet-camel Grid bishop `BDmC`**: camel jumps are quiet only; the piece stays
  on one square color.

The capture-heavy Mating bishop is outside this campaign. Most retained designs
need confirmation on new starts rather than another automatic redesign. New
results remain a separate cohort from earlier games. Historical evidence is not
replayed merely to fill this schedule.

## Values, checks and reports

The [design definitions](../src/balance-designs-v17.js) identify movement and
purchase price. The [valuation declaration](../experiments/designs/v17-bracket-values.json)
records a common applied MG/EG policy within each bracket and the automatic
values used during calibration. These internal engine units are neither fitted
material values nor purchase points. Fixed sibling values help separate movement
changes from another automatic-valuation effect like the earlier Blink-rook case.
Results remain conditional on that policy and the engine's search budget.

Native preflight checks scheduled positions, movement agreement and applied
values before scored games. En-passant tests check both capture removal and
whether a two-square advance creates an en-passant target. The implemented rules
have these exceptions:

- Current and expanded Bishop pawns can visit an en-passant target diagonally
  without removing the bypassed pawn.
- Expanded Bishop and Rank pawns do not create an en-passant target after the
  tested clear two-square advance, so an ordinary opposing pawn cannot capture
  them en passant after that move.
- The same target-creation limitation applies to all three ranging Rook-pawn
  variants.

These behaviors are recorded in the [both-color rule fixtures](../tests-unit/v17-bracket-rules.test.js);
an `e` token or membership in `enPassantTypes` does not establish full standard
en-passant behavior. The experiment preserves these actual capabilities rather
than patching the engine or changing historical profiles. All fifteen L2 pawn
variants retain mandatory Q/R/B/N promotion. Unsupported `nC` movement is not
added. Home-rank abilities, blockers, castling and finite drops are checked too.

Reports show complete color pairs, opponent cells, shared-case overall scores,
physical colors, truncations and errors. Draws count half a point. The first
fixed eight cases, second eight and all sixteen are separate summaries; the
parallel schedule may finish them out of order. An overall 40–60% score is a
provisional design target. Repeated extreme matchups or different directions
between cohorts need review; these screens do not prove equivalence or give
precise individual-piece Elo.

Preparation checks passed on the cloud's compatible native build: all 6,752
scheduled army/color/opening cases, 7,174 distinct native starting/opening
positions, and 992 movement probes. Separate rule tests checked 1,118 native and
browser positions, including actual en-passant removal and promotion. The unit
suite run passed 1,220 checks with 38 optional checks skipped; four browser checks
passed. Another 26 launcher/controller checks passed, including native fixtures
that verify a stop on the final game. No
scored balance games were played during preparation.

## Run on Windows

For the reviewed version-0.17.8 storage update, follow the [active-campaign
upgrade guide](game-checkpoints-v17.md). For other updates, finish the active
campaign first. In a new checkout, update once and install its dependencies:

```powershell
Set-Location 'D:\Chess\LevelUpChess'
git pull --ff-only
npm.cmd ci
```

To run all five stages sequentially with **four workers total**:

```powershell
npm.cmd run balance:campaign -- --out balance-results/v17-brackets --jobs 4
```

The queue starts the next stage only after the current stage finishes. q / Ctrl+C,
g and p pause the whole queue, including a stop requested on the final game.
Its owned `campaign.json` freezes the five declarations and worker count. Resume
without repeating verified completed stages:

```powershell
npm.cmd run balance:campaign -- --resume balance-results/v17-brackets
```

Queue stages live under `balance-results/v17-brackets/EXPERIMENT`. Keep that
checkout unchanged while a campaign is active. The individual commands below
are a separate launch path; running them as well would duplicate the same games.
For individual launches, run one command at a time with **four jobs total**:

```powershell
npm.cmd run balance:v17 -- --experiment acceptance-minors --out balance-results/v17-acceptance-minors --jobs 4
npm.cmd run balance:v17 -- --experiment acceptance-majors --out balance-results/v17-acceptance-majors --jobs 4
npm.cmd run balance:v17 -- --experiment reference-pawns --out balance-results/v17-reference-pawns --jobs 4
npm.cmd run balance:v17 -- --experiment reference-grants --out balance-results/v17-reference-grants --jobs 4
npm.cmd run balance:v17 -- --experiment level3-confirmation --out balance-results/v17-level3-confirmation --jobs 4
```

Each command starts only its named experiment in a new folder. q / Ctrl+C stops
immediately, g finishes active games and p finishes active color pairs. Preserve
the journals, manifests and rules. Resume a stage with its original settings:

```powershell
npm.cmd run balance:v17 -- --experiment reference-pawns --resume balance-results/v17-reference-pawns
```

Validate a stage without scored games, or refresh its report without an engine:

```powershell
npm.cmd run balance:v17 -- --experiment reference-pawns --check
npm.cmd run balance:v17 -- --experiment reference-pawns --report balance-results/v17-reference-pawns
```

Selecting level-2 anchors is a later decision. Only then declare the six-point
bridge: three L2 pawn/grant purchases versus two copies of each non-Amazon L3
reference. It does not launch automatically after these experiments.
