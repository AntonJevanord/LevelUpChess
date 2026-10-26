# Recovered complete revision journal

The retained upload restores the original **4,608-game revision journal**:
all games completed on their first attempt, with 2,304 complete color pairs
and **499,642 legal plies**. All scheduled starts, playing-policy fields,
SAN, final positions and outcomes pass the offline
[replay audit](reference-revisions-retained-001.audit.json).

The [compressed archive](reference-revisions-retained-001.games.jsonl.gz)
preserves the uploaded journal bytes exactly: 14,617,863 bytes compress to
2,884,792 bytes. The uncompressed SHA-256 is
`cef80f7193887ef699dbaae39ca98ec9980aa6b71c490498c0ddd1658acf59ab`.
The separately uploaded recovered journal duplicates the existing 480-game
archive exactly; it is not stored again. All 480 overlapping records agree.

## Historical short-side bishop coverage

| Opponent | Games | W / D / L | Points score |
| --- | ---: | --- | ---: |
| Ordinary army | 256 | 235 / 6 / 15 | 92.97% |
| Unicorn / NC | 256 | 78 / 54 / 124 | 41.02% |
| Amazon / QN | 256 | 103 / 38 / 115 | 47.66% |

This closes the **192-game raw-history gap** in the short-side bishop's two
reference matchups: all 512 histories now survive. The original short-side
bishop is `bishop.purple@7`, not the selected Cruisader `bishop.purple@13`.
All 12 candidate/reference head-to-head W/D/L rows agree with the
[original final revision report](reference-revisions-001.uploaded-report.md).

The original collection manifest and final analysis JSON remain absent. The
canonical reconstruction verifies the saved games but does not attest which
historical executable or native inventory produced them. No material fit,
bootstrap refit, new match games or automatic pooling changes earlier results.

These journals contain no Cruisader games. Its final decision scores remain
[report-based evidence](bishop-decision-final-001.report.md); completing that
move-replay audit requires the existing local decision `compare/games.jsonl`
and campaign/stage manifests, not another experiment. Version 16 and the four
official reference designs remain closed and unchanged.

Reproduce the complete audit offline:

```powershell
node experiments/balance/results/reference-revisions-retained-001.audit.cjs
```
