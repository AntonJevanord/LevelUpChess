# Version-16 playtest roster

Under **Rules**, select **Version 16 references** or a family workshop. Click a
starting piece, choose its upgrade beside the board, and press **Start game**.
**Edit armies** changes draft selections; **Return to game** preserves the active
game. Clear buttons reset either or both draft armies.

Every new library includes Vanguard `RfB`, Unicorn `NC`, Cruisader `BsR2nsN`
and Amazon `QN`, each costing three upgrade points, plus all nine king grants.
Workshops add candidates from one family so each profile fits Fairy Stockfish's
20-custom-piece limit. Shared selections carry between libraries; unavailable
choices reset. Earlier libraries and experiment identities remain unchanged.

The references are frozen. Other designs and all reserve prices are provisional.
Purchase cost is distinct from material value or an engine evaluation parameter.
This roster adds playtest options; it schedules no balance games.

## Replacement candidates

Movement strings below are exact catalog definitions. The picker describes them
in words. All candidates replace their selected starting piece. Upgraded pawns
promote to an ordinary queen, rook, bishop or knight; upgraded rooks retain normal
castling eligibility.

| Family | One point | Two points | Three points |
| --- | --- | --- | --- |
| Pawn | Bishop pawn `fmWfeFifmnD`; Returning pawn `bmWfmW2fceF` | Knight pawn `fmWfceFifmnDfhN`; King pawn `mWeFifmnD` | Rook pawn `fceF2mR`; Queen pawn `feQ2bmQ2` |
| Knight | Positional knight `NsmR`; Climbing knight `NvW` | Dabada knight `NsWsD`; Long-range knight `NA` | Nightrider `N0`; Princess knight `NK`; Grid knight `NWH` |
| Bishop | Hopping bishop `BgmB`; Wazzap bishop `BsW` | Tall-knight bishop `BvN`; Free Boar bishop `BsR` | Mating bishop `BcWcNcDcA`; Vertical bishop `BvWvNvZ`; Archbishop `BN` |
| Rook | Ghost rook `RgmR0`; Pawn rook `RceF` | Blink rook `RmFmDmAmHmGmNmCmZ`; Knight-capture rook `RcN` | Ranged rook `RC`; Side rook `RFsNsC` |
| Queen | Advancing queen `QmfhN` | Box queen `QmHmCmZmG` | Sideways queen `QsNsC`; X-ray queen `QgB0`; Zebra queen `QZ` |

Some familiar movements have new prices or deployment rules. Their new immutable
IDs keep earlier measured designs intact. The [catalog](../src/design-catalog.js)
and [library declarations](../src/playable-library.js) are the source of truth;
allocated engine letters apply only within a particular profile.

The King pawn's initial double-step is restricted to forward movement
(`ifmnD`), preserving an ordinary clear-path pawn opening instead of allowing
initial two-square moves in every orthogonal direction.

## King purchases and reserves

Select the starting king to buy one grant. The setup preview marks that purchase;
starting the game retains the ordinary royal king and puts the nonroyal guard in
the pocket. Guard costs follow the requested numbered levels, **1 through 9**.

| Cost | Grant | Guard movement |
| ---: | --- | --- |
| 1 | Pawn | `fW`: one square straight forward, moving or capturing |
| 2 | Bishop | `F`: one diagonal step |
| 3 | Rook | `W2`: one or two clear squares orthogonally |
| 4 | King | `K`: one step in any direction |
| 5 | Knight | `KmN`: king steps plus quiet knight jumps |
| 6 | Queen | `K2`: one or two clear squares in any queen direction |
| 7 | Okapi | `NZ`: knight and zebra jumps |
| 8 | Princess | `KN`: king steps and knight jumps |
| 9 | True queen | `Q`: normal queen movement |

A drop uses a turn and an empty square on ranks 1–4 for White or 5–8 for Black.
It must resolve any check on the royal king and cannot give check on deployment.
After deployment the guard can give check normally. Captures remove pieces
permanently; they do not refill pockets. Guards are capturable and cannot castle.
They do not inherit pawn promotion merely because a grant is named “Pawn.”

Balance tools can start directly from a FEN with guards already in the pocket;
they need no temporary upgraded king or second board. Laboratory bundles with
several grants require their own declared budget, setup and collection protocol.
No such scored campaign is launched by this closeout. Reserve strength will be
judged primarily from outcomes after the replacement roster is settled.

The [version-17 plan](mixed-army-balance-plan.md) covers reference combinations,
mixed-army ratings and later reserve testing. Existing reference matchup tables
and material estimates are unchanged.
