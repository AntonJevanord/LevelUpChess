# Version-17 design-focus results

All **640 games completed**, with 320 complete color pairs and no errors or truncations. Each reference column contains 32 games per army. Overall weights the four references equally; the three-two-step-pawn matchup is separate. Draws count half a point.

| Purchase | Vanguard | Unicorn | Cruisader | Amazon | Reference overall | Three two-step pawns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Grid bishop | 59.38% | 62.50% | 64.06% | 48.44% | 58.59% | 76.56% |
| Three full-diagonal pawns | 29.69% | 56.25% | 21.88% | 31.25% | 34.77% | 48.44% |
| Three long-forward grants | 51.56% | 64.06% | 51.56% | 56.25% | 55.86% | 71.88% |
| Three pawn-like grants | 76.56% | 56.25% | 48.44% | 73.44% | 63.67% | 71.88% |

| Purchase | References: original / new eight | Two-step pawns: original / new eight |
| --- | ---: | ---: |
| Grid bishop | 60.94% / 56.25% | 75.00% / 78.13% |
| Three full-diagonal pawns | 33.59% / 35.94% | 65.63% / 31.25% |
| Three long-forward grants | 53.13% / 58.59% | 71.88% / 71.88% |
| Three pawn-like grants | 64.06% / 63.28% | 78.13% / 65.63% |

## Interpretation

- Keep Grid bishop `BDC` at level 3 provisionally: 58.59% across references and 48.44–64.06% in individual reference matchups. Its 76.56% against the pawn bundle is a matchup flag, not sufficient reason to reprice it to level 2.
- Full-diagonal pawns remain weak against the reference panel at 34.77%. Their 48.44% against two-step pawns reverses from 65.63% to 31.25% between cohorts, so that direct comparison needs replication.
- Long-forward grants average 55.86% against references but score 71.88% against two-step pawns in both cohorts. Take the direct matchup seriously as a possible counter or deployment effect; a shared reference average does not imply transitive equality.
- Pawn-like grants average 63.67%; capture-square count alone does not explain strength. Direction, quiet mobility, deployment tempo, extra bodies and opponent interaction also matter.
- Unicorn is relatively vulnerable to the full-diagonal pawns and long-forward grants compared with the other references. Pawn-like grants show a different opponent pattern; this does not make Unicorn universally weak.

The next bounded batch adds sixteen new two-ply cases. Existing purchases receive only new cases; revisions receive all thirty-two. The two-step baseline also receives new reference games to test its stability. Historical games retain their own IDs and profiles.

## Provenance and reproduction

Exact uploaded bytes are archived with pinned original/compressed hashes. Recorded schedules, profiles and search settings match reconstructed declarations, and the uploaded Markdown reproduces exactly. Original run manifests and native preflight proofs were not supplied; this audit does not attest to the original executable/value tables, independently replay moves, fit material values or calculate Elo. The fixed related starts remain a descriptive screen.

```powershell
node scripts/balance/v17-focus-evidence.js
```

Use `--write` to regenerate the derived JSON and this report. No searches or new games are started.
