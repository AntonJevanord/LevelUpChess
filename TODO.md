# Roadmap

Version 08 closes the first design-registry experiment. The main browser board still uses the version-05 rules; experimental selections become playable in version 09. Historical milestones are in [development history](docs/development-history.md).

Browser-save compatibility across releases is optional. Experiment definitions, identities, and results must remain reproducible.

## Version 08 — registry and first balance decision

- [x] Preserve version 07 and branch to `version_08`.
- [x] Add immutable design IDs and revisions, independent of colors and temporary engine letters.
- [x] Allocate letters/custom slots from all declared comparisons, including those excluded by a schedule filter; reserve ordinary pieces and promotions.
- [x] Compile role-aware rules for movement, pawn promotion/en passant, extra units, and rook castling.
- [x] Freeze definitions, allocations, generated rules, and hashes; validate them before resume.
- [x] Verify the existing browser boards and native/browser rule agreement; complete and resume the short workflow smoke.
- [x] Complete the 100-game screen and selected 60-game rook confirmation within the [200-game cap](experiments/balance/revision-plan.md).
- [x] Park `pawn.purple@2`; retain `rook.purple@2` for experimental playtesting, without changing browser defaults or calling it balanced. See the [batch decision](experiments/balance/results/revision-1-rook-confirmation-001.md).
- [x] Archive summaries, replayed confirmation games, audit limits, and a [revision evidence ledger](experiments/balance/results/revision-1-evidence.csv). Close the batch at 160 games; its remaining 40 games are unused.
- [x] Add supported `--comparisons` selection while preserving the full registry and complete color pairs.
- [x] Condense active documentation and move historical checklists/probe details into linked archives.
- [x] Pass all 279 unit/integration checks with two test workers; verify native comparison selection and byte-preserving resume with the short CLI smoke.

## Version 09 — playable design experiments

Implement in this order. Start human playtesting before requiring tight numerical balance or a complete second set.

### 1. Share profile handling

- [ ] Make board display, setup reconstruction, and move labels resolve stable design IDs through the active profile rather than hardcoded letters.
- [ ] Share the catalog and compiled profile rules with the native bridge; validate selections and revision-aware capabilities before engine play.
- [ ] Add a save/export format containing selections, definitions, allocation, and exact rule identity. A release may require fresh games.
- [ ] Verify offline play, engine replies, undo/clocks, round trips, and both-color promotion/en passant/castling for the selected profiles.

### 2. Expose a small development picker

- [ ] Begin with original/revised rook choices and a small set of pawn alternatives; label experimental and parked references explicitly.
- [ ] Keep tier/cost separate from design name, behavior revision, and color. Show a short movement description and useful movement examples.
- [ ] Review green for level 1, red for level 3, and a contrasting level-2 color; keep level numbers and White/Black contrast readable.
- [ ] Consolidate Windows playtesting: setup budgets, mixed armies, special moves, engine play, timed undo, and save/export recovery.
- [ ] Record feedback by design revision: readability, useful choices, enjoyment, counterplay, and frustrating positions. Retire poor ideas before spending balance games on them.

### 3. Test the surviving ideas

- [ ] Keep `queen.purple@1` (Amazon, `QN`) fixed as the reference upgrade for the next design batch. Its estimated 12–13 total material is a contextual prior, not a measured LevelUp value.
- [ ] First compare surviving purple purchases against the Amazon purchase on ordinary armies. All sides retain the same underlying standard material.
- [ ] Use existing legal armies for tier-ratio comparisons. Add explicit shared custom starting setups only when several copies of one family answer a specific pending question.
- [ ] Declare candidates, opponents, opening cohorts, search settings, decision criteria, and a game cap before starting a new batch. Confirmation is reserved for shortlisted designs.
- [ ] Extend evidence aggregation from the curated ledger when repeated batches justify it; distinguish co-occurrence, actual ability use, and individual-effect evidence.

Two to six ideas per family per tier means 36–108 upgraded designs. Keep that as an idea pool and implement selected alternatives gradually. A full second set does not block the first playable picker.

## Deferred work

- [ ] Integrate independent capture-only king choices into the main browser board after royal identity, castling, mating tests, and asymmetric-king evaluation limits are handled. Keep one royal per side.
- [ ] Agree on queen/rook conversion goals and a consistent dead-position policy; guard grants remain an alternative design.
- [ ] Add grouped capacity-bounded registries and custom setup support when a declared experiment needs them.
- [ ] Investigate ordinary/custom representation effects, material handicaps, wider openings, or evaluation overrides only for a concrete decision. Existing templates are optional research.
- [ ] Consider random armies, additional art/themes, and online play after the local design workflow is useful.

The original legacy executable's matching source remains unresolved; the current bundled LevelUp engine has recorded matching-source provenance in [stockfish/README.md](stockfish/README.md).

Keep releases playable, branch from tested milestones, and tag finished releases. Further tests are not an automatic queue.
