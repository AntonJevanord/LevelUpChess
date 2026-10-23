# Offline material regression: first pipeline diagnostic

Recorded 2026-10-23. Reuses the [320 archived pilot games](material-pilot-001.md);
**zero new engine games**. The [full result](material-regression-001.summary.json)
contains coverage, coefficients, grouped folds and resampling. The
[manifest](material-regression-001.manifest.json) records input-byte checksums,
replay rules, protocol, decoder/model sources, runtime and generated-data hashes.

## What passed

- Replayed all 34,360 plies and checked legal moves, SAN and terminal outcomes.
- Retained **3,071 positions from 318 games**, including 26 drawn games. Two
  games had no eligible samples; 158 pairs contribute both games and two pairs
  contribute one. Those exclusions remain visible.
- Used stable design IDs, ordinary-family counts plus an Amazon bonus, and
  White-perspective results. Each sampled game has total weight one.
- Sampled from ply 16 every five plies, with unchanged material for the previous
  and following two plies. An odd stride includes both sides to move.
- Seven features plus intercept have full rank (8/8); the fractional-logistic
  fit converges. Synthetic tests also recover known effects and verify draws,
  duplicated-position invariance and grouped uncertainty handling.
- Related prefixes form five declared opening families. Held-out-family Brier
  error is **0.0456**, versus **0.2304** for a constant trained only on each
  training fold. All 200 seeded whole-family resamples converge with full rank
  and positive pawn coefficients.

## What the fit does not establish

Good prediction of these selected games does not establish material prices. As
an arithmetic diagnostic, the raw slopes divided by the pawn slope give queen
**18.85**, rook **8.04**, and queen-minus-rook **10.81**. These differ greatly
from the supplied ordinary-chess regression estimates. They are not adopted as
piece values, a measured Amazon target or native engine parameters.

Amazon bonus variation appears in only 59 sampled games across four families.
The normalized material table is withheld under the disclosed eight-family
reporting rule; that rule is conservative, not a guarantee or a reason to invent
new family labels. The five-family bootstrap describes conditional stability
within this selected cohort. It cannot rule out setup, sampling, model or
playing-policy effects. There is no claim that one of these causes has been
isolated. Original execution manifests remain unavailable.

**Decision:** keep the exporter and diagnostic model. Leave playing values and
the closed pilot unchanged. Before spending another game budget, decide whether
a broader existing dataset or a better matched-position design can address the
ordinary-material sanity check. Adding rows from the same games is insufficient.

## Reproduce

From version 16 with project dependencies installed, use a new output directory:

```bat
npm.cmd run balance:regression -- --out balance-results/material-regression
```

This generates `dataset.json`, `samples.jsonl`, `regression-report.json/.md` and
`analysis-manifest.json`. Defaults are 200 resamples and seed 42. The generated
`regression-report.json` matches the archived summary; dataset/sample checksums
allow verification without committing a second copy of all sample rows. The
archived manifest's original Node/platform fields describe this run; a different
runtime may change floating-point output. No native executable or NNUE is needed.
