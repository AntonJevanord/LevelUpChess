# Selected level-two references — 2026-11-02

Select the existing current Forward Knight pawn, Rank pawn and Diagonal grant as
the working level-two references. Each costs two upgrade points. Their movement,
placement and applied engine values retain the identities tested in the screen;
the [roster declaration](../experiments/designs/level2-references-v17.json) pins
them for future experiments.

| Reference | Exact movement | Two-step pair | King-step pair | Pawn-grant pair | Overall | First / second eight cases |
| --- | :--- | ---: | ---: | ---: | ---: | ---: |
| Forward Knight pawn | `fmWfceFifmnDfhN` | 53.13% | 50.00% | 57.81% | 53.65% | 48.96% / 58.33% |
| Rank pawn | `ifmnDmfWfceFsR` | 59.38% | 46.88% | 48.44% | 51.56% | 52.08% / 51.04% |
| Diagonal grant | `F` | 59.38% | 53.13% | 50.00% | 54.17% | 57.29% / 51.04% |

Every selected row contains 96 completed games: one two-point purchase against
each of three two-purchase level-one packages, sixteen opening cases and both
colors. Draws count half a point. The overall score weights the three opponents
equally. All selected rows have full coverage, with no errors or truncations.

The Rank pawn is especially stable across the two fixed opening halves. The
Forward Knight pawn has a larger physical-color split, 66.67% as White versus
40.63% as Black, so the next study retains both colors and reports them. The
screen supports the choice without establishing precise equivalence or a
material price: results depend on placements, short prefixes, 20,000 search
nodes and the declared MG/EG tables.

Prefer the one-square diagonal `F` grant for the level-two roster. Keep
orthogonal grants available for later design work. The single-step `W` was also
competitive at 51.67% over fifteen shared cases; it did not fail this screen.
`W2` and `W3` scored 72.40% and 68.75% at the tested two-point price, making
them stronger-tier candidates without establishing a particular higher price.
No historical grant is repriced or removed.

Both stages finalized all 2,688 scheduled games on their first attempt, with
2,686 completed results and two unscored 400-ply truncations. Excluding their
completed color partners leaves 2,684 scored games in 1,342 complete pairs.
The truncations affect reduced Rook pawn and reduced Orthogonal grant rows,
not the selected references. Both uploaded reports reproduce exactly in the
[archived evidence](../experiments/balance/results/v17-level2-001.report.md).
Original run manifests, INI archives and native proofs were not supplied;
reconstructed declarations check compatibility without attesting the binary or
independently replaying games. Verify offline with:

```sh
node scripts/balance/v17-level2-evidence.js
```

The next bounded check uses sixteen fresh two-ply cases: 96 direct games between
the three selected references at budget two, and 288 games comparing three
identical level-two purchases against two identical Vanguard, Unicorn or
Cruisader upgrades at budget six. Keep the two budgets separate. This tests
direct counters, stacking and the link to level three without rerunning the
sibling screens. It is additional to the existing 6,752-game campaign and runs
after that campaign finishes. The Amazon remains unchanged and is absent from
the bridge because a standard army has only one queen.

Review repeated large deviations and human playtests before freezing the
permanent level-two roster. An isolated small-sample matchup does not trigger
another full sweep. The current campaign, existing profiles and calibration
remain unchanged.
