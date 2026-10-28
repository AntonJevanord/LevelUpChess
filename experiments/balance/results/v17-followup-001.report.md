# Version-17 results across sixteen starting cases

Every row below contains **128 games**: 16 fixed starting cases × both colors × four reference opponents. Scores count a draw as half a point. The nine unchanged pieces combine the original eight cases with eight new cases; all five revised pieces already played all sixteen. No revised result is pooled with its predecessor.

## Level-three replacements

| Candidate | Vanguard | Unicorn | Cruisader | Amazon | Overall score | W / D / L | Games |
| --- | ---: | ---: | ---: | ---: | ---: | :--- | ---: |
| Queen pawn | 54.69% | 54.69% | 62.50% | 62.50% | 58.59% | 69 / 12 / 47 | 128 |
| Nightrider | 53.13% | 53.13% | 48.44% | 37.50% | 48.05% | 53 / 17 / 58 | 128 |
| Princess knight | 68.75% | 60.94% | 42.19% | 62.50% | 58.59% | 63 / 24 / 41 | 128 |
| Grid knight | 67.19% | 42.19% | 51.56% | 57.81% | 54.69% | 57 / 26 / 45 | 128 |
| Archbishop | 57.81% | 62.50% | 57.81% | 78.13% | 64.06% | 72 / 20 / 36 | 128 |
| Ranged rook | 46.88% | 60.94% | 56.25% | 75.00% | 59.77% | 63 / 27 / 38 | 128 |
| Sideways queen | 28.13% | 54.69% | 45.31% | 42.19% | 42.58% | 41 / 27 / 60 | 128 |
| X-ray queen | 67.19% | 54.69% | 46.88% | 57.81% | 56.64% | 59 / 27 / 42 | 128 |
| Zebra queen | 40.63% | 40.63% | 35.94% | 51.56% | 42.19% | 38 / 32 / 58 | 128 |
| Rook pawn: backward captures | 48.44% | 50.00% | 46.88% | 39.06% | 46.09% | 46 / 26 / 56 | 128 |
| Rook pawn: long forward captures | 40.63% | 59.38% | 37.50% | 37.50% | 43.75% | 46 / 20 / 62 | 128 |
| Mating bishop: short capture set | 45.31% | 60.94% | 46.88% | 73.44% | 56.64% | 63 / 19 / 46 | 128 |
| Vertical bishop: no zebra | 34.38% | 54.69% | 46.88% | 56.25% | 48.05% | 52 / 19 / 57 | 128 |
| Side rook: quiet camel | 62.50% | 50.00% | 39.06% | 64.06% | 53.91% | 57 / 24 / 47 | 128 |

The four reference columns each contain 32 games per row. Overall score weights all references and cases equally; it is not the percentage of decisive games won.

## Original and new opening cohorts

| Candidate | Original eight | New eight | All sixteen |
| --- | ---: | ---: | ---: |
| Queen pawn | 54.69% | 62.50% | 58.59% |
| Nightrider | 49.22% | 46.88% | 48.05% |
| Princess knight | 60.16% | 57.03% | 58.59% |
| Grid knight | 57.81% | 51.56% | 54.69% |
| Archbishop | 60.16% | 67.97% | 64.06% |
| Ranged rook | 53.13% | 66.41% | 59.77% |
| Sideways queen | 42.97% | 42.19% | 42.58% |
| X-ray queen | 57.81% | 55.47% | 56.64% |
| Zebra queen | 39.06% | 45.31% | 42.19% |
| Rook pawn: backward captures | 46.09% | 46.09% | 46.09% |
| Rook pawn: long forward captures | 42.97% | 44.53% | 43.75% |
| Mating bishop: short capture set | 56.25% | 57.03% | 56.64% |
| Vertical bishop: no zebra | 49.22% | 46.88% | 48.05% |
| Side rook: quiet camel | 55.47% | 52.34% | 53.91% |

Each cohort contains 64 games per row. These are the same definition in both cohorts, including the revised pieces; predecessor results are excluded.

## Level-one pawn and grant bundles

Each row buys three one-point upgrades. Pawn upgrades use c2/d2/e2; the guard bundle starts with three finite reserves. Drop rules and ordinary royal kings stay unchanged.

| Candidate | Vanguard | Unicorn | Cruisader | Amazon | Overall score | W / D / L | Games |
| --- | ---: | ---: | ---: | ---: | ---: | :--- | ---: |
| Three quiet-diagonal pawns | 17.19% | 35.94% | 25.00% | 20.31% | 24.61% | 27 / 9 / 92 | 128 |
| Three two-step pawns | 46.88% | 53.13% | 42.19% | 59.38% | 50.39% | 55 / 19 / 54 | 128 |
| Three diagonal pawn grants | 68.75% | 60.94% | 54.69% | 67.19% | 62.89% | 67 / 27 / 34 | 128 |

## Design implications

- Rook pawn with backward two-square captures scores 46.09%; the unlimited forward-capture alternative scores 43.75%. Both meet the provisional panel target; this small score difference does not establish a superior design. Movement identity and human playtesting can decide between them.
- Mating bishop averages 56.64%, but scores 73.44% against Amazon (65.63% on the original cases; 81.25% on the new cases). That repeated matchup merits a design review; outcomes alone do not establish a forced queen trade or its frequency.
- Archbishop scores 64.06% overall and 78.13% against Amazon. Ranged rook scores 59.77% overall and 75.00% against Amazon. These deserve the same matchup-focused review before declaring the roster balanced.
- Quiet-diagonal pawns remain weak at 24.61%; two-step pawns score 50.39%. Parking the weak line avoids repeatedly buffing a design when a readable alternative already meets the target.
- Diagonal grants score 62.89%. This is above the provisional 40–60% panel target, while not proving that a particular alternative will be weaker or more fun.

## Evidence and limits

All 1,600 newly uploaded games completed, with no errors, truncations or missing color partners. The six exact uploads are preserved as deterministic gzip archives with pinned compressed/original SHA-256 hashes and byte counts. All three uploaded reports reproduce from their journals using the previous renderer layout. An additional 576 archived games are reused only for unchanged designs.

Original run manifests and native preflight proofs were not uploaded. Configurations, schedules, registries and profiles are reconstructed to check recorded context; they do not certify original engine binaries or value tables. This audit does not independently replay moves or certify terminal positions. Sixteen fixed, related opening cases remain a descriptive screen, not a population confidence interval, a material-value estimate or Elo.

Reproduce this report, its compact audit JSON and matrix CSV offline:

```powershell
node scripts/balance/v17-followup-evidence.js
```

Use `--write` to regenerate derived outputs. Source uploads are unchanged and no engine searches or match games are started.
