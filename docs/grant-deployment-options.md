# Grant deployment: release design options

Keep the existing own-half, turn-spending, nonchecking drops as **research
references**. A release grant is a separately tested package of movement,
purchase cost and deployment rules. The current Warden's 63.61% expanded-roster
score describes its existing package, not a restricted-drop or gated version.

The concern has two parts: where a reserve can appear, and how long its arrival
can be postponed. A smaller drop region addresses location. It does not itself
remove late deployment. Keep the existing board-edge reserve trays prominent;
clear opponent-reserve labels and inspectable deployment zones can help under
any rule set without changing its balance.

## Practical options

| Policy | Predictability | Balance and implementation implications |
| --- | --- | --- |
| **Own second rank** | Eight entry squares: White rank 2, Black rank 7. A pawn must first vacate a square in the normal starting position. | Recommended first trial. Native region setting; retains a separate deployment turn and the no-check rule. A grant can still be held indefinitely. |
| Own first two ranks | Known sixteen-square home zone. | Native setting; offers more activation/defensive choices for weaker grants. Late deployment remains possible. |
| Own back rank | Entry behind the original army. | Native setting; development opens squares, but weak grants may be trapped behind pawns. |
| Fixed entry squares | One or several visible recruitment squares, optionally chosen during setup. | Static regions are native. Player-selected regions need setup/profile integration; a later announced-square waiting mechanic would need extra state. |
| **Seirawan development gating** | A guard enters a vacated, still-eligible starting square as that piece develops. | Native engine support; combines development and deployment in one turn. Needs gate-choice, move/FEN/PGN, castling and save integration. |
| Second rank + mandatory earliest drop | Deployment must occur as soon as a legal drop is available. | Native `mustDrop`; much less timing freedom. Existing forced openings may become illegal and need new declarations. |
| Adjacent to a friendly unit | Reinforcement arrives beside the army. | Native `enclosingDrop = ataxx`; dynamic landing zone, so less predictable than fixed home ranks. |

There is no stock INI option for a deployment deadline, requiring a defended
square, or coupling a grant to a pawn's first move on rank 2. Such rules need
matching engine and browser support. An interface-only restriction would leave
Stockfish searching a different game.

## Recommended first trial: own second rank

```ini
pieceDrops = true
capturesToHand = false
mustDrop = false
dropChecks = false
dropRegionWhite = *2
dropRegionBlack = *7
```

This changes entry squares only. Deployed pieces retain their normal movement
everywhere on the board. Do not use a piece's mobility region to imitate an
entry restriction: it would also constrain the piece after deployment.

For the first-two-ranks alternative, use `*1 *2` and `*7 *8`. Adding
`mustDrop = true` is a separate timing policy: after `e4 e5`, a held guard
would normally have to enter on e2 on White's next turn. It does not turn a
drop into a combined development move.

## Seirawan-style INI example

This standalone example gives each side one nonroyal Warden-like guard. The
normal royal kings and ordinary chess pieces remain present.

```ini
[LevelupGates:chess]
customPiece1 = a:WD
pieceToCharTable = -

gating = true
seirawanGating = true
pieceDrops = false
capturesToHand = false
dropRegionWhite = *1
dropRegionBlack = *8

startFen = rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[Aa] w KQBCDFGkqbcdfg - 0 1
```

In an existing INI, inherit from the desired base variant instead of `chess`
and use an unused custom slot/letter. `[Aa]` holds one guard per side. The
extended FEN rights track still-eligible original squares. For example,
`b1c3a` develops the knight to c3 and inserts A on b1 in the same turn.
Declining that gate loses its right, even if the knight later returns. Losing
the original home piece can also lose its gate.

Castling can gate on a king or rook vacancy. The rook-gating notation is not
ordinary king-coordinate castling: the verified prototype includes `e1g1d`
and `h1e1d` for its D guard. Production adapters must use the engine's legal
move serialization rather than treating every final letter as a promotion.

**`dropChecks = false` does not prevent checking gates.** It applies to
standalone `DROP` moves; gating is encoded within a normal/castling move.
A no-check gating rule would require a matched engine/rules change.

Gating's free deployment tempo may compensate for restricted landing squares.
It is not necessarily a nerf. It also affects guard designs differently:
fWmfF/F can be blocked behind their own pawns, while WD can jump over a pawn
from b1 to b3. Retest every release grant under the selected policy; neither
Warden's old score nor a simple expected score reduction transfers.

Forced ordinary opening prefixes can silently spend gate rights before the
engine gets to choose a deployment. Their moves may remain legal while the
grant loses useful entry points. Begin gating trials from the initial position,
or declare suitable prefixes and report the remaining gate rights. Legality
preflight alone does not establish a fair opening comparison.

## Order of work

1. Compare the feel of optional second-rank drops and development gating.
   Select a common release deployment policy before tuning nine movements.
2. Build a separate experimental playable library and clear reserve/gate
   displays. Preserve existing references and active puzzle runtimes.
3. Validate and balance grant costs 1–6 under that policy, including human
   counterplay, activation and equal-budget engine opponents. Freeze those
   six packages before choosing the three launch grants and their colors.
4. Select the initial three costs, for example **1, 3 and 6**, and validate the
   resulting cross-level launch armies. Earlier king references remain usable
   under their original rules and labels.
5. Develop costs 7–9 later. Changed deployment contexts need new profiles and
   result identities; reuse historical games only after explicit compatibility
   checks. Avoid restarting unaffected studies automatically.

## Verified scope

The isolated [prototype](../prototypes/grant-deployment/README.md) uses the
patched native engine and a private instance of installed ffish-es6 0.7.10.
It checks rank restrictions, finite pockets, turn cost, royal castling, gate
rights and the checking-gate exception. These are functional checks, not
balance games or a playable-site deployment.
The standalone one-guard example above also has exact native/WASM agreement:
24 initial legal moves, with `b1c3a` consuming White's pocket and b1 gate.

Source inspection uses vendored Fairy-Stockfish commit
`43b66c8abfebfcab893a3a4c349aa790d18df148`: `src/variant.cpp` (Seirawan defaults),
`src/movegen.cpp` (gate generation), `src/position.cpp` (rights/no-check/mandatory
drops), `src/position.h` (drop regions) and `src/uci.cpp` (gate notation).
