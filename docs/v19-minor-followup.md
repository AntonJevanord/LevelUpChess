# Version 19: bishop and zebra-knight trials

These separate reference screens compare six level-one bishop designs and
seven level-two knights. They retain the current `BgB0` bishop and `N0` /
`NDmW` knights as fresh controls. Candidates do not play one another; each
army buys one upgrade at the declared tier. Existing panel rosters, completed
studies and playable libraries keep their original meanings.

## What the queen and rook reports support

The latest [sideways study](v19-sideways-followup.md) reports cover 64 openings:

| Design | Overall score | Conditional 95% range |
| --- | ---: | --- |
| L2 `QsDsNA` | 49.87% | 45.77–54.10% |
| L2 `QsNsDsH` | 51.30% | 46.74–55.73% |
| L3 `QsHsCsZG` | 52.48% | 48.91–56.05% |
| L2 rook `RcfhN` | 38.41% | 33.33–43.62% |
| L2 rook `RcsN` | 36.29% | 33.20–39.65% |

The two-square sideways/diagonal L2 queen and three-square L3 counterpart
are promising working choices. Their individual reference scores are
44.44–53.91% and 44.53–58.59%, respectively. `QsNsDsH` remains another
viable L2 design. The earlier six-direction capture rook `RcsNcfN` scored
58.59%, making it a better working candidate than the two new four-direction
restrictions.

These are report-level observations. The latest L2 report has 2,688 finalized
games and 1,341 scored pairs; L3 has 2,048 finalized games and 1,023 pairs.
`QsDsNA` and `QsHsCsZG` each have 63 shared overall cases after a truncation;
`RcsN` has 62. The [report-only source receipt](../experiments/balance/results/v19-sideways-001.sources.json)
preserves the supplied reports. Their raw journals were not supplied for this
checkpoint, so no new move replay or matched-difference analysis is claimed.

The unchanged `RcN` control scored 67.97% in the sideways study, versus 60.68%
in the preceding queen/rook study. Keep those contexts separate rather than
pooling their scores or treating the difference as a change to the piece.
No queen or rook is promoted into the playable roster by this minor-piece
experiment.

## Bishop designs

Every candidate keeps ordinary bishop movement. `D` is a two-square
orthogonal jump; it crosses an intervening piece but cannot land on a friendly
piece. All six designs remain bound to the bishop's starting square color.

| Movement | Added quiet moves | Added captures |
| --- | --- | --- |
| `BD` | All four `D` jumps | All four `D` jumps |
| `BsD` | Sideways `D` jumps | Sideways `D` jumps |
| `BmD` | All four `D` jumps | None |
| `BsmDvD` | Sideways and vertical `D` jumps | Vertical `D` jumps |
| `BsmDvcD` | Sideways `D` jumps | Vertical `D` jumps |
| `BsDvmD` | Sideways and vertical `D` jumps | Sideways `D` jumps |

Quiet-only components cannot give check; capture-only components can attack
the royal king even though they do not allow quiet landings. Ordinary bishop
diagonals retain their usual moves, captures and checking ability.

`BsDvmD` rotates the capture emphasis of `BsmDvD`: both can jump quietly in
all four orthogonal directions, while their added captures are sideways or
vertical, respectively.

The six candidates and unchanged **Hopping bishop `BgB0`** face the fixed
**Two-step pawn, King-step pawn and Pawn grant**. The quiet/capture splits
test different uses of the same short-range geometry without adding a
color-changing move.

## Knight designs and earlier evidence

All seven designs retain ordinary knight jumps. `Z` is the (2,3) zebra jump,
`A` the two-square diagonal jump and `G` the three-square diagonal jump.
Their added jumps can both move and capture; friendly destinations remain
unavailable.

| Movement | Added ability |
| --- | --- |
| `NZ` | All eight zebra jumps |
| `NZA` | All eight zebra jumps and all four `A` jumps |
| `NfhZfA` | Four forward-half zebra jumps and two forward `A` jumps |
| `NfhZfAfG` | The same, plus two forward `G` jumps |
| `NfZsZfA` | Six zebra directions, omitting tall backward jumps, plus forward `A` jumps |
| `NfhZ` | Four forward-half zebra jumps |
| `NsZfZ` | Six zebra directions, omitting tall backward jumps |

The confirmed spelling is **`NfhZfAfG`**, with lowercase `h`. Uppercase `H`
would be a separate three-square orthogonal jump and would leave `Z` fully
unrestricted. The engines' `fhZ` includes both wide-forward and tall-forward
zebra jumps. Forward directions are relative to the piece's color.

The [V18 thirty-two-case study](v18-prepanel32-review.md) actually found `NZ`
near the L3 target at **52.34%**, including 64.06% against Vanguard. `NZA`
has the same movement as that study's `NAZ`, which scored **81.64%**. They
are potentially strong comparison points here, not designs already known to
be weak at L2. The old study used 40k nodes but L3 opponents, another opening
book and 1663/1877 knight priors. This new two-point bracket uses 1203/1352;
the historical outcomes are not pooled or treated as a pure price-effect test.

The seven candidates and unchanged **Nightrider `N0` / Dabbaba knight `NDmW`**
face the fixed **Quiet-tall Knight pawn, Rank pawn and Bishop grant**.

## Protocol and commands

Search uses **40k nodes, Skill 20, one thread, 32 MiB hash** and a 400-ply cap.
Four workers remain the default. Candidates and controls share fixed family
priors: **1480 MG / 1302 EG** for L1 bishops and **1203 / 1352** for L2
knights. Fixed references retain their own values. These are engine search
settings, not fitted material estimates or purchase costs.

Eight shared openings schedule **336 bishop games and 432 knight games**,
768 combined. Targets 8/16/32/64 are total openings. Eight cases screen for
large outliers; they do not establish precise balance. Each retained batch
covers the same eight structural opening families. The related prefixes are
not independent samples of all possible positions; conditional ranges also
exclude systematic engine and protocol bias.

After pulling `version_19`, run these in separate new folders, one study at
a time. The examples use one worker alongside the existing panel runs:

```powershell
npm.cmd run balance:v19:minors -- --study bishops1 --out balance-results/v19-minor-bishops1 --openings 8 --jobs 1
npm.cmd run balance:v19:minors -- --study knights2 --out balance-results/v19-minor-knights2 --openings 8 --jobs 1
```

Resume or extend a target, regenerate a report without engines, or validate
without playing:

```powershell
npm.cmd run balance:v19:minors -- --study bishops1 --resume balance-results/v19-minor-bishops1
npm.cmd run balance:v19:minors -- --study bishops1 --resume balance-results/v19-minor-bishops1 --openings 16
npm.cmd run balance:v19:minors -- --study bishops1 --report balance-results/v19-minor-bishops1
npm.cmd run balance:v19:minors -- --study bishops1 --check --openings 8
npm.cmd run balance:v19:minors -- --study knights2 --check --openings 8
```

For knights, retain `--study knights2` and the knight output folder on
continuation. Keep each entire run folder, including its owned runtime and
batch journals. Earlier panel or trial folders require their original command.
Reports preserve overall and per-reference scores, physical colors,
conditional ranges, incomplete pairs and first post-opening evaluations.
Diagnostic flags do not select favorable openings or correct results.

Accepted alternatives would enter a separately declared successor panel.
Reuse of unchanged matches requires verified rules, armies, priors,
engine/search settings, openings and complete color pairs, with original
records and provenance retained. This study neither implements that importer
nor automatically changes the playable roster.

Release validation passes all 146 version-19 tests and native/browser
preflight for all 6,144 declared army/color/opening cells through 64 openings.
The 13 new bodies also pass 1,664 opening-prefix replays. The 91 prior files,
24 roster-004 panel contexts and 32 earlier queen/rook and sideways contexts
retain their recorded bytes. No scored cloud games were started.
