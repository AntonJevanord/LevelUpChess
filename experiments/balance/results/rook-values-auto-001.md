# Automatic Blink baseline: 200-game audit

Recorded 2026-10-23 from the uploaded [summary](rook-values-auto-001.summary.json) and [game journal](rook-values-auto-001.games.jsonl). Both files retain their original bytes. The [machine audit](rook-values-auto-001.audit.json) records their checksums, checks and limits.

**These are automatic-policy results. They do not yet measure the effect of assigning eight-point values.** Every game omits a manual `evaluation` field and identifies the automatic profile. The separately running eight-point stage supplies the planned comparison; this audit starts no games and changes no rules or campaign sources.

## Results

Each row contains 40 completed games: 20 opening prefixes with both army colors. Point score awards half a point for a draw.

| Blink purchase versus Amazon | Wins / draws / losses | Point score |
| --- | ---: | ---: |
| Quiet Blink, `rook.purple@3` | 15 / 7 / 18 | 46.25% |
| Adjacent-diagonal Blink, `rook.purple@4` | 32 / 4 / 4 | 85.00% |
| Two-square-diagonal Blink, `rook.purple@5` | 34 / 3 / 3 | 88.75% |

Quiet Blink falls inside the working 40%–60% band under this protocol. Both capturing revisions retain large observed advantages. Differences between these designs change movement and automatic valuation together; they cannot identify which explains the scores.

Ordinary and Amazon controls each score 50% for Army A, with respectively **14 / 12 / 14** and **10 / 20 / 10** wins/draws/losses. Physical White scores are **50%** for ordinary controls and **60%** for Amazon controls. Mirrored identical-army controls exercise scoring and completion; their 50% Army-A result does not establish calibrated piece strength.

## Validation and identity limits

- All **200 games are completed first attempts**, with no errors, truncations, duplicates or incomplete pairs. Regenerating the summary from the journal matches exactly.
- All **200 games / 26,693 plies** replay correctly: starting armies, forced prefixes, legal moves, SAN, final FEN and terminal reason/result. No recorded moves continue after a terminal position.
- Every record's declared schedule, design profile, registry, equal Skill 20 and search settings match the automatic policy preserved at `6ba3f73`: 100,000 nodes, one engine thread, 32 MB hash and 400 plies.
- Automatic profile hash: `72dd54f04ae886775e7792a15bba586781394065201c062b1310916b24a32b34`. Registry hash: `95b047eae3621400450d79a00ae47cd42ae49aba8b88482159b3467d5de3465e`.
- The uploaded summary identifies run `ef535a02-cbce-4edb-9423-36e6d1bd596d`; journal records do not contain run IDs. Their regenerated results and expected protocol agree.
- **No `run.json` or parent campaign manifest was supplied.** Actual executable/source hashes, declared worker layout and recorded native value tables remain unverified. The engine name `Fairy-Stockfish 230826` alone cannot prove binary identity. The audit constructs an expected manifest for annotation checks; it does not treat that as uploaded evidence.

Recorded timestamps span 2h 51m 15.71s and show up to four simultaneous games. This describes the journal's timing, not a verified worker declaration or execution attestation.

## Observable exchanges

The original Blink and opposing Amazon are tracked through their recorded moves, including queenside castling. Promoted ordinary rooks are excluded.

| Recorded pattern | Quiet @3 | Adjacent @4 | Long @5 |
| --- | ---: | ---: | ---: |
| Amazon takes Blink and is immediately recaptured | 12 | 18 | 19 |
| Blink itself captures Amazon | 3 | 8 | 7 |

These are observations, not proof that trades were forced, mistaken, or caused by the material estimate. Replay validates recorded behavior; the journal does not contain a complete native search trace.

## Next decision and reproduction

Finish the already declared eight-point stage under the same frozen build, then compare shared fully scored openings and recorded games. Keep both policies separate from version-15 results. This baseline alone neither establishes an eight-point material value nor authorizes a further test chain.

Regenerate the audit from the archived files without searches or modifying evidence:

```sh
node experiments/balance/results/rook-values-auto-001.audit.cjs
```

The [helper](rook-values-auto-001.audit.cjs) also accepts `summary.json games.jsonl` paths. It requires the matching version-16 campaign definitions and installed project dependencies. Fixed related opening prefixes, one opponent and one search budget limit broader conclusions.
