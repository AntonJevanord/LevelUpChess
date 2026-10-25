# Proposed bishop and rook revision screen

Compare three modest Horizontal-bishop nerfs and three Knight-capture-rook buffs
against the unchanged Camel knight and Amazon. The completed four-reference
study stays closed and separate. This proposal is **5,504 games with four jobs**;
it is not configured or runnable through the current `material:references` command.

The bishop scored 51.56% against Camel, so a large nerf is unwarranted. The rook
scored about 31% against both bishop and Camel, despite 42.97% against Amazon.
These candidates explore small, readable changes rather than assume any movement
has a guaranteed material gain or loss.

## Candidate movements

These are proposal keys, not immutable catalog IDs. Assign fresh IDs when
implementing; preserve all previous definitions and results.

| Key | Betza | Change from the tested piece |
| --- | --- | --- |
| bishop-short-side | `BsWsN` | Keep bishop and wide knight moves; reduce sideways clear slides from two squares to one. |
| bishop-quiet-jump | `BsR2msN` | Keep bishop and sideways slides up to two squares; make the wide knight jumps quiet-only. |
| bishop-forward-jump | `BsR2fsN` | Keep bishop and sideways slides up to two squares; allow wide knight jumps only forward, for movement and capture. |
| rook-diagonal-capture | `RcNcF` | Keep rook moves and knight captures; add adjacent diagonal captures. |
| rook-diagonal-step | `RcNF` | Add adjacent diagonal movement and capture to the tested rook and knight captures. |
| rook-full-knight | `RN` | Allow quiet knight jumps as well as knight captures: the rook–knight compound, or empress. |

Retain `knight.purple@3` (`NC`) and `queen.purple@1` (`QN`) as the two references.
All eight types replace their ordinary family pieces; no extra units or pawn
displacement are introduced. Rooks keep their castling role and promotions remain
standard Q/R/B/N. `sN` means wide knight jumps, and `fsN` keeps the forward half;
two-square `sR2` slides still require a clear path.

The six strings parse and pass targeted browser-rule movement checks. None is an
exact movement-string duplicate in the current catalog. Full native/browser and
role validation is still required before a scored run.

## Matched schedule and cap

Select **128 fresh full-army book positions**, excluding the completed material
pilot, Amazon-only study and four-reference study. Preserve balanced bishop color
complexes and left/right member selection, using the same selected family member
and actual square throughout each position's conditions.

| Purpose | Conditions per position | Games |
| --- | ---: | ---: |
| Ordinary baseline | 1 | 128 |
| Each of eight types against ordinary, both colors | 16 | 2,048 |
| Six candidates against both references, both colors | 24 | 3,072 |
| Camel knight against Amazon, both colors | 2 | 256 |
| Total | 43 | 5,504 |

This gives **2,176 ordinary/single-upgrade games** and **3,328 head-to-head games**,
with **256 games per head-to-head pairing**. There are 13 pairings: twelve
candidate/reference pairs and one reference/reference pair. Candidate-versus-
candidate games are outside this question. An eight-type full round robin would
cost 9,344 games at this coverage without being needed to select revisions.

Accept a position only when all 43 starts meet the frozen quiet, legal and
nonterminal criteria. Validate exact substitutions, both colors, castling,
promotion and decoding before collection. Freeze the eight-type registry,
letters, selected positions, schedule, engine and source hashes together.

## Effort and reports

Keep Skill 20, **20,000 nodes per move**, one thread per engine, 32 MB hash,
400 plies and four jobs. Record automatic MG/EG diagnostics for every ordinary
and custom type in both colors, including the shared roster's phase effects.
Native values are playing-policy inputs, not desired strength targets; do not
assign candidate values merely to make them match the references.

Use the existing sparse min-ply 16, stride five, material-stable two-ply windows,
draw treatment and unit total sample weight per game. Fit the ordinary/single,
head-to-head and combined cohorts separately; **all 5,504 games** inform the final
combined fit. Primary fits assume pawn = 1 and queen = 9, with unconstrained
diagnostics and honest rank/coverage failures.

Resample whole 43-game position blocks with the same draws for cohort comparisons.
Report paired head-minus-baseline bonus ranges against the practical ±0.5-pawn
guide. Use five fixed whole-position folds for out-of-fold matchup predictions;
no outcome contributes to the model predicting it. Report matchup points, color
results, paired uncertainty, phase support and predicted-versus-observed scores.
These are contextual comparisons, not universal values or proof of equivalence.

Save complete-block checkpoints at **1,376 / 2,752 / 5,504 games**, corresponding
to 32 / 64 / 128 positions. Validate immediate/game/pair stopping, preserved move
prefixes, strict resume and immutable reports before local collection. Ply-limit
games remain unscored; a truncation does not automatically add replacement games.

## Decision

At the cap, compare each revision against both references and combine those
results with readability, enjoyment and counterplay. Retain an unchanged reference
pair to show the batch context, not to guarantee a 50% control result. Earlier
data and the new eight-type profile are separate evidence; do not pool their
samples or claim a paired old-to-new movement effect from different cohorts.

Choose promising revisions, report unresolved precision or matchup dependence,
and close the batch. A later confirmation needs its own question and budget;
no extension, redesign or additional stage starts automatically. Collector and
report support for this new schedule must be implemented before it can run.
