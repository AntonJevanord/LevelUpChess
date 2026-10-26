# Simple pieces against Amazon and Camel

Version 16 compares four readable level-3 replacements against unchanged
Amazon (`QN`) and Camel knight (`NC`). The frozen
[configuration](simple-references.json) declares **3,072 new games, four jobs**,
with no automatic extension. The playable picker is unchanged.

| Candidate | Stable ID | Movement |
| --- | --- | --- |
| Rank bishop | `bishop.purple@10` | `BsR`: bishop diagonals plus unlimited horizontal slides. |
| Queen-moving rook | `rook.purple@9` | `RB`: queen movement, retaining rook castling. |
| Forward-bishop rook | `rook.purple@10` | `RfB`: rook movement plus forward diagonal slides. |
| Short-bishop rook | `rook.purple@11` | `RB2`: rook movement plus diagonal slides up to two clear squares. |

All moves include captures. Slides stop at blockers. Forward direction mirrors
for Black; standard promotions and royal kings remain in use. Each purchase
replaces one ordinary family member and costs three upgrade points.

## Matched games and reuse

Reuse the original four-reference panel's exact 128 positions, member squares
and opening IDs. All new starts have passed quiet/legal/nonterminal checks.

| New conditions per position | Games per position | Total |
| --- | ---: | ---: |
| Four candidates against ordinary armies, both colors | 8 | 1,024 |
| Four candidates against two references, both colors | 16 | 2,048 |
| New collection | 24 | 3,072 |

Each candidate/reference pairing receives 128 color pairs, or 256 games. The
ordinary-army games support baseline material estimates and comparison with
head-to-head estimates. Candidate-versus-candidate matches are outside this run.

The pinned 2,688-game original panel is copied byte-for-byte under `parent/`
in the new results folder. No old matchup or control is replayed. The linked cap
is 5,760 records, including the parent's one unscored truncation. Its four-type
profile is retained for decoding; the new eight-type registry preserves those
allocations and adds the four candidates. Parent and new conditions for one
position stay together in validation folds and resampling.

The completed 4,608-game revision run is a separate dataset. Its final manifest
and journal have not been supplied for pooling, so it is not a parent here.

## Playing and evaluation policy

Keep Skill 20, 20,000 nodes per move, one thread, 32 MB hash and 400 plies.
**Only `RB` receives an explicit native prior:** ordinary queen MG2538/EG2682,
applied consistently to raw, capture and evaluation tables in both colors.
Other custom and ordinary pieces retain automatic values. This matches a known
movement's prior; it does not assign every candidate its desired purchase value.

`RB` retains a custom identity to track the rook purchase and castling role.
Matching movement and material tables does not prove identical search heuristics
to a built-in queen. Record that distinction when interpreting its fitted bonus
against the ordinary queen-minus-rook difference.

Native preflight checks all starts, movements, castling, promotion, the explicit
prior and unchanged parent values/legal moves/sampled static evaluations before
reuse. These are bounded compatibility checks, not universal policy equivalence.

## Estimates and checkpoints

Cumulative barriers at **768 / 1,536 / 3,072 new games** cover 32 / 64 / 128 new
position blocks. Games pause while reports are saved. Each report includes all
parent groups plus the collected new prefix; early coverage is unequal.

Console output prints combined ordinary **P/N/B/R/Q estimates**, upgrade bonuses
and the **queen-minus-rook gap**. Markdown adds ordinary/single, head-to-head
and combined tables, conditional ranges and checkpoint history. Pawn = 1 and
queen = 9 are labeled assumptions; the royal king has no exchange-price estimate.
With queen fixed at 9, the gap's range is `[9 − rook upper, 9 − rook lower]`.
Unsupported estimates remain unavailable.

Keep min-ply 16, stride five, stable two-ply windows, draws and unit total sample
weight per game. Use 200 whole-position resamples and five grouped validation
folds. Native parameters and fitted material estimates use different scales.
Judge head-to-head performance, opponent dependence and playability alongside
material bonuses. Do not force values or movements merely to hit exactly 50%.

## Windows commands

```bat
npm.cmd run material:simple -- --out balance-results/simple-references --jobs 4
npm.cmd run material:simple -- --resume balance-results/simple-references
npm.cmd run material:simple -- --report balance-results/simple-references
```

Use a new output directory; no book download is required. `--check` runs
preflight alone without games. **q / Ctrl+C** stops now with saved prefixes;
**g** finishes active games; **p** finishes active pairs. Resume freezes the
same settings, executable, policy, source and profile. Offline reporting needs
no engine or Python and preserves raw histories and completed checkpoints.

New catalog entries and the generated bundle change whole-file hashes. Reproduce
the completed revision run's original source identity on commit `f963a32`, and
the original four-reference audit on `1658cc4`. Preserve both closed studies.

The [preflight/workflow record](results/simple-reference-preflight-001.json)
contains native checks for every start, policy verification, archived-parent
replay, two interrupted/resumed four-worker invocations and offline reporting.
All 785 unit/integration checks pass; 36 environment-dependent cases are skipped.
These checks create no completed campaign games or new balance evidence.
