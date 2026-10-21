# Level 3 comparison campaign

Declared on 2026-10-21 for version 12, after human playtesting. Compare the current level-3 purchases before changing their movement. **At most 2,000 scheduled games:** 1,860 in the main round robin and up to 140 reserved confirmation games. Unused confirmation capacity stays unused; this is one campaign, not an automatic chain of redesigns.

## Fixed candidates and conditions

The [roster](level3-roster.json) names 14 purchases. Each side begins with the same underlying ordinary army and spends three upgrade points on exactly one starting slot. Extra units, weaker split queens, and displaced pawns remain part of their purchase's intended starting setup.

| Family / starting slot | Purchases |
| --- | --- |
| Pawn / d2 | Ranging `pawn.purple@1`; Courier `@3`; Rank `@4`; Returning `@5` |
| Knight / b1 | Knight and guard `knight.purple@2`; Camel knight `@3` (`NC`) |
| Bishop / c1 | Vertical `bishop.purple@1`; Sideways `@2` |
| Rook / a1 | Capture-box `rook.purple@1`; Knight-capture `@2`; Blink `@3` |
| Queen / d1 | Amazon `queen.purple@1`; Twin short queens `@2`; Queen and companion `@3` |

Slots are relative White-side names, mirrored for Black. Ordinary king movement and checkmate apply throughout. The level-2 Twins and superseded/parked revisions are excluded. The Camel knight changes price through a new immutable ID; keep `NC` unchanged during this campaign. Adding diagonal steps (`NCF`) would be a later candidate, not a mid-run adjustment.

Keep the Amazon fixed as the reference purchase. Its estimated 12–13 whole-piece material suggests roughly 3–4 added benefit over a queen, but this is a prior, not an established LevelUp value. These matches compare **upgrade packages on otherwise equal armies**, not a whole pawn directly against a whole queen.

Both stages use 100,000 nodes per move, Skill 20 on both sides, one thread, 32 MB hash, and a 400-ply limit, matching the previous confirmation protocol. Keep engine, rules, search settings, and revisions fixed. Both configurations declare the same full 14-type registry, including comparisons excluded from confirmation, so their letters and rules remain identical.

King upgrades stay out of this round robin. Schema 2 currently supports ordinary royal kings only; asymmetric legacy king tests use pseudo-royals and omit the engine's ordinary king-safety evaluation. Mixing those results with these rankings would confound king strength with different evaluation behavior. Their separate mating and evaluation work remains pending.

## Main stage: 1,860 games

The [main configuration](level3-round-robin.json) contains every unordered candidate matchup: **91 comparisons × ten opening pairs × two colors = 1,820 games**. Each candidate faces all 13 opponents, totaling 260 games when complete. This includes every candidate's direct comparison with the Amazon and exposes matchup-specific strengths or weaknesses.

Two controls add 20 games each:

- **Standard control:** ordinary army versus identical ordinary army.
- **Amazon control:** Amazon army versus identical Amazon army, under the same frozen profile.

Each opening pair assigns the two armies to both colors, with the same forced prefix. The ten screening prefixes include an unforced start and short e-pawn, c-pawn, fianchetto, and ordinary-knight development patterns. The ten reserved prefixes differ from the screening sequences. They avoid forcing b/d pawns or the altered b-knight, since queen/guard insertion changes those starting squares. Full rules preflight checks every prefix on every army/color assignment before play.

The cohorts contain related opening patterns; distinct IDs or prefixes do not make them independently sampled chess positions. Forcing the same legal prefixes across armies improves comparability but still measures these starting positions. Opening-sensitive results and unit congestion must be reported, not averaged away.

## Run and check the time budget

No game server or browser is needed. In Windows PowerShell, from the repository folder:

```powershell
npm.cmd run balance:level3 -- --check
npm.cmd run balance:level3 -- --stage screen --out balance-results/level3-round-robin
```

The check validates both complete opening cohorts and native movement support. The long campaign is prepared for your computer; development smoke games are workflow checks, not balance evidence.

After several complete pairs, press **p** to pause at a pair boundary. Compare elapsed time per completed game with your previous 100,000-node runs and decide whether the remaining estimate fits your available time. New pieces may create longer games despite equal node budgets. The audited earlier 60-game rook run had median length 147 plies and maximum 265, but archived timestamps were removed, so it cannot establish an authenticated wall-clock estimate for this campaign.

Resume without losing the full schedule:

```powershell
npm.cmd run balance:level3 -- --resume balance-results/level3-round-robin
```

`q` / Ctrl+C stops now, `g` after a game, and `p` after a pair. Resume retains original rules and search settings. Do not use `--limit-pairs` as a temporary pause: the generic runner permanently records that reduced schedule. Do not lower nodes or raise the move limit inside an existing run.

Inspect the results with:

```powershell
npm.cmd run balance:level3 -- --report balance-results/level3-round-robin
```

## Read the screen before spending the reserve

Wait for all planned main-stage games before making score-based confirmation choices. Stop earlier for correctness failures or intolerable runtime; retain the logs and describe the incomplete campaign. If errors occur or more than 5% of scheduled games are truncated, repair or assess the cause before using rankings. Unfinished games are unscored, not automatic draws; incomplete opponent coverage can bias standings.

Use the matchup matrix, each purchase's score against the Amazon, and its equally weighted scores against all opponents. An overall rank can hide a bad matchup or a rock-paper-scissors cycle. Scores near 50% do not establish equal material, especially with only ten opening pairs per head-to-head comparison. A descriptive ranking is sufficient to choose prototypes; exact Elo or pawn values are not required.

Use **35%–65% against the Amazon** as a provisional design band. It is not a confidence interval. A candidate outside it, with useful human-play feedback, is a buff/nerf candidate rather than an automatic edit. An extreme result across many opponents is stronger evidence of a broad mismatch than one unusual matchup. Treat results for unfamiliar custom-piece evaluation cautiously; native/browser legal-move agreement does not prove good engine valuation.

## Reserved stage: at most 140 games

The [holdout configuration](level3-holdout.json) retains every declared comparison for identical allocation, but **must not be run unfiltered with the generic runner**. Use the campaign command, which requires the completed main run, records one confirmation reservation, and restricts selection to seven comparisons / 140 games.

Always select:

1. `camel-knight-v-amazon`, to check the newly priced level-3 Camel knight.
2. `standard-control`, to check scoring/completion under the reserved cohort.

Choose **up to five additional comparisons** before starting confirmation. Prefer the largest absolute deviations from 50% among out-of-band candidate-versus-Amazon matchups; break exact score ties by comparison ID. A conflicting direct matchup may replace one only when its concrete design question is recorded first. Do not fill unused slots merely to spend the budget. Freeze choices and candidates before viewing holdout results.

```powershell
npm.cmd run balance:level3 -- --stage confirm --from balance-results/level3-round-robin --comparisons camel-knight-v-amazon,standard-control,OTHER_ID --out balance-results/level3-confirmation
```

Replace `OTHER_ID` with the declared selections, or omit it when only the two mandatory comparisons are justified. Each selected comparison gets ten reserved opening pairs / 20 games. At seven comparisons the total is **1,860 + 140 = 2,000**; at two, it is 1,900. Resuming the same confirmation continues its reservation, not a new allocation.

Keep screen and confirmation results separate before presenting any descriptive combined scores. The shared registry, fixed settings, disjoint exact prefixes, and complete color pairs must match. Related prefixes still limit generalization, and selecting screen outliers can exaggerate their first-stage scores.

Finish this campaign with **keep, buff candidate, nerf candidate, or park** for each purchase, using human enjoyment/counterplay alongside completed results. Do not change rules midway, repeatedly rerun close comparisons, or start a third automatic stage. A redesigned piece receives a new revision and a later explicitly bounded campaign.

## What the controls establish

Controls exercise the same engine process, openings, color assignment, move/result recording, and scoring without giving either army a stronger purchase. They help detect mislabeled colors, scoring mistakes, crashes, or unusual completion behavior. The Amazon control also exercises an upgraded position, whereas ordinary control does not activate custom movement.

With identical armies and deterministic engine play, both games of a color-swapped pair may reproduce the same moves. Army A then scores exactly 50% even if White wins every game: A gets one White win and one Black loss. The earlier [rook audit](results/revision-1-rook-confirmation-001.md#game-audit) observed identical sequences in all ten ordinary-control pairs.

Therefore, **50% control is an expected sanity check, not independent proof of fair rules or balanced upgrades**. Inspect White's score, repeated move sequences, errors, and completion rates separately. The controls do not measure a piece's material value, calibrate engine Elo, or get subtracted from each matchup score. The fixed Amazon opponent supplies the practical upgrade-strength reference; the controls check the measurement process.
