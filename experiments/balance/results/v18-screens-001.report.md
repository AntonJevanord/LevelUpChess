# Version 18 initial screen evidence

3680 games finalized from 3688 recorded attempts: 3676 completed results, 4 unscored move-limit truncations, 6 historical error attempts and 2 aborted attempts. All three reports’ numeric tables, headline counts and matched-control gains reproduce from their journals.

| Level-one design | Score | First / second eight cases |
| --- | ---: | ---: |
| 2 × Positional knight | 33.85% | 37.50% / 30.21% |
| 2 × Wazzap knight | 51.56% | 60.42% / 42.71% |
| 2 × Hopping bishop | 28.65% | 29.17% / 28.13% |
| 2 × Ghost rook: quiet diagonals | 45.31% | 46.88% / 43.75% |
| 2 × Ghost rook: quiet diagonal hops | 50.00% | 46.88% / 53.13% |
| Baby Amazon | 34.38% | 35.42% / 33.33% |
| 2 × Climbing knight: expanded | 61.98% | 61.46% / 62.50% |
| 2 × Wazzap bishop | 50.00% | 43.75% / 56.25% |
| 2 × Pawn rook | 49.44% | 45.24% / 53.13% |

Wazzap knight, Wazzap bishop, the Ghost rook with quiet diagonal hops and Pawn rook are promising. The Pawn rook has 15/16 shared cases because one game reached the move limit; this is not a loss or draw. Positional knight, Hopping bishop and Baby Amazon remain weak. Expanded Climbing knight is above the descriptive band in both halves.

| Level-two design | Overall | Knight pawn | Rank pawn | Bishop grant |
| --- | ---: | ---: | ---: | ---: |
| Bishop pawn | 22.92% | 25.00% | 29.69% | 14.06% |
| Dabada knight | 33.85% | 40.63% | 34.38% | 26.56% |
| Long-range knight | 32.81% | 32.81% | 34.38% | 31.25% |
| Tall-knight bishop | 51.56% | 54.69% | 45.31% | 54.69% |
| Free Boar bishop | 59.38% | 46.88% | 82.81% | 48.44% |
| Blink rook | 51.04% | 57.81% | 39.06% | 56.25% |
| Knight-capture rook | 55.21% | 45.31% | 59.38% | 60.94% |
| Box queen | 26.04% | 29.69% | 20.31% | 28.13% |

Bishop pawn is a replacement pawn, not a reserve grant. The F Bishop grant is a fixed level-two reference. Free Boar’s 59.38% overall score is driven by its 82.81% Rank-pawn matchup; its other two scores are 46.88% and 48.44%. This points to a counter or matchup effect, not proof that it is uniformly too strong.

Candidates face fixed references, not one another. Strengthening a weak candidate therefore cannot pull the other candidates’ reference scores down. The game itself is zero-sum, while this screening roster is not a closed round robin.

| Mobility design | 40k | 80k |
| --- | ---: | ---: |
| Nightrider control | 43.75% | 35.00% |
| Nightrider: quiet diagonal steps | 54.30% | 51.95% |
| Nightrider: quiet orthogonal steps | 51.56% | 54.17% |
| Nightrider: quiet king steps | 60.55% | 71.88% |
| Wraith control | 32.03% | 27.73% |
| Wraith: long sideways captures | 38.67% | 37.89% |
| Wraith: short through captures | 28.52% | 22.66% |
| Wraith: long diagonal and sideways captures | 57.03% | 60.42% |

Quiet diagonal and quiet orthogonal Nightriders are promising; quiet king steps overshoot, especially at 80k. The full-diagonal/sideways Wraith is strong relative to the requested below-50% off-meta target. Its 80k summary uses 15/16 shared cases. The other Wraith variants remain weaker; this archive schedules no automatic revision or promotion.

## Evidence limits

- Original screen.json, stage run.json, archived INI files, runtime receipts and native-preflight proofs were not supplied. Derived descriptors check recorded declaration compatibility; they are not recovered original manifests.
- Recorded profile/registry hashes, starting armies, openings, strengths, search settings and applied value policies match the reconstructed declarations. Engine names and profile hashes do not attest the executable or its native tables.
- Moves and terminal outcomes were not independently replayed. No new matches, engine searches, outcome-fitted material values or individual-piece Elo were produced.
- All studies use sixteen related fixed opening cases. Opening-block ranges are conditional; raw game counts do not imply that many independent starting positions.

Exact uploaded bytes are retained in deterministic gzip archives with both original and archive SHA-256 pins. Separately archived compatibility descriptors were reconstructed from v0.18.3 definitions; they are not original run manifests. No unscored attempt is discarded from the evidence, and no historical game is replayed or counted again.

Run `node scripts/balance/v18-screen-evidence.js` to verify offline; `--write` regenerates only the derived audit and this review. No engine or match starts.
