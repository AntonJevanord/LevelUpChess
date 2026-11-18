# Version 19: focused pawn and queen trials

These small studies test alternative identities against fixed same-tier
references. They do not replace playable pieces automatically. The frozen L2
Knight pawn and L3 Herald remain in the panels while these ideas are tested.

The [32-opening L2/L3 review](v19-focused-trials-review.md) preserves all
uploaded games and the automatic opening flags. Both L2 candidates scored
high; the [restricted-pawn follow-up](v19-pawn-range-followup.md) tests two
new versions and explains how to resume the queen trial's incomplete setup.

Each army buys one upgrade. Search uses **40k nodes, Skill 20, one thread,
32 MiB hash and four workers**, with both colors on eight shared opening cases.
Run one study at a time. Eight cases identify gross outliers; they do not
establish precise balance or material values. No scored cloud games were run.

## Designs and controls

| Study | New designs | Fresh controls | Opponents | Games at eight openings |
| --- | --- | --- | --- | ---: |
| `queens` | `QfsN`, `QAD` | `QfN`, `QvN` | Three L1 references | 192 |
| `pawns2` | `B2vR2`, `fQ2mbQ2` | None | Three L2 references | 96 |
| `pawns3` | `PN`, `PsNfN`, `PfhN`, `QgsQ0` Wraith | Herald | Four L3 references | 320 |

The total is **608 games**. Despite its selector name, `pawns3` includes the
additional Wraith requested for the same L3 test. Experimental pieces do not
play one another in these studies, so a revision cannot pull another trial's
fixed-reference score down.

`P` is shorthand for ordinary pawn movement, **`ifmnDfmWfceF`**:

| Short form | Engine movement | Added knight destinations |
| --- | --- | --- |
| `PN` | `ifmnDfmWfceFN` | All eight |
| `PsNfN` | `ifmnDfmWfceFsNfN` | Six: all four wide jumps and two tall forward jumps |
| `PfhN` | `ifmnDfmWfceFfhN` | All four forward jumps |

The knight components can move and capture, crossing intervening pieces.
Ordinary diagonal en passant removes the bypassed pawn; promotions remain
Q/R/B/N. The two L2 designs overlap quiet and capturing diagonal movement:
visiting an empty en-passant target is quiet and leaves that pawn in place.
Their quiet paths match, but `B2vR2` also captures backward; `fQ2mbQ2` captures
only forward.

The requested `QsfN` is ignored by the bundled native and browser engines.
Supported **`QfsN`** gives the intended two wide forward jumps: d4–b5/f5.
`QAD` keeps queen movement and adds two-square diagonal/orthogonal jumps;
its benefit is crossing blockers, not more destinations on an empty board.
`QgsQ0` keeps ordinary queen movement and adds diagonal and horizontal hopper
rays, without additional vertical hopping.

From the ordinary initial setup, `QgsQ0` permits **1.Qh5+**, with **...g6**
the only reply. The rejected full-ray queen's mate-in-two is absent: Qe5 is
not check here, and a complete bounded mate-tree check found no mate in two.
A deeper search still suggests strong opening pressure under the chosen
priors; that is not a proof of a forced win. These eight-ply-prefix studies
measure their declared positions, not unrestricted first-move choice.

## Run and resume

After updating `version_19`, use fresh output folders:

```powershell
npm.cmd run balance:v19:trials -- --study queens --out balance-results/v19-queen-trials --openings 8 --jobs 4
npm.cmd run balance:v19:trials -- --study pawns2 --out balance-results/v19-pawn2-trials --openings 8 --jobs 4
npm.cmd run balance:v19:trials -- --study pawns3 --out balance-results/v19-pawn3-wraith-trials --openings 8 --jobs 4
```

Check without playing, resume an interruption, or regenerate an offline report:

```powershell
npm.cmd run balance:v19:trials -- --study queens --check --openings 8
npm.cmd run balance:v19:trials -- --study queens --resume balance-results/v19-queen-trials
npm.cmd run balance:v19:trials -- --study queens --report balance-results/v19-queen-trials
```

Windows uses the bundled compatible engine; `--engine PATH` or
`FAIRY_STOCKFISH_PATH` can select another. `--rules-only` omits native checks.
Targets 8/16/32/64 are **total openings**. Only extend after reviewing the first
eight; an extension adds new batches without replaying completed ones.

Keep the entire output folder and its owned runtime. Reports are
`panel-report.md` and `.json`, with completed targets under `reports/openings-N`.
`q`/Ctrl+C stops now; `g` finishes active games; `p` finishes active color pairs.
Incomplete pairs, truncations and errors are unscored. Draws count half a point.

## Values and opening checks

Controlled MG/EG priors are 2771/2833 for L1 queens, 536/592 for L2 pawns,
762/808 for new L3 knight pawns, 418/436 for Herald and 3772/3470 for Wraith.
References retain their tested priors. These are search settings, not measured
material values. The reports retain exact identities, movements and policies.

Before each batch, automatic preflight replays every army/color prefix,
rejects illegal or terminal positions, checks native/browser move agreement
and verifies all six MG/EG tables. This does not prove tactical fairness.
The separate [opening diagnostic](opening-diagnostics.md) flags pins, exposure
and optional evaluations; flags never correct scores or select a separate
near-zero-evaluation book for each matchup.

New runs automatically [save their first normal post-opening evaluation](opening-evaluations.md)
in each game record. The report separates exact cp, bounds, mates and missing
coverage, with paired-color opening summaries. No extra searches are needed;
existing owned runs keep their original recorder and are not backfilled.

The current [roster revision](../experiments/designs/v19-roster-002.json)
removes the L2 Bishop pawn and selects the tested `QgmQ0gcBgcsR0` Wraith
(38.67% at 40k; 37.89% at 80k), preserving all earlier profiles. The new
`QgsQ0` remains a trial. See the [version-19 guide](version19.md) for panels.
