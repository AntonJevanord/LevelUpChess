# Piece design

Current movement rules are documented in [variants/README.md](variants/README.md). This document records design goals, experimental decisions, and ideas that have not been adopted.

## Design goals

Upgrades should be easy to describe, useful to play, and understandable to defend against. Assess tactics, development, endgame conversion, and counterplay separately. A high win rate alone does not make an ability enjoyable.

Costs stay fixed at level 1/2/3. Historical IDs use blue/orange/purple; the experimental picker uses green/cyan/red. Higher tiers should provide greater overall benefit, while distinct abilities support different strategies. They need not retain every earlier move or win every positional comparison. Permanent design IDs identify behavior.

Measure an upgrade's added benefit over its ordinary piece, then compare that benefit across families and purchase combinations. The purple knight's benefit includes its extra `WD` unit; its original knight remains on the board. A royal king has no ordinary exchange value, so its upgrades need winning and mating tests.

The [version-16 balancing strategy](docs/balancing-strategy.md) separates purchase prices, engine material parameters and empirical added benefit. Audit the values used for every active type; override implausible estimates selectively. Assigning every piece its desired base-plus-level strength would put an untested design target into the evaluator.

## Material estimates and the Amazon reference

Ordinary pawn ≈1, knight/bishop ≈3, rook ≈5, and queen ≈9 are starting references. “Ordinary value + level” is a design target, not a measurement or a guarantee that one upgrade point equals exactly one pawn.

Use the existing Amazon, `queen.purple@1` (`QN`), as one reference upgrade. The familiar whole-piece estimate of 12–13 versus an ordinary queen's 9 suggests an added benefit of roughly **3–4**, pending measurement in this game. After evaluation review, estimate that bonus directly from play: compare an Amazon upgrade with an ordinary queen army while varying compensating ordinary material across several layouts. Directly estimating the difference avoids subtracting two separately uncertain total values.

Call the resulting approximate bonus **Δ**. Target added benefit of Δ for level 3, roughly ⅔Δ for level 2 and ⅓Δ for level 1, then check surviving designs against contrasting opponents and human feedback. If Δ were 300 material centipawns, the targets would be +100/+200/+300; that is an illustration, not a measured result. Here 100 material centipawns means one pawn-equivalent on the declared reference scale. Engine evaluation scores and raw MG/EG parameters are separate units. Preserve a range and the tested context; neither the tier ratios nor component values guarantee linear strength.

Keep the Amazon and evaluation policy fixed within each batch. Material bracketing can inform our target without prescribing every piece's engine value or treating a 50% Amazon score as sufficient evidence of balance.

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

Keeping full bishop captures on the first idea would retain much of the power that survived the earlier quiet-range nerf. The initial Courier therefore limited captures in direction and distance while preserving its fast promotion route. Version 14 extends its forward capture range and adds the previously deferred wide forward jumps to Rank. Returning's sideways moves remain deferred. Twin forward jumps let the rear pawn escape a stack without giving either unit long-range capture power.

Movement value is only part of each purchase. Twins start on relative ranks 2/3; adding the revised guard knight advances them to ranks 3/4. Those advanced starts add promotion tempo, congestion, and coordination effects. Record deployment with any future comparison; do not treat the ranges above as measured values for every starting position.

The revised guard is `knight.purple@2`: keep the ordinary knight on rank 1, insert `WD` on rank 2, and push only that file's own pawns forward within ranks 2–4. The earlier fixed rank-3 guard keeps its original ID and behavior. Setup is shared by the browser and balance harness, including recovery of starting purchases from saves and PGNs.

All four pawn candidates use standard Q/R/B/N promotion. Quiet Returning moves, and quiet sideways Courier/Rank moves, count toward the fifty-move limit. Returning visits an empty en-passant target quietly; the other candidates can capture en passant along their capture paths. See [exact special rules](variants/README.md#experimental-pawn-special-rules).

Playtest promotion pressure, rank control, retreat loops, readability, and Twin/guard congestion first. These initial priors predate the [version-12 screening results](experiments/balance/results/level3-screen-001.md). Version 14 revises the outliers and retains Returning unchanged.

## Version 11 mobility and pairs

Version 11 introduced the **Mobility and pairs** library. The table records version-12 prototype prices, including the promoted Camel knight. Prices remain provisional playtest choices. The broad material ranges below describe whole pieces or packages, not measured values, confidence intervals, or upgrade points. The target is ordinary material plus roughly one point per level, with the unchanged Amazon as the level-3 reference.

| Purchase | Cost | Rough whole-piece/package value | Design question |
| --- | --- | --- | --- |
| Twin pawns, `pawn.orange@2` | 2 | 3–5 combined | Does the existing pair feel worthwhile at a lower price? Movement and deployment match the previous Twins; their level-3 ID stays unchanged. |
| Camel knight, `knight.purple@3` | 3 | 5–7 | `NC` adds full (1,3) jumps to the knight. Playtesting supports level 3 for its tactical reach; test it unchanged. |
| Sideways bishop, `bishop.purple@2` | 3 | 5½–7½ | `BmsR2sN`: bishop movement, quiet horizontal slides up to two clear squares, and full wide knight jumps (two files, one rank). Contrasts with the unlimited vertical bishop. |
| Blink rook, `rook.purple@3` | 3 | 7–10 | Rook captures plus quiet jumps to any empty square within three squares horizontally and vertically. Start without diagonal captures; test development, escapes, and rook-ending conversion first. |
| Twin short queens, `queen.purple@2` | 3 | 10–13 combined | `Q2` replaces one queen with two weaker units. Splitting material may improve coverage but exposes two targets and limits long-range conversion. |
| Queen and companion, `queen.purple@3` | 3 | 11½–13 combined | Keep the ordinary queen and grant a capturable `K` companion. Test coordination without giving the royal king additional escapes. |

These ranges are judgments for choosing prototypes. The leaper formula gives about 707 centipawns for 16 unrestricted destinations, but board edges reduce camel mobility substantially. It cannot reliably price quiet-only relocation, sliders, paired units, or their starting deployment. The Camel knight's level-3 target is about six total material points; its actual benefit remains unmeasured.

Blink uses supported quiet leapers (`RmFmDmNmAmHmCmZmG`), crossing blockers within its three-square radius. Ordinary clear rook lines still extend farther. Its quiet jumps add no attacks, so they do not forbid an opposing king's movement or castling through those squares. Version 14 adds adjacent diagonal captures after the screen identified this revision as weak against the Amazon.

Both queen purchases insert an extra unit on d2 for White or d7 for Black, advancing their own pawn stack within their half. Twin short queens also replace the original queen on d1/d8. Queen and companion keeps that original queen ordinary; the companion may move into attack and be captured. Only the ordinary king is royal. This deliberately tests whether a stronger purchase needs every individual unit to be stronger than its predecessor.

Playtest readability, useful moves, frustrating escapes, unit coordination, and counterplay alongside the declared comparison. Record feedback against the exact revision IDs; movement changes do not enter an active batch.

## Version 12 level-3 comparison

Promote the unchanged `NC` Camel knight to level 3 as `knight.purple@3`. Its earlier level-2 ID, `knight.orange@2`, stays immutable for archived games. The screen supports keeping this design unchanged; no diagonal steps are added. If it proves weak, quiet diagonal steps (`NCmF`) would be a smaller first buff than full diagonal moves and captures (`NCF`); either would require a new revision and a later declared test.

The [level-3 campaign](experiments/balance/level3-plan.md) declared a 14-purchase round robin, with the Amazon fixed, 1,860 main-stage games, and at most 140 reserved holdout games. The user closed it early at 1,508 finalized scheduled games; the holdout stage remains unused. See the [summary audit](experiments/balance/results/level3-screen-001.md). Every army starts with the same underlying standard material and receives one three-point purchase. Extra units and pushed pawns remain part of that purchase's benefit. Results describe relative upgrade strength and interactions, rather than assigning each whole piece a material value.

Two simple later alternatives are an **Empress rook** (`RN`, full rook and knight moves, roughly eight whole-piece material points) and a **Crowned bishop** (`BW`, bishop moves plus one-square orthogonal moves/captures, roughly five to six). These are broad priors for possible playtests, not measured values. They do not join this frozen campaign. Prefer one clear design change after the results over testing every possible compound.

## Version 14: Amazon reference revisions

The fuller uploaded summary contains 1,507 completed games and one unscored truncation; two historical attempts failed. The earlier-looking CSV/report describe fewer paired games. Use the [audited summary figures](experiments/balance/results/level3-screen-001.md) for this design pass. The campaign is closed without final rankings or its reserved confirmation stage. The user reports PC blackouts; aggregate timeout records alone cannot establish their cause.

Retire Capture-box rook from the active workshop: its 94.4% score against the Amazon and 87.9% available-opponent mean support the user's concern about its capture coverage. Keep the immutable definition and archived profiles. Park Twin short queens at level 3 after a 19.4% reference score; a lower-price experiment is a later choice. Keep the Camel knight, Knight and guard, Knight-capture rook, and Returning pawn unchanged, with no repeat subject tests. Returning's 64.3% reference score and weaker other matchups favor waiting over a blanket buff.

All seven new purchases cost three points. They are prototypes aiming at **40%–60% point score against the unchanged Amazon**, not certified balanced pieces:

| Purchase | New ID / Betza | Design change |
| --- | --- | --- |
| Ranging pawn | `pawn.purple@7` · `mRceB2` | Nerf captures to two clear diagonal squares. Preserve unrestricted quiet rook movement in every direction. |
| Courier pawn | `pawn.purple@8` · `mfRmsRcfB` | Extend forward diagonal captures to any clear distance. Preserve quiet forward/sideways rook movement and no retreats. |
| Rank pawn | `pawn.purple@9` · `ifmnDfmWfceFsRfsN` | Add moves/captures two files sideways and one rank forward, jumping over blockers. It now attacks four squares on the next rank. Preserve horizontal rook moves/captures and ordinary pawn movement. A wide jump onto an empty en-passant target is quiet and leaves the bypassed pawn. |
| Vertical bishop | `bishop.purple@3` · `BfbRmN` | Add quiet knight jumps to bishop and full vertical rook movement. This improves development without adding knight attacks. |
| Sideways bishop | `bishop.purple@4` · `BsR2sN` | Let its existing two-square horizontal slides capture. Preserve bishop movement and wide knight jumps. |
| Blink rook | `rook.purple@4` · `RFmDmNmAmHmCmZmG` | Add one-square diagonal captures to the existing quiet-jump rook. Longer non-rook captures remain unavailable. |
| Queen and companion | `queen.purple@4` · `FmW`, inserted | Keep the ordinary queen. The companion moves quietly like a king but captures only diagonally, reducing attacks while retaining its mobility. |

The bishop buffs address poor direct Amazon scores despite more competitive results against other purchases. The Courier/Rank changes preserve their distinct promotion-speed and rank-support roles. The Ranging and companion changes reduce the stronger packages. Actual strength, readability, enjoyment, and counterplay still need testing; finite engine play may value unfamiliar pieces imperfectly.

The [Amazon revision plan](experiments/balance/amazon-revision-plan.md) declared **540 games**: seven new subjects against the Amazon plus two controls over 30 color-swapped opening pairs. Version 15 expands the design question into the separate batch below. Preserve the original files and any results with their matching build; do not merge journals or silently change an active experiment.

The target uses wins plus half the draws. It is a practical decision band, not a confidence interval or a material conversion. Related prefixes limit generalization, and a reference-only test cannot expose every rock-paper-scissors matchup. Finish the fixed batch, inspect completion and opening sensitivity, combine human playtesting, then make one keep/revise/park decision per candidate.

## Version 15: paired alternatives

Compare two nearby designs per group against the fixed Amazon before selecting the next playable set. Ranging and Courier already provide two interpretations of a mobile promotion pawn, so they need no additional revisions. Five new immutable IDs bring the batch to 12 subjects:

| Group | Existing option | New alternative |
| --- | --- | --- |
| Mobile pawn | Ranging `pawn.purple@7`: quiet rook lines in all directions, diagonal captures up to two clear squares. | Courier `pawn.purple@8`: quiet forward/sideways rook lines, unlimited forward diagonal captures, no retreats. Both already exist. |
| Rank pawn | `pawn.purple@9`: rank control, ordinary pawn moves, full wide forward knight jumps. | `pawn.purple@10` · `ifmnDfmWfceFsRfsNfsC`: also jump three files sideways and one rank forward, moving or capturing. |
| Vertical bishop | `bishop.purple@3`: bishop plus vertical rook movement and quiet knight jumps. | `bishop.purple@5` · `BfbRfbN`: replace quiet knight jumps with full jumps one file sideways and two ranks forward or backward. |
| Sideways bishop | `bishop.purple@4`: bishop, horizontal rook slides up to two squares, and wide knight jumps. | `bishop.purple@6` · `BsRsN`: remove the horizontal range limit. |
| Blink rook | `rook.purple@4`: rook plus quiet radius-three jumps and adjacent diagonal captures. | `rook.purple@5` · `RFmDmNmAmHmCmZmGcB2`: diagonal captures may extend two clear squares; they cannot jump blockers. |
| Queen and companion | `queen.purple@4`: keep the queen; extra companion moves quietly like a king and captures diagonally. | `queen.purple@5` · `mKcfKcsW`: companion moves quietly in all eight directions but captures only forward or sideways, never backward. |

Rank's added knight and camel jumps are full moves and captures. Attack-only jumps would increase its control while leaving development constrained; full jumps test whether it can become a useful support piece. The camel's three-file reach gives six potential captures on the next rank, including its ordinary pawn diagonals. This is an intentional larger buff to the weakest pawn role, with strength still to be measured. Both versions retain ordinary initial double-step/en-passant rules and mandatory standard promotion. Jumping quietly onto an empty en-passant target leaves the bypassed pawn.

The bishop alternatives test different tactical coverage rather than simply maximizing mobility. The tall-jump vertical bishop gives up quiet wide knight jumps in exchange for four full tall jumps; the long-sideways bishop tests whether unrestricted horizontal lines are too strong. Blink's alternate expands diagonal captures gradually while preserving quiet relocation. It does not regain the retired Capture-box rook's broad capture jumps. Both companions stay nonroyal and retain the same own-file insertion rules.

The [new plan](experiments/balance/amazon-alternatives-plan.md) fixes **1,120 games**: 12 subjects and two controls, each over 40 color-swapped opening pairs. Search remains 100,000 nodes, Skill 20, one engine thread, 32 MB hash, and 400 plies. This is the single next batch within the authorized 1,200-game budget; the unused 80 games do not queue another stage. Retained knights, Returning pawn, and Knight-capture rook stay outside the subject roster.

Use **40%–60% point score** as a practical band, then compare each pair's distance from 50% on the same fully scored opening cohort. A smaller gap suggests which prototype is closer to the target under these conditions; a small difference does not establish a winner. Check completion, opening sensitivity, readability, enjoyment, and counterplay before selecting one, keeping both, or parking a group. Do not automatically buff the lower score or start another balance chain.

The [completed 1,120-game batch](experiments/balance/results/amazon-alternatives-001.md) favors Ranging (48.75%), wide-knight Rank (54.375%), and quiet-jump Vertical (53.85%). Short Sideways (61.25%) and the diagonal companion (38.75%) are close enough to the target boundary to prioritize playtesting over automatic changes. Both Blink revisions overshoot (81.875% / 89.375%); inspect their existing games before choosing a redesign. These are review recommendations; current movement IDs and picker choices remain unchanged. Version 16 isolates the valuation question below.

The [manifest/replay audit](experiments/balance/results/amazon-alternatives-001-audit.md) confirms every recorded move, but finds that the original engine prices Blink upgrades unusually highly and double-counts overlapping capture descriptions in @5. Equivalent notation preserves movement while changing its automatic material estimate. That engine's configuration overrides also miss normal exchange/capture tables; the next experiment fixes override consistency before judging movement.

## Version 16: separate evaluation from movement

Use **eight total material points** as the user's provisional Blink target: ordinary rook ≈5 plus three upgrade levels. This changes the engine's exchange judgment, not the purchase price or the piece's movement, and does not establish a true material value.

| Tested design | Movement held fixed |
| --- | --- |
| Quiet Blink, `rook.purple@3` | Rook captures; quiet jumps within three squares. No added diagonal captures. |
| Adjacent-capture Blink, `rook.purple@4` | Same quiet mobility plus adjacent diagonal captures. |
| Two-square-capture Blink, `rook.purple@5` | Same quiet mobility plus diagonal captures up to two clear squares. |

Keep @5's existing Betza text, including its overlapping capture description, in both policies. Deduplicating notation at the same time would change the automatic-value baseline and confound this comparison. Movement IDs and three-point prices remain unchanged; evaluation policy receives its own frozen identity.

The manual policy scales the engine's ordinary-rook midgame/endgame values **1276/1380 by 8/5**, yielding **2042/2208** after rounding. This is a rook-relative scale, not eight times the raw pawn value: internal values are not a linear map from familiar pawn-equivalent material. Apply the same manual values to all three Blink types in both engines, including how each engine values the opponent's pieces. Ordinary pieces and Amazon keep their defaults.

The [400-game plan](experiments/balance/rook-values-plan.md) compares automatic and manual values on the **same patched engine**, three movements, 20 opening prefixes, colors and search settings. Each policy has 120 subject games plus 80 controls. Launch the automatic 200 games first, then explicitly launch the manual 200; a stop never advances the campaign. Preserve the original version-15 build and results rather than pooling them with this new baseline.

Explicit values must reach raw and adjusted material, static exchange evaluation and capture-order tables before testing. A read-only engine diagnostic verifies actual tables before searches. This fixes the identified override inconsistency; it does not make all fairy-piece evaluation or exchange heuristics exact. Lowering a value can improve or worsen play through different trades and search decisions, so compare scores and recorded games without predicting the direction.

Choose a movement change only after reviewing matched complete-opening scores, control diagnostics and human feedback. The experiment tests sensitivity to a chosen evaluation prior; it does not measure intrinsic material, calibrate engine Elo, or automatically authorize another batch.

The [completed comparison](experiments/balance/results/rook-values-comparison-001.md) gives automatic → eight-point scores of **46.25% → 15%** for Quiet Blink, **85% → 76.25%** for adjacent-capture Blink, and **88.75% → 85%** for long-diagonal Blink. Quiet's result is highly sensitive to the prior; both capture variants retain large observed advantages. All three share the same manual values, so assigned material alone does not explain their different results.

Close the 400-game batch without declaring Quiet Blink balanced, choosing an authoritative value policy or changing movement. Keep the prototypes for human play and the two policies as separate evidence. If selecting Blink search values becomes necessary, compare policies on identical armies under a new bounded question. The proposed Amazon-versus-queen material anchor uses no Blinks and can use unchanged reference evaluation independently of that optional tuning.

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
| Purple rook | Capture-box is retired from the active workshop. Compare the revised Blink with the fixed Amazon; retain Knight-capture unchanged. |
| Blue queen | Restrict regional powers to one jump family or the back rank. |
| Orange queen | Try quiet camel jumps, alone or alongside quiet knight jumps. |
| Purple queen | Keep the Amazon fixed as this batch's reference. Capture-only knight additions remain a later alternative. |

Pawn alternatives must preserve explicit promotion and en passant rules. Rook alternatives need castling and attack checks. King alternatives need royal safety and mating checks. Special abilities deserve clear board feedback as well as correct move generation.

## Playtesting and implementation order

Version 15's **Design alternatives** library exposes all 12 subjects together with the Amazon and selected retained pieces in one 20-type profile. **Rebalance workshop** and **First prototypes (archive)** retain their exact earlier profiles. Historical numeric modes also preserve their rules. Current workshop setup choices omit Capture-box rook and Twin short queens. The browser and native bridge share the experiment compiler; temporary letters remain fixed within a game and saves/PGNs select their matching bundled profile.

Do not wait for tightly balanced purple pieces before human playtesting. Gather feedback on readability, useful decisions, enjoyment, frustrating situations, and available counterplay. Discard poor ideas before precise tuning. Then screen surviving designs against the fixed reference and selected equal-cost purchases, with a declared game cap and keep/revise/park decision. New releases may require fresh browser games; backward save compatibility is not required.

Two to six alternatives for every family at every tier would mean **36–108 upgraded designs**. Treat that as an eventual idea pool, expanding only when playtesting identifies a useful question. A full second set does not block the first playable picker.

## Experiment identity

Behavior revisions cover movement, captures, regional conditions, placement, promotion, and special roles. A change creates a new revision; cosmetic recoloring does not. Archive definitions, allocations, generated rules, engine identities, and search settings with results. Evidence follows those identities, not temporary letters or a count of engine evaluation calls.

The registry includes all declared comparisons even when a run selects only part of the schedule. Fresh engine processes prevent profile-dependent state from carrying between games; there is no long-term learning associated with a reused letter. Keep completed-pair counts, opening coverage, opponents, and decisions in the evidence record, while retaining earlier revisions separately. See [BALANCE.md](BALANCE.md) for the protocol and [TODO.md](TODO.md) for active work.
