# Mixed references and W2/WD evidence

All 1,824 scheduled games finalized on attempt 1: 1,822 completed and two reached the 400-total-ply cap. There were no errors or retries. The two completed partners of truncations remain excluded: 1,820 games form 910 scored color pairs. The original uploaded report reproduces byte-for-byte.

## Three-point grants

| Grant | First six | Second six | All twelve | W / D / L | White | Black |
| --- | ---: | ---: | ---: | :--- | ---: | ---: |
| W2 grant | 63.54% | 69.79% | 66.67% | 56 / 16 / 24 | 67.71% | 65.63% |
| WD grant | 53.13% | 57.29% | 55.21% | 43 / 20 / 33 | 60.42% | 50.00% |

WD minus W2 is **-11.46 percentage points**, with a conditional matched-opening 95% range of **-22.92 to 1.04 points**. Twelve whole opening blocks retain both colors and equally weight all four reference opponents; 2 cases favor WD, 8 favor W2 and 2 tie. The range crosses zero and does not establish that W2 is intrinsically stronger.

| Reference | W2 score | WD score | WD minus W2 (pp) |
| --- | ---: | ---: | ---: |
| Vanguard | 68.75% | 52.08% | -16.67 |
| Unicorn | 68.75% | 50.00% | -18.75 |
| Cruisader | 64.58% | 70.83% | 6.25 |
| Amazon | 64.58% | 47.92% | -16.67 |

WD scores better against Cruisader and worse against the other three references. Its extra jumps add deployed mobility, while the nonchecking-drop rule can remove deployment squares allowed to W2. Both grants retain applied MG/EG 563/635; WD automatic values are 773/866. This controls an input without proving optimal search valuation. These observations do not isolate why their game scores differ.

## Mixed partners

| Three-point team | First six | Second six | All twelve | W / D / L | White | Black |
| --- | ---: | ---: | ---: | :--- | ---: | ---: |
| Two-step pawn + Forward Knight pawn | 57.81% | 64.06% | 60.94% (12/12) | 106 / 22 / 64 | 66.15% | 55.73% |
| Two-step pawn + Rank pawn | 39.58% | 50.00% | 44.79% (12/12) | 71 / 30 / 91 | 48.96% | 40.63% |
| Two-step pawn + Diagonal grant | 53.13% | 53.75% | 53.41% (11/12) | 78 / 32 / 66 | 56.25% | 50.57% |
| King-step pawn + Forward Knight pawn | 72.40% | 68.23% | 70.31% (12/12) | 119 / 32 / 41 | 71.88% | 68.75% |
| King-step pawn + Rank pawn | 47.92% | 54.69% | 51.30% (12/12) | 87 / 23 / 82 | 58.85% | 43.75% |
| King-step pawn + Diagonal grant | 54.17% | 55.21% | 54.69% (12/12) | 88 / 34 / 70 | 63.02% | 46.35% |
| Pawn grant + Forward Knight pawn | 57.81% | 59.38% | 58.59% (12/12) | 98 / 29 / 65 | 61.98% | 55.21% |
| Pawn grant + Rank pawn | 47.50% | 40.10% | 43.47% (11/12) | 60 / 33 / 83 | 44.32% | 42.61% |
| Pawn grant + Diagonal grant | 48.96% | 62.50% | 55.73% (12/12) | 44 / 19 / 33 | 60.42% | 51.04% |

The Forward Knight pawn remains above 50% with all three level-one partners, in both fixed halves and at both c/e placements. Its equal-team partner mean is 63.28%; Rank pawn is 46.59% and Diagonal grant 54.45%, with different shared-case coverage retained in JSON. King-step plus Forward Knight is strongest at 70.31% and performs well with both colors. The repeated Knight-pawn signal supports testing narrower jump components without claiming a precise additive value or isolated causal synergy.

The Two-step-pawn plus Diagonal-grant team has a 19.32-point e-file-minus-c-file contrast. Other file contrasts, especially those with incomplete shared cases, remain descriptive. The grant-only team has one real reserve placement and half the physical games of a two-layout team; logical partner means give it equal weight.

## Provenance and reproduction

The twelve frozen quiet four-ply prefixes, 20,000 nodes, one thread, 32 MiB hash, Skill 20 and mixed receipt `495f4e8796b8ea4181aee3d959432a4820e87ac7641eb339e4fb25908222048e` stay unchanged. These are search priors rather than fitted material prices.

- Original run.json, archived INI files and native-preflight proof were not supplied. Reconstructed declarations check compatibility, not original run provenance.
- Recorded starts, identities, opening prefixes, search settings and outcomes match the declarations. Engine names and profile hashes do not attest the executable or native material tables.
- Moves and terminal outcomes were not independently replayed. No games, engine searches, material fit, Elo or population confidence interval were produced.
- Mixed packages, three-point solo grants, first/second opening cohorts and placement contexts remain distinct. No grand mean is pooled across panels.
- The WD/W2 range resamples twelve matched fixed opening blocks; it is conditional rather than a population confidence interval or proof of intrinsic superiority.
- WD has extra deployed jumps, but forbidden checking drops can remove reserve placements allowed to W2. The full drop-game legal choices are not necessarily a superset.
- Shared W2/WD search priors control a declared input; they do not establish that either prior equals the piece's true value.

Exact uploads are preserved as deterministic gzip, pinned by archive and original-byte SHA-256. Derived JSON retains the declaration/profile/schedule hashes, all opponent/cohort/color/file results, original calibration and matched contrast details. Historical labels remain unchanged even when the playable presentation gains new names.

Verify with `node scripts/balance/v17-mixed-evidence.js`; `--write` regenerates derived artifacts only. This archive changes no movement, price, reference, catalog, runner, engine or current panel identity.
