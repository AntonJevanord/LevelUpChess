# Follow-up decisions and version-17 closeout

All **3,328 uploaded games completed on attempt 1**, with 1,664 complete color
pairs and no errors or move-limit truncations. The three uploaded reports match
their journals. Scores count draws as half a point; node budgets remain separate.

## Level-two references

Select the **quiet-tall Knight pawn** `ifmnDfmWfceFfsNfmN` at cost two, under its
existing immutable ID `pawn.knight-tall-quiet@1`. Wide forward knight jumps still
move and capture; tall forward knight jumps move without capturing. The initial
double advance, declared en passant and standard Q/R/B/N promotion remain.

| Knight-pawn body | Score | W / D / L | Games |
| --- | ---: | :--- | ---: |
| Original control | 61.65% | 420 / 107 / 241 | 768 |
| Tall captures only | 55.01% | 367 / 111 / 290 | 768 |
| Tall quiet only — selected | 49.93% | 327 / 113 / 328 | 768 |

The selected pawn scores **50.26% / 49.61%** over the two fixed eight-opening
halves. Its Two-step pawn, King-step pawn and Pawn-grant partnerships score
**49.22%, 53.91% and 46.68%**. These repeated results support the selection more
than proximity to exactly 50% alone.

Opponent averages remain contextual: Vanguard **42.19%**, Unicorn **57.55%**,
Crusader **51.04%**, Amazon **48.96%**. Physical White/Black scores are
**58.20% / 41.67%**; the level-two pawn's e/c placements score **46.88% / 52.99%**.
Record those differences for future mixed-bracket validation without opening
another refinement run now.

The new [level-two reference selection](../experiments/designs/level2-references-v17-002.json)
retains Rank pawn and Diagonal grant. The Knight pawn keeps the controlled
536/592 MG/EG prior; these engine units are search settings, not fitted material
values. Existing level-one and four frozen level-three reference declarations
remain intact.

This selection is versioned for future campaigns. The earlier level-two
declaration, active catalog and running panel stay fixed. Activate the selected
definition in the playable roster and new mixed campaigns during closeout,
after the panel has finished.

## Level-three decisions

| Body | 40k score | 80k score | Decision |
| --- | ---: | ---: | --- |
| Cataphract, `RsCfC` | 49.61% | 52.34% | Preferred revision for final panel review |
| Cataphract, `RfhC` | 38.67% | 39.84% | Park this restriction |
| Nightrider control, `N0` | 31.64% | 36.72% | Keep its existing exploration role pending closeout |
| Diagonal-capture Nightrider, `N0cF` | 65.63% | 62.11% | Park; no further small-move trials scheduled |

Each cell contains 128 games against the four frozen references on sixteen
matched opening cases. The Cataphract study has no fresh `RC` control; its original
panel results remain separate. `RsCfC` retains six camel jumps, removing only the
two tall backward jumps, and preserves rook movement and castling. Hold the
playable replacement until the existing panel's final review.

The Nightrider confirmation finds a **−3.52 percentage-point** change for `N0cF`
from 40k to 80k, with a conditional opening-block range of **−13.67 to +6.64**.
Its advantage over the fresh control changes by **−8.59 points**, with a range
of **−21.48 to +4.30**. The discovery cohort's large 80k rise did not replicate;
the revision is strong at both confirmation budgets. Neither result requires
trying quiet orthogonal steps or pawn-like captures now. Reopen the design only
for a clear gameplay idea or a decision-relevant mixed-bracket result.

## Finish version 17, then start version 18

1. Recover the first **32-opening / 10,560-game** panel snapshot and review its
   matchup and material reports. The campaign has since been extended to 64;
   recovering the earlier outcome cohort does not require completing the
   extension. Preserve its original source and value identities.
2. Decide the final Cataphract roster revision and retain an explicit exploration
   status for the original Nightrider. Do not turn Cataphract into a fifth frozen
   level-three reference without a separate decision.
3. Activate the selected Knight pawn in a new playable profile, complete roster
   notes and concise documentation cleanup, then run the relevant rule, save,
   engine and browser checks. Historical definitions and owned research runtimes
   remain reproducible.
4. Tag the version-17 closeout and branch version 18. Start its mixed-bracket
   validation from the fixed level-one, revised level-two and original level-three
   reference sets. Declare the next bounded question before collecting more games;
   these follow-ups do not launch another automatic chain.

## Saved evidence

The [archive audit](../experiments/balance/results/v17-targeted-followups-001.audit.json)
retains all three derived reports with checksums for the lossless original
journals and uploaded Markdown. The [original protocol](targeted-followups-v17.md)
retains its commands and fixed schedule.

The uploads do not contain the original campaign/stage manifests, runtime
receipts or native preflight files. Reconstructed declarations establish
compatibility with the recorded profiles, openings, strengths and evaluation
settings; they do not attest the original executable or independently replay
every move. No new engine games or material estimates are produced in this review.
