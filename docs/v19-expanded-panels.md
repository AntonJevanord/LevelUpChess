# Expanded version-19 roster and panels

Roster 005 retains every roster-004 design and adds the five selected
alternatives. They can be played alongside the original options; none removes
or changes an earlier piece.

| Tier | New alternative | Existing option retained | Movement |
| --- | --- | --- | --- |
| 1 | Dabbaba bishop | Hopping bishop | `BD` |
| 2 | Forward-zebra knight | Dabbaba knight | `NfhZ` |
| 2 | Restricted Knight-capture rook | Knight-capture rook | `RcsNcfN` |
| 2 | Sideways-diagonal queen | Wide-knight queen | `QsDsNA` |
| 3 | Long sideways-diagonal queen | Wraith | `QsHsCsZG` |

Choose **Level 1/2/3 roster · expanded** in the playable Rules selector. Each
alternative has the same tier, price and presentation color as the option it
may replace. The original libraries and saved profiles keep their identities.

The minor reports support trying `BD` and `NfhZ`. `BD` scores 55.47% over
32 completed opening cases toward its 64-case target. The
[final knight report](../experiments/balance/results/v19-minors-final-001.sources.json)
completes all 64 cases: `NfhZ` scores **50.39%** over 384 games, with a
conditional 95% range of 46.09%–54.69%. Its reference matchups score
57.03%, 47.66% and 46.48%; the earlier weak Bishop-grant matchup normalized.
The [partial reports](../experiments/balance/results/v19-minors-selection-001.sources.json)
remain historical checkpoints. Laptop sleep errors remain unscored attempts.
The expanded panel broadens the opponent basket before any replacement decision.

## Reuse the completed original panels

Start a new expanded campaign using the corresponding **original roster-004
tier panel folder**. The full folder is required: manifests, owned runtime,
preflight evidence and journals. A Markdown report or focused-study folder is
not a substitute. Stop the source panel and its workers first; existing locks
are refused rather than removed.

The new campaign copies the verified source evidence into its own private
evidence directory and retains the source records' original game IDs, attempts,
profiles and provenance. It schedules only pairs involving a new alternative,
including alternative-versus-alternative pairs at level two. Old-versus-old
games stay in the historical roster-004 context; they are not renamed as new
roster-005 games.

| Tier | Expanded roster | New games: 8 openings | New games: 64 openings |
| --- | ---: | ---: | ---: |
| 1 | 12 designs | 176 | 1,408 |
| 2 | 15 designs | 624 | 4,992 |
| 3 | 13 designs | 192 | 1,536 |
| Total | | 992 | 7,936 |

A complete fresh eight-opening rerun would need 3,984 games. Reuse avoids
replaying the 2,992 original scheduled cells, while leaving failed, truncated
or incomplete source pairs unscored. These counts do not promise that every
cell has a usable result. Missing source results are not silently replaced.

The source must contain attempted schedule coverage through the requested
opening target and use the same native engine executable, frozen book,
strength settings, rules and search priors for the retained designs. The
loader checks the original owned declarations and copied evidence. A source
with 64 cases permits later 8/16/32/64 continuation without consulting its
original location. A source copied with fewer cases limits continuation to
that copied coverage.

## Start and continue

Run one expanded tier at a time, using new output directories. These examples
use one worker to match the existing concurrent-panel setup. Four workers
remain available when starting a run on its own.

```powershell
npm.cmd run balance:v19:expanded -- --tier 1 --reuse balance-results/v19-level1-roster004 --out balance-results/v19-level1-expanded --openings 8 --jobs 1
npm.cmd run balance:v19:expanded -- --tier 2 --reuse balance-results/v19-level2-roster004 --out balance-results/v19-level2-expanded --openings 8 --jobs 1
npm.cmd run balance:v19:expanded -- --tier 3 --reuse balance-results/v19-level3-roster004 --out balance-results/v19-level3-expanded --openings 8 --jobs 1
```

Use the actual original folder names. On resume or offline reporting, the new
campaign uses its owned copy of the source evidence, so omit `--reuse`:

```powershell
npm.cmd run balance:v19:expanded -- --tier 1 --resume balance-results/v19-level1-expanded
npm.cmd run balance:v19:expanded -- --tier 1 --resume balance-results/v19-level1-expanded --openings 16
npm.cmd run balance:v19:expanded -- --tier 1 --report balance-results/v19-level1-expanded
```

Opening targets are totals. Completed eight-case batches are verified and
skipped. Keep the entire new campaign folder, including its copied evidence
and owned runtime; the original source folder can then move without breaking
resume. The controller retains the usual `q`/Ctrl+C, after-game `g` and
after-pair `p` controls. Search stays at **40k nodes, Skill 20, one thread and
32 MiB hash**. The original search priors remain fixed for every design.

## Read the combined results

The expanded matrix explicitly separates historical roster-004 cells from
new roster-005 cells. Their global type registries and letter mappings differ,
so this descriptive composite must not be presented as one uniform engine
policy. Per-cell source references remain available. Whole-roster standings
are recalculated for the larger opponent basket; fixed-reference standings
remain separate. Truncated games, aborted/error attempts and completed games
without a scored color partner remain unscored.

Retain the existing roster-004 material fits in their original contexts. Do
not feed the mixed-context composite into a single uniform material fit or
treat its fitted values as purchase prices. A later valuation study needs an
explicit method for handling the source contexts and reserve grants.

The planned cross-level study remains separate: it will test unequal-budget
bridges and mixed armies after this comparison. For puzzles, the
[puzzle extraction plan](variant-puzzle-plan.md) starts with completed panel
game journals and their exact profiles, then uses mixed-army games to broaden
the tactical motifs. No puzzle generation or extra balance games run merely
because the roster or website is built.

## Release checks

The expanded release passes 165 version-19 checks and 18 browser checks,
including save/reload and native replies. Native preflight verifies all
7,936 new pairing/opening/color cells through 64 openings without playing
games. Reuse integration fixtures cover source preservation, incompatible
protocol rejection, offline reporting after moving the original folder and
continuation without replaying completed batches. Those synthetic fixtures
test the pipeline and supply no balance evidence. All 56 earlier playable
JSON/INI artifacts and the frozen balance bundle retain their original bytes.
