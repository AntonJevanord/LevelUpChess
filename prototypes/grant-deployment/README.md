# Grant deployment: isolated rule probes

This prototype compares deployment policies with the current Pawn grant
`fWmfF`, Diagonal grant `F` and Warden `WD`. It does not replace any live
profile, choose release prices or collect scored games.

| Variant | Deployment rule |
| --- | --- |
| `grant-rank-two` | Spend a turn dropping on White rank 2 / Black rank 7; checking drops forbidden. |
| `grant-rank-two-mandatory` | Same region, but a legal deployment must be used before another ordinary move. |
| `grant-development-gates` | Optionally insert a grant on an eligible back-rank square during the original piece's first departure. |

Run with the existing Node dependencies and supported native engine:

```powershell
node prototypes/grant-deployment/verify.cjs
```

Windows defaults to `stockfish/fairy-stockfish-levelup_x86-64.exe`. Other
platforms can use `--engine PATH` or `FAIRY_STOCKFISH_PATH`; the verifier also
recognizes the existing Linux engine cache used during development.

The verifier uses a private instance of the installed `ffish-es6` WASM rules
and native perft, with no engine searches. **Twelve fixture cases passed**:
rank/color restrictions, occupied initial ranks, no checking drops, castling,
finite captures, mandatory-drop timing/check evasion, development gating,
forfeited gate rights, checking gates and castling gates. Legal-move inventories
also agree after selected opening, deployment and gate-right transitions.
This checks rules support, not balance or the production browser interface.

## Consequences for design

Second-rank deployment retains the current one-turn cost. Initially the pawns
occupy every available square; a pawn advance opens a slot. The optional
policy still lets a player hold a reserve until much later. The mandatory
policy changes openings: after `1.e4 e5`, a player with only a Warden in hand
must play `D@e2` rather than `Nf3`. If no legal drop can answer a check, ordinary
check evasions remain available.

Development gating is a compound move: `b1c3d` develops the knight and inserts
the Warden on b1 in the same turn. Declining the gate loses that square's right
permanently; returning a piece does not restore it. FEN must preserve the
additional file-letter gate rights, for example `KQBCDFGkqbcdfg` initially.
Castling includes compound alternatives such as `e1g1d` and `h1e1d`.

**`dropChecks = false` does not prevent a checking gate.** Both native and WASM
allow `b1a3d` from `8/8/8/8/8/8/8/1N1k3K[D] w B - 0 1`, where the inserted
Warden checks the black king. Gating has fewer deployment sites but also saves
a deployment turn, so it cannot be assumed to weaken a grant.

Production support would need gate-right validation, compound move selection,
notation, save/PGN/undo and engine-bridge integration. Merely filtering the
current application's legal moves would leave the engine searching a different
game. Existing research rules and results should retain their own identities.
