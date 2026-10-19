# Individual upgrade effects 001 — game audit

Audited 2026-10-19 after receiving the original `run.json` and `games.jsonl` for [individual-effects results 001](outlier-effects-001.md). The files confirm the expected engine and rules. All **440 games and 56,644 plies** replay legally, with matching final positions, results, and termination reasons. The blue-rook score remains **28.75% (5 wins, 13 draws, 22 losses)**; this audit does not establish its cause.

## Provenance and validation

The recorded executable hash matches the bundled Windows `fairy-stockfish-levelup_x86-64.exe`, built from source commit `43b66c8abfebfcab893a3a4c349aa790d18df148`. The manifest confirms 10,000 nodes per move, Skill 20 for both sides, one thread, 32 MB hash, and the expected configuration, seeded schedule, and runner fingerprints. The rules-bundle byte hash matches a Windows CRLF checkout of the current bundle. All these games use ordinary royal kings, so the separate caveat about evaluating asymmetric upgraded kings does not apply.

Regenerating the summary from the journal reproduces the uploaded aggregate results. There are 440 unique scheduled games, each completed on its first attempt. Every recorded SAN move in the 40 blue-rook games also matches replay.

Public evidence:

- [Provenance](outlier-effects-001.provenance.json): original upload hashes, engine/rules/runner fingerprints, normalized configuration, and audit checks. Personal executable paths and wall-clock timestamps are omitted.
- [Blue-rook games](outlier-effects-001.blue-rook.games.jsonl): all 40 relevant journal records, with only `startedAt` and `finishedAt` removed; the provenance file records this subset's checksum. The other 400 games were audited but are not duplicated here.
- [Per-game CSV](outlier-effects-001.blue-rook-audit.csv): jump counts, original-rook activity, captures, survival, and castling.
- [Selected position reanalysis](outlier-effects-001.reanalysis.json): seven positions with full recorded move prefixes and engine output at the stated node budgets.

## What the blue rook actually did

Tracking follows each original a-rook through movement, castling, and capture; promoted rooks are separate pieces. A confirmed bonus jump is a quiet two-square orthogonal move from a home rank **over an occupied square**. An ordinary rook cannot make that move. Another 19 quiet two-square home-rank moves crossed empty squares and are not counted as evidence of the bonus being needed.

There were **14 confirmed jumps in nine games**, all over friendly pieces. Thus the engine did use the added movement. Those nine games had three draws and six losses, but this small, position-selected subgroup cannot show that jumping caused poor results.

| Original rook measure | Blue a-rook | Opponent's ordinary a-rook |
| --- | ---: | ---: |
| Games with a direct rook move | 38 | 35 |
| Median first direct move, in plies | 39.5 | 39 |
| Direct moves | 236 | 187 |
| Captures made | 58 | 49 |
| Games in which captured | 35 | 35 |
| Games surviving to the end | 5 | 5 |
| Queenside castles involving this rook | 2 | 6 |

First-move medians exclude games without a direct rook move and exclude automatic relocation during castling. These are descriptive counts, not measures of move quality. They provide no simple explanation based on the blue rook always staying idle or being captured more often. Its army castled kingside in another 32 games. The observed queenside castles confirm that the blue rook can participate in castling.

## Concrete game patterns

Game IDs below share the prefix `c16_blue-rook-effect_` and suffix `_r1_w` or `_r1_b`.

| Opening / blue side | Recorded play and follow-up |
| --- | --- |
| `o11_caro-prefix` / White | `14.Qd4 Nb3 15.axb3 Qxa1+` exchanges the unmoved blue rook for a knight. Fresh probes prefer `Qc1` at 10,000 nodes and `Qb1` at 100,000/1,000,000; this was not a free whole-rook loss. |
| `o12_dutch-prefix` / Black | `8...Lc8` jumps the b8 knight, then `9...Lc6` jumps the c7 pawn. After `10...Lxe6`, `13.Bxe6+ dxe6` exchanges the rook for a bishop with pawn compensation. At 100,000/1,000,000 nodes, probes prefer `...d5` to both `...Lc6` and `...Lxe6`. |
| `o5_start` / White | The ordinary bishop's `14.Bxh6` is repeated by fresh 10,000/100,000-node probes; at 1,000,000 nodes the engine chooses `Bd3`. The blue rook is still on a1 at that point and never uses a bonus jump in this game. |
| `o19_queen-french-prefix` / White | Probes still choose `28.Nxd5` at 100,000/1,000,000 nodes; the deeper position score is already unfavorable. Increasing search does not remove every questionable-looking exchange. |
| `o13_modern-prefix` / Black | Five jumps between a8 and c8 over the b8 knight contribute to a threefold draw at ply 24. Bonus movement can also appear in repetitions. |

The probes use an unmodified Linux engine built from the same vendored source, **not the recorded Windows executable**. Each position/budget starts a fresh process with an empty transposition table and the full original move history. The games retained their tables between moves. Even a changed choice at the same budget can therefore reflect platform or search-state differences; these probes are not exact reruns or proof of a causal explanation.

## Decision

There is no replay failure or absent castling ability explaining the result. Some tactical choices are sensitive to further search, while other losses involve ordinary pieces or positions already evaluated poorly. The previously documented ordinary/custom-rook evaluation differences remain a possible contributor, not a demonstrated cause.

The owner's **80-game blue-rook/control check is now complete**, with a **52.5%** blue-rook point score and 50% ordinary control. The [confirmation report](blue-rook-confirmation-001.md) compares the aggregate opening-pair results under the intended 100,000-node protocol; its manifest and game histories have not yet been audited. Keep the current movement while checking search sensitivity in the other selected matchups. Reusing these openings does not add opening independence. An ordinary-movement custom-rook control remains a way to separate representation effects from the added moves; that experiment is not implemented yet.
