# Game-boundary checkpoint writes

Version 0.17.9 removes the normal game-start and per-move checkpoint writes.
Live moves stay in memory. At game end, the result journal is flushed durably
before the progress checkpoint and derived reports are updated.

- Completed journal results remain authoritative and are skipped on resume,
  including a crash after the journal flush but before the checkpoint update.
- q / Ctrl+C and engine errors still flush the interrupted prefix once, so a
  clean stop can resume that game from its saved position.
- A power loss or forced process termination can lose unsaved work in the
  current game of each worker. Previously completed games remain recorded.
- g and p retain their game/pair boundaries. A stop still pauses the whole queue.

Search nodes, engine strength, movement, prices, material tables, openings,
scheduled games and worker assignments are unchanged.

## Update the active version-0.17.8 campaign

This historical storage-only upgrade applies to tags **v0.17.9 and v0.17.10**.
Version 0.17.11 adds research definitions and changes the frozen rules bundle,
so it deliberately cannot use this approval to resume an unfinished old run.
The original five-stage campaign has now completed; new experiments use the new
runtime identity.

In the running terminal, press **g** and wait for the active games to finish
and the campaign to pause. For an unfinished historical campaign, select the
approved release and resume the same folder:

```powershell
Set-Location 'D:\Chess\LevelUpChess'
git fetch origin tag v0.17.10
git switch --detach v0.17.10
npm.cmd run balance:campaign -- --resume balance-results/v17-brackets
```

Completed stages are validated and skipped. The unfinished stage continues
with its original workers. For an individually launched stage, use
its original `balance:v17 --experiment NAME --resume DIRECTORY` command.

The reviewed upgrade accepts only the exact source transition from `v0.17.8`.
It verifies unchanged engine and rules-bundle bytes, configuration, profiles,
schedule, evaluation and shards. Keep the existing rules bundle in place during
this upgrade; rebuilding it can change the frozen byte identity.

Original parent and worker manifests remain byte-identical. Each upgraded run
directory receives `checkpoint-runtime-upgrade.json`, recording the frozen
experiment identity, actual runtime and reviewed approval hash. Workers not yet
created inherit their verified parent's frozen identity with their own receipt.
Unreviewed source changes and other historical versions retain the original
checkout requirement.

## Write reduction and verification

For a game with 80 played plies, normal checkpoint replacements fall from
**82 to 1**. Completed-result journal flushes and game-end reports remain.
The [storage benchmark](checkpoint-benchmark-v17.md) measures these write
patterns with synthetic histories rather than engine games.

The four-game, 40-ply benchmark reduced checkpoint replacements **168 to 4**
and file flushes **182 to 18**, retaining identical result bytes. This is a
97.6% reduction in checkpoint replacements; it is not a measured whole-game
speedup. Actual throughput on the USB drive still depends on search time,
memory pressure and game-end reporting.

Recovery tests cover abrupt process loss, clean stops, durable results ahead
of checkpoints, legacy move checkpoints and interrupted checkpoint writes.
Native fixtures extract the actual old tag and verify serial resume, previously
uncreated workers, and worker results missing from the aggregate. Their short
games are deliberately unscored and do not enter balance evidence.
