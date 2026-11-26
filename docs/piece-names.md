# Piece names and display convention

These are the user's preferred public names mapped to exact research designs.
They are presentation aliases for a future UI update. Current profiles, IDs,
rules, research labels and running puzzle receipts remain unchanged.
Names do not guarantee a slot in the [release plan](first-release-roster.md):
Jouster/Galloper and Pegasus/Hippogriff are competing knight alternatives.

## Display format

Use **Queen — Huntress · L1** with its green swatch and visible level badge.
The full tooltip/list label is **Queen — Huntress · Level 1 · Green**. On the
board, add army ownership: **White queen — Huntress · Level 1 · Green**.
The ordinary family tells a new player which starting piece was upgraded;
the name identifies its design; the level states its purchase cost. Upgrade
color is supplemental and distinct from White/Black army ownership.

Use **King grant — Warden · 3 points** for a reserve purchase and **White
Warden grant · 3 points · Yellow** after deployment under the current research
palette. Do not label the deployed guard as a royal king. A public grant's
color may match its release theme independently of its cost; always display
the actual numbered price, including future costs 7–9.

Keep stable IDs in saves, profiles and analysis. A rename does not create a
new movement revision. Historical reports keep their original labels; a name
index can connect them to the public aliases. While two revisions coexist in
the workshop, distinguish them explicitly, for example **Arbalest — full**
and **Arbalest — restricted**.

Colors below are the current expanded-library colors, not a proposed repaint.
Board L1 uses green/blue, L2 yellow/orange and L3 red/purple. Historical grant
colors follow their numbered sequence; public accents will be selected after
the release grants are chosen. Text and badges must communicate level/cost
without relying on color.

## Level 1

| Public name | Research ID | Movement | Current color |
| --- | --- | --- | --- |
| Strider | `pawn.blue@5` | `fmW2fceF2` | Green |
| Squire | `pawn.blue@7` | `mWFifmnD` | Blue |
| Cavalier | `knight.wazzap@1` | `NW` | Blue |
| Scout | `knight.positional-quiet-queen@1` | `NmQ` | Green |
| Acolyte | `bishop.blue@3` | `BsW` | Blue |
| Abbot | `bishop.level1-dabbaba@1` | `BD` | Green |
| Halberdier | `rook.blue@3` | `RceF` | Blue |
| Phantom | `rook.ghost-diagonal-omni@1` | `RmBgmQ0` | Green |
| Duchess | `queen.level1-wide-forward-knight@1` | `QfsN` | Blue |
| Huntress | `queen.level1-forward-knight@1` | `QfN` | Green |

Squire is the king-step **board pawn**, distinct from the Pawn grant.
The remaining hopping bishop `bishop.hopper-full-range@1` (`BgB0`) keeps its
working name while experimental.

## Level 2

| Public name | Research ID | Movement | Current color |
| --- | --- | --- | --- |
| Herald | `pawn.level2-forward-queen-only@1` | `fQ2` | Yellow |
| Flanker | `pawn.rank-current@1` | `ifmnDmfWfceFsR` | Orange |
| Nightrider | `knight.nightrider-level2@1` | `N0` | Yellow |
| Jouster | `knight.level2-forward-zebra@1` | `NfhZ` | Orange |
| Galloper | `knight.level2-nd-quiet-orthogonal@1` | `NDmW` | Orange |
| Templar | `bishop.orange@3` | `BsR` | Orange |
| Prelate | `bishop.orange@2` | `BvN` | Yellow |
| Arbalest — full | `rook.orange@3` | `RcN` | Orange |
| Arbalest — restricted | `rook.level2-no-tall-back-capture-knight@1` | `RcsNcfN` | Orange |
| Wayfarer | `rook.orange@2` | `RmFmDmAmHmGmNmCmZ` | Yellow |
| Matriarch | `queen.level2-side-knight-side-dabbaba-alfil@1` | `QsDsNA` | Yellow |
| Enchantress | `queen.level2-camel-capture@1` | `QcC` | Orange |

The user confirmed Herald for the L2 forward-range pawn. The older L3
`pawn.queen-sideways@1` (`mQ2cfQ2`), currently called Herald, needs a separate
future public name. Its historical label remains intact.

The L2 Quiet-tall Knight pawn `pawn.knight-tall-quiet@1`
(`ifmnDfmWfceFfsNfmN`) and original Wide-knight queen
`queen.level2-side-knight@1` (`QsN`) keep working names. Matriarch names the
newer sideways-diagonal alternative, rather than silently combining both.

## Level 3

| Public name | Research ID | Movement | Current color |
| --- | --- | --- | --- |
| Ranger | `pawn.purple@13` | `mRcfB` | Purple |
| Horseman | `pawn.level3-six-knight@1` | `ifmnDfmWfceFsNfN` | Red |
| Unicorn | `knight.purple@3` | `NC` | Red |
| Pegasus | `knight.level3-nad@1` | `NAD` | Purple |
| Crusader | `bishop.purple@13` | `BsR2nsN` | Red |
| Inquisitor | `bishop.vertical-blocked@1` | `BvW2vnN` | Purple |
| Cataphract | `rook.cataphract-no-tall-back@1` | `RsCfC` | Purple |
| Vanguard | `rook.purple@10` | `RfB` | Red |
| Amazon | `queen.purple@1` | `QN` | Red |
| Nemesis | `queen.level3-side-threeleap-camel-zebra-tripper@1` | `QsHsCsZG` | Purple |

The user confirmed Horseman for the L3 Six-jump pawn. Its L2 predecessor stays
separate. Wraith retains its established name for
`queen.wraith-side-through@1` (`QgmQ0gcBgcsR0`).

**Hippogriff** is reserved for full zebra-knight `NZ`. This is research-only:
`knight.level3-nz@1` and `knight.level2-zebra@1` are distinct tested identities
at different prices. The revised cross-level panel includes the L3 identity;
neither is currently an expanded playable option or a confirmed release pick.

## King grants

Keep one design at each numbered cost. Settle release packages at costs 1–6
before choosing an initial trio, for example 1/3/6. Costs 7–9 are a later goal,
bringing the catalogue to 39 upgrades. Historical movement candidates are:

| Cost | Working name | Research ID | Movement | Research color |
| --- | --- | --- | --- | --- |
| 1 | Pawn grant | `king.reserve-pawn@6` | `fWmfF` | Blue |
| 2 | Bishop grant | `king.reserve-bishop@1` | `F` | Green |
| 3 | Warden | `king.grant-wd-level3@1` | `WD` | Yellow |
| 4 | King grant | `king.reserve-king@1` | `K` | Orange |
| 5 | Knight grant | `king.reserve-knight@1` | `KmN` | Red |
| 6 | Queen grant | `king.reserve-queen@1` | `K2` | Purple |
| 7 | Okapi grant | `king.reserve-okapi@1` | `NZ` | Teal |
| 8 | Princess grant | `king.reserve-princess@1` | `KN` | Gold |
| 9 | True Queen grant | `king.reserve-true-queen@1` | `Q` | Silver |

These are existing research identities, not locked release designs under new
deployment rules. Public names for grants other than Warden remain open. The
initial release need not include all costs 1–3; later waves can fill missing
lower-cost grants while adding 7/8/9. Preserve the old reference rules and
colors when testing separate release packages.
