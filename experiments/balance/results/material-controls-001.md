# Ordinary-material controls: bounded offline check

Recorded 2026-10-23. Uses the existing automatic-value
[rook campaign](rook-values-auto-001.md). **No new engine games.** Full
[results](material-controls-001.summary.json) and
[provenance manifest](material-controls-001.manifest.json) preserve the selection,
history fingerprints, sampling, grouping, decoder/rules hashes and fitted models.

## Selection and duplication

The original profile and registry are retained. Check the archived 200-game
journal, then select 40 ordinary and 40 Amazon self-play control records without
material handicaps. Exclude all 120 subject records and the eight-point policy.
Replay all selected records: 13,042 legal plies, 1,402 eligible positions.

The 80 records contain **40 distinct histories**, with every A/B pair repeating
the same physical game. Retain one copy per verified starting-FEN/moves/result/
reason/final-FEN fingerprint: **701 positions, 20 ordinary and 20 Amazon
histories**. The other policy repeats these controls and supplies no additional
histories. Seven related-opening families stay together in holdouts/resampling.

## Ordinary baseline

The ordinary-only fit uses 374 positions from 20 histories, including six drawn
games. It has full rank and converges. Held-out-family Brier error is 0.0874,
versus 0.1820 for a training-only constant baseline. This is predictive evidence
within the cohort, not calibration of exchange prices.

| Feature | Raw coefficient divided by pawn coefficient |
| --- | ---: |
| Knight | 1.84 |
| Bishop | 1.77 |
| Rook | 2.19 |
| Queen | 1.76 |

These are arithmetic diagnostics, not adopted values. The queen falls below the
rook. Material imbalance coverage is sparse: eight ordinary histories have rook
imbalance and ten have queen imbalance. Of 200 whole-family resamples, one lacks
full rank; the conditional ratios remain broad. This cohort does not establish
a useful ordinary-material scale.

The predeclared phase check reweights each history after filtering. Middlegame
samples have **no queen-count imbalance**, so that coefficient is unidentified.
The endgame fit still puts queen below rook. These reuse the same games and are
not independent confirmations; phase fits use no additional bootstrap.

## Amazon bonus and decision

Every retained position has equal Amazon counts. Both Amazons survive or trade
within the filtered material-change sequence. The upgrade bonus has **zero
observed variation**, making the combined design rank deficient. Report its
bonus as unavailable; a zero ridge coefficient is not a zero-value upgrade.
All combined resamples retain that missing information.

**Close this check.** Preserve the adapter and negative result; adopt no prices,
tune no evaluator, and start no follow-up games automatically. These symmetric
controls test the pipeline but do not provide the varied exchanges needed for
this material question. A broader outcome-labelled dataset is a separate source
to inspect, not a reason to extend this cohort or the closed handicap pilot.

Original execution manifests remain unavailable, so matching checksums,
annotations and legal replay do not attest the Windows binary or playing quality.

Reproduce with a new output directory:

```bat
npm.cmd run balance:regression -- --dataset controls --out balance-results/material-controls
```

The command preserves all 80 records in export coverage and fits the 40 distinct
histories. Defaults are 200 resamples and seed 42. The same five output artifacts
as the pilot diagnostic are generated; their checksums are in the manifest.
