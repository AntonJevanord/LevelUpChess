# Material estimates after the version-19 panels

The panels already retain the data needed for offline estimates: complete move
and SAN histories, starting/final FENs, outcomes, semantic piece definitions,
letter mappings, search settings and value policies. Keep the **entire run
folder**, including its owned runtime, manifests and batch journals. A Markdown
score table by itself is insufficient. No extra engine searches are needed to
replay that evidence later.

## What we can estimate

After the first 16 openings, we can fit exploratory values for the ordinary
pieces and each nonroyal replacement upgrade. The fit uses later material
imbalances from the game histories; a starting win rate alone is not a material
price. More openings, captures and exchanges can improve support, but a 32- or
64-opening run does not guarantee an identifiable or stable price for every
design. Inspect rank, held-out prediction, uncertainty and ordinary-piece values
before interpreting the upgrade numbers.

**Ordinary pawn = 1 and ordinary queen = 9 are fixed assumptions.** Custom pieces
have their own whole-piece count features. Ordinary family counts exclude those
custom pieces, and the reported upgrade bonus is whole-piece value minus the
ordinary family estimate from that same fit. This direct-count ridge model is a
separate parameterization from the earlier family-plus-bonus estimator; results
should not silently be pooled across those methods.

Material-stable positions begin at ply 16, use stride five, and exclude windows
with material changes within two plies on either side. This avoids immediate
capture/recapture transitions but does not prove tactical quietness. Each sampled
game has unit total weight. Entire structural opening families stay together
during validation and resampling; related prefixes are not independent games
from an unrestricted opening population.

## Reserve grants

The first implementation **excludes entire matchups involving a reserve grant**.
It keeps the original grant-inclusive rules profile and letter mapping intact.
Every retained replay state must have an empty pocket and no grant piece on the
board; drop moves are rejected. This prevents a pocketed grant from incorrectly
counting as zero material before deployment, or from being valued as a royal
king because its design belongs to the king-upgrade family.

Grant performance remains in the panel's outcome report. A future pocket-aware
model must distinguish reserve access, deployment timing and board presence.
Its strategic value is not necessarily equal to the material price of the
dropped piece. This limitation does not require replaying the panel games: the
original journals retain their drops and pocket positions for later analysis.

## Run the offline analysis

Stop the panel first. Use a new output folder outside the source campaign:

```powershell
npm.cmd run balance:v19:material -- --run balance-results/v19-level1-roster004 --out balance-results/v19-level1-material-16 --bootstrap 100
npm.cmd run balance:v19:material -- --run balance-results/v19-level2-roster004 --out balance-results/v19-level2-material-16 --bootstrap 100
npm.cmd run balance:v19:material -- --run balance-results/v19-level3-roster004 --out balance-results/v19-level3-material-16 --bootstrap 100
```

Use the actual run-folder names. The reader accepts the initial version-19
panels and the current revision-004 panels through their verified archived
runtime. Different tiers are analyzed separately. Current panels use **40k
nodes only**; this analysis does not request additional search budgets.

The command validates the campaign declaration, archived rules, profile,
preflight evidence and all recorded attempts. It selects complete scored color
pairs after reconstructing each full profile from its separately stored
registry with the owned runtime's compiler. The reconstructed configuration
and hashes must match the compact descriptor in each populated batch.
It then replays every retained game through its original rules, checks every SAN
and final outcome, then extracts the stable material windows. Original source
files are hashed and checked again before output. Active-run locks are refused
and never removed. No source journal, report, runtime or engine value is changed.

Outputs are `material-report.md`, `material-report.json`, `analysis-manifest.json`
and, when scored board pairs exist, `dataset.json` plus `samples.jsonl`. The
manifest retains the full original profile, source checksums, method and grant
exclusions. Use another output folder when recomputing after more openings.
`--bootstrap 0` is a pipeline check; normalized prices are deliberately withheld
without sufficient stable resamples.

## How to use the results

Unsupported values remain **unavailable**, with reasons such as insufficient
feature coverage, deficient rank, separation or unstable normalization. More
data alone is not always the remedy. Repeated positions from one game do not
become independent trials merely because many samples were extracted.

Compare conditional material estimates with the panel's direct matchup scores
and human playtests. A model that fits same-tier exchanges can still miss
matchup-specific tactics, promotion pressure or interactions in mixed armies.
The planned cross-level and mixed-army panels test how well these estimates
transfer; the first fits do not replace that validation. Search priors, purchase
costs and frozen reference definitions stay unchanged unless a separate design
decision explicitly revises them.
