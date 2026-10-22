# Prepare and run future balance experiments

Version 13 adds reusable tooling. The playable board, piece definitions, and active version-12 campaign remain unchanged. Let that serial campaign finish on its original checkout; parallel workers are for new experiments.

## Prepare a configuration

Choose stable design revisions in a roster, then preview the generated schedule:

```bat
npm.cmd run balance:prepare -- --roster experiments/balance/level3-roster.json --dry-run
```

The existing 14-design roster produces 91 matchups plus two controls over ten color-swapped opening pairs: **1,860 games**. Reference mode compares each other candidate with the roster's reference, plus the same controls: **300 games**.

Write a configuration for review:

```bat
npm.cmd run balance:prepare -- --roster experiments/balance/level3-roster.json --mode reference --out experiments/balance/future-reference.json
```

This creates `future-reference.json` and `future-reference.prepare.json`; either existing file prevents overwriting. The preparation record archives selected candidates, costs, settings, counts, definitions, allocation, and hashes. Writing replays every selected army/color/opening combination through the rules validator. A dry run checks the plan without writing files or replaying openings. Neither command plays games.

A roster needs `referenceId` and a `candidates` array of stable catalog IDs. Each candidate may also specify `key`, `label`, and its ordinary starting `square`. The default squares are d2/b1/c1/a1/d1 for pawn/knight/bishop/rook/queen. Current preparation supports nonroyal purchases and ordinary kings.

Options include:

| Option | Meaning |
| --- | --- |
| `--mode round-robin` | Every candidate pair; the default. |
| `--mode reference` | Each other candidate against the selected reference. |
| `--max-games N` | Hard scheduled-game cap; default 2,000. |
| `--opening-pairs N` | Use the first N declared prefixes; default up to ten. |
| `--openings FILE` | Supply a JSON prefix array or a config containing `openings`. |
| `--nodes N`, `--seed N` | Fixed nodes per move and schedule seed; defaults 100,000 and 42. |
| `--allow-unequal-costs` | Explicitly permit a differently priced handicap comparison. |

The generator rejects over-cap schedules rather than silently dropping opponents or openings. It also checks candidate IDs, placements, equal purchase costs, and the engine's 20 custom-type capacity. It does not split an oversized roster into separate experiments automatically.

## Run independent games in parallel

After reviewing a new schema-2 configuration:

```bat
npm.cmd run balance:parallel -- --config experiments/balance/future-reference.json --out balance-results/future-reference --jobs 2
```

Workers run different games concurrently. Each game's two engine processes retain one search thread apiece and the declared settings. One side searches at a time within a game. This preserves fixed-node search effort while using more CPU and memory across games; it does not guarantee an exact speedup.

Start with two workers, then consider four for a later run if CPU and memory permit. Each worker also loads the rules runtime and two engine hash tables. Supported requests are 1–16 workers, limited by the number of color pairs. Choose the worker count before starting; resume keeps it fixed.

The coordinator assigns disjoint complete color pairs to workers. Each worker owns its checkpoint and append-only journal under `workers/`; only the coordinator writes aggregate results in the parent directory. Keep the entire directory together when moving or backing it up.

During the run, **q / Ctrl+C** stops all workers now, **g** stops each after its active game, and **p** stops each after its active pair. Inspect or resume with:

```bat
npm.cmd run balance:parallel -- --status balance-results/future-reference
npm.cmd run balance:parallel -- --resume balance-results/future-reference
```

Use the parallel command for the parent directory. The ordinary serial resume command rejects parallel parents. Changing worker count, coordinator sources, engine, rules, or settings requires a new experiment. An existing serial run cannot be converted to parallel workers.

The parent produces the usual `run.json`, `games.jsonl`, `summary.json`, and `games.pgn`, plus `parallel-state.json` for execution sessions. Worker checkpoints are the source for game recovery. Parent-level reports combine all workers; concurrent game durations overlap, so their sum is not elapsed wall time. Level-3 runtime estimates use the longest remaining worker queue and observed game durations; uneven game lengths can leave one worker running after the others finish.

## Choose terminal detail

New and resumed `balance`, `balance:level3`, and `balance:parallel` processes print game starts, results, preflight notices, and summaries by default. `--log games` explicitly selects this mode. Add `--log plies` to print move progress every ten plies for diagnosis. This affects terminal output only; complete move records remain in the result files.

Finished games name the winning army and its color, followed by a running matchup score. A is always the first army and B the second, even when they swap colors. In a game ID, `_w` or `_b` gives A's color; `1-0` means White won and `0-1` means Black won. Thus `camel-knight-v-blink-rook_…_b: 1-0` is a Blink rook win.

The live tally awards one point per win and half per draw, counting all scored games for that matchup. It restores totals on resume and combines parallel workers. Truncated games remain unscored; formal balance estimates still use complete color pairs. Counters update in memory after each result, with saved history loaded once on resume.

The 0.13.1 display update changes the parallel CLI's source fingerprint. Parallel runs started with 0.13.0 should continue on their original checkout. The version-12 serial campaign's rules and core runner identity remain unchanged.

Version 12 has no ply-output switch. Updating files cannot change a process already running; let the current campaign continue rather than interrupting it solely for quieter output.

## What still needs a decision

Creating another run no longer requires hand-writing every matchup, control, or color pair. Select the roster and settings, generate the plan, review its preparation record, then start it. Mechanical setup is reusable; a new movement ability or custom deployment can still require code and independent rule checks.

Choose the question, candidate revisions, equal-cost assumptions, reference, opening cohort, search effort, game cap, and decision criteria before collecting evidence. The tools neither tune pieces nor schedule an endless chain of follow-ups. Generic runs produce the standard summaries; the existing level-3 matrix/report command remains tied to its declared campaign roster. See [the testing protocol](../BALANCE.md) for interpretation and uncertainty.
