# Puzzles from completed panels

Open **Menu → Puzzles** to filter by solution length, goal, upgraded-ability
relevance, and pieces involved, moved or present. Length counts your moves,
excluding automatic replies. Checked piece filters must all match.

Three authored practice examples are included. Imported packs stay available
for the page session; keep their JSON files for later visits. Hint, retry and
show solution are available. Returning to the game restores its position,
orientation and paused clock without replacing your browser save.

## Mine mates and material wins

Pull `version_19`, restart the local server, and wait until all selected panel
workers have stopped. Use the actual folder names on your computer:

```powershell
npm.cmd run puzzles:mine -- --run balance-results/v19-level1-expanded --run balance-results/v19-level2-expanded --run balance-results/v19-level3-expanded --out puzzle-results/expanded-tactics
```

Import **puzzle-results/expanded-tactics/puzzles.json** through **Menu → Puzzles
→ Add a puzzle pack**. The output also contains a report and resumable candidate
journal. Builds do not start mining automatically.

The defaults sample 400 distinct completed games, including draws, and examine
up to 1,200 positions across both colors and the course of each game. They seek
mate or a material gain in **two or three solver moves**, with a 30-puzzle pack
limit. One Skill-20 engine screens candidates at 320k nodes, retaining the
source profile's original MG/EG priors. A bounded independent search then
checks the tactic. A run may find fewer puzzles than requested.

The bundled Windows **`fairy-stockfish-levelup_x86-64.exe`** engine is selected
automatically. `--engine` takes precedence over `FAIRY_STOCKFISH_PATH`, which
takes precedence over that Windows default. Other platforms use
`--engine PATH` or `FAIRY_STOCKFISH_PATH`. Original roster-004 panels are also
supported. Expanded panels already contain their copied historical evidence;
duplicate games are counted once and retain their original profiles.

### Correct the version-0.19.12 Windows engine selection

Version 0.19.12 accidentally selected the old `largeboard` executable for
puzzle commands. The [uploaded failure receipt](../experiments/puzzles/results/mining-engine-001.review.json)
confirms that binary was used: 160 candidate decisions, no accepted puzzles.
The exact move difference at the failed position was not saved.

Version 0.19.13 selects the supported LevelUp engine and refuses the known
legacy binary even if renamed. Keep the old puzzle folder unchanged and start
fresh analysis with a new output name and the same source folders. For the
reported mate-in-three/four run:

```powershell
git pull --ff-only
npm.cmd run puzzles:mine -- --run balance-results/v19-level3-expanded --out puzzle-results/long-mates-levelup --engine .\stockfish\fairy-stockfish-levelup_x86-64.exe --goals mate --min-moves 3 --max-moves 4 --proof-nodes 1000000 --proof-ms 20000
```

Use your actual source folder name. Candidate screening repeats with the
correct engine; the recorded matches are reused. Resume deliberately refuses
to mix the old engine/code identity into the new analysis.

Any future legal-move discrepancy stops analysis and writes
**`native-rules-mismatch.json`** in the output folder. It contains the exact
position, full prefix, piece profile, engine identity and both move lists for
reproduction. An unverified candidate is never accepted as a puzzle.

Check sources without creating output or starting searches:

```powershell
npm.cmd run puzzles:mine -- --run balance-results/v19-level1-expanded --run balance-results/v19-level2-expanded --run balance-results/v19-level3-expanded --check
```

## Choose the puzzle mix

`--variant-share 90` targets **90% tactics requiring upgraded movement and 10%
ordinary tactics**. The test replaces upgraded pieces with ordinary movement
from the same family at the puzzle's starting position, then checks the same
goal and move bound. An upgraded rook making an ordinary ladder mate belongs
in the ordinary group. Stationary upgraded support can make a tactic exclusive
even when that piece never moves.

This check is separate from the involved/moved/present tags. Work-limited
checks, repeated pre-puzzle positions and positions containing reserve grants
can remain **unknown**; those candidates are withheld. An ordinary king is not
a fair replacement for every nonroyal grant.

The exported pack uses the largest available mixture within its size limit,
rounding quotas to whole puzzles. Its report shows the actual mix and any
shortage. Unknown results are never relabeled to fill a quota, and verified
overflow remains in the journal. Use `--variant-share 100` for exclusive tactics
only, or `0` for ordinary tactics only.

## Longer mates and material goals

For a separate mate-in-three/four pack, allow more proof work:

```powershell
npm.cmd run puzzles:mine -- --run balance-results/v19-level3-expanded --out puzzle-results/long-mates --goals mate --min-moves 3 --max-moves 4 --proof-nodes 1000000 --proof-ms 20000
```

The maximum supported bound is five solver moves. Exhaustive proof grows
quickly; increasing it can leave many candidates unproven. A native mate score
only nominates a candidate. The independent proof covers every legal defense
and requires a unique solver move within the remaining bound at each turn.
Slower winning moves outside that bound are not ruled out.

Mixed goals permit either type; they do not promise a fixed number of each.
For a separate material pack:

```powershell
npm.cmd run puzzles:mine -- --run balance-results/v19-level1-expanded --run balance-results/v19-level2-expanded --run balance-results/v19-level3-expanded --out puzzle-results/material-tactics --goals material
```

`--minimum-gain 200` requires a gain of at least two counting points.
The declared **base-plus-level-v1**
scale uses ordinary P=1, N/B=3, R=5 and Q=9, adds the upgrade level to a board
piece's base value, and counts grants by their purchase level. These are puzzle
counting assumptions, **not fitted material values or engine centipawn scores**.

Material certificates cover all legal defenses during the solution and audit
captures, promotions and check evasions for up to four settling plies. A
conservative capture-threat probe also checks that a valuable attacked piece
was not simply ignored. This is a bounded tactical goal, not a guarantee against
every later quiet strategic threat. Unresolved exchanges and ambiguous lines
are withheld. The browser replays the certificate before allowing play.

## Pause and resume

Ctrl+C pauses safely. Keep the entire output directory and unchanged sources,
then resume with the same source list:

```powershell
npm.cmd run puzzles:mine -- --run balance-results/v19-level1-expanded --run balance-results/v19-level2-expanded --run balance-results/v19-level3-expanded --resume puzzle-results/expanded-tactics
```

Resume retains the original limits, engine and generator identity. Do not
update the generator during an unfinished mining run. To change bounds, use a
new output directory. `--help` lists game, position, pack and proof limits.
Dead-process output locks can be reclaimed on resume. Exported packs stay
within the browser's 20 MiB import limit; additional verified puzzles remain
in the candidate journal.

The earlier `puzzles:generate` command remains available for the late-game
mate-in-one/two pilot. It does not enforce the new relevance mixture; use a new
`puzzles:mine` output directory for the broader workflow.

## Sources and participation

Sources stay read only. The loader verifies owned manifests and runtimes,
refuses active source locks, and replays each sampled game through its recorded
result. Forced opening plies are excluded from candidate selection. Full
pre-puzzle history is retained for repetition and draw checks.

**Moved** covers both sides' actual solution moves, castling rooks and drops.
**Involved** also includes captures, promotions, target kings and stationary
units whose removal changes the tactic or legal defenses. Hypothetical
material-audit moves do not count as pieces moved in the solution. These tags
help filter puzzles; they are not complete tactical explanations.

The [first uploaded pilot](../experiments/puzzles/results/pilot-001.review.json)
contains twelve mate-in-one and four mate-in-two puzzles. Its histories, trees
and participation tags were replayed. A separate
[movement-relevance audit](../experiments/puzzles/results/pilot-001.relevance.json)
classified **11 exclusive, two ordinary and three unknown** tactics without
new native searches or collected games. Human review remains useful for
readability, interest and the quality of these labels.

## Future positions from weaker play

The current miner reuses completed panel games. A separate puzzle-only
collector could broaden the supply with playing skills **4, 8, 12, 16 and 20**,
including equal and mismatched opponents. A small starting batch would be
three tier profiles × five skill bands × four games: **60 games**. Lower skill
creates opportunities, but very weak play often produces simple hanging-piece
tactics rather than deeper puzzles.

Analysis and verification should remain at Skill 20. Record both playing
skills, search budgets, engine identity, exact profiles and full histories;
keep these games separate from balance evidence. Compare accepted interesting
puzzles per engine-minute before scaling. This collector is a planned next
step, not part of `puzzles:mine` yet. The pinned
[upstream research](variant-puzzle-plan.md) remains useful for comparison.
