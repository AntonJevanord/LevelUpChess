# Nightrider capture-step test

The first eight panel openings identify Nightrider as a revision candidate.
Its full-roster scores are 35.42%, 42.71% and 43.40% at 20k/40k/80k nodes.
The selected follow-up compares three bodies with the four frozen references:

| Body | Betza | Added ability |
| --- | --- | --- |
| Fresh control | `N0` | Original repeated knight leaps |
| Diagonal capture | `N0cF` | Capture an adjacent diagonal enemy |
| Orthogonal capture | `N0cW` | Capture an adjacent orthogonal enemy |

Quiet movement stays unchanged. Neither revision enters the playable roster
before outcome and human review. Wraith remains unchanged.

## Why not N0gN0?

The bundled native and browser engines parse `gN0` but lack a knight-ray hopper
generator. `N0gN0` has the same tested moves and attacks as `N0`, while its
automatic value rises from 2326/2211 to 4776/3979. Running that notation would
not test the intended movement buff. The [diagnostic](../prototypes/nightrider-hop/README.md)
records the matching source explanation and 47,848 native/browser checks.

The selected capture-step versions are supported. All three bodies receive
the original **2326/2211** in all six engine value tables, for both colors.
Reference values remain frozen. No values are fitted from outcomes.

## Fixed protocol

- Three bodies × four references × eight openings × both colors × three budgets
  = **576 fresh games**, with 192 games at each budget.
- Use the final eight cases of the predeclared 64-case book, outside the ongoing
  panel's first 32 target. They were not used to select the weak Nightrider.
- Every budget shares identical prefixes, purchase slots and color pairs.
- Skill 20, 20k/40k/80k requested nodes, one thread, 32 MiB hash and a
  400-total-ply cap, including the four forced quiet plies.
- Four workers total; the budgets run sequentially. Errors, truncations and
  unfinished color pairs remain unscored.

The fresh control tests the change under one profile and holdout context.
Earlier panel games remain discovery evidence and are not counted again here.
The new four-reference mean is a different opponent basket from the old
nine-opponent full-roster mean; compare each revision with its fresh control.

## Run, pause and resume

Run one campaign at a time. Let the complete panel finish, or pause it with `p`
before starting the focus. Its original catalog, controller and balance bundle
stay byte-for-byte unchanged, so this addition does not invalidate its resume.

```powershell
git pull
npm.cmd run balance:nightrider -- --out balance-results/nightrider-focus --jobs 4
```

The launcher builds an owned research snapshot in the new output's `runtime`
folder. Only that copy gains the two experimental IDs. It pins its code, rule
bundle and small chess runtime; the engine executable retains its separate
recorded hash. Keep the entire folder, including `focus-runtime.json` and
`runtime`, when moving or backing up the run. No Git branch switch or rebuild
is needed. Installed project dependencies are still needed by the launcher.

`q`/Ctrl+C stops immediately, `g` finishes active games and `p` finishes active
color pairs. Every stop pauses the whole three-budget queue. Completed stages
are verified and skipped on resume:

```powershell
npm.cmd run balance:nightrider -- --resume balance-results/nightrider-focus
npm.cmd run balance:nightrider -- --report balance-results/nightrider-focus
```

`focus-report.md` updates after a stage or clean stop. It contains the three
matrices, W/D/L, complete-case reference averages and each revision's gain over
N0 on matched opening cases. Conditional ranges resample whole opening blocks,
retaining both colors and all opponents. Eight cases provide a screen; persistent
opponent effects and human counterplay still matter. The frozen references do
not change in response to this test.

Use `--check` for native/rule/value preflight only, or `--check --rules-only`
without a native executable. Neither starts games. `--log plies` adds move
output to a run; game starts, winners and matchup points are the default.
