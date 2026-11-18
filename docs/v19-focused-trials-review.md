# Version 19 focused pawn/queen trials: thirty-two-case review

The exact uploads contain 1,664 first-attempt games: 1,663 completed results and one 400-ply truncation. There are 831 complete color pairs (1,662 scored games); the completed partner of the truncation stays archived and unscored. All uploaded numeric tables, colors, conditional ranges, first-search coverage and search priors reproduce offline.

The files are four eight-case batch journals per study, not four independent worker studies. Both completed studies use 40,000 nodes, Skill 20, one thread and 32 MiB hash on the same thirty-two related fixed opening cases. Draws count half a point.

## Level two

| Body | Overall | White | Black | Shared cases | W / D / L |
| --- | ---: | ---: | ---: | ---: | :--- |
| Pawn: diagonal and vertical range two | 60.94% | 70.31% | 51.56% | 32/32 | 95 / 44 / 53 |
| Pawn: forward queen and quiet retreat | 67.20% | 76.34% | 58.06% | 31/32 | 101 / 48 / 37 |

Both trial pawns lean strong against the unchanged reference basket: B2vR2 reaches 60.94% (conditional 95% range 55.99%–66.15%), while fQ2mbQ2 reaches 67.20% (60.75%–73.39%). This supports a bounded nerf test rather than promoting either as a balanced reference.

The fQ2mbQ2/Rank-pawn game as White on case 26 hit 400 plies. Its overall row therefore uses 31 shared cases across all three references (186 games); individual matchup cells retain their own complete pairs (64/62/64 games). A naive pool of all remaining completed pairs has a different denominator and is not the official overall score.

## Level three

| Body | Overall | White | Black | Shared cases | W / D / L |
| --- | ---: | ---: | ---: | ---: | :--- |
| Pawn: full knight jumps | 58.20% | 62.11% | 54.30% | 32/32 | 124 / 50 / 82 |
| Pawn: six knight jumps | 51.37% | 58.98% | 43.75% | 32/32 | 101 / 61 / 94 |
| Pawn: four forward knight jumps | 43.55% | 50.00% | 37.11% | 32/32 | 89 / 45 / 122 |
| Wraith: full diagonal and sideways hops | 52.54% | 61.33% | 43.75% | 32/32 | 97 / 75 / 84 |
| Herald control | 49.22% | 57.42% | 41.02% | 32/32 | 102 / 48 / 106 |

The six-jump pawn is a promising three-point design: 51.37% overall, with a 45.70%–56.45% conditional range. Its reference scores are 64.84% against Unicorn, 47.66% against Crusader, 46.88% against Vanguard and 46.09% against Amazon. The three non-Unicorn references together score 46.88%; the overall is not proof of equal strength in every matchup. The full-knight pawn is high at 58.20%; four-forward-jump pawn is low at 43.55%. Herald control stays near even at 49.22%.

QgsQ0 Wraith is also promising by the declared score, 52.54% (46.67%–58.40%), with 50.78% / 57.81% / 48.44% / 53.13% against Unicorn / Crusader / Vanguard / Amazon. Its White/Black split is 61.33% / 43.75%. Human counterplay and the opening warning still need review before promotion.

## Opening diagnostic and sensitivity

All 1,664 post-prefix positions reproduce from their stored starting armies and forced moves. Level two stores 329 exact-cp and 55 bounded-cp observations. Level three stores 1,025 exact-cp, 247 bounded-cp and eight mate observations. No observation is missing, unavailable or invalid; these are engine estimates under declared priors, not fitted material values.

All eight mate observations are Wraith as White on cases 02 and 26, once against each reference. The first freely chosen move is d1a4 (Qa4#, archived as Ia4#), and every game actually ends immediately after that ninth ply. The forced prefix and this final move were independently replayed with the frozen browser rules to verify checkmate. The complete opening FENs, prefixes, observations and results are retained in the audit JSON.

| Opening | Wraith games | W / D / L | Score | Immediate White mates |
| --- | ---: | :--- | ---: | ---: |
| v19-book-02 | 8 | 6 / 1 / 1 | 81.25% | 4 |
| v19-book-26 | 8 | 4 / 2 / 2 | 62.50% | 4 |

For sensitivity only, omitting both complete opening cases, both physical colors and all reference cells gives Wraith **51.25%** (87 / 72 / 81 across 240 games). The near-even score is not explained away by those eight mates, but the forced positions expose an opening-book failure for this piece. The declared **52.54% remains unchanged**; this omission neither corrects scores nor selects a special favorable book for Wraith.

| Design | Declared 32-case score | Diagnostic 30-case score |
| --- | ---: | ---: |
| Pawn: diagonal and vertical range two | 60.94% | 61.11% |
| Pawn: forward queen and quiet retreat | 67.20% | 67.50% |
| Pawn: full knight jumps | 58.20% | 59.17% |
| Pawn: six knight jumps | 51.37% | 50.42% |
| Pawn: four forward knight jumps | 43.55% | 43.33% |
| Wraith: full diagonal and sideways hops | 52.54% | 51.25% |
| Herald control | 49.22% | 50.83% |

The first-search capture successfully exposed this issue without an extra engine search. A future protocol revision should validate the common book across the accepted roster; do not silently delete these games or retrospectively choose near-zero evaluations per matchup.

## Missing queen trial

Only the queen panel-runtime.json owner receipt was uploaded. It declares level1, four jobs and 32 initial openings, but directory is null. This is not evidence of completed queen games or a usable owned runtime. No queen score is inferred, and no original runtime snapshot or execution manifest has been reconstructed as if supplied.

## Provenance and limits

- Original campaign/stage manifests, archived INI files, owned runtime snapshots and native-preflight proofs were not supplied. Derived descriptors verify declaration compatibility, not original runtime provenance.
- Opening observations report an executable hash and Fairy-Stockfish 230826; this audit has not inspected that executable or attested its native piece-value tables.
- All forced prefixes and their stored opening FENs are replayed with the frozen browser rules. Only the eight recorded mate-in-one continuations are independently replayed to a terminal result; other full game moves and outcomes are not replayed.
- The thirty-two related fixed opening cases, chosen search priors and forced-prefix protocol limit generalization. Conditional opening-block ranges exclude engine and protocol bias.
- The two-opening omission is a labeled sensitivity analysis across both colors and all reference cells. It neither replaces official scores nor selects a revised matchup-specific opening book.
- No scored matches, engine searches, new material-value fits, individual-piece Elo or automatic playable promotions were produced.

Exact original bytes are retained in deterministic gzip archives with original/archive SHA-256 pins. Derived v0.19.1 descriptors are explicitly compatibility evidence. Run `node scripts/balance/v19-trial-evidence.js` to verify offline; `--write` regenerates only this review and the derived audit.
