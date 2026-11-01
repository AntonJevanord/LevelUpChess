# Level-one acceptance review — 2026-11-01

All **2,016 games completed**, with no retries, errors or move-limit truncations. Both uploaded reports reproduce exactly from the journals and reconstructed declarations. The complete [results and fixed-cohort tables](../experiments/balance/results/v17-acceptance-001.report.md) retain every reduced/current/expanded design, benchmark score and W/D/L count; the accompanying audit JSON includes per-opponent results within each fixed half and White/Black splits.

| Family | Reduced | Current | Expanded |
| --- | ---: | ---: | ---: |
| Positional knight | 23.96% | 24.48% | 39.06% |
| Climbing knight | 30.21% | 38.54% | 59.38% |
| Hopping bishop | 20.31% | 27.08% | 21.35% |
| Wazzap bishop | 29.69% | 52.60% | 62.50% |
| Ghost rook | 23.44% | 25.00% | 41.67% |
| Pawn rook | 45.31% | 48.96% | 72.92% |
| Advancing queen | 25.00% | 29.69% | 35.94% |

Draws count half a point. Knights, bishops and rooks use two candidate upgrades against two reference purchases; queens use one upgrade against one purchase. Each percentage combines 96 games over 16 fixed opening cases and three equally weighted benchmarks. These budgets are kept separate.

**Current Wazzap (`BsW`) is the strongest candidate to retain.** Its first/second fixed halves score 55.21%/50.00%; its three benchmark scores lie between 48.44% and 54.69%. Expanded Climbing knight (`NvWvD`) is promising at 59.38%, with 61.46%/57.29% across halves. Both merit human playtesting rather than another undirected rerun.

**Pawn rook needs matchup review.** Current `RceF` averages 48.96%, but scores only 26.56% against King-step pawns (12.50%/40.63% across halves), while scoring 62.50% against Two-step pawns and 57.81% against grants. Reduced `RfceF` has the same weak matchup. Expanded `RceF2` overshoots: 72.92% overall, 78.13%/67.71% across halves and 60.94%–84.38% across opponents. An average near 50% would conceal this interaction.

Expanded Positional knight (39.06%) and Ghost rook (41.67%) are possible lower-edge candidates, but remain weaker or less consistent against particular benchmarks. All Hopping bishops and Advancing queens need design review. The expanded queen's halves differ (29.17%/42.71%); the Hopping bishop's extra moves fail to produce a monotonic score improvement. These are reasons to review the movement and search behavior, not proof that quiet moves intrinsically reduce strength.

Leave the running level-two reference experiment unchanged. After its results arrive, select a small playable level-one shortlist, park clearly weak/strong alternatives, and reserve targeted follow-ups for unresolved matchups. No piece identities, prices, references, applied values or native probes were changed by this review.

The results are conditional on **20,000 nodes per move**, one thread, 32 MiB hash, fixed starting placements and common declared MG/EG values within each movement bracket. The existing calibration receipt remains unchanged. The 40%–60% target guides descriptive screening; this review does not calculate confidence intervals, Elo or outcome-fitted material values.

Exact uploads are preserved as deterministic gzip with SHA-256 pins. Original `run.json`, INI archives and native-preflight proof were not uploaded, and no game was independently replayed; reconstructed declarations check compatibility only. Recorded engine names identify Fairy-Stockfish 230826 but do not attest the binary. Verify all archived and derived evidence offline with:

```sh
node scripts/balance/v17-acceptance-evidence.js
```
