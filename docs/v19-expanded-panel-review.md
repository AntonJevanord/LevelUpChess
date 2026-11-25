# Expanded panels: 64-opening report review

The three uploaded reports finish all declared targets: **7,936 new games**
plus **23,936 reused finalized cells**, giving **31,872 finalized cells** and
**15,915 scored color pairs**. These are report-only observations; the source
journals were not uploaded for an independent replay. Exact reports and hashes
are retained in the [source archive](../experiments/balance/results/v19-expanded-64-001.sources.json).

| Alternative | Whole-roster score | Fixed-reference score | Whole-roster conditional 95% range |
| --- | ---: | ---: | --- |
| L1 Dabbaba bishop `BD` | 52.27% | 51.04% | 50.11%–54.69% |
| L2 Forward-zebra knight `NfhZ` | 48.47% | 48.96% | 45.81%–51.12% |
| L2 Restricted Knight-capture rook `RcsNcfN` | 50.59% | 50.54% | 48.27%–52.84% |
| L2 Sideways-diagonal queen `QsDsNA` | 47.21% | 49.22% | 45.20%–49.30% |
| L3 Long sideways-diagonal queen `QsHsCsZG` | 54.39% | 55.66% | 52.21%–56.77% |

All five remain plausible alternatives for human playtesting. The restricted
rook and sideways-diagonal L2 queen improve substantially on their original
counterparts' whole-roster scores of 60.60% and 36.72%. NfhZ is close to even
in both baskets. The new L3 queen is stronger than the existing Wraith's
37.47% whole-roster result, and sits on the strong side of the intended range.
No piece is replaced or repriced automatically from these reports.

The largest standing watch items remain L3 Warden at 63.61%, L2 original RcN
at 60.60%, and the weak original L2 QsN at 36.72% / L3 Wraith at 37.47%.
L1 King-step pawn and Ghost rook both score 58.03%. Preserve these findings
for later selection and cross-level comparisons rather than restarting a
chain of incremental tests during the puzzle work.

Whole-roster baskets change when alternatives are added. Fixed-reference
scores and individual matchups remain separate. Shared-case counts differ
where a truncated game lacks a scored partner. Historical/new engine-type
contexts are explicitly labeled; this composite is not a uniform new
material-fit dataset and its conditional ranges exclude engine/context bias.

Completed local run folders can now feed the [puzzle pilot](puzzle-generation.md).
The Markdown reports alone cannot reconstruct positions or piece mappings.
