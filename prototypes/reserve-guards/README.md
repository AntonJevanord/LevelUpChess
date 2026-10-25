# Finite reserve guards

A king upgrade grants a capturable reserve piece while keeping the ordinary
royal king. The initial board is standard chess. Deployment uses one turn and
an empty square in the owner's half: ranks 1–4 for White, 5–8 for Black.

This rules prototype uses the user's six movement ideas:

| Option | Cost | Letter | Movement |
| --- | ---: | --- | --- |
| Forward guard | 1 | `a` | `fW`: one square forward, moving or capturing. |
| Diagonal guard | 1 | `c` | `F`: one diagonal step; stays on its deployed color complex. |
| Short-rook guard | 2 | `d` | `W2`: one or two orthogonal squares along a clear path. |
| Commoner guard | 2 | `e` | `K`: ordinary king movement, capturable and nonroyal. |
| Leaping guard | 3 | `f` | `KmN`: king movement plus quiet knight jumps. |
| Short-queen guard | 3 | `g` | `K2`: one or two squares along a clear orthogonal or diagonal line. |

These are two alternatives per level, with costs 1/1/2/2/3/3. Their strength is
unmeasured. Extra-unit coordination, trade and sacrifice options, placement,
the deployment turn and reserve defense contribute to effective value. Their
importance changes as material is exchanged. `W2` and `K2` cannot jump blockers.
`fW` does not automatically inherit pawn promotion or en passant.

## Rules

The [variant file](variants.ini) inherits ordinary chess and sets:

```ini
twoBoards = false
pieceDrops = true
capturesToHand = false
mustDrop = false
dropChecks = true
dropRegionWhite = *1 *2 *3 *4
dropRegionBlack = *5 *6 *7 *8
```

The pocket is the bracketed part of the FEN. `twoBoards` is unnecessary for this
finite reserve; enabling it introduces bughouse assumptions about incoming
pieces, including virtual drops during search. Captured pieces disappear
permanently. A deployed guard cannot return to reserve.

Only the ordinary king is royal and can castle. A drop must resolve any check
on that king. It can interpose against a sliding check, but cannot capture an
occupied square or ignore check. Nonroyal guards may land on attacked squares.
The default permits checking and mating drops. The optional
`reserve-guards-no-check` profile forbids checks on the deployment move only.

Reserves are available from move one. A forced opening prefix can leave them
undeployed until its last move; ordinary engine play can deploy them earlier.
Existing book moves must still be checked under the chosen reserve profile.

Drops reset the fifty-move counter. Pocket material prevents an automatic
insufficient-material draw. Custom pieces on the board are treated
conservatively by the engine's material heuristic, so some genuinely dead
positions may continue until repetition or the fifty-move rule. This remains
an adjudication question for integration.

## Positions and verification

The demonstration starts with `[FGacde]`: White holds two level-3 guards and
Black holds four guards costing 1 + 1 + 2 + 2. Both spend six upgrade points;
equal cost is a design assumption, not a measured strength result. For one
matching purchase per side, use pockets such as `[Aa]`, `[Ff]` or `[Gg]`.

```sh
node prototypes/reserve-guards/verify.cjs
```

The opt-in verifier uses the pinned WebAssembly rules and, when available, the
compatible native engine. `FAIRY_STOCKFISH_PATH` can select that executable.
It checks drop legality, movement, royal safety, castling, capture, pockets,
serialization, undo and bounded engine replies. These are functional checks;
they do not collect balance results or modify existing experiment files. The
[recorded functional proof](validation.json) contains 56 mirrored browser
fixtures, 18 state checks, 58 native comparisons and six bounded searches.

## Integration order

1. Review deployment rules and playtest the six options in an isolated board.
2. Add reserve selection and highlighting, drop notation/history, save/PGN
   state and engine requests using frozen reserve profiles.
3. Extend registry grants and logs to retain pocket/on-board state, deployment
   timing and the new rules identity. Pocket-aware material estimates are an
   optional secondary diagnostic, not a gate for head-to-head collection.
4. Balance the nonroyal roster first. Then compare reserve purchases against
   that fixed, varied equal-cost roster in a capped head-to-head campaign.
   Freeze drop rules before collection; a changed policy is a separate rules
   context. Primary evidence is paired game score, uncertainty and opponent
   dependence, supplemented by trade/endgame, deployment and sacrifice patterns.

Material estimates may help interpret those games, but a linear coefficient
does not fully describe coordination or how an extra unit changes exchanges.
Do not tune native values to force a target score. Once individual grants are
understood, mixed six-point armies can assess combinations. The same reserve
mechanism remains available for other families if selected later.

The main board and current bishop/rook experiment retain their existing rules.
Their move parsers and material extractor currently accept board moves/FENs;
reserve support requires a new integration rather than changes to an active
run's frozen sources. The capture-only royal prototype remains archived
separately in [the kings directory](../kings/README.md).
