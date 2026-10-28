# Version-17 initial screens

All **1,312 games completed**, with no truncated games, errors or missing color partners. The exact six user uploads are archived as deterministic gzip files; the original bytes, names, sizes and SHA-256 hashes are pinned in the audit JSON and loader.

All three uploaded Markdown reports reproduce byte-for-byte from their journals and the declared settings. The configuration, schedule, allocated registry and compiled profile are reconstructed for compatibility checks. **The original run manifests and native preflight proofs were not uploaded.** This audit does not attest to the original engine binary or native evaluation tables, independently replay legal moves, fit material values or calculate Elo.

## level3

| Army | Games | W / D / L | Score | White / Black | Leave-one-opening-out range | Coarse flag |
| --- | ---: | :--- | ---: | :--- | :--- | :--- |
| Rook pawn | 64 | 15 / 12 / 37 | 32.81% | 37.50% / 28.13% | 30.36%–36.61% | coarse-low-outlier |
| Queen pawn | 64 | 32 / 6 / 26 | 54.69% | 51.56% / 57.81% | 50.89%–59.82% | unchanged-follow-up |
| Nightrider | 64 | 26 / 11 / 27 | 49.22% | 40.63% / 57.81% | 46.43%–51.79% | unchanged-follow-up |
| Princess knight | 64 | 33 / 11 / 20 | 60.16% | 59.38% / 60.94% | 58.04%–63.39% | unchanged-follow-up |
| Grid knight | 64 | 30 / 14 / 20 | 57.81% | 60.94% / 54.69% | 55.36%–61.61% | unchanged-follow-up |
| Mating bishop | 64 | 50 / 5 / 9 | 82.03% | 89.06% / 75.00% | 79.46%–83.93% | coarse-high-outlier |
| Vertical bishop | 64 | 48 / 6 / 10 | 79.69% | 84.38% / 75.00% | 76.79%–84.82% | coarse-high-outlier |
| Archbishop | 64 | 33 / 11 / 20 | 60.16% | 51.56% / 68.75% | 57.14%–64.29% | unchanged-follow-up |
| Ranged rook | 64 | 28 / 12 / 24 | 53.13% | 65.63% / 40.63% | 49.11%–55.36% | unchanged-follow-up |
| Side rook | 64 | 40 / 6 / 18 | 67.19% | 73.44% / 60.94% | 64.29%–69.64% | coarse-high-outlier |
| Sideways queen | 64 | 21 / 13 / 30 | 42.97% | 48.44% / 37.50% | 39.29%–45.54% | unchanged-follow-up |
| X-ray queen | 64 | 29 / 16 / 19 | 57.81% | 76.56% / 39.06% | 55.36%–60.71% | unchanged-follow-up |
| Zebra queen | 64 | 17 / 16 / 31 | 39.06% | 37.50% / 40.63% | 36.61%–41.07% | unchanged-follow-up |

These pooled scores weight the four fixed references equally. Direct pawn/grant bundle matchups remain in the source report and audit matrix, but are excluded from this pooled comparison.

## pawn-grants

| Army | Games | W / D / L | Score | White / Black | Leave-one-opening-out range | Coarse flag |
| --- | ---: | :--- | ---: | :--- | :--- | :--- |
| Three Bishop pawns | 64 | 11 / 9 / 44 | 24.22% | 28.13% / 20.31% | 22.32%–26.79% | coarse-low-outlier |
| Three Returning pawns | 64 | 10 / 5 / 49 | 19.53% | 21.88% / 17.19% | 16.07%–22.32% | coarse-low-outlier |
| Three pawn grants | 64 | 24 / 5 / 35 | 41.41% | 51.56% / 31.25% | 38.39%–45.54% | unchanged-follow-up |

These pooled scores weight the four fixed references equally. Direct pawn/grant bundle matchups remain in the source report and audit matrix, but are excluded from this pooled comparison.

## reference-2v2

| Army | Games | W / D / L | Score | White / Black | Leave-one-opening-out range | Coarse flag |
| --- | ---: | :--- | ---: | :--- | :--- | :--- |
| Vanguard + Unicorn | 80 | 31 / 11 / 38 | 45.63% | 56.25% / 35.00% | 42.86%–47.14% | descriptive-team-baseline |
| Vanguard + Cruisader | 80 | 34 / 10 / 36 | 48.75% | 43.75% / 53.75% | 45.71%–51.43% | descriptive-team-baseline |
| Vanguard + Amazon | 80 | 45 / 6 / 29 | 60.00% | 58.75% / 61.25% | 56.43%–62.86% | descriptive-team-baseline |
| Unicorn + Cruisader | 80 | 28 / 15 / 37 | 44.38% | 55.00% / 33.75% | 40.71%–47.86% | descriptive-team-baseline |
| Unicorn + Amazon | 80 | 33 / 15 / 32 | 50.63% | 61.25% / 40.00% | 47.14%–53.57% | descriptive-team-baseline |
| Cruisader + Amazon | 80 | 33 / 15 / 32 | 50.63% | 60.00% / 41.25% | 49.29%–53.57% | descriptive-team-baseline |

Team scores average all five opponents. They describe partnership matchups without identifying individual strength or synergy.

## Interpretation

The Rook pawn, Mating bishop, Vertical bishop and Side rook are the clearest level-three revision signals. Queen pawn and most other designs should retain their movement for the next opening batch. Princess knight and Archbishop are borderline; Zebra queen is near the lower target boundary. Their individual opponent cells contain only 16 games, so apparent matchup differences need replication.

The pawn upgrade bundles score 24.22% and 19.53% against references and need stronger alternatives. Three forward-step guards score 41.41%, so a forward-diagonal guard is an alternate worth testing, rather than a required correction established by this screen.

Eight fixed, related cases provide a coarse screen. Leave-one-opening-out ranges describe sensitivity to those cases; they are not 95% confidence intervals. The retrospective flags use a pooled score below 35% or above 65% with at least three opponent scores beyond 40% or 60% in the same direction. These thresholds were chosen after seeing this screen and are not a preregistered hypothesis test.

Preserve old results by immutable definition. Unchanged candidates can combine these eight cases with eight new cases; revised candidates need a separate identity and all sixteen cases. Do not pool a changed definition with its predecessor or relabel old games under a new profile. Keep the four references fixed and judge pooled performance alongside repeatable opponent differences.

Vanguard–Amazon leads the 2v2 pilot at 60.0%; the other teams range from 44.4% to 50.6%. This is a baseline for later mixed-army work, not sufficient reason to change frozen references or add another whole 2v2 campaign now.

Reproduce the archive audit without an engine:

```powershell
node scripts/balance/v17-screen-evidence.js
```

Use `--write` to regenerate the derived audit JSON and this report. Exact uploaded reports and games remain untouched. No engine searches or new match games are performed.
