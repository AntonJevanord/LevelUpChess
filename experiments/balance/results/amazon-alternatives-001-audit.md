# Amazon alternatives: manifest, replay and Blink evaluation audit

Recorded 2026-10-23. This follows the [summary and proposed shortlist](amazon-alternatives-001.md), using the original `run.json` and `games.jsonl`. The [machine audit](amazon-alternatives-001.audit.json) preserves their hashes, identity checks, replay counts, Blink usage, selected examples and source diagnostics.

**The run is valid under its declared rules, but the Blink results contain an evaluation confound. Resolve that before treating the scores alone as evidence for a movement nerf.** This audit starts no games and changes no production rules or engine.

## Identity and replay

- Exact declared configuration, all 1,120 scheduled games, the thirteen-design registry/profile, equal engine strengths and three-worker whole-pair assignments match. All records are unique first attempts.
- The recorded bundled Windows executable hash matches. All twelve normalized runner-source hashes and three parallel-source hashes match revision `a9957a4`.
- The rules bundle's recorded hash matches the repository bundle after converting LF to Windows CRLF line endings. The contents agree; no source discrepancy was found.
- Rebuilding the summary from the journal reproduces the uploaded summary exactly.
- **All 1,120 games / 150,035 plies replay correctly**: declared starting armies, forced openings, every legal move and SAN, final FEN, terminal reason and result. No moves continue after an earlier terminal position.

The single truncation is quiet-jump Vertical as Black in `quiet-e-pawns`, exactly 400 plies. Its final position is nonterminal and has one legal move, `h1h2`; keeping it unscored is correct. The result is still 559 complete pairs / 1,118 paired scored games. Nothing requires replaying the batch or this lone incomplete pair.

The three recorded workers completed in **3h 57m 12.6s**, averaging 37.37 seconds per game. Their timelines show three concurrent games without overlap inside a worker. This demonstrates that three workers worked for this run, not that three is the optimal count on every machine.

Physical White results are now available: ordinary controls **20 wins / 42 draws / 18 losses (51.25%)**, Amazon controls **26 / 44 / 10 (60%)**. Both Army-A scores remain 50% by symmetry. The Blink purchases win on both colors: @4 scores **86.25% as White / 77.50% as Black**; @5 **90% / 88.75%**. A simple White-side advantage does not explain their high scores.

## What the Blink actually did

| Recorded observation | Adjacent-diagonal Blink @4 | Two-square-diagonal Blink @5 |
| --- | ---: | ---: |
| Games / wins / draws / losses | 80 / 64 / 3 / 13 | 80 / 70 / 3 / 7 |
| Radius-three quiet jumps | 189, in 69 games | 201, in 67 games |
| Actual diagonal captures | 29, in 21 games | 38, in 31 games |
| Amazon takes Blink and is immediately recaptured | 42 games; 39 wins | 33 games; 32 wins |
| Blink itself captures Amazon | 16 games | 22 games |
| Blink delivers the mating move | 6 games | 5 games |
| Original Blink survives to the end | 11 games | 13 games |

The original custom rook is tracked through castling; ordinary promoted rooks are excluded. Quiet nonorthogonal jumps or orthogonal jumps crossing blockers are counted separately from ordinary clear rook moves. Radius means the greater file/rank displacement. Collinear blocker counts do not treat knight/camel/zebra jumps as sliding paths.

Many wins involve exchanging Blink for Amazon while retaining the original queen. This is observable behavior, **not proof that the exchange was forced, a blunder, or caused by one evaluation term**. Conversely, an unexecuted diagonal capture can still constrain the opponent. Counts of actual captures alone do not measure the ability's full value.

The games contain useful attacking examples. In one @4 game, Black jumps `a8–d5` through its own b7 pawn and c6 knight, then `d5–g4`, and later plays `g4xg2+` in a recorded mating attack. In a @5 game, `a8–d5` crosses its own queen; `d5xe4` takes a bishop, then Amazon takes Blink and Black's ordinary queen recaptures Amazon. These lines establish actual use, not best-play proofs.

## A representation-dependent engine estimate

The bundled engine uses a fixed classical heuristic for custom material, including a contribution for each quiet jump direction. It does not learn a piece's strength from prior matches. Both Blink encodings contain 44 quiet step directions.

The original parser and `PSQT::init()` from the matching vendored source give the following default material values. **These are internal engine units, not measured chess material or conventional centipawns.** Increments compare each purchase with the ordinary piece it replaces.

| Piece | Middlegame value | Endgame value | Upgrade increment, MG / EG |
| --- | ---: | ---: | ---: |
| Standard rook | 1,276 | 1,380 | — |
| Standard queen | 2,538 | 2,682 | — |
| Amazon `QN` | 3,738 | 3,875 | +1,200 / +1,193 |
| Blink @4 | 3,536 | 4,370 | +2,260 / +2,990 |
| Blink @5 | 4,002 | 4,877 | +2,726 / +3,497 |
| Equivalent duplicate-free @5 notation | 3,591 | 4,430 | +2,315 / +3,050 |

Thus the model already prices Blink's purchase well above the Amazon's incremental value. That is relevant to the many observed trades, but does not by itself quantify any search error or establish the piece's true strength.

There is also a concrete redundancy in @5: `RFmDmNmAmHmCmZmGcB2` contains adjacent diagonal captures through both `F` and `cB2`. `RmFmDmNmAmHmCmZmGcB2` retains the quiet `F` step and removes only those duplicate captures. Its automatic valuation falls **411 middlegame / 447 endgame units**.

As a research-only encoding check, both descriptions were replayed through all eighty existing @5 games: **9,543 positions and 322,013 generated legal moves**. Legal move sets, check status, recorded capture classification, SAN and resulting FENs agree. No alternate search or game was played. The production definition was not edited. This confirms that notation alone can change the material estimate while preserving movement on the recorded positions.

A simple INI point override is incomplete in this upstream version. Source inspection and a static diagnostic show that `pieceValueMg/Eg` changes adjusted evaluation/PSQT tables, while normal static exchange evaluation and capture ordering still read the raw table. Custom-piece exchange selection also uses approximations. Fixing consistency needs an explicit evaluation policy and review of those paths; assigning every level-3 purchase a target value merely to force 50% would not measure balance.

The [small C++ diagnostic](amazon-alternatives-001-evaluation.cpp) calls original parser and valuation functions without search. Its source hashes, reproduction recipe and exact output are in the machine audit. The source archive and production engine are unchanged.

## Next decision

Retain the earlier shortlist as evidence about this frozen engine protocol and combine human playtesting. For Blink, review evaluation consistency before choosing between changing movement and accepting a different price. **Do not automatically rerun the 1,120 games.** No additional experiment budget is declared here.

If human playtesting also finds Blink's relocation excessive, one later candidate is radius-two quiet jumps with adjacent diagonal captures (`RFmDmNmA`), rather than adding more capture power. Its strength is unmeasured. Any canonicalized notation, evaluation change or movement revision needs a new immutable experiment identity and a separately bounded question before further formal games.

## Importable recorded lines

These studies use the existing **Design alternatives** library, with temporary letters remapped by stable design ID. Open the game and use **Import PGN**; undo through the recorded line to inspect its start. Import/export round trips and final positions were verified. They are excerpts, not new balance games or claims of forced best play.

- [Quiet jumps into an attack](amazon-alternatives-001-blink-attack.pgn): source plies 22–36, ending in the recorded checkmate.
- [Relocation followed by an Amazon exchange](amazon-alternatives-001-blink-exchange.pgn): source plies 38–44; `*` marks the excerpt's unfinished game, not a draw.

The manifest and journal identify the recorded executable/settings and permit exact replay. They cannot independently attest process execution or reconstruct every search decision: the journal stores final search-info snapshots rather than a complete search trace. The observed scores and exchange patterns remain protocol-specific evidence.
