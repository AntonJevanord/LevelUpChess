# Puzzles from experiment games

The first runnable implementation is now the [mate-puzzle pilot](puzzle-generation.md).
It uses the existing native UCI engine for screening and an exhaustive bounded
mate proof instead of adding the upstream Python processor. The sections
below retain the upstream research and ideas for broader future puzzle types.

Use completed game journals as the first source of puzzles. The expanded tier
panels can produce single-upgrade tactics; the later mixed-army study will add
interactions between upgrades. More variant pieces increase that coverage, but
do not by themselves make a position a useful puzzle. Keep puzzle extraction
offline so it does not slow or change the balance runs.

## Upstream fit

The inspected [chess-variant-puzzler](https://github.com/ianfab/chess-variant-puzzler)
revision is [`055e15e`](https://github.com/ianfab/chess-variant-puzzler/tree/055e15e2dc0124e976e0a4a21ad820b0df0fcd5b).
Its [documented pipeline](https://github.com/ianfab/chess-variant-puzzler/blob/055e15e2dc0124e976e0a4a21ad820b0df0fcd5b/README.md#process)
already allows position generation to be skipped when positions come from
existing games:

1. Supply FEN/EPD positions.
2. Analyse them with Fairy-Stockfish and `pyffish` in `puzzler.py`.
3. Filter/deduplicate the results and export EPD or PGN.

The [puzzler](https://github.com/ianfab/chess-variant-puzzler/blob/055e15e2dc0124e976e0a4a21ad820b0df0fcd5b/puzzler.py#L62-L109)
uses MultiPV, normally two lines, to compare the best move with its nearest
alternative. It finds mate, winning, turnaround and defensive positions, and
extends the solution while the test keeps passing. The CLI currently uses a
depth limit, not the panels' fixed node budget. It accepts `VariantPath` as a
UCI option and loads that same file into `pyffish`.

This makes the project suitable as an external analysis stage. It is not yet a
drop-in importer for LevelUpChess. No upstream code or dependencies were
installed or executed during this review. The repository is GPLv3; its listed
Python dependencies are `pyffish`, `tqdm`, `numpy`, `chess` and `cshogi`, without
pinned versions. The README's Python 3.2 claim is older than features used by
the current code, such as `str.removesuffix`.

## Required adapter

Use `games.jsonl` and the corresponding owned `run.json` profile/registry rather
than sending our PGN through upstream `pgn2epd.py`. That converter uses
python-chess's registered variant classes; it does not understand arbitrary
Betza pieces or our archived letter assignments.

The exporter should:

- Verify the source context and replay each selected game under its original
  rules, retaining the original game, attempt and ply identifiers.
- Group positions by exact rules profile and applied engine priors. Export
  the archived INI and a sidecar containing the registry, profile/engine hashes,
  starting FEN and move prefix. A letter such as `a` has no portable meaning
  without that context.
- Skip the forced opening prefix, deduplicate repeated positions within the
  same profile, and sample a bounded number per game. Preserve the complete
  history for final repetition and draw checks; a standalone FEN cannot encode
  threefold repetition.
- Label positions containing upgraded pieces, then distinguish puzzles where
  an upgraded ability actually matters. An upgraded piece appearing somewhere
  on the board is not enough.
- Keep the rules binding and our native engine in agreement on legal moves,
  captures, promotions, castling and reserve drops before analysis.

An expanded panel's combined matrix is not itself a replay format. Mine reused
roster-004 journals under their original profiles and new roster-005 journals
under theirs; the combined standings do not replace those mappings.

Upstream [PGN export](https://github.com/ianfab/chess-variant-puzzler/blob/055e15e2dc0124e976e0a4a21ad820b0df0fcd5b/pgn.py#L9-L39)
capitalizes variant names and does not embed our `LevelUpProfile` snapshot.
Use a profile-preserving puzzle JSON format and our own PGN exporter instead.
The existing balance PGN has profile hashes/references; those references still
need their original run files. The playable PGN's embedded snapshot is the
closer model for a self-contained puzzle export.

## Validation and first implementation

Start with a small mate-puzzle pilot from completed expanded-panel journals.
Use an inexpensive candidate pass, then stronger independent validation of
the shortlisted positions. Retain the original search priors as declared
analysis settings; they are not measured material values. Non-mate material
gain puzzles need particular care while fairy-piece valuation is still being
tested.

The upstream [mate-distance rule](https://github.com/ianfab/chess-variant-puzzler/blob/055e15e2dc0124e976e0a4a21ad820b0df0fcd5b/puzzler.py#L58-L80)
can accept a second mating move if it mates sufficiently more slowly. Decide
whether a puzzle asks for the only winning move or the fastest mate, and reject
or accept alternatives accordingly. A single principal variation is not a
complete defense tree. Replay the solution, test competing first moves and
important legal defenses, and require the answer to remain stable at the
validation budget before human review. Upstream difficulty is a heuristic,
not a calibrated human Elo rating.

Use completed analysis with exact best/alternative scores when checking an
evaluation gap; lower/upper bounds and interrupted searches do not certify a
unique solution. Retain those search details in the puzzle provenance.

Keep this pipeline separate from the balance runner. Our current UCI parser
intentionally retains only MultiPV line one; puzzle analysis needs a dedicated
MultiPV reader or the external upstream processor. The inspected upstream
timeout monitor also busy-waits, and its optional failed-file path calls a
nonexistent `write_file` method. Fix those integration issues in a pinned
processor before an unattended laptop run.

After the pilot, add a puzzle viewer with preserved piece meanings, move
validation and solution explanations. If the game archive lacks a particular
motif, generate additional legal mixed-army games or curated positions as a
separate puzzle dataset. Do not inject extra pieces into an existing balance
game or mix puzzle-generation games into its results.
