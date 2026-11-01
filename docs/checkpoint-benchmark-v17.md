# Checkpoint storage benchmark

The runner now writes its normal checkpoint at the end of each game, while the
completed-game journal still receives a durable flush. A clean immediate stop
or engine error also saves the interrupted history once. An unexpected shutdown
can lose the in-progress game, but completed journal results remain authoritative.

To compare the old and new disk-write patterns, pause the active campaign first
and run:

```powershell
node scripts/benchmark-game-checkpoints.js --directory D:\Chess\LevelUpChess --games 4 --plies 40 --rounds 2
```

The directory argument selects the drive to measure. The benchmark creates a
uniquely named scratch child, writes synthetic histories through the actual
durable storage functions, and removes only that scratch child. It does not
touch active result folders, start engines, play games or add balance evidence.
Use `--json` to print the complete measurements.

Both patterns write identical completed-result journals and equivalent synthetic
summaries and PGN strings. They differ only in checkpoint frequency; this does
not reproduce engine searching or the full parallel report coordinator. For a
game with 80 played plies, the old pattern replaces the checkpoint 82 times
(start, every ply, end); the new normal pattern replaces it once. That is 98.78%
fewer checkpoint replacements, not 98.78% faster engine games.

The output reports actual file flush counts, checkpoint bytes, result hashes and
elapsed times. Round order alternates to reduce a consistent first-run bias.
Directory flush behavior differs across filesystems and Windows. Cloud timing
does not establish a 10% improvement on the user's USB drive; engine searching,
game-end reports and parallel aggregation still consume time. Compare actual
completed games per hour separately after resuming the same fixed-node campaign;
changing game lengths and starting cohorts can also change that rate.
