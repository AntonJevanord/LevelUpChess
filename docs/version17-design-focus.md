# Version-17 focused design screen

Test four new designs against the four frozen level-3 references and the
promising level-1 two-step pawn. All armies spend **three upgrade points**:
one level-3 bishop, three level-1 pawn upgrades, or three one-point reserve
grants. The pawn baseline likewise uses three upgraded pawns, not one.

| Candidate army | Immutable ID | Exact movement | Setup |
| --- | --- | --- | --- |
| Grid bishop | `bishop.purple@19` | `BDC` | Replace c1 bishop, mirrored for Black |
| Three full-diagonal pawns | `pawn.blue@6` | `FfmWifmnD` | Upgrade c2/d2/e2, mirrored for Black |
| Three long-forward grants | `king.reserve-pawn@3` | `fW2` | Ordinary army with three finite grants in reserve |
| Three pawn-like grants | `king.reserve-pawn@4` | `fmWfceF` | Ordinary army with three finite grants in reserve |

The fifth opponent is **three two-step pawns**, `pawn.blue@5`, movement
`fmW2fceF2`, on the same c/d/e files. The other opponents remain Vanguard
`RfB`, Unicorn `NC`, Cruisader `BsR2nsN` and Amazon `QN`, each replacing its
usual starting piece at a1/b1/c1/d1.

## Design questions

- Does the grid bishop retain interesting tactics without the Mating bishop's
  attacks onto both square colors? Its bishop slides, two-square orthogonal
  jumps and camel jumps all preserve color. It can still fork targets on the
  same color; color restriction alone does not determine its strength.
- Do backward diagonal captures make the full-diagonal pawn useful? Relative
  to the weak quiet-diagonal pawn, this design adds backward captures while
  keeping quiet forward movement and a clear initial forward double step.
- Does the pawn-like grant's restricted quiet movement provide a useful middle
  ground between `fW` and `fF`? Does `fW2` instead benefit too much from extended
  forward capture reach? These are alternatives, not assumed nerfs.

The full-diagonal pawn moves/captures one square on all four diagonals and
moves quietly one square forward. Its initial two-square forward move needs
a clear path and is tied to the engine's home two ranks; returning there makes
it available again. It promotes to ordinary QRBN. Like the earlier quiet-diagonal
pawns, an empty en-passant target is visited quietly, leaving the bypassed
pawn; the engine's overlapping quiet-diagonal convention is unchanged.

The long-forward guard moves or captures one or two squares straight ahead,
requiring a clear path. It cannot jump. The pawn-like guard moves quietly one
square forward and captures one square diagonally forward. Guards remain
nonroyal and do not promote or capture en passant. Deploying a grant spends
a turn, uses an empty square in the owner's half, must resolve check, and
cannot give check. Captured pieces disappear and never refill reserves.

## Fixed protocol

**640 games** = four candidate armies × five opponents × sixteen starting cases
× both colors. Every candidate has 160 games: 128 against references and 32
against the two-step-pawn baseline. No candidate round robin, baseline self
games, or repeated baseline-versus-reference games are scheduled.

Use the same original eight and follow-up eight cases, repetitions = 1,
seed = 20261028, Skill 20, 20,000 nodes per move, one thread, 32 MiB hash and
400-ply cap. All prefixes and native movement/value tables are preflighted.
The unforced starting case permits reserve deployment from move one; each
two-ply prefix postpones it by one ordinary turn per side.

Reports show five opponent columns and **Overall score**. Overall continues to
weight only the four fixed references; the two-step-pawn comparison is separate.
The overall W/D/L summary therefore contains up to 128 games per candidate,
while run progress includes all 160. Both use complete color pairs and draws
as half a point. Shared-opening coverage remains visible during partial runs.

Inspect old/new case cohorts, specific opponents and color effects before
calling a design balanced. The 40–60% panel target and 35–65% matchup flags
remain screening criteria rather than statistical guarantees. Retain readability,
counterplay and the earlier forced-trade concern as human-playtest questions.

## Run on Windows

Update after any existing campaign has stopped, then launch this experiment
once in a new folder:

```powershell
git switch version_17
git pull --ff-only
npm.cmd run balance:v17 -- --experiment design-focus --out balance-results/v17-design-focus --jobs 4
```

Every launch performs native preflight. To check without playing:

```powershell
npm.cmd run balance:v17 -- --experiment design-focus --check
```

Resume or refresh the offline report:

```powershell
npm.cmd run balance:v17 -- --experiment design-focus --resume balance-results/v17-design-focus
npm.cmd run balance:v17 -- --experiment design-focus --report balance-results/v17-design-focus
```

Controls remain q / Ctrl+C to stop now, g after active games and p after active
color pairs. Only this 640-game screen runs; no further campaign starts
automatically. Research definitions do not change the playable workshops or
any previous experiment identity. Keep the complete output folder, including
the manifest, native proof, archived rules and journals.
