# Panel extension: report-only snapshot

The uploaded Markdown requests 64 total openings and reports 12,320 finalized games, 12,314 scored paired games. The new raw journal exceeds the available 32 MiB transfer limit, so this is explicitly a report-only record, not a journal audit or report reproduction from games.

| Nodes | Declared openings | Requested total | Finalized games |
| ---: | ---: | ---: | ---: |
| 20000 | 40 | 64 | 4400/7040 |
| 40000 | 40 | 64 | 4400/7040 |
| 80000 | 32 | 64 | 3520/7040 |

## Nightrider on the same first 32 openings

| Nodes | All nine roster opponents | Four frozen references only |
| ---: | ---: | ---: |
| 20000 | 41.32% | 40.43% |
| 40000 | 42.97% | 42.58% |
| 80000 | 44.79% | 40.82% |

All nine Nightrider matchups have 32 fully matched cases. Its aggregate 20k-to-80k increase is 3.47 percentage points; no opening-block range for that aggregate change can be derived from this Markdown.

| Opponent | Nightrider 20k score | Nightrider 80k score | Change (pp) |
| --- | ---: | ---: | ---: |
| Queen pawn | 46.09% | 50.78% | 4.69 |
| Vertical bishop | 31.25% | 35.94% | 4.69 |
| Unicorn | 35.16% | 42.19% | 7.03 |
| Vanguard | 55.47% | 48.44% | -7.03 |
| Amazon | 38.28% | 25.78% | -12.50 |
| Rook pawn | 41.41% | 39.06% | -2.34 |
| Cruisader | 32.81% | 46.88% | 14.06 |
| Ranged rook | 33.59% | 50.00% | 16.41 |
| X-ray queen | 57.81% | 64.06% | 6.25 |

The largest gains are against Cataphract (+16.41pp) and Crusader (+14.06pp). The frozen-reference average stays close to 41% because losses against Amazon and Vanguard offset other gains. The all-roster and frozen-reference baskets answer different questions.

The 80k report records 202 wins, 112 draws and 262 losses over 576 games, a 44.79% score, range 41.41%–48.35%, and physical White/Black scores 56.08%/33.51%. These are reported aggregates, not independently audited results.

## Incomplete color pairs

Three shared-sensitivity matchups have 31 cases: Vertical bishop/Unicorn, Unicorn/Cataphract and Ranger/Cataphract. The per-budget report omits one color pair in each of the first two at 40k and one in the last at 80k. The six finalized records excluded from scored pairs establish three unscored pairs, not an exact count of truncated games.

## Scope and provenance

- Current target is 64 openings, but 20k/40k have 40 declared cases and 80k has 32. Current overall rows use different cohorts and must not be read as a matched search-budget comparison.
- The shared-sensitivity table matches cases across all three budgets. Three matchup cells contain 31 cases rather than 32; no uniform 32-opening overall is inferred for affected pieces.
- Nightrider has 32 complete matched cases against every opponent, so its aggregate score and four-reference subset are derivable on the same 32 cases at each budget.
- Reported two-decimal scores are uniquely resolved onto the complete-color-pair half-point score grid. This does not supply opening identities, individual outcomes or executable provenance.
- No first-32 W/D/L, low-budget ordinary results, material estimates or new opening-block uncertainty are inferred. The 80k Nightrider W/D/L, color scores and range are retained as reported fields, not independently recomputed.
- This cumulative snapshot is not additional independent evidence on top of earlier cumulative snapshots. Journal continuity cannot be verified from Markdown.
- No engine searches, matches or game-record repairs are performed.

The exact uploaded report is retained with a byte-count and SHA-256 pin. Run `node scripts/balance/v17-level3-panel-third-report.js` to verify the report-only artifacts; `--write` regenerates derived JSON/Markdown only.
