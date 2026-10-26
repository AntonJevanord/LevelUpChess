# Next level-3 balance pass

Version 16 is closed. The earlier candidate round-robin proposal is superseded
by the [official fixed-reference policy](../../docs/official-references.md).
This note schedules no games and declares no new budget.

## Frozen references and candidate pool

| Role | Purchase |
| --- | --- |
| Reference rook | Vanguard, `rook.purple@10` (`RfB`) |
| Reference knight | Unicorn, `knight.purple@3` (`NC`) |
| Reference bishop | Cruisader, `bishop.purple@13` (`BsR2nsN`) |
| Reference queen | Amazon, `queen.purple@1` (`QN`) |
| Candidate mobile pawns | Ranging `pawn.purple@7` and/or Courier `pawn.purple@8` |
| Candidate Rank pawn | Wide-knight version, `pawn.purple@9` |
| Candidate Vertical bishop | Quiet-knight version, `bishop.purple@3` |

Use human playtesting to prune the candidate pool before collection, especially
if Ranging and Courier are too similar. Returning pawn remains optional if it
has a distinct useful role. Blink's evaluation sensitivity remains a separate
deferred question. The reference roster needs no further match games.

Keep guard knights, Twin pawns, split queens and queen companions outside this
replacement-piece batch. Preserve their historical definitions and results.
The [finite-reserve proposal](../../prototypes/reserve-guards/README.md) explores
deployment without starting congestion and with an ordinary royal king. Assess
reserve king purchases after the replacement roster is settled, using fixed
opponents and explicit drop rules; material estimates remain secondary.

## Order and reuse

1. Branch from the tested version-16 closeout. Integrate the official names and
   selected rules into a new playable library, preserving historical libraries.
2. Playtest candidates for readability, enjoyment, counterplay, promotion,
   castling and conversion. Give changed designs new immutable identities.
3. Declare one capped candidate-versus-reference campaign. Each candidate faces
   Vanguard, Unicorn, Cruisader and Amazon; experimental candidates do not face
   one another. Freeze matched positions, complete color pairs, engine values,
   search effort, checkpoints and a stopping decision before collection.
4. Reuse compatible unchanged games with their original provenance. Older
   results from different effort, evaluation or opening contexts support the
   shortlist but do not automatically enter the new dataset. Reference scores
   are not replayed merely because another candidate changes.
5. Choose keep, revise, park or defer at the cap, then develop lower tiers.
   Mixed six-point armies require a separate, explicit interaction question.
   More games require a decision they could change, not tighter numbers alone.

## Decision criteria

Use roughly 40%–60% points score as a practical screen, with draws worth half a
point. Inspect each reference matchup and its conditional uncertainty alongside
any basket average. Promotion/endgame behavior, enjoyment and counterplay also
matter. Do not require exactly 50% or every interval to fit inside the band.

Saved matchup outcomes remain unchanged when another candidate is redesigned.
New data or a changed engine, policy or opening cohort can change an estimated
rate; retain those contexts instead of treating percentages as universal piece
properties. Material fitting is optional supporting analysis with a frozen
dataset identity. It does not justify changing the evaluator to force a target.
