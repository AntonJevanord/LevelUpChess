# Version-17 experiments

Version 16 is preserved as branch `version_16` and tag `v0.16.7`. Version 17
starts with three separate outcome experiments. Each command runs only the
selected experiment; completing one does not launch the next.

| Experiment | Question | Comparisons | Openings | Games |
| --- | --- | ---: | ---: | ---: |
| `level3` | Which of the 13 current level-3 replacement candidates are obvious outliers against the four references? | 52 | 8 | 832 |
| `reference-2v2` | How do combinations of the frozen references perform? | 15 | 8 | 240 |
| `pawn-grants` | How do three one-point pawn upgrades compare with three pawn guards and the references? | 15 | 8 | 240 |

Every opening is played with colors swapped. Total cap: **1,312 games**.
Search uses 20,000 nodes per move, one thread per engine, 32 MiB hash, Skill 20
and a 400-ply cap. Native movement and evaluation-table checks precede play.
Automatic engine values are recorded; they are separate from purchase costs
and empirical material estimates.

The eight starts are the ordinary starting position plus seven short prefixes:
`e4 e5`, `d4 d5`, `e4 c5`, `c4 e5`, `Nf3 Nf6`, `b3 b6` and `g3 g6`.
All prefixes are validated under every scheduled army. The unforced start lets
guards deploy from move one; the other starts require one ordinary move by
each side before free play, including drops.

Eight opening groups support an initial screen. Scores describe
these starts and engine settings; a roughly even score does not establish
precise balance. Keep truncated games, errors and incomplete color pairs
visible and unscored. Review the results before declaring another campaign.

## Run on Windows

Switch to the new branch before starting a campaign:

```powershell
git fetch origin
git switch version_17
git pull --ff-only
```

Check and then run the level-3 screen:

```powershell
npm.cmd run balance:v17 -- --experiment level3 --check
npm.cmd run balance:v17 -- --experiment level3 --out balance-results/v17-level3 --jobs 4
```

Use `reference-2v2` with a new `balance-results/v17-reference-2v2` folder for
the second experiment, or `pawn-grants` with `balance-results/v17-pawn-grants`
for the third. Run one campaign at a time with four jobs on the established PC.
`--check` validates without playing games. New runs require an unused folder.

Resume or create an offline report:

```powershell
npm.cmd run balance:v17 -- --experiment level3 --resume balance-results/v17-level3
npm.cmd run balance:v17 -- --experiment level3 --report balance-results/v17-level3
```

The standard controls remain: **q / Ctrl+C** stops immediately, **g** finishes
active games and **p** finishes active color pairs. Finished-game output names
the winner and current matchup score. Worker assignments and run identities
stay fixed on resume. Retain the complete run folder and use its original
checkout; old version-16 runs remain on their matching branch.

## Armies and reports

The level-3 screen uses the current replacement candidates from all five
family workshops, excluding extra-unit king grants. All 17 custom types fit
one profile. Candidate-versus-candidate games and repeat reference-only games
are absent from this screen. The report compares each candidate with Vanguard,
Unicorn, Cruisader and Amazon.

The 2v2 armies are Vanguard–Unicorn, Vanguard–Cruisader, Vanguard–Amazon,
Unicorn–Cruisader, Unicorn–Amazon and Cruisader–Amazon. Every distinct army
pair meets. These six-point armies use the existing `a1`, `b1`, `c1` and `d1`
slots, mirrored for Black. Same-family stacking and extra starting queens are
outside this pilot. The resulting table measures team matchups; it does not
by itself identify every individual contribution or partnership effect.

The final experiment uses three three-point bundles:

- Bishop pawns: upgrade `c2`, `d2` and `e2` with `pawn.blue@2`.
- Returning pawns: upgrade the same files with `pawn.blue@3`.
- Pawn guards: keep the ordinary army and start with three `fW` guards in reserve.

Each bundle faces all four references (192 games). The three direct bundle
pairings add 48 games. The fixed central files are part of this protocol;
robustness on other files can be a later declared question.

Reports retain paired W/D/L, scores, opening coverage and missing results.
They provide readable matchup tables plus JSON/CSV exports. These experiments
do not calculate material values or update individual Elo ratings.

## Reserve integration

New balance schema 3 declares finite quantities directly, for example:

```json
{"upgrades": {}, "reserve": [{"id": "king.reserve-pawn@1", "count": 3}]}
```

There is always one ordinary royal king per side. The starting FEN already
contains the guards in its pocket; no temporary upgraded king is needed.
Drops use a turn and an empty square in the owner's half, must resolve check,
and cannot give check on deployment. Captures disappear and never refill pockets.

The runner must preserve pocket FENs, drop UCI/SAN, legal replay, repetition,
draw handling, stop/resume state and native capability proofs. Reserve IDs and
counts belong to the frozen army identity and budget. Schema 3 supports up to
nine combined purchase points; these experiments use three or six. Schema 2
keeps its six-point design limit; schema 1 retains its legacy rules.

The existing material estimator rejects reserve profiles because it does not
model pocket material or deployment tempo. Reserve balancing uses game outcomes
until a separate pocket-aware material method is declared.

Preparation checks passed native/browser parity at all 1,312 scheduled starts
and opening positions, plus 196 movement capability fixtures. Bounded serial
and parallel checks verified interrupted/resumed drops and durable reports.
These functional checks produced no scored experiment games.
