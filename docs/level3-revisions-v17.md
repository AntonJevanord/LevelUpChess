# Six new level-three trials

This **768-game** screen follows the completed 6,752-game campaign. Each new
design faces all four frozen references over sixteen color-swapped opening cases:
6 designs × 4 references × 16 cases × 2 colors. Every army spends three points.
There are no experimental-versus-experimental games, unchanged roster reruns or
additional Nightrider games.

| Trial | Movement | Placement | Applied engine-value policy |
| --- | --- | --- | --- |
| Blocked Vertical bishop | `BvW2vnN` | Replace c1/family bishop | Preserve old Vertical bishop applied values |
| Sideways Queen pawn | `mQ2cfQ2` | Replace d2 pawn | Preserve old Queen pawn applied values |
| Rook-ray queen | `QgR0` | Replace d1 queen | Preserve old X-ray queen applied values |
| King grant | `K` | One finite nonroyal reserve | Measured automatic raw custom-piece values |
| Three-step Orthogonal grant | `W3` | One finite nonroyal reserve | Preserve old W3 bracket values (563/635) |
| Knight grant | `N` | One finite nonroyal reserve | Measured automatic raw custom-piece values |

All six are new immutable IDs; earlier movement/price definitions remain available.
The Rook-ray queen hops over one hurdle along orthogonal rook rays; diagonal
queen paths still need to be clear. It has no added quiet knight jump.
The Queen pawn moves quietly up to two squares in any queen direction and
captures up to two squares forward, including forward diagonals. Its pawn status
and standard promotions remain. The bishop's tall knight route is blocked on the
first vertical leg; vertical two-square moves are clear-path slides.

The all-direction `QgQ0` trial was rejected before any scientific games: from
the initial position it could force `Qh5+ g6 Qe5#`. Its archived definition is
retained only for the opening-mate regression and is excluded from this screen,
its calibration and playable selection. Initial-position safety regressions
are checked separately from the fixed opening book.

Vanguard occupies a1, Unicorn b1, Cruisader c1 and Amazon d1 when selected. Black
positions are vertically reflected. Royal kings remain ordinary. Grants start
in reserve, spend a turn to deploy onto an empty square in their own half and
cannot give check on deployment. Captures never refill reserves; grants are
capturable, nonroyal and cannot promote. All matchups use this same finite-drop
profile, including those that start without a reserve.

The [new valuation receipt](../experiments/designs/v17-level3-revision-values.json)
preserves the old 72-entry calibration unchanged. It records original automatic
tables for every trial and reference, applied MG/EG values, the native engine hash
and its diagnostic profile. The four references keep their exact frozen six-table
values. These are declared search priors, not measured material prices or point
costs; no values are fitted from outcomes. K and N are **custom nonroyal pieces**,
so their calibration is read from the custom definitions rather than ordinary
chess's royal king or knight tables.

The sixteen [fixed two-ply cases](../experiments/balance/v17-level2-bridge-openings.json)
are the common, predeclared holdout for this screen and the separate 384-game
level-two validation. They are fresh relative to the completed 6,752-game campaign
and earlier canonical declarations. They do not become new cases again when one
of these studies finishes first. No earlier games are appended or replayed here.

```powershell
Set-Location 'D:\Chess\LevelUpChess'
git pull --ff-only
npm.cmd run balance:level3:revisions -- --check
npm.cmd run balance:level3:revisions -- --out balance-results/level3-revisions-v17 --jobs 4
```

The launch repeats full preflight, so the separate `--check` is optional.
`--check --rules-only` checks browser rules without native proof; `--engine PATH`
or `FAIRY_STOCKFISH_PATH` selects a compatible native executable. Launch this
separately from the level-two run; use four workers total on the current laptop.
Preflight checks movement, drops, promotions, native legal sets and all six
applied tables for both colors, without playing scored games.

```powershell
npm.cmd run balance:level3:revisions -- --resume balance-results/level3-revisions-v17
npm.cmd run balance:level3:revisions -- --report balance-results/level3-revisions-v17
```

The runner retains fixed static worker assignments and fresh separate engines.
q / Ctrl+C stops now; g finishes active games; p finishes active color pairs.
Resume preserves jobs, rules, node budgets, values and native/source identities.
The budget is fixed at 20,000 nodes per move, one search thread, 32 MiB hash,
Skill 20 and 400 total plies including the forced prefix.

`v17-report.md` contains the six-by-four matchup matrix, overall scores over shared
complete cases, fixed eight-case halves, physical White/Black scores and W/D/L,
excluded/truncated counts, and the automatic/applied search-value table. JSON preserves the full context and value audit;
CSV lists each declared matchup. Missing partners and unscored games do not turn
into draws or enter color summaries. Treat sixteen cases as descriptive evidence;
follow up on a repeated design concern rather than forcing every matchup to 50%.
