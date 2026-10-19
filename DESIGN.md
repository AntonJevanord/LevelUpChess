# Piece design discussion

Proposals for discussion after version 05. No movement, prices, or victory rules change in this draft. The implemented rules remain in [variants/README.md](variants/README.md).

## What should an upgrade buy?

An upgrade should create a useful choice while leaving the opponent understandable counterplay. Evaluate opening development, tactics, endgame conversion, and ease of understanding separately. More legal moves do not by themselves make a better design.

The current colors are not cumulative. Orange bishops lose blue's quiet color-switching step; orange and purple rooks lose blue's home jumps; the amazon lacks blue queen camel/zebra jumps. Purple knights uniquely buy another unit rather than replace one.

The project owner's direction is fixed: blue costs 1, orange 2, and purple 3; strength should rise with the level. Distinct abilities should support different strategies, and some levels may build directly on earlier abilities. Keeping every earlier move is not required.

Measure strength as the added value over the ordinary piece across representative positions. Higher tiers should justify their extra point overall; they need not win every positional comparison. Also compare value per point across families, so one bargain upgrade does not crowd out all the others. Tune abilities to these prices.

## Material values and upgrade points

Upgrade cost is a fixed setup rule. Material value is an estimate of playing strength. If we want one upgrade point to buy roughly one ordinary pawn's worth of extra strength, the following is a useful **design target**, not a measurement of the current pieces:

| Family | Standard | Blue | Orange | Purple |
| --- | --- | --- | --- | --- |
| Pawn | 1 | 2 | 3 | 4 |
| Knight | 3 | 4 | 5 | 6 |
| Bishop | 3 | 4 | 5 | 6 |
| Rook | 5 | 6 | 7 | 8 |
| Queen | 9 | 10 | 11 | 12 |

These use conventional ordinary-chess values as a starting scale. Those base values are themselves averages and may shift in this variant. A purple knight's target of 6 refers to the retained knight plus its extra piece together; it does not make the extra piece alone worth 6.

The target does not establish actual strength. A quiet deployment move, a new checking attack, unlimited range, and a whole extra unit can have very different effects. Synergy also makes combining abilities different from simply adding their separate values. Crowded and open boards, promotion distance, opposing upgrades, and the chosen king rules all matter.

For kings, keep two separate ideas open: changing the royal itself and granting a nonroyal piece. A guard could target material values of 1, 2, and 3 at the corresponding king levels, but its deployment and protection of the king still need evaluation. The royal itself has no ordinary exchange value: its safety defines the checkmate objective. Its upgrade should be assessed through practical winning and mating prospects. The extra-piece approach remains provisional and may be abandoned later.

We do not yet have measured values or justified error bars. Initially, report broad estimates or ranges rather than precise decimals. Later evidence can narrow the average estimate, but positional differences will remain. More games can reduce sampling uncertainty; they cannot establish a universal value valid in every position. The capture-only king prototype is approved for initial experiments; changing its rules requires a separate run identity.

### Engine estimates are a starting point

In the bundled source, `src/psqt.cpp` estimates custom-piece material from capture and quiet steps, sliding range, and hopper directions, with separate middlegame/endgame weights. This is a movement-based heuristic, not a measured balance result for LevelUp Chess. Its base formula uses ordinary movement tables; initial-region moves are stored separately, so conditional bonuses are not directly counted there, although search can still use them.

The engine supports `pieceValueMg` and `pieceValueEg` overrides. Changing those affects its judgments, not the actual rules or inherent strength of a piece. Centipawn scores use the engine's internal normalization; they do not validate a conventional material chart. No evaluation overrides are proposed yet.

The first individual-effect run exposed a concrete diagnostic concern: blue rook scored below ordinary play despite retaining rook movement and adding quiet home jumps. A temporary build of the bundled source confirmed that custom rooks use generic values and positional treatment, including missing ordinary-rook-specific file terms. Material overrides alone would not restore all those terms. Preserve this distinction between engine handling and movement strength, inspect the games, and compare an ordinary-movement custom rook with both ordinary R and the actual blue rook before drawing causal conclusions. See [the result and source audit](experiments/balance/results/outlier-effects-001.md).

## Kings: preserve a clear mating objective

Keep exactly one royal per side, with check and checkmate. A second royal would require a separate victory design. Broad quiet leaps or slides risk turning material advantages into draws after other pieces are exchanged. A king design must pass the mating requirements before being assigned a tier.

Three directions are worth discussing before assigning king abilities to tiers:

| Direction | Benefit | Concern | Recommendation |
| --- | --- | --- | --- |
| Standard king plus one capturable guard | Strengthens the king's army and protection; after the guard is captured, the defender can be reduced to an ordinary bare king. The guard is not royal. | Adds material, congestion, and another setup square; overlaps with the purple knight's extra-piece mechanic. Queen-versus-king-plus-guard conversion still needs testing. | Safest first prototype if king upgrades may grant an army benefit. Test a small orthogonal-step, diagonal-step, or nonroyal king-moving guard separately. |
| Standard quiet king moves plus a small capture-only leap | Makes the king more active without adding empty-square escape destinations. | Can still capture a piece to escape check, changes royal attack distances, and can spoil mating patterns. | First choice if the upgrade must change the king itself. Start with one directional two-square capture, rather than the full 5×5 capture box. |
| Extra quiet movement limited to the home region | Offers development and defensive repositioning. | An attacked king often starts at home; returning home reactivates regional powers. It can still evade a mating net. | Defer until the first two approaches have been evaluated. |

The project owner is interested in both extra pieces and changes to the royal. Guard grants remain a future alternative; the first prototype explores the royal itself.

The first prototype direction is now selected: capture-only bonuses on the royal. Its concrete progression is blue sideways two-square captures (`KcsD`), orange all orthogonal two-square captures (`KcD`), and purple additional diagonal two-square captures (`KcDcA`). All retain ordinary quiet king moves. The [separate playable prototype](prototypes/kings/README.md) applies the chosen level to both colors; independent levels and the other upgrades remain integration work. Guard grants remain a possible future alternative. This is an experimental progression, not a measured 1/2/3-material increase.

For now, avoid quiet knight moves everywhere, queen-like royal movement, and an extra royal. Compare the capture-only tiers in isolation before committing them to the full game.

Capture-only does not mean “unusable in check.” Every landing square must be safe, but capturing on a safe square can escape check. The added attacks also change safe spacing between opposing kings. A rule such as “the bonus is disabled while checked,” a once-per-game escape, or a cooldown requires separate engine support and, for historical abilities, saved state; it does not follow from a movement string. Those are future possibilities, not current configuration promises.

### What the engine actually supports

The bundled native engine and browser rules share source revision `43b66c8`. Both support modifying the actual royal king, for example `king = k:KcD` for ordinary king moves plus capture-only two-square orthogonal jumps. That definition changes both colors' kings, so it is useful for isolated experiments but does not provide independent setup choices by itself.

Independent royal types can instead use the engine's pseudo-royal extinction rules. Twenty temporary native/browser compatibility probes agreed on movement, captures, safe landings, castling, checkmate, and a nonroyal guard. This would need a new versioned profile and deliberate application changes: exactly one royal per side, king highlighting and validation, castling identities, draw detection, setup, saves, and PGN. Bare pseudo-royals did not automatically produce the ordinary bare-kings draw in the probes.

Each color's castling-king setting accepts one type, not a set. Four independently selected king levels therefore need up to 16 pair-specific profiles to select the correct castling identities; those can share one INI file. Configuring a custom piece as a castling king alone does not make it royal. A normal king plus a nonroyal guard is the simpler per-side implementation.

The capture-only prototype exposed another draw issue even with the actual royal king. White Kf7 and Ng6 checkmate Black Kh8 under all three candidate king rules, although the library's standard insufficient-material heuristic still calls the ending drawn. The prototype checks geometric mate/stalemate first and keeps minor-piece endings playable. It automatically declares a material draw only for bare kings in upgraded profiles, and handles repetition and the fifty-move limit explicitly. This is a conservative prototype policy; full integration needs a deliberate dead-position policy and consistent engine handling. A single mating position does not establish a general forced win.

### A concrete mating check

These three positions were checked in both the browser rules and native engine, with Black to move. The movement definitions apply to both kings in each experiment.

| White material and placement; Black Kh8 | Ordinary king | King + quiet knight jumps | King + capture-only two-square orthogonal jumps |
| --- | --- | --- | --- |
| Ka1, Qd4, Ra8, Ra7 | Mate | Escapes h8–g6 across the rook barriers | Mate |
| Same position, plus Nh6 | Mate | Escapes h8–g6 | Escapes h8×h6 |
| Kf6, Qg7 | Mate | Mate | Mate |

Reproducible FENs:

```text
R6k/R7/8/8/3Q4/8/8/K7 b - - 0 1
R6k/R7/7N/8/3Q4/8/8/K7 b - - 0 1
7k/6Q1/5K2/8/8/8/8/8 b - - 0 1
```

The tested definitions were `K`, `KmN`, and `KcD`: nine positions per engine. These examples explain how mating patterns change. They do not prove general forced mates, theoretical draws, or a balance ranking.

Before choosing a king, decide what material should reliably win. I suggest retaining queen-and-king conversion as a minimum goal and explicitly deciding whether rook-and-king should also remain a standard win. Test varied center, edge, and corner positions, then two rooks, two bishops, bishop-and-knight, and upgraded attacking pieces. Include asymmetric king choices, captures that escape check, repetitions, stalemates, castling safety, and the fifty-move limit. A failed engine conversion needs investigation; it is not a proof that mate is impossible.

## Other pieces: candidates to test

These are hypotheses, not measured strength claims. Keep prices at 1/2/3 and change one ability at a time. “Buff” and “nerf” below describe possible directions; none is a decision.

The latest user playtest impression is that orange/purple rooks and purple pawns are very strong, while blue/orange pawns feel much weaker. Treat that as qualitative evidence to investigate, not numerical material values. The purple bishop currently has unlimited vertical rook slides as well as full bishop diagonals; a range cap below is only an alternative design. Test the current rules before choosing buffs and nerfs.

| Upgrade | Main question | Buff, nerf, or alternate experiment |
| --- | --- | --- |
| Blue pawn | Does its speed translate into enough practical strength for one upgrade point? | Current feedback favors investigating a buff. Preserve forward-only movement; distinguish weak middlegame play from strong promotion races before adding speed or capture reach. An ordinary pawn with an initial jumping bonus remains a simpler alternative. |
| Orange pawn | Are quiet diagonal moves worth their rules complexity? | Simpler alternative: standard pawn movement plus forward captures, removing quiet diagonals. Buff candidate: retain the current package and add blue's repeatable forward two-square quiet leap. Keep it forward-only. |
| Purple pawn | Is a reversible rook-mover/bishop-capturer with promotion still serving a pawn role? | First nerf: cap quiet slides at two squares. Alternatives: limit capture range or remove backward quiet moves. Test open-file promotion races explicitly. |
| Blue knight | Is quiet repositioning sufficiently useful at one point? | Nerf to forward quiet steps; buff to orthogonal captures only if testing shows a need, since that also adds checking power. |
| Orange knight | Are sideways jumps useful often enough to justify the extra cost? | Buff with forward/backward two-square jumps; nerf by making sideways jumps quiet-only. |
| Purple knight | Is an additional independently movable unit appropriate for three points? | Keep the improved `WD` mobility for usability. Compare the extra unit with an alternative that replaces the knight with one combined knight-plus-`WD` piece; measure coordination and congestion as well as material. |
| Blue bishop | Is cheap, quiet color switching stronger than the orange upgrade? | Nerf the orthogonal step to forward/backward only; this still changes square color. Compare sparse endgames with orange. |
| Orange bishop | Does a forward capture-only leap compensate for losing blue's free color switch? | Buff with backward knight captures or blue's quiet step. Alternative: quiet knight jumps for repositioning rather than new captures. |
| Purple bishop | Do unlimited vertical slides make it too close to a major piece? | Nerf vertical range to one or two squares. Alternative: horizontal extra slides, testing the different opening geometry. |
| Blue rook | Is a two-rank, reusable home ability clear and appropriately limited? | Nerf activation to the back rank; buff to quiet two-square jumps anywhere only if it remains appropriate at one point. |
| Orange rook | Are screen attacks too hard to defend against or read? | Nerf added screen captures to forward only or limit their range. Retain ordinary rook captures; replacing them with cannon-only captures could make this weaker than an ordinary rook in open positions. |
| Purple rook | Does the 5×5 capture box overwhelm local defense? | First nerf: remove the two-by-two diagonal jumps. Alternatives: retain only added knight captures or only diagonal capture jumps. |
| Blue queen | Is one point buying too much early deployment and escape mobility? | Nerf to one jump family, or to the back rank. Keep regional mobility as its identity. |
| Orange queen | Are quiet knight jumps worth two points beside the other options? | Buff candidate: add quiet camel jumps. Alternative: replace the knight jumps with quiet camel/zebra jumps for a distinct identity; verify the new profile before adopting it. |
| Purple queen | Does the amazon crowd out other uses of three points? | Nerf candidate: queen plus capture-only knight jumps, retaining new attacks but reducing quiet escape mobility. Keep the amazon as a useful three-point benchmark. |

The highest-priority comparisons are blue versus orange bishop, purple pawn versus other three-point purchases, extra purple knight versus a replacement-only upgrade, and all three queen packages. Orange/purple rook attacks also need clear board feedback; confusion is a usability cost even if their win rates are reasonable.

A simple queen comparison ladder is blue with quiet knight jumps at home, orange with quiet knight jumps anywhere, and purple with full knight moves/captures. This keeps a visible strength progression; the current camel/zebra home jumps and more distinctive alternatives can be measured against it.

Pawn simplicity deserves a separate decision. Orange can quietly enter an en passant target without taking the pawn. Blue's initial triple creates multiple targets, while its repeatable double creates none. These follow the current engine rules, but functionality alone does not establish that they are good teaching rules. Any simplification needs explicit promotion and en passant verification.

## Balance testing

Version 07 implements the initial match protocol in [BALANCE.md](BALANCE.md). The following goals guide the experiments; no engine-match strength conclusions have been established.

1. Freeze version 05 as a comparison baseline when ready; give movement changes a new profile so old saves retain their rules. Keep the agreed level costs at 1/2/3.
2. Start at budgets 3 and 6: compare one purple purchase with three blue purchases and with blue plus orange. Budget 45 allows every eligible piece to be purple and is a useful stress test, not the only balance target.
3. Repeat setups with colors swapped and several openings. Also use crowded middlegames and sparse endgames so jumping, range, and promotion are tested in different conditions.
4. Record wins, draws, conversion failures, promotion speed, king survival, and player confusion. Keep engine build, search settings, clocks, rules, budgets, and starting positions with results. Raw engine evaluations may be poorly calibrated for unusual pieces.
5. Tune movement and other abilities to the fixed level costs. Preserve distinctive, understandable roles; redesign abilities that create poor counterplay or unwanted endgames.

The color/cost direction is agreed, and the capture-only royal progression is approved for initial testing. Guard grants remain a future alternative. The harness combines independent king choices with the other upgrades; browser integration and a final dead-position policy remain separate work. Choose concrete balance changes after reviewing completion rates, opening sensitivity, and engine-evaluation limitations.
