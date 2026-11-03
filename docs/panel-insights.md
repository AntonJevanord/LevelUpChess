# Panel colors and roster exclusions

These reports reuse the panel's recorded games. Run them after material analysis
to inspect color dependence and alternative opponent sets without playing more
games or fitting material values again. Original results, reports, definitions
and the active panel's source identity remain unchanged.

## Export the analysis

After the selected opening total has finished, use a new output folder:

```powershell
npm.cmd run balance:panel:insights -- --run balance-results/level3-panel --out balance-results/panel-insights
```

The default is the campaign's saved target. To analyze the first 32 openings
while later stages continue, add `--openings 32`. Every selected stage must be
complete and inactive; later stages can remain active. Node budgets stay separate.

The command writes:

| File | Contents |
| --- | --- |
| `color-report.md` | Per-matchup color scores, balanced scores and conditional ranges |
| `exclusion-report.md` | Full standings, every single-piece exclusion and any requested subset |
| `analysis.json` | Structured report data |
| `paired-outcomes.json` | Compact paired outcomes for later analysis |

Ordinary-army anchors stay outside head-to-head averages. Only scored games with
both color partners contribute. Draws count half a point; truncations, errors
and unpaired completions do not become draws or losses.

## Piece balance and color dependence

For an opening, let `x` be A's score when A plays White and `y` its score when A
plays Black. The reports keep these questions separate:

| Measure | Calculation | Meaning |
| --- | --- | --- |
| Balanced A score | `(x + y) / 2` | How A performs with equal weight for both colors |
| Physical White score | `(x + 1 - y) / 2` | How the side moving first performs across both armies |
| A's color gap | `x - y` | How much A's result changes between colors |

If White wins both games, A scores 50% overall while physical White scores 100%.
If A wins with both colors, A scores 100% while physical White scores 50%.
Thus an even piece matchup can still depend strongly on initiative, while a
large piece advantage can occur without a color advantage.

Per-matchup White/Black W/D/L and scores use the same completed opening cases.
The global color summary requires cases complete across every included
head-to-head matchup. Coverage is printed rather than hiding missing pairs.
Conditional ranges resample whole opening blocks with both colors kept together;
they omit wider opening ancestry and engine/protocol bias. They do not create an
automatic fair/unfair verdict.

The existing balanced piece score already weights both colors equally. Do not
subtract the global White advantage from it as another correction.

## Exclude pieces from the opponent set

Every analysis includes a leave-one-out table for each piece. To also inspect a
particular subset, supply names, stable IDs or roster keys:

```powershell
npm.cmd run balance:panel:insights -- --run balance-results/level3-panel --exclude Wraith,Cataphract --out balance-results/panel-insights-filtered
```

Names are case-insensitive. At least two pieces must remain. Removing a piece
drops its matchups and gives the remaining opponents equal weight; it does not
change any retained head-to-head result or simulate different games.

Removing a weak opponent such as Wraith will often lower the other averages.
Removing a strong opponent such as the original Cataphract will often raise
them. This is a change to the opponent set, not a buff, nerf or new material value.

Missing pairs can complicate the comparison: removing an opponent may make
additional opening cases usable. The report therefore shows both the filtered
standings on their available cases and the original-versus-filtered change on
the **same original complete cases**. Newly available coverage is listed
separately. A change in opponents should not be mistaken for a change in openings.
JSON retains these same-case changes for every single-piece exclusion. Using
`--exclude` also prints the detailed comparison for that requested subset.

## Reuse the compact export

Once exported, the paired outcomes can answer further exclusion questions
without rereading the large game journals:

```powershell
npm.cmd run balance:panel:insights -- --input balance-results/panel-insights/paired-outcomes.json --exclude Wraith,Cataphract --out balance-results/panel-insights-from-pairs
```

Choose either `--run` or `--input`; `--openings` applies only to `--run`. Every
output uses a separate new folder and leaves the source data untouched.

The compact file retains opening identities, both observed color scores and
source receipts, including source-file checksums. It can also be uploaded for
analysis in this workspace. It is derived outcome data, not a full game archive
or an independent legal replay. Loading it later does not reverify the original
files or executable. It supports these color and exclusion functions without
replacing the raw games needed for material replay or other position analysis.
