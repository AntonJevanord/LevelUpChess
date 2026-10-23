# Blink valuation comparison: close the 400-game question

Recorded 2026-10-23 from the archived [automatic stage](rook-values-auto-001.md)
and [eight-point stage](rook-values-eight-001.md). All 400 games completed:
200 color-swapped pairs, 54,420 legally replayed plies, no errors or truncations.
The [machine comparison](rook-values-comparison-001.json) preserves input hashes,
shared-opening scores and checks. No new games were played for this report.

## Matched results

Each row uses the same 20 opening prefixes, with both colors scored in each
policy: 40 games per design per policy. Point score counts a draw as half a point.

| Blink purchase | Automatic W / D / L | Automatic score | Eight-point W / D / L | Eight-point score | Change |
| --- | ---: | ---: | ---: | ---: | ---: |
| Quiet, `rook.purple@3` | 15 / 7 / 18 | 46.25% | 4 / 4 / 32 | 15.00% | −31.25 pp |
| Adjacent captures, `rook.purple@4` | 32 / 4 / 4 | 85.00% | 28 / 5 / 7 | 76.25% | −8.75 pp |
| Two-square captures, `rook.purple@5` | 34 / 3 / 3 | 88.75% | 32 / 4 / 4 | 85.00% | −3.75 pp |

Quiet Blink scores lower on 13 opening pairs, equally on six and higher on one.
The corresponding counts are 8 / 10 / 2 for adjacent captures and 7 / 9 / 4 for
two-square captures. These fixed, related prefixes give descriptive evidence;
they are not independently sampled positions or a significance guarantee.

All 80 ordinary/Amazon control games have exactly the same move histories and
outcomes across policies. Both Army-A control scores remain 50%; physical White
scores remain 50% ordinary and 60% Amazon. None of the 120 Blink subject histories
is identical across policies. Matching controls support the intended localized
comparison; their symmetry does not establish correct material valuation.

## What changed, and what remains unresolved

The eight-point policy gives all three Blink designs the same declared material
prior, MG2042 / EG2208, while preserving their movement. The recorded matchup is
particularly sensitive for Quiet Blink. Its former 46.25% result is insufficient
to certify the piece as balanced: it falls to 15% under this other assumption.

Both capturing revisions still score well above the working 40%–60% band. Their
high results were not removed by this value setting. At the same declared value,
their scores also differ substantially from Quiet Blink, so capture geometry and
its interaction with search remain relevant. This does not establish intrinsic
strength or prove that any particular capture caused the result.

Both engines share the selected policy in each game. A lower Blink-army score
could reflect changed play by the Blink side, its opponent, or both. This is a
sensitivity comparison, not a contest between two valuation policies controlling
identical armies. It does not identify which policy is more accurate or plays
better. Choosing a value because its Amazon score is closest to 50% would make
the desired balance result the calibration target.

## Observable exchanges

Counts track the original Blink and opposing Amazon through complete paired
histories, including queenside castling. Each entry is automatic → eight-point.

| Pattern | Quiet | Adjacent captures | Two-square captures |
| --- | ---: | ---: | ---: |
| Amazon takes Blink and is immediately recaptured | 12 → 3 | 18 → 12 | 19 → 17 |
| Blink itself captures Amazon | 3 → 4 | 8 → 9 | 7 → 7 |

These patterns changed, especially for Quiet Blink. They do not establish forced
trades, mistakes or the cause of the score differences. Unexecuted threats also
matter; capture counts alone cannot price an ability.

## Decision and next boundary

**Close this 400-game sensitivity question.** Preserve all three prototypes and
their immutable movement IDs. Defer authoritative Blink values, material-strength
claims and movement changes. Neither a universal eight-point assignment nor a
return to automatic values is established as correct by these results.

The proposed Amazon-over-queen material-compensation pilot can use the unchanged
ordinary/Amazon evaluator. No Blink is present in those armies, so resolving its
value is not a prerequisite for that particular anchor. Freeze the reference
evaluation, declare one bounded question and budget, and report a contextual
compensation range rather than a universal number. No pilot is scheduled here.

If choosing Blink search values becomes the next consequential question, one
separately capped identical-army policy duel would test policy performance more
directly. Independent per-engine policies need new runner support. That is a
different question, not an automatic continuation or another value sweep.

## Validation limits and reproduction

Both stage helpers reproduce their summaries and legally replay every recorded
move, SAN, final FEN and terminal result. Journal annotations match the expected
configurations, allocation, profiles and search settings. No policy `run.json` or
parent campaign manifest was supplied; actual executable/source identities,
worker declarations and native diagnostic tables remain unverified. An expected
manifest used for annotation checks is not uploaded execution evidence.

Recheck the stage hashes, regenerated summaries, protocol annotations, matched
opening scores and observed histories without searches or evidence writes:

```sh
node experiments/balance/results/rook-values-comparison-001.cjs
```

The helper also accepts a results-directory argument. Separate stage audit
helpers reproduce the full legal-move replays. See the [balancing strategy](../../../docs/balancing-strategy.md)
for the distinction between purchase cost, engine parameters and measured added benefit.
