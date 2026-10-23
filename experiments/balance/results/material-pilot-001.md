# Material pilot: control mismatch, close at 320 games

Recorded 2026-10-23 from the exact uploaded [control summary](material-pilot-001.control.summary.json), [control journal](material-pilot-001.control.games.jsonl), [Amazon summary](material-pilot-001.amazon-64.summary.json), [Amazon journal](material-pilot-001.amazon-64.games.jsonl) and [report](material-pilot-001.uploaded-report.md). The [machine audit](material-pilot-001.audit.json) records hashes, checks, curves and evidence limits.

**The control does not calibrate the proposed material scale. Close this pilot at the supplied 320 games; leave the remaining 192 unused.** Completing more Amazon samples would reduce some sampling noise without resolving that methodological problem.

## What the results show

Army A is the favored side before the pawn handicap: the control retains its queen and one rook, while Army B has two rooks and no queen. Amazon Army A upgrades its ordinary queen. The intended sides and starting removals match every recorded FEN; no reversal of the armies was found.

| Pawns removed from Army A | Control A score, 256 games total | Amazon A score, 64 games total |
| --- | ---: | ---: |
| 2 | 100.00% | 81.25% |
| 3 | 97.66% | 75.00% |
| 4 | 89.84% | 71.88% |
| 5 | 82.81% | 34.38% |

The queen-favored control army still scores 82.81% after giving up five pawns. Its 50% crossing lies outside the tested range; the estimator correctly reports **above the nominal 500-cp boundary**, without extrapolating a point. Both layouts show the same 82.81% score at five pawns. All 1,000 conditional bootstrap resamples also remain above range. This is not a shortage of scored control games or a truncation artifact.

Amazon stage 1 has a **4–5 removed-pawn bracket**, interpolated to 4.5833 pawns on this nominal axis. The uploaded report correctly rounds that to about 460 cp. It is a contextual pawn-removal result, **not a calibrated 460-centipawn upgrade value**. There are only four complete opening blocks and no bootstrap band. The right-layout score rises from 68.75% at three pawns removed to 81.25% at four, despite the decreasing pooled curve; the small sample and layout-specific variation remain visible.

## Validation and limits

- All **320 games are completed first attempts**, with 160 complete color pairs, no errors, no truncations and no excluded scored pairs.
- Both summaries regenerate exactly. Every record matches its expected stage, profile, registry, equal Skill 20 and declared 100,000-node / one-thread / 32-MB / 400-ply settings.
- All **34,360 plies** replay correctly: 27,333 control and 7,027 Amazon. Starting armies, forced prefixes, legal moves, SAN, final FEN and terminal outcomes agree; no moves continue after termination.
- The uploaded report's pooled/layout curves, coverage and estimated crossing reproduce. Its arithmetic is consistent with the journals.
- No parent or policy `run.json` manifests were uploaded. Actual executable/source identities, declared worker layout and native reference-table diagnostics remain unverified. Matching journal annotations are not execution attestation.

The control compares material odds across two different missing-piece setups rather than replacing a queen with a rook on the same square. Removing flank pawns changes files, development, king shelter, pawn structure and promotion chances. The familiar queen-minus-rook difference of roughly four pawns is a conventional reference, not an exact law for these positions. These observations do not isolate whether evaluation or starting-position effects caused the mismatch, and do not establish a universal queen-minus-rook value above five pawns.

## Decision and reproduction

Preserve the data and close this pilot without extending its doses, converting the Amazon crossing into a calibrated material claim, or rescaling it until the control equals 400. The experiment has identified that the current method/reference combination is not established for the intended purpose. A later revised method needs a separate question, credible controls and a bounded validation budget before a larger piece survey.

Regenerate the audit from the archived files without engine searches or evidence writes:

```sh
node experiments/balance/results/material-pilot-001.audit.cjs
```

The [helper](material-pilot-001.audit.cjs) optionally accepts a results-directory argument and requires installed project dependencies plus the matching version-16 protocol definitions. The raw uploads retain their original bytes.
