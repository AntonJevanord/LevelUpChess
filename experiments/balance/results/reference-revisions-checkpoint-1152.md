# First revision checkpoint: provisional interpretation

The user supplied the 1,152-new-game checkpoint tables on 2026-10-25. New
comparisons contain 64 scored games each, over the first 32 declared positions.
Historical rows retain all 128 parent positions. This note interprets the pasted
tables and the pinned parent journal; the new manifest/journal has not been
supplied for a full audit. It changes no rules, reports or collection settings.

## Compare the same openings

Filter the committed parent journal to `reference-001` through `reference-032`,
retaining complete color pairs. Scores include half a point per draw:

| Original purchase / opponent | Same 32 positions: W / D / L | Same-32 score | Full historical score |
| --- | --- | ---: | ---: |
| Horizontal bishop / Amazon | 33 / 9 / 22 | 58.59% | 57.03% |
| Horizontal bishop / Camel | 31 / 7 / 26 | 53.91% | 51.56% |
| Horizontal bishop / original rook | 39 / 8 / 17 | 67.19% | 68.55% |
| Original rook / Amazon | 31 / 5 / 28 | 52.34% | 42.97% |
| Original rook / Camel | 19 / 8 / 37 | 35.94% | 31.25% |
| Camel / Amazon | 30 / 4 / 30 | 50.00% | 51.18% |

The first block favors the original rook against Amazon. The diagonal-capture
revision's 64.84% is 12.50 percentage points above the original on these same
positions, rather than the 21.88-point gap obtained from unequal opening sets.
Against Camel its 58.59% is 22.66 points above the matched original. These are
descriptive differences; the pasted aggregate tables do not permit paired
uncertainty for revision-versus-original changes.

## Bishop selection stays open

On the full historical dataset, the original bishop averages 54.30% against
Amazon and Camel. Including its 68.55% against the weak rook raises its
equal-matchup mean to 59.05%. The favorable rook matchup therefore inflates its
overall tournament score, as it also does Camel's.

That does not explain every signal: the bishop scores 57.03% against Amazon,
and its high 5.37 ordinary/single estimate includes bishop-versus-ordinary
games. The weak upgraded-rook matchup is therefore not a complete explanation
of both metrics. The model predicts 65.34% against Camel where the
observed score is 51.56%. A single fitted bonus misses matchup structure.
Keeping the original bishop remains a valid outcome; a new revision need not
replace it just because it was tested.

The forward-jump bishop scores 42.19% / 46.09% against Amazon / Camel; short-side
scores 37.50% / 42.97%; quiet-jump scores 28.13% / 35.16%. The quiet-jump change
looks excessive. Original and forward-jump remain plausible options, with
readability and playtesting relevant to selection.

## Rook revisions need more opening coverage

| Candidate | Against Amazon | Against Camel | Equal-matchup mean |
| --- | ---: | ---: | ---: |
| Diagonal capture | 64.84% | 58.59% | 61.72% |
| Diagonal step | 70.31% | 76.56% | 73.44% |
| Full knight | 67.97% | 66.41% | 67.19% |

Diagonal-step and full-knight look strong early. Diagonal-capture is less clear:
its Camel score is inside the working band and its Amazon score is moderately
above it, with broad conditional ranges. Its material estimate is particularly
context-sensitive: ordinary/single 7.00 versus head-to-head 4.82, difference
−2.18 with conditional range −3.37 to −0.77. The combined 5.14 estimate alone
should not decide its movement.

## Next decision

Continue unchanged to the planned 2,304-new-game checkpoint, then compare the
same opening prefix and ask whether further scheduled games could change the
selection. Do not change movements or native values mid-run. Keep the original
bishop eligible, avoid selecting the quiet-jump nerf prematurely, and retain
diagonal-capture as a possible rook until broader coverage clarifies it.
No new redesign, extra campaign or automatic repeat follows this checkpoint.
