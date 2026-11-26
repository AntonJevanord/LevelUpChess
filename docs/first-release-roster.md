# First public roster: proposal

Start with **18 upgrades: fifteen board designs and three king grants**.
Board pieces get one choice at each of levels 1–3. The initial grants may have
different costs, for example 1, 3 and 6, chosen after costs 1–6 are settled.
Choose clear rules, useful counterplay and a manageable learning curve, then
check the mixed armies. Keep the full research roster available for experiments.
This document records a release proposal; it does not change playable rules,
engine priors, reference baskets or completed reports.

## Launch candidates

| Upgrade family | Level 1 | Level 2 | Level 3 |
| --- | --- | --- | --- |
| Pawn | **Strider** | **Flanker** | **Ranger** |
| Knight | **Cavalier** | **Nightrider** | **Unicorn** |
| Bishop | **Abbot** | **Templar** | **Crusader** |
| Rook | **Halberdier** | **Wayfarer — recommendation** | **Vanguard** |
| Queen | **Huntress** | **Enchantress — recommendation** | **Amazon** |

The board choices follow the user's shortlist. L2 rook/queen are still design
decisions. Three separately selected grants complete the eighteen slots;
their launch costs need not be 1, 2 and 3. Choose a
[release deployment policy](grant-deployment-options.md) and settle all six
lower-cost grant packages before selecting that trio. Upgrading a king purchases a nonroyal reserve piece;
the ordinary royal king retains its moves, check rules and castling.

This set has a useful teaching sequence: extend pawn movement, combine familiar
steps with knights/bishops, introduce repeat knight leaps, then familiar
compounds. Crusader's blocked knight leg still needs a clear diagram.
Ranger's quiet orthogonal movement and forward diagonal captures also need
separate move/capture indicators.

## L2 rook and queen

Scores below come from the [completed expanded panels](v19-expanded-panel-review.md).
They count draws as half a point. Whole-roster and fixed-reference baskets are
different comparisons; neither is a universal strength rating.

| Candidate | Whole-roster score | Fixed-reference score | Release tradeoff |
| --- | ---: | ---: | --- |
| Wayfarer | 47.07% | 47.66% | Good existing balance; teach its quiet teleport region. |
| Full Arbalest `RcN` | 60.60% | 66.41% | Very simple extra capture pattern, but consistently strong in these games. |
| Restricted Arbalest `RcsNcfN` | 50.59% | 50.54% | Closer engine balance, with a directional exception to learn. |
| Enchantress `QcC` | 52.93% | 56.77% | One added capture pattern; recommended queen. |
| Matriarch `QsDsNA` | 47.21% | 49.22% | Plausible alternative with more jump components. |

**Tentatively prefer Wayfarer and Enchantress.** Wayfarer's long Betza string
has a relatively short human rule: ordinary rook moves/captures, plus quiet
jumps to any empty square up to three files and three ranks away. The added jumps
cannot capture. A diagram can make that region easier to learn than the code
suggests. Test whether this works in practice before choosing it over Arbalest.

Full Arbalest remains a useful human-playtest candidate. Keep full and
restricted revisions distinct. A rarely played backward move can still defend
a square, prevent a fork or alter an exchange. The engine results show a real
design tradeoff; they do not establish statistical overfitting or prove that
human players will need the same restriction.
Before later waves, compare the full-movement Horseman and Cataphract ideas
with their restricted counterparts too. Keep the existing definitions and
evidence separate; no movement changes are approved by this launch proposal.

## What remains to validate

- **Strider:** 42.51% across the expanded L1 roster. Its simple identity is
  appealing, but check whether it delivers enough value in mixed armies.
- **Templar:** 57.45% across L2. Watch its coordination with Flanker and its
  contribution when several purchases share a budget.
- **Warden:** 63.61% across L3, with a conditional 61.49%–65.72% range. Treat
  its price/deployment strength as an open launch decision. That result uses
  the existing research drop policy; it does not predict a gated or rank-two version.

These are reports from historical/new contexts, not a new uniform experiment.
Their ranges omit engine/context bias. The launch subset has a different
opponent basket, so its averages must not be inferred by renaming the old
whole-roster scores. Grant material fitting currently excludes entire grant
matchups; [outcomes and deployment](v19-material-estimates.md#reserve-grants)
remain the primary evidence for grants.

Start with the [L1+L2 versus L3 panel](v19-cross-level-panel.md), then consider
three L2 versus two L3 and ordinary-army/unequal-budget anchors. Respect
starting-square capacity and report partner and placement effects. Keep shared
openings, color pairs and the 40k-node policy. Review the first eight openings,
then sixteen; extend the unchanged declaration to 32/64 only when the remaining
uncertainty could change a release decision.

Human playtesting should record explanation mistakes, unexpected attacks,
available counterplay, enjoyment and outcomes. Swap colors and keep opponent
strength reasonably steady. A handful of human games can expose an unpleasant
design, but cannot establish a precise win rate. Begin with a small comparison
of full Arbalest, restricted Arbalest and Wayfarer instead of another broad
engine sweep of every directional variation.

## Three release waves

Keep **one king grant at each numbered cost**. Two board choices at each of
levels 1–3 for five families produce thirty board upgrades. Six grants give
an intermediate total of **36**; extending grants through cost 9 gives the
new long-term target of **30 board upgrades + 9 grants = 39**.

The launch trio need not contain the cheapest three grants. If it uses costs
1/3/6, one possible schedule fills costs 2/4/5 while introducing 7/8/9. That
makes **seven additions per wave**, rather than the earlier six. The named
candidates and timing remain provisional.

| Wave | Pawn alternative | Knight alternative | Bishop alternative | Rook alternative | Queen alternative | New king grants |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Squire L1 | Jouster or Galloper L2 | Inquisitor L3 | Phantom L1 | Matriarch L2 | Costs 2 and 7 |
| 2 | Herald L2 | Pegasus or Hippogriff L3 | Acolyte L1 | Arbalest L2 | Nemesis L3 | Costs 4 and 8 |
| 3 | Horseman L3 | Scout L1 | Prelate L2 | Cataphract L3 | Duchess L1 | Costs 5 and 9 |

This rotates **2/2/1**, **1/2/2** and **2/1/2** board additions across levels
1/2/3, alongside two grant additions. There is still no second grant at the
same cost. Alternatively, keep six additions per wave to reach 36, and add
costs 7–9 afterward. Existing K/KmN/K2 and NZ/KN/Q grants are historical
candidates for costs 4–9, not approved release prices or movements.
Validate them under the selected deployment policy and equal-budget packages.

Grant **purchase cost and display color are separate choices**. Select public
accents to match the release palette after choosing the grant trio; show the
actual cost as text/badge. Existing research colors and prices remain intact.

There are more named knight candidates than slots: choose one L2 alternative
to Nightrider and one L3 alternative to Unicorn. A public name does not promise
a release place; other candidates remain in the workshop. Wraith and the older
extra pawn/bishop/queen designs likewise retain their experimental identities.

## Implementation order

1. Record [public names and stable design mappings](piece-names.md). Compare
   grant deployment policies in isolation, then select the release policy.
2. Resolve L2 rook/queen and settle all grant packages at costs 1–6 through
   focused playtesting and engine comparisons. Select the initial three grants
   and their colors only after that review; develop costs 7–9 later.
3. Use the [first board-only cross-level panel](v19-cross-level-panel.md) while
   grant policy is explored. Later declare the grant-inclusive launch-candidate
   comparisons under the selected release policy, retaining the original
   reference definitions and all research libraries.
4. After review, create a separate public roster and presentation aliases.
   Eighteen custom designs fit the current twenty-custom-type engine limit,
   allowing one combined launch library with all three levels.
5. Keep later waves in a workshop until selected. The eventual 39-design
   catalogue needs per-game/group allocation of active custom types; it cannot
   be loaded wholesale into a twenty-type profile.

Keep current runtime files stable while puzzle mining is unfinished: its
receipts pin the browser/native rules facade, which also contains names.
Publish later movement changes as new design revisions with clear change notes
and retained old games/puzzles. Launch choices remain provisional until the
cross-level and human reviews are complete.
