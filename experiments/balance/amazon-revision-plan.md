# Version 14: revised purchases against Amazon

Declared on 2026-10-22 after the user closed the earlier level-3 screen early. Its [snapshot audit and decisions](results/level3-screen-001.md) remain separate evidence; the old reserved confirmation is unused. This is one new **540-game** experiment. It does not automatically schedule another redesign or confirmation run.

## Question and candidates

Can seven revised three-point purchases approach a **40%–60% points score** against the unchanged Amazon purchase, `queen.purple@1` (`QN`)? A win earns one point and a draw half a point. The band guides design choices; it is not a confidence interval, an intrinsic material value, or proof of equivalence.

Both sides retain the same underlying ordinary army. Each candidate replaces or supplements its usual starting piece, while the other side upgrades its queen to Amazon. Thus results compare the **added benefit of the purchases**, rather than the whole material value of a pawn against a queen.

| Purchase / new immutable ID | Movement | Intended adjustment |
| --- | --- | --- |
| Ranging pawn, `pawn.purple@7` | `mRceB2` | Keep quiet rook movement; limit diagonal captures to two clear squares. |
| Courier pawn, `pawn.purple@8` | `mfRmsRcfB` | Keep quiet forward/sideways rook lines; extend forward diagonal captures to unlimited clear range. |
| Rank pawn, `pawn.purple@9` | `ifmnDfmWfceFsRfsN` | Keep rank control and ordinary pawn steps; add forward jumps two files sideways and one rank ahead, including captures. |
| Vertical bishop, `bishop.purple@3` | `BfbRmN` | Keep bishop and vertical rook lines; add quiet knight jumps for development and relocation. |
| Sideways bishop, `bishop.purple@4` | `BsR2sN` | The horizontal slides of up to two squares can now capture; keep bishop lines and wide knight jumps. |
| Blink rook, `rook.purple@4` | `RFmDmNmAmHmCmZmG` | Keep quiet relocation and ordinary rook lines; add one-square diagonal captures. |
| Queen and companion, `queen.purple@4` | `FmW`, inserted | Keep the ordinary queen. The capturable companion still steps in every direction, but captures only diagonally. |

These are prototypes selected for testing, rather than pieces already known to hit the target. Pawn promotion remains standard Q/R/B/N. The rook retains ordinary castling rules. The companion remains nonroyal; its insertion and the displaced pawn stack are part of the purchase.

The knights, Knight-capture rook, and Returning pawn remain unchanged and receive no candidate comparison in this run. The Capture-box rook is retired from the current lineup. Twin short queens are parked at level 3; a lower-cost experiment would need a later decision. Earlier definitions remain available for archived evidence.

## Fixed protocol and budget

- Seven candidate-versus-Amazon comparisons: **7 × 30 opening pairs × 2 colors = 420 games**.
- Ordinary-versus-identical-ordinary and Amazon-versus-identical-Amazon controls: **2 × 30 × 2 = 120 games**.
- Total: **540 scheduled games**, one repetition per opening pair. No candidate-versus-candidate matches or unchanged-candidate retests are included.
- Both engines: Skill 20, 100,000 nodes per move, one thread, 32 MB hash. Total-ply limit: 400, including the forced prefix. Schedule seed: 42.

The [configuration](amazon-revision.json) and [roster](amazon-revision-roster.json) freeze all eight custom definitions and one run-wide letter allocation. Worker count affects concurrency, while the declared search effort stays fixed. It is chosen when starting and preserved on resume.

The 30 short prefixes comprise the earlier screening and unused holdout cohorts plus ten additional prefixes. They develop ordinary pieces without forcing the changed pawn/companion starting slots. Every comparison uses the same prefixes with both army colors. These related chess openings are **not 30 independently sampled position families**; distinct move orders can reach related positions. Report sensitivity across openings alongside the overall score.

Controls check scoring, physical colors, completion, and interruptions under the new profile. Their A score can be exactly 50% by construction; that does not establish candidate balance.

## Check, run, resume, and report

Use version 14 and its matching build. From Windows PowerShell in the repository folder:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run balance:amazon -- --check
npm.cmd run balance:amazon -- --out balance-results/amazon-revision --jobs 2
```

The check validates every declared army, color, and opening through browser rules and the native engine, including movement probes and exact legal moves. It plays no games. Linux/macOS need a compatible native executable through `FAIRY_STOCKFISH_PATH`.

Start with two independent game workers. Each engine still uses one search thread; more workers increase CPU and memory use and do not promise proportional speedup. **q / Ctrl+C** stops now, **g** after active games, and **p** after active color pairs. Keep the entire result directory, including `workers/`, together.

```powershell
npm.cmd run balance:amazon -- --report balance-results/amazon-revision
npm.cmd run balance:amazon -- --resume balance-results/amazon-revision
```

Resume keeps the original schedule, engine, rules, and worker count. The wrapper also recognizes a serial run of this exact configuration. Use a new directory for a new experiment; version-12 results keep their original checkout and identities.

Reports are `amazon-report.md`, `amazon-report.json`, and `amazon-scores.csv`. They show paired points, win/draw/loss counts, completed versus planned pairs, opening clusters, interruptions, control colors, and runtime estimates. Unfinished pairs do not score. Truncated games are unscored, not draws. A run can finish all scheduled games while still lacking some scored pairs. The terminal's live tally includes every finished scored game; the formal report waits for complete color pairs.

## Decision after this batch

Inspect the full 30-pair coverage before using a target-band label as the batch result. Scores from an early stop remain provisional. Errors recovered after interruptions stay visible; assess the cause rather than treating those attempts as losses. More than 5% truncated scheduled games calls for reviewing the protocol before making balance claims.

Below 40% suggests a buff or parking decision; above 60% suggests a nerf or parking decision. Inside the band supports retaining a candidate for playtesting. None of these automatically triggers another run. Review opening sensitivity, deployment congestion, readability, enjoyment, and counterplay too. Record **keep, revise, or park** once; preserve these revision IDs and treat any future ability change as a new revision with its own declared budget.
