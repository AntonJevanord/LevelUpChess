# LevelUp native-engine patch

`manual-piece-value-overrides.patch` applies to the unmodified vendored source archive at upstream commit `43b66c8abfebfcab893a3a4c349aa790d18df148`. The archive, patch, binary, toolchain and build script hashes are recorded in `../engine-build.json`. `../../scripts/build-windows-engine.sh` verifies both input hashes and applies the patch automatically.

The patch restores pristine defaults on every variant switch, recomputes custom values, and applies explicit phase overrides to both colors in the raw `PieceValue` table. Existing PSQT/evaluation overrides remain in place. Normal SEE's ordinary-piece branches now use that table as well, so overrides also affect capture ordering and normal exchange thresholds. Automatic active-piece values remain unchanged. The patch does not alter legal moves or repair every fairy-piece search approximation.

## Read-only idle diagnostic

After selecting a variant, send `levelupvalues` while no search is running. It emits:

```text
levelupvalues version 1
levelupvalue R 1276 1380 1276 1380 1276 1380
levelupvalue r 1276 1380 1276 1380 1276 1380
...
levelupvalues done
```

Each active piece produces one uppercase and one lowercase row. The six numbers are raw MG, raw EG, capture MG, capture EG, evaluation MG and evaluation EG. All values are positive material magnitudes for both colors; royal kings use zero. The command reads the selected variant rather than a potentially older position object. Older engines that do not implement this protocol cannot prove consistent manual overrides.

`verify-piece-values.cpp` is the source-only regression fixture. Run it through `bash ../../scripts/check-engine-values.sh` from this directory, or `bash scripts/check-engine-values.sh` from the repository root. It performs no engine search or balance games.
