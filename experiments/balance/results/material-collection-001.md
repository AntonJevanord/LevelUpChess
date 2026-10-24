# Material collection pilot: completed run and shutdown audit

The supplied pilot finished all **96 games**. The terminal remaining open was a
keyboard-input shutdown bug, not continuing games. Keep the results; no games
need rerunning. The [96-game protocol](../material-collection-plan.md) remains closed.

## Inputs

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `games.jsonl` | 288,520 | `19a6acfaa8d250d35fc601e1ae625627111f6756c5721c309499c53c83240da2` |
| `collection.json` | 133,966 | `38b71fc941d1d0fc97172909d30d3a6c56ae6b129fdf1f09c638be2610f85448` |

Run ID: `73d037eb-77f6-421d-addf-c74b66218283`. Settings match the protocol:
seed 42, automatic evaluation, Skill 20, 20,000 nodes per move, one search thread,
32 MB hash, 400 plies and **four game workers**. The book hash matches preflight.

## Verification

- 96 distinct completed histories: 32 ordinary and 64 Amazon games.
- Zero errors, truncations, aborted attempts, retries or missing games.
- All 10,639 recorded plies replay; all outcomes validate.
- Sparse sampling retains 881 positions from all 96 games.
- All 13 core-runner and seven collector source hashes match commit `9317111`.
- The recorded executable matches the bundled Windows engine; the rules bundle
  matches its Windows CRLF representation.

Offline replay and both 200-resample diagnostic fits finished in 3.19 seconds on
the audit machine; that process exited naturally. This is an observed runtime,
not a Windows runtime guarantee. Raw uploads were preserved unchanged.

Keep the original manifest and its frozen source identity. The updated CLI's
offline `--report` can regenerate derived artifacts without changing that identity
or starting games. Unfinished older runs still require their matching checkout.
Coefficients remain conditional diagnostics. No material prices or further game
batch are adopted.
