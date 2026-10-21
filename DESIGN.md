# Piece design

Current movement rules are documented in [variants/README.md](variants/README.md). This document records design goals, experimental decisions, and ideas that have not been adopted.

## Design goals

Upgrades should be easy to describe, useful to play, and understandable to defend against. Assess tactics, development, endgame conversion, and counterplay separately. A high win rate alone does not make an ability enjoyable.

Costs stay fixed at level 1/2/3. Historical IDs use blue/orange/purple; the experimental picker uses green/cyan/red. Higher tiers should provide greater overall benefit, while distinct abilities support different strategies. They need not retain every earlier move or win every positional comparison. Permanent design IDs identify behavior.

Measure an upgrade's added benefit over its ordinary piece, then compare that benefit across families and purchase combinations. The purple knight's benefit includes its extra `WD` unit; its original knight remains on the board. A royal king has no ordinary exchange value, so its upgrades need winning and mating tests.

## Material estimates and the Amazon reference

Ordinary pawn ≈1, knight/bishop ≈3, rook ≈5, and queen ≈9 are starting references. “Ordinary value + level” is a design target, not a measurement or a guarantee that one upgrade point equals exactly one pawn.

Use the existing Amazon, `queen.purple@1` (`QN`), as the first reference upgrade. An estimated whole-piece value of 12–13 versus an ordinary queen's 9 suggests an added benefit of roughly **3–4**. Blue and orange can target one-third and two-thirds of that benefit. Keep this reference unchanged within a design batch; its estimated material value remains contextual.

The simplest direct comparison uses ordinary starting armies: one receives a candidate purple upgrade, the other receives the Amazon upgrade, and colors swap between paired games. The underlying standard material is identical. This compares upgrade packages without requiring several queens or pretending that a whole pawn and a whole queen have equal value.

Multi-copy benchmarks can later test three blue upgrades against one purple, or three orange against two purple. For example, three orange queens versus two Amazons plus an ordinary queen preserves three underlying queens per side. Such setups change congestion, cooperation, and exchange opportunities; their results apply to those positions. Arbitrary family replacements and custom starting positions still need explicit harness support. No new benchmark campaign is automatically queued.

For short-range, nonroyal leapers, `V ≈ 33N + 0.7N²` centipawns is a rough initial estimate, with `N` the number of destinations away from board edges. Eight destinations gives about 309 centipawns. This is a useful sanity check, not a formula for sliders, promotion, regional powers, or royal safety. Reachability, pawn interactions, and the interaction of capture and quiet moves can substantially change value; component values cannot simply be added.

The engine's movement-based estimates and `pieceValueMg`/`pieceValueEg` overrides affect its judgments. They do not establish inherent piece strength. Ordinary and custom rooks also receive different evaluation treatment; see the [source and game audit](experiments/balance/results/outlier-effects-001.games-audit.md). Keep evaluation tuning separate from movement experiments.

## First revision decision

The [bounded revision plan](experiments/balance/revision-plan.md) spent 160 of at most 200 games. See the [results and decisions](experiments/balance/results/revision-1-rook-confirmation-001.md) for the complete context.

- `pawn.purple@2`, limiting quiet orthogonal slides to two clear squares, is parked after screening. It retained a large advantage against the tested equal-cost armies.
- `rook.purple@2`, ordinary rook movement plus capture-only knight jumps, is retained experimentally. Combined scores are 85% against three blue minor upgrades and 61.25% against blue knight plus orange rook. It is simpler, but these results do not establish balance.
- Other designs remain unchanged. The reference Piece upgrades mode keeps version 05 rules; version 09's Experimental designs mode offers the candidate revisions separately.

The batch is closed. Further tests require a specific design question, chosen revisions, and a declared game cap.

## Version 10 pawn experiments

Each new purchase costs **three upgrade points**, targeting about **four total material points**: the ordinary pawn's one plus roughly three added benefit. These broad ranges are judgments for choosing prototypes, not measurements or statistical intervals. The mobility formula for short-range leapers does not price sliders, promotion races, or extra-piece deployment reliably.

| Purchase | Rough whole-piece/package value | Initial design choice |
| --- | --- | --- |
| Courier, `pawn.purple@3` | 3–5 | Quiet forward and sideways rook lines; captures only on forward diagonals up to two squares. No backward movement. |
| Rank, `pawn.purple@4` | 3–4½ | Horizontal rook moves/captures plus ordinary forward pawn moves/captures and a clear initial double-step. |
| Returning, `pawn.purple@5` | 3–5 | Forward queen lines up to two squares, including captures; backward queen lines up to two squares are quiet-only. No sideways movement. |
| Twins, `pawn.purple@6` | 3–5 combined | Two units, roughly 1½–2½ each, for one purchase. Each has quiet one- or two-square forward jumps and ordinary diagonal forward captures. No initial three-square jump. |

Keeping full bishop captures on the first idea would retain much of the power that survived the earlier quiet-range nerf. Courier therefore limits captures in both direction and distance while preserving its fast promotion route. Rank's proposed forward-wide knight attacks and Returning's proposed sideways moves are held back until playtesting shows a need. Twin forward jumps let the rear pawn escape a stack without giving either unit long-range capture power.

Movement value is only part of each purchase. Twins start on relative ranks 2/3; adding the revised guard knight advances them to ranks 3/4. Those advanced starts add promotion tempo, congestion, and coordination effects. Record deployment with any future comparison; do not treat the ranges above as measured values for every starting position.

The revised guard is `knight.purple@2`: keep the ordinary knight on rank 1, insert `WD` on rank 2, and push only that file's own pawns forward within ranks 2–4. The earlier fixed rank-3 guard keeps its original ID and behavior. Setup is shared by the browser and balance harness, including recovery of starting purchases from saves and PGNs.

All four pawn candidates use standard Q/R/B/N promotion. Quiet Returning moves, and quiet sideways Courier/Rank moves, count toward the fifty-move limit. Returning visits an empty en-passant target quietly; the other candidates can capture en passant along their capture paths. See [exact special rules](variants/README.md#experimental-pawn-special-rules).

Playtest promotion pressure, rank control, retreat loops, readability, and Twin/guard congestion first. Retire uninteresting ideas before declaring another capped comparison against the fixed Amazon and selected equal-cost purchases. No balance campaign has been run for these four candidates.

## Kings: preserve a clear mating objective

Keep exactly one royal per side, with check and checkmate. The selected prototype retains ordinary quiet king moves and adds capture-only two-square jumps:

| Level | Added captures | Definition |
| --- | --- | --- |
| Blue | Sideways | `KcsD` |
| Orange | All orthogonal directions | `KcD` |
| Purple | Orthogonal and diagonal directions | `KcDcA` |

Landing squares must be safe. Captures can escape check, and added attacks change safe spacing between opposing kings. Capture-only movement limits extra escape squares but does not guarantee familiar mating conversions.

The [local prototype](prototypes/kings/README.md) applies one level to both kings. The balance harness already combines independent king levels with other upgrades; main-board setup, engine play, saves, and PGN integration remain future work. Unequal king levels use pseudo-royals and omit the native engine's ordinary king-safety evaluation, so those comparisons remain exploratory. Dynamic schema-2 design profiles currently use ordinary kings only.

Before adopting king designs, settle the intended queen-and-king and rook-and-king conversion goals and a consistent dead-position policy. Verify check handling, safe captures, castling, repetition, and mating examples. A failed engine conversion is not proof that mate is impossible. Historical probes and reproducible FENs are in [king design notes](docs/king-design-notes.md).

A capturable nonroyal guard remains a future alternative, potentially targeting 1/2/3 material units. Broad quiet leaps, extra royals, cooldowns, or powers disabled in check need separate design and engine work; none is currently promised.

## Candidate ideas

These are an idea pool, not implementation commitments or a testing queue. Retain simple descriptions, distinctive uses, and understandable counterplay. Check legality and native/browser agreement before exposing a candidate.

| Upgrade | Possible experiment or question |
| --- | --- |
| Blue pawn | A simpler initial-jump bonus; distinguish promotion speed from middlegame weakness before adding moves. Keep forward-only movement. |
| Orange pawn | Remove quiet diagonal moves for simplicity, or add a repeatable forward quiet jump. Keep forward-only movement. |
| Purple pawn | Limit quiet range, capture range, or backward movement separately. The two-square quiet-range revision is parked, not a measured solution. |
| Blue knight | Compare directional quiet steps with the current orthogonal step. Capturing steps would add checking power. |
| Orange knight | Add forward/backward two-square jumps, or make the sideways jumps quiet-only. |
| Purple knight | Compare the extra `WD` unit with a single replacement knight-plus-`WD`; assess congestion and coordination. |
| Blue bishop | Limit the quiet orthogonal step to forward/backward movement while retaining color switching. |
| Orange bishop | Add backward knight captures, or try quiet knight jumps instead of extra captures. |
| Purple bishop | Limit added vertical slides to one or two squares, or try horizontal slides. Current vertical slides have unlimited range. |
| Blue rook | Change home-region activation or allow quiet two-square jumps elsewhere. Keep ordinary rook movement and castling. |
| Orange rook | Limit added screen captures by direction or range. Keep ordinary captures so open positions remain usable. |
| Purple rook | Playtest the original capture box and retained capture-only-knight revision for readability and counterplay. |
| Blue queen | Restrict regional powers to one jump family or the back rank. |
| Orange queen | Try quiet camel jumps, alone or alongside quiet knight jumps. |
| Purple queen | Keep the Amazon fixed as this batch's reference. Capture-only knight additions remain a later alternative. |

Pawn alternatives must preserve explicit promotion and en passant rules. Rook alternatives need castling and attack checks. King alternatives need royal safety and mating checks. Special abilities deserve clear board feedback as well as correct move generation.

## Playtesting and implementation order

Version 10 uses a frozen 20-design playable library selected from 22 immutable catalog entries. The parked pawn revision and earlier guard placement remain available in version 09 and historical balance profiles. The browser and native bridge share the experiment compiler; games do not reassign letters during play. Save/PGN snapshots require the matching catalog build. Larger selectable libraries and importing retired definitions independently remain later work.

Do not wait for tightly balanced purple pieces before human playtesting. Gather feedback on readability, useful decisions, enjoyment, frustrating situations, and available counterplay. Discard poor ideas before precise tuning. Then screen surviving designs against the fixed reference and selected equal-cost purchases, with a declared game cap and keep/revise/park decision. New releases may require fresh browser games; backward save compatibility is not required.

Two to six alternatives for every family at every tier would mean **36–108 upgraded designs**. Treat that as an eventual idea pool, expanding only when playtesting identifies a useful question. A full second set does not block the first playable picker.

## Experiment identity

Behavior revisions cover movement, captures, regional conditions, placement, promotion, and special roles. A change creates a new revision; cosmetic recoloring does not. Archive definitions, allocations, generated rules, engine identities, and search settings with results. Evidence follows those identities, not temporary letters or a count of engine evaluation calls.

The registry includes all declared comparisons even when a run selects only part of the schedule. Fresh engine processes prevent profile-dependent state from carrying between games; there is no long-term learning associated with a reused letter. Keep completed-pair counts, opening coverage, opponents, and decisions in the evidence record, while retaining earlier revisions separately. See [BALANCE.md](BALANCE.md) for the protocol and [TODO.md](TODO.md) for active work.
