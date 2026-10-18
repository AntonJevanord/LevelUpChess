# Fairy Stockfish

Upstream: https://github.com/fairy-stockfish/Fairy-Stockfish

Fairy Stockfish uses GPLv3; the upstream license is included in `COPYING.txt`. When redistributing an engine binary, comply with the GPL's corresponding-source requirements. Including the license alone does not establish compliance.

## Bundled Windows executable

- Default: `fairy-stockfish-levelup_x86-64.exe`.
- Target: 64-bit Windows, baseline x86-64/SSE2, without NNUE; no separate MinGW runtime DLL is needed.
- Source: unmodified upstream commit `43b66c8abfebfcab893a3a4c349aa790d18df148`, matching the browser's `ffish-es6` 0.7.10 rules.
- Matching source archive: [vendor/ffish-es6-0.7.10-source.tar.gz](../vendor/ffish-es6-0.7.10-source.tar.gz).
- Exact executable/source hashes, compiler, and flags: [engine-build.json](engine-build.json).
- Static runtime notices: [MinGW-w64](licenses/MINGW-w64.txt) and [GCC](licenses/GCC-runtime.txt).

After pulling version 05, restart `npm.cmd start` to use this engine automatically. No download or environment variable is required. The original executable remains in the repository for reference.

## Updating an existing installation

The original Windows engine failed version 05 checks for blue-queen conditional moves and mandatory pawn promotions, and exited during a blue-rook check. Patch `v0.5.1` selects the matching-source engine above and checks each piece family independently.

Stop the server, pull `version_05`, and restart it. Dependencies are unchanged for this patch. If `FAIRY_STOCKFISH_PATH` points to an older executable, it still takes precedence. Remove it in the terminal used to start the server:

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

The bridge verifies relevant legal moves before searching; advertising a variant name alone is insufficient. Errors identify a failed ability or engine exit and preserve the game. The browser's embedded rules work offline regardless of native engine availability. See [variant rules](../variants/README.md).

## Rebuilding the Windows engine

On Linux with GNU Make and MinGW-w64's POSIX-threaded x86-64 compiler installed, run:

```sh
MINGW_CXX=x86_64-w64-mingw32-g++-posix bash scripts/build-windows-engine.sh
```

The script verifies the included source archive, extracts it into a temporary directory, and cross-compiles the unchanged source. It fixes the build date and PE timestamp, strips the executable, and prints its SHA-256. `MINGW_CXX`, `MINGW_STRIP`, `JOBS`, and an optional output-path argument can override tool names, parallelism, and destination. Two clean builds with the recorded toolchain produced identical bytes; other toolchain versions may differ.

## Original executable

- File: `fairy-stockfish-largeboard_x86-64.exe`, retained unchanged.
- SHA-256: `2fe12ff0fcad0295482cab7660e1fcc24259cebc4ef164839fb16c9f9cabfc99`.
- Origin: supplied in the repository before the bridge was implemented.
- Exact upstream release, build flags, and matching source: **not yet established**.

The checksum identifies the original file; it does not authenticate its origin. Earlier versions were playtested with it by the user on Windows. It is no longer the default engine.

## Cloud integration validation

Earlier bridge integration used a Linux source build at upstream commit `9f778da667f6e07dae1e85d3e2ea204fc6dee94d`. Version 05 development uses a Linux build from `43b66c8abfebfcab893a3a4c349aa790d18df148`, the same source revision as the embedded `ffish-es6` 0.7.10 rules. Its source archive and provenance are in [vendor/README.md](../vendor/README.md). Native builds use `make -j2 ARCH=x86-64 build` in the source `src` directory.

Linux-native test builds are development artifacts and are not committed. The bundled Windows executable passed 135 unit tests and 14 native browser/API cases under Wine, including 56 isolated comparisons against browser legal moves for both colors. The original executable reproduced all three reported failures; the replacement passed standard and mixed-army searches plus cancellation through the bridge. Wine tests run on Linux; Windows playtesting remains open in [TODO.md](../TODO.md).

The bridge performs `uci` / `isready` handshakes, loads the selected variant, checks required abilities, and applies bounded search settings. Returned moves are validated with chess.js for standard chess or the embedded rules for upgrades. Each request owns its engine process; pausing, undoing, resetting, or changing play settings cancels obsolete searches.
