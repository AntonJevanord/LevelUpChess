# Version 15: choose between design alternatives

One **1,120-game** batch compares twelve level-3 purchase designs with the unchanged Amazon, `queen.purple@1` (`QN`). The hard budget is **1,200 games**; the remaining 80 games are unused. There is no automatic follow-up stage. The earlier [540-game version-14 plan](amazon-revision-plan.md) remains a separate experiment; its results must not be merged with this batch.

## Six design questions

Ranging and Courier already offer two approaches to a mobile pawn, so they form one pair. The other five groups each gain one alternative. Existing definitions keep their IDs and movement.

| Group | First design | Alternative | Question |
| --- | --- | --- | --- |
| Ranging / Courier | `pawn.purple@7`: quiet rook movement in all directions; diagonal captures up to two clear squares | `pawn.purple@8`: unlimited quiet forward/sideways rook movement; unlimited forward diagonal captures | Is limited capture range or forward-only movement the better constraint? |
| Rank pawn | `pawn.purple@9`: sideways rook movement/captures, ordinary pawn steps, and wide forward knight jumps | `pawn.purple@10`: also wide forward camel jumps, three files sideways and one rank forward | Do the extra jumps provide enough reach without overwhelming rank control? |
| Vertical bishop | `bishop.purple@3`: bishop plus vertical rook movement/captures; quiet knight jumps in all directions | `bishop.purple@5`: replace those quiet jumps with full tall knight jumps, one file sideways and two ranks forward/backward | Is broader relocation or narrower jumping with captures more useful? |
| Sideways bishop | `bishop.purple@4`: bishop plus horizontal slides up to two squares and wide knight jumps | `bishop.purple@6`: remove the two-square limit on the horizontal slides | Does unlimited rank control make it competitive or too strong? |
| Blink rook | `rook.purple@4`: rook movement/captures, quiet jumps within three squares, adjacent diagonal captures | `rook.purple@5`: extend diagonal captures to two clear squares | Can a small capture-range change preserve the relocation identity while reaching the target? |
| Queen companion | `queen.purple@4`: ordinary queen plus a companion that steps in every direction but captures only diagonally | `queen.purple@5`: ordinary queen plus a companion that steps in every direction, capturing only forward or sideways | Which compact support pattern is useful without too much extra power? |

Both new Rank jumps allow **moves and captures**. They develop the pawn as well as adding attacks; making them capture-only could leave development awkward. The knight jump is two files sideways and one rank forward; the camel jump is three files sideways and one rank forward. The ordinary pawn diagonal retains en passant. The extra jumps do not perform en passant. All tested pawns retain mandatory standard Q/R/B/N promotion.

The Blink alternative's two-square diagonal capture needs a clear intermediate square. Its quiet relocation still jumps over blockers. The rook retains ordinary castling rules. Both companions are capturable, nonroyal pieces; their insertion displaces their own d-pawn forward as part of the purchase. The alternative companion cannot capture straight backward or backward diagonally, but may move quietly there.

No already-completed version-12 candidate is retested. The knights, Returning pawn, Knight-capture rook and Amazon stay unchanged. The retired Capture-box rook and parked twin short queens remain outside this campaign.

## Fixed protocol

- Twelve subjects × **40 opening pairs × two colors = 960 games**.
- Ordinary-versus-ordinary and Amazon-versus-Amazon controls: **160 games**.
- Total: **1,120 games**, one repetition per prefix. Each subject gets 80 games against Amazon; subjects do not play each other here.
- Both engines: Skill 20, 100,000 nodes per move, one thread, 32 MB hash. Total-ply limit: 400, including the forced prefix. Seed: 42.

The [roster](amazon-alternatives-roster.json) defines all six groups; the [configuration](amazon-alternatives.json) freezes the complete schedule and one run-wide allocation of thirteen custom piece types. The command verifies that the configuration has not changed before starting, resuming or reporting.

The opening cohort keeps the 30 version-14 prefixes and adds ten short prefixes using ordinary pieces. Every subject sees the same prefixes with both army colors. These related chess positions are **not 40 independently sampled opening families**. The report retains opening-level results so we can inspect sensitivity instead of treating every game as independent evidence.

Controls check physical colors, completion, interruptions and the scoring pipeline. Identical armies commonly produce exactly 50% for A by construction; that score does not calibrate material value or prove the subject designs are balanced.

## Run and review

Use version 15 and a new result directory. On Windows PowerShell:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run balance:alternatives -- --check
npm.cmd run balance:alternatives -- --out balance-results/amazon-alternatives --jobs 2
```

`--check` validates all armies, colors and prefixes with browser rules and the native engine, including movement probes and exact legal moves; it plays no games. Linux/macOS need a compatible native executable through `FAIRY_STOCKFISH_PATH`.

Two independent game workers are the starting default. Each engine retains one search thread and the declared node budget. **q / Ctrl+C** stops immediately, **g** finishes active games, and **p** finishes active color pairs. Keep the whole result directory, including `workers/`, together. The default log prints game starts, results and running points; `--log plies` adds move progress.

```powershell
npm.cmd run balance:alternatives -- --report balance-results/amazon-alternatives
npm.cmd run balance:alternatives -- --resume balance-results/amazon-alternatives
```

Resume preserves the original schedule, matching engine/build and worker count. Keep an older experiment on its original checkout rather than resuming it under changed definitions.

Reports are `alternatives-report.md`, `alternatives-report.json` and `alternatives-scores.csv`. Subject scores use complete color-swapped pairs; truncated games are unscored, not draws. The live terminal tally includes individual finished games, so it can differ from the paired formal report during play. A campaign can finish while still missing scored pairs.

## Make one decision per group

The target remains a **40%–60% game-points score** versus Amazon, with a draw counting half. It measures the added benefit of the purchase within the full army, rather than the entire material value of the upgraded pawn against the entire queen. It is a practical design band, not a confidence interval or proof of equal material.

The alternatives table compares distance from 50% on **shared, completely scored openings only**. This prevents a design that finished easy openings first from gaining an unfair comparison. Incomplete coverage stays provisional. A smaller observed distance is descriptive evidence, not an automatic winner or a significance claim.

After this batch, record **keep, revise or park** once for each group. If both designs sit in the target band, readability, enjoyment and counterplay can decide. If both miss, choose one deliberate revision or park the idea; do not start an indefinite sequence of slightly changed tests. Review opening sensitivity, deployment congestion and interruptions too. More than 5% truncated scheduled games calls for reviewing the protocol before making balance claims. Any changed ability gets a new immutable revision and a separately agreed budget.
