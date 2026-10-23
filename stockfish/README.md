# Fairy Stockfish

Upstream: https://github.com/fairy-stockfish/Fairy-Stockfish

Fairy Stockfish uses GPLv3; the upstream license is included in `COPYING.txt`. When redistributing an engine binary, comply with the GPL's corresponding-source requirements. Including the license alone does not establish compliance.

## Bundled Windows executable

- Default: `fairy-stockfish-levelup_x86-64.exe`.
- Target: 64-bit Windows, baseline x86-64/SSE2, without NNUE; no separate MinGW runtime DLL is needed.
- Source: upstream commit `43b66c8abfebfcab893a3a4c349aa790d18df148` plus the included [manual-value consistency patch](patches/manual-piece-value-overrides.patch). The browser keeps the matching unmodified movement rules.
- Matching source archive: [vendor/ffish-es6-0.7.10-source.tar.gz](../vendor/ffish-es6-0.7.10-source.tar.gz).
- Exact executable/source hashes, compiler, and flags: [engine-build.json](engine-build.json).
- Static runtime notices: [MinGW-w64](licenses/MINGW-w64.txt) and [GCC](licenses/GCC-runtime.txt).

After pulling version 16, restart `npm.cmd start` to use this engine automatically. No engine download or environment variable is required. Keep older balance runs on their original branch and executable; the new binary has a new experiment identity.

## Updating an existing installation

Version 16 makes explicit material values apply consistently to evaluation, capture ordering and static exchange evaluation. Automatic profiles retain their existing values. The read-only `levelupvalues` command lets manual-policy preflight verify the actual engine tables before playing games.

Stop the server, pull `version_16`, and restart it. Dependencies are unchanged for this patch. If `FAIRY_STOCKFISH_PATH` points to an older executable, it still takes precedence. Remove it in the terminal used to start the server:

```powershell
Remove-Item Env:FAIRY_STOCKFISH_PATH -ErrorAction SilentlyContinue
npm.cmd start
```

For Command Prompt, use `set FAIRY_STOCKFISH_PATH=` before `npm.cmd start`. Remove any persistent override from Windows environment settings as well if it should stay cleared in future terminals.

Custom paths remain supported, but must select an engine compatible with the selected rules:

```powershell
$env:FAIRY_STOCKFISH_PATH = 'C:\engines\fairy-stockfish.exe'
npm.cmd start
```

The bridge verifies relevant legal moves before searching; advertising a variant name alone is insufficient. Manual-value balance profiles also verify all raw, capture and evaluation values through `levelupvalues`; older engines that only partly honor INI overrides cannot pass that check. Errors identify a failed ability or engine exit and preserve the game. The browser's embedded rules work offline regardless of native engine availability. See [variant rules](../variants/README.md).

## Rebuilding the Windows engine

On Linux with GNU Make and MinGW-w64's POSIX-threaded x86-64 compiler installed, run:

```sh
MINGW_CXX=x86_64-w64-mingw32-g++-posix bash scripts/build-windows-engine.sh
```

The script verifies the base archive and patch hashes, extracts the archive into a temporary directory, applies the patch with zero fuzz, and cross-compiles it. It fixes the build date and PE timestamp, strips the executable, and prints its SHA-256. `MINGW_CXX`, `MINGW_STRIP`, `JOBS`, and an optional output-path argument can override tool names, parallelism, and destination. This patched artifact was built once; repeated-build byte identity has not been checked for this revision. The corresponding source is the unchanged archive plus the included patch.

## Manual material values

The patch changes values only when a profile supplies explicit `pieceValueMg` / `pieceValueEg` entries. It resets the baseline on each variant switch, recomputes automatic custom values, and applies overrides to both colors before initializing evaluation. Normal static exchange evaluation and capture ordering use the same raw values. It does not change movement, search budgets, or the existing fairy-attacker ordering heuristic.

The experiment's **eight-point rook** policy anchors an ordinary rook at five points separately in each engine phase: `round(1276 × 8/5) = 2042` midgame and `1380 × 8/5 = 2208` endgame. These are configured internal values, not measured material strength or eight times the engine's pawn constant. The Amazon reference retains its declared automatic evaluation.

Run the source-only regression check on Linux with a C++17 compiler:

```sh
bash scripts/check-engine-values.sh
```

It checks automatic values, all three manual Blink entries, phase-only and ordinary-piece overrides, both colors, PSQT scores, and manual-to-automatic reloads without games or search. [Patch notes](patches/README.md) document the idle `levelupvalues` protocol.

## Original executable

- File: `fairy-stockfish-largeboard_x86-64.exe`, retained unchanged.
- SHA-256: `2fe12ff0fcad0295482cab7660e1fcc24259cebc4ef164839fb16c9f9cabfc99`.
- Origin: supplied in the repository before the bridge was implemented.
- Exact upstream release, build flags, and matching source: **not yet established**.

The checksum identifies the original file; it does not authenticate its origin. Earlier versions were playtested with it by the user on Windows. It is no longer the default engine.

## Cloud integration validation

Earlier bridge integration used a Linux source build at upstream commit `9f778da667f6e07dae1e85d3e2ea204fc6dee94d`. Earlier development used an unmodified Linux build from `43b66c8abfebfcab893a3a4c349aa790d18df148`, the same source revision as the embedded `ffish-es6` 0.7.10 rules. Version 16 adds the same patch used by the bundled Windows engine to a separate Linux test build. Its source archive and provenance are in [vendor/README.md](../vendor/README.md). Native version-16 builds first apply the included patch, then use `make -j2 ARCH=x86-64 nnue=no build` in the source `src` directory.

Linux-native test builds are development artifacts and are not committed. The earlier unmodified Windows executable passed 135 unit tests and 14 native browser/API cases under Wine, including 56 isolated comparisons against browser legal moves for both colors. The original executable reproduced all three reported failures; the replacement passed standard and mixed-army searches plus cancellation through the bridge. The user also reported that earlier replacement worked on Windows; version-16 Windows runtime testing remains open in [TODO.md](../TODO.md).

The version-16 Linux diagnostic verifies all six raw/capture/evaluation values for both colors across nine profile switches. Static PE inspection confirms the Windows target and runtime imports; Wine is unavailable here, so this patched Windows binary has not been executed in the cloud.

The bridge performs `uci` / `isready` handshakes, loads the selected variant, checks required abilities, and applies bounded search settings. Returned moves are validated with chess.js for standard chess or the embedded rules for upgrades. Each request owns its engine process; pausing, undoing, resetting, or changing play settings cancels obsolete searches.
