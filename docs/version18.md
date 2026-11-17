# Version 18

Version 18 is closed at **`v0.18.14`** on **`version_18`**. Its interface,
twenty playable libraries, completed screening data and retrospective opening
diagnostic remain available. [Version 19](version19-plan.md) carries the
accepted roster into new profiles and separate tier panels.

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

## Screening closeout

The [accepted shortlist](v18-lower-tier-shortlist.md) and
[final alternatives review](v18-prepanel32-review.md) conclude pre-panel
screening. The final choices are L3 **NAD** and L2 **NDmW, QcC and BsR**.
L1 retains QfN/QvN; the original references and Wraith's deliberately weaker
exploration role remain. Trial outcomes retain their exact rules, search
priors, placements and opening contexts.

The [opening diagnostic](opening-diagnostics.md) replays recorded prefixes
and inspects pins and capture candidates, with optional native evaluation.
Flags do not adjust recorded win rates or select a separate book per matchup.

Version 19 begins with separate same-tier panels at sixteen shared openings,
then unchanged 32/64-opening extensions where useful, before cross-level and
mixed armies. The completed
[engine-sharing benchmark](engine-sharing-benchmark-v18.md) supports retaining
separate White/Black engines as the current default.
