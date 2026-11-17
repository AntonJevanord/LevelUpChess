# Retrospective opening diagnostics

This tool reads completed dynamic-design runs or pinned evidence archives and
replays **only the recorded forced prefixes**. It does not replay full games,
change results, choose openings or modify the input folders.

The current 64-case book uses four quiet plies per case. All 384 prefixes in
the QfN/QvN upload replay legally without material or pocket-count changes.
That rules out forced trades in this study, but says nothing by itself about
pins, exposure or tactics after the prefix.

## Run on existing games

From a completed version-18 study folder:

```powershell
git pull --ff-only
npm.cmd run balance:opening-audit -- --run balance-results/v18-prepanel-level1 --out balance-results/queen-opening-audit
```

The loader reads the recorded stage manifests and aggregate journals, including
their piece meanings and value policies. It does not execute the run's saved
JavaScript or substitute the current playable catalog. Dynamic single-run
folders with `run.json` and `games.jsonl` are supported too.

The uploaded queen games are also available through the pinned repository
archive, independently of the laptop's original run folder:

```powershell
npm.cmd run balance:opening-audit -- --archive v18-queen32-001 --out balance-results/archived-queen-opening-audit
```

Use a new or empty output folder **outside the input run**. Reports are
`opening-audit.md` and `opening-audit.json`. Existing journals and evidence
archives stay unchanged. The default uses the rules engine without native
searches or new match games.

## What is checked

- Recorded profile/registry identities, starting armies, opening IDs and moves,
  prefix legality and complete input records.
- Board and pocket inventory before/after each prefix; captures, promotions,
  drops, castling relocations and upgraded-piece lineage.
- Checks and terminal positions, plus ordinary and upgraded-piece tactics.
- Royal-shield pins: removing a piece exposes its own king. A pinned piece may
  still move along the pin, so this is not a claim of total immobility.
- Legal capture candidates and the immediate legal recaptures after each.
  A capture with no immediate recapture is an exposure flag, not proof of a
  forced material loss. The opponent can have tactical replies or compensation.

Captures for the side actually to move are distinguished from hypothetical
captures for the other side, which assume no intervening reply. Unsupported
or unclassified cases remain explicit. Quiet-only movement does not become
an attack merely because it reaches a square.

## Optional native evaluation

Add `--evaluate` to search each distinct starting and post-prefix position:

```powershell
npm.cmd run balance:opening-audit -- --archive v18-queen32-001 --out balance-results/queen-opening-evaluations --evaluate --nodes 10000
```

Windows uses the bundled compatible engine unless `FAIRY_STOCKFISH_PATH` or
`--engine PATH` selects another. The diagnostic records the actual executable
hash, search budget and manual-value checks. It clears search state between
positions and caches repeated identical positions within the audit. It uses
Skill 20, one thread and 32 MiB hash.

Scores use **White's point of view**. Centipawn scores, mate scores and bounds
remain distinct; a numeric change is shown only for compatible exact cp scores.
The JSON retains principal variations for tactical review. A shallow PV is a
search finding, not proof of a forced sequence or a fitted material value.
An engine differing from the recorded game engine is identified explicitly.

The tool was verified on all 384 archived queen-game prefixes with 10k-node
searches. None traded or exposed an upgraded piece to an immediate legal
capture. Ordinary-piece capture opportunities appeared in 52 post-prefix
positions, including 40 with an actual-turn capture lacking an immediate
recapture. These flags warrant inspection; they do not establish forced losses.
The uploaded archive does not identify its original engine executable, so the
fresh engine's identity is recorded without claiming it matches that binary.

## Selecting the next book

Do not select a separate set of eight near-zero upgraded-position evaluations
for every matchup. That would condition the openings on the very ability being
measured. A genuinely stronger army could be assigned only positions that
neutralize its advantage, and engine valuation errors would influence the
sample. Different cells would measure different opening distributions.

Instead, freeze one structurally diverse book for the whole panel, keep both
colors and use nested 16/32/64 cases. An ordinary-chess baseline can help curate
a globally reasonable candidate book before applying upgrades. Then inspect
the actual upgraded armies for illegal lines, forced losses, pins or large
pre/post search swings. Review outliers using explicit criteria; do not silently
filter or replace cells after seeing their outcomes.

More shared, diverse openings reduce sampling uncertainty. More games drawn
from matchup-specific selected books do not remove selection bias, and more
copies of one narrow opening pattern do not provide structural diversity.
The current book's uniformly short prefixes and repeated White Nf3 development
are reasons to broaden a future book, not evidence that every current result
is invalid.

The [version-19 plan](version19-plan.md) keeps book decisions separate from
piece changes, and the [queen review](v18-queen32-review.md) preserves the
original outcome evidence.
