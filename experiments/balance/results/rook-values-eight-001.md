# Eight-point Blink policy: 200-game audit

Recorded 2026-10-23 from the uploaded [summary](rook-values-eight-001.summary.json) and [game journal](rook-values-eight-001.games.jsonl). Both retain their original bytes. The [machine audit](rook-values-eight-001.audit.json) records their hashes, checks and limits. This is the second stage of the fixed [400-game plan](../rook-values-plan.md); the [automatic baseline](rook-values-auto-001.md) remains separate evidence.

Every record declares the manual policy for all three Blink revisions: **MG 2042 / EG 2208**, the provisional eight-point total derived from an ordinary rook valued at five. Movement and purchase prices are unchanged. These parameters are evaluation assumptions, not measured material values.

## Results

Each row contains 40 completed games: 20 opening prefixes with both army colors. Point score gives half a point for a draw.

| Blink purchase versus Amazon | Wins / draws / losses | Point score | Automatic baseline | Change |
| --- | ---: | ---: | ---: | ---: |
| Quiet Blink, `rook.purple@3` | 4 / 4 / 32 | 15.00% | 46.25% | −31.25 pp |
| Adjacent-diagonal Blink, `rook.purple@4` | 28 / 5 / 7 | 76.25% | 85.00% | −8.75 pp |
| Two-square-diagonal Blink, `rook.purple@5` | 32 / 4 / 4 | 85.00% | 88.75% | −3.75 pp |

All 20 opening pairs are scored in both policies, so the table uses the same complete cohort. Quiet Blink's result is particularly sensitive to this valuation change; both capturing revisions retain large observed advantages. The comparison does not establish that eight is the correct value, which policy makes an engine stronger, or any piece's intrinsic material strength. Both engines share the same policy within a game.

Ordinary and Amazon controls each score 50% for Army A, with respectively **14 / 12 / 14** and **10 / 20 / 10** wins/draws/losses. Physical White scores are **50%** and **60%**. All 80 control histories and outcomes exactly match their automatic-policy counterparts. Controls exercise the pipeline and unaffected armies; they do not calibrate upgrade values.

## Validation and identity limits

- All **200 games are completed first attempts**, with no errors, truncations, duplicates or incomplete pairs. Regenerating the summary from the journal matches exactly.
- All **200 games / 27,727 plies** replay correctly: starting armies, forced prefixes, legal moves, SAN, final FEN and terminal reason/result. No recorded moves continue after termination.
- Every record's schedule, manual profile, registry, values, equal Skill 20 and search settings match the eight-point policy preserved at `6ba3f73`: 100,000 nodes, one engine thread, 32 MB hash and 400 plies.
- Manual profile hash: `efcb335d7f42158581d90757efb1e9b06e20c5aa9bdbbaaf16e7f3c0eb9cc3c4`. Registry hash: `95b047eae3621400450d79a00ae47cd42ae49aba8b88482159b3467d5de3465e`, shared with the automatic stage.
- The summary identifies run `92ee2fb4-ad70-4242-bff8-22646620a088`; journal records do not contain run IDs. Regenerated results and the expected protocol agree.
- **No `run.json` or parent campaign manifest was supplied.** Actual executable/source hashes, declared worker layout and recorded native value tables remain unverified. Record annotations identify the intended policy; they cannot independently prove that a particular binary applied it. The audit constructs an expected manifest for annotation checks and does not treat it as uploaded evidence.

Recorded timestamps span 29m 20s and show up to four simultaneous games. This describes journal timing, not a verified worker declaration or execution attestation.

## Observable exchanges

The original Blink and opposing Amazon are tracked through recorded moves, including queenside castling. Promoted ordinary rooks are excluded.

| Recorded pattern | Quiet @3 | Adjacent @4 | Long @5 |
| --- | ---: | ---: | ---: |
| Amazon takes Blink and is immediately recaptured | 3 | 12 | 17 |
| Blink itself captures Amazon | 4 | 9 | 7 |

The first pattern occurred in 12 / 18 / 19 automatic-policy games respectively. Its reduction accompanies the score changes but does not establish forced trades, engine mistakes or causation. The journal does not contain the full native search trace.

## Reproduction and stopping point

Regenerate this stage's audit without searches or evidence changes:

```sh
node experiments/balance/results/rook-values-eight-001.audit.cjs
```

The [helper](rook-values-eight-001.audit.cjs) also accepts `summary.json games.jsonl` paths and requires installed project dependencies and the matching version-16 definitions. It checks all declared manual values independently, then replays every recorded move. The supplied summaries and journals complete the fixed 400-game dataset; no further games or movement changes are started by this audit. Review both policies under the [balancing strategy](../../../docs/balancing-strategy.md) before another bounded question is authorized.
