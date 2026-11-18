# Recorded opening evaluations

New runs automatically save the evaluation from their **first normal engine
search after the forced opening**. This uses the search that chooses the first
played move. It adds no engine search, hash reset or per-ply checkpoint write.

## Stored with each game

The authoritative `games.jsonl` record has an `openingEvaluation` object:

- Post-prefix FEN, opening-ply count and actual side to move.
- Structured score in **White's point of view**: positive favors White,
  negative favors Black. Exact cp, bounded cp and mate scores stay distinct.
- Score depth, nodes, elapsed search time and principal variation when supplied.
- Engine hash/name, evaluator strength and requested node/time limit.
- Availability and the attempt on which the observation was captured.

Raw UCI text, when retained, is unchanged; the structured score is normalized
to White. A retry keeps the original observation instead of substituting a
later position's score. If no opening score was stored, that gap stays explicit.

The observation is written with the ordinary completed/error game journal or
clean-cancellation checkpoint. Worker journals contain it during parallel runs;
parent aggregation retains it. A sudden power loss can lose the current game's
in-memory progress, just as before. No extra disk write is added after each ply.

## Automatic report statistics

Version-19 panels and focused trials include an **Opening evaluations** section
in `panel-report.md`, with structured statistics in `panel-report.json`.
Reports refresh at the existing batch boundaries and clean stops. An offline
`--report` rebuild reads stored observations without launching an engine.

Coverage separates exact cp, bounded cp, mate, unavailable, missing and invalid
observations. Latest attempts count once. Engine, rules profile, search budget
and evaluator-strength contexts remain separate.

For each opening, the report pairs a matchup's two physical colors and averages
their exact White-POV scores, then reports the median across those matchup
pairs. This helps inspect a common White/Black tendency while balancing the two
army assignments. Incompatible or missing counterparts do not become pairs;
mate scores and bounds never enter an exact-cp average. JSON also retains
comparison-level and A-color summaries.

These are conditional engine estimates under the declared piece values and
positions. They are not material prices, proof of tactical fairness or a reason
to alter recorded outcomes. Truncated/error games can retain useful opening
observations while remaining unscored in the result statistics.

## Existing runs and preflight

Already-started runs keep their owned runtime. They do not silently switch to
the new recorder, and older journals cannot recover an opening evaluation from
a later `lastInfo` score. Continue those runs with their original resume command.
New output folders use the updated recorder automatically.

The separate [opening diagnostic](opening-diagnostics.md) can re-evaluate old
prefixes with `--evaluate`. That is a fresh search with its own recorded engine
identity and budget; it is not backfilled into the original game evidence.

Preflight still checks opening legality, terminal positions, native/browser
agreement and value tables before play. Reusing the first game search avoids
another preflight evaluation pass. Pins, exposed pieces and fresh before/after
evaluations remain available through the separate diagnostic.
