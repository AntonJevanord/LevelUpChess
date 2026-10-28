# Version-17 Support pawn and Scout grant results

**640 scheduled games finalized: 639 completed and one reached the 400-ply limit.** There are 319 complete color pairs (638 scored games), no errors, and one completed partner excluded from its unfinished pair. All 512 reference games completed, so neither reference overall is affected by the truncation. Draws count half a point.

Each candidate buys three one-point purchases. Overall weights Vanguard, Unicorn, Cruisader and Amazon equally; the three-two-step-pawn matchup is separate.

| Purchase | Vanguard | Unicorn | Cruisader | Amazon | Reference overall | Three two-step pawns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Three Support pawns | 29.69% | 27.34% | 23.44% | 33.59% | 28.52% | 25.00% |
| Three Scout grants | 56.25% | 48.44% | 28.91% | 47.66% | 45.31% | 48.39% |

| Purchase | References: original / new sixteen | Two-step pawns: original / new sixteen | Reference White / Black |
| --- | ---: | ---: | ---: |
| Three Support pawns | 24.22% / 32.81% | 23.44% / 26.56% | 30.47% / 26.56% |
| Three Scout grants | 46.48% / 44.14% | 50.00% / 46.88% | 52.34% / 38.28% |

The Scout baseline uses 15 complete pairs in the original cohort and 16 in the new cohort; its all-case baseline score uses the 31 available complete pairs.

## Design decisions

- Park the current Support pawn `fmWfceFifmnDsW`: its reference overall is 28.52%, all four reference matchups are below 34%, and it loses clearly to the two-step baseline in both cohorts. An unchanged repeat is unlikely to change this design decision.
- Keep Scout grant `fWbmF` as a provisional one-point playtest candidate: 45.31% against references and 48.39% against the pawn baseline, with similar reference totals on the two cohorts. Avoid an automatic buff; its Cruisader matchup is a repeated weakness (25.00% / 32.81%), while Vanguard is favorable.
- Do not infer isolated piece material values from these three-purchase armies. Reserve deployment, extra bodies and opponent-specific play remain part of the measured outcome.

## Excluded pair

- Unscored: `c29_scout-grants-v-two-step-pawns_o28_followup-symmetrical-english_r1_w`, Scout as White, `max-plies` at 400 plies.
- Its completed Black-Scout partner `c29_scout-grants-v-two-step-pawns_o28_followup-symmetrical-english_r1_b` ended 0-1 (checkmate) and remains excluded from the paired score. It is retained in the raw archive.

This affects only Scout versus two-step pawns. Preserve the original unscored result; no continuation or replacement is required for this decision.

## Evidence scope and reproduction

Only mobility-additions is new evidence in this upload batch. No mobility-confirm, mobility-revisions or mobility-expanded journal was supplied.

The other two uploaded journals match the already archived level-three confirmation and revision journals byte-for-byte. They add no new games or statistical weight. The broader mobility batch remains unreviewed until its separate results are supplied.

Exact uploaded bytes are archived with pinned original and compressed SHA-256 hashes. Recorded schedule, profile and search settings match the reconstructed declaration, and the uploaded Markdown reproduces exactly. Original run manifests and native preflight proofs were not supplied; this audit does not attest to the original executable or value tables, independently replay legal moves or certify terminal positions. It fits no material values or Elo. The fixed related opening cases provide descriptive results, not a confidence interval or proof of balance.

```powershell
node scripts/balance/v17-mobility-evidence.js
```

Use `--write` to regenerate only the derived audit JSON and this report. No engine searches or new games are started.
