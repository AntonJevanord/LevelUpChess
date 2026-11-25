# Puzzles from completed panels

The playable **Menu → Puzzles** opens a library with minimum/maximum solution
length and separate filters for pieces involved, pieces moved and pieces on
the board. Length counts your moves, excluding the automatic replies. Checked
piece filters must all match. Three clearly marked authored practice examples
are included; they are not extracted experiment games.

A puzzle has its own board. Returning to the game restores the original
position, orientation and paused clock. The engine stays paused until resumed.
Puzzle play does not overwrite the browser save slot. Hint, retry and show
solution are available. Imported packs are kept for this page session; retain
the JSON file for later visits.

## Generate the first pack

Stop the local server before updating, pull `version_19`, and restart the
server to use the new menu. Run generation after all selected source panels
and workers have stopped. Use the actual folder names on your computer:

```powershell
npm.cmd run puzzles:generate -- --run balance-results/v19-level1-expanded --run balance-results/v19-level2-expanded --run balance-results/v19-level3-expanded --out puzzle-results/expanded-pilot
```

The default pilot selects at most 200 distinct completed checkmate games,
examines up to three late positions per game, and stops at 600 analyzed
positions or 30 accepted puzzles. It searches for mate in one or two of your
moves. This is a bounded pilot, not a scan of the entire archive.

Import **puzzle-results/expanded-pilot/puzzles.json** through **Menu → Puzzles
→ Add a puzzle pack**. A run can legitimately find fewer than 30 puzzles.
Generation uses one native engine, 160k nodes per candidate screen and the
original MG/EG search priors. The bundled Windows engine is selected
automatically. Other platforms use `--engine PATH` or `FAIRY_STOCKFISH_PATH`.

Verify the sources without generating anything:

```powershell
npm.cmd run puzzles:generate -- --run balance-results/v19-level1-expanded --run balance-results/v19-level2-expanded --run balance-results/v19-level3-expanded --check
```

Original roster-004 panels can also be supplied. Expanded panels already
include their copied historical evidence; there is no need to list the old
folders again. Duplicate source games do not gain additional weight.

## Stop, resume and change the bounds

Ctrl+C pauses safely. Completed candidate decisions and accepted puzzles are
retained; the interrupted position can be reconsidered on resume:

```powershell
npm.cmd run puzzles:generate -- --run balance-results/v19-level1-expanded --run balance-results/v19-level2-expanded --run balance-results/v19-level3-expanded --resume puzzle-results/expanded-pilot
```

Resume keeps the original sources, engine, generator and limits. To scan a
larger selection, use a new output directory and explicit bounds, for example
`--max-games 1000 --max-positions 3000 --max-puzzles 100 --max-moves 3`.
Increasing mate depth can make exhaustive validation substantially slower.
`--all-pieces` also permits tactics without an upgraded participant.
`--help` lists all work limits. Keep the whole output folder for resume, and
keep the source folders unchanged. Do not upgrade the generator during an
unfinished puzzle run.

## What is verified

The loader checks owned runtime/manifest identities and refuses active source
locks. Reused roster-004 and new roster-005 games keep their original profiles
and letters. Each selected game is replayed through its recorded checkmate;
forced opening plies are excluded. The full history before each candidate is
preserved for repetition and draw checks. Sources are read only.

A native mate score only nominates a position. An independent bounded search
checks every legal defense and requires one mating solver move within the
remaining bound at each turn. Ambiguous, drawn, incompatible and work-limited
candidates are rejected. Slower winning moves outside the stated mate bound
are not ruled out. The browser replays the complete defense tree before play.
This first pipeline makes mate puzzles, not material-gain or defensive puzzles,
and does not assign a human difficulty rating.

**Moved** includes both sides' moving pieces, castling rooks and drops across
the solution tree. **Involved** also includes captured units, promotions, the
target king and stationary units whose removal changes the mating tree or its
legal defenses. This catches support, blocked escape squares and hopper
hurdles without tagging every piece merely for being present. These tags
describe piece types; they do not certify that an upgrade's extra ability was
essential, or provide a complete tactical explanation.

The implementation uses the existing rules binding and native engine without
new Python dependencies. The earlier [upstream research](variant-puzzle-plan.md)
remains useful for later non-mate puzzle types. No extra balance games are
generated or added to the experiment results.

## Validation

The release checks cover owned original/fresh/reused sources, complete mate
trees, escape defenses, ambiguity/work limits, repetition, cancellation,
resume, profile tampering and a real native-engine Vanguard mate fixture.
That fixture is synthetic test data, not an experiment result. Browser checks
cover filters, imports, solving, paused-clock restoration, saves and the
legal/Inspect/jump displays. All 63 earlier rule/profile artifacts retain
their original bytes. No puzzle extraction was run against the user's local
games during implementation.

The [first uploaded pilot](../experiments/puzzles/results/pilot-001.review.json)
contains 16 puzzles from 600 processed candidates: twelve mate-in-one and four
mate-in-two. All supplied histories, defense trees and participation tags were
replayed successfully without new engine searches. Human playtesting remains
the next quality check.
