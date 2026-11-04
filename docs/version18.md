# Version 18

Branch **`version_18`** starts from the version-17 closeout, **`v0.17.23`**.
Version 17 retains its tested playable roster and all nineteen original
profiles. The two selected replacements enter the new **Version 18 · Roster
and king trials** library, released at **`v0.18.0`**.

| Piece | Cost | Movement | Immutable ID |
| --- | ---: | --- | --- |
| Knight pawn | 2 | `ifmnDfmWfceFfsNfmN` | `pawn.knight-tall-quiet@1` |
| Cataphract | 3 | `RsCfC` | `rook.cataphract-no-tall-back@1` |

Knight pawn keeps normal pawn moves and captures. Its wide forward knight
jumps can move or capture; its tall forward knight jumps only land on empty
squares. Initial double advances, ordinary diagonal en passant and standard
Q/R/B/N promotions remain.

Cataphract keeps rook movement and castling. It has six camel jumps, including
the wide backward jumps; the two tall backward jumps are removed. Camel jumps
cross intervening pieces and can capture.

The new library retains the other accepted roster pieces, working Warden and
guard trials. Vanguard, Unicorn, Crusader and Amazon remain the four frozen
level-three references. Nightrider and Wraith stay available as exploration
choices. Earlier libraries remain selectable with their original behavior.

The selected Knight pawn retains its tested **536/592 MG/EG** engine prior;
Cataphract retains **2240/2413**. These search settings are separate from
purchase costs and fitted material estimates. New profiles do not relabel old
games or inherit the predecessors' experimental results.

Verification preserves all nineteen earlier profile/INI pairs, checks 204
native/browser move fixtures and both colors' native value tables, and covers
setup, saved games, PGN, undo and legal engine replies. Thirteen browser checks
include both the new roster and historical controls.

## Switch and play on Windows

Stop the local server, then run these commands in the project folder:

```powershell
git fetch origin
git switch version_18
git pull --ff-only
npm.cmd ci
npm.cmd start
```

If Git reports local changes, inspect `git status`. Changes you want to keep
temporarily can be stashed with `git stash push -m "Before version 18"` before
switching. Existing untracked `balance-results` folders remain local.

Open the printed address and choose **Version 18 · Roster and king trials**
under **Rules**. Local two-player games also work by opening `index.html`
directly. Use version-17 libraries or branch `version_17` to revisit the old
roster.

## Next balance question

Start with a fixed mixed-army question: do equal purchase budgets remain
roughly competitive when the selected level-one, level-two and level-three
references appear in different combinations? Freeze the roster, placements,
search priors and schedule before collecting games. Keep both colors and
matched openings together, and report opponent and partner effects separately.

Use eight varied openings to find gross outliers, then a declared 32-opening
confirmation when the decision needs it. Reserve 64 openings or higher search
budgets for borderline or tactically sensitive questions. More openings reduce
sampling uncertainty; more search checks engine limitations. Neither makes
conditional scores intrinsic piece Elo or material prices.

This roster release starts no new balance games. Runner work—incremental
aggregation, less hidden progress traffic and central pair dispatch—should be
measured separately from piece changes. The completed
[engine-sharing benchmark](engine-sharing-benchmark-v18.md) supports retaining
separate White/Black engines as the current default.
