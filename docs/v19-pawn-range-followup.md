# Version 19: restricted range-two pawns

The [first trial review](v19-focused-trials-review.md) found both L2 pawns
above the reference basket: `B2vR2` scored **60.94%**, and `fQ2mbQ2`
**67.20%** over 32 shared openings. This follow-up restricts their captures
or retreat while preserving the same opponents and engine priors.

The study has now completed 32 openings: fQ2 scores **56.51%**, versus
**58.07%** for mvQ2fceB2. The user selected the simpler forward-only fQ2 for
the playable roster. See the [completed review](v19-selected-trials-review.md)
for exact outcomes, colors and limitations; the prior trials stay archived.

| Candidate | Quiet movement | Captures |
| --- | --- | --- |
| `fQ2` | Up to two squares straight forward or diagonally forward | Same paths |
| `mvQ2fceB2` | Up to two squares vertically or diagonally, forward or backward | Forward diagonals up to two squares |

Neither can move sideways. Range-two moves require a clear path, remain
available away from the home rank and are not initial jumping double steps.
Both promote obligatorily to ordinary Q/R/B/N on the final rank.

The final requested notation was **`mvQ2fcB2`**. The declared version retains
`e` after `c` as the pawn notation convention. Both engines give it identical
ordinary geometry. `vQ2` includes diagonals in these engines; the leading `m`
is essential to keep those moves quiet. Without it, `vQ2fcB2` is the already
tested `B2vR2` geometry. Uppercase `C` would instead add camel jumps.

Overlapping quiet diagonal movement prevents en passant from removing the
bypassed pawn in both engines, even with `e`. For both candidates, c5-d6 on
an empty en-passant target is a quiet move and leaves the d5 pawn in place.
The tests retain this engine behavior rather than claiming that `e` fixes it.

## Protocol

Each candidate buys one L2 pawn upgrade on c2/c7 and faces the unchanged
**Quiet-tall Knight pawn, Rank pawn and Bishop grant**. Candidates do not play
one another. Both use **536 MG / 592 EG**, the previous trial's controlled
pawn prior; reference values stay unchanged. These are search settings, not
material estimates.

Search uses **40k nodes, Skill 20, one thread and 32 MiB hash**, with four
workers by default. Both physical colors use the same shared book. Eight
openings schedule 96 games; 32 schedule **384**. No scored cloud campaign
was started. This study has a separate runtime, declaration and output folder;
it does not replay or append to the completed first trial.

## Run, resume and inspect

After pulling `version_19`, start the 32-opening comparison:

```powershell
npm.cmd run balance:v19:pawn-followup -- --out balance-results/v19-pawn-range-followup --openings 32 --jobs 4
```

Resume the same run, rebuild its report without engines, or validate without
playing:

```powershell
npm.cmd run balance:v19:pawn-followup -- --resume balance-results/v19-pawn-range-followup
npm.cmd run balance:v19:pawn-followup -- --report balance-results/v19-pawn-range-followup
npm.cmd run balance:v19:pawn-followup -- --check --openings 32
```

Targets 8/16/32/64 are **total openings**. A resume can extend an unchanged
study by specifying a larger `--openings` target. Keep the entire folder,
including its runtime and batch journals. Old trial/panel runtimes retain their
original commands and declarations.

The report includes per-reference and overall scores, physical colors,
conditional opening-block ranges and the
[recorded first post-opening evaluations](opening-evaluations.md).
Reports refresh at batch boundaries and clean stops. Errors, truncations and
incomplete color pairs remain unscored; diagnostic flags never correct results.

## Earlier queen-trial interruption

The queen study has since finished; its results are in the
[selected-trial review](v19-selected-trials-review.md). The recovery below
documents the earlier setup interruption and remains applicable to that state.

The earlier uploaded queen receipt has `directory: null`, four workers and a
32-opening target. Together with the empty runtime folder, this indicates that
snapshot setup did not finish. There is no game journal or result to recover.
The receipt alone cannot identify the original operating-system error.

Retry with the original folder, substituting its name if necessary:

```powershell
npm.cmd run balance:v19:trials -- --study queens --resume balance-results/v19-queen-trials
```

This retains four workers and 32 total openings. The controller validates
incomplete setup before rebuilding the runtime; it never deletes game evidence.
If setup fails again, retain the full terminal error. New errors include the
underlying cause and resume guidance. Foreign or unverified files are preserved
and refused rather than overwritten.
