# Version 18: thirty-two-opening roster review

The final selections are **NAD at L3**, and **NDmW, QcC and Free Boar BsR at
L2**. This concludes pre-panel screening. The next stage is roster integration
and version-19 panel preparation; historical profiles and frozen references
retain their existing identities.

Both studies use 40,000 nodes and the same thirty-two fixed opening cases,
against their fixed same-tier references. Draws count half a point. The
[archived evidence](../experiments/balance/results/v18-prepanel32-001.report.md)
reproduces the uploaded tables; the
[source index](../experiments/balance/results/v18-prepanel32-001.sources.json)
pins the original journals and reports. Earlier studies remain separate.

## Level three

NAD scores **51.76%** overall, with a conditional 95% range of 45.70%–57.03%.
Its even matchups make it preferable to selecting only by the overall average:

| Candidate | Overall | Vanguard | Unicorn | Crusader | Amazon |
| --- | ---: | ---: | ---: | ---: | ---: |
| NAD | 51.76% | 51.56% | 50.00% | 55.47% | 50.00% |
| NZ | 52.34% | 64.06% | 49.22% | 49.22% | 46.88% |

NZ remains a useful alternative. NWH (59.96%) and NDH (59.48%) sit near the
upper edge; NH (24.61%) is weak, while NAZ (81.64%) and NADmK (66.02%) are
strong. Their earlier L2 results retain their original prices and contexts.
Unicorn and NDH each have 31/32 shared cases because one game reached the
move limit; the archived report retains the completed partners without scoring
them as full pairs. NAD has all thirty-two cases.

## Level two

| Candidate | Overall | Conditional 95% range | Interpretation |
| --- | ---: | --- | --- |
| QcC | 55.21% | 48.96%–61.46% | Viable queen; 65.63% against Knight pawn, 50.00% against each other reference |
| NDmK | 48.96% | 45.05%–52.86% | Keep as a viable second knight |
| NDmW | 53.13% | 46.09%–59.38% | Viable alternative; uncertain lead over NDmK |
| Free Boar `BsR` | 55.21% | 48.44%–61.72% | Retain for panel/playtesting review |
| `BsW3` | 48.44% | 41.67%–54.69% | Promising lower-powered bishop alternative |

NDmF is lower at 41.67%. `BsWsnN` reaches 58.07%, while `BsW2` is low at
36.46%. The fresh QsN control scores 39.32%; preserve its earlier 47.40%
result as a separate opening context rather than replacing or pooling it.

Free Boar's four eight-case batches score **59.38%, 55.21%, 48.96%, 57.29%**.
The first and second halves score 57.29% and 53.13%. There is no basis to
choose the 48.96% batch, or the stronger batches, as the uniquely correct one.
Each batch has 48 games but only eight shared opening cases. The pooled
reference matchups are 60.16% against Knight pawn, 52.34% against Rank pawn
and 53.13% against Bishop grant. Earlier 59.38% and 65.56% studies remain
evidence from different cases; their favorable Rank-pawn results are not a
universal matchup estimate.

The proposed `QfcCscC` is an optional QcC alternative, not a required correction
to force a 50% score. Native/browser move checks verified six capture-only
camel jumps: it removes the two tall backward jumps and retains the four
forward and two wide backward jumps. If selected, it needs a new immutable
trial; no campaign or live roster change has been implemented.

## Opening review and next step

[Opening diagnostics](opening-diagnostics.md) can flag forced trades, pins and
tactical exposure. They do not adjust these win rates or select a different
favorable book for each matchup. Conditional ranges describe uncertainty within
this study, not exact material values or performance across every opening.

The [completed prefix inspection](../experiments/balance/results/v18-prepanel32-001.opening-audit.md)
replayed all 3,776 recorded prefixes legally. None contained captures,
promotions or drops. No royal-shield pins or immediate legal/hypothetical
capture threats against upgrades appeared after the prefixes. Ordinary pieces
had capture candidates in 561 positions; 460 had an actual-turn capture lacking
an immediate recapture. These are review flags, not proven material losses.
This pass used no native search and does not rule out later tactics or prove
that the narrow opening book is representative. Reproduce it with:

```powershell
npm.cmd run balance:opening-audit -- --archive v18-prepanel32-001 --out balance-results/prepanel32-opening-audit
```

Carry the accepted choices into the [version-19 plan](version19-plan.md) and
freeze a shared, more diverse book. NDmK, BsW3 and QfcCscC remain alternatives;
they do not require another pre-panel campaign. The
[lower-tier shortlist](v18-lower-tier-shortlist.md) preserves the remaining
roster candidates and historical comparisons.
