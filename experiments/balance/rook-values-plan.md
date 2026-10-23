# Blink rook: automatic versus eight-point valuation

This Version 16 experiment changes the engine's material assumptions, keeping the three Blink movements and their catalog IDs unchanged. It asks whether assigning the intended total value of eight points helps either engine handle these pieces. A better score would show sensitivity to that assumption; it would not establish a measured eight-pawn value.

| Design | Stable ID | Captures |
| --- | --- | --- |
| Quiet Blink | `rook.purple@3` | Ordinary rook captures |
| Blink | `rook.purple@4` | Rook plus adjacent diagonal captures |
| Long Blink | `rook.purple@5` | Rook plus diagonal captures up to two squares |

All retain their existing quiet moves. Each faces the unchanged Amazon, `queen.purple@1`, on otherwise ordinary armies. The upgraded rook starts on a1/a8; the Amazon replaces d1/d8. The completed Version 15 results remain a separate experiment.

## Fixed scope: 400 games

Two explicitly started policies have **200 games each**. Each includes the three matchups above, ordinary-army versus ordinary-army control, and Amazon-army versus Amazon-army control. Each comparison uses the same 20 opening prefixes, with the armies swapped between White and Black: `5 × 20 × 2 = 200`.

Both policies use the same patched executable, source checkout, piece allocation, schedule, worker count and search settings: Skill 20, 100,000 nodes, one engine thread, 32 MB hash, maximum 400 plies, seed 42. Configurations and roster are frozen; the only policy difference is material valuation.

- **Automatic:** the patched engine computes its normal values.
- **Eight-point:** both engines use the override for all three Blink designs, in both middlegame and endgame. Amazon and ordinary pieces keep their defaults.

Eight points means an ordinary rook's five-point value multiplied by `8/5`, rounded separately in each phase. The source engine's rook values are MG 1,276 and EG 1,380, giving **MG 2,042 and EG 2,208**. These are internal engine units, not 800 raw units. The first automatic launch checks that the executable applies the manual values to all six relevant evaluation tables for both colors before creating the campaign files. An older executable is rejected before any baseline game starts.

## Run in PowerShell

Use the Version 16 patched Windows engine included in `stockfish/`. A custom `FAIRY_STOCKFISH_PATH` must point to a matching patched build. Linux/macOS requires that environment variable. Build provenance and limitations are described in [stockfish/README.md](../../stockfish/README.md).

```powershell
npm.cmd run balance:rook-values -- --check
npm.cmd run balance:rook-values -- --out balance-results/rook-values --policy auto --jobs 3
```

`--check` validates both complete profiles, movements and opening prefixes without playing games. The launch creates `rook-values-campaign.json` in the output root, freezing both policies' identities. Use a new directory. Three jobs is a reasonable starting point for the previously reported 4-core/8-thread, 8 GB computer.

After the automatic policy finishes, start the second policy explicitly; it inherits the worker count:

```powershell
npm.cmd run balance:rook-values -- --out balance-results/rook-values --policy eight
```

Stopping never launches the other policy. `q` or Ctrl+C stops immediately; `g` finishes active games; `p` finishes active color pairs. Resume an existing incomplete policy with:

```powershell
npm.cmd run balance:rook-values -- --resume balance-results/rook-values
```

If needed, add `--policy auto` or `--policy eight`. Resume does not create an unstarted policy. A finalized game at the ply limit counts toward finishing a policy but does not contribute a scored result. Keep the root manifest, `automatic/`, `eight-point/` and all worker directories together. Do not update the executable or campaign sources between policies. Version 15 runs must stay with their original checkout and executable.

Progress defaults to game starts and results. Add `--log plies` only when diagnosing a game.

## Read results and stop

A partial report is safe to generate while either policy runs:

```powershell
npm.cmd run balance:rook-values -- --report balance-results/rook-values
```

This writes `rook-values-report.md`, `.json` and `rook-values-scores.csv` in the root. The comparison table uses only opening prefixes with **both scored color games in both policies**. Its signed change is eight-point score minus automatic score; positive means the Blink army scored better. Each policy also reports its own coverage, wins/draws/losses, truncations, error attempts and controls.

The controls exercise the pipeline, physical-color results and completion. They do not measure a piece's material value. Reports also count paired histories where the original Blink captures the Amazon, or the Amazon takes the Blink and is immediately recaptured, including queenside castling. Those are observable patterns, not proof of forced trades, engine mistakes or why a score changed.

After at most 400 games, review the three policy differences and coverage before deciding anything further. There is no automatic extra run, design change or keep/revise decision. These related opening prefixes and one search budget give a bounded comparison, not universal strength estimates or calibrated Elo. The engine still uses approximations for fairy captures; material overrides do not add learning or replace its evaluator.
