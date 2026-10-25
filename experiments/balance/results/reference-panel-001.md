# Four-reference study: completed review

Close the [declared study](../reference-panel-proposal.md) at **2,688 scheduled
games**: 2,687 completed and one reached the 400-ply limit. There are no errors,
aborted attempts or retries. Keep the truncated game unscored; no replay or
extension is needed. The results support a useful reference basket, while
ordinary/single-upgrade and head-to-head valuations are not established as equivalent.

## Evidence

Preserve the original [manifest](reference-panel-001.collection.json),
[journal](reference-panel-001.games.jsonl),
[dataset](reference-panel-001.uploaded-dataset.json),
[summary](reference-panel-001.uploaded-summary.json) and
[report](reference-panel-001.uploaded-report.md). The reproducible
[offline audit](reference-panel-001.audit.cjs) records its checks and regenerated
results in [JSON](reference-panel-001.audit.json). Run ID:
`fdbc7887-daf3-4ce6-b33b-98e95bcfe7a9`.

- All **301,770 recorded plies** replay, including the truncated game's 400 plies;
  completed outcomes validate. All 2,687 completed histories are distinct.
- The uploaded dataset reproduces byte for byte: 25,365 eligible positions from
  2,677 sampled games; ten completed games have no eligible samples.
- All 128 selected positions match preflight and exclude the earlier 416 positions.
  Both bishop color complexes receive 64 positions per side.
- All 27 recorded source hashes match, together with the bundled Windows engine,
  Windows CRLF rules representation, configuration fingerprints and native diagnostics.
- All three checkpoint estimates reproduce, and the final Markdown matches exactly.
  The six final fits converge at full rank; all 1,200 final bootstrap fits are valid.

Every selected position starts with Black to move because all 31,526 positions
in the source book do. Both upgrade color assignments are still played. This
limits generalization; file hashes also do not independently attest historical
processes. Broader opening ancestry can extend across selected-position groups.

## Material bonuses

Pawn = 1 and queen = 9 remain assumed analysis anchors. Values below are added
benefits over each ordinary piece, not whole-piece prices or native MG/EG settings.

| Upgrade | Ordinary/single | Head-to-head | Combined | Combined conditional 95% range |
| --- | ---: | ---: | ---: | --- |
| Horizontal bishop | 5.41 | 4.30 | 4.66 | 4.36–4.96 |
| Knight-capture rook | 3.65 | 2.70 | 3.15 | 2.88–3.37 |
| Camel knight | 3.79 | 3.44 | 3.79 | 3.42–4.18 |
| Amazon | 3.88 | 3.62 | 3.96 | 3.66–4.27 |

The ordinary/single Amazon bonus of 3.88 is close to the earlier study's 3.84.
The unconstrained combined bonuses are similarly ordered: bishop 4.61, rook 3.12,
Camel 3.75 and Amazon 3.92. Fixing queen = 9 does not create the main ranking.

| Head minus ordinary/single bonus | Point | Paired conditional 95% range |
| --- | ---: | --- |
| Horizontal bishop | −1.11 | −2.38–−0.28 |
| Knight-capture rook | −0.95 | −1.77–−0.19 |
| Camel knight | −0.35 | −1.45–0.47 |
| Amazon | −0.27 | −1.06–0.53 |

All four practical agreement decisions at **±0.5 pawn are inconclusive**.
The bishop and rook ranges lie below zero, supporting lower fitted bonuses in
head-to-head play under this model. Each still crosses −0.5, so neither range
establishes that the discrepancy exceeds half a pawn. The Camel and Amazon
ranges include zero but are too wide to establish equivalence. Opponent composition
and material/phase coverage differ; these contrasts do not isolate a causal method effect.

## Head-to-head results

Scores count wins plus half draws, using complete color pairs. Predictions
withhold every game in each tested opening group before fitting.

| A versus B | Paired games | A score | Conditional 95% range | Predicted A score |
| --- | ---: | ---: | --- | ---: |
| Camel knight / Amazon | 254 | 51.18% | 44.84%–57.14% | 47.18% |
| Horizontal bishop / Amazon | 256 | 57.03% | 51.56%–61.91% | 61.38% |
| Horizontal bishop / Camel knight | 256 | 51.56% | 46.88%–56.45% | 64.01% |
| Horizontal bishop / Knight-capture rook | 256 | 68.55% | 62.50%–74.41% | 72.70% |
| Knight-capture rook / Amazon | 256 | 42.97% | 37.70%–49.22% | 37.38% |
| Knight-capture rook / Camel knight | 256 | 31.25% | 25.59%–37.30% | 40.05% |

The Camel/Amazon truncation leaves one completed partner outside the paired score;
that completed game still informs material fitting. All other matchups have 128 pairs.

Camel and Amazon remain useful core references. The bishop performs strongly
across this basket, yet its 51.56% against Camel is close to even. The rook trails
each opponent, particularly Camel. Thus the four purchases are not uniformly equal.

The model overpredicts the bishop's score against Camel by **12.45 percentage
points**, and overpredicts the rook against Camel by 8.80 points. A single material
bonus does not reproduce every matchup: later-game samples, starting-position
tactics, cooperation and opponent-specific interactions remain relevant. The
11,461 middlegame and 13,904 endgame samples do not establish separate phase values.

## Next work

Keep Camel and Amazon fixed. The user's requested three modest bishop nerfs and
three rook buffs belong to the separate [revision proposal](../reference-revision-proposal.md),
with readable abilities, new immutable IDs and a bounded comparison chosen before play.
No new batch is configured or starts automatically. Preserve this completed cohort,
its inconclusive equivalence result and original reporter; neither engine values nor
purchase prices change because a desired matchup score was missed.
