# Final focused bishop comparison

Stay on version 16. Keep short-side bishop as the incumbent and compare two
alternatives against unchanged `RfB`, Camel (`NC`) and Amazon (`QN`). This is
one bounded decision batch, not the start of another automatic redesign cycle.

The completed [bishop study](results/bishop-reference-001.report.md) has 1,280
completed games, no errors/truncations/retries, and 156,583 legally replayed
plies. Its direct scores against `RfB` are:

| Bishop | Points score | Conditional 95% range |
| --- | ---: | --- |
| Original horizontal `BsR2sN` | 62.89% | 58.01%–68.75% |
| Short side `BsWsN` | 53.32% | 47.46%–58.98% |
| Forward jump `BsR2fsN` | 44.53% | 38.67%–50.39% |
| Short quiet hop `BsRgmsR` | 47.66% | 42.77%–52.73% |
| Long quiet hop `BsRgmsR0` | 46.29% | 42.19%–52.34% |

Every row has 256 color-paired games. The original is strong against the rook;
the other ranges overlap substantially. Short side's earlier reported Camel
score of 41.02% makes opponent dependence worth checking before choosing it.
Keep direct scores, uncertainty, readability and enjoyment together; material
estimates fitted from these same outcomes are secondary evidence.

## Rules

| Candidate | Stable ID | Movement |
| --- | --- | --- |
| Incumbent short side | `bishop.purple@7` | `BsWsN`: bishop, one-square horizontal steps, wide knight jumps. |
| Long quiet hop | `bishop.purple@12` | `BsRgmsR0`: bishop and unlimited horizontal slides/captures; quiet horizontal hops over one hurdle onto any empty square before the next blocker. |
| Blocked wide knight | `bishop.purple@13` | `BsR2nsN`: bishop and horizontal slides/captures up to two squares; wide knight moves/captures blocked by their first sideways leg. |

For the new bishop, d4–f5 is blocked by a piece of either color on e4, but not
by a piece on f4. All four wide-knight directions work this way, including
backward moves; this is not a forward-only design. The short horizontal slide
still stops at intervening pieces. The user accepted the engine's first-leg
blocking rule. New definitions stay in the headless experiment registry; the
playable picker is unchanged.

## Reuse and maximum budget

Use the original 128 positions, selected family members and both upgrade
colors. Retain 832 relevant completed head-to-head games already available:
320 recovered short-side/Camel/Amazon games and 512 bishop/rook games.

| Stage | New games at most | Purpose |
| --- | ---: | --- |
| Restore historical cells | 192 | Missing 96 short-side/Camel and 96 short-side/Amazon games. |
| Long hop vs Camel/Amazon | 512 | Reuse its 256 existing rook games. |
| Blocked wide knight vs all three references | 768 | Five total new comparison pairs across both alternatives. |
| Maximum new games | **1,472** | No new ordinary controls or repeated existing matchups. |

The standard `balance-results/reference-revisions/games.jsonl` is detected
automatically if present. `--revisions` selects another retained journal.
Recovered completed cells reduce restoration; a single recovered color removes
only that game. Existing truncations remain unscored and are not replaced.
Only a stopped journal with complete lines is accepted as source evidence.

Restoration uses the original ten-type registry and original game IDs. These
are newly played replacement results, not recovered original histories; their
process identities remain separate. The second stage adds the new bishop to
the thirteen-type profile while preserving all twelve existing allocations.
Both use Skill 20, 20,000 nodes/move, one thread, 32 MB hash and 400 plies.
Native values remain automatic except the inherited queen-moving `RB` type's
MG2538/EG2682 queen-equivalent prior in the comparison profile. Standard royal
kings, promotions and rook castling remain in force.

Preflight replays retained sources, checks all starts and move capabilities,
compares archived/native inventories and samples retained static evaluations.
Historical process manifests were not uploaded; legal replay and fresh native
compatibility checks do not independently attest those old processes.

The [validation record](results/bishop-decision-preflight-001.json) covers all
1,472 native/browser starts, 210 movement/role probes, 40 static comparisons,
source replay, actual four-worker interruption/resume and offline reporting.
All 946 unique checks passed; 36 environment-dependent cases were skipped.
No completed new study games were generated in the cloud.

## Reports and stopping

Restoration finishes first. Comparison reports pause at **320 / 640 / 1,280**
new comparison games, plus the completed restoration. With the full restoration
these are cumulative **192 / 512 / 832 / 1,472** new-game barriers.

`decision-report.md` / `.json` show all nine bishop/reference matchups. Scores
use completed color pairs, draws worth half, and 200 shared opening-block
resamples for conditional 95% ranges. Unplayed matchups remain unavailable;
partial partners and truncated games stay explicit. Scores print after each
game, and immutable reports are stored under `reports/` at the barriers.
Per-game tallies cover new games in that stage; checkpoint reports combine
those games with retained results.
No new material fit or large EPD/sample export is needed for this decision.

Choose one bishop after this batch, allowing roughly 40%–60% performance across
the reference basket as a guide. Do not require every cell or interval to land
inside that band. Prefer a readable, enjoyable design over another attempt to
force exactly 50%; then move to the remaining roster.

## Windows commands

```powershell
git -c maintenance.auto=false -c gc.auto=0 pull
npm.cmd run balance:bishop-decision -- --out balance-results/bishop-decision --jobs 4
```

To recover games from a different old folder, add `--revisions PATH` when
starting. Use a fresh output folder. The matching source snapshots are copied
into it, so a later resume does not need the old import folder.

```powershell
npm.cmd run balance:bishop-decision -- --check
npm.cmd run balance:bishop-decision -- --resume balance-results/bishop-decision
npm.cmd run balance:bishop-decision -- --report balance-results/bishop-decision
```

**q / Ctrl+C** saves prefixes and stops immediately; **g** finishes active
games; **p** finishes active pairs, including only a missing partner where its
other color was recovered. A stop never launches the next stage. Resume keeps
the same source, profile, native proof and executable. Offline reports need no
engine. Keep the whole new run folder for resume and raw-data preservation.

The existing four-piece matrix now defaults to the completed bishop report.
After restoration, the new decision report uses the reconstructed raw outcomes;
the archived historical full-report scores remain separate context.
