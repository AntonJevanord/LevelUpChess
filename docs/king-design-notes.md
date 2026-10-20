# King design notes

Historical probes explain the capture-only prototype's design constraints. Current goals and implementation status live in [DESIGN.md](../DESIGN.md); the playable prototype is documented in [its guide](../prototypes/kings/README.md). These examples establish behavior, not general forced mates or material values.

## Why limit quiet movement?

Broad quiet leaps can defeat familiar mating nets. These positions were checked in both browser rules and the native engine, with Black to move and the chosen movement applied to both kings:

| White material and placement; Black Kh8 | Ordinary king (`K`) | King plus quiet knight jumps (`KmN`) | King plus capture-only orthogonal jumps (`KcD`) |
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

The three definitions across three positions gave nine checks per engine. A single mating position does not establish that the same material can force mate elsewhere.

## Engine constraints

The bundled native engine and browser rules share source revision `43b66c8`. Both support changing the actual king, for example `king = k:KcD`. This applies the same movement to both colors and retains the native ordinary king-safety evaluation.

Twenty early native/browser probes also agreed on independent pseudo-royal movement, captures, safe landings, castling, checkmate, and a nonroyal guard. Independent king levels are now implemented in the [balance rules](../src/balance-rules.js). Unequal levels use pseudo-royal extinction rules and omit native ordinary king-safety evaluation; movement agreement does not remove that search limitation.

Each color's castling-king setting accepts one type. Four independent king levels therefore need up to 16 pair-specific profiles; those may share one INI file. A custom castling-king type is not royal merely because it can castle.

Capturing can escape check if the landing square is safe. Disabling a power while checked, adding cooldowns, or granting a once-only escape requires additional engine support and potentially saved state.

## Draws and conversion

White Kf7 and Ng6 checkmate Black Kh8 under all three upgraded king definitions, although the upstream ordinary insufficient-material heuristic labels that material drawn. The prototype checks geometric mate/stalemate first, automatically draws bare kings in upgraded modes, and keeps other minor-piece endings playable. Repetition and the fifty-move limit remain active. The harness handles bare royals conservatively and documents its separate limitations in [BALANCE.md](../BALANCE.md).

Before selecting a final king progression, decide whether queen-and-king and rook-and-king should reliably convert. Relevant examples include center, edge, and corner positions; safe capture escapes; castling; repetitions; stalemates; and upgraded attacking pieces. These are questions for bounded future tests when needed, not an automatically queued conversion campaign.

## Deferred alternatives

A standard royal plus a capturable nonroyal guard can strengthen the army while preserving an ordinary bare king after the guard is lost. Possible guard targets are 1/2/3 material units, with deployment and congestion assessed separately. This remains an alternative to changing the royal and may be abandoned later.

Extra quiet movement limited to home ranks can still disrupt mating nets because returning home restores the ability. An extra royal requires a separate victory rule. Neither approach is part of the selected capture-only progression.
