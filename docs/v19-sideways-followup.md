# Version 19: sideways queen and restricted-rook trials

This separate extension tests eight new designs against the fixed same-tier
references. Existing queen/rook studies, panel rosters, journals and owned
runtimes retain their original definitions. Candidates do not play one another,
and no result automatically changes the playable roster.

## Why this extension

The supplied [queen/rook follow-up](v19-queen-rook-followup.md) reports now cover
64 openings. Their overall scores count draws as half a point:

| Level-two design | Score | Level-three design | Score |
| --- | ---: | --- | ---: |
| `QsNfD` | 43.25% | `QsCfC` | 45.21% |
| `QsNfDfH` | 58.07% | `QsZfZ` | 37.60% |
| `RcsNcfN` | 58.59% | `QZAG` | 67.19% |
| `QsN` control | 37.89% | `QZH` | 65.82% |
| `RcN` control | 60.68% | `QC` | 42.68% |
| | | `QZ` | 40.48% |
| | | Current Wraith | 40.82% |

The level-two report has 1,920 finalized games and 959 scored color pairs;
level three has 3,584 finalized games and 1,791 scored pairs. Truncated games
and their unpaired completed partners remain unscored. `QsNfD` and `QZ` each
use 63 shared opening cases for their overall basket. Only the reports were
supplied for this checkpoint; these figures are report-level evidence, not a
new audit or replay of the underlying journals.

The [report-only source receipt](../experiments/balance/results/v19-queen-rook-followup-001.sources.json)
records the retained compressed reports and their hashes. It preserves report
provenance without claiming that the original runtime or game journals were
supplied.

The earlier restricted/full queen pattern is less consistent after 64 cases:
restricted camel leads full `QC` by 2.53 percentage points, while full `QZ`
now leads restricted zebra by 2.88 points. That does not establish an intrinsic
benefit from removing backward jumps. `QZAG` and `QZH` remain above the working
40–60% band, motivating the new sideways-only bracket. The restricted rook is
inside the band by point estimate, but remains near its upper end.

## New designs and controls

All queens retain ordinary queen movement. Their added jumps can both move and
capture; a friendly piece on the destination still blocks the landing.

| Study | Movement | Added ability |
| --- | --- | --- |
| `level2` | `QsDsN` | Two-square sideways jumps and four wide knight jumps |
| `level2` | `QsDsNA` | The same, plus four two-square diagonal jumps |
| `level2` | `QsNsDsH` | Four wide knight jumps plus two- and three-square sideways jumps |
| `level2` | `RcfhN` | Ordinary rook moves plus four forward-half knight captures |
| `level2` | `RcsN` | Ordinary rook moves plus four wide knight captures |
| `queens3` | `QsCsZ` | Four wide camel and four wide zebra jumps |
| `queens3` | `QsHsCsZ` | The same, plus three-square sideways jumps |
| `queens3` | `QsHsCsZG` | The same, plus four three-square diagonal jumps |

Wide knight, camel and zebra jumps travel two/three/three files sideways and
one/one/two ranks forward or backward, respectively. The literal `fhN` in
`RcfhN` includes all four forward knight destinations: two files sideways and
one rank forward, or one file sideways and two ranks forward, relative to the
piece's color. `RcsN` retains the four wide knight destinations, two files
sideways and one rank forward or backward. Neither new rook gains quiet knight
moves; both retain royal castling eligibility.

`A` and `G` include all four diagonal directions, so they need no `s` modifier.
The queen already reaches `D`, `H`, `A` and `G` destinations along a clear line;
these components add the ability to jump over blockers.

Fresh unchanged **QsN and RcN controls** accompany the five level-two designs,
facing **Quiet-tall Knight pawn, Rank pawn and Bishop grant**. The three
level-three queens and **current Wraith control `QgmQ0gcBgcsR0`** face
**Unicorn, Crusader, Vanguard and Amazon**. Each army buys one upgrade at its
declared tier. No other previous candidates are scheduled again.

## Protocol and commands

Search uses **40k nodes, Skill 20, one thread and 32 MiB hash**, with four
workers by default. Both physical colors use the same frozen opening book.
Queen/rook priors and fixed-reference values remain unchanged:

| Family | MG | EG |
| --- | ---: | ---: |
| Level-two queens | 3738 | 4155 |
| Level-two rooks | 1904 | 1959 |
| Level-three queens | 3772 | 3470 |

These are search settings, not purchase costs or fitted material estimates.
Eight openings schedule **336 level-two games and 256 level-three games**,
592 combined. Eight cases screen for large differences; they do not establish
precise balance. Targets 8/16/32/64 are total openings, with eight-case batches
retained on continuation. Each batch covers the same eight structural opening
families; related prefixes are not independent population samples.

After pulling `version_19`, run the two studies sequentially in new folders.
These examples use one worker to match your setup alongside the existing
panels; four remains the default when starting a separate run:

```powershell
npm.cmd run balance:v19:sideways -- --study level2 --out balance-results/v19-sideways-level2 --openings 8 --jobs 1
npm.cmd run balance:v19:sideways -- --study queens3 --out balance-results/v19-sideways-level3 --openings 8 --jobs 1
```

Resume or extend a study, rebuild its report without engines, or validate
without playing:

```powershell
npm.cmd run balance:v19:sideways -- --study level2 --resume balance-results/v19-sideways-level2
npm.cmd run balance:v19:sideways -- --study level2 --resume balance-results/v19-sideways-level2 --openings 16
npm.cmd run balance:v19:sideways -- --study level2 --report balance-results/v19-sideways-level2
npm.cmd run balance:v19:sideways -- --study level2 --check --openings 8
npm.cmd run balance:v19:sideways -- --study queens3 --check --openings 8
```

For level three, use `--study queens3` and its own output folder. Keep each
whole run folder, including its owned runtime and journals. Existing panel or
queen/rook-follow-up folders require their original commands and cannot be
resumed as this extension. Reports retain overall and per-opponent scores,
physical colors, conditional ranges and the first normal post-opening engine
evaluation; diagnostic observations do not correct scores or select openings.

Accepted alternatives would enter a separately declared successor panel.
Unchanged matchups may be eligible for reuse after checking equivalent rules,
armies, priors, engine/search settings, opening prefixes and complete color
pairs. Original records and source provenance must remain intact. This
extension does not implement that importer or silently pool earlier outcomes.

Release checks pass all 133 version-19 tests and native/browser preflight for
all 4,736 declared army/color/opening cells across the 64-case book. The 88
prior files, 24 roster-004 panel contexts and 16 earlier queen/rook follow-up
contexts retain their recorded bytes. No scored cloud games were started.
