# Revision 1: rook confirmation and batch decision

Recorded 2026-10-21 from the owner's uploaded [summary](revision-1-rook-confirmation-001.summary.json) and game journal. Confirmation run ID: `2f25fb97-c31c-4cb9-942b-8279809653e9`.

All **60 scheduled games completed**: two rook comparisons and ordinary control, each with 20 games and ten complete color-swapped pairs. There were no errors, truncations, aborts, invalid records, duplicate completions, or partial/invalid pairs. The summary recomputes exactly from the journal.

## Results

The revised purple rook (`rook.purple@2`, ordinary rook plus capture-only knight jumps) is **Army A** on a1. Blue minors upgrades b1/g1 knights and c1 bishop; blue-plus-orange upgrades the b1 knight and a1 rook. All other pieces remain ordinary, with three upgrade points per side. Squares are relative and mirrored for Black.

| Opponent | Screening A score | Confirmation A score | Combined A W / D / L | Combined A score |
| --- | ---: | ---: | ---: | ---: |
| Three blue minor upgrades | 80% | 90% | 32 / 4 / 4 | **85%** |
| Blue knight + orange rook | 70% | 52.5% | 20 / 9 / 11 | **61.25%** |
| Ordinary control | 50% | 50% | 8 / 24 / 8 | **50%** |

Each combined row covers 40 games / 20 complete opening pairs: ten screening prefixes plus ten reserved confirmation prefixes. The cohorts remain separately archived. Screening has only a summary, so the combined numbers are descriptive arithmetic under the intended shared protocol, not independently authenticated pooled trials.

**Keep `rook.purple@2` as an experimental playtest candidate.** The combined mixed-army result falls within the predeclared 35%–65% practical band. The 85% result against blue minors remains well outside it. This is a useful narrower design to expose for human feedback, not a declaration that purple and blue purchases are balanced. The allocation difference could also reflect weak blue purchases; it does not identify a uniquely correct next rook nerf.

**Park `pawn.purple@2`.** Its [screening results](revision-1-screen-001.md) reached the early-stop threshold against blue pawns. Its quiet-range cap alone did not resolve the mismatch.

**Close this batch at 160 games.** The remaining 40 pawn-confirmation games are unused. No third run, replacement candidate, or material-handicap suite is queued. Browser defaults remain unchanged; the next development step is a small version-09 experimental picker and human playtesting. Further balance games require a new question, selected candidates, and a declared cap.

## Game audit

The journal matches the exact seeded schedule produced by filtering [the confirmation configuration](../revision-1-confirmation.json) to `purple-rook-v-blue-minors`, `purple-rook-v-blue-orange`, and `standard-control`. Filtering keeps all five declared comparisons in the configuration, preserving the full registry and profile.

All games declare 100,000 nodes per move, one thread, 32 MB hash, Skill 20 for both sides, ordinary royal kings, and the 400-ply limit. Their profile/registry hashes match the profile recompiled from that configuration:

- Profile: `0f1c54a72c46fd1bcc0489ea549184bddd7314da341aa3be7171ac7d2fcd158c`.
- Registry: `df74a99dfdf041abcaf82c29c560389b813f5c94fbb70d945c39d0cd2bfed40e`.
- Variant: `levelup-design-3ea43a76e6bb8c874bc1`.

Replayed **8,978 legal plies and SAN entries**, including the forced prefixes. All 60 final positions, results, and termination reasons agree; no moves continue after termination. Native/browser legal-move sets agree at **7,130 distinct positions**. Observed coverage includes 113 castlings, 60 standard QRBN promotions, and 41 revised-rook knight-jump captures.

Games ended with 39 checkmates, nine bare-king draws, four repetitions, and eight fifty-move draws. Lengths range from 64 to 265 plies, with median 147; no larger move cap is indicated by this run. All ten ordinary control pairs have identical move sequences. Their paired 50% score is expected from the identical armies and observed repeated play; it checks labeling/scoring rather than independently establishing balance.

No correctness defect was found that invalidates these games. The official `--comparisons` option now replaces the temporary schedule-filter command. One remaining usability limitation is that strength preflight validates all declared comparisons, including excluded ones; an unsupported Elo setting in an excluded comparison can block a filtered run. All settings in this batch are supported Skill 20. A future preflight change should have its own runner identity rather than silently altering these runs.

## Provenance and limits

Original summary SHA-256: `463d69877a750f78c53ebc23f7447f8de0c6f0445090e449df180efe8b2d85fb`.

Original journal SHA-256: `f2c4f937548b57b2f74e65690da8dea7577cef833a34a01a406acb2fca370721`.

The [archived 60-game journal](revision-1-rook-confirmation-001.games.jsonl) removes only `startedAt` and `finishedAt`; all other fields are preserved. Its SHA-256 is `acbb31bb80b174f23c6d88f246a15adf7d1ee0e01f11b285ae509d3eb636bbf1`. Machine-readable audit results and replay-engine identity are in [the audit record](revision-1-rook-confirmation-001.audit.json). The [revision evidence ledger](revision-1-evidence.csv) separates cohorts, opponents, applicable coverage, and decisions.

The original `run.json` was not supplied. Actual executable/source fingerprints, archived profile bytes, and UCI option acknowledgments therefore cannot be independently authenticated from the original manifest. The games declare Fairy-Stockfish 230826; legal replay used the separately identified matching-source Linux build, not a claimed copy of the owner's Windows executable. The screening cohort cannot be replayed from its summary alone.

The fixed short prefixes include related lines. Scores and conditional uncertainty do not establish universal material values, a piece Elo, or an Amazon-equivalent upgrade bonus. Human usability and counterplay remain untested for this candidate in the browser.
