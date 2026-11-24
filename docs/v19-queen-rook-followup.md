# Version 19: queen and rook follow-up

Keep the running 64-opening panels unchanged. This separate focused study tests
new queen and rook designs against the fixed references; candidates do not play
one another and no alternative is promoted automatically.

## What we have tested

The full-jump Zebra queen `QZ` and Sideways queen `QsNsC` have recorded
level-three results. Their extra jumps can both move and capture.

| Earlier study | Games per design | `QZ` | `QsNsC` |
| --- | ---: | ---: | ---: |
| V17 initial eight openings | 64 | 39.06% | 42.97% |
| Original eight plus eight new openings | 128 | 42.19% | 42.58% |
| Later, separate sixteen-opening confirmation | 128 | 41.80% | 41.41% |

See the [initial screen](../experiments/balance/results/v17-screen-001.level3.report.md),
[combined follow-up](../experiments/balance/results/v17-followup-001.report.md)
and [later confirmation](../experiments/balance/results/v17-level3-001.report.md).
These used 20k nodes and older books and search priors. They provide historical
context; their games are not pooled into the new study.

No archived played evidence was found for `QC`, `QsCfC` or `QsZfZ`. Earlier
camel queens used restrictions, including capture-only `QcC` and quiet-jump
Box/Blink queens. The optional `QfcCscC` proposal in the
[V18 shortlist](v18-lower-tier-shortlist.md) is also capture-only.

## Candidates and controls

| Study | Design | Movement | Purpose |
| --- | --- | --- | --- |
| `level2` | Forward-jump Wide-knight queen | `QsNfD` | Add a two-square forward jump |
| `level2` | Long forward-jump Wide-knight queen | `QsNfDfH` | Add two- and three-square forward jumps |
| `level2` | Restricted Knight-capture rook | `RcsNcfN` | Remove the two tall backward knight captures |
| `level2` | Current Wide-knight queen | `QsN` | Fresh unchanged control |
| `level2` | Current Knight-capture rook | `RcN` | Fresh unchanged control |
| `queens3` | Cataphract-style camel queen | `QsCfC` | Six unrestricted camel jumps |
| `queens3` | Cataphract-style zebra queen | `QsZfZ` | Six unrestricted zebra jumps |
| `queens3` | Diagonal-jump Zebra queen | `QZAG` | Full zebra jumps plus two- and three-square diagonal jumps |
| `queens3` | Orthogonal-jump Zebra queen | `QZH` | Full zebra jumps plus three-square orthogonal jumps |
| `queens3` | Full camel queen | `QC` | All eight unrestricted camel jumps; new test |
| `queens3` | Full Zebra queen | `QZ` | Fresh retest of all eight unrestricted zebra jumps |
| `queens3` | Current Wraith | `QgmQ0gcBgcsR0` | Fresh unchanged control |

`D` and `H` are jumps, so the forward additions cross blockers. An ordinary
queen already reaches these destinations along a clear file; the new ability
is reaching them when that file is obstructed. Both new jump components can
move and capture.

`QZAG` keeps all eight zebra jumps and adds `A`/`G` diagonal jumps over
blockers. Its ordinary queen movement already reaches those diagonal
destinations along a clear path; the extra ability is crossing obstructions.
All of these added jumps can move and capture.

`QZH` instead adds three-square orthogonal jumps to `QZ`. The full `QC` and
`QZ` trials retain all eight camel or zebra jumps, respectively, while
`QsCfC` and `QsZfZ` remove the two tall backward jumps. The fresh `QZ` retest
provides a comparison under this study's current book and controlled priors;
its older games remain separate.

The Cataphract-style directional masks retain all wide jumps and tall forward
jumps. They remove the two tall backward jumps, not every backward jump.
The rook uses the same directional shape for capture-only knight jumps; its
quiet movement remains ordinary rook movement.

The level-two opponents are the unchanged **Quiet-tall Knight pawn, Rank pawn
and Bishop grant**. The level-three opponents are the unchanged **Unicorn,
Crusader, Vanguard and Amazon**. Each army buys one upgrade at its declared
tier. Both colors share the current panel's opening book.

Search remains **40k nodes, Skill 20, one thread and 32 MiB hash**, with four
workers by default. Candidate and control priors are fixed within each family:

| Study / family | MG | EG |
| --- | ---: | ---: |
| Level-two queens | 3738 | 4155 |
| Level-two rooks | 1904 | 1959 |
| Level-three queens | 3772 | 3470 |

Reference priors remain unchanged. These are engine search settings, not
purchase prices or fitted material values. Fresh controls help compare the
new collection context with earlier results; matching control scores alone
does not validate pooling games from different contexts.

Eight openings schedule **240 level-two games** and **448 level-three queen
games**, 688 in total. Targets 16/32/64 schedule proportionally more games.
The conditional fallbacks `QsNsDsH` and `QsNDH` are reserved for a later trial
if the forward-jump queens remain too weak; they are not scheduled here.

The later [sideways extension](v19-sideways-followup.md) now tests `QsNsDsH`
in its own context, alongside two other sideways queens. `QsNDH` remains an
optional future design; this original study keeps its definitions.

## Commands

Wait for the current panels to finish, then pull `version_19`. Run the studies
one at a time so they do not compete with the panel or each other:

```powershell
npm.cmd run balance:v19:queen-rook -- --study level2 --out balance-results/v19-queen-rook-level2 --openings 8 --jobs 4
npm.cmd run balance:v19:queen-rook -- --study queens3 --out balance-results/v19-queen-rook-level3 --openings 8 --jobs 4
```

Resume, extend to sixteen total openings, rebuild a report without engines,
or validate without playing:

```powershell
npm.cmd run balance:v19:queen-rook -- --study level2 --resume balance-results/v19-queen-rook-level2
npm.cmd run balance:v19:queen-rook -- --study level2 --resume balance-results/v19-queen-rook-level2 --openings 16
npm.cmd run balance:v19:queen-rook -- --study level2 --report balance-results/v19-queen-rook-level2
npm.cmd run balance:v19:queen-rook -- --study level2 --check --openings 8
npm.cmd run balance:v19:queen-rook -- --study queens3 --check --openings 8
```

Use `--study queens3` and the level-three folder for the other study.
Opening targets 8/16/32/64
are totals, not additional openings. Keep each complete run folder, including
its owned runtime and batch journals. Completed batches are verified and
skipped when resuming. Reports retain opponent scores, overall scores,
physical colors, conditional ranges and recorded post-opening evaluations.
Truncations, errors and incomplete color pairs remain unscored.

## Adding an accepted design to a panel

Do not edit the roster or append new definitions into an owned panel runtime.
An accepted alternative needs a new immutable design identity and a separately
declared successor panel. Keep every original journal, profile and report with
its original meaning.

A successor can reuse unchanged matchups after verifying matching engine and
rules semantics, applied search priors, starting positions, opening prefixes,
search settings and complete color pairs. Changed opponents, movement, roles,
placement or priors require new games. Reassigning letters is not enough to
establish equivalent engine behavior. Imports must retain source provenance,
deduplicate games and keep incompatible cohorts separate. Whole-roster scores
must be recalculated for the successor's opponent basket.

For a twelve-piece panel at 64 openings, replacing one design requires
**1,408 new games** against the other eleven designs, rather than replaying all
8,448 games. Replacing two requires **2,688 new games**, including their mutual
matchup. These counts assume all remaining cells pass compatibility checks.
Focused candidate/reference games may also fill compatible successor cells,
but require the same verification.

This follow-up does not implement a panel importer or alter an active panel.
The successor roster and import selection should be declared once we know
which candidates, if any, are accepted. No scored cloud campaign was started;
development validation is limited to rules, preflight and bounded workflow
checks.

The release passes all **120 version-19 tests**, including 1,152 forced-prefix
replays for the nine new bodies in both colors. Both public native preflights
pass their opening cells and movement fixtures. All 84 existing profile,
variant, distribution and declaration files, and all 24 roster-004 panel
declaration/schedule/profile combinations, retain their recorded bytes.
