# Targeted reference follow-ups

Completed: all **3,328 games** finalized without errors or truncations. See the
[decisions and closeout plan](v17-followup-decisions.md) before starting another
copy. The original fixed protocol follows.

Three fixed studies address the repeated Knight-pawn signal, the diagonal
Nightrider's search sensitivity and restricted Cataphract movement. They prepare
new evidence; they do not change the playable roster or running panel.

| Study | Designs | Nodes per move | Games |
| --- | --- | ---: | ---: |
| Level-two follow-up | Current Knight pawn and two tall-jump restrictions | 20,000 | 2,304 |
| Nightrider confirmation | `N0` and `N0cF` | 40,000 / 80,000 | 512 |
| Cataphract restrictions | `RsCfC` and `RfhC` | 40,000 / 80,000 | 512 |

All three use cases **33–48** from the fixed panel book, both physical colors
and Vanguard, Unicorn, Crusader and Amazon as the four opponents. These sixteen
cases are outside the ongoing panel's first 32 and the Nightrider discovery
study's cases 57–64. Reusing a declared case between studies does not turn it into
another independent opening. Experimental designs face references, not each other.

## Knight-pawn follow-up

The completed mixed study gives the Knight pawn a **63.28%** equal-partner score;
Rank pawn and Diagonal grant score **46.59%** and **54.45%** in their recorded
contexts. This follow-up narrows the Knight pawn without redesigning the other
two working level-two references.

| Design | Exact movement |
| --- | --- |
| Current control | `fmWfceFifmnDfhN` |
| Tall captures only | `ifmnDfmWfceFfsNfceN` |
| Tall quiet moves only | `ifmnDfmWfceFfsNfmN` |

Both revisions retain full wide forward knight jumps (`fsN`). The tall jumps
become capture-only or quiet-only; ordinary pawn movement, declared en passant
and standard Q/R/B/N promotion remain.

Each body partners with Two-step pawn, King-step pawn and Pawn grant. Every team
uses both c/e placement layouts, with Black vertically reflected. That gives
3 bodies × 3 partners × 2 layouts × 4 references × 16 openings × 2 colors =
**2,304 games** at 20k nodes. The fresh current-body games provide a matched
control; earlier mixed games remain separate evidence.

All three bodies share the current Knight pawn's applied **536/592 MG/EG**
search prior. Partner and reference priors retain their existing values.

## Nightrider confirmation

The original `N0` and diagonal-capture `N0cF` each play four references over the
same sixteen openings at 40k and 80k: 2 bodies × 4 references × 16 openings ×
2 colors × 2 budgets = **512 games**. Both bodies keep the original **2326/2211**
prior. The consistently stronger orthogonal-capture version is excluded.

Keep this confirmation separate from the eight-case discovery study. Compare
the revision's gain over its fresh control and the matched 40k-to-80k changes;
an advantage over `N0` alone does not establish a search-budget effect.

## Cataphract restrictions

`RsCfC` keeps six camel jumps: four sideways jumps and the two tall forward
jumps. It removes only the two tall backward jumps. `RfhC` keeps the four
forward camel jumps and removes every backward camel jump. Both retain ordinary
rook movement, capture and castling roles; forward is relative to the owner.

The two restrictions each face four references over sixteen openings at 40k and
80k, again **512 games**. Both share original `RC`'s applied **2240/2413** prior.
Automatic movement-based estimates are distinct from these controlled priors.

The original `RC` remains a benchmark in the separate complete panel. It is
**not a fresh control in these 512 games**; its historical score is not merged
into this report or treated as matched confirmation data.

## Run on Windows

Finish the active panel first, then run **one study at a time**, with four
workers total. Pull the prepared code and use new result folders:

```powershell
git pull --ff-only
npm.cmd run balance:level2:followup -- --out balance-results/knight-pawn-followup --jobs 4
npm.cmd run balance:nightrider:confirm -- --out balance-results/nightrider-confirm --jobs 4
npm.cmd run balance:cataphract -- --out balance-results/cataphract-followup --jobs 4
```

Run each line when the preceding study has finished. Each command starts only
its named study; the commands are not an automatic queue. Launch performs native
movement, opening and value preflight. Use `--check` to validate without playing
games, or `--check --rules-only` to omit native proof. `--engine PATH` or
`FAIRY_STOCKFISH_PATH` selects a compatible native engine.

All commands support the same continuation and offline report modes. For example:

```powershell
npm.cmd run balance:level2:followup -- --resume balance-results/knight-pawn-followup
npm.cmd run balance:nightrider:confirm -- --report balance-results/nightrider-confirm
```

**q / Ctrl+C** stops now, **g** finishes active games and **p** finishes active
color pairs. A stop, failure or unfinished stage pauses the entire study before
its next budget. Starts and results print by default; `--log plies` adds moves.
Keep the complete result folder, including `runtime` and original stage folders.

Each study owns an immutable source/rules/dependency snapshot. Resume uses that
snapshot and its recorded worker count, engine and identities. The project's
active catalog, panel controller and balance bundle remain unchanged.

## Read the results

`followup-report.md` and JSON keep node budgets separate and show overall scores
and reference matchups. Knight-pawn reports also retain partner, placement and
physical-color results. Paired revision comparisons require common completed
opening/color cases; draws count half a point and truncations stay unscored.

Sixteen fixed openings provide a bounded design comparison, not an intrinsic
material price. Conditional opening-block ranges leave engine and protocol bias
outside their scope. Review these declared results before changing a body,
price or search prior; no study automatically tunes pieces or schedules more games.
